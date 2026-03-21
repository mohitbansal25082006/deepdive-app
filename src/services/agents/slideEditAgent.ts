// src/services/agents/slideEditAgent.ts
// Part 28 — AI editing agent: FULL REWRITE
// ─────────────────────────────────────────────────────────────────────────────
//
// CHANGES:
//   1. All prompts are STRICT — model is forbidden from adding essays, lists,
//      or explanations. Every operation returns ONLY the exact output requested.
//   2. rewriteText now knows what KIND of field it's editing (title vs body vs
//      bullet) and adjusts output length constraints accordingly.
//   3. rewriteBullets() — rewrites an ENTIRE bullets array in one shot,
//      preserving count, applying style to each item.
//   4. rewriteSingleBullet() — rewrites ONE bullet point item.
//   5. generateSlide() prompts are tightened — model MUST return exactly the
//      fields needed for the chosen layout; no filler body text on bullet slides.
//   6. generateSpeakerNotes() — strict 2-sentence cap unless slide is complex.
//   7. suggestLayout() — unchanged but with tighter JSON contract.
// ─────────────────────────────────────────────────────────────────────────────

import { chatCompletion, chatCompletionJSON } from '../openaiClient';
import type {
  PresentationSlide,
  SlideLayout,
  ResearchReport,
} from '../../types';
import type {
  AIRewriteStyle,
  AILayoutSuggestion,
  AIGenerateSlideRequest,
} from '../../types/editor';

// ─── Report context builder ───────────────────────────────────────────────────

function buildReportContext(report: ResearchReport | null): string {
  if (!report) return '';
  const findings = report.keyFindings.slice(0, 3).map((f, i) => `${i + 1}. ${f}`).join('\n');
  const stats    = report.statistics.slice(0, 3).map(s => `${s.value}: ${s.context}`).join('\n');
  return `REPORT: "${report.title}"\nQUERY: "${report.query}"\nKEY FINDINGS:\n${findings}\nKEY STATS:\n${stats}`.trim();
}

// ─── Field type classifier ────────────────────────────────────────────────────

type FieldKind = 'title' | 'short_label' | 'body' | 'bullet';

function classifyField(fieldKey: string): FieldKind {
  if (['title', 'subtitle', 'sectionTag', 'badgeText', 'quoteAttribution'].includes(fieldKey)) {
    return fieldKey === 'title' ? 'title' : 'short_label';
  }
  if (fieldKey === 'body' || fieldKey === 'speakerNotes') return 'body';
  if (fieldKey === 'quote') return 'body';
  return 'title';
}

// ─── Length constraints per field kind and style ──────────────────────────────

const LENGTH_RULES: Record<FieldKind, Record<AIRewriteStyle, string>> = {
  title: {
    shorter:  'Max 8 words. A punchy slide title only.',
    formal:   'Max 10 words. A formal slide title only.',
    simpler:  'Max 8 words. A plain, clear slide title only.',
    punchier: 'Max 7 words. A high-impact slide title only.',
  },
  short_label: {
    shorter:  'Max 5 words.',
    formal:   'Max 6 words.',
    simpler:  'Max 5 words.',
    punchier: 'Max 4 words.',
  },
  body: {
    shorter:  '1-2 concise sentences. No bullet points.',
    formal:   '2-3 formal sentences. No bullet points.',
    simpler:  '1-2 plain sentences a non-expert can understand.',
    punchier: '1-2 punchy sentences. Active voice, strong verbs.',
  },
  bullet: {
    shorter:  'One short phrase, max 6 words. No sentence ending punctuation.',
    formal:   'One formal phrase, max 8 words.',
    simpler:  'One plain phrase, max 7 words.',
    punchier: 'One punchy phrase, max 6 words. Strong verb.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. REWRITE A SINGLE TEXT FIELD
// ─────────────────────────────────────────────────────────────────────────────

const REWRITE_BASE_SYSTEM = (fieldKind: FieldKind, style: AIRewriteStyle, rule: string) =>
  `You are a slide editor. Your ONLY job is to rewrite the given text in the "${style}" style.
FIELD TYPE: ${fieldKind}
LENGTH RULE: ${rule}
CRITICAL RULES:
- Return ONLY the rewritten text. No quotes around it. No preamble. No explanation. No label. No markdown.
- Do NOT write an essay. Do NOT add bullet points unless the field type is "bullet".
- Do NOT add any content that was not in the original text.
- If the input is a title, return a title. If it is a body paragraph, return a paragraph.
- Preserve the language (English → English, etc.).`;

export async function rewriteText(
  text:      string,
  style:     AIRewriteStyle,
  report?:   ResearchReport | null,
  fieldKey?: string,
): Promise<string> {
  if (!text?.trim()) throw new Error('No text to rewrite.');

  const kind    = classifyField(fieldKey ?? 'title');
  const rule    = LENGTH_RULES[kind][style];
  const context = report
    ? `\n\nBackground context (use ONLY if directly relevant):\n${buildReportContext(report)}`
    : '';

  const styleVerb = {
    shorter:  'shorter and more concise',
    formal:   'more formal and professional',
    simpler:  'simpler and clearer',
    punchier: 'punchier and more impactful',
  }[style];

  const userMsg = `Rewrite this text to be ${styleVerb}:\n\n${text}${context}`;

  const result = await chatCompletion(
    [
      { role: 'system', content: REWRITE_BASE_SYSTEM(kind, style, rule) },
      { role: 'user',   content: userMsg },
    ],
    { temperature: 0.55, maxTokens: kind === 'body' ? 200 : 80 },
  );

  return result
    .replace(/^["'`""]|["'`""]$/g, '')
    .replace(/^(Result:|Rewritten:|Here( is|'s)( the| a| your)?)[\s:]*/i, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. REWRITE AN ENTIRE BULLETS ARRAY
// ─────────────────────────────────────────────────────────────────────────────

const REWRITE_BULLETS_SYSTEM = (style: AIRewriteStyle, count: number) =>
  `You are a slide editor. Rewrite EACH of the ${count} bullet points in the "${style}" style.
STRICT OUTPUT RULES:
- Return ONLY a raw JSON array of strings. Example: ["point 1", "point 2", "point 3"]
- The array MUST contain exactly ${count} strings, one per input bullet.
- Each string: max 8 words, plain text, no markdown, no numbering, no dashes.
- Do NOT wrap in an object. Do NOT add any key. Do NOT add code fences or backticks.
- Do NOT include any text before or after the array.
- If you cannot rewrite a bullet, copy it verbatim as-is.`;

/** Parse the model's raw text into a string array, handling all common model output shapes */
function parseBulletsResponse(raw: string, expected: number, fallback: string[]): string[] {
  let text = raw.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  // If model wrapped in object e.g. {"bullets":["a","b"]} or {"items":["a","b"]}
  // Try to extract the first array value from the object
  const objMatch = text.match(/\{[^}]*"[^"]+"\s*:\s*(\[[\s\S]*\])/);
  if (objMatch) text = objMatch[1].trim();

  // Now try to parse as JSON array
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const strings = parsed.map(s =>
        typeof s === 'string' ? s.trim() : String(s).trim(),
      ).filter(s => s.length > 0);
      // Pad with originals if too short; trim if too long
      while (strings.length < expected) strings.push(fallback[strings.length] ?? '');
      return strings.slice(0, expected);
    }
    // If it parsed to an object, try to find the first array property
    if (typeof parsed === 'object' && parsed !== null) {
      const firstArray = Object.values(parsed).find(v => Array.isArray(v)) as string[] | undefined;
      if (firstArray) {
        const strings = firstArray.map(s =>
          typeof s === 'string' ? s.trim() : String(s).trim(),
        ).filter(s => s.length > 0);
        while (strings.length < expected) strings.push(fallback[strings.length] ?? '');
        return strings.slice(0, expected);
      }
    }
  } catch {
    // JSON.parse failed — fall through to line-by-line extraction
  }

  // Last resort: extract quoted strings or numbered/dashed lines
  const lineMatches = text.match(/"([^"]+)"/g);
  if (lineMatches && lineMatches.length > 0) {
    const strings = lineMatches
      .map(m => m.replace(/^"|"$/g, '').trim())
      .filter(s => s.length > 0);
    while (strings.length < expected) strings.push(fallback[strings.length] ?? '');
    return strings.slice(0, expected);
  }

  // Absolute fallback: split by newlines, strip numbering/dashes
  const lines = text
    .split(/\n/)
    .map(l => l.replace(/^[\d.\-•*\s]+/, '').replace(/^["'`]|["'`]$/g, '').trim())
    .filter(l => l.length > 2);

  if (lines.length > 0) {
    while (lines.length < expected) lines.push(fallback[lines.length] ?? '');
    return lines.slice(0, expected);
  }

  // Nothing worked — return originals unchanged
  return fallback;
}

export async function rewriteBullets(
  bullets:  string[],
  style:    AIRewriteStyle,
  report?:  ResearchReport | null,
): Promise<string[]> {
  if (!bullets.length) throw new Error('No bullets to rewrite.');

  const numbered = bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
  const context  = report ? `\n\nContext: ${buildReportContext(report)}` : '';

  // Use chatCompletion (plain text) instead of chatCompletionJSON — gives us
  // full control over parsing and handles all model output variations robustly.
  const raw = await chatCompletion(
    [
      { role: 'system', content: REWRITE_BULLETS_SYSTEM(style, bullets.length) },
      { role: 'user',   content: `Rewrite these ${bullets.length} bullets:\n${numbered}${context}` },
    ],
    { temperature: 0.5, maxTokens: bullets.length * 25 + 80 },
  );

  return parseBulletsResponse(raw, bullets.length, bullets);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. REWRITE A SINGLE BULLET POINT
// ─────────────────────────────────────────────────────────────────────────────

const SINGLE_BULLET_SYSTEM = (style: AIRewriteStyle) =>
  `You are a slide editor. Rewrite the given bullet point to be ${style === 'shorter' ? 'shorter (max 5 words)' : style === 'formal' ? 'more formal (max 8 words)' : style === 'simpler' ? 'simpler and plainer (max 7 words)' : 'punchier with a strong verb (max 6 words)'}.
Return ONLY the rewritten bullet text — no numbering, no dash, no quotes, no explanation.`;

export async function rewriteSingleBullet(
  bullet: string,
  style:  AIRewriteStyle,
): Promise<string> {
  if (!bullet?.trim()) throw new Error('Bullet is empty.');

  const result = await chatCompletion(
    [
      { role: 'system', content: SINGLE_BULLET_SYSTEM(style) },
      { role: 'user',   content: `Bullet: ${bullet}` },
    ],
    { temperature: 0.5, maxTokens: 40 },
  );

  return result
    .replace(/^[-•*\d.)\s]+/, '')
    .replace(/^["'`""]|["'`""]$/g, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GENERATE A NEW SLIDE
// ─────────────────────────────────────────────────────────────────────────────

const GENERATE_SLIDE_SYSTEM = `You are an expert presentation designer. Generate exactly ONE polished presentation slide.

LAYOUT RULES — pick ONE layout based on the content type:
- "title"      → intro slide: title (max 12 words) + subtitle (max 15 words) + optional badgeText
- "section"    → section break: title (max 8 words) + sectionTag (max 4 words, uppercase)
- "content"    → text slide: title + body paragraph (2-3 sentences, NEVER a list)
- "bullets"    → key points: title + bullets array (3-5 items, each max 8 words, NEVER body text)
- "stats"      → data slide: title + stats array (2-4 items with value/label/color)
- "quote"      → pull quote: quote text + quoteAttribution + title
- "predictions"→ outlook: title + bullets array (3-4 future-tense predictions)
- "closing"    → final slide: title + subtitle (call to action)
- "agenda"     → agenda: title + bullets (3-6 agenda items)

STRICT OUTPUT RULES:
- Return ONLY valid JSON. No markdown. No code fences. No explanation.
- For "bullets" or "predictions" layouts: body MUST be null. bullets MUST have 3-5 items.
- For "content" layout: bullets MUST be empty []. body MUST be a paragraph (NOT a list).
- For "stats" layout: stats MUST have 2-4 items. body and bullets MUST be null/[].
- Do NOT write essays. Do NOT write long paragraphs. Keep titles short and punchy.
- speakerNotes: 1-2 natural spoken sentences ONLY.

ALLOWED ACCENT/STAT COLORS: "#6C63FF","#43E97B","#FFA726","#FF6584","#29B6F6","#FF4757","#AB47BC"

JSON schema (return exactly this shape, no extra keys):
{
  "layout": "string",
  "title": "string",
  "subtitle": "string|null",
  "body": "string|null",
  "bullets": ["string"],
  "stats": [{"value":"string","label":"string","color":"string"}],
  "quote": "string|null",
  "quoteAttribution": "string|null",
  "sectionTag": "string|null",
  "badgeText": "string|null",
  "accentColor": "string",
  "icon": "ionicons-name-string",
  "speakerNotes": "string|null"
}`;

export async function generateSlide(
  request:    AIGenerateSlideRequest,
  report?:    ResearchReport | null,
  slideCount?: number,
): Promise<Omit<PresentationSlide, 'slideNumber'>> {
  const context = report
    ? `\n\nResearch context to ground your content:\n${buildReportContext(report)}`
    : '';
  const pos   = request.insertAfterIdx + 1;
  const total = slideCount ?? '?';

  const userMsg =
`Create a slide for: "${request.description}"
Position in deck: slide ${pos} of ${total}.${context}

Choose the best layout for this content. Follow all layout rules strictly.`;

  const raw = await chatCompletionJSON<Partial<PresentationSlide> & { layout: SlideLayout }>(
    [
      { role: 'system', content: GENERATE_SLIDE_SYSTEM },
      { role: 'user',   content: userMsg },
    ],
    { temperature: 0.45, maxTokens: 700 },
  );

  const VALID_LAYOUTS: SlideLayout[] = [
    'title','agenda','section','content','bullets','stats',
    'quote','chart_ref','predictions','references','closing',
  ];

  const layout: SlideLayout = VALID_LAYOUTS.includes(raw.layout as SlideLayout)
    ? (raw.layout as SlideLayout)
    : 'content';

  // Normalise bullets — strip any accidental numbering
  const bullets: string[] = Array.isArray(raw.bullets)
    ? raw.bullets
        .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
        .map(b => b.replace(/^[\d.)\-\s•*]+/, '').trim())
    : [];

  const stats = Array.isArray(raw.stats)
    ? raw.stats.filter(s => s && typeof s.value === 'string' && typeof s.label === 'string')
    : [];

  // Enforce layout contract — ensure correct fields are populated
  const isBulletLayout = ['bullets', 'agenda', 'predictions', 'references'].includes(layout);
  const isStatsLayout  = layout === 'stats';
  const isBodyLayout   = ['content', 'chart_ref'].includes(layout);

  return {
    id:               `slide_gen_${Date.now()}`,
    layout,
    title:            typeof raw.title === 'string' && raw.title.trim()
                        ? raw.title.trim().slice(0, 120)
                        : 'New Slide',
    subtitle:         typeof raw.subtitle === 'string' ? raw.subtitle.trim() || undefined : undefined,
    // Enforce: body only for content/chart_ref layouts
    body:             isBodyLayout && typeof raw.body === 'string' ? raw.body.trim() || undefined : undefined,
    // Enforce: bullets only for bullet-type layouts
    bullets:          isBulletLayout && bullets.length > 0 ? bullets : undefined,
    stats:            isStatsLayout  && stats.length  > 0 ? stats  : undefined,
    quote:            layout === 'quote'   && typeof raw.quote === 'string' ? raw.quote.trim() || undefined : undefined,
    quoteAttribution: layout === 'quote'   && typeof raw.quoteAttribution === 'string' ? raw.quoteAttribution.trim() || undefined : undefined,
    sectionTag:       layout === 'section' && typeof raw.sectionTag === 'string' ? raw.sectionTag.trim() || undefined : undefined,
    badgeText:        layout === 'title'   && typeof raw.badgeText === 'string' ? raw.badgeText.trim() || undefined : undefined,
    accentColor:      typeof raw.accentColor === 'string' && raw.accentColor.startsWith('#')
                        ? raw.accentColor
                        : '#6C63FF',
    icon:             typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : 'document-text-outline',
    speakerNotes:     typeof raw.speakerNotes === 'string' ? raw.speakerNotes.trim() || undefined : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. GENERATE SPEAKER NOTES
// ─────────────────────────────────────────────────────────────────────────────

const NOTES_SYSTEM = `You are a professional presentation coach. Write exactly 2 short, natural speaker notes sentences for the given slide.
RULES:
- First person ("Here I want to highlight…", "This slide shows…").
- Expand on the slide — do NOT just repeat the title.
- End the second sentence with a smooth transition hint if relevant.
- Return ONLY the 2 sentences as plain text. No markdown. No labels. No quotes.`;

export async function generateSpeakerNotes(
  slide:   PresentationSlide,
  report?: ResearchReport | null,
): Promise<string> {
  const parts: string[] = [`Layout: ${slide.layout}`, `Title: "${slide.title}"`];
  if (slide.subtitle)          parts.push(`Subtitle: "${slide.subtitle}"`);
  if (slide.body)              parts.push(`Body: "${slide.body.slice(0, 250)}"`);
  if (slide.bullets?.length)   parts.push(`Bullets:\n${slide.bullets.slice(0, 4).map(b => `- ${b}`).join('\n')}`);
  if (slide.quote)             parts.push(`Quote: "${slide.quote}"`);
  if (slide.stats?.length)     parts.push(`Stats: ${slide.stats.slice(0, 3).map(s => `${s.value} (${s.label})`).join(', ')}`);

  const context = report ? `\n\nReport context:\n${buildReportContext(report)}` : '';
  const userMsg = `Slide content:\n${parts.join('\n')}${context}\n\nWrite 2 speaker note sentences.`;

  const result = await chatCompletion(
    [
      { role: 'system', content: NOTES_SYSTEM },
      { role: 'user',   content: userMsg },
    ],
    { temperature: 0.5, maxTokens: 160 },
  );

  return result
    .replace(/^["'`""]|["'`""]$/g, '')
    .replace(/^(Notes:|Speaker Notes:|Here are)[\s:]*/i, '')
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SUGGEST LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_SYSTEM = `You are a slide design expert. Analyze the slide and suggest the single best layout.
Respond ONLY with valid JSON (no markdown, no fences):
{"suggestedLayout":"one_of_the_allowed_values","reason":"One sentence max 20 words"}
ALLOWED: title|agenda|section|content|bullets|stats|quote|chart_ref|predictions|references|closing
If current layout is already optimal, return the same layout with reason "Current layout is already optimal."`;

export async function suggestLayout(
  slide:         PresentationSlide,
  currentLayout: SlideLayout,
): Promise<AILayoutSuggestion> {
  const parts = [
    `Current layout: ${currentLayout}`,
    `Title: "${slide.title}"`,
  ];
  if (slide.body)            parts.push(`Has body text (${slide.body.length} chars)`);
  if (slide.bullets?.length) parts.push(`Has ${slide.bullets.length} bullet points`);
  if (slide.stats?.length)   parts.push(`Has ${slide.stats.length} statistics`);
  if (slide.quote)           parts.push('Has pull-quote');
  if (slide.subtitle)        parts.push('Has subtitle');

  const VALID: SlideLayout[] = [
    'title','agenda','section','content','bullets','stats',
    'quote','chart_ref','predictions','references','closing',
  ];

  try {
    const result = await chatCompletionJSON<AILayoutSuggestion>(
      [
        { role: 'system', content: LAYOUT_SYSTEM },
        { role: 'user',   content: `Slide:\n${parts.join('\n')}\n\nSuggest the best layout.` },
      ],
      { temperature: 0.25, maxTokens: 120 },
    );

    return {
      suggestedLayout: VALID.includes(result.suggestedLayout as SlideLayout)
        ? (result.suggestedLayout as SlideLayout)
        : currentLayout,
      reason: typeof result.reason === 'string'
        ? result.reason.trim()
        : 'Consider this layout for this content.',
    };
  } catch {
    return { suggestedLayout: currentLayout, reason: 'Current layout is already optimal.' };
  }
}