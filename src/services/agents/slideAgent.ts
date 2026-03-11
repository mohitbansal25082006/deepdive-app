// src/services/agents/slideAgent.ts
// Part 5 — AI Slide Generator Agent
//
// Responsibilities:
//   1. Receive a ResearchReport + target theme
//   2. Call GPT-4o with a detailed slide-generation prompt
//   3. Return a typed SlideAgentOutput with 12-16 structured slides
//
// The agent is deliberately stateless — it takes the full report and returns
// a complete, ordered slide array in one OpenAI call.

import { chatCompletionJSON } from '../openaiClient';
import {
  ResearchReport,
  PresentationTheme,
  SlideAgentOutput,
  PresentationSlide,
  SlideLayout,
  SlideStatItem,
} from '../../types';

// ─── Helper — sanitise bullets coming from the model ─────────────────────────

function cleanBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .map(b => b.replace(/^[-•·]\s*/, '').trim());   // strip any leading bullets the model adds
}

function cleanStats(raw: unknown): SlideStatItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is SlideStatItem =>
      s &&
      typeof s.value === 'string' &&
      typeof s.label === 'string'
  );
}

// ─── Icon map — map slide layout to a sensible Ionicon default ────────────────

const LAYOUT_ICON: Record<SlideLayout, string> = {
  title:       'telescope-outline',
  agenda:      'list-outline',
  section:     'bookmark-outline',
  content:     'document-text-outline',
  bullets:     'checkmark-circle-outline',
  stats:       'stats-chart-outline',
  quote:       'chatbubble-ellipses-outline',
  chart_ref:   'bar-chart-outline',
  predictions: 'telescope-outline',
  references:  'link-outline',
  closing:     'sparkles-outline',
};

// ─── Theme → accent colour mapping (app hex) ──────────────────────────────────

const THEME_PRIMARY: Record<PresentationTheme, string> = {
  dark:      '#6C63FF',
  light:     '#6C63FF',
  corporate: '#0052CC',
  vibrant:   '#FF6584',
};

// ─── Agent entry point ────────────────────────────────────────────────────────

export async function runSlideAgent(
  report: ResearchReport,
  theme: PresentationTheme = 'dark'
): Promise<SlideAgentOutput> {
  const accent = THEME_PRIMARY[theme];
  const depthLabel =
    report.depth === 'quick' ? 'Quick Scan'
    : report.depth === 'deep' ? 'Deep Dive'
    : 'Expert Research';

  const date = new Date(report.createdAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  // ── Build a condensed summary of the report for the AI ───────────────────

  const sectionsContext = report.sections
    .slice(0, 6)
    .map(s => `Section: ${s.title}\n${s.content.slice(0, 300)}\nBullets: ${(s.bullets ?? []).slice(0, 3).join(' | ')}`)
    .join('\n\n');

  const findingsContext = report.keyFindings
    .slice(0, 6)
    .map((f, i) => `${i + 1}. ${f}`)
    .join('\n');

  const statsContext = report.statistics
    .slice(0, 8)
    .map(s => `${s.value}: ${s.context} (${s.source})`)
    .join('\n');

  const predictionsContext = report.futurePredictions
    .slice(0, 5)
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');

  const citationsContext = report.citations
    .slice(0, 5)
    .map((c, i) => `[${i + 1}] ${c.title} — ${c.source}${c.date ? ` (${c.date})` : ''} — ${c.url}`)
    .join('\n');

  const sectionTitles = report.sections.map(s => s.title);

  const systemPrompt = `You are an expert presentation designer and consultant. You convert research reports into compelling, slide-by-slide presentations.

Your presentations:
- Are concise: each slide has ONE main message
- Use punchy, short titles (5 words max)
- Write bullets as full sentences (max 15 words each)
- Pull real statistics and quotes from the report data
- Follow a logical narrative arc: hook → context → insights → data → future → close

SLIDE LAYOUT RULES:
- "title"      → cover slide: title + subtitle + badgeText only
- "agenda"     → bullets array = ordered list of presentation sections
- "section"    → sectionTag (category label) + title (section name, big) — no body/bullets
- "content"    → title + body (1–2 paragraphs of prose)
- "bullets"    → title + bullets array (3–6 items, no "body")
- "stats"      → title + stats array with {value, label, color}
- "quote"      → title + quote (pull-quote text) + quoteAttribution
- "chart_ref"  → title + body (describe the trend) — used when referencing a chart
- "predictions"→ title + bullets array of future outlook items
- "references" → title + bullets array (formatted citations)
- "closing"    → title + subtitle — branding / thank you slide

Allowed stat colors: "#6C63FF", "#43E97B", "#FFA726", "#FF6584", "#29B6F6", "#FF4757"
Allowed accent colors: same list above.

Return ONLY valid JSON — no markdown, no explanation.`;

  const userPrompt = `Convert this research report into a professional presentation.

REPORT TITLE: "${report.title}"
QUERY: "${report.query}"
DEPTH: ${depthLabel}
DATE: ${date}
SECTIONS: ${sectionTitles.join(', ')}
RELIABILITY: ${report.reliabilityScore}/10
SOURCES: ${report.sourcesCount}

EXECUTIVE SUMMARY:
${report.executiveSummary.slice(0, 500)}

SECTIONS:
${sectionsContext}

KEY FINDINGS:
${findingsContext}

KEY STATISTICS:
${statsContext}

FUTURE PREDICTIONS:
${predictionsContext}

CITATIONS (top 5):
${citationsContext}

Generate EXACTLY this slide sequence (13–15 slides total):
1. title slide
2. agenda slide (list all section names)
3. content slide — executive summary (2 concise paragraphs)
4. section divider for "${sectionTitles[0] ?? 'Overview'}"
5. bullets slide — key points from section 1
6. section divider for "${sectionTitles[1] ?? 'Key Players'}"
7. bullets slide — key points from section 2
8. stats slide — pick 3–4 of the best real statistics from the report
9. section divider for "${sectionTitles[2] ?? 'Trends'}"
10. bullets slide — key points from section 3
11. quote slide — most impactful single finding or statistic as a pull-quote
12. predictions slide — future outlook bullet list
13. chart_ref slide — describe the biggest trend with a body paragraph
14. references slide — top 5 citations as bullets
15. closing slide

STRICT JSON FORMAT:
{
  "presentationTitle": "string",
  "presentationSubtitle": "string (e.g. 'DeepDive AI Research Report · ${date}')",
  "slides": [
    {
      "id": "slide_001",
      "layout": "title",
      "title": "string",
      "subtitle": "string",
      "badgeText": "string",
      "body": null,
      "bullets": [],
      "stats": [],
      "quote": null,
      "quoteAttribution": null,
      "sectionTag": null,
      "accentColor": "#6C63FF",
      "icon": "telescope-outline",
      "speakerNotes": "string"
    }
  ]
}`;

  // ── Call GPT-4o ──────────────────────────────────────────────────────────

  const raw = await chatCompletionJSON<{
    presentationTitle: string;
    presentationSubtitle: string;
    slides: Array<Partial<PresentationSlide> & { layout: SlideLayout }>;
  }>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    { temperature: 0.4, maxTokens: 5000 }
  );

  if (!raw?.slides?.length) {
    throw new Error('Slide agent returned an empty presentation. Please try again.');
  }

  // ── Normalise & validate each slide ─────────────────────────────────────

  const slides: Omit<PresentationSlide, 'slideNumber'>[] = raw.slides.map((s, i) => {
    const layout: SlideLayout = (
      [
        'title','agenda','section','content','bullets','stats',
        'quote','chart_ref','predictions','references','closing',
      ].includes(s.layout)
        ? s.layout
        : 'content'
    ) as SlideLayout;

    return {
      id:               s.id ?? `slide_${String(i + 1).padStart(3, '0')}`,
      layout,
      title:            (typeof s.title === 'string' && s.title.trim())
                          ? s.title.trim()
                          : `Slide ${i + 1}`,
      subtitle:         typeof s.subtitle === 'string'  ? s.subtitle.trim()  : undefined,
      body:             typeof s.body    === 'string'   ? s.body.trim()      : undefined,
      bullets:          cleanBullets(s.bullets),
      stats:            cleanStats(s.stats),
      quote:            typeof s.quote   === 'string'   ? s.quote.trim()     : undefined,
      quoteAttribution: typeof s.quoteAttribution === 'string' ? s.quoteAttribution.trim() : undefined,
      sectionTag:       typeof s.sectionTag === 'string' ? s.sectionTag.trim() : undefined,
      badgeText:        typeof s.badgeText  === 'string' ? s.badgeText.trim()  : undefined,
      accentColor:      typeof s.accentColor === 'string' ? s.accentColor : accent,
      icon:             typeof s.icon === 'string'
                          ? s.icon
                          : LAYOUT_ICON[layout],
      speakerNotes:     typeof s.speakerNotes === 'string' ? s.speakerNotes : undefined,
    };
  });

  return {
    presentationTitle:    raw.presentationTitle    ?? report.title,
    presentationSubtitle: raw.presentationSubtitle ?? `DeepDive AI · ${depthLabel} · ${date}`,
    slides,
  };
}