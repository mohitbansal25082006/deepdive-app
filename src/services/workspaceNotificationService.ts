// src/services/workspaceNotificationService.ts
// Part 18D — Full workspace notification service.
//
// Notifications fired:
//   • @mention in chat           (suppressed on that chat screen)
//   • New chat message           (suppressed on that chat screen)
//   • Reply to your message      (suppressed on that chat screen)
//   • Report added to workspace
//   • Comment added
//   • Member joined
//   • Shared content (presentation/paper/podcast/debate/document)
//   • Member removed
//   • Member blocked
//   • Role changed
//   • Ownership transferred

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { getNotificationsEnabled, getPermissionStatus } from '../lib/notifications';
import { isOnChatScreen } from '../lib/screenState';
import { WorkspaceNotificationPreferences } from '../types';

// ─── Android channels ─────────────────────────────────────────────────────────

const CH_MENTION   = 'workspace_mention';
const CH_CHAT      = 'workspace_chat';
const CH_WORKSPACE = 'workspace_updates';

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CH_MENTION, {
    name: 'Mentions', importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 100, 300], lightColor: '#6C63FF', sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CH_CHAT, {
    name: 'Team Chat', importance: Notifications.AndroidImportance.HIGH, sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CH_WORKSPACE, {
    name: 'Workspace Updates', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default',
  });
}

// ─── Master switch ────────────────────────────────────────────────────────────

async function globallyEnabled(): Promise<boolean> {
  const [enabled, status] = await Promise.all([
    getNotificationsEnabled(), getPermissionStatus(),
  ]);
  return enabled && status === 'granted';
}

// ─── Per-workspace preference check ──────────────────────────────────────────

type PrefKey = keyof Omit<WorkspaceNotificationPreferences,
  'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'>;

const PREF_SNAKE: Record<PrefKey, string> = {
  notifyOnMention:       'notify_on_mention',
  notifyOnChatMessage:   'notify_on_chat_message',
  notifyOnReportAdded:   'notify_on_report_added',
  notifyOnComment:       'notify_on_comment',
  notifyOnMemberJoin:    'notify_on_member_join',
  notifyOnSharedContent: 'notify_on_shared_content',
};

async function canNotify(workspaceId: string, prefKey: PrefKey): Promise<boolean> {
  if (!await globallyEnabled()) return false;
  try {
    const { data } = await supabase.rpc(
      'get_or_create_workspace_notification_prefs',
      { p_workspace_id: workspaceId },
    );
    if (!data) return true;
    const row = data as Record<string, unknown>;
    return row[PREF_SNAKE[prefKey]] !== false;
  } catch { return true; }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

async function schedule(
  title: string, body: string,
  data: Record<string, unknown>,
  channel = CH_WORKSPACE,
): Promise<void> {
  await ensureChannels();
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title, body, data, sound: true,
        ...(Platform.OS === 'android' ? { channelId: channel } : {}),
      },
      trigger: null,
    });
    const cur = await Notifications.getBadgeCountAsync();
    await Notifications.setBadgeCountAsync(cur + 1);
  } catch (err) {
    console.warn('[WorkspaceNotif]', err);
  }
}

// ─── 1. @Mention in chat ──────────────────────────────────────────────────────
export async function notifyMention(params: {
  workspaceId: string; workspaceName: string;
  mentionerName: string; messagePreview: string;
}): Promise<void> {
  if (isOnChatScreen(params.workspaceId)) return;
  if (!await canNotify(params.workspaceId, 'notifyOnMention')) return;
  await schedule(
    `💬 ${params.mentionerName} mentioned you`,
    `In ${params.workspaceName}: "${params.messagePreview.slice(0, 80)}"`,
    { type: 'workspace_mention', workspaceId: params.workspaceId, screen: 'workspace-chat' },
    CH_MENTION,
  );
}

// ─── 2. New chat message (only when NOT on that chat screen) ──────────────────
export async function notifyChatMessage(params: {
  workspaceId: string; workspaceName: string;
  senderName: string; messagePreview: string;
}): Promise<void> {
  if (isOnChatScreen(params.workspaceId)) return;
  if (!await canNotify(params.workspaceId, 'notifyOnChatMessage')) return;
  await schedule(
    `${params.workspaceName}`,
    `${params.senderName}: ${params.messagePreview.slice(0, 80)}`,
    { type: 'workspace_chat_message', workspaceId: params.workspaceId, screen: 'workspace-chat' },
    CH_CHAT,
  );
}

// ─── 3. Reply to your message ─────────────────────────────────────────────────
export async function notifyReply(params: {
  workspaceId: string; workspaceName: string;
  replierName: string; replyPreview: string; messageId: string;
}): Promise<void> {
  if (isOnChatScreen(params.workspaceId)) return;
  if (!await canNotify(params.workspaceId, 'notifyOnMention')) return;
  await schedule(
    `↩️ ${params.replierName} replied to you`,
    `In ${params.workspaceName}: "${params.replyPreview.slice(0, 80)}"`,
    { type: 'workspace_reply', workspaceId: params.workspaceId, messageId: params.messageId, screen: 'workspace-chat' },
    CH_MENTION,
  );
}

// ─── 4. Report added ──────────────────────────────────────────────────────────
export async function notifyReportAdded(params: {
  workspaceId: string; workspaceName: string;
  reportTitle: string; adderName: string; reportId: string;
}): Promise<void> {
  if (!await canNotify(params.workspaceId, 'notifyOnReportAdded')) return;
  await schedule(
    `📄 New report in ${params.workspaceName}`,
    `${params.adderName} added "${params.reportTitle}"`,
    { type: 'workspace_report_added', workspaceId: params.workspaceId, reportId: params.reportId },
  );
}

// ─── 5. Comment added ─────────────────────────────────────────────────────────
export async function notifyCommentAdded(params: {
  workspaceId: string; workspaceName: string;
  commenterName: string; commentPreview: string;
}): Promise<void> {
  if (!await canNotify(params.workspaceId, 'notifyOnComment')) return;
  await schedule(
    `💬 New comment in ${params.workspaceName}`,
    `${params.commenterName}: "${params.commentPreview.slice(0, 80)}"`,
    { type: 'workspace_comment', workspaceId: params.workspaceId },
  );
}

// ─── 6. Member joined ─────────────────────────────────────────────────────────
export async function notifyMemberJoined(params: {
  workspaceId: string; workspaceName: string; memberName: string;
}): Promise<void> {
  if (!await canNotify(params.workspaceId, 'notifyOnMemberJoin')) return;
  await schedule(
    `👋 ${params.memberName} joined ${params.workspaceName}`,
    'A new member has joined your workspace.',
    { type: 'workspace_member_joined', workspaceId: params.workspaceId },
  );
}

// ─── 7. Shared content ────────────────────────────────────────────────────────
export async function notifySharedContent(params: {
  workspaceId: string; workspaceName: string; sharerName: string;
  contentType: 'presentation' | 'academic_paper' | 'podcast' | 'debate' | 'document';
  contentTitle: string;
}): Promise<void> {
  if (!await canNotify(params.workspaceId, 'notifyOnSharedContent')) return;
  const emojis: Record<string, string> = {
    presentation: '📊', academic_paper: '📝', podcast: '🎙️', debate: '⚖️', document: '📎',
  };
  const labels: Record<string, string> = {
    presentation: 'presentation', academic_paper: 'paper',
    podcast: 'podcast', debate: 'debate', document: 'document',
  };
  await schedule(
    `${emojis[params.contentType] ?? '📌'} New ${labels[params.contentType] ?? 'content'} shared`,
    `${params.sharerName} shared "${params.contentTitle}" in ${params.workspaceName}`,
    { type: 'workspace_shared_content', workspaceId: params.workspaceId, contentType: params.contentType },
  );
}

// ─── 8. Member removed ────────────────────────────────────────────────────────
export async function notifyMemberRemoved(params: {
  workspaceId: string; workspaceName: string;
  removedName: string; removedByName: string;
}): Promise<void> {
  if (!await globallyEnabled()) return;
  await schedule(
    `🚪 Member removed from ${params.workspaceName}`,
    `${params.removedByName} removed ${params.removedName}`,
    { type: 'workspace_member_removed', workspaceId: params.workspaceId },
  );
}

// ─── 9. Member blocked ────────────────────────────────────────────────────────
export async function notifyMemberBlocked(params: {
  workspaceId: string; workspaceName: string;
  blockedName: string; blockedByName: string;
}): Promise<void> {
  if (!await globallyEnabled()) return;
  await schedule(
    `🚫 ${params.blockedName} was blocked`,
    `${params.blockedByName} blocked ${params.blockedName} from ${params.workspaceName}`,
    { type: 'workspace_member_blocked', workspaceId: params.workspaceId },
  );
}

// ─── 10. Role changed ────────────────────────────────────────────────────────
export async function notifyRoleChanged(params: {
  workspaceId: string; workspaceName: string;
  targetName: string; newRole: string; changedByName: string;
}): Promise<void> {
  if (!await globallyEnabled()) return;
  const roleEmoji: Record<string, string> = { owner: '👑', editor: '✏️', viewer: '👁️' };
  await schedule(
    `${roleEmoji[params.newRole] ?? '🔄'} Role updated in ${params.workspaceName}`,
    `${params.targetName} is now ${params.newRole} (changed by ${params.changedByName})`,
    { type: 'workspace_role_changed', workspaceId: params.workspaceId, newRole: params.newRole },
  );
}

// ─── 11. Ownership transferred ────────────────────────────────────────────────
export async function notifyOwnershipTransferred(params: {
  workspaceId: string; workspaceName: string;
  newOwnerName: string; previousOwner: string;
}): Promise<void> {
  if (!await globallyEnabled()) return;
  await schedule(
    `👑 Ownership transferred`,
    `${params.previousOwner} transferred ownership of ${params.workspaceName} to ${params.newOwnerName}`,
    { type: 'workspace_ownership_transferred', workspaceId: params.workspaceId },
  );
}

// ─── Preferences CRUD ────────────────────────────────────────────────────────

export async function getWorkspaceNotifPrefs(
  workspaceId: string,
): Promise<WorkspaceNotificationPreferences | null> {
  try {
    const { data, error } = await supabase.rpc(
      'get_or_create_workspace_notification_prefs',
      { p_workspace_id: workspaceId },
    );
    if (error || !data) return null;
    const r = data as Record<string, unknown>;
    return {
      id: r.id as string, userId: r.user_id as string, workspaceId: r.workspace_id as string,
      notifyOnMention:       r.notify_on_mention        as boolean,
      notifyOnChatMessage:   r.notify_on_chat_message   as boolean,
      notifyOnReportAdded:   r.notify_on_report_added   as boolean,
      notifyOnComment:       r.notify_on_comment        as boolean,
      notifyOnMemberJoin:    r.notify_on_member_join    as boolean,
      notifyOnSharedContent: r.notify_on_shared_content as boolean,
      createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    };
  } catch { return null; }
}

export async function updateWorkspaceNotifPrefs(
  workspaceId: string,
  updates: Partial<Omit<WorkspaceNotificationPreferences,
    'id' | 'userId' | 'workspaceId' | 'createdAt' | 'updatedAt'>>,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('update_workspace_notification_prefs', {
      p_workspace_id:             workspaceId,
      p_notify_on_mention:        updates.notifyOnMention        ?? null,
      p_notify_on_chat_message:   updates.notifyOnChatMessage    ?? null,
      p_notify_on_report_added:   updates.notifyOnReportAdded    ?? null,
      p_notify_on_comment:        updates.notifyOnComment        ?? null,
      p_notify_on_member_join:    updates.notifyOnMemberJoin     ?? null,
      p_notify_on_shared_content: updates.notifyOnSharedContent  ?? null,
    });
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update prefs' };
  }
}