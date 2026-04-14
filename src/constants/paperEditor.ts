// src/constants/paperEditor.ts
// Part 38 — Academic Paper Editor constants
// Part 41.8 — Added generate_section to tools, SECTION_TYPE_OPTIONS for picker,
//              CUSTOM_SECTION_COLORS for dynamic section display
// ─────────────────────────────────────────────────────────────────────────────

import type { PaperAITool } from '../types/paperEditor';

export const PAPER_AI_CREDITS = {
  expand:              2,
  shorten:             1,
  formalize:           1,
  fix_citations:       1,
  add_counterargument: 2,
  regenerate:          3,
  generate_section:    4,
} as const satisfies Record<PaperAITool, number>;

// ─── AI tool ordering ─────────────────────────────────────────────────────────

export const PAPER_AI_TOOLS_PRIMARY: PaperAITool[] = [
  'expand', 'shorten', 'formalize',
];

export const PAPER_AI_TOOLS_SECONDARY: PaperAITool[] = [
  'fix_citations', 'add_counterargument', 'regenerate',
];

// ─── Section type labels ──────────────────────────────────────────────────────

export const SECTION_TYPE_LABELS: Record<string, string> = {
  abstract:          'Abstract',
  introduction:      '1. Introduction',
  literature_review: '2. Literature Review',
  methodology:       '3. Methodology',
  findings:          '4. Findings',
  conclusion:        '5. Conclusion',
  references:        'References',
  // Custom sections show their title directly (handled in component)
};

// ─── Part 41.8: Section type picker options ────────────────────────────────────

export interface SectionTypeOption {
  type:        string;
  label:       string;
  description: string;
  icon:        string;
  color:       string;
}

export const SECTION_TYPE_OPTIONS: SectionTypeOption[] = [
  {
    type:        'custom',
    label:       'Custom Section',
    description: 'Write a section on any topic with your own title',
    icon:        'create-outline',
    color:       '#6C63FF',
  },
  {
    type:        'discussion',
    label:       'Discussion',
    description: 'Interpret findings, compare with prior research',
    icon:        'chatbubbles-outline',
    color:       '#29B6F6',
  },
  {
    type:        'theoretical_framework',
    label:       'Theoretical Framework',
    description: 'Conceptual foundations and theoretical models',
    icon:        'git-network-outline',
    color:       '#43E97B',
  },
  {
    type:        'data_analysis',
    label:       'Data Analysis',
    description: 'Statistical analysis, results interpretation',
    icon:        'bar-chart-outline',
    color:       '#FFA726',
  },
  {
    type:        'limitations',
    label:       'Limitations',
    description: 'Study limitations, scope boundaries, constraints',
    icon:        'warning-outline',
    color:       '#FF6584',
  },
  {
    type:        'future_research',
    label:       'Future Research',
    description: 'Recommendations and research directions',
    icon:        'telescope-outline',
    color:       '#AB47BC',
  },
  {
    type:        'background',
    label:       'Background',
    description: 'Context setting, problem statement, motivation',
    icon:        'book-outline',
    color:       '#26C6DA',
  },
  {
    type:        'ethical_considerations',
    label:       'Ethical Considerations',
    description: 'Ethical issues, IRB, participant welfare',
    icon:        'shield-checkmark-outline',
    color:       '#66BB6A',
  },
  {
    type:        'acknowledgements',
    label:       'Acknowledgements',
    description: 'Funding, contributors, institutional support',
    icon:        'heart-outline',
    color:       '#EF9A9A',
  },
  {
    type:        'appendix',
    label:       'Appendix',
    description: 'Supplementary data, instruments, full tables',
    icon:        'attach-outline',
    color:       '#90A4AE',
  },
];

// ─── Part 41.8: Colors for canonical + custom section types ──────────────────

export const SECTION_TYPE_COLORS: Record<string, string> = {
  abstract:               '#6C63FF',
  introduction:           '#29B6F6',
  literature_review:      '#43E97B',
  methodology:            '#FFA726',
  findings:               '#FF6584',
  conclusion:             '#6C63FF',
  references:             '#5A5A7A',
  // Custom types
  discussion:             '#29B6F6',
  theoretical_framework:  '#43E97B',
  data_analysis:          '#FFA726',
  limitations:            '#FF6584',
  future_research:        '#AB47BC',
  background:             '#26C6DA',
  ethical_considerations: '#66BB6A',
  acknowledgements:       '#EF9A9A',
  appendix:               '#90A4AE',
  custom:                 '#6C63FF',
};

export const SECTION_TYPE_ICONS: Record<string, string> = {
  abstract:               'document-text-outline',
  introduction:           'compass-outline',
  literature_review:      'library-outline',
  methodology:            'construct-outline',
  findings:               'analytics-outline',
  conclusion:             'checkmark-circle-outline',
  references:             'link-outline',
  discussion:             'chatbubbles-outline',
  theoretical_framework:  'git-network-outline',
  data_analysis:          'bar-chart-outline',
  limitations:            'warning-outline',
  future_research:        'telescope-outline',
  background:             'book-outline',
  ethical_considerations: 'shield-checkmark-outline',
  acknowledgements:       'heart-outline',
  appendix:               'attach-outline',
  custom:                 'create-outline',
};

// ─── Canonical section types (cannot be deleted) ──────────────────────────────

export const CANONICAL_SECTION_TYPES = new Set([
  'abstract',
  'introduction',
  'literature_review',
  'methodology',
  'findings',
  'conclusion',
  'references',
]);

// ─── Max undo history ─────────────────────────────────────────────────────────

export const MAX_UNDO_STEPS = 20;

// ─── Auto-save debounce (ms) ──────────────────────────────────────────────────

export const AUTO_SAVE_DEBOUNCE_MS = 1500;

// ─── Citation style labels ────────────────────────────────────────────────────

export const CITATION_STYLE_LABELS = {
  apa:     'APA 7th',
  mla:     'MLA 9th',
  chicago: 'Chicago 17th',
  ieee:    'IEEE',
} as const;

// ─── Export font sizes ────────────────────────────────────────────────────────

export const EXPORT_FONT_SIZES = [10, 11, 12, 13, 14] as const;

// ─── Default export config ────────────────────────────────────────────────────

export const DEFAULT_EXPORT_CONFIG = {
  fontSizePt:  12,
  lineSpacing: 'double' as const,
  pageNumbers: true,
  coverPage:   true,
};