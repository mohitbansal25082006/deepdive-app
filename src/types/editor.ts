// src/types/editor.ts
// Part 29 — FULL REWRITE
// Changes from Part 28:
//   1. Removed BlockInserter/EditorTool 'blocks' — blocks tab is gone
//   2. Added InlineBlockPosition for placing blocks inside slide canvas
//   3. Added SlideTemplate & TemplateCategory for the 20+ template library
//   4. EditorTool: 'blocks' → removed, now 'template' added
//   5. EditorPanel: 'block_inserter' removed, 'template_library' added
//   6. AdditionalBlock now carries optional position: InlineBlockPosition
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PresentationSlide,
  PresentationTheme,
  SlideLayout,
  InfographicChart,
} from './index';

// ─── Editable Fields ──────────────────────────────────────────────────────────

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

export interface FieldFormatting {
  bold?:       boolean;
  italic?:     boolean;
  /**
   * Font scale multiplier relative to the theme default.
   * Range: 0.7 → 2.0
   */
  fontScale?:  number;
  alignment?:  TextAlignment;
  /** Hex color override for this field's text */
  color?:      string;
}

/** Map of EditableFieldKey → its formatting overrides for one slide */
export type SlideFieldFormats = Partial<Record<EditableFieldKey, FieldFormatting>>;

// ─── Inline Block Position ────────────────────────────────────────────────────
// Blocks can now be positioned INSIDE the slide canvas, not just stacked below.
// position: 'inline' = old stacked-below behaviour (default, backward-compat)
// position: 'overlay' = absolutely placed inside the 320×180 slide canvas

export type InlineBlockPositionType = 'inline' | 'overlay';

export interface InlineBlockPosition {
  type:   InlineBlockPositionType;
  /** For overlay: 0–1 fraction of slide width  (default 0.05) */
  xFrac?: number;
  /** For overlay: 0–1 fraction of slide height (default 0.5) */
  yFrac?: number;
  /** For overlay: 0–1 fraction of slide width  (default 0.9) */
  wFrac?: number;
}

// ─── Additional Blocks ────────────────────────────────────────────────────────

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
  aspectRatio?: number;
  /** Part 29: inline positioning */
  position?:   InlineBlockPosition;
}

export interface ChartBlock {
  type:     'chart';
  id:       string;
  chart:    InfographicChart;
  position?: InlineBlockPosition;
}

export interface StatBlock {
  type:     'stat';
  id:       string;
  value:    string;
  label:    string;
  unit?:    string;
  color?:   string;
  trend?:   'up' | 'down' | 'flat';
  position?: InlineBlockPosition;
}

export interface QuoteBlock {
  type:          'quote_block';
  id:            string;
  text:          string;
  attribution?:  string;
  position?:    InlineBlockPosition;
}

export interface DividerBlock {
  type:     'divider';
  id:       string;
  style:    DividerStyle;
  color?:   string;
  position?: InlineBlockPosition;
}

export interface SpacerBlock {
  type:     'spacer';
  id:       string;
  /** Height in logical pixels (dp) */
  height:   number;
  position?: InlineBlockPosition;
}

export interface IconBlock {
  type:      'icon';
  id:        string;
  iconName:  string;
  size:      number;
  color?:    string;
  label?:    string;
  position?: InlineBlockPosition;
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

export interface SlideEditorData {
  fieldFormats?:     SlideFieldFormats;
  additionalBlocks?: AdditionalBlock[];
  backgroundColor?:  string;
  spacing?:          SpacingLevel;
}

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
  rnFont:      string;
  pptxFont:    string;
}

// ─── Editor UI State ──────────────────────────────────────────────────────────

/**
 * Part 29: removed 'blocks' tool tab.
 * Now: select | design | ai | template
 */
export type EditorTool = 'select' | 'design' | 'ai' | 'template';

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
  | 'icon_picker'
  | 'chart_picker'
  | 'stat_picker'
  | 'ai_rewrite'
  | 'ai_generate_slide'
  | 'ai_layout_suggest'
  | 'block_inserter'      // kept for inline-block insertion access from canvas
  | 'template_library';   // Part 29: new template library panel

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
  undoStack:           EditableSlide[][];
  redoStack:           EditableSlide[][];
}

// ─── Saved Editor Payload ─────────────────────────────────────────────────────

export interface SavedEditorPayload {
  slides:         EditableSlide[];
  editor_data:    SlideEditorData[];
  font_family:    FontFamily;
  ai_edits_count: number;
}

// ─── Part 29: Template Library ────────────────────────────────────────────────

export type TemplateCategory =
  | 'business'
  | 'pitch_deck'
  | 'academic'
  | 'creative'
  | 'minimal'
  | 'data_driven'
  | 'storytelling'
  | 'corporate';

export interface SlideTemplateSlide {
  layout:            SlideLayout;
  title:             string;
  subtitle?:         string;
  body?:             string;
  bullets?:          string[];
  stats?:            Array<{ value: string; label: string; color?: string }>;
  quote?:            string;
  quoteAttribution?: string;
  sectionTag?:       string;
  badgeText?:        string;
  speakerNotes?:     string;
  /** Relative accent color — will be remapped to chosen theme primary */
  accentColor?:      string;
  icon?:             string;
}

/**
 * A complete slide template: 1 or more pre-designed slides that can be
 * inserted into the active deck.
 */
export interface SlideTemplate {
  id:           string;
  name:         string;
  description:  string;
  category:     TemplateCategory;
  /** Icon shown in the library grid */
  icon:         string;
  /** Gradient used for the card header */
  gradient:     readonly [string, string];
  /** Tag shown on card e.g. "Popular", "New" */
  tag?:         string;
  /** Number of slides in this template */
  slideCount:   number;
  /** The actual slide definitions */
  slides:       SlideTemplateSlide[];
  /** Suggested theme to pair with this template */
  suggestedTheme?: PresentationTheme;
}

export interface TemplateCategoryMeta {
  id:    TemplateCategory;
  label: string;
  emoji: string;
  description: string;
}