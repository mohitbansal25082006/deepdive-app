// src/services/agents/academicPaperAgent.ts
// Part 7 — AI Academic Paper Mode
//
// Converts a completed ResearchReport + raw pipeline data into a full
// academic research paper with 7 canonical sections:
//   Abstract · Introduction · Literature Review · Methodology ·
//   Findings · Conclusion · References
//
// The agent is called by the orchestrator only when input.mode === 'academic'.
// It runs after the reporter + visualizer steps, using the already-gathered
// research intelligence so no additional web searches are needed.

import { chatCompletionJSON } from '../openaiClient';
import {
  ResearchInput,
  ResearchPlan,
  AnalysisOutput,
  FactCheckOutput,
  SearchBatch,
  ResearchReport,
  Citation,
  AcademicAgentOutput,
  AcademicSection,
  AcademicCitationStyle,
} from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Count words in a string (rough estimate for academic papers).
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Count total words across all sections of the paper.
 */
function totalWordCount(sections: AcademicSection[]): number {
  return sections.reduce((sum, s) => {
    const sectionWords = countWords(s.content);
    const subsectionWords = (s.subsections ?? []).reduce(
      (acc, sub) => acc + countWords(sub.content),
      0
    );
    return sum + sectionWords + subsectionWords;
  }, 0);
}

/**
 * Attach sequential IDs to sections and their subsections.
 */
function hydrateSections(raw: AcademicAgentOutput['sections']): AcademicSection[] {
  return raw.map((section, i) => ({
    ...section,
    id: `sec-${i + 1}`,
    subsections: (section.subsections ?? []).map((sub, j) => ({
      ...sub,
      id: `sec-${i + 1}-sub-${j + 1}`,
    })),
  }));
}

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior academic researcher and expert scientific writer with 20+ years of experience publishing in peer-reviewed journals. Your writing is precise, formal, and deeply analytical.

You write academic papers that:
- Follow established conventions (APA 7th edition in-text citations by default)
- Use formal third-person academic register ("This study investigates…", "The evidence suggests…")
- Include specific data, statistics, and properly attributed claims
- Maintain logical flow across sections with clear transitional language
- Balance empirical evidence with critical analysis and nuanced interpretation
- Acknowledge limitations, gaps, and areas for further research
- Are written at a graduate / doctoral level suitable for journal submission

Each section must be substantive:
- Abstract: 250–300 words structured (Background / Objective / Method / Findings / Conclusions)
- Introduction: 500–700 words with problem statement, significance, and paper structure
- Literature Review: 700–900 words surveying existing knowledge and identifying gaps
- Methodology: 400–600 words explaining the AI-powered research approach and data collection
- Findings: 700–1000 words presenting key discoveries, data, and analysis
- Conclusion: 400–500 words synthesizing insights, implications, and future directions
- References: formatted list of all cited sources

Total target: 3500–5000 words across the full paper.`;

// ─── Main agent function ──────────────────────────────────────────────────────

/**
 * Generate a full academic paper from the completed research pipeline.
 *
 * @param input      Original user research input (query, depth, focusAreas)
 * @param plan       The research plan produced by plannerAgent
 * @param analysis   Facts, statistics, trends from analysisAgent
 * @param factCheck  Verified facts and reliability score from factCheckerAgent
 * @param searchBatches  Raw web search results for citations
 * @param report     The completed standard report (for additional context)
 * @param citationStyle  Preferred academic citation format (default: 'apa')
 */
export async function runAcademicPaperAgent(
  input: ResearchInput,
  plan: ResearchPlan,
  analysis: AnalysisOutput,
  factCheck: FactCheckOutput,
  searchBatches: SearchBatch[],
  report: ResearchReport,
  citationStyle: AcademicCitationStyle = 'apa'
): Promise<{ output: AcademicAgentOutput; citations: Citation[]; wordCount: number; pageEstimate: number }> {

  // ── Build citations list ────────────────────────────────────────────────────
  // Reuse citations from the completed report (already deduplicated)
  const citations: Citation[] = Array.isArray(report.citations) ? report.citations : [];

  // ── Build research context for the prompt ──────────────────────────────────
  const verifiedFacts  = Array.isArray(factCheck?.verifiedFacts)  ? factCheck.verifiedFacts  : [];
  const statistics     = Array.isArray(analysis?.statistics)      ? analysis.statistics      : [];
  const trends         = Array.isArray(analysis?.trends)          ? analysis.trends          : [];
  const companies      = Array.isArray(analysis?.companies)       ? analysis.companies       : [];
  const keyThemes      = Array.isArray(analysis?.keyThemes)       ? analysis.keyThemes       : [];
  const subtopics      = Array.isArray(plan?.subtopics)           ? plan.subtopics           : [];
  const researchGoals  = Array.isArray(plan?.researchGoals)       ? plan.researchGoals       : [];
  const keyFindings    = Array.isArray(report?.keyFindings)       ? report.keyFindings       : [];
  const futurePreds    = Array.isArray(report?.futurePredictions) ? report.futurePredictions : [];
  const contradictions = Array.isArray(analysis?.contradictions)  ? analysis.contradictions  : [];

  // Build a condensed citation reference list for in-text use
  const citationRef = citations
    .slice(0, 20)
    .map((c, i) => `[${i + 1}] ${c.source ?? 'Unknown'} (${c.date ?? 'n.d.'}) — "${c.title}"`)
    .join('\n');

  const contextBlock = `
RESEARCH TOPIC: ${plan?.topic ?? input.query}
DEPTH: ${input.depth.toUpperCase()}
RESEARCH GOALS: ${researchGoals.join(' | ')}
SUBTOPICS COVERED: ${subtopics.join(', ')}
KEY THEMES: ${keyThemes.join(', ')}
KEY COMPANIES / ENTITIES: ${companies.join(', ')}
RELIABILITY SCORE: ${factCheck?.reliabilityScore ?? 'N/A'}/10
ANALYST NOTES: ${factCheck?.notes ?? 'None'}

VERIFIED FACTS (top 12):
${verifiedFacts.slice(0, 12).map((f, i) => `${i + 1}. ${f?.claim ?? ''} [Source: ${f?.source ?? 'unknown'}]`).join('\n')}

KEY STATISTICS (top 10):
${statistics.slice(0, 10).map((s, i) => `${i + 1}. ${s?.value ?? ''}: ${s?.context ?? ''} [${s?.source ?? ''}]`).join('\n')}

IDENTIFIED TRENDS:
${trends.map((t) => `• [${(t?.direction ?? '').toUpperCase()}] ${t?.trend ?? ''} — ${t?.evidence ?? ''}`).join('\n')}

KEY FINDINGS FROM STANDARD REPORT:
${keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

FUTURE PREDICTIONS:
${futurePreds.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CONTRADICTIONS / GAPS IDENTIFIED:
${contradictions.length > 0 ? contradictions.map((c, i) => `${i + 1}. ${c}`).join('\n') : 'None identified'}

AVAILABLE CITATIONS (use as [N] in text):
${citationRef || 'No citations available'}`;

  // ── JSON schema description for the prompt ──────────────────────────────────
  const sectionSchema = `
{
  "title":          "string — section heading e.g. '1. Introduction'",
  "type":           "one of: abstract | introduction | literature_review | methodology | findings | conclusion | references",
  "content":        "string — full prose content (may be multiple paragraphs separated by \\n\\n)",
  "subsections": [
    {
      "title":   "string — subsection heading e.g. '1.1 Background and Context'",
      "content": "string — prose content for this subsection"
    }
  ],
  "citationIds": ["c1", "c2"]
}`;

  const userPrompt = `Write a complete, publication-quality academic research paper on the following topic.
Use all available research intelligence provided below to produce a thorough, evidence-based paper.

${contextBlock}

Citation style: ${citationStyle.toUpperCase()}
For in-text citations use the format (AuthorLastName, Year) for APA, or [N] for IEEE / numbered styles.
Map citation numbers to the AVAILABLE CITATIONS list above.

Return ONLY a single valid JSON object with NO markdown fences, NO preamble:
{
  "title": "Full academic paper title (specific, informative, ~15 words)",
  "runningHead": "SHORT RUNNING HEAD ≤ 50 CHARS — ALL CAPS",
  "abstract": "Single-paragraph structured abstract 250-300 words covering: Background, Objective, Methodology, Key Findings, and Conclusions. Do NOT include subsections in abstract.",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "sections": [
    ${sectionSchema},
    "... (repeat for each of the 7 sections)"
  ]
}

MANDATORY SECTION ORDER AND REQUIREMENTS:

1. ABSTRACT (type: "abstract")
   - Title: "Abstract"
   - Single paragraph, 250-300 words
   - Structured: Background • Objective • Method • Findings • Conclusions
   - No subsections
   - NO in-text citations

2. INTRODUCTION (type: "introduction")
   - Title: "1. Introduction"
   - Main content: 3-4 paragraphs introducing the topic, its significance, and research gap
   - Subsections:
     * "1.1 Background and Context" — historical/conceptual foundation
     * "1.2 Research Objectives" — 3-4 specific objectives this paper addresses
     * "1.3 Paper Organization" — brief outline of section structure
   - Use in-text citations for all factual claims

3. LITERATURE REVIEW (type: "literature_review")
   - Title: "2. Literature Review"
   - Main content: 3-4 paragraphs synthesizing existing knowledge
   - Subsections:
     * "2.1 Theoretical Framework" — conceptual underpinnings
     * "2.2 Current State of Research" — what is already known
     * "2.3 Research Gaps and Limitations" — what remains unknown or contested
   - Critically analyze sources, not just summarize them
   - Use heavy in-text citations

4. METHODOLOGY (type: "methodology")
   - Title: "3. Methodology"
   - Main content: 2-3 paragraphs describing the AI-augmented research approach
   - Subsections:
     * "3.1 Research Design" — systematic literature review via AI agents
     * "3.2 Data Collection and Sources" — web search queries, databases used
     * "3.3 Analysis Framework" — how information was extracted and verified
   - Be transparent about AI-assisted nature of the research
   - Include the reliability score and source diversity metrics

5. FINDINGS (type: "findings")
   - Title: "4. Findings"
   - Main content: 3-4 paragraphs presenting the most critical discoveries
   - Subsections (create 3-4 thematic subsections based on the research, e.g.):
     * "4.1 [First Major Theme]"
     * "4.2 [Second Major Theme]"
     * "4.3 [Third Major Theme]"
     * "4.4 Statistical Evidence" — key data points and figures
   - Use all available statistics and verified facts
   - Provide critical analysis, not just description

6. CONCLUSION (type: "conclusion")
   - Title: "5. Conclusion"
   - Main content: 3-4 paragraphs synthesizing the overall contribution
   - Subsections:
     * "5.1 Summary of Key Contributions" — what this paper established
     * "5.2 Practical Implications" — real-world applications
     * "5.3 Limitations and Future Research" — honest assessment of scope and next steps
   - Connect back to objectives stated in Introduction

7. REFERENCES (type: "references")
   - Title: "References"
   - Content: Full formatted reference list in ${citationStyle.toUpperCase()} style
   - Format each reference on a new line as: "[N] AuthorLastName, A. B. (Year). Title. Source. URL"
   - Include ALL citations from the available citations list
   - No subsections

Write at a doctoral / journal submission level. Be specific with data. Use formal academic register throughout. Every factual claim must be supported by a citation.`;

  // ── Call the LLM ───────────────────────────────────────────────────────────
  const raw = await chatCompletionJSON<AcademicAgentOutput>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
    {
      temperature: 0.45,
      maxTokens:   6000,
    }
  );

  // ── Validate minimal structure ─────────────────────────────────────────────
  if (!raw?.title || !Array.isArray(raw?.sections) || raw.sections.length === 0) {
    throw new Error(
      'Academic Paper Agent returned an invalid response. Please try again.'
    );
  }

  // ── Hydrate section IDs ────────────────────────────────────────────────────
  const sections = hydrateSections(raw.sections);

  // ── Compute word count and page estimate ───────────────────────────────────
  const abstractWords = countWords(raw.abstract ?? '');
  const sectionWords  = totalWordCount(sections);
  const wordCount     = abstractWords + sectionWords;
  const pageEstimate  = Math.max(1, Math.round(wordCount / 250));

  return {
    output: {
      title:      raw.title,
      runningHead: raw.runningHead ?? raw.title.toUpperCase().slice(0, 50),
      abstract:   raw.abstract,
      keywords:   Array.isArray(raw.keywords) ? raw.keywords.slice(0, 8) : [],
      sections,
    },
    citations,
    wordCount,
    pageEstimate,
  };
}