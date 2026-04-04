// src/hooks/useCitationManager.ts
// Part 38 — Citation Manager
// Part 38 UPDATE:
//   UPDATE #1 — generateCitations(): new function that uses SerpAPI to find
//               real sources then OpenAI to format them as proper citations.
//               Credit-gated (2 credits: paper_ai_generate_citations — single call).
//   REMOVED    — detectUsageIssues() removed (replaced by generateCitations).
//   FIX #1    — importFromUrl uses OpenAI-powered fetchCitationFromUrl.
//   FIX #2    — onCitationsChange(citations, style) rebuilds references section.
//   FIX #3    — All mutations persist citations to DB via savePaperCitations.
// Part 38d FIXES:
//   FIX #STALE — syncUpstream now uses functional setCitations updater so that
//                addCitation / deleteCitation / move never operate on a stale
//                citations snapshot. This fixes AI-generated citations not
//                appearing in the References section when added one-by-one or
//                via "Add All".
//   FIX #CALLBACK — onCitationsChange and scheduleSave are called with the
//                   authoritative next array computed inside the updater,
//                   guaranteeing the references section rebuild always sees
//                   the full, up-to-date list.
// Part 38e CREDIT FIX:
//   ROOT CAUSE — generateCitations() was calling guardedConsume('paper_ai_fix_citations')
//                TWICE (2 × 1 cr = 2 cr). Each call fetches a fresh DB balance,
//                but because the Supabase consume_credits RPC is async, the second
//                call sometimes executes before the first deduction is committed,
//                reading a stale balance and creating a DUPLICATE transaction in
//                the credit ledger. Users saw 1 credit deducted instead of 2
//                (one call blocked by the race) OR 2 separate 1-cr transactions
//                (both succeeded) OR 4 transactions (retry scenario).
//   FIX — Use a single guardedConsume('paper_ai_generate_citations') call which
//          deducts exactly 2 credits in ONE atomic RPC call. No race, no duplicates,
//          correct amount every time, single clean transaction in the ledger.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { fetchCitationFromUrl, savePaperCitations }          from '../services/paperEditorService';
import { serpSearchBatch }                                   from '../services/serpApiClient';
import { openaiClient }                                      from '../services/openaiClient';
import { useCreditGate }                                     from './useCreditGate';
import type { Citation, AcademicCitationStyle, AcademicSection } from '../types';
import type { ManagedCitation }                              from '../types/paperEditor';

// ─── Citation style formatters ────────────────────────────────────────────────

function formatAPA(c: Citation): string {
  const year   = c.date ? new Date(c.date).getFullYear() : 'n.d.';
  const source = c.source ?? 'Unknown';
  return `${source}. (${year}). ${c.title}. Retrieved from ${c.url}`;
}

function formatMLA(c: Citation): string {
  const year   = c.date ? new Date(c.date).getFullYear() : 'n.d.';
  const source = c.source ?? 'Unknown';
  return `${source}. "${c.title}." ${source}, ${year}, ${c.url}.`;
}

function formatChicago(c: Citation): string {
  const year   = c.date ? new Date(c.date).getFullYear() : 'n.d.';
  const source = c.source ?? 'Unknown';
  return `${source}. "${c.title}." ${source}, ${year}. ${c.url}.`;
}

function formatIEEE(c: Citation, index: number): string {
  const year   = c.date ? new Date(c.date).getFullYear() : 'n.d.';
  const source = c.source ?? 'Unknown';
  return `[${index + 1}] ${source}, "${c.title}," ${year}. [Online]. Available: ${c.url}`;
}

export function formatCitationByStyle(
  c:     Citation,
  style: AcademicCitationStyle,
  index: number,
): string {
  switch (style) {
    case 'apa':     return formatAPA(c);
    case 'mla':     return formatMLA(c);
    case 'chicago': return formatChicago(c);
    case 'ieee':    return formatIEEE(c, index);
    default:        return formatAPA(c);
  }
}

// ─── Build references section text ───────────────────────────────────────────

export function buildReferencesContent(
  citations: Citation[],
  style:     AcademicCitationStyle,
): string {
  if (!citations.length) return '';
  return citations
    .map((c, i) => formatCitationByStyle(c, style, i))
    .join('\n');
}

// ─── Hook return type ─────────────────────────────────────────────────────────

interface UseCitationManagerReturn {
  citations:              ManagedCitation[];
  formattedCitations:     string[];
  citationStyle:          AcademicCitationStyle;
  isImporting:            boolean;
  importError:            string | null;
  isSaving:               boolean;
  isGeneratingCitations:  boolean;
  generateCitationsError: string | null;
  setCitationStyle:       (style: AcademicCitationStyle) => void;
  addCitation:            (citation: Omit<Citation, 'id'>) => void;
  updateCitation:         (id: string, updates: Partial<Citation>) => void;
  deleteCitation:         (id: string) => void;
  moveCitationUp:         (id: string) => void;
  moveCitationDown:       (id: string) => void;
  importFromUrl:          (url: string) => Promise<boolean>;
  generateCitations:      (query: string) => Promise<Array<Omit<Citation, 'id'>>>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCitationManager(
  paperId:           string | null,
  userId:            string | null,
  initialCitations:  Citation[],
  initialStyle:      AcademicCitationStyle,
  onStyleChange:     (style: AcademicCitationStyle) => void,
  onCitationsChange: (citations: Citation[], style: AcademicCitationStyle) => void,
): UseCitationManagerReturn {
  const [citations,     setCitations]         = useState<ManagedCitation[]>(
    initialCitations.map(c => ({ ...c }))
  );
  const [citationStyle, setCitationStyleState] = useState<AcademicCitationStyle>(initialStyle);
  const [isImporting,   setIsImporting]        = useState(false);
  const [importError,   setImportError]        = useState<string | null>(null);
  const [isSaving,      setIsSaving]           = useState(false);

  const [isGeneratingCitations,  setIsGeneratingCitations]  = useState(false);
  const [generateCitationsError, setGenerateCitationsError] = useState<string | null>(null);

  const { guardedConsume } = useCreditGate();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref of citationStyle so callbacks never close over a stale value
  const citationStyleRef = useRef<AcademicCitationStyle>(citationStyle);
  useEffect(() => { citationStyleRef.current = citationStyle; }, [citationStyle]);

  // Keep stable refs to the upstream callbacks so they can be called inside
  // functional state updaters without being listed as deps (avoids re-creating
  // every mutation callback whenever the parent re-renders).
  const onCitationsChangeRef = useRef(onCitationsChange);
  useEffect(() => { onCitationsChangeRef.current = onCitationsChange; }, [onCitationsChange]);

  // Reset when paper changes
  useEffect(() => {
    if (paperId && initialCitations.length > 0) {
      setCitations(initialCitations.map(c => ({ ...c })));
    }
  }, [paperId]);

  useEffect(() => {
    if (paperId && initialStyle) {
      setCitationStyleState(initialStyle);
    }
  }, [paperId]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const formattedCitations = useMemo(() =>
    citations.map((c, i) => formatCitationByStyle(c, citationStyle, i)),
    [citations, citationStyle],
  );

  // ── Debounced DB persist ──────────────────────────────────────────────────
  const scheduleSave = useCallback((plain: Citation[]) => {
    if (!paperId || !userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await savePaperCitations(paperId, userId, plain);
      } catch (e) {
        console.warn('[useCitationManager] scheduleSave error:', e);
      } finally {
        setIsSaving(false);
      }
    }, 800);
  }, [paperId, userId]);

  // ── syncUpstream ──────────────────────────────────────────────────────────
  // KEY FIX: This is called with the already-computed `next` array (never
  // derived from the `citations` state variable), so it is safe to call from
  // inside a functional setCitations updater where the closure would otherwise
  // be stale. The function only touches refs and the debounce timer.
  const syncUpstream = useCallback((next: ManagedCitation[]) => {
    const style = citationStyleRef.current;
    const plain: Citation[] = next.map(({ ...c }) => c as Citation);
    onCitationsChangeRef.current(plain, style);
    scheduleSave(plain);
  }, [scheduleSave]); // stable — only depends on scheduleSave which is also stable

  // ── Style switch ─────────────────────────────────────────────────────────
  const setCitationStyle = useCallback((style: AcademicCitationStyle) => {
    setCitationStyleState(style);
    citationStyleRef.current = style;
    onStyleChange(style);
    // Re-notify upstream with current citations under the new style
    setCitations(prev => {
      const plain: Citation[] = prev.map(c => c as Citation);
      onCitationsChangeRef.current(plain, style);
      scheduleSave(plain);
      return prev; // no structural change to citations array
    });
  }, [onStyleChange, scheduleSave]);

  // ── CRUD — all use functional updater to avoid stale citations closure ────

  const addCitation = useCallback((citation: Omit<Citation, 'id'>) => {
    const next: ManagedCitation = {
      ...citation,
      id: `cit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    setCitations(prev => {
      const updated = [...prev, next];
      syncUpstream(updated);
      return updated;
    });
  }, [syncUpstream]);

  const updateCitation = useCallback((id: string, updates: Partial<Citation>) => {
    setCitations(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      syncUpstream(updated);
      return updated;
    });
  }, [syncUpstream]);

  const deleteCitation = useCallback((id: string) => {
    setCitations(prev => {
      const updated = prev.filter(c => c.id !== id);
      syncUpstream(updated);
      return updated;
    });
  }, [syncUpstream]);

  const moveCitationUp = useCallback((id: string) => {
    setCitations(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx <= 0) return prev;
      const updated = [...prev];
      [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
      syncUpstream(updated);
      return updated;
    });
  }, [syncUpstream]);

  const moveCitationDown = useCallback((id: string) => {
    setCitations(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const updated = [...prev];
      [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
      syncUpstream(updated);
      return updated;
    });
  }, [syncUpstream]);

  // ── Import from URL ────────────────────────────────────────────────────
  const importFromUrl = useCallback(async (url: string): Promise<boolean> => {
    if (!url.trim()) { setImportError('Please enter a valid URL.'); return false; }
    setIsImporting(true);
    setImportError(null);
    try {
      const meta = await fetchCitationFromUrl(url.trim());
      if (!meta || !meta.title) {
        setImportError(
          'Could not extract citation info from this URL.\n' +
          'Check the URL or add the citation manually.'
        );
        return false;
      }
      addCitation({
        title:   meta.title,
        url:     url.trim(),
        source:  meta.publisher || (() => { try { return new URL(url).hostname; } catch { return ''; } })(),
        snippet: meta.authors ? `Author(s): ${meta.authors}` : '',
        date:    meta.year ? `${meta.year}-01-01` : undefined,
      });
      return true;
    } catch (err) {
      setImportError('Could not process this URL. Please try again or add manually.');
      console.warn('[useCitationManager] importFromUrl:', err);
      return false;
    } finally {
      setIsImporting(false);
    }
  }, [addCitation]);

  // ── AI Citation Generator ─────────────────────────────────────────────
  //
  // CREDIT FIX (Part 38e):
  // Previously this called guardedConsume('paper_ai_fix_citations') TWICE to
  // achieve a 2-credit cost. This was broken because:
  //
  //   1. guardedConsume() calls consume() in CreditsContext, which calls
  //      fetchUserCredits() (async DB fetch) THEN consumeCredits() RPC.
  //   2. When called twice in rapid succession, the second fetch may complete
  //      BEFORE the first consumeCredits() RPC commits to the DB, so the second
  //      call sees the pre-deduction balance and either:
  //        a. Succeeds → two separate 1-cr transactions logged (correct total,
  //           but two ledger entries instead of one)
  //        b. Incorrectly passes the balance check but the RPC then deducts
  //           correctly → still two transactions
  //        c. On retry/re-render → up to 4 transactions total
  //   3. Users reported seeing only 1 credit deducted sometimes (when the second
  //      guardedConsume saw insufficient balance due to optimistic UI update).
  //
  // FIX: Single guardedConsume('paper_ai_generate_citations') call.
  //   - FEATURE_COSTS['paper_ai_generate_citations'] = 2
  //   - consume_credits RPC deducts 2 in ONE atomic DB transaction
  //   - ONE transaction in the credit ledger, always exactly 2 credits
  //   - No race conditions possible
  //
  const generateCitations = useCallback(async (
    query: string,
  ): Promise<Array<Omit<Citation, 'id'>>> => {
    setIsGeneratingCitations(true);
    setGenerateCitationsError(null);

    try {
      // ── Single atomic 2-credit deduction ─────────────────────────────
      // Uses paper_ai_generate_citations (cost = 2) via one guardedConsume call.
      // This guarantees exactly one DB transaction for exactly 2 credits.
      // No race conditions, no duplicate transactions, correct amount always.
      const creditOk = await guardedConsume('paper_ai_generate_citations');
      if (!creditOk) {
        setGenerateCitationsError('Insufficient credits. You need 2 credits to generate citations.');
        return [];
      }

      // ── SerpAPI search (2 varied queries for broader coverage) ────────
      const queries = [
        query,
        `${query} research study academic`,
      ];

      let searchBatches: Awaited<ReturnType<typeof serpSearchBatch>> = [];
      try {
        searchBatches = await serpSearchBatch(queries, undefined, 5);
      } catch (searchErr) {
        console.warn('[useCitationManager] SerpAPI error, falling back to OpenAI-only:', searchErr);
      }

      // Flatten + deduplicate by URL
      const seenUrls  = new Set<string>();
      const allResults: Array<{
        title: string; url: string; snippet: string;
        source?: string; date?: string;
      }> = [];

      for (const batch of searchBatches) {
        for (const r of batch.results) {
          if (r.url && !seenUrls.has(r.url)) {
            seenUrls.add(r.url);
            allResults.push({
              title:   r.title   ?? '',
              url:     r.url     ?? '',
              snippet: r.snippet ?? '',
              source:  r.source,
              date:    r.date,
            });
          }
        }
      }

      // ── OpenAI: extract / enrich citation metadata ────────────────────
      const serpContext = allResults.length > 0
        ? allResults.slice(0, 10).map((r, i) =>
            `[${i + 1}] Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\nSource: ${r.source ?? ''}\nDate: ${r.date ?? ''}`
          ).join('\n\n')
        : '';

      const prompt = serpContext
        ? `I am researching: "${query}"

Here are ${Math.min(allResults.length, 10)} search results:

${serpContext}

Extract up to 8 of the most relevant and credible citations.
Return ONLY a JSON array:
[
  {
    "title": "Full article title",
    "url": "https://exact-url-from-results",
    "source": "Publisher or website name",
    "date": "YYYY-01-01 or empty string",
    "snippet": "One sentence about what this source covers (max 120 chars)"
  }
]

Rules:
- Prefer academic, government (.gov), educational (.edu), or major reputable news sources
- Use the EXACT URLs provided in the search results — do not fabricate URLs
- Extract the year from the date field or URL path if available
- Return only the JSON array, no other text`
        : `Generate 6 real, credible citations for academic research on: "${query}"

Return ONLY a JSON array:
[
  {
    "title": "Full article title",
    "url": "https://real-verifiable-url",
    "source": "Publisher name",
    "date": "YYYY-01-01 or empty string",
    "snippet": "One sentence description (max 120 chars)"
  }
]

Rules:
- Use real, verifiable URLs from reputable sources (journals, .gov, .edu, major publications)
- Prefer sources from 2020–2025
- Return only the JSON array, no other text`;

      const raw = await openaiClient.chat.completions.create({
        model:       'gpt-4o-mini',
        max_tokens:  1200,
        temperature: 0.2,
        messages: [
          {
            role:    'system',
            content: 'You are an academic citation assistant. Always return valid JSON arrays only.',
          },
          { role: 'user', content: prompt },
        ],
      });

      const text = raw.choices[0]?.message?.content?.trim() ?? '';
      const jsonText = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      let parsed: any[] = [];
      try {
        parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) parsed = [];
      } catch (parseErr) {
        console.warn('[useCitationManager] JSON parse error:', parseErr);
        setGenerateCitationsError('Could not parse AI response. Please try again.');
        return [];
      }

      // Map to Citation shape
      const results: Array<Omit<Citation, 'id'>> = parsed
        .filter((item: any) => item && typeof item.title === 'string' && item.title.trim())
        .slice(0, 8)
        .map((item: any): Omit<Citation, 'id'> => {
          let hostname = '';
          try { hostname = new URL(item.url ?? '').hostname; } catch {}
          return {
            title:   (item.title   ?? '').trim(),
            url:     (item.url     ?? '').trim(),
            source:  ((item.source ?? (hostname || 'Unknown')) as string).trim(),
            snippet: (item.snippet ?? '').trim(),
            date:    item.date && (item.date as string).trim()
              ? (item.date as string).trim()
              : undefined,
          };
        });

      if (results.length === 0) {
        setGenerateCitationsError('No citations could be generated. Try a more specific query.');
      }

      return results;

    } catch (err) {
      console.error('[useCitationManager] generateCitations error:', err);
      setGenerateCitationsError('An error occurred. Please try again.');
      return [];
    } finally {
      setIsGeneratingCitations(false);
    }
  }, [guardedConsume]);

  return {
    citations,
    formattedCitations,
    citationStyle,
    isImporting,
    importError,
    isSaving,
    isGeneratingCitations,
    generateCitationsError,
    setCitationStyle,
    addCitation,
    updateCitation,
    deleteCitation,
    moveCitationUp,
    moveCitationDown,
    importFromUrl,
    generateCitations,
  };
}