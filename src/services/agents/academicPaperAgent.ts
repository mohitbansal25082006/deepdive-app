// src/services/agents/academicPaperAgent.ts
// Part 7 — AI Academic Paper Mode
// Part 53G — accepts an AbortSignal and passes it to the LLM call.
// Part 56 — Cost: routed to STANDARD tier (gpt-4.1-mini). A full doctoral-level
//   paper is the one place quality matters most, and gpt-4.1-mini matches gpt-4o
//   on long-form academic writing for ~6x less. maxTokens trimmed 6000→4500
//   (3500–5000 words target fits well under 4500 output tokens with structured JSON).

import { chatCompletionJSON } from '../openaiClient';
import { modelFor }           from '../../constants/aiModels';
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

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

export async function runAcademicPaperAgent(
  input: ResearchInput,
  plan: ResearchPlan,
  analysis: AnalysisOutput,
  factCheck: FactCheckOutput,
  searchBatches: SearchBatch[],
  report: ResearchReport,
  citationStyle: AcademicCitationStyle = 'apa',
  signal?: AbortSignal,            // ── Part 53G ──
): Promise<{ output: AcademicAgentOutput; citations: Citation[]; wordCount: number; pageEstimate: number }> {

  const citations: Citation[] = Array.isArray(report.citations) ? report.citations : [];

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
   - Title: "Abstract"; single paragraph, 250-300 words
   - Structured: Background • Objective • Method • Findings • Conclusions
   - No subsections; NO in-text citations

2. INTRODUCTION (type: "introduction")
   - Title: "1. Introduction"; 3-4 paragraphs introducing topic, significance, research gap
   - Subsections: "1.1 Background and Context", "1.2 Research Objectives", "1.3 Paper Organization"
   - Use in-text citations for all factual claims

3. LITERATURE REVIEW (type: "literature_review")
   - Title: "2. Literature Review"; 3-4 paragraphs synthesizing existing knowledge
   - Subsections: "2.1 Theoretical Framework", "2.2 Current State of Research", "2.3 Research Gaps and Limitations"
   - Critically analyze sources; use heavy in-text citations

4. METHODOLOGY (type: "methodology")
   - Title: "3. Methodology"; 2-3 paragraphs on the AI-augmented research approach
   - Subsections: "3.1 Research Design", "3.2 Data Collection and Sources", "3.3 Analysis Framework"
   - Be transparent about the AI-assisted nature; include reliability score + source diversity

5. FINDINGS (type: "findings")
   - Title: "4. Findings"; 3-4 paragraphs presenting critical discoveries
   - Subsections (3-4 thematic): e.g. "4.1 [Theme]", "4.2 [Theme]", "4.3 [Theme]", "4.4 Statistical Evidence"
   - Use all available statistics and verified facts; provide critical analysis

6. CONCLUSION (type: "conclusion")
   - Title: "5. Conclusion"; 3-4 paragraphs synthesizing the contribution
   - Subsections: "5.1 Summary of Key Contributions", "5.2 Practical Implications", "5.3 Limitations and Future Research"
   - Connect back to the objectives stated in the Introduction

7. REFERENCES (type: "references")
   - Title: "References"; full formatted list in ${citationStyle.toUpperCase()} style
   - Each reference on a new line: "[N] AuthorLastName, A. B. (Year). Title. Source. URL"
   - Include ALL citations; no subsections

Write at a doctoral / journal submission level. Be specific with data. Use formal
academic register throughout. Every factual claim must be supported by a citation.`;

  const raw = await chatCompletionJSON<AcademicAgentOutput>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userPrompt },
    ],
    {
      temperature: 0.45,
      // Part 57: 4500 truncated the paper mid-JSON → "Failed to parse OpenAI
      // JSON" crash. A 3500–5000 word paper plus JSON structure needs ~7k–9k
      // output tokens; 12000 leaves headroom. gpt-4.1-mini supports it, and the
      // parser now also repairs any rare truncation as a fallback.
      maxTokens:   12000,
      signal,                            // ── Part 53G ──
      model: modelFor('academicPaper'),  // ← Part 56: STANDARD
    }
  );

  if (!raw?.title || !Array.isArray(raw?.sections) || raw.sections.length === 0) {
    throw new Error(
      'Academic Paper Agent returned an invalid response. Please try again.'
    );
  }

  const sections = hydrateSections(raw.sections);

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