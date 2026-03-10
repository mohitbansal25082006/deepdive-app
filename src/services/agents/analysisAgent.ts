// src/services/agents/analysisAgent.ts
// ANALYSIS AGENT
// Takes raw search results and extracts structured intelligence:
// facts, statistics, trends, companies, themes, and contradictions.

import { chatCompletionJSON } from '../openaiClient';
import { SearchBatch, AnalysisOutput } from '../../types';

export async function runAnalysisAgent(
  topic: string,
  searchBatches: SearchBatch[]
): Promise<AnalysisOutput> {
  // Condense search results into a text block for the LLM
  const searchContext = searchBatches
    .map((batch) => {
      const resultsText = batch.results
        .slice(0, 6) // Top 6 per query
        .map(
          (r, i) =>
            `  [${i + 1}] "${r.title}" (${r.source ?? r.url})\n  ${r.snippet}${r.date ? ` [${r.date}]` : ''}`
        )
        .join('\n\n');
      return `QUERY: "${batch.query}"\nRESULTS:\n${resultsText}`;
    })
    .join('\n\n---\n\n');

  const systemPrompt = `You are a world-class research analyst with expertise in extracting high-signal intelligence from raw search data. 

Your task is to analyze search results and extract structured, actionable insights. Be specific and quantitative wherever possible. Do not fabricate data — only extract what is present in the sources provided.`;

  const userPrompt = `RESEARCH TOPIC: "${topic}"

SEARCH RESULTS:
${searchContext}

Analyze all search results and extract comprehensive intelligence. Return ONLY valid JSON:
{
  "facts": [
    {
      "claim": "Specific factual claim from sources",
      "source": "Source name",
      "url": "source URL",
      "confidence": 0.9
    }
  ],
  "statistics": [
    {
      "value": "Specific number or percentage",
      "context": "What this stat means",
      "source": "Source name",
      "url": "source URL"
    }
  ],
  "trends": [
    {
      "trend": "Description of the trend",
      "direction": "rising|falling|stable|emerging",
      "evidence": "Supporting evidence from sources"
    }
  ],
  "companies": ["Company1", "Company2", "Company3"],
  "keyThemes": ["theme1", "theme2", "theme3", "theme4"],
  "contradictions": ["Any conflicting information found across sources"]
}

Extract at minimum: 8 facts, 5 statistics, 4 trends, 4 themes. Be thorough.`;

  const analysis = await chatCompletionJSON<AnalysisOutput>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.2, maxTokens: 3000 });

  return analysis;
}