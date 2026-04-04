// src/types/paperEditor.ts
// Part 38 — Academic Paper Editor types
// ─────────────────────────────────────────────────────────────────────────────

import type { AcademicSection, AcademicCitationStyle, Citation } from './index';

// ─── Formatting ───────────────────────────────────────────────────────────────

export type TextFormatting = {
  bold?:       boolean;
  italic?:     boolean;
  underline?:  boolean;
  blockQuote?: boolean;
};

// Per-subsection or per-section text formatting overrides (stored in editor_data)
export type SectionEditorData = {
  sectionId:   string;
  formatting?: TextFormatting;
};

export type PaperEditorData = {
  sectionOverrides?: SectionEditorData[];
};

// ─── AI Writing Tools ─────────────────────────────────────────────────────────

export type PaperAITool =
  | 'expand'            // more depth (2 cr)
  | 'shorten'           // condense (1 cr)
  | 'formalize'         // academic tone (1 cr)
  | 'fix_citations'     // re-format citations to chosen style (1 cr)
  | 'add_counterargument' // insert opposing view paragraph (2 cr)
  | 'regenerate';       // full GPT-4o rewrite (3 cr)

export const PAPER_AI_TOOL_COSTS: Record<PaperAITool, number> = {
  expand:              2,
  shorten:             1,
  formalize:           1,
  fix_citations:       1,
  add_counterargument: 2,
  regenerate:          3,
};

export const PAPER_AI_TOOL_LABELS: Record<PaperAITool, string> = {
  expand:              'Expand',
  shorten:             'Shorten',
  formalize:           'Formalize',
  fix_citations:       'Fix Citations',
  add_counterargument: 'Add Counterargument',
  regenerate:          'Regenerate Section',
};

export const PAPER_AI_TOOL_ICONS: Record<PaperAITool, string> = {
  expand:              'expand-outline',
  shorten:             'contract-outline',
  formalize:           'business-outline',
  fix_citations:       'link-outline',
  add_counterargument: 'git-compare-outline',
  regenerate:          'refresh-circle-outline',
};

export const PAPER_AI_TOOL_DESCRIPTIONS: Record<PaperAITool, string> = {
  expand:              'Rewrites section in more depth with additional analysis',
  shorten:             'Condenses section without losing key points',
  formalize:           'Adjusts tone to strict academic register',
  fix_citations:       'Re-formats inline citations to match chosen citation style',
  add_counterargument: 'Inserts a paragraph acknowledging opposing views',
  regenerate:          'Full AI rewrite of this entire section',
};

export const PAPER_AI_TOOL_GRADIENTS: Record<PaperAITool, readonly [string, string]> = {
  expand:              ['#43E97B', '#38F9D7'],
  shorten:             ['#FFA726', '#FF7043'],
  formalize:           ['#29B6F6', '#0288D1'],
  fix_citations:       ['#6C63FF', '#8B5CF6'],
  add_counterargument: ['#FF6584', '#F093FB'],
  regenerate:          ['#AB47BC', '#7B1FA2'],
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
};

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
  isUnused?: boolean;  // referenced in list but not found in text
  isMissing?: boolean; // referenced in text but not in list
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
  fontSizePt?:  number;     // default 12
  lineSpacing?: 'single' | 'double'; // default double
  pageNumbers?: boolean;    // default true
  coverPage?:   boolean;    // default true
}

// ─── Editor State ─────────────────────────────────────────────────────────────

export interface PaperEditorState {
  // Editing
  editingSectionId:    string | null;
  editingSubsectionId: string | null;
  editingField:        'content' | 'abstract' | null;

  // Unsaved changes
  isDirty:    boolean;
  isSaving:   boolean;
  lastSavedAt: number | null;

  // Undo / redo
  canUndo: boolean;
  canRedo: boolean;

  // AI
  isAIProcessing:    boolean;
  aiProcessingLabel: string;
  aiTool:            PaperAITool | null;

  // Error
  error: string | null;
}