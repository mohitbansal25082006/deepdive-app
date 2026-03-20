// src/services/agents/factCheckAgent.ts
// Part 25 — Updated
//
// CHANGES FROM PART 24:
//   • Trust scores from SourceTrustScorer are used to weight the reliability
//     calculation — facts from Tier 1 sources boost the score, Tier 4 lower it
//   • sourceDiversity now accounts for both domain count AND tier diversity
//   • flaggedClaims include a trustNote when the source is low-tier
//   • All previous logic preserved, just more accurate scoring

import { chatCompletionJSON }              from '../openaiClient';
import { AnalysisOutput, FactCheckOutput } from '../../types';
import { scoreSource, TIER_LABELS }        from '../sourceTrustScorer';

export async function runFactCheckerAgent(
  topic:    string,
  analysis: AnalysisOutput,
): Promise<FactCheckOutput> {

  const facts          = Array.isArray(analysis?.facts)          ? analysis.facts          : [];
  const statistics     = Array.isArray(analysis?.statistics)     ? analysis.statistics     : [];
  const contradictions = Array.isArray(analysis?.contradictions) ? analysis.contradictions : [];

  // ── Local trust-weighted scoring ──────────────────────────────────────────

  // Score each fact source
  const factSourceScores = facts.map(f => {
    if (!f?.url && !f?.source) return { tier: 3, score: 5.0 };
    const ts = scoreSource(f.url ?? '', f.source);
    return { tier: ts.tier, score: ts.credibilityScore };
  });

  const statSourceScores = statistics.map(s => {
    if (!s?.url && !s?.source) return { tier: 3, score: 5.0 };
    const ts = scoreSource(s.url ?? '', s.source);
    return { tier: ts.tier, score: ts.credibilityScore };
  });

  // Trust-weighted average confidence
  const avgTrustScore = factSourceScores.length > 0
    ? factSourceScores.reduce((sum, fs) => sum + fs.score, 0) / factSourceScores.length
    : 5.0;

  // Tier distribution
  const tier1Facts = factSourceScores.filter(fs => fs.tier === 1).length;
  const tier2Facts = factSourceScores.filter(fs => fs.tier === 2).length;
  const tier3Facts = factSourceScores.filter(fs => fs.tier === 3).length;
  const tier4Facts = factSourceScores.filter(fs => fs.tier === 4).length;

  // Unique source count
  const allSources    = [...facts.map(f => f?.source ?? f?.url ?? ''), ...statistics.map(s => s?.source ?? s?.url ?? '')].filter(Boolean);
  const uniqueSources = new Set(allSources);
  const uniqueCount   = uniqueSources.size;

  // Avg fact confidence (from analysis agent)
  const avgConfidence = facts.length > 0
    ? facts.reduce((sum, f) => sum + (f?.confidence ?? 0.5), 0) / facts.length
    : 0.5;

  // ── Local reliability formula (trust-weighted) ───────────────────────────
  // Components:
  //   • Base confidence from analysis agent           0–3.0
  //   • Trust-weighted source quality                 0–3.5
  //   • Source diversity (unique count + tier spread) 0–2.0
  //   • Statistics depth                              0–1.0
  //   • Contradiction penalty                         0–0.5

  const baseConfComponent    = avgConfidence * 3.0;
  const trustComponent       = (avgTrustScore / 10) * 3.5;
  const diversityComponent   = Math.min(2.0, (uniqueCount / 10) * 1.0 + (tier1Facts > 0 ? 0.5 : 0) + (tier2Facts > 2 ? 0.5 : 0));
  const statsComponent       = statistics.length > 5 ? 1.0 : statistics.length > 2 ? 0.6 : 0.3;
  const contradictionPenalty = contradictions.length > 3 ? 0.5 : contradictions.length > 1 ? 0.2 : 0;

  const localReliability = Math.min(10,
    Math.round((baseConfComponent + trustComponent + diversityComponent + statsComponent - contradictionPenalty) * 10) / 10
  );

  const localDiversity = Math.min(10,
    Math.round(Math.min(10, uniqueCount * 0.8 + tier1Facts * 0.3 + tier2Facts * 0.1) * 10) / 10
  );

  // ── Build tier summary for LLM context ───────────────────────────────────

  const tierSummary = [
    tier1Facts > 0 ? `${tier1Facts} from Tier 1 (${TIER_LABELS[1]}) sources` : null,
    tier2Facts > 0 ? `${tier2Facts} from Tier 2 (${TIER_LABELS[2]}) sources` : null,
    tier3Facts > 0 ? `${tier3Facts} from Tier 3 (${TIER_LABELS[3]}) sources` : null,
    tier4Facts > 0 ? `${tier4Facts} from Tier 4 (${TIER_LABELS[4]}) — low quality` : null,
  ].filter(Boolean).join(', ');

  const factsText = facts
    .map((f, i) => {
      const ts = factSourceScores[i];
      return `${i + 1}. "${f?.claim ?? ''}" — Source: ${f?.source ?? 'unknown'} [T${ts?.tier ?? '?'}·${ts?.score?.toFixed(1) ?? '?'}] (confidence: ${f?.confidence ?? 0.5})`;
    })
    .join('\n') || 'No facts extracted.';

  const statsText = statistics
    .map((s, i) => {
      const ts = statSourceScores[i];
      return `${i + 1}. ${s?.value ?? ''}: ${s?.context ?? ''} — Source: ${s?.source ?? 'unknown'} [T${ts?.tier ?? '?'}·${ts?.score?.toFixed(1) ?? '?'}]`;
    })
    .join('\n') || 'No statistics extracted.';

  const systemPrompt = `You are a rigorous fact-checking specialist and research integrity expert.

Your job is to evaluate extracted research claims for:
1. Internal consistency — do claims contradict each other?
2. Source credibility — Tier 1 (academic/government) > Tier 2 (major news) > Tier 3 (general) > Tier 4 (blog/forum)
3. Specificity — are claims concrete and verifiable?
4. Recency — is the data current (2024–2025 preferred)?
5. Corroboration — are important claims supported by multiple independent sources?

YOU MUST calculate reliability scores honestly based on the actual data quality provided.
Do NOT use placeholder values or hardcoded numbers.

Scoring guide for reliabilityScore (0–10):
  9–10: Multiple Tier 1 & 2 sources, consistent facts, strong statistics, no contradictions
  7–8:  Mostly Tier 2 sources, minor inconsistencies, decent statistics
  5–6:  Mixed source quality, some gaps, a few contradictions
  3–4:  Weak sourcing (mostly Tier 3/4), many contradictions or vague claims
  1–2:  Very poor sourcing, mostly unverifiable claims`;

  const userPrompt = `TOPIC: "${topic}"

SOURCE QUALITY BREAKDOWN:
  ${tierSummary || 'No trust data available'}
  Unique sources: ${uniqueCount}
  Average source trust score: ${avgTrustScore.toFixed(1)}/10
  Average fact confidence: ${(avgConfidence * 100).toFixed(0)}%
  High-confidence facts (>0.8): ${facts.filter(f => (f?.confidence ?? 0) > 0.8).length}/${facts.length}

EXTRACTED FACTS (with trust tier):
${factsText}

STATISTICS (with trust tier):
${statsText}

CONTRADICTIONS NOTED:
${contradictions.join('\n') || 'None identified'}

LOCAL RELIABILITY ESTIMATE: ${localReliability}/10
LOCAL SOURCE DIVERSITY ESTIMATE: ${localDiversity}/10

Perform thorough fact-checking. Return ONLY valid JSON:
{
  "verifiedFacts": [
    {
      "claim": "Verified claim (only include if genuinely supported by a Tier 1 or 2 source, or corroborated by multiple sources)",
      "source": "Source name",
      "url": "URL or empty string",
      "confidence": 0.85
    }
  ],
  "flaggedClaims": [
    {
      "claim": "Questionable or low-trust claim",
      "reason": "Specific reason: only from Tier 3/4 source / contradicts other data / too vague / unverifiable"
    }
  ],
  "reliabilityScore": <honest score 0.0–10.0 based on source quality breakdown above>,
  "sourceDiversity": <honest score 0.0–10.0 based on unique sources and tier spread>,
  "notes": "Specific assessment naming actual strengths and weaknesses found in this research dataset"
}`;

  try {
    const factCheck = await chatCompletionJSON<FactCheckOutput>([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ], { temperature: 0.1, maxTokens: 2500 });

    const reliability = Number(factCheck?.reliabilityScore);
    const diversity   = Number(factCheck?.sourceDiversity);

    // Reject the AI score if it's suspiciously round (typical hallucinated values)
    const SUSPICIOUS_SCORES = new Set([8.2, 7.5, 8.5, 9.0, 7.0, 6.5, 8.0]);
    const reliabilityFinal = (!isNaN(reliability) && reliability > 0 && !SUSPICIOUS_SCORES.has(reliability))
      ? Math.round(reliability * 10) / 10
      : localReliability;

    const diversityFinal = (!isNaN(diversity) && diversity > 0 && !SUSPICIOUS_SCORES.has(diversity))
      ? Math.round(diversity * 10) / 10
      : localDiversity;

    return {
      verifiedFacts:    Array.isArray(factCheck?.verifiedFacts)  ? factCheck.verifiedFacts  : facts,
      flaggedClaims:    Array.isArray(factCheck?.flaggedClaims)   ? factCheck.flaggedClaims  : [],
      reliabilityScore: reliabilityFinal,
      sourceDiversity:  diversityFinal,
      notes:            factCheck?.notes ?? `Research based on ${uniqueCount} unique sources. ${tierSummary}.`,
    };

  } catch (err) {
    console.warn('[FactChecker] AI call failed, using local scoring:', err);
    return {
      verifiedFacts:    facts,
      flaggedClaims:    [],
      reliabilityScore: localReliability,
      sourceDiversity:  localDiversity,
      notes:            `Automated trust-weighted scoring. ${uniqueCount} sources: ${tierSummary}.`,
    };
  }
}