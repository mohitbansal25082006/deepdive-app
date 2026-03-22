// src/types/editor.ts
// Part 30 — FULL REWRITE (merged with Part 29)
// Changes from Part 29:
//   1. Added hFrac to InlineBlockPosition for independent height control
//   2. Added onlineUrl and sourceQuery to ImageBlock for online images
//   3. Added iconifyId and svgData to IconBlock for Iconify icons
//   4. Added TemplateHistoryEntry & TemplateHistoryState for version history
//   5. Extended EditorPanel with template_history, online_image_search, iconify_picker
//   6. Added OnlineImageSearchState & IconifySearchState
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
  /**
   * Part 30: 0–1 fraction of slide height for the element's height.
   * When undefined the element uses its natural/auto height.
   * Only meaningful for image and stat blocks that can have explicit heights.
   */
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
  uri:          string;            // local file URI (from picker) or empty when online
  /** Part 30: remote URL from SerpAPI image search */
  onlineUrl?:    string;
  /** Part 30: the search query that produced this image, for display */
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
  /** Height in logical pixels (dp) */
  height:   number;
  position?: InlineBlockPosition;
}

export interface IconBlock {
  type:      'icon';
  id:        string;
  /** Ionicons name — used when iconifyId is not set */
  iconName:  string;
  /** Part 30: Iconify icon id e.g. "mdi:home", "ph:heart-fill" */
  iconifyId?: string;
  /** Part 30: cached SVG path data string for offline PPTX/PDF rendering */
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
  | 'block_inserter'          // kept for inline-block insertion access from canvas
  | 'template_library'        // Part 29: new template library panel
  | 'template_history'        // Part 30: view + restore previous states
  | 'online_image_search'     // Part 30: search SerpAPI for slide images
  | 'iconify_picker';         // Part 30: full Iconify icon search

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

// ─── Part 30: Template History ────────────────────────────────────────────────

/**
 * A single snapshot of the presentation slides + editorData saved BEFORE
 * a template was applied. Stored in Supabase template_history table so users
 * can roll back to any previous state.
 */
export interface TemplateHistoryEntry {
  id:               string;
  presentationId:   string;
  userId:           string;
  /** Snapshot of slides array before template was applied */
  slidesSnapshot:   any[];
  /** Snapshot of editor_data array before template was applied */
  editorDataSnapshot: any[];
  /** Font family at time of snapshot */
  fontFamily:       string;
  /** The template that was about to be applied (for display in history list) */
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
  /** Full Iconify id, e.g. "mdi:home" */
  id:        string;
  /** Icon set prefix, e.g. "mdi" */
  prefix:    string;
  /** Icon name within set, e.g. "home" */
  name:      string;
  /** SVG path data string (d attribute) — fetched from Iconify API */
  svgData?:  string;
  /** SVG viewBox, e.g. "0 0 24 24" */
  viewBox?:  string;
  /** Width/height hint from API */
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