// src/services/agents/reportAgent.ts
// REPORT GENERATOR AGENT
// Takes all gathered intelligence and produces a structured, 
// publication-quality research report with full citations.

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

  // Build citations from search results
  const citationMap = new Map<string, Citation>();
  let citationCounter = 0;

  searchBatches.forEach((batch) => {
    batch.results.slice(0, 5).forEach((r) => {
      if (!citationMap.has(r.url)) {
        citationCounter++;
        citationMap.set(r.url, {
          id: `c${citationCounter}`,
          title: r.title,
          url: r.url,
          source: r.source ?? new URL(r.url).hostname,
          date: r.date,
          snippet: r.snippet.slice(0, 200),
        });
      }
    });
  });

  const citations = Array.from(citationMap.values()).slice(0, 20);
  const citationIds = citations.map((c) => c.id);

  const systemPrompt = `You are a senior research director and expert technical writer. You create authoritative, comprehensive research reports that are:
- Written in a clear, professional yet engaging style
- Structured with logical flow from overview to specific details to future outlook
- Backed by specific data and statistics
- Balanced in perspective, acknowledging both opportunities and challenges
- Actionable with clear insights for decision-makers

Your reports rival those produced by top consulting firms (McKinsey, Gartner, CB Insights).`;

  const contextSummary = `
VERIFIED FACTS (${factCheck.verifiedFacts.length}):
${factCheck.verifiedFacts.slice(0, 10).map((f) => `• ${f.claim}`).join('\n')}

KEY STATISTICS (${analysis.statistics.length}):
${analysis.statistics.slice(0, 10).map((s) => `• ${s.value}: ${s.context}`).join('\n')}

KEY TRENDS:
${analysis.trends.map((t) => `• [${t.direction.toUpperCase()}] ${t.trend}`).join('\n')}

KEY COMPANIES: ${analysis.companies.join(', ')}
KEY THEMES: ${analysis.keyThemes.join(', ')}

RELIABILITY SCORE: ${factCheck.reliabilityScore}/10
ANALYST NOTES: ${factCheck.notes}
`;

  const availableCitationIds = citationIds.slice(0, 15).join(', ');

  const userPrompt = `Create a comprehensive research report on: "${plan.topic}"

RESEARCH GOALS: ${plan.researchGoals.join('; ')}
SUBTOPICS TO COVER: ${plan.subtopics.join(', ')}
DEPTH LEVEL: ${input.depth.toUpperCase()}

INTELLIGENCE GATHERED:
${contextSummary}

AVAILABLE CITATION IDs: ${availableCitationIds}

Write a complete, detailed research report. Return ONLY valid JSON:
{
  "title": "Compelling, specific report title",
  "executiveSummary": "3-4 paragraph executive summary covering the key findings, market state, and outlook. Be specific with data points.",
  "sections": [
    {
      "id": "s1",
      "title": "Section Title",
      "content": "3-4 paragraphs of detailed, data-backed content. Reference specific statistics and findings.",
      "bullets": ["Key point 1", "Key point 2", "Key point 3"],
      "statistics": [{"value": "stat", "context": "explanation", "source": "src", "url": "url"}],
      "citationIds": ["c1", "c2"],
      "icon": "ionicon-name-outline"
    }
  ],
  "keyFindings": ["Finding 1 with specific data", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
  "futurePredictions": ["Prediction 1 with timeframe", "Prediction 2", "Prediction 3"],
  "citations": [],
  "statistics": []
}

Create EXACTLY 6 sections covering:
1. Topic Overview & Current State
2. Key Players & Market Landscape  
3. Technology & Innovation Trends
4. Market Data & Statistics
5. Challenges & Risks
6. Future Outlook & Predictions

Each section must have 3-4 paragraphs of substantive content. Use these icon names: analytics-outline, business-outline, flash-outline, stats-chart-outline, warning-outline, telescope-outline`;

  const reportRaw = await chatCompletionJSON<ReportOutput>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.5, maxTokens: 5000 });

  // Inject the actual citation objects and statistics
  return {
    ...reportRaw,
    citations,
    statistics: analysis.statistics,
  };
}