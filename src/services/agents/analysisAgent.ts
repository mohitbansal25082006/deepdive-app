// src/services/agents/analysisAgent.ts
// Part 25 — Updated
//
// CHANGES FROM PART 24:
//   • Handles larger result sets from deep/expert modes (100–260 results)
//   • Prioritises Tier 1 & 2 sources in the context sent to the LLM
//   • Includes source trust tier in the context text so LLM can weight claims
//   • Extracts more facts/stats for deep/expert (10 facts, 8 stats minimum)
//   • All previous output fields preserved (facts, statistics, trends,
//     companies, keyThemes, contradictions)

import { chatCompletionJSON }          from '../openaiClient';
import { SearchBatch, AnalysisOutput } from '../../types';
import { TIER_LABELS }                 from '../sourceTrustScorer';

export async function runAnalysisAgent(
  topic:         string,
  searchBatches: SearchBatch[],
): Promise<AnalysisOutput> {

  // ── Build context: prioritise Tier 1 & 2 results ─────────────────────────

  // Flatten & sort by trust (best first)
  const allResults = searchBatches.flatMap(b =>
    (b.results ?? []).map(r => ({ ...r, _query: b.query }))
  );

  allResults.sort((a, b) => {
    const ta = a.trustScore?.tier ?? 3;
    const tb = b.trustScore?.tier ?? 3;
    if (ta !== tb) return ta - tb;
    return (a.trustScore?.credibilityScore ?? 5) > (b.trustScore?.credibilityScore ?? 5) ? -1 : 1;
  });

  // Split into premium (T1/T2) and general (T3/T4)
  const premiumResults = allResults.filter(r => (r.trustScore?.tier ?? 3) <= 2);
  const generalResults = allResults.filter(r => (r.trustScore?.tier ?? 3) >= 3);

  // Take up to 8 premium and 4 general per query batch to cap token usage
  // but ensure top sources are always included
  const maxPremium = Math.min(premiumResults.length, 50);
  const maxGeneral = Math.min(generalResults.length, 30);

  const contextResults = [
    ...premiumResults.slice(0, maxPremium),
    ...generalResults.slice(0, maxGeneral),
  ];

  // Build context grouped by trust tier for clarity
  const buildResultsText = (results: typeof allResults, maxPerGroup = 6): string => {
    // Group by original query for readability
    const byQuery = new Map<string, typeof results>();
    for (const r of results) {
      const q = r._query ?? 'General';
      const arr = byQuery.get(q) ?? [];
      if (arr.length < maxPerGroup) arr.push(r);
      byQuery.set(q, arr);
    }

    return [...byQuery.entries()]
      .map(([query, items]) => {
        const resultsText = items.map((r, i) => {
          const trustInfo = r.trustScore
            ? ` [${TIER_LABELS[r.trustScore.tier]} · ${r.trustScore.credibilityScore}/10]`
            : '';
          return `  [${i + 1}]${trustInfo} "${r.title}" (${r.source ?? r.url})\n  ${r.snippet}${r.date ? ` [${r.date}]` : ''}`;
        }).join('\n\n');
        return `QUERY: "${query}"\n${resultsText}`;
      })
      .join('\n\n---\n\n');
  };

  const searchContext = buildResultsText(contextResults, 6);

  // Total unique source count for context
  const uniqueUrls   = new Set(allResults.map(r => r.url)).size;
  const tier1Count   = premiumResults.filter(r => r.trustScore?.tier === 1).length;
  const tier2Count   = premiumResults.filter(r => r.trustScore?.tier === 2).length;

  const systemPrompt = `You are a world-class research analyst with expertise in extracting
high-signal intelligence from large web search datasets.

Your task is to analyze ${uniqueUrls} unique sources (${tier1Count} authoritative,
${tier2Count} credible, plus general web sources) and extract structured, actionable insights.

PRIORITY RULES:
  • Claims from Tier 1 (Authoritative) sources: [authoritative] tag — highest weight
  • Claims from Tier 2 (Credible) sources: [credible] tag — high weight
  • Claims from lower tiers: [general] tag — require corroboration
  • NEVER fabricate data — only extract what is present in the provided sources
  • Prefer specific numbers over vague claims
  • Flag any contradictions between sources`;

  const userPrompt = `RESEARCH TOPIC: "${topic}"
TOTAL SOURCES ANALYZED: ${uniqueUrls} unique URLs
PREMIUM SOURCES (Tier 1 & 2): ${premiumResults.length}

SEARCH RESULTS (premium sources first, then general):
${searchContext}

Analyze all search results and extract comprehensive intelligence.
Return ONLY valid JSON:
{
  "facts": [
    {
      "claim": "Specific, verifiable factual claim (prefer claims from trusted sources)",
      "source": "Source domain name",
      "url": "Full URL",
      "confidence": 0.9
    }
  ],
  "statistics": [
    {
      "value": "Specific number, percentage, or dollar amount",
      "context": "What this statistic measures and its significance",
      "source": "Source domain name",
      "url": "Full URL"
    }
  ],
  "trends": [
    {
      "trend": "Clear description of the trend",
      "direction": "rising|falling|stable|emerging",
      "evidence": "Specific evidence from sources supporting this trend"
    }
  ],
  "companies": ["Company1", "Company2", "Company3", "Company4", "Company5"],
  "keyThemes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
  "contradictions": ["Any conflicting claims found across different sources"]
}

EXTRACTION TARGETS (minimum):
  • At least 12 facts (prioritize from Tier 1 & 2 sources)
  • At least 8 statistics (with specific numbers)
  • At least 5 trends
  • At least 5 key themes
  • List ALL major companies/organizations mentioned
  • Note any contradictions between sources`;

  const analysis = await chatCompletionJSON<AnalysisOutput>([
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt   },
  ], { temperature: 0.2, maxTokens: 4000 });

  // Validate and patch empty arrays
  return {
    facts:          Array.isArray(analysis?.facts)          ? analysis.facts          : [],
    statistics:     Array.isArray(analysis?.statistics)     ? analysis.statistics     : [],
    trends:         Array.isArray(analysis?.trends)         ? analysis.trends         : [],
    companies:      Array.isArray(analysis?.companies)      ? analysis.companies      : [],
    keyThemes:      Array.isArray(analysis?.keyThemes)      ? analysis.keyThemes      : [],
    contradictions: Array.isArray(analysis?.contradictions) ? analysis.contradictions : [],
  };
}