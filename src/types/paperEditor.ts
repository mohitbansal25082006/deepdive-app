// src/types/paperEditor.ts
// Part 38 — Academic Paper Editor types
// Part 41.8 — Added section management types:
//   SectionInsertPosition, NewSectionConfig, SectionManagementAction
//   Added 'paper_ai_generate_section' to PaperAITool
// ─────────────────────────────────────────────────────────────────────────────

import type { AcademicSection, AcademicCitationStyle, Citation } from './index';

// ─── Formatting ───────────────────────────────────────────────────────────────

export type TextFormatting = {
  bold?:       boolean;
  italic?:     boolean;
  underline?:  boolean;
  blockQuote?: boolean;
};

export type SectionEditorData = {
  sectionId:   string;
  formatting?: TextFormatting;
};

export type PaperEditorData = {
  sectionOverrides?: SectionEditorData[];
};

// ─── AI Writing Tools ─────────────────────────────────────────────────────────

export type PaperAITool =
  | 'expand'
  | 'shorten'
  | 'formalize'
  | 'fix_citations'
  | 'add_counterargument'
  | 'regenerate'
  // Part 41.8: generate a full new section via AI
  | 'generate_section';

export const PAPER_AI_TOOL_COSTS: Record<PaperAITool, number> = {
  expand:              2,
  shorten:             1,
  formalize:           1,
  fix_citations:       1,
  add_counterargument: 2,
  regenerate:          3,
  generate_section:    4,
};

export const PAPER_AI_TOOL_LABELS: Record<PaperAITool, string> = {
  expand:              'Expand',
  shorten:             'Shorten',
  formalize:           'Formalize',
  fix_citations:       'Fix Citations',
  add_counterargument: 'Add Counterargument',
  regenerate:          'Regenerate Section',
  generate_section:    'Generate Section',
};

export const PAPER_AI_TOOL_ICONS: Record<PaperAITool, string> = {
  expand:              'expand-outline',
  shorten:             'contract-outline',
  formalize:           'business-outline',
  fix_citations:       'link-outline',
  add_counterargument: 'git-compare-outline',
  regenerate:          'refresh-circle-outline',
  generate_section:    'add-circle-outline',
};

export const PAPER_AI_TOOL_DESCRIPTIONS: Record<PaperAITool, string> = {
  expand:              'Rewrites section in more depth with additional analysis',
  shorten:             'Condenses section without losing key points',
  formalize:           'Adjusts tone to strict academic register',
  fix_citations:       'Re-formats inline citations to match chosen citation style',
  add_counterargument: 'Inserts a paragraph acknowledging opposing views',
  regenerate:          'Full AI rewrite of this entire section',
  generate_section:    'AI generates a complete new section with subsections',
};

export const PAPER_AI_TOOL_GRADIENTS: Record<PaperAITool, readonly [string, string]> = {
  expand:              ['#43E97B', '#38F9D7'],
  shorten:             ['#FFA726', '#FF7043'],
  formalize:           ['#29B6F6', '#0288D1'],
  fix_citations:       ['#6C63FF', '#8B5CF6'],
  add_counterargument: ['#FF6584', '#F093FB'],
  regenerate:          ['#AB47BC', '#7B1FA2'],
  generate_section:    ['#FF6584', '#FF8E53'],
};

// ─── Word count targets per section type ──────────────────────────────────────

export const SECTION_WORD_TARGETS: Record<string, { min: number; max: number }> = {
  abstract:          { min: 250, max: 300 },
  introduction:      { min: 500, max: 700 },
  literature_review: { min: 700, max: 900 },
  methodology:       { min: 400, max: 600 },
  findings:          { min: 700, max: 1000 },
  conclusion:        { min: 400, max: 500 },
  references:        { min: 0,   max: 9999 },
  // Custom sections get a generous default range
  custom:            { min: 300, max: 800 },
};

// ─── Part 41.8: Section Management ───────────────────────────────────────────

/**
 * Where to insert a new section relative to an existing section ID.
 * 'before' = insert before targetSectionId
 * 'after'  = insert after targetSectionId
 * 'start'  = insert at the very beginning
 * 'end'    = insert at the very end
 */
export type SectionInsertPosition =
  | { where: 'before'; targetSectionId: string }
  | { where: 'after';  targetSectionId: string }
  | { where: 'start' }
  | { where: 'end' };

/**
 * Config for creating a new section manually.
 */
export interface NewSectionConfig {
  title:       string;
  type:        string;    // 'custom' or one of the canonical AcademicSectionType values
  description: string;   // optional user hint for AI generation
  useAI:       boolean;
}

/**
 * AI output for a full section generation.
 */
export interface GeneratedSectionOutput {
  title:       string;
  type:        string;
  content:     string;
  subsections: Array<{ title: string; content: string }>;
}

// ─── Paper Version ────────────────────────────────────────────────────────────

export interface PaperVersion {
  id:            string;
  versionNumber: number;
  versionLabel:  string;
  wordCount:     number;
  createdAt:     string;
}

export interface PaperVersionFull extends PaperVersion {
  sections:  AcademicSection[];
  abstract:  string;
}

// ─── Citation Manager ─────────────────────────────────────────────────────────

export interface ManagedCitation extends Citation {
  isUnused?: boolean;
  isMissing?: boolean;
}

export interface CitationImportResult {
  title:     string;
  authors:   string;
  year:      string;
  publisher: string;
  url:       string;
  doi?:      string;
}

// ─── Export Config ────────────────────────────────────────────────────────────

export interface PaperExportConfig {
  institution?: string;
  authorName?:  string;
  fontSizePt?:  number;
  lineSpacing?: 'single' | 'double';
  pageNumbers?: boolean;
  coverPage?:   boolean;
}

// ─── Editor State ─────────────────────────────────────────────────────────────

export interface PaperEditorState {
  editingSectionId:    string | null;
  editingSubsectionId: string | null;
  editingField:        'content' | 'abstract' | null;
  isDirty:    boolean;
  isSaving:   boolean;
  lastSavedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
  isAIProcessing:    boolean;
  aiProcessingLabel: string;
  aiTool:            PaperAITool | null;
  error: string | null;
}