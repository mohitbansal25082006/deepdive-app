// src/services/agents/reportAgent.ts
// FIXED: Added null guards on batch.results — some SerpAPI batches can return
// undefined results when a search query fails, causing .slice() to crash.

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

interface ReportOutput {
  title: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyFindings: string[];
  futurePredictions: string[];
  citations: Citation[];
  statistics: ExtractedStatistic[];
}

export async function runReportAgent(
  input: ResearchInput,
  plan: ResearchPlan,
  analysis: AnalysisOutput,
  factCheck: FactCheckOutput,
  searchBatches: SearchBatch[]
): Promise<ReportOutput> {

  // Build citations safely — guard against undefined results
  const citationMap = new Map<string, Citation>();
  let citationCounter = 0;

  searchBatches.forEach((batch) => {
    // FIXED: guard against undefined/null results array
    const results = Array.isArray(batch?.results) ? batch.results : [];
    results.slice(0, 5).forEach((r) => {
      if (!r?.url) return; // skip malformed results
      if (!citationMap.has(r.url)) {
        citationCounter++;
        let hostname = r.url;
        try { hostname = new URL(r.url).hostname; } catch { /* keep raw url */ }
        citationMap.set(r.url, {
          id: `c${citationCounter}`,
          title: r.title ?? 'Untitled',
          url: r.url,
          source: r.source ?? hostname,
          date: r.date,
          snippet: (r.snippet ?? '').slice(0, 200),
        });
      }
    });
  });

  const citations = Array.from(citationMap.values()).slice(0, 20);
  const citationIds = citations.map((c) => c.id);
  const availableCitationIds = citationIds.slice(0, 15).join(', ');

  const systemPrompt = `You are a senior research director and expert technical writer. You create authoritative, comprehensive research reports that are:
- Written in a clear, professional yet engaging style
- Structured with logical flow from overview to specific details to future outlook
- Backed by specific data and statistics
- Balanced in perspective, acknowledging both opportunities and challenges
- Actionable with clear insights for decision-makers

Your reports rival those produced by top consulting firms (McKinsey, Gartner, CB Insights).`;

  // Safely build context — guard all array accesses
  const verifiedFacts = Array.isArray(factCheck?.verifiedFacts) ? factCheck.verifiedFacts : [];
  const statistics = Array.isArray(analysis?.statistics) ? analysis.statistics : [];
  const trends = Array.isArray(analysis?.trends) ? analysis.trends : [];
  const companies = Array.isArray(analysis?.companies) ? analysis.companies : [];
  const keyThemes = Array.isArray(analysis?.keyThemes) ? analysis.keyThemes : [];
  const subtopics = Array.isArray(plan?.subtopics) ? plan.subtopics : [];
  const researchGoals = Array.isArray(plan?.researchGoals) ? plan.researchGoals : [];

  const contextSummary = `
VERIFIED FACTS (${verifiedFacts.length}):
${verifiedFacts.slice(0, 10).map((f) => `• ${f?.claim ?? ''}`).join('\n')}

KEY STATISTICS (${statistics.length}):
${statistics.slice(0, 10).map((s) => `• ${s?.value ?? ''}: ${s?.context ?? ''}`).join('\n')}

KEY TRENDS:
${trends.map((t) => `• [${(t?.direction ?? 'unknown').toUpperCase()}] ${t?.trend ?? ''}`).join('\n')}

KEY COMPANIES: ${companies.join(', ')}
KEY THEMES: ${keyThemes.join(', ')}

RELIABILITY SCORE: ${factCheck?.reliabilityScore ?? 'N/A'}/10
ANALYST NOTES: ${factCheck?.notes ?? 'None'}
`;

  const userPrompt = `Create a comprehensive research report on: "${plan?.topic ?? input.query}"

RESEARCH GOALS: ${researchGoals.join('; ')}
SUBTOPICS TO COVER: ${subtopics.join(', ')}
DEPTH LEVEL: ${input.depth.toUpperCase()}

INTELLIGENCE GATHERED:
${contextSummary}

AVAILABLE CITATION IDs: ${availableCitationIds || 'none'}

Write a complete, detailed research report. Return ONLY valid JSON with NO markdown formatting:
{
  "title": "Compelling, specific report title",
  "executiveSummary": "3-4 paragraph executive summary covering key findings, market state, and outlook. Be specific with data points.",
  "sections": [
    {
      "id": "s1",
      "title": "Section Title",
      "content": "3-4 paragraphs of detailed, data-backed content.",
      "bullets": ["Key point 1", "Key point 2", "Key point 3"],
      "statistics": [],
      "citationIds": ["c1", "c2"],
      "icon": "analytics-outline"
    }
  ],
  "keyFindings": ["Finding 1 with specific data", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
  "futurePredictions": ["Prediction 1 with timeframe", "Prediction 2", "Prediction 3"],
  "citations": [],
  "statistics": []
}

Create EXACTLY 6 sections covering:
1. Topic Overview & Current State — icon: "newspaper-outline"
2. Key Players & Market Landscape — icon: "business-outline"
3. Technology & Innovation Trends — icon: "flash-outline"
4. Market Data & Statistics — icon: "stats-chart-outline"
5. Challenges & Risks — icon: "warning-outline"
6. Future Outlook & Predictions — icon: "telescope-outline"

Each section must have at least 2 paragraphs of substantive content and 3 bullet points.`;

  const reportRaw = await chatCompletionJSON<ReportOutput>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.5, maxTokens: 5000 });

  // Validate the response has the expected shape
  if (!reportRaw?.title) {
    throw new Error('Report agent returned an invalid response. Please try again.');
  }

  // Inject the real citation objects we built (AI returns empty array per prompt)
  return {
    ...reportRaw,
    sections: Array.isArray(reportRaw.sections) ? reportRaw.sections : [],
    keyFindings: Array.isArray(reportRaw.keyFindings) ? reportRaw.keyFindings : [],
    futurePredictions: Array.isArray(reportRaw.futurePredictions) ? reportRaw.futurePredictions : [],
    citations,
    statistics: statistics, // use the ones extracted by analysisAgent
  };
}