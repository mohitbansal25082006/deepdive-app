// src/services/agents/factCheckAgent.ts
// FACT CHECKER AGENT
// Reviews extracted facts for consistency, cross-references claims
// across multiple sources, flags unreliable or contradictory data,
// and assigns a reliability score to the overall research.

import { chatCompletionJSON } from '../openaiClient';
import { AnalysisOutput, FactCheckOutput } from '../../types';

export async function runFactCheckerAgent(
  topic: string,
  analysis: AnalysisOutput
): Promise<FactCheckOutput> {
  const factsText = analysis.facts
    .map((f, i) => `${i + 1}. "${f.claim}" — Source: ${f.source} (confidence: ${f.confidence})`)
    .join('\n');

  const statsText = analysis.statistics
    .map((s, i) => `${i + 1}. ${s.value}: ${s.context} — Source: ${s.source}`)
    .join('\n');

  const systemPrompt = `You are a rigorous fact-checking specialist and research integrity expert. Your role is to critically evaluate extracted research claims for:
1. Internal consistency (claims don't contradict each other)
2. Source diversity (facts from multiple independent sources are stronger)
3. Specificity (vague claims get lower confidence)
4. Recency (older data flagged where time-sensitive)
5. Source credibility (academic, government, major publications score higher)`;

  const userPrompt = `TOPIC: "${topic}"

EXTRACTED FACTS:
${factsText}

STATISTICS:
${statsText}

CONTRADICTIONS NOTED BY ANALYST:
${analysis.contradictions.join('\n') || 'None identified'}

Perform thorough fact-checking. Return ONLY valid JSON:
{
  "verifiedFacts": [
    {
      "claim": "Verified claim text",
      "source": "Source",
      "url": "URL",
      "confidence": 0.85
    }
  ],
  "flaggedClaims": [
    {
      "claim": "Claim that is questionable",
      "reason": "Why it's questionable"
    }
  ],
  "reliabilityScore": 8.2,
  "sourceDiversity": 7.5,
  "notes": "Overall assessment of the research quality and any important caveats"
}

reliabilityScore and sourceDiversity are 0–10 scales. Be honest and critical.`;

  const factCheck = await chatCompletionJSON<FactCheckOutput>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { temperature: 0.1, maxTokens: 2000 });

  return factCheck;
}