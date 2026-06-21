// src/services/appNotificationService.ts
// DeepDive AI — Part 53: Unified in-app notification service.
//
// This service is the ONE place every generation flow calls when content is
// ready. It does two things, in order, and never throws:
//
//   1. Writes a row to `app_notifications` (via the create_app_notification RPC)
//      so the in-app bell shows the notification even if OS banners are disabled.
//   2. Fires a LOCAL OS notification (via scheduleLocalNotification) so the user
//      is alerted immediately on iOS and Android — no push token required.
//
// It also exposes the read helpers the bell hook (useAppNotifications) uses to
// fetch, count, and mark notifications, plus a row→AppNotification mapper.
//
// DEEP LINKING
//   Each notification carries a resolved { route, params } payload built from
//   CONTENT_KIND_CONFIG, so a tap navigates straight to the exact content:
//     report        → /(app)/research-report   { reportId }
//     podcast        → /(app)/podcast-player     { podcastId }
//     debate         → /(app)/debate-detail      { sessionId }
//     academic paper → /(app)/academic-paper      { reportId, paperId }
//     presentation   → /(app)/slide-preview       { reportId, presentationId }

import { supabase } from '../lib/supabase';
import {
  scheduleLocalNotification,
  isAppForeground,
  hasUsablePushToken,
} from '../lib/notifications';
import {
  CONTENT_KIND_CONFIG,
  type AppNotification,
  type AppNotificationRow,
  type ContentKind,
  type ContentReadyInput,
} from '../types/notifications';

// ─── Build the navigation params for a content kind ───────────────────────────
//
// Returns the params object used both for in-app router.push (Part 53B bell) and
// for the OS notification deep-link payload.
//
//   report        → { reportId: contentId }
//   podcast        → { podcastId: contentId }
//   debate         → { sessionId: contentId }
//   paper          → { reportId, paperId: contentId }
//   presentation   → { reportId, presentationId: contentId }

function buildParams(
  kind:      ContentKind,
  contentId: string,
  reportId?: string | null,
): Record<string, string> {
  const cfg = CONTENT_KIND_CONFIG[kind];
  const params: Record<string, string> = {};

  if (cfg.usesReportId) {
    // Viewer is reached via the report id.
    const rid = reportId ?? contentId;
    if (rid) params.reportId = rid;
    // Carry the specific content id as an extra param when the viewer accepts it
    // (academic-paper accepts paperId, slide-preview accepts presentationId).
    if (cfg.extraParamKey) params[cfg.extraParamKey] = contentId;
  } else {
    // Viewer is reached directly via its own id param (podcastId / sessionId).
    params[cfg.idParam] = contentId;
  }

  return params;
}

// ─── Fire a "content ready" notification (DB row + local OS banner) ───────────
//
// Safe to call from any generation flow. Never throws — failures are logged.
// Returns the created notification id (or null if it couldn't be stored).

export async function notifyContentReady(
  input: ContentReadyInput,
): Promise<string | null> {
  const { kind, contentId, reportId, title } = input;

  if (!contentId) {
    console.warn('[AppNotif] notifyContentReady called without contentId — skipping');
    return null;
  }

  const cfg    = CONTENT_KIND_CONFIG[kind];
  const params = buildParams(kind, contentId, reportId);
  const safeTitle = (title ?? '').trim() || 'your content';
  const body   = cfg.body.replace('{title}', safeTitle);

  // 1) Persist the DB row so the bell shows it regardless of OS banner state.
  let notifId: string | null = null;
  try {
    const { data, error } = await supabase.rpc('create_app_notification', {
      p_type:       cfg.type,
      p_title:      cfg.title,
      p_body:       body,
      p_content_id: contentId,
      p_report_id:  reportId ?? null,
      p_route:      cfg.route,
      p_params:     params,
      p_icon:       cfg.icon,
      p_accent:     cfg.accent,
    });
    if (error) {
      console.warn('[AppNotif] create_app_notification failed:', error.message);
    } else if (typeof data === 'string') {
      notifId = data;
    }
  } catch (err) {
    console.warn('[AppNotif] create_app_notification threw:', err);
  }

  // 2) OS banner delivery.
  //    Part 53F — DEDUP FIX: the DB row we just wrote triggers a Database
  //    Webhook → Edge Function → REMOTE push, which delivers the OS banner in
  //    BOTH foreground and background. If we ALSO fired a local notification
  //    here, the user would see TWO banners for the same event. So we only fire
  //    a local banner as a FALLBACK when remote push is unavailable (no push
  //    token — e.g. simulator / FCM not configured) AND the app is foreground.
  try {
    const hasToken = await hasUsablePushToken();
    if (!hasToken && isAppForeground()) {
      await scheduleLocalNotification({
        title: cfg.title,
        body,
        data: {
          type:      cfg.type,
          route:     cfg.route,
          params,
          contentId,
          reportId:  reportId ?? null,
        },
        channel: 'content',
      });
    }
  } catch (err) {
    console.warn('[AppNotif] local fallback notification threw:', err);
  }

  return notifId;
}

// ─── Row → AppNotification mapper ─────────────────────────────────────────────

export function mapRowToAppNotification(row: AppNotificationRow): AppNotification {
  // Normalise params to a Record<string,string> for router.push.
  const rawParams = row.params ?? {};
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (v !== undefined && v !== null) params[k] = String(v);
  }

  return {
    id:        row.id,
    type:      row.type,
    title:     row.title,
    body:      row.body ?? '',
    contentId: row.content_id,
    reportId:  row.report_id,
    route:     row.route,
    params,
    icon:      row.icon,
    accent:    row.accent,
    read:      !!row.read,
    createdAt: row.created_at,
    source:    'app',
  };
}

// ─── Fetch the user's app notifications ───────────────────────────────────────

export async function getAppNotifications(limit = 40): Promise<AppNotification[]> {
  try {
    const { data, error } = await supabase.rpc('get_app_notifications', {
      p_limit: limit,
    });
    if (error || !data) return [];
    const rows = Array.isArray(data) ? (data as AppNotificationRow[]) : [];
    return rows.map(mapRowToAppNotification);
  } catch (err) {
    console.warn('[AppNotif] getAppNotifications error:', err);
    return [];
  }
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export async function getUnreadAppNotificationsCount(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('get_unread_app_notifications_count');
    if (error || data === null || data === undefined) return 0;
    return Number(data) || 0;
  } catch {
    return 0;
  }
}

// ─── Mark all read ────────────────────────────────────────────────────────────

export async function markAppNotificationsRead(): Promise<void> {
  try {
    await supabase.rpc('mark_app_notifications_read');
  } catch (err) {
    console.warn('[AppNotif] markAppNotificationsRead error:', err);
  }
}

// ─── Mark one read ────────────────────────────────────────────────────────────

export async function markOneAppNotificationRead(id: string): Promise<void> {
  try {
    await supabase.rpc('mark_one_app_notification_read', { p_id: id });
  } catch (err) {
    console.warn('[AppNotif] markOneAppNotificationRead error:', err);
  }
}

// ─── Delete one ───────────────────────────────────────────────────────────────

export async function deleteAppNotification(id: string): Promise<void> {
  try {
    await supabase.rpc('delete_app_notification', { p_id: id });
  } catch (err) {
    console.warn('[AppNotif] deleteAppNotification error:', err);
  }
}

// ─── Clear all ────────────────────────────────────────────────────────────────

export async function clearAppNotifications(): Promise<void> {
  try {
    await supabase.rpc('clear_app_notifications');
  } catch (err) {
    console.warn('[AppNotif] clearAppNotifications error:', err);
  }
}

// ─── Mark-read-on-tap + badge reconcile (Part 53F) ───────────────────────────
//
// When the user taps a notification (warm or cold start), we mark the matching
// row read so its count clears, then recompute the OS app-icon badge to the true
// unread total (app + social). Called from the notification tap handlers.

export async function markNotificationReadFromData(
  data: Record<string, unknown> | undefined | null,
): Promise<void> {
  try {
    if (!data) { await reconcileBadge(); return; }

    const type = typeof data.type === 'string' ? data.type : '';

    // Social types are stored in follow_notifications — mark all social read is
    // overkill; instead we just reconcile the badge (the bell open marks all).
    // For app/content types, mark the specific row read via content_id.
    const contentId =
      (typeof data.contentId === 'string' && data.contentId) ? data.contentId :
      (typeof data.reportId  === 'string' && data.reportId)  ? data.reportId  :
      null;

    if (contentId && !type.startsWith('new_')) {
      // Mark the specific app_notifications row read by (user, content_id).
      // NOTE: supabase.rpc() returns a thenable builder, not a Promise, so we
      // await it directly (no .catch()). Errors are swallowed by the outer try.
      await supabase.rpc('mark_app_notification_read_by_content', {
        p_content_id: contentId,
      });
    }
  } catch {
    // non-fatal
  } finally {
    await reconcileBadge();
  }
}

// Recompute the true unread total and set the OS badge to it.
export async function reconcileBadge(): Promise<void> {
  try {
    const [appUnread, socialUnread] = await Promise.all([
      getUnreadAppNotificationsCount(),
      // social unread is imported lazily to avoid a cycle
      (await import('./socialNotificationService')).getUnreadFollowNotificationsCount(),
    ]);
    const total = (appUnread ?? 0) + (socialUnread ?? 0);
    const { setBadgeCount } = await import('../lib/notifications');
    await setBadgeCount(total);
  } catch {
    // non-fatal
  }
}