// src/types/editor.ts
// Part 41.9 — Added globalFontScale and globalTextColor to SlideEditorData
//             Added { scope: 'global_text_color' } to ColorPickerTarget
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

export type InlineBlockPositionType = 'inline' | 'overlay';

export interface InlineBlockPosition {
  type:   InlineBlockPositionType;
  xFrac?: number;
  yFrac?: number;
  wFrac?: number;
  hFrac?: number;
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
  onlineUrl?:    string;
  sourceQuery?:  string;
  caption?:     string;
  aspectRatio?: number;
  position?:    InlineBlockPosition;
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
  height:   number;
  position?: InlineBlockPosition;
}

export interface IconBlock {
  type:      'icon';
  id:        string;
  iconName:  string;
  iconifyId?: string;
  svgData?:   string;
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
  fieldFormats?:       SlideFieldFormats;
  additionalBlocks?:   AdditionalBlock[];
  backgroundColor?:    string;
  spacing?:            SpacingLevel;
  /**
   * Part 41.9: Global font scale multiplier (0.7–2.0).
   * Applied to all text in this slide. Per-field fontScale overrides this.
   */
  globalFontScale?:    number;
  /**
   * Part 41.9: Global text color override.
   * Overrides textPrimary/textSecondary for all text in this slide.
   * Per-field color overrides this. Undefined = use theme default.
   */
  globalTextColor?:    string;
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
  | 'block_inserter'
  | 'template_library'
  | 'template_history'
  | 'online_image_search'
  | 'iconify_picker';

export type ColorPickerTarget =
  | { scope: 'slide_bg' }
  | { scope: 'accent' }
  | { scope: 'field'; fieldKey: EditableFieldKey }
  | { scope: 'block'; blockId: string }
  | { scope: 'global_text_color' }; // Part 41.9

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
  accentColor?:      string;
  icon?:             string;
}

export interface SlideTemplate {
  id:           string;
  name:         string;
  description:  string;
  category:     TemplateCategory;
  icon:         string;
  gradient:     readonly [string, string];
  tag?:         string;
  slideCount:   number;
  slides:       SlideTemplateSlide[];
  suggestedTheme?: PresentationTheme;
}

export interface TemplateCategoryMeta {
  id:    TemplateCategory;
  label: string;
  emoji: string;
  description: string;
}

// ─── Part 30: Template History ────────────────────────────────────────────────

export interface TemplateHistoryEntry {
  id:               string;
  presentationId:   string;
  userId:           string;
  slidesSnapshot:   any[];
  editorDataSnapshot: any[];
  fontFamily:       string;
  templateId?:      string;
  templateName?:    string;
  createdAt:        string;
}

export interface TemplateHistoryState {
  entries:    TemplateHistoryEntry[];
  isLoading:  boolean;
  isRestoring: boolean;
  error:      string | null;
}

// ─── Part 30: Online Image Search ────────────────────────────────────────────

export interface OnlineImageResult {
  url:          string;
  thumbnailUrl: string;
  title:        string;
  width?:       number;
  height?:      number;
  sourceUrl?:   string;
}

export interface OnlineImageSearchState {
  query:      string;
  results:    OnlineImageResult[];
  isLoading:  boolean;
  error:      string | null;
  hasSearched: boolean;
}

// ─── Part 30: Iconify Search ─────────────────────────────────────────────────

export interface IconifySearchResult {
  id:        string;
  prefix:    string;
  name:      string;
  svgData?:  string;
  viewBox?:  string;
  width?:    number;
  height?:   number;
}

export interface IconifySearchState {
  query:       string;
  results:     IconifySearchResult[];
  isLoading:   boolean;
  error:       string | null;
  hasSearched: boolean;
}