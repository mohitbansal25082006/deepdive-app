// src/services/agents/paperSectionAgent.ts
// Part 38 — AI writing tools for academic paper sections.
// Part 38b — Added runPaperSubsectionAI, generateSubsectionTitleAI.
// Part 38c FIX #5 — Added generateSubsectionBodyAI: generates both title AND
//                   body content for a new AI subsection.
// ─────────────────────────────────────────────────────────────────────────────

import { chatCompletion } from '../openaiClient';
import type {
  AcademicSection,
  AcademicSubsection,
  AcademicCitationStyle,
  Citation,
} from '../../types';
import type { PaperAITool } from '../../types/paperEditor';

// ─── System prompts ───────────────────────────────────────────────────────────

const BASE_SYSTEM = `You are a senior academic researcher and expert scientific writer with 20+ years of peer-reviewed publication experience.

CRITICAL OUTPUT RULES:
- Return ONLY the rewritten section content as plain prose paragraphs separated by blank lines.
- Do NOT include the section title or heading in your response.
- Do NOT add markdown formatting (no ##, no **, no bullets unless they were in the original).
- Do NOT add preamble, explanation, or meta-commentary.
- Maintain the original language (English → English).
- Use formal third-person academic register throughout.
- Every factual claim must retain or improve citation support.`;

function formatCitationsForPrompt(citations: Citation[]): string {
  if (!citations.length) return 'No citations available.';
  return citations
    .slice(0, 15)
    .map((c, i) => `[${i + 1}] ${c.source ?? 'Unknown'} (${c.date ? new Date(c.date).getFullYear() : 'n.d.'}) — "${c.title}" — ${c.url}`)
    .join('\n');
}

function sectionContext(section: AcademicSection): string {
  const subsectionsText = (section.subsections ?? [])
    .map(s => `### ${s.title}\n${s.content}`)
    .join('\n\n');
  return `SECTION TYPE: ${section.type}\nSECTION TITLE: ${section.title}\n\nCURRENT CONTENT:\n${section.content}${subsectionsText ? '\n\n' + subsectionsText : ''}`;
}

function subsectionContext(sub: AcademicSubsection, parentSection: AcademicSection): string {
  return `PARENT SECTION TYPE: ${parentSection.type}\nPARENT SECTION TITLE: ${parentSection.title}\nSUBSECTION TITLE: ${sub.title}\n\nCURRENT SUBSECTION CONTENT:\n${sub.content || '(empty)'}`;
}

// ─── Section-level tools ──────────────────────────────────────────────────────

async function expandSection(section: AcademicSection, citations: Citation[]): Promise<string> {
  const prompt = `${sectionContext(section)}

AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

TASK: Expand this section to be more comprehensive and in-depth. Add:
- More detailed analysis and critical interpretation
- Additional supporting evidence from the available citations
- Stronger logical flow between ideas
- More nuanced discussion of implications

Target: increase the word count by 40-60%. Preserve all existing key points.
Return ONLY the rewritten prose. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.45, maxTokens: 1200 },
  );
}

async function shortenSection(section: AcademicSection): Promise<string> {
  const prompt = `${sectionContext(section)}

TASK: Condense this section to approximately 60-70% of its current length. 
- Retain ALL key findings, arguments, and conclusions
- Remove redundant phrasing and unnecessary elaboration
- Keep the most impactful statistics and citations
- Maintain academic tone and logical flow

Return ONLY the condensed prose. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.35, maxTokens: 800 },
  );
}

async function formalizeSection(section: AcademicSection): Promise<string> {
  const prompt = `${sectionContext(section)}

TASK: Rewrite this section in strict academic register:
- Replace informal language with formal academic equivalents
- Use passive voice where appropriate
- Replace first-person with third-person constructions
- Ensure hedging language for claims ("suggests", "indicates", "appears to")
- Strengthen transitions between ideas
- Remove conversational phrases

Preserve all facts, citations, and key arguments. Same length or slightly more formal.
Return ONLY the rewritten prose. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.3, maxTokens: 1000 },
  );
}

async function fixCitations(
  section:   AcademicSection,
  citations: Citation[],
  style:     AcademicCitationStyle,
): Promise<string> {
  const styleGuide: Record<AcademicCitationStyle, string> = {
    apa:     'APA 7th Edition: (AuthorLastName, Year) for in-text',
    mla:     'MLA 9th Edition: (AuthorLastName Page#) for in-text',
    chicago: 'Chicago 17th Edition: (AuthorLastName Year) for author-date',
    ieee:    'IEEE Style: [N] numbered references inline, e.g. [1], [2]',
  };

  const prompt = `${sectionContext(section)}

AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

CITATION STYLE: ${style.toUpperCase()} — ${styleGuide[style]}

TASK: Rewrite this section ensuring ALL in-text citations follow the ${style.toUpperCase()} format correctly.
- Fix any incorrectly formatted citations
- Add proper citations where claims lack attribution
- Remove duplicate citation markers
- Map citations to the AVAILABLE CITATIONS list above

Return ONLY the rewritten prose with corrected citations. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.25, maxTokens: 1000 },
  );
}

async function addCounterargument(section: AcademicSection, citations: Citation[]): Promise<string> {
  const prompt = `${sectionContext(section)}

AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

TASK: Add a well-reasoned counterargument paragraph to this section.
- Identify the strongest opposing viewpoint to this section's main claims
- Write a new paragraph (2-4 sentences) that acknowledges this counterargument fairly
- Immediately follow it with a rebuttal that reinforces the original argument
- Integrate naturally at the most logical position in the text

Return the FULL section content with the counterargument paragraph integrated.
No heading. No explanation. Just the complete rewritten section prose.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.5, maxTokens: 1000 },
  );
}

async function regenerateSection(
  section:    AcademicSection,
  citations:  Citation[],
  paperTitle: string,
  keywords:   string[],
): Promise<string> {
  const prompt = `PAPER TITLE: "${paperTitle}"
PAPER KEYWORDS: ${keywords.join(', ')}
SECTION TYPE: ${section.type}
SECTION TITLE: ${section.title}

EXISTING CONTENT (for reference — replace this entirely):
${section.content}

AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

TASK: Write a completely new version of this section from scratch.
Requirements:
- Same section type and title focus
- ${section.type === 'abstract' ? '250-300 words' : section.type === 'references' ? 'Full reference list' : '400-900 words depending on complexity'}
- Formal academic register
- Cite from the available citations list
- Stronger analytical depth than the original

Return ONLY the new section prose. No heading. No explanation. No markdown.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.5, maxTokens: 1500 },
  );
}

// ─── Public section dispatcher ────────────────────────────────────────────────

export async function runPaperSectionAI(
  tool:       PaperAITool,
  section:    AcademicSection,
  citations:  Citation[],
  citStyle:   AcademicCitationStyle,
  paperTitle: string,
  keywords:   string[],
): Promise<string> {
  switch (tool) {
    case 'expand':              return expandSection(section, citations);
    case 'shorten':             return shortenSection(section);
    case 'formalize':           return formalizeSection(section);
    case 'fix_citations':       return fixCitations(section, citations, citStyle);
    case 'add_counterargument': return addCounterargument(section, citations);
    case 'regenerate':          return regenerateSection(section, citations, paperTitle, keywords);
    default:
      throw new Error(`Unknown paper AI tool: ${tool}`);
  }
}

// ─── Subsection-level tools ───────────────────────────────────────────────────

async function expandSubsection(
  sub:       AcademicSubsection,
  parent:    AcademicSection,
  citations: Citation[],
): Promise<string> {
  const prompt = `${subsectionContext(sub, parent)}

AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

TASK: Expand this subsection to be more comprehensive. Add more detailed analysis,
additional supporting evidence, and stronger logical flow.
Target: increase word count by 40-60%. Preserve all existing key points.
Return ONLY the rewritten prose. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.45, maxTokens: 800 },
  );
}

async function shortenSubsection(sub: AcademicSubsection, parent: AcademicSection): Promise<string> {
  const prompt = `${subsectionContext(sub, parent)}

TASK: Condense this subsection to approximately 60-70% of its current length.
Retain all key findings and arguments. Remove redundant phrasing.
Return ONLY the condensed prose. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.35, maxTokens: 600 },
  );
}

async function formalizeSubsection(sub: AcademicSubsection, parent: AcademicSection): Promise<string> {
  const prompt = `${subsectionContext(sub, parent)}

TASK: Rewrite this subsection in strict academic register. Replace informal language,
use passive voice, hedging language ("suggests", "indicates"), remove conversational phrases.
Return ONLY the rewritten prose. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.3, maxTokens: 700 },
  );
}

async function fixCitationsSubsection(
  sub:       AcademicSubsection,
  parent:    AcademicSection,
  citations: Citation[],
  style:     AcademicCitationStyle,
): Promise<string> {
  const styleGuide: Record<AcademicCitationStyle, string> = {
    apa:     'APA 7th: (AuthorLastName, Year)',
    mla:     'MLA 9th: (AuthorLastName Page#)',
    chicago: 'Chicago: (AuthorLastName Year)',
    ieee:    'IEEE: [N] numbered',
  };

  const prompt = `${subsectionContext(sub, parent)}
AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}
CITATION STYLE: ${style.toUpperCase()} — ${styleGuide[style]}

TASK: Rewrite this subsection ensuring all in-text citations follow ${style.toUpperCase()} format.
Return ONLY the rewritten prose. No heading. No explanation.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.25, maxTokens: 700 },
  );
}

async function addCounterargumentSubsection(
  sub:       AcademicSubsection,
  parent:    AcademicSection,
  citations: Citation[],
): Promise<string> {
  const prompt = `${subsectionContext(sub, parent)}
AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

TASK: Add a brief counterargument (1-2 sentences acknowledging an opposing view + brief rebuttal).
Return the FULL subsection content with the counterargument integrated. No heading.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.5, maxTokens: 700 },
  );
}

async function regenerateSubsection(
  sub:        AcademicSubsection,
  parent:     AcademicSection,
  citations:  Citation[],
  paperTitle: string,
  keywords:   string[],
): Promise<string> {
  const prompt = `PAPER TITLE: "${paperTitle}"
PAPER KEYWORDS: ${keywords.join(', ')}
${subsectionContext(sub, parent)}
AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

TASK: Write a completely new version of this subsection on the topic: "${sub.title}"
150-300 words. Formal academic register. Support with available citations.
Return ONLY the new prose. No heading. No markdown.`;

  return chatCompletion(
    [{ role: 'system', content: BASE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.5, maxTokens: 800 },
  );
}

// ─── Public subsection dispatcher ────────────────────────────────────────────

export async function runPaperSubsectionAI(
  tool:          PaperAITool,
  sub:           AcademicSubsection,
  parentSection: AcademicSection,
  citations:     Citation[],
  citStyle:      AcademicCitationStyle,
  paperTitle:    string,
  keywords:      string[],
): Promise<string> {
  switch (tool) {
    case 'expand':              return expandSubsection(sub, parentSection, citations);
    case 'shorten':             return shortenSubsection(sub, parentSection);
    case 'formalize':           return formalizeSubsection(sub, parentSection);
    case 'fix_citations':       return fixCitationsSubsection(sub, parentSection, citations, citStyle);
    case 'add_counterargument': return addCounterargumentSubsection(sub, parentSection, citations);
    case 'regenerate':          return regenerateSubsection(sub, parentSection, citations, paperTitle, keywords);
    default:
      throw new Error(`Unknown paper AI tool: ${tool}`);
  }
}

// ─── Subsection title generator ───────────────────────────────────────────────

const TITLE_SYSTEM = `You are a senior academic editor. Write concise, precise academic subsection titles.

CRITICAL OUTPUT RULES:
- Return ONLY the subsection title — nothing else.
- No quotes, no punctuation at the end, no explanation.
- 3-8 words, title-case.
- Must accurately describe the content and fit within the parent section's scope.`;

export async function generateSubsectionTitleAI(
  subsectionContent:  string,
  parentSectionTitle: string,
  parentSectionType:  string,
): Promise<string> {
  if (!subsectionContent?.trim()) return 'New Subsection';

  const prompt = `PARENT SECTION: "${parentSectionTitle}" (type: ${parentSectionType})

SUBSECTION CONTENT (first 600 chars):
${subsectionContent.slice(0, 600)}

Generate a precise academic title (3-8 words, title-case) for this subsection.
Return ONLY the title. No quotes. No period at the end.`;

  const result = await chatCompletion(
    [{ role: 'system', content: TITLE_SYSTEM }, { role: 'user', content: prompt }],
    { temperature: 0.3, maxTokens: 30 },
  );

  return result.replace(/^["'`]+|["'`]+$/g, '').replace(/\*+/g, '').trim();
}

// ─── FIX #5: Generate full subsection (title + body) ─────────────────────────

const SUBSECTION_SYSTEM = `You are a senior academic researcher writing a new subsection for a peer-reviewed paper.

CRITICAL OUTPUT RULES:
- Return ONLY a valid JSON object with exactly two keys: "title" and "content".
- "title": 3-8 word title-case academic heading (no period at end).
- "content": 150-280 words of formal academic prose (plain text, no markdown, no heading repeated).
- Do NOT include preamble, explanation, or text outside the JSON.`;

export async function generateSubsectionBodyAI(
  parentSection: AcademicSection,
  citations:     Citation[],
  citStyle:      AcademicCitationStyle,
  paperTitle:    string,
  keywords:      string[],
  description?:  string,
): Promise<{ title: string; content: string } | null> {
  const existingSubtitles = (parentSection.subsections ?? [])
    .map(s => `"${s.title}"`)
    .join(', ');

  const prompt = `PAPER TITLE: "${paperTitle}"
PAPER KEYWORDS: ${keywords.join(', ')}
PARENT SECTION: "${parentSection.title}" (type: ${parentSection.type})
${existingSubtitles ? `EXISTING SUBSECTIONS: ${existingSubtitles} (do NOT duplicate these topics)` : ''}
${description ? `USER DIRECTION: ${description}` : ''}

AVAILABLE CITATIONS:\n${formatCitationsForPrompt(citations)}

Generate a new academic subsection for this section.
Requirements:
- Title: 3-8 words, title-case, no period.
- Content: 150-280 words, formal academic prose, third-person, cite from available citations.
- Topic must complement the parent section and not duplicate existing subsections.
- No markdown formatting in content.

Return ONLY a JSON object: {"title": "...", "content": "..."}`;

  try {
    const raw = await chatCompletion(
      [{ role: 'system', content: SUBSECTION_SYSTEM }, { role: 'user', content: prompt }],
      { temperature: 0.5, maxTokens: 500 },
    );

    const clean = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const parsed = JSON.parse(clean);
    if (!parsed.title || !parsed.content) return null;

    return {
      title:   parsed.title.replace(/^["'`]+|["'`]+$/g, '').trim(),
      content: parsed.content.trim(),
    };
  } catch (err) {
    console.warn('[paperSectionAgent] generateSubsectionBodyAI error:', err);
    return null;
  }
}