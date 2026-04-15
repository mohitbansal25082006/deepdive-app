// src/services/agents/slideAgent.ts
// Part 41.9 — chart_ref slides now include an editorData overlay block for the
//             chart placeholder so it's editable (move/resize/remove) from day 1,
//             rather than rendering a static hardcoded grey box.
// ─────────────────────────────────────────────────────────────────────────────

import { chatCompletionJSON } from '../openaiClient';
import {
  ResearchReport,
  PresentationTheme,
  SlideAgentOutput,
  PresentationSlide,
  SlideLayout,
  SlideStatItem,
} from '../../types';

// ─── The shared placeholder block ID (must match SlideEditorCanvas constant) ──
const CHART_REF_PLACEHOLDER_ID = '__chart_ref_placeholder__';

// ─── Helper — sanitise bullets coming from the model ─────────────────────────

function cleanBullets(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .map(b => b.replace(/^[-•·]\s*/, '').trim());
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

// ─── Theme → accent colour mapping ───────────────────────────────────────────

const THEME_PRIMARY: Record<PresentationTheme, string> = {
  dark:      '#6C63FF',
  light:     '#6C63FF',
  corporate: '#0052CC',
  vibrant:   '#FF6584',
};

// ─── Build the default editorData for a chart_ref slide ──────────────────────
// We inject an overlay block matching the original static layout position so
// the slide looks identical on first render, but the block is now interactive.
//
// Original static position in ChartRefLayout (320×180 canvas):
//   left: 10, top: 34, width: 130, height: 110
//   xFrac = 10/320 = 0.031
//   yFrac = 34/180 = 0.189
//   wFrac = 130/320 = 0.406
//   hFrac = 110/180 = 0.611

function buildChartRefEditorData() {
  return {
    additionalBlocks: [
      {
        type:     'chart',
        id:       CHART_REF_PLACEHOLDER_ID,
        chart:    {
          id:       '__placeholder__',
          type:     'bar',
          title:    'Chart Placeholder',
          datasets: [],
          labels:   [],
        },
        position: {
          type:  'overlay',
          xFrac: 0.031,
          yFrac: 0.189,
          wFrac: 0.406,
          hFrac: 0.611,
        },
      },
    ],
  };
}

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
- "chart_ref"  → title + body (describe the trend) — the chart area is auto-generated as an editable overlay block
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

    // Part 41.9: for chart_ref slides, inject the editable overlay block
    // so the chart placeholder is interactive from generation time.
    const editorData = layout === 'chart_ref'
      ? buildChartRefEditorData()
      : undefined;

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
      // Part 41.9: attach editorData with the overlay block for chart_ref
      ...(editorData ? { editorData } : {}),
    };
  });

  return {
    presentationTitle:    raw.presentationTitle    ?? report.title,
    presentationSubtitle: raw.presentationSubtitle ?? `DeepDive AI · ${depthLabel} · ${date}`,
    slides,
  };
}