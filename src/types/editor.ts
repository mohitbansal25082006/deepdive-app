// src/types/editor.ts
// Part 58.5 — ONLINE IMAGE INSERT FIX
//   1. Introduced `BlockCommon` so `id`, `position` and `zIndex` are declared
//      once. `zIndex` was previously read/written through `as any` casts in
//      SlideCard / SlideEditorCanvas / useSlideEditor — now properly typed.
//   2. `ImageBlock` gained `thumbnailUrl` and `sourceUrl`. The renderer walks
//      uri → onlineUrl → thumbnailUrl, so a failed full-res fetch degrades to
//      the smaller Pexels asset instead of a silent blank rectangle.
//   3. `OnlineImageResult` gained `mediumUrl` (Pexels `src.large`) which feeds
//      the fallback chain above.
//   4. Added `fitOverlayPosition()` — a shared helper that guarantees an
//      overlay block always resolves to a concrete, in-bounds hFrac. An image
//      inserted with an undefined hFrac used to compute its height from the
//      aspect ratio alone and overflow the 320×180 canvas.
// Part 58.3 — Added photographer / photographerUrl to OnlineImageResult
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

// ─── Part 58.5: canvas geometry + placement helper ───────────────────────────
// SlideCard renders on a fixed 320×180 design canvas and scales from there.
// These constants are exported so the editor panels compute placement against
// exactly the same geometry the renderer uses.

export const SLIDE_CANVAS_W = 320;
export const SLIDE_CANVAS_H = 180;

/**
 * Part 58.5.1 — directory (under expo-file-system's documentDirectory) holding
 * copies of device-picked slide images. Shared by the picker and the renderer
 * so a stored filename can be resolved back to a full path on either side,
 * even after the iOS app-container UUID changes.
 */
export const SLIDE_IMAGE_DIR_NAME = 'slide_images';

function clampFrac(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Resolve a user-chosen overlay position into one that is guaranteed to be
 * fully inside the slide canvas, with a concrete hFrac.
 *
 * When `hFrac` is left undefined the renderer derives the height from the
 * image aspect ratio, which regularly exceeds the slide height (a 3:2 photo at
 * 90% width needs 107% of the slide height). The result was an image that
 * spilled past the bottom edge and got clipped — the "the image didn't apply"
 * symptom. This clamps the height into the space actually remaining below
 * `yFrac`, preserving the aspect ratio by trimming width when needed.
 *
 * @param pos          the position picked in the joystick control
 * @param aspectRatio  width / height of the source image (defaults to 16:9)
 */
export function fitOverlayPosition(
  pos: InlineBlockPosition | undefined,
  aspectRatio: number = 16 / 9,
): InlineBlockPosition {
  const ar = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 16 / 9;

  const xFrac = clampFrac(pos?.xFrac ?? 0.05, 0, 0.95);
  const yFrac = clampFrac(pos?.yFrac ?? 0.10, 0, 0.95);

  let wFrac = clampFrac(pos?.wFrac ?? 0.90, 0.05, 1 - xFrac);

  // Height available below yFrac, as a fraction of the canvas height
  const maxH = Math.max(0.05, 1 - yFrac);

  let hFrac: number;
  if (pos?.hFrac !== undefined && Number.isFinite(pos.hFrac)) {
    hFrac = clampFrac(pos.hFrac, 0.05, maxH);
  } else {
    // Natural height for this width, expressed as a canvas fraction
    const naturalPx = (SLIDE_CANVAS_W * wFrac) / ar;
    hFrac = naturalPx / SLIDE_CANVAS_H;

    if (hFrac > maxH) {
      // Too tall to fit — shrink the width so the aspect ratio survives
      hFrac = maxH;
      const fittedPx = SLIDE_CANVAS_H * hFrac * ar;
      wFrac = clampFrac(fittedPx / SLIDE_CANVAS_W, 0.05, 1 - xFrac);
    }
    hFrac = clampFrac(hFrac, 0.05, maxH);
  }

  return { type: 'overlay', xFrac, yFrac, wFrac, hFrac };
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

/**
 * Part 58.5 — fields shared by every block.
 * `zIndex` controls overlay stacking order: SlideCard sorts overlay blocks
 * ascending, so a higher value renders on top. Defaults to 1 when absent.
 */
export interface BlockCommon {
  id:        string;
  position?: InlineBlockPosition;
  zIndex?:   number;
}

export interface ImageBlock extends BlockCommon {
  type: 'image';
  /**
   * Primary source the renderer tries first.
   * `file://…` for device picks, `https://…` for Pexels picks.
   */
  uri: string;
  /**
   * Part 58.5.1 — filename only (no directory), for device picks that were
   * copied into documentDirectory/<SLIDE_IMAGE_DIR_NAME>/.
   *
   * expo-image-picker returns a URI under Library/Caches/ExponentExperienceData/
   * <container-uuid>/ImagePicker/… . iOS purges Caches under storage pressure,
   * and the container UUID changes on every reinstall, so the absolute path
   * saved into Supabase eventually stops resolving — the image silently
   * disappears from the slide days after it was added. The renderer rebuilds a
   * path from this filename against the CURRENT container as a fallback.
   */
  localFileName?: string;
  /** Full-resolution remote URL — used by PPTX / PDF export and asset caching. */
  onlineUrl?: string;
  /**
   * Part 58.5 — smaller remote URL kept as a render fallback. If `uri` and
   * `onlineUrl` both fail to load, the renderer tries this before showing a
   * placeholder, so a slow or oversized CDN asset never blanks the slide.
   */
  thumbnailUrl?: string;
  /** Pexels photo page URL — the attribution link target. */
  sourceUrl?:    string;
  sourceQuery?:  string;
  caption?:      string;
  aspectRatio?:  number;
  /** Part 58.3 — Pexels attribution, carried through to PPTX/PDF export */
  photographer?:    string;
  photographerUrl?: string;
}

export interface ChartBlock extends BlockCommon {
  type:  'chart';
  chart: InfographicChart;
}

export interface StatBlock extends BlockCommon {
  type:   'stat';
  value:  string;
  label:  string;
  unit?:  string;
  color?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface QuoteBlock extends BlockCommon {
  type:         'quote_block';
  text:         string;
  attribution?: string;
}

export interface DividerBlock extends BlockCommon {
  type:   'divider';
  style:  DividerStyle;
  color?: string;
}

export interface SpacerBlock extends BlockCommon {
  type:   'spacer';
  height: number;
}

export interface IconBlock extends BlockCommon {
  type:       'icon';
  iconName:   string;
  iconifyId?: string;
  svgData?:   string;
  size:       number;
  color?:     string;
  label?:     string;
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
  /**
   * Part 41.9: Global font scale multiplier (0.7–2.0).
   * Applied to all text in this slide. Per-field fontScale overrides this.
   */
  globalFontScale?:  number;
  /**
   * Part 41.9: Global text color override.
   * Overrides textPrimary/textSecondary for all text in this slide.
   * Per-field color overrides this. Undefined = use theme default.
   */
  globalTextColor?:  string;
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
  slides:            EditableSlide[];
  activeSlideIndex:  number;
  selectedField:     EditableFieldKey | null;
  editingText:       string;
  activePanel:       EditorPanel;
  colorPickerTarget: ColorPickerTarget | null;
  activeTool:        EditorTool;
  fontFamily:        FontFamily;
  isDirty:           boolean;
  isSaving:          boolean;
  saveError:         string | null;
  isAIProcessing:    boolean;
  aiProcessingLabel: string;
  layoutSuggestion:  AILayoutSuggestion | null;
  undoStack:         EditableSlide[][];
  redoStack:         EditableSlide[][];
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
  id:              string;
  name:            string;
  description:     string;
  category:        TemplateCategory;
  icon:            string;
  gradient:        readonly [string, string];
  tag?:            string;
  slideCount:      number;
  slides:          SlideTemplateSlide[];
  suggestedTheme?: PresentationTheme;
}

export interface TemplateCategoryMeta {
  id:          TemplateCategory;
  label:       string;
  emoji:       string;
  description: string;
}

// ─── Part 30: Template History ────────────────────────────────────────────────

export interface TemplateHistoryEntry {
  id:                 string;
  presentationId:     string;
  userId:             string;
  slidesSnapshot:     any[];
  editorDataSnapshot: any[];
  fontFamily:         string;
  templateId?:        string;
  templateName?:      string;
  createdAt:          string;
}

export interface TemplateHistoryState {
  entries:     TemplateHistoryEntry[];
  isLoading:   boolean;
  isRestoring: boolean;
  error:       string | null;
}

// ─── Part 30: Online Image Search ────────────────────────────────────────────
// Part 58.3: backed by Pexels rather than Tavily — width/height are always
// populated (Pexels always returns real photo dimensions), and
// photographer/photographerUrl carry attribution data.
// Part 58.5: `mediumUrl` added as the middle rung of the render fallback chain.

export interface OnlineImageResult {
  /** Full-resolution URL (Pexels `src.large2x`) — inserted + exported. */
  url:          string;
  /** Grid thumbnail (Pexels `src.medium`) — also the last-resort render source. */
  thumbnailUrl: string;
  /** Part 58.5 — mid-size URL (Pexels `src.large`), first render fallback. */
  mediumUrl?:   string;
  title:        string;
  width?:       number;
  height?:      number;
  sourceUrl?:   string;
  /** Part 58.3 — Pexels attribution */
  photographer?:    string;
  photographerUrl?: string;
}

export interface OnlineImageSearchState {
  query:       string;
  results:     OnlineImageResult[];
  isLoading:   boolean;
  error:       string | null;
  hasSearched: boolean;
}

// ─── Part 30: Iconify Search ─────────────────────────────────────────────────

export interface IconifySearchResult {
  id:       string;
  prefix:   string;
  name:     string;
  svgData?: string;
  viewBox?: string;
  width?:   number;
  height?:  number;
}

export interface IconifySearchState {
  query:       string;
  results:     IconifySearchResult[];
  isLoading:   boolean;
  error:       string | null;
  hasSearched: boolean;
}