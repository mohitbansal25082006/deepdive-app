// supabase/functions/search-gateway/index.ts
// Part 59 — Proxy for the three search/media providers: Tavily, Pexels, GIPHY.
//
// One function instead of three, because they share the same shape (auth ->
// look up key -> forward request -> return upstream JSON) and Supabase caps a
// project at 50 Edge Functions.
//
// The response body is the provider's raw JSON, unmodified. That is deliberate:
// every mapping function in the app (tavilySearch's SearchResult mapper,
// mapPexelsPhoto, the GIPHY grid) keeps working untouched, so the migration
// can't quietly change search results or break the trust scorer.
//
// REQUEST
//   { provider: 'tavily' | 'pexels' | 'giphy', op: string, params: object }
//
// RESPONSE
//   { data: <upstream json> }
//
// Deploy:
//   supabase functions deploy search-gateway

import {
  CORS, getApiKey, invalidateApiKey, requireUser, rateLimit,
  jsonResponse, errorResponse, toErrorResponse, ProviderNotConfiguredError,
} from '../_shared/keyStore.ts';

const TAVILY_SEARCH  = 'https://api.tavily.com/search';
const TAVILY_EXTRACT = 'https://api.tavily.com/extract';
const PEXELS_BASE    = 'https://api.pexels.com/v1';
const GIPHY_BASE     = 'https://api.giphy.com/v1';

// An Expert-mode report legitimately fires ~25 searches; podcasts and debates
// add more on top. Keep this generous.
const RATE_TAVILY = 150;
const RATE_MEDIA  = 200;

const MAX_TAVILY_RESULTS = 20;
const MAX_EXTRACT_URLS   = 20;
const MAX_PEXELS_PER_PAGE = 80;
const MAX_GIPHY_LIMIT     = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

class BadRequest extends Error {
  constructor(msg: string) { super(msg); this.name = 'BadRequest'; }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function str(value: unknown, max = 500): string {
  return String(value ?? '').slice(0, max);
}

/**
 * Fetch with automatic single retry on 401, so rotating a key in the admin
 * dashboard takes effect on the next request instead of after the cache TTL.
 */
async function fetchWithKey(
  provider: string,
  build: (key: string) => Request | Promise<Request>,
): Promise<Response> {
  let key = await getApiKey(provider);
  let res = await fetch(await build(key));

  if (res.status === 401 || res.status === 403) {
    try { await res.text(); } catch { /* ignore */ }
    invalidateApiKey(provider);
    key = await getApiKey(provider, { forceRefresh: true });
    res = await fetch(await build(key));
  }

  return res;
}

async function upstreamError(provider: string, res: Response): Promise<Response> {
  let detail = `HTTP ${res.status}`;
  try {
    const text = await res.text();
    if (text) detail = text.slice(0, 300);
  } catch { /* status only */ }

  if (res.status === 401 || res.status === 403) {
    console.error(`[search-gateway] ${provider} rejected our key:`, detail);
    return errorResponse(
      `The ${provider} service is not configured correctly.`,
      503,
      'provider_auth_failed',
    );
  }
  if (res.status === 429) {
    return errorResponse(
      `The ${provider} service hit its rate limit. Please try again shortly.`,
      429,
      'provider_rate_limited',
    );
  }
  console.warn(`[search-gateway] ${provider} error:`, detail);
  return errorResponse(`${provider} error: ${detail}`, 502, 'provider_error');
}

// ─── Tavily ───────────────────────────────────────────────────────────────────

async function handleTavily(op: string, params: Record<string, unknown>, signal: AbortSignal) {
  if (op === 'search') {
    const query = str(params.query, 1000).trim();
    if (!query) throw new BadRequest('query is required');

    const payload: Record<string, unknown> = {
      query,
      search_depth:        params.searchDepth === 'advanced' ? 'advanced' : 'basic',
      max_results:         clampInt(params.maxResults, 1, MAX_TAVILY_RESULTS, 10),
      include_answer:      params.includeAnswer === true,
      include_raw_content: params.includeRawContent === true,
      include_images:      params.includeImages === true,
      topic:               params.topic === 'news' ? 'news' : 'general',
    };

    if (typeof params.timeRange === 'string' &&
        ['day', 'week', 'month', 'year'].includes(params.timeRange)) {
      payload.time_range = params.timeRange;
    }
    if (Array.isArray(params.includeDomains)) {
      payload.include_domains = params.includeDomains.slice(0, 30).map((d) => str(d, 200));
    }
    if (Array.isArray(params.excludeDomains)) {
      payload.exclude_domains = params.excludeDomains.slice(0, 30).map((d) => str(d, 200));
    }

    const res = await fetchWithKey('tavily', (key) => new Request(TAVILY_SEARCH, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body:    JSON.stringify(payload),
      signal,
    }));

    if (!res.ok) return upstreamError('Tavily', res);
    return jsonResponse({ data: await res.json() });
  }

  if (op === 'extract') {
    const urls = Array.isArray(params.urls)
      ? params.urls.slice(0, MAX_EXTRACT_URLS).map((u) => str(u, 2000)).filter(Boolean)
      : [];
    if (urls.length === 0) throw new BadRequest('urls is required');

    const res = await fetchWithKey('tavily', (key) => new Request(TAVILY_EXTRACT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body:    JSON.stringify({ urls, include_images: params.includeImages === true }),
      signal,
    }));

    if (!res.ok) return upstreamError('Tavily', res);
    return jsonResponse({ data: await res.json() });
  }

  throw new BadRequest(`Unknown tavily op: ${op}`);
}

// ─── Pexels ───────────────────────────────────────────────────────────────────
// Pexels wants the raw key in Authorization, with NO "Bearer " prefix.

async function handlePexels(op: string, params: Record<string, unknown>, signal: AbortSignal) {
  let url: string;

  if (op === 'search') {
    const query = str(params.query, 300).trim();
    if (!query) throw new BadRequest('query is required');

    const qs = new URLSearchParams({
      query,
      page:     String(clampInt(params.page, 1, 100, 1)),
      per_page: String(clampInt(params.perPage, 1, MAX_PEXELS_PER_PAGE, 24)),
    });
    if (params.orientation && ['landscape', 'portrait', 'square'].includes(String(params.orientation))) {
      qs.set('orientation', String(params.orientation));
    }
    if (params.size && ['large', 'medium', 'small'].includes(String(params.size))) {
      qs.set('size', String(params.size));
    }
    if (params.color)  qs.set('color',  str(params.color, 32));
    if (params.locale) qs.set('locale', str(params.locale, 16));

    url = `${PEXELS_BASE}/search?${qs.toString()}`;

  } else if (op === 'curated') {
    const qs = new URLSearchParams({
      page:     String(clampInt(params.page, 1, 100, 1)),
      per_page: String(clampInt(params.perPage, 1, MAX_PEXELS_PER_PAGE, 24)),
    });
    url = `${PEXELS_BASE}/curated?${qs.toString()}`;

  } else if (op === 'photo') {
    const id = clampInt(params.id, 1, Number.MAX_SAFE_INTEGER, 0);
    if (!id) throw new BadRequest('id is required');
    url = `${PEXELS_BASE}/photos/${id}`;

  } else {
    throw new BadRequest(`Unknown pexels op: ${op}`);
  }

  const res = await fetchWithKey('pexels', (key) => new Request(url, {
    method:  'GET',
    headers: { Authorization: key },
    signal,
  }));

  if (!res.ok) return upstreamError('Pexels', res);
  return jsonResponse({ data: await res.json() });
}

// ─── GIPHY ────────────────────────────────────────────────────────────────────
// GIPHY takes the key as a query parameter, which is precisely why it must not
// live in the app: the URL alone is the credential.

async function handleGiphy(op: string, params: Record<string, unknown>, signal: AbortSignal) {
  const kind = params.kind === 'stickers' ? 'stickers' : 'gifs';

  if (op !== 'search' && op !== 'trending') {
    throw new BadRequest(`Unknown giphy op: ${op}`);
  }

  const limit  = clampInt(params.limit,  1, MAX_GIPHY_LIMIT, 24);
  const offset = clampInt(params.offset, 0, 4999, 0);
  const query  = str(params.q, 200).trim();

  if (op === 'search' && !query) {
    throw new BadRequest('q is required for search');
  }

  const res = await fetchWithKey('giphy', (key) => {
    const qs = new URLSearchParams({
      api_key: key,
      limit:   String(limit),
      offset:  String(offset),
      rating:  'g',            // hard-coded: this is a workplace team chat
    });
    if (op === 'search') qs.set('q', query);

    return new Request(`${GIPHY_BASE}/${kind}/${op}?${qs.toString()}`, {
      method: 'GET',
      signal,
    });
  });

  if (!res.ok) return upstreamError('GIPHY', res);
  return jsonResponse({ data: await res.json() });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return errorResponse('Method not allowed', 405);

  try {
    const user = await requireUser(req);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, 'bad_json');
    }

    const provider = str(body.provider, 32);
    const op       = str(body.op, 32);
    const params   = (body.params ?? {}) as Record<string, unknown>;

    switch (provider) {
      case 'tavily':
        rateLimit(user.id, 'tavily', RATE_TAVILY);
        return await handleTavily(op, params, req.signal);

      case 'pexels':
        rateLimit(user.id, 'pexels', RATE_MEDIA);
        return await handlePexels(op, params, req.signal);

      case 'giphy':
        rateLimit(user.id, 'giphy', RATE_MEDIA);
        return await handleGiphy(op, params, req.signal);

      default:
        return errorResponse(`Unknown provider: ${provider || '(missing)'}`, 400, 'unknown_provider');
    }

  } catch (err) {
    if (err instanceof BadRequest) {
      return errorResponse(err.message, 400, 'bad_request');
    }
    if (err instanceof ProviderNotConfiguredError) {
      // The app treats this as "degrade gracefully" — Tavily falls back to mock
      // results, Pexels shows an empty picker with an explanation.
      return errorResponse(err.message, 503, 'provider_not_configured');
    }
    if ((err as { name?: string })?.name === 'AbortError') {
      return new Response(null, { status: 499, headers: CORS });
    }
    return toErrorResponse(err);
  }
});