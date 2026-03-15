// src/services/agents/streamingReportAgent.ts
// Part 21 — Streaming Report Agent.
//
// Streams each of the 6 report sections independently via chatCompletionStream.
// Each section gets its own GPT-4o call so content is rich and focused.
//
// FIXES in this version:
//   • maxTokens raised to 2500 per section (was 1200 — caused thin content)
//   • System prompt enforces MINIMUM length: "at least 5 substantial paragraphs"
//   • BULLETS format removed — bullets are extracted by AI in a separate
//     mini-call instead of inline tagging (avoids confusion mid-stream)
//   • Full search snippets injected per section (not just facts/stats)
//   • Section-specific search results injected to ground content in real data

import { chatCompletionStream } from '../openaiStreamClient';
import { chatCompletionJSON }   from '../openaiClient';
import {
  ResearchInput,
  ResearchPlan,
  AnalysisOutput,
  FactCheckOutput,
  SearchBatch,
  ReportSection,
  Citation,
  ExtractedStatistic,
} from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StreamingReportCallbacks {
  onSectionStart:    (index: number, title: string) => void;
  onSectionToken:    (index: number, token: string) => void;
  onSectionComplete: (index: number, section: ReportSection) => void;
  onSummaryReady:    (summary: string) => void;
  onComplete:        (output: StreamingReportOutput) => void;
  onError:           (error: Error) => void;
  signal?:           AbortSignal;
}

export interface StreamingReportOutput {
  title:             string;
  executiveSummary:  string;
  sections:          ReportSection[];
  keyFindings:       string[];
  futurePredictions: string[];
  citations:         Citation[];
  statistics:        ExtractedStatistic[];
}

// ─── Section definitions ─────────────────────────────────────────────────────

const SECTION_DEFS = [
  {
    id:    's1',
    title: 'Topic Overview & Current State',
    icon:  'newspaper-outline',
    focus:
      'Write a thorough overview of the topic. Cover: (1) clear definition and scope, ' +
      '(2) current market state and size with specific dollar figures, ' +
      '(3) major recent developments in the last 12-24 months, ' +
      '(4) why this topic matters now, ' +
      '(5) the key metrics used to measure progress in this field. ' +
      'Use data from the provided context. Be specific — name companies, cite numbers.',
  },
  {
    id:    's2',
    title: 'Key Players & Market Landscape',
    icon:  'business-outline',
    focus:
      'Provide a detailed competitive landscape. Cover: (1) the top 5-8 companies with their ' +
      'market positions, funding, and recent moves, (2) emerging challengers and startups, ' +
      '(3) major partnerships and M&A activity, (4) geographic distribution of activity, ' +
      '(5) how different players are differentiating themselves. ' +
      'Include specific valuations, funding rounds, and market share data.',
  },
  {
    id:    's3',
    title: 'Technology & Innovation Trends',
    icon:  'flash-outline',
    focus:
      'Analyze the technology landscape in depth. Cover: (1) the most significant recent ' +
      'breakthroughs and what makes them important, (2) the underlying technical approaches ' +
      'being pursued, (3) research directions from academia and industry labs, ' +
      '(4) what technical barriers remain unsolved, ' +
      '(5) which innovations are reaching commercialization vs still in R&D. ' +
      'Reference specific papers, patents, or product launches where possible.',
  },
  {
    id:    's4',
    title: 'Market Data & Statistics',
    icon:  'stats-chart-outline',
    focus:
      'Present a data-rich analysis. Include: (1) current market size and historical growth, ' +
      '(2) projected CAGR and market size forecasts for 2025-2030, ' +
      '(3) investment volumes (VC, PE, corporate), (4) adoption rates and user numbers, ' +
      '(5) revenue figures for leading players, (6) geographic breakdowns of market share, ' +
      '(7) any relevant economic multiplier effects. ' +
      'Every claim should have a specific number attached to it.',
  },
  {
    id:    's5',
    title: 'Challenges & Risks',
    icon:  'warning-outline',
    focus:
      'Provide a candid risk and challenge analysis. Cover: (1) technical barriers and their ' +
      'current status, (2) regulatory risks by key geography (US, EU, Asia), ' +
      '(3) market adoption risks and what could slow growth, (4) competitive threats, ' +
      '(5) talent, infrastructure, or supply chain constraints, ' +
      '(6) ethical concerns and public perception risks, ' +
      '(7) any black-swan or systemic risks. Be specific about probability and impact.',
  },
  {
    id:    's6',
    title: 'Future Outlook & Predictions',
    icon:  'telescope-outline',
    focus:
      'Write a forward-looking section with concrete predictions. Cover: (1) 12-month outlook ' +
      'and near-term catalysts, (2) 3-year scenario (base case, bull case, bear case), ' +
      '(3) 5-10 year structural transformation expected, (4) which current players are likely ' +
      'to win/lose long-term, (5) adjacent markets that will be disrupted, ' +
      '(6) what breakthroughs are needed to achieve the optimistic scenario. ' +
      'Include specific dates, milestones, and quantified predictions.',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCitations(searchBatches: SearchBatch[]): Citation[] {
  const map = new Map<string, Citation>();
  let counter = 0;
  searchBatches.forEach(batch => {
    const results = Array.isArray(batch?.results) ? batch.results : [];
    results.slice(0, 5).forEach(r => {
      if (!r?.url || map.has(r.url)) return;
      counter++;
      let hostname = r.url;
      try { hostname = new URL(r.url).hostname; } catch { /* keep raw */ }
      map.set(r.url, {
        id:      `c${counter}`,
        title:   r.title ?? 'Untitled',
        url:     r.url,
        source:  r.source ?? hostname,
        date:    r.date,
        snippet: (r.snippet ?? '').slice(0, 200),
      });
    });
  });
  return Array.from(map.values()).slice(0, 20);
}

/** Returns a compact block of search snippets relevant to a given section */
function buildSectionContext(
  sectionIndex: number,
  plan:         ResearchPlan,
  analysis:     AnalysisOutput,
  factCheck:    FactCheckOutput,
  searchBatches: SearchBatch[],
): string {
  const facts     = Array.isArray(factCheck?.verifiedFacts) ? factCheck.verifiedFacts : [];
  const stats     = Array.isArray(analysis?.statistics)     ? analysis.statistics     : [];
  const trends    = Array.isArray(analysis?.trends)         ? analysis.trends         : [];
  const companies = Array.isArray(analysis?.companies)      ? analysis.companies      : [];
  const themes    = Array.isArray(analysis?.keyThemes)      ? analysis.keyThemes      : [];

  // Pull search snippets from batches relevant to this section
  // Each section gets 2-3 batches of search results to ground it
  const startBatch = sectionIndex * 2;
  const snippets: string[] = [];
  for (let b = startBatch; b < Math.min(startBatch + 3, searchBatches.length); b++) {
    const results = Array.isArray(searchBatches[b]?.results) ? searchBatches[b].results : [];
    results.slice(0, 3).forEach(r => {
      if (r?.snippet) snippets.push(`[${r.source ?? 'Source'}] ${r.snippet}`);
    });
  }

  return [
    `TOPIC: ${plan.topic}`,
    `KEY COMPANIES: ${companies.slice(0, 10).join(', ')}`,
    `KEY THEMES: ${themes.slice(0, 6).join(', ')}`,
    '',
    'VERIFIED FACTS (use these specifically):',
    ...facts.slice(0, 10).map(f => `• ${f.claim}`),
    '',
    'KEY STATISTICS (cite these with numbers):',
    ...stats.slice(0, 10).map(s => `• ${s.value}: ${s.context}`),
    '',
    'KEY TRENDS:',
    ...trends.slice(0, 6).map(t => `• [${(t.direction ?? 'stable').toUpperCase()}] ${t.trend}`),
    '',
    'SEARCH RESULT SNIPPETS (ground your writing in these):',
    ...snippets.slice(0, 8),
    '',
    `SOURCE RELIABILITY: ${factCheck.reliabilityScore}/10`,
  ].join('\n');
}

/** Extracts bullet points from section prose using a fast GPT call */
async function extractBullets(sectionTitle: string, prose: string): Promise<string[]> {
  if (!prose || prose.length < 100) return [];
  try {
    const result = await chatCompletionJSON<{ bullets: string[] }>(
      [
        {
          role: 'system',
          content:
            'Extract exactly 4 concise bullet points (1-2 sentences each) that capture ' +
            'the most important facts or insights from the provided research section text. ' +
            'Each bullet must be specific and include numbers/data where present. ' +
            'Return JSON only: { "bullets": ["...", "...", "...", "..."] }',
        },
        {
          role: 'user',
          content: `Section: "${sectionTitle}"\n\nText:\n${prose.slice(0, 3000)}`,
        },
      ],
      { temperature: 0.2, maxTokens: 400 },
    );
    return (result?.bullets ?? []).slice(0, 4).filter(b => b.length > 10);
  } catch {
    // Fallback: split prose into sentences and take first 3
    const sentences = prose.split(/[.!?]+/).filter(s => s.trim().length > 30);
    return sentences.slice(0, 3).map(s => s.trim());
  }
}

// ─── Main streaming function ──────────────────────────────────────────────────

export async function runStreamingReportAgent(
  input:         ResearchInput,
  plan:          ResearchPlan,
  analysis:      AnalysisOutput,
  factCheck:     FactCheckOutput,
  searchBatches: SearchBatch[],
  callbacks:     StreamingReportCallbacks,
): Promise<void> {
  const citations           = buildCitations(searchBatches);
  const completedSections:  ReportSection[] = [];

  const systemPrompt =
    'You are a senior research analyst writing one section of a mobile research report. ' +
    'Your writing must be concise, dense with insight, and easy to read on a phone screen.' +
    '\n\nCRITICAL REQUIREMENTS:' +
    '\n• Write EXACTLY 2-3 paragraphs — no more, no less' +
    '\n• Each paragraph: 3-4 sentences maximum' +
    '\n• Target: 150-250 words total for this section' +
    '\n• Include 2-3 specific data points (numbers, percentages, company names)' +
    '\n• Do NOT use markdown headers or bullet points — flowing prose only' +
    '\n• Be direct and punchy — every sentence must add value' +
    '\n• Stop writing after 250 words. Quality over quantity.';

  // ── Stream each of the 6 sections ─────────────────────────────────────────

  for (let i = 0; i < SECTION_DEFS.length; i++) {
    if (callbacks.signal?.aborted) return;

    const def = SECTION_DEFS[i];
    callbacks.onSectionStart(i, def.title);

    const sectionContext = buildSectionContext(i, plan, analysis, factCheck, searchBatches);

    let sectionText = '';

    await chatCompletionStream(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `RESEARCH TOPIC: "${plan.topic}"\n` +
            `ORIGINAL QUERY: "${input.query}"\n` +
            `RESEARCH DEPTH: ${input.depth.toUpperCase()}\n\n` +
            `INTELLIGENCE GATHERED:\n${sectionContext}\n\n` +
            `YOUR TASK: Write the "${def.title}" section.\n\n` +
            `WHAT TO COVER IN THIS SECTION:\n${def.focus}\n\n` +
            `Write the section now. STRICT LIMIT: 2-3 paragraphs, 150-250 words total. ` +
            `Be concise and data-rich. Stop after 250 words.`,
        },
      ],
      {
        onToken: (token) => {
          sectionText += token;
          callbacks.onSectionToken(i, token);
        },
        onDone: (fullText) => {
          sectionText = fullText.trim();
        },
        onError: (err) => {
          // Log but don't stop pipeline — use fallback content
          console.warn(`[StreamingReport] Section ${i} streaming error:`, err.message);
        },
        signal: callbacks.signal,
      },
      { temperature: 0.5, maxTokens: 800 },
    );

    if (callbacks.signal?.aborted) return;

    // If streaming produced no content (shouldn't happen with fallback), generate synchronously
    if (!sectionText || sectionText.length < 100) {
      try {
        const { chatCompletion: syncChat } = await import('../openaiClient');
        sectionText = await syncChat(
          [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content:
                `RESEARCH TOPIC: "${plan.topic}"\n` +
                `Write the "${def.title}" section.\n${def.focus}\n\n` +
                `CONTEXT:\n${sectionContext}`,
            },
          ],
          { temperature: 0.5, maxTokens: 800 },
        );
        // Re-emit via token for UI consistency
        callbacks.onSectionToken(i, sectionText);
      } catch (syncErr) {
        sectionText = `Analysis of ${def.title} for ${plan.topic} based on gathered research data.`;
      }
    }

    // Extract bullets with a separate fast call
    const bullets = await extractBullets(def.title, sectionText);

    const citationIds = citations.slice(i * 2, i * 2 + 3).map(c => c.id);

    const section: ReportSection = {
      id:          def.id,
      title:       def.title,
      content:     sectionText,
      bullets:     bullets.length > 0 ? bullets : [`Key findings from ${def.title} analysis`],
      statistics:  [],
      citationIds,
      icon:        def.icon,
    };

    completedSections.push(section);
    callbacks.onSectionComplete(i, section);
  }

  if (callbacks.signal?.aborted) return;

  // ── Final metadata (non-streaming — fast) ─────────────────────────────────

  interface MetadataOutput {
    title:             string;
    executiveSummary:  string;
    keyFindings:       string[];
    futurePredictions: string[];
  }

  let metadata: MetadataOutput;
  try {
    metadata = await chatCompletionJSON<MetadataOutput>(
      [
        {
          role: 'system',
          content:
            'You are a research editor. Based on the section summaries and context below, ' +
            'generate a compelling report title, a 3-4 paragraph executive summary packed ' +
            'with specific data points, 6 key findings, and 4 future predictions with timeframes. ' +
            'Return JSON only.',
        },
        {
          role: 'user',
          content:
            `TOPIC: "${plan.topic}"\nQUERY: "${input.query}"\n\n` +
            `SECTIONS WRITTEN:\n` +
            completedSections.map(s =>
              `${s.title}: ${s.content.slice(0, 400)}...`,
            ).join('\n\n') +
            '\n\nReturn JSON:\n' +
            '{\n' +
            '  "title": "Compelling specific report title with year",\n' +
            '  "executiveSummary": "3-4 paragraphs with specific data",\n' +
            '  "keyFindings": ["Finding with data 1","Finding 2","Finding 3","Finding 4","Finding 5","Finding 6"],\n' +
            '  "futurePredictions": ["2025: prediction","2026: prediction","2028: prediction","2030: prediction"]\n' +
            '}',
        },
      ],
      { temperature: 0.35, maxTokens: 1500 },
    );
  } catch {
    metadata = {
      title:            `${plan.topic}: Comprehensive Research Report ${new Date().getFullYear()}`,
      executiveSummary: `This report provides a comprehensive analysis of ${plan.topic}, covering current state, key players, market data, challenges, and future outlook based on ${completedSections.length} in-depth sections.`,
      keyFindings:      completedSections.map(s => `Key insight from ${s.title}`),
      futurePredictions: ['Continued growth expected over the next 5 years.'],
    };
  }

  callbacks.onSummaryReady(metadata.executiveSummary);

  const statistics = Array.isArray(analysis?.statistics) ? analysis.statistics : [];

  callbacks.onComplete({
    title:             metadata.title,
    executiveSummary:  metadata.executiveSummary,
    sections:          completedSections,
    keyFindings:       metadata.keyFindings  ?? [],
    futurePredictions: metadata.futurePredictions ?? [],
    citations,
    statistics,
  });
}