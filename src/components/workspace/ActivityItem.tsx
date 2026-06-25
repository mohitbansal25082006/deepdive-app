// src/components/workspace/ActivityItem.tsx
// Part 52.2 — Activity Feed v2 (full redesign).
// Part 52.3 — Fixes:
//   (Issue 2)  member_left: the actor (the person who left) is NO LONGER a
//              clickable name chip — they are not a current member, so tapping
//              their name and opening a profile is wrong. The actor name renders
//              as static text for member_left, member_removed-as-actor cases.
//   (Issue 7)  Shared content (podcast / debate / voice — and slides / papers)
//              title pills are TAPPABLE while the content exists, and become
//              NON-tappable automatically once the content is removed
//              (resourceRemoved=true, derived in workspace-detail.tsx from a
//              matching *_unshared entry). The label per type is rendered from
//              SHARE_LABEL so "shared a podcast/debate/voice debate" is correct.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  WorkspaceActivity,
  WorkspaceActivityAction,
  ActivityMetadata,
  ActivityResourceKind,
  MiniProfile,
} from '../../types';
import { Avatar } from '../common/Avatar';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

// ─── Navigation callbacks ─────────────────────────────────────────────────────

export interface ActivityItemHandlers {
  /** Open a member's workspace profile. */
  onOpenMember?: (userId: string, fallback?: MiniProfile) => void;
  /** Open a resource: report or a piece of shared content. */
  onOpenResource?: (
    kind:       ActivityResourceKind,
    resourceId: string,
    reportId?:  string,
    title?:     string,
  ) => void;
}

interface Props extends ActivityItemHandlers {
  activity: WorkspaceActivity;
  /** Whether this is the last entry (hides the timeline connector tail). */
  isLast?: boolean;
  /** Issue 7: true when this share entry's content was later removed → the
   *  title pill becomes non-tappable (the content no longer exists). */
  resourceRemoved?: boolean;
}

// ─── Action → visual family + icon ────────────────────────────────────────────

type Family =
  | 'report' | 'pin' | 'share' | 'member' | 'role'
  | 'owner' | 'block' | 'access' | 'settings' | 'system';

const FAMILY_ACCENT: Record<Family, string> = {
  report:   COLORS.success,
  pin:      COLORS.warning,
  share:    '#8B5CF6',
  member:   COLORS.accent ?? COLORS.primary,
  role:     COLORS.info,
  owner:    COLORS.pro ?? COLORS.warning,
  block:    COLORS.error,
  access:   COLORS.primary,
  settings: COLORS.info,
  system:   COLORS.primary,
};

interface ActionMeta {
  family: Family;
  icon:   keyof typeof Ionicons.glyphMap;
}

const ACTION_META: Partial<Record<WorkspaceActivityAction, ActionMeta>> = {
  workspace_created:             { family: 'system',   icon: 'sparkles' },
  workspace_updated:             { family: 'settings', icon: 'options-outline' },
  workspace_renamed:             { family: 'settings', icon: 'text-outline' },
  workspace_description_changed: { family: 'settings', icon: 'reader-outline' },
  workspace_logo_changed:        { family: 'settings', icon: 'image-outline' },

  report_added:                  { family: 'report', icon: 'document-text' },
  report_removed:                { family: 'report', icon: 'remove-circle-outline' },
  report_pinned:                 { family: 'pin',    icon: 'pin' },
  report_unpinned:               { family: 'pin',    icon: 'pin-outline' },

  presentation_shared:           { family: 'share', icon: 'easel-outline' },
  academic_paper_shared:         { family: 'share', icon: 'school-outline' },
  podcast_shared:                { family: 'share', icon: 'mic-outline' },
  debate_shared:                 { family: 'share', icon: 'git-compare-outline' },
  voice_debate_shared:           { family: 'share', icon: 'mic-circle-outline' },

  presentation_unshared:         { family: 'report', icon: 'easel-outline' },
  academic_paper_unshared:       { family: 'report', icon: 'school-outline' },
  podcast_unshared:              { family: 'report', icon: 'mic-outline' },
  debate_unshared:               { family: 'report', icon: 'git-compare-outline' },
  voice_debate_unshared:         { family: 'report', icon: 'mic-circle-outline' },

  member_joined:                 { family: 'member', icon: 'person-add' },
  member_left:                   { family: 'member', icon: 'log-out-outline' },
  member_removed:                { family: 'block',  icon: 'person-remove' },
  member_blocked:                { family: 'block',  icon: 'ban-outline' },
  member_unblocked:              { family: 'member', icon: 'checkmark-done-outline' },
  member_role_changed:           { family: 'role',   icon: 'shield-outline' },
  ownership_transferred:         { family: 'owner',  icon: 'key-outline' },

  access_request_sent:           { family: 'access', icon: 'hand-right-outline' },
  access_request_approved:       { family: 'access', icon: 'checkmark-circle' },
  access_request_denied:         { family: 'access', icon: 'close-circle-outline' },
};

const FALLBACK_META: ActionMeta = { family: 'system', icon: 'ellipse-outline' };

// ─── Actions where the ACTOR is no longer a current member ───────────────────
const ACTOR_NOT_CLICKABLE: ReadonlySet<WorkspaceActivityAction> = new Set<WorkspaceActivityAction>([
  'member_left',
]);

// ─── Shared content kind from action ──────────────────────────────────────────

function resourceKindForShare(action: WorkspaceActivityAction): ActivityResourceKind {
  switch (action) {
    case 'presentation_shared':   return 'presentation';
    case 'academic_paper_shared': return 'academic_paper';
    case 'podcast_shared':        return 'podcast';
    case 'debate_shared':         return 'debate';
    case 'voice_debate_shared':   return 'voice_debate';
    default:                       return 'none';
  }
}

// ─── Time formatting ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Inline tappable name chip ────────────────────────────────────────────────

function NameChip({
  name, userId, color, onOpenMember, fallback,
}: {
  name:          string;
  userId?:       string | null;
  color:         string;
  onOpenMember?: (userId: string, fallback?: MiniProfile) => void;
  fallback?:     MiniProfile;
}) {
  const canTap = !!userId && !!onOpenMember;
  if (!canTap) {
    return <Text style={[styles.nameStatic, { color: COLORS.textPrimary }]}>{name}</Text>;
  }
  return (
    <Text
      style={[styles.nameLink, { color }]}
      suppressHighlighting
      onPress={() => onOpenMember!(userId!, fallback)}
    >
      {name}
    </Text>
  );
}

// ─── Title pill (full untruncated resource title, tappable) ──────────────────

function TitlePill({
  title, icon, color, onPress,
}: {
  title:    string;
  icon:     keyof typeof Ionicons.glyphMap;
  color:    string;
  onPress?: () => void;
}) {
  const tappable = !!onPress;
  return (
    <TouchableOpacity
      activeOpacity={tappable ? 0.7 : 1}
      disabled={!tappable}
      onPress={onPress}
      style={[styles.titlePill, { borderColor: `${color}30`, backgroundColor: `${color}0E` }]}
    >
      <Ionicons name={icon} size={13} color={color} style={{ marginTop: 1 }} />
      <Text style={[styles.titlePillText, { color: tappable ? COLORS.textPrimary : COLORS.textSecondary }]}>
        {title}
      </Text>
      {tappable && <Ionicons name="chevron-forward" size={12} color={color} style={{ marginTop: 1 }} />}
    </TouchableOpacity>
  );
}

// ─── Diff row (from → to) for settings changes ───────────────────────────────

function DiffRow({ from, to, color }: { from: string; to: string; color: string }) {
  return (
    <View style={styles.diffWrap}>
      <View style={[styles.diffOld, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
        <Text style={[styles.diffOldText, { color: COLORS.textMuted }]} numberOfLines={3}>{from || '—'}</Text>
      </View>
      <Ionicons name="arrow-forward" size={12} color={color} style={{ marginHorizontal: 2 }} />
      <View style={[styles.diffNew, { borderColor: `${color}35`, backgroundColor: `${color}10` }]}>
        <Text style={[styles.diffNewText, { color }]} numberOfLines={3}>{to || '—'}</Text>
      </View>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActivityItem({
  activity, isLast = false, resourceRemoved = false, onOpenMember, onOpenResource,
}: Props) {
  const meta   = ACTION_META[activity.action] ?? FALLBACK_META;
  const accent = FAMILY_ACCENT[meta.family];
  const md     = (activity.metadata ?? {}) as ActivityMetadata;

  const actor = activity.actorProfile;
  const actorName = actor?.fullName ?? actor?.username ?? 'Someone';

  const actorId = ACTOR_NOT_CLICKABLE.has(activity.action)
    ? null
    : (activity.userId ?? actor?.id ?? null);

  const targetUserId =
    md.target_user_id ?? md.removed_user_id ?? md.blocked_user_id ??
    md.unblocked_user_id ?? md.new_owner_id ?? null;

  const body = renderBody();

  return (
    <View style={styles.row}>
      {/* Timeline rail + medallion */}
      <View style={styles.rail}>
        <View style={[styles.medallion, { backgroundColor: `${accent}1A`, borderColor: `${accent}33` }]}>
          <Ionicons name={meta.icon} size={15} color={accent} />
        </View>
        {!isLast && <View style={[styles.connector, { backgroundColor: COLORS.border }]} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          {actor && (
            <View style={styles.avatarWrap}>
              <Avatar url={actor.avatarUrl} name={actor.fullName ?? actor.username} size={22} />
            </View>
          )}
          <Text style={[styles.sentence, { color: COLORS.textSecondary }]}>
            <NameChip
              name={actorName}
              userId={actorId}
              color={accent}
              onOpenMember={onOpenMember}
              fallback={actor}
            />
            {' '}
            {body.sentence}
          </Text>
        </View>

        {body.extra}

        <Text style={[styles.time, { color: COLORS.textMuted }]}>{timeAgo(activity.createdAt)}</Text>
      </View>
    </View>
  );

  // ── Per-action renderer ──────────────────────────────────────────────────
  function renderBody(): { sentence: React.ReactNode; extra: React.ReactNode } {
    const noExtra = null;

    switch (activity.action) {
      // ── Reports ──
      case 'report_added': {
        const title = md.report_title ?? 'a report';
        return {
          sentence: 'added a research report',
          extra: (
            <TitlePill
              title={title}
              icon="document-text"
              color={accent}
              onPress={
                onOpenResource && activity.resourceId
                  ? () => onOpenResource('report', md.report_id ?? activity.resourceId!, md.report_id ?? activity.resourceId!, title)
                  : undefined
              }
            />
          ),
        };
      }
      case 'report_removed': {
        const title = md.report_title ?? 'a report';
        return {
          sentence: 'removed a research report',
          extra: <TitlePill title={title} icon="document-text-outline" color={accent} />,
        };
      }

      // ── Pins ──
      case 'report_pinned':
      case 'report_unpinned': {
        const title  = md.report_title ?? 'a report';
        const pinned = activity.action === 'report_pinned';
        return {
          sentence: pinned ? 'pinned a report' : 'unpinned a report',
          extra: (
            <TitlePill
              title={title}
              icon={pinned ? 'pin' : 'pin-outline'}
              color={accent}
              onPress={
                onOpenResource && activity.resourceId
                  ? () => onOpenResource('report', md.report_id ?? activity.resourceId!, md.report_id ?? activity.resourceId!, title)
                  : undefined
              }
            />
          ),
        };
      }

      // ── Shared content ──
      case 'presentation_shared':
      case 'academic_paper_shared':
      case 'podcast_shared':
      case 'debate_shared':
      case 'voice_debate_shared': {
        const kind  = resourceKindForShare(activity.action);
        const title = md.title ?? md.topic ?? 'an item';
        const label = SHARE_LABEL[activity.action] ?? 'shared content';
        const canOpen = !resourceRemoved && !!onOpenResource && !!activity.resourceId;
        return {
          sentence: `shared ${label}`,
          extra: (
            <TitlePill
              title={title}
              icon={meta.icon}
              color={accent}
              onPress={
                canOpen
                  ? () => onOpenResource!(kind, activity.resourceId!, md.report_id, title)
                  : undefined
              }
            />
          ),
        };
      }

      // ── Shared content removed ──
      case 'presentation_unshared':
      case 'academic_paper_unshared':
      case 'podcast_unshared':
      case 'debate_unshared':
      case 'voice_debate_unshared': {
        const title = md.title ?? md.topic ?? 'an item';
        const label = UNSHARE_LABEL[activity.action] ?? 'shared content';
        return {
          sentence: `removed ${label}`,
          extra: <TitlePill title={title} icon={meta.icon} color={accent} />,
        };
      }

      // ── Membership ──
      case 'member_joined': {
        return { sentence: 'joined the workspace', extra: noExtra };
      }
      case 'member_left': {
        return { sentence: 'left the workspace', extra: noExtra };
      }
      case 'member_removed': {
        const target = md.removed_name ?? 'a member';
        return {
          sentence: (
            <>
              removed{' '}
              <NameChip name={target} userId={null} color={accent} />
            </>
          ),
          extra: noExtra,
        };
      }
      case 'member_blocked': {
        const target = md.blocked_name ?? 'a member';
        return {
          sentence: (
            <>
              blocked{' '}
              <NameChip name={target} userId={null} color={accent} />
            </>
          ),
          extra: noExtra,
        };
      }
      case 'member_unblocked': {
        const target = md.unblocked_name ?? 'a member';
        return {
          sentence: (
            <>
              unblocked{' '}
              <NameChip name={target} userId={null} color={accent} />
            </>
          ),
          extra: noExtra,
        };
      }
      case 'member_role_changed': {
        const target  = md.target_name ?? 'a member';
        const newRole = md.new_role ?? 'a new role';
        return {
          sentence: (
            <>
              changed{' '}
              <NameChip name={target} userId={targetUserId} color={accent} onOpenMember={onOpenMember} />
              {"'s role to "}
              <Text style={[styles.roleTag, { color: accent }]}>{newRole}</Text>
            </>
          ),
          extra: noExtra,
        };
      }
      case 'ownership_transferred': {
        const newOwner = md.new_owner_name ?? 'a new owner';
        return {
          sentence: (
            <>
              transferred ownership to{' '}
              <NameChip name={newOwner} userId={targetUserId} color={accent} onOpenMember={onOpenMember} />
            </>
          ),
          extra: noExtra,
        };
      }

      // ── Access requests ──
      case 'access_request_sent': {
        return { sentence: 'requested editor access', extra: noExtra };
      }
      case 'access_request_approved': {
        const requester = md.requester_name ?? 'a member';
        return {
          sentence: (
            <>
              granted editor access to{' '}
              <NameChip name={requester} userId={targetUserId} color={accent} onOpenMember={onOpenMember} />
            </>
          ),
          extra: noExtra,
        };
      }
      case 'access_request_denied': {
        const requester = md.requester_name ?? 'a member';
        return {
          sentence: (
            <>
              denied editor access for{' '}
              <NameChip name={requester} userId={targetUserId} color={accent} onOpenMember={onOpenMember} />
            </>
          ),
          extra: noExtra,
        };
      }

      // ── Settings ──
      case 'workspace_renamed': {
        return {
          sentence: 'renamed the workspace',
          extra: <DiffRow from={md.old_name ?? ''} to={md.new_name ?? ''} color={accent} />,
        };
      }
      case 'workspace_description_changed': {
        return {
          sentence: 'updated the description',
          extra: <DiffRow from={md.old_description ?? ''} to={md.new_description ?? ''} color={accent} />,
        };
      }
      case 'workspace_logo_changed': {
        return {
          sentence: md.removed ? 'removed the workspace logo' : 'updated the workspace logo',
          extra: noExtra,
        };
      }
      case 'workspace_updated': {
        return { sentence: 'updated workspace settings', extra: noExtra };
      }
      case 'workspace_created': {
        return { sentence: 'created this workspace', extra: noExtra };
      }

      default:
        return { sentence: activity.action.replace(/_/g, ' '), extra: noExtra };
    }
  }
}

const SHARE_LABEL: Partial<Record<WorkspaceActivityAction, string>> = {
  presentation_shared:   'a presentation',
  academic_paper_shared: 'an academic paper',
  podcast_shared:        'a podcast',
  debate_shared:         'a debate',
  voice_debate_shared:   'a voice debate',
};

const UNSHARE_LABEL: Partial<Record<WorkspaceActivityAction, string>> = {
  presentation_unshared:   'a presentation',
  academic_paper_unshared: 'an academic paper',
  podcast_unshared:        'a podcast',
  debate_unshared:         'a debate',
  voice_debate_unshared:   'a voice debate',
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    gap:               12,
    paddingHorizontal: 4,
  },
  // Timeline rail
  rail: {
    alignItems: 'center',
    width:      34,
  },
  medallion: {
    width:          34,
    height:         34,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
  },
  connector: {
    flex:            1,
    width:           2,
    marginTop:       4,
    marginBottom:    -4,
    borderRadius:    1,
  },
  // Content
  content: {
    flex:         1,
    paddingTop:   4,
    paddingBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
  },
  avatarWrap: {
    marginRight:  8,
    borderRadius: 11,
    overflow:     'hidden',
    width:        22,
    height:       22,
  },
  sentence: {
    flex:       1,
    fontSize:   FONTS.sizes.sm,
    lineHeight: 20,
  },
  nameStatic: {
    fontWeight: '700',
  },
  nameLink: {
    fontWeight:           '700',
    textDecorationLine:   'underline',
  },
  roleTag: {
    fontWeight:     '800',
    textTransform:  'capitalize',
  },
  // Title pill
  titlePill: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    gap:               7,
    marginTop:         8,
    marginLeft:        30,
    paddingHorizontal: 11,
    paddingVertical:   8,
    borderRadius:      RADIUS.lg,
    borderWidth:       1,
  },
  titlePillText: {
    flex:       1,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
    lineHeight: 17,
  },
  // Diff
  diffWrap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginTop:     8,
    marginLeft:    30,
    flexWrap:      'wrap',
  },
  diffOld: {
    maxWidth:          '45%',
    paddingHorizontal: 9,
    paddingVertical:   6,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
  },
  diffOldText: {
    fontSize:            FONTS.sizes.xs,
    textDecorationLine:  'line-through',
  },
  diffNew: {
    maxWidth:          '45%',
    paddingHorizontal: 9,
    paddingVertical:   6,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
  },
  diffNewText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  time: {
    fontSize:   FONTS.sizes.xs,
    marginTop:  6,
    marginLeft: 30,
  },
});