// src/services/workspaceNotificationService.ts
// Part 18D — Full workspace notification service.
// Part 36 FIX — Lazy-loads expo-notifications to prevent PushNotificationIOS
// invariant violation crash in Expo Go.

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { getNotificationsEnabled, getPermissionStatus } from '../lib/notifications';
import { isOnChatScreen } from '../lib/screenState';
import { WorkspaceNotificationPreferences } from '../types';

// ─── Lazy loader ──────────────────────────────────────────────────────────────

let _N: typeof import('expo-notifications') | null = null;

function getNotifs(): typeof import('expo-notifications') | null {
  if (_N) return _N;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _N = require('expo-notifications') as typeof import('expo-notifications');
    return _N;
  } catch {
    console.warn('[WorkspaceNotif] expo-notifications not available (Expo Go?).');
    return null;
  }
}

// ─── Android channels ─────────────────────────────────────────────────────────

const CH_MENTION   = 'workspace_mention';
const CH_CHAT      = 'workspace_chat';
const CH_WORKSPACE = 'workspace_updates';

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const N = getNotifs();
  if (!N) return;
  try {
    await N.setNotificationChannelAsync(CH_MENTION, {
      name: 'Mentions', importance: N.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 100, 300], lightColor: '#6C63FF', sound: 'default',
    });
    await N.setNotificationChannelAsync(CH_CHAT, {
      name: 'Team Chat', importance: N.AndroidImportance.HIGH, sound: 'default',
    });
    await N.setNotificationChannelAsync(CH_WORKSPACE, {
      name: 'Workspace Updates', importance: N.AndroidImportance.DEFAULT, sound: 'default',
    });
  } catch (e) {
    console.warn('[WorkspaceNotif] ensureChannels error:', e);
  }
}

async function globallyEnabled(): Promise<boolean> {
  const [enabled, status] = await Promise.all([
    getNotificationsEnabled(), getPermissionStatus(),
  ]);
  return enabled && status === 'granted';
}

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

async function schedule(
  title: string, body: string,
  data: Record<string, unknown>,
  channel = CH_WORKSPACE,
): Promise<void> {
  const N = getNotifs();
  if (!N) return;
  await ensureChannels();
  try {
    await N.scheduleNotificationAsync({
      content: {
        title, body, data, sound: true,
        ...(Platform.OS === 'android' ? { channelId: channel } : {}),
      },
      trigger: null,
    });
    const cur = await N.getBadgeCountAsync();
    await N.setBadgeCountAsync(cur + 1);
  } catch (err) {
    console.warn('[WorkspaceNotif] schedule error:', err);
  }
}

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