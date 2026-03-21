// src/types/editor.ts
// Part 28 — Slide Canvas Editor: All type definitions
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PresentationSlide,
  PresentationTheme,
  SlideLayout,
  InfographicChart,
} from './index';

// ─── Editable Fields ──────────────────────────────────────────────────────────

/**
 * Every text field in a PresentationSlide that the editor can modify.
 * Maps directly to the field keys on PresentationSlide.
 */
export type EditableFieldKey =
  | 'title'
  | 'subtitle'
  | 'body'
  | 'badgeText'
  | 'sectionTag'
  | 'quote'
  | 'quoteAttribution'
  | 'speakerNotes';

export type TextAlignment = 'left' | 'center' | 'right';

/**
 * Per-field formatting overrides stored alongside slide content.
 * All fields are optional — absent means "use theme default".
 */
export interface FieldFormatting {
  bold?:       boolean;
  italic?:     boolean;
  /**
   * Font scale multiplier relative to the theme default.
   * Range: 0.7 (smaller) → 1.0 (default) → 2.0 (larger).
   * Steps: [0.7, 0.8, 0.9, 1.0, 1.15, 1.3, 1.5, 1.75, 2.0]
   */
  fontScale?:  number;
  alignment?:  TextAlignment;
  /** Hex color override for this field's text */
  color?:      string;
}

/** Map of EditableFieldKey → its formatting overrides for one slide */
export type SlideFieldFormats = Partial<Record<EditableFieldKey, FieldFormatting>>;

// ─── Additional Blocks ────────────────────────────────────────────────────────
// Blocks are appended below the main layout content of a slide.
// They can be dragged/reordered and deleted independently of the layout.

export type AdditionalBlockType =
  | 'image'
  | 'chart'
  | 'stat'
  | 'quote_block'
  | 'divider'
  | 'spacer'
  | 'icon';

export type DividerStyle  = 'solid' | 'dashed' | 'diamond';
export type SpacingLevel  = 'compact' | 'default' | 'spacious';

export interface ImageBlock {
  type:         'image';
  id:           string;
  uri:          string;
  caption?:     string;
  aspectRatio?: number; // width / height
}

export interface ChartBlock {
  type:  'chart';
  id:    string;
  chart: InfographicChart;
}

export interface StatBlock {
  type:   'stat';
  id:     string;
  value:  string;
  label:  string;
  unit?:  string;
  color?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface QuoteBlock {
  type:          'quote_block';
  id:            string;
  text:          string;
  attribution?:  string;
}

export interface DividerBlock {
  type:   'divider';
  id:     string;
  style:  DividerStyle;
  color?: string;
}

export interface SpacerBlock {
  type:   'spacer';
  id:     string;
  /** Height in logical pixels (dp) */
  height: number;
}

export interface IconBlock {
  type:      'icon';
  id:        string;
  iconName:  string; // Ionicons name
  size:      number;
  color?:    string;
  label?:    string;
}

export type AdditionalBlock =
  | ImageBlock
  | ChartBlock
  | StatBlock
  | QuoteBlock
  | DividerBlock
  | SpacerBlock
  | IconBlock;

// ─── Per-Slide Editor Overlay ─────────────────────────────────────────────────

/**
 * All editor-specific data for a single slide.
 * Stored in the `editor_data` JSONB array in Supabase (one entry per slide,
 * indexed to match the `slides` array).
 */
export interface SlideEditorData {
  /** Per-field text formatting overrides */
  fieldFormats?:     SlideFieldFormats;
  /** Extra content blocks appended below the main layout */
  additionalBlocks?: AdditionalBlock[];
  /** Background color override (replaces theme background for this slide) */
  backgroundColor?:  string;
  /** Spacing density for this slide */
  spacing?:          SpacingLevel;
}

/** A PresentationSlide enriched with optional editor overlay data */
export interface EditableSlide extends PresentationSlide {
  editorData?: SlideEditorData;
}

// ─── AI Editing ───────────────────────────────────────────────────────────────

export type AIRewriteStyle = 'shorter' | 'formal' | 'simpler' | 'punchier';

export interface AIRewriteOption {
  id:          AIRewriteStyle;
  label:       string;
  description: string;
  icon:        string;
  gradient:    readonly [string, string];
  /** Credit cost per rewrite */
  cost:        number;
}

export interface AILayoutSuggestion {
  suggestedLayout: SlideLayout;
  reason:          string;
}

export interface AIGenerateSlideRequest {
  description:    string;
  insertAfterIdx: number;
}

// ─── Font System ──────────────────────────────────────────────────────────────

export type FontFamily = 'system' | 'serif' | 'mono' | 'rounded' | 'condensed';

export interface FontOption {
  id:          FontFamily;
  label:       string;
  description: string;
  /** React Native fontFamily value */
  rnFont:      string;
  /** pptxgenjs font name (for PPTX export) */
  pptxFont:    string;
}

// ─── Editor UI State ──────────────────────────────────────────────────────────

export type EditorTool = 'select' | 'design' | 'blocks' | 'ai';

export type EditorPanel =
  | 'none'
  | 'text_edit'
  | 'formatting'
  | 'layout_switcher'
  | 'color_picker'
  | 'accent_picker'
  | 'theme_switcher'
  | 'font_picker'
  | 'spacing'
  | 'block_inserter'
  | 'icon_picker'
  | 'chart_picker'
  | 'stat_picker'
  | 'ai_rewrite'
  | 'ai_generate_slide'
  | 'ai_layout_suggest';

/**
 * Context passed to the color picker so it knows what it's coloring.
 */
export type ColorPickerTarget =
  | { scope: 'slide_bg' }
  | { scope: 'accent' }
  | { scope: 'field'; fieldKey: EditableFieldKey }
  | { scope: 'block'; blockId: string };

export interface SlideEditorState {
  slides:              EditableSlide[];
  activeSlideIndex:    number;
  selectedField:       EditableFieldKey | null;
  editingText:         string;
  activePanel:         EditorPanel;
  colorPickerTarget:   ColorPickerTarget | null;
  activeTool:          EditorTool;
  fontFamily:          FontFamily;
  isDirty:             boolean;
  isSaving:            boolean;
  saveError:           string | null;
  isAIProcessing:      boolean;
  aiProcessingLabel:   string;
  layoutSuggestion:    AILayoutSuggestion | null;
  /**
   * Undo/redo stacks — each entry is a snapshot of the full slides array.
   * Max depth: 20 steps.
   */
  undoStack:           EditableSlide[][];
  redoStack:           EditableSlide[][];
}

// ─── Saved Editor Payload ─────────────────────────────────────────────────────

/** Shape written to / read from Supabase presentations table */
export interface SavedEditorPayload {
  slides:        EditableSlide[];
  /** Parallel array — index i = editor data for slide i */
  editor_data:   SlideEditorData[];
  font_family:   FontFamily;
  ai_edits_count: number;
}