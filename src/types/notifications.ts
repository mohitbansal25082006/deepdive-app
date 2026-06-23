// src/types/notifications.ts
// DeepDive AI — Part 53: Unified in-app notification system.
// Part 54A — Added:
//   • ContentKind 'voice_debate' + CONTENT_KIND_CONFIG.voice_debate
//     → deep-links to /(app)/voice-debate-player with { voiceDebateId, sessionId }
//   • AppNotificationType 'payment_success' | 'payment_failed'
//     → deep-link to /(app)/transaction-history (handled by the bell + lib router)
//
// These types describe the rows produced by schema_part53.sql's
// `app_notifications` table and surfaced through the notification bell.
//
// The bell shows TWO sources merged together:
//   1. app_notifications  — the user's own "content ready" events (Part 53)
//   2. follow_notifications — social events from Part 36 (kept intact)
//
// `AppNotification` below is the in-app shape (camelCase) the UI consumes after
// mapping. The hook (useAppNotifications) normalises both sources into this.

// ─── Notification kinds ────────────────────────────────────────────────────────
//
// The content-ready kinds, the two legacy social kinds, plus Part 54A payment
// kinds — so a single list/component can render everything.

export type AppNotificationType =
  // Part 53 — content generation complete
  | 'report_ready'
  | 'podcast_ready'
  | 'debate_ready'
  | 'paper_ready'
  | 'presentation_ready'
  // Part 54A — voice debate generation complete
  | 'voice_debate_ready'
  // Part 54A — payment outcome
  | 'payment_success'
  | 'payment_failed'
  // Part 36 — social (merged in for a single unified bell)
  | 'new_follower'
  | 'new_unfollower'
  | 'new_report'
  // Forward-compat: any future string is allowed by the table; the UI falls back
  // to a default icon/route for unknown types.
  | (string & {});

// ─── Normalised in-app notification (what the UI renders) ─────────────────────

export interface AppNotification {
  id:         string;
  type:       AppNotificationType;
  title:      string;
  body:       string;

  /** id of the generated content (report id, podcast id, debate id, etc.) */
  contentId?: string | null;
  /** source research report id, when the content derives from one */
  reportId?:  string | null;

  /** expo-router pathname to open on tap (already resolved server-side) */
  route?:     string | null;
  /** route params for navigation (e.g. { podcastId } or { reportId }) */
  params?:    Record<string, string>;

  /** optional Ionicons override; UI derives a sensible default per type */
  icon?:      string | null;
  /** optional hex accent for the row; UI derives a default per type */
  accent?:    string | null;

  read:       boolean;
  createdAt:  string;

  // ── Social-only enrichment (present only for new_follower / new_report) ──
  actorId?:        string | null;
  actorUsername?:  string | null;
  actorFullName?:  string | null;
  actorAvatarUrl?: string | null;

  /** which underlying table this came from — lets the hook route mark-as-read */
  source: 'app' | 'social';
}

// ─── Raw DB row shape (snake_case) returned by get_app_notifications RPC ───────

export interface AppNotificationRow {
  id:         string;
  type:       string;
  title:      string;
  body:       string;
  content_id: string | null;
  report_id:  string | null;
  route:      string | null;
  params:     Record<string, unknown> | null;
  icon:       string | null;
  accent:     string | null;
  read:       boolean;
  created_at: string;
}

// ─── Hook state ────────────────────────────────────────────────────────────────

export interface AppNotificationsState {
  notifications: AppNotification[];
  unreadCount:   number;
  isLoading:     boolean;
}

// ─── Content-ready descriptor ─────────────────────────────────────────────────
//
// A small, typed contract used by appNotificationService.notifyContentReady so
// every generation flow fires notifications the same way. Each generator passes
// its content kind, the ids, and a display title; the service fills in icon,
// accent, route, params, and the human-readable title/body.

export type ContentKind =
  | 'report'
  | 'podcast'
  | 'debate'
  | 'paper'
  | 'presentation'
  // Part 54A
  | 'voice_debate';

export interface ContentReadyInput {
  kind:        ContentKind;
  /** id of the generated item */
  contentId:   string;
  /** source research report id, when applicable */
  reportId?:   string | null;
  /** the title shown in the notification body, e.g. the report/episode title */
  title:       string;
  /**
   * Part 54A — voice debate is opened via the voice-debate-player which needs
   * BOTH the voiceDebateId (contentId) AND the parent debate sessionId. Pass it
   * here so buildParams can carry it as `sessionId`.
   */
  sessionId?:  string | null;
}

// ─── Per-kind presentation + routing config ───────────────────────────────────
//
// Single source of truth mapping a ContentKind → notification type, the OS/bell
// title + body templates, the deep-link route, the param key used for the id,
// and the icon/accent. Used by appNotificationService AND by the bell's fallback
// renderer in Part 53B.

export interface ContentKindConfig {
  type:    AppNotificationType;
  /** Ionicons name */
  icon:    string;
  /** hex accent colour */
  accent:  string;
  /** OS + bell notification title */
  title:   string;
  /** body template; `{title}` is replaced with the content title */
  body:    string;
  /** expo-router pathname opened on tap */
  route:   string;
  /**
   * Which param key carries the *content* id at the route.
   * For most viewers this is a specific key (podcastId, sessionId, paperId…).
   * Reports/papers/presentations are opened by reportId — see `usesReportId`.
   */
  idParam: string;
  /**
   * When true, the route is opened with { reportId } rather than { [idParam]: contentId }.
   * (Academic paper & presentation viewers are reached via the report id, and the
   *  research report screen obviously uses reportId.)
   */
  usesReportId?: boolean;
  /**
   * Optional extra static params merged into the navigation params
   * (e.g. presentation/ paper viewers also accept a specific id alongside reportId).
   */
  extraParamKey?: string;
  /**
   * Part 54A — when true, buildParams also carries the parent debate sessionId
   * as `sessionId` (required by the voice-debate-player route).
   */
  usesSessionId?: boolean;
}

// Accent colours align with src/constants/theme.ts COLORS where practical.
export const CONTENT_KIND_CONFIG: Record<ContentKind, ContentKindConfig> = {
  report: {
    type:    'report_ready',
    icon:    'document-text',
    accent:  '#6C63FF',
    title:   '✅ Research Complete',
    body:    'Your report "{title}" is ready to read.',
    route:   '/(app)/research-report',
    idParam: 'reportId',
    usesReportId: true,
  },
  podcast: {
    type:    'podcast_ready',
    icon:    'radio',
    accent:  '#A78BFA',
    title:   '🎙 Podcast Ready',
    body:    'Your episode "{title}" is ready to listen.',
    route:   '/(app)/podcast-player',
    idParam: 'podcastId',
  },
  debate: {
    type:    'debate_ready',
    icon:    'people',
    accent:  '#FB7185',
    title:   '⚖️ Debate Complete',
    body:    'The debate on "{title}" is ready to view.',
    route:   '/(app)/debate-detail',
    idParam: 'sessionId',
  },
  paper: {
    type:    'paper_ready',
    icon:    'school',
    accent:  '#34D399',
    title:   '🎓 Academic Paper Ready',
    body:    'Your paper "{title}" has been generated.',
    route:   '/(app)/academic-paper',
    idParam: 'paperId',
    usesReportId:  true,   // opened via reportId; paperId carried as extra
    extraParamKey: 'paperId',
  },
  presentation: {
    type:    'presentation_ready',
    icon:    'easel',
    accent:  '#FBBF24',
    title:   '📊 Presentation Ready',
    body:    'Your slides for "{title}" are ready.',
    route:   '/(app)/slide-preview',
    idParam: 'presentationId',
    usesReportId:  true,   // opened via reportId; presentationId carried as extra
    extraParamKey: 'presentationId',
  },
  // ── Part 54A: Voice debate ──────────────────────────────────────────────────
  // Opened via the full-screen voice-debate-player, which needs the
  // voiceDebateId (contentId) AND the parent debate sessionId.
  voice_debate: {
    type:    'voice_debate_ready',
    icon:    'mic',
    accent:  '#F472B6',
    title:   '🎧 Voice Debate Ready',
    body:    'The voice debate on "{title}" is ready to listen.',
    route:   '/(app)/voice-debate-player',
    idParam: 'voiceDebateId',
    usesSessionId: true,
  },
};