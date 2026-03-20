// src/services/agents/reportAgent.ts
// Part 25 — Updated
//
// CHANGES FROM PART 24:
//   • Citations now include trustScore from SourceTrustScorer
//   • Citations are sorted: Tier 1 & 2 first, then by credibility score
//   • Up to 30 citations for expert mode (was 20)
//   • LLM prompt instructs it to reference higher-trust sources in sections
//   • All previous output fields preserved

import { chatCompletionJSON } from '../openaiClient';
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
import { scoreSource, TIER_LABELS, TIER_COLORS } from '../sourceTrustScorer';

interface ReportOutput {
  title:             string;
  executiveSummary:  string;
  sections:          ReportSection[];
  keyFindings:       string[];
  futurePredictions: string[];
  citations:         Citation[];
  statistics:        ExtractedStatistic[];
}

export async function runReportAgent(
  input:         ResearchInput,
  plan:          ResearchPlan,
  analysis:      AnalysisOutput,
  factCheck:     FactCheckOutput,
  searchBatches: SearchBatch[],
): Promise<ReportOutput> {

  // ── Build citations with trust scores ─────────────────────────────────────

  const citationMap = new Map<string, Citation>();
  let citationCounter = 0;

  // Max citations scales with depth
  const maxCitationsPerBatch = input.depth === 'expert' ? 8 : input.depth === 'deep' ? 6 : 5;
  const maxTotalCitations    = input.depth === 'expert' ? 30 : input.depth === 'deep' ? 25 : 15;

  searchBatches.forEach(batch => {
    const results = Array.isArray(batch?.results) ? batch.results : [];
    results.slice(0, maxCitationsPerBatch).forEach(r => {
      if (!r?.url) return;
      if (citationMap.has(r.url)) return;

      citationCounter++;
      let hostname = r.url;
      try { hostname = new URL(r.url).hostname; } catch {}

      // Attach trust score (may already be scored from search step)
      const trust = r.trustScore ?? scoreSource(r.url, r.source);

      citationMap.set(r.url, {
        id:         `c${citationCounter}`,
        title:      r.title   ?? 'Untitled',
        url:        r.url,
        source:     r.source  ?? hostname,
        date:       r.date,
        snippet:    (r.snippet ?? '').slice(0, 200),
        trustScore: trust,
      });
    });
  });

  // Sort citations: Tier 1 first, then Tier 2, etc., within each tier by credibility
  const citations = Array.from(citationMap.values())
    .sort((a, b) => {
      const ta = a.trustScore?.tier ?? 3;
      const tb = b.trustScore?.tier ?? 3;
      if (ta !== tb) return ta - tb;
      return (b.trustScore?.credibilityScore ?? 5) - (a.trustScore?.credibilityScore ?? 5);
    })
    .slice(0, maxTotalCitations);

  const citationIds            = citations.map(c => c.id);
  const availableCitationIds   = citationIds.slice(0, 20).join(', ');

  // Build a trust summary for the prompt
  const tier1Cits = citations.filter(c => c.trustScore?.tier === 1);
  const tier2Cits = citations.filter(c => c.trustScore?.tier === 2);

  const citationContext = citations
    .slice(0, 15)
    .map(c => {
      const tier = c.trustScore ? `[${TIER_LABELS[c.trustScore.tier]}·${c.trustScore.credibilityScore}/10]` : '';
      return `  ${c.id}: ${tier} "${c.title}" — ${c.source}`;
    })
    .join('\n');

  const systemPrompt = `You are a senior research director and expert technical writer.
You create authoritative, comprehensive research reports that rival top consulting firms.

CITATION GUIDANCE:
  • Prefer citing Tier 1 (academic/government) and Tier 2 (major news/research) sources
  • You have ${tier1Cits.length} Tier 1 authoritative sources and ${tier2Cits.length} Tier 2 credible sources available
  • Each section should cite at minimum 2–3 of the highest-trust available sources
  • Structure flows logically: overview → specifics → future outlook`;

  // Build safe context from analysis
  const verifiedFacts  = Array.isArray(factCheck?.verifiedFacts)  ? factCheck.verifiedFacts  : [];
  const statistics     = Array.isArray(analysis?.statistics)      ? analysis.statistics      : [];
  const trends         = Array.isArray(analysis?.trends)          ? analysis.trends          : [];
  const companies      = Array.isArray(analysis?.companies)       ? analysis.companies       : [];
  const keyThemes      = Array.isArray(analysis?.keyThemes)       ? analysis.keyThemes       : [];
  const subtopics      = Array.isArray(plan?.subtopics)           ? plan.subtopics           : [];
  const researchGoals  = Array.isArray(plan?.researchGoals)       ? plan.researchGoals       : [];

  const contextSummary = `
VERIFIED FACTS (${verifiedFacts.length}):
${verifiedFacts.slice(0, 12).map(f => `• ${f?.claim ?? ''}`).join('\n')}

KEY STATISTICS (${statistics.length}):
${statistics.slice(0, 12).map(s => `• ${s?.value ?? ''}: ${s?.context ?? ''}`).join('\n')}

KEY TRENDS:
${trends.map(t => `• [${(t?.direction ?? 'unknown').toUpperCase()}] ${t?.trend ?? ''}`).join('\n')}

KEY COMPANIES: ${companies.join(', ')}
KEY THEMES: ${keyThemes.join(', ')}
RELIABILITY SCORE: ${factCheck?.reliabilityScore ?? 'N/A'}/10 (source quality: ${tier1Cits.length} authoritative, ${tier2Cits.length} credible sources)
ANALYST NOTES: ${factCheck?.notes ?? 'None'}
`;

  const userPrompt = `Create a comprehensive research report on: "${plan?.topic ?? input.query}"

RESEARCH GOALS: ${researchGoals.join('; ')}
SUBTOPICS TO COVER: ${subtopics.join(', ')}
DEPTH LEVEL: ${input.depth.toUpperCase()} (${input.depth === 'expert' ? '6 detailed sections, extensive data' : input.depth === 'deep' ? '6 thorough sections with statistics' : '6 clear sections with key data'})

INTELLIGENCE GATHERED:
${contextSummary}

AVAILABLE CITATIONS (sorted by trust tier):
${citationContext}

CITATION IDs available: ${availableCitationIds || 'none'}

Write a complete, detailed research report. Return ONLY valid JSON with NO markdown:
{
  "title": "Compelling, specific report title (max 12 words)",
  "executiveSummary": "3–4 paragraph executive summary with specific data points and key findings",
  "sections": [
    {
      "id": "s1",
      "title": "Section Title",
      "content": "3–4 paragraphs. Cite authoritative sources where possible. Include specific data.",
      "bullets": ["Key insight with data", "Key insight 2", "Key insight 3"],
      "statistics": [],
      "citationIds": ["c1", "c2"],
      "icon": "newspaper-outline"
    }
  ],
  "keyFindings": ["Finding 1 with specific data point", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
  "futurePredictions": ["Prediction 1 with timeframe", "Prediction 2", "Prediction 3"],
  "citations": [],
  "statistics": []
}

Create EXACTLY 6 sections:
1. Topic Overview & Current State          — icon: "newspaper-outline"
2. Key Players & Market Landscape          — icon: "business-outline"
3. Technology & Innovation Trends          — icon: "flash-outline"
4. Market Data & Statistics                — icon: "stats-chart-outline"
5. Challenges, Risks & Regulatory Outlook  — icon: "warning-outline"
6. Future Outlook & Predictions            — icon: "telescope-outline"

Each section: ≥2 paragraphs + 3 bullet points + 2–3 citation IDs from highest-trust sources.`;

  const reportRaw = await chatCompletionJSON<ReportOutput>([
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt   },
  ], { temperature: 0.5, maxTokens: 6000 });

  if (!reportRaw?.title) {
    throw new Error('Report agent returned an invalid response. Please try again.');
  }

  return {
    ...reportRaw,
    sections:          Array.isArray(reportRaw.sections)          ? reportRaw.sections          : [],
    keyFindings:       Array.isArray(reportRaw.keyFindings)       ? reportRaw.keyFindings       : [],
    futurePredictions: Array.isArray(reportRaw.futurePredictions) ? reportRaw.futurePredictions : [],
    citations,           // ← trust-scored, sorted citations
    statistics,          // ← from analysisAgent
  };
}