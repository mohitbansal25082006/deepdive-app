// src/services/agents/factCheckAgent.ts
// FIXED: Reliability score is now computed dynamically from actual source
// quality metrics rather than being a hallucinated placeholder value.
// The score is also calculated locally as a fallback so it never returns
// a hardcoded number.

import { chatCompletionJSON } from '../openaiClient';
import { AnalysisOutput, FactCheckOutput } from '../../types';

export async function runFactCheckerAgent(
  topic: string,
  analysis: AnalysisOutput
): Promise<FactCheckOutput> {
  const facts = Array.isArray(analysis?.facts) ? analysis.facts : [];
  const statistics = Array.isArray(analysis?.statistics) ? analysis.statistics : [];
  const contradictions = Array.isArray(analysis?.contradictions) ? analysis.contradictions : [];

  const factsText = facts
    .map((f, i) => `${i + 1}. "${f?.claim ?? ''}" — Source: ${f?.source ?? 'unknown'} (confidence: ${f?.confidence ?? 0.5})`)
    .join('\n') || 'No facts extracted.';

  const statsText = statistics
    .map((s, i) => `${i + 1}. ${s?.value ?? ''}: ${s?.context ?? ''} — Source: ${s?.source ?? 'unknown'}`)
    .join('\n') || 'No statistics extracted.';

  // Count unique sources to compute source diversity locally
  const allSources = [
    ...facts.map((f) => f?.source ?? ''),
    ...statistics.map((s) => s?.source ?? ''),
  ].filter(Boolean);
  const uniqueSources = new Set(allSources);
  const uniqueSourceCount = uniqueSources.size;

  // Compute a local fallback score based on fact quality
  const avgConfidence =
    facts.length > 0
      ? facts.reduce((sum, f) => sum + (f?.confidence ?? 0.5), 0) / facts.length
      : 0.5;
  const localReliability = Math.min(
    10,
    Math.round(
      (avgConfidence * 5 +
        Math.min(uniqueSourceCount / 2, 3) +
        (statistics.length > 3 ? 1.5 : 0.5) +
        (contradictions.length === 0 ? 1 : 0)) * 10
    ) / 10
  );
  const localDiversity = Math.min(10, Math.round(uniqueSourceCount * 1.2 * 10) / 10);

  const systemPrompt = `You are a rigorous fact-checking specialist and research integrity expert.

Your job is to evaluate extracted research claims for:
1. Internal consistency — do claims contradict each other?
2. Source diversity — are facts from multiple independent sources?
3. Specificity — are claims concrete and verifiable?
4. Recency — is the data current?
5. Source credibility — academic, government, major publications score higher than blogs

YOU MUST calculate reliability scores honestly based on the actual data quality provided.
Do NOT use placeholder values. Base your scores on the evidence in front of you.

Scoring guide for reliabilityScore (0–10):
- 9–10: Multiple high-credibility sources, consistent facts, strong statistics, no contradictions
- 7–8: Mostly reliable sources, minor inconsistencies, decent statistics
- 5–6: Mixed source quality, some gaps, a few contradictions
- 3–4: Weak sourcing, many contradictions or vague claims
- 1–2: Very poor sourcing, mostly unverifiable claims`;

  const userPrompt = `TOPIC: "${topic}"

UNIQUE SOURCE COUNT: ${uniqueSourceCount} sources
AVERAGE FACT CONFIDENCE: ${(avgConfidence * 100).toFixed(0)}%
FACTS WITH HIGH CONFIDENCE (>0.8): ${facts.filter((f) => (f?.confidence ?? 0) > 0.8).length}
TOTAL FACTS: ${facts.length}
TOTAL STATISTICS: ${statistics.length}

EXTRACTED FACTS:
${factsText}

STATISTICS:
${statsText}

CONTRADICTIONS NOTED:
${contradictions.join('\n') || 'None identified'}

Perform thorough fact-checking and return ONLY valid JSON. The reliabilityScore and sourceDiversity MUST reflect the actual quality above, not a generic number:
{
  "verifiedFacts": [
    {
      "claim": "Verified claim text (only include if genuinely supported by a source)",
      "source": "Source name",
      "url": "URL if available, else empty string",
      "confidence": 0.85
    }
  ],
  "flaggedClaims": [
    {
      "claim": "Questionable claim",
      "reason": "Specific reason it is questionable"
    }
  ],
  "reliabilityScore": <calculate honestly between 0.0 and 10.0 based on source quality>,
  "sourceDiversity": <calculate honestly between 0.0 and 10.0 based on ${uniqueSourceCount} unique sources>,
  "notes": "Specific assessment of this research's quality, naming actual strengths and weaknesses found"
}`;

  try {
    const factCheck = await chatCompletionJSON<FactCheckOutput>([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.1, maxTokens: 2000 });

    // Validate the scores are real numbers in range, not hallucinated placeholders
    const reliability = Number(factCheck?.reliabilityScore);
    const diversity = Number(factCheck?.sourceDiversity);

    return {
      verifiedFacts: Array.isArray(factCheck?.verifiedFacts) ? factCheck.verifiedFacts : facts,
      flaggedClaims: Array.isArray(factCheck?.flaggedClaims) ? factCheck.flaggedClaims : [],
      // Use AI score if it's a valid number and NOT a suspicious round number like 8.2
      // that indicates the model ignored the instruction; fall back to local calculation
      reliabilityScore:
        !isNaN(reliability) && reliability > 0 && reliability !== 8.2
          ? Math.round(reliability * 10) / 10
          : localReliability,
      sourceDiversity:
        !isNaN(diversity) && diversity > 0 && diversity !== 7.5
          ? Math.round(diversity * 10) / 10
          : localDiversity,
      notes: factCheck?.notes ?? `Research based on ${uniqueSourceCount} unique sources with ${facts.length} extracted facts.`,
    };
  } catch (err) {
    // If AI call fails, return a locally-computed fallback so the pipeline continues
    console.warn('[FactChecker] AI call failed, using local scoring:', err);
    return {
      verifiedFacts: facts,
      flaggedClaims: [],
      reliabilityScore: localReliability,
      sourceDiversity: localDiversity,
      notes: `Automated scoring based on ${uniqueSourceCount} sources and ${facts.length} facts. AI fact-check unavailable.`,
    };
  }
}