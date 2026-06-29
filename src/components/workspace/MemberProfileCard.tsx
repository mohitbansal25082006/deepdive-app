// src/components/workspace/MemberProfileCard.tsx
// Part 58.1 — Upgraded member profile card.
//
// What's new vs Part 18:
//   • Shared content now spans ALL FIVE types — presentations, academic papers,
//     podcasts, debates AND voice debates — each row tappable to open that
//     exact file in its viewer (via onNavigateToSharedContent).
//   • Recent comments are tappable and deep-link straight to the comment in its
//     report (via onNavigateToComment, falling back to onNavigateToReport).
//   • "Show only recent" model: each list (Shared / Reports / Comments) shows at
//     most 3 items by default with a "Show all (N)" toggle that reveals the rest
//     inline and collapses again.
//   • Fully theme-integrated (live COLORS, getModalBackdrop) and re-renders on
//     theme change. Smooth non-bouncing slide-in.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut, SlideInUp, SlideOutDown, Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../common/Avatar';
import { useMemberProfile } from '../../hooks/useMemberProfile';
import { useTheme } from '../../context/ThemeContext';
import type {
  MemberSharedContentItem,
  MemberSharedContentType,
  MemberRecentComment,
  MemberRecentReport,
} from '../../services/memberProfileService';
import { MiniProfile, WorkspaceRole } from '../../types';
import { COLORS, FONTS, RADIUS, getModalBackdrop } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

const INITIAL_VISIBLE = 3; // Part 58.1 — show only 3, then "Show all"

const ROLE_CONFIG: Record<
  WorkspaceRole,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  owner:  { label: 'Owner',  color: COLORS.pro ?? COLORS.warning, icon: 'shield-checkmark' },
  editor: { label: 'Editor', color: COLORS.primary,               icon: 'create'           },
  viewer: { label: 'Viewer', color: COLORS.textMuted,             icon: 'eye-outline'      },
};

const SHARED_CONTENT_ICONS: Record<
  MemberSharedContentType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  presentation:   { icon: 'easel-outline',      color: '#3B82F6', label: 'Slides'   },
  academic_paper: { icon: 'school-outline',     color: '#10B981', label: 'Paper'    },
  podcast:        { icon: 'mic-outline',        color: '#F59E0B', label: 'Podcast'  },
  debate:         { icon: 'people-outline',     color: '#6C63FF', label: 'Debate'   },
  voice_debate:   { icon: 'mic-circle-outline', color: '#8B5CF6', label: 'Voice'    },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:      boolean;
  member:       MiniProfile | null;
  workspaceId:  string;
  onClose:      () => void;
  onNavigateToReport?:        (reportId: string)                    => void;
  onNavigateToComment?:       (reportId: string, commentId: string) => void;
  /** Part 58.1: open a shared content item directly in its viewer. */
  onNavigateToSharedContent?: (item: MemberSharedContentItem)       => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeAgo(d: string): string {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60)     return 'just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(d);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MemberProfileCard({
  visible, member, workspaceId, onClose,
  onNavigateToReport, onNavigateToComment, onNavigateToSharedContent,
}: Props) {
  // Re-render on theme change
  useTheme();

  const insets = useSafeAreaInsets();
  const { data, isLoading, error, load, clear } = useMemberProfile();
  const scrollRef = useRef<ScrollView>(null);

  // "Show all" toggles per list
  const [showAllShared,   setShowAllShared]   = useState(false);
  const [showAllReports,  setShowAllReports]  = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);

  useEffect(() => {
    if (visible && member?.id) {
      load(member.id, workspaceId);
      setShowAllShared(false);
      setShowAllReports(false);
      setShowAllComments(false);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
    } else if (!visible) {
      clear();
    }
  }, [visible, member?.id, workspaceId]);

  const roleConf = data?.workspaceStats?.role ? ROLE_CONFIG[data.workspaceStats.role] : null;

  // Close, then run navigation after the sheet animates out
  const navigate = useCallback((fn: (() => void) | undefined) => {
    if (!fn) return;
    onClose();
    setTimeout(fn, 220);
  }, [onClose]);

  const sharedStats = data?.sharedStats;
  const totalShared = sharedStats
    ? sharedStats.presentations + sharedStats.papers +
      sharedStats.podcasts + sharedStats.debates + sharedStats.voiceDebates
    : 0;

  const sharedItems   = data?.sharedItems   ?? [];
  const recentReports = data?.recentReports ?? [];
  const recentComments = data?.recentComments ?? [];

  const visibleShared   = showAllShared   ? sharedItems   : sharedItems.slice(0, INITIAL_VISIBLE);
  const visibleReports  = showAllReports  ? recentReports : recentReports.slice(0, INITIAL_VISIBLE);
  const visibleComments = showAllComments ? recentComments : recentComments.slice(0, INITIAL_VISIBLE);

  const backdropColor = getModalBackdrop(0.5);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropColor }]}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View
        entering={SlideInUp.duration(340).easing(Easing.out(Easing.cubic))}
        exiting={SlideOutDown.duration(220).easing(Easing.in(Easing.quad))}
        style={[
          styles.sheet,
          {
            backgroundColor: COLORS.backgroundCard,
            borderColor: COLORS.border,
            height: SHEET_HEIGHT,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={[styles.closeBtn, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}
        >
          <Ionicons name="close" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={[styles.loadingText, { color: COLORS.textSecondary }]}>Loading profile…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
            <Text style={[styles.errorText, { color: COLORS.textSecondary }]}>{error}</Text>
          </View>
        ) : data ? (
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            bounces={false}
          >
            {/* ── Hero ── */}
            <Animated.View entering={FadeIn.duration(300)} style={styles.hero}>
              <View style={[styles.avatarRing, { borderColor: `${COLORS.primary}40` }]}>
                <Avatar
                  url={data.profile.avatarUrl}
                  name={data.profile.fullName ?? data.profile.username}
                  size={72}
                />
              </View>
              <Text style={[styles.heroName, { color: COLORS.textPrimary }]}>
                {data.profile.fullName ?? data.profile.username ?? 'Unknown'}
              </Text>
              {data.profile.username && (
                <Text style={[styles.heroUsername, { color: COLORS.textMuted }]}>
                  @{data.profile.username}
                </Text>
              )}
              {data.occupation && (
                <Text style={[styles.heroOccupation, { color: COLORS.textSecondary }]}>
                  {data.occupation}
                </Text>
              )}
              {roleConf && (
                <View style={[styles.roleBadge, { backgroundColor: `${roleConf.color}18` }]}>
                  <Ionicons name={roleConf.icon} size={13} color={roleConf.color} />
                  <Text style={[styles.roleBadgeText, { color: roleConf.color }]}>
                    {roleConf.label}
                  </Text>
                </View>
              )}
              {data.workspaceStats.joinedAt && (
                <Text style={[styles.joinedText, { color: COLORS.textMuted }]}>
                  Joined workspace {formatDate(data.workspaceStats.joinedAt)}
                </Text>
              )}
            </Animated.View>

            {/* ── Bio ── */}
            {data.bio && (
              <Animated.View
                entering={FadeIn.duration(300).delay(50)}
                style={[styles.bioCard, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}
              >
                <Text style={[styles.bioText, { color: COLORS.textSecondary }]}>{data.bio}</Text>
              </Animated.View>
            )}

            {/* ── Interests ── */}
            {data.interests && data.interests.length > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(70)} style={styles.interestsWrap}>
                {data.interests.map(tag => (
                  <View
                    key={tag}
                    style={[styles.interestTag, { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}25` }]}
                  >
                    <Text style={[styles.interestTagText, { color: COLORS.primary }]}>{tag}</Text>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Workspace stats grid ── */}
            <Animated.View entering={FadeIn.duration(300).delay(90)} style={styles.statsGrid}>
              <StatBox icon="document-text-outline"       value={data.workspaceStats.reportsAdded}  label="Reports Added" color={COLORS.primary} />
              <StatBox icon="chatbubble-outline"          value={data.workspaceStats.commentsMade}  label="Comments"      color={COLORS.info} />
              <StatBox icon="return-down-forward-outline" value={data.workspaceStats.repliesMade}   label="Replies"       color={COLORS.success} />
              <StatBox icon="pin-outline"                 value={data.workspaceStats.reportsPinned} label="Pinned"        color={COLORS.warning} />
            </Animated.View>

            {/* ── Shared content ── */}
            {totalShared > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(100)}>
                <SectionHeader icon="share-outline" title="Shared Content" hasNav={!!onNavigateToSharedContent} />

                {/* Per-type stat chips */}
                <View style={styles.sharedStatsRow}>
                  {sharedStats!.presentations > 0 && <SharedStatChip count={sharedStats!.presentations} {...SHARED_CONTENT_ICONS.presentation} />}
                  {sharedStats!.papers        > 0 && <SharedStatChip count={sharedStats!.papers}        {...SHARED_CONTENT_ICONS.academic_paper} />}
                  {sharedStats!.podcasts      > 0 && <SharedStatChip count={sharedStats!.podcasts}      {...SHARED_CONTENT_ICONS.podcast} />}
                  {sharedStats!.debates       > 0 && <SharedStatChip count={sharedStats!.debates}       {...SHARED_CONTENT_ICONS.debate} />}
                  {sharedStats!.voiceDebates  > 0 && <SharedStatChip count={sharedStats!.voiceDebates}  {...SHARED_CONTENT_ICONS.voice_debate} />}
                </View>

                {/* Shared items list (3, then show all) */}
                {sharedItems.length > 0 && (
                  <View style={styles.itemsList}>
                    {visibleShared.map(item => {
                      const conf = SHARED_CONTENT_ICONS[item.contentType] ?? SHARED_CONTENT_ICONS.presentation;
                      const canNav = !!onNavigateToSharedContent;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.sharedItem,
                            { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
                            canNav && { borderColor: `${conf.color}40` },
                          ]}
                          onPress={() => canNav && navigate(() => onNavigateToSharedContent!(item))}
                          disabled={!canNav}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.sharedItemIcon, { backgroundColor: `${conf.color}15` }]}>
                            <Ionicons name={conf.icon} size={15} color={conf.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.sharedItemTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <View style={styles.sharedItemMetaRow}>
                              <View style={[styles.typeTag, { backgroundColor: `${conf.color}14` }]}>
                                <Text style={[styles.typeTagText, { color: conf.color }]}>{conf.label}</Text>
                              </View>
                              <Text style={[styles.sharedItemMeta, { color: COLORS.textMuted }]}>
                                {timeAgo(item.sharedAt)}
                              </Text>
                            </View>
                          </View>
                          {canNav && <Ionicons name="chevron-forward" size={14} color={conf.color} />}
                        </TouchableOpacity>
                      );
                    })}
                    <ShowAllToggle
                      total={sharedItems.length}
                      expanded={showAllShared}
                      onToggle={() => setShowAllShared(v => !v)}
                    />
                  </View>
                )}
              </Animated.View>
            )}

            {/* ── Recent Reports ── */}
            {recentReports.length > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(110)}>
                <SectionHeader icon="document-text-outline" title="Reports Added" hasNav={!!onNavigateToReport} />
                {visibleReports.map(report => (
                  <ReportRow
                    key={report.id}
                    report={report}
                    canNav={!!onNavigateToReport}
                    onPress={() => onNavigateToReport && navigate(() => onNavigateToReport(report.id))}
                  />
                ))}
                <ShowAllToggle
                  total={recentReports.length}
                  expanded={showAllReports}
                  onToggle={() => setShowAllReports(v => !v)}
                />
              </Animated.View>
            )}

            {/* ── Recent Comments ── */}
            {recentComments.length > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(130)}>
                <SectionHeader
                  icon="chatbubble-outline"
                  title="Recent Comments"
                  hasNav={!!(onNavigateToComment || onNavigateToReport)}
                />
                {visibleComments.map(comment => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    canNav={!!(onNavigateToComment || onNavigateToReport)}
                    onPress={() => navigate(() => {
                      if (onNavigateToComment) onNavigateToComment(comment.reportId, comment.id);
                      else if (onNavigateToReport) onNavigateToReport(comment.reportId);
                    })}
                  />
                ))}
                <ShowAllToggle
                  total={recentComments.length}
                  expanded={showAllComments}
                  onToggle={() => setShowAllComments(v => !v)}
                />
              </Animated.View>
            )}

            {/* Empty activity */}
            {recentReports.length === 0 && recentComments.length === 0 && totalShared === 0 && (
              <View style={styles.emptyActivity}>
                <Ionicons name="time-outline" size={32} color={COLORS.textMuted} />
                <Text style={[styles.emptyActivityText, { color: COLORS.textMuted }]}>
                  No activity in this workspace yet
                </Text>
              </View>
            )}
          </ScrollView>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({ icon, value, label, color }: {
  icon: keyof typeof Ionicons.glyphMap; value: number; label: string; color: string;
}) {
  return (
    <View style={[statStyles.box, { backgroundColor: COLORS.backgroundElevated, borderColor: `${color}25` }]}>
      <View style={[statStyles.iconWrap, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={[statStyles.label, { color: COLORS.textMuted }]}>{label}</Text>
    </View>
  );
}

function SharedStatChip({ count, label, icon, color }: {
  count: number; label: string; icon: keyof typeof Ionicons.glyphMap; color: string;
}) {
  return (
    <View style={[sharedStyles.chip, { backgroundColor: `${color}12`, borderColor: `${color}25` }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[sharedStyles.chipValue, { color }]}>{count}</Text>
      <Text style={[sharedStyles.chipLabel, { color: COLORS.textMuted }]}>{label}</Text>
    </View>
  );
}

function ReportRow({ report, canNav, onPress }: {
  report: MemberRecentReport; canNav: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.listItem,
        { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
        canNav && { borderColor: `${COLORS.primary}30` },
      ]}
      onPress={() => canNav && onPress()}
      disabled={!canNav}
      activeOpacity={0.7}
    >
      <View style={[styles.listItemDot, { backgroundColor: COLORS.primary }]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.listItemTitle, { color: COLORS.textPrimary }]} numberOfLines={2}>
          {report.title}
        </Text>
        <Text style={[styles.listItemMeta, { color: COLORS.textMuted }]}>{timeAgo(report.addedAt)}</Text>
      </View>
      {canNav && <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />}
    </TouchableOpacity>
  );
}

function CommentRow({ comment, canNav, onPress }: {
  comment: MemberRecentComment; canNav: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.commentItem}
      onPress={() => canNav && onPress()}
      disabled={!canNav}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.commentItemInner,
          {
            backgroundColor: COLORS.backgroundElevated,
            borderColor: COLORS.border,
            borderLeftColor: `${COLORS.info}60`,
          },
        ]}
      >
        <View style={styles.commentItemTopRow}>
          <Text style={[styles.commentItemMeta, { color: COLORS.primary }]} numberOfLines={1}>
            On: {comment.reportTitle}{comment.sectionId ? ' (section)' : ''}
          </Text>
          {canNav && <Ionicons name="chevron-forward" size={12} color={COLORS.primary} />}
        </View>
        <Text style={[styles.commentItemContent, { color: COLORS.textSecondary }]} numberOfLines={3}>
          "{comment.content}"
        </Text>
        <Text style={[styles.listItemMeta, { color: COLORS.textMuted }]}>{timeAgo(comment.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function ShowAllToggle({ total, expanded, onToggle }: {
  total: number; expanded: boolean; onToggle: () => void;
}) {
  if (total <= INITIAL_VISIBLE) return null;
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.75}
      style={[styles.showAllBtn, { borderColor: COLORS.border, backgroundColor: `${COLORS.primary}0A` }]}
    >
      <Text style={[styles.showAllText, { color: COLORS.primary }]}>
        {expanded ? 'Show less' : `Show all (${total})`}
      </Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={COLORS.primary} />
    </TouchableOpacity>
  );
}

function SectionHeader({ icon, title, hasNav }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; hasNav: boolean;
}) {
  return (
    <View style={secStyles.row}>
      <Ionicons name={icon} size={14} color={COLORS.primary} />
      <Text style={[secStyles.title, { color: COLORS.textPrimary }]}>{title}</Text>
      {hasNav && (
        <View style={[secStyles.tapHint, { backgroundColor: `${COLORS.primary}15` }]}>
          <Text style={[secStyles.tapHintText, { color: COLORS.primary }]}>tap to open</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.3, shadowRadius: 20, elevation: 24,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center', paddingTop: 10, paddingBottom: 4,
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
  },
  handle: { width: 40, height: 4, borderRadius: 2 },
  closeBtn: {
    position: 'absolute', top: 12, right: 16,
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, zIndex: 20,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  loadingText: { fontSize: FONTS.sizes.sm },
  errorText: { textAlign: 'center', fontSize: FONTS.sizes.sm },
  scroll: { paddingHorizontal: 24, paddingTop: 44, paddingBottom: 20 },
  hero: { alignItems: 'center', paddingTop: 8, paddingBottom: 16, gap: 6 },
  avatarRing: {
    width: 84, height: 84, borderRadius: 42, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  heroName: { fontSize: FONTS.sizes.xl, fontWeight: '800' },
  heroUsername: { fontSize: FONTS.sizes.sm },
  heroOccupation: { fontSize: FONTS.sizes.sm, fontStyle: 'italic' },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 5, marginTop: 4,
  },
  roleBadgeText: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
  joinedText: { fontSize: FONTS.sizes.xs, marginTop: 4 },
  bioCard: { borderRadius: RADIUS.lg, padding: 16, marginBottom: 8, borderWidth: 1 },
  bioText: { fontSize: FONTS.sizes.sm, lineHeight: 20 },
  interestsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  interestTag: { borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  interestTagText: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },

  sharedStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  itemsList: { gap: 6, marginBottom: 8 },
  sharedItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: RADIUS.lg, padding: 10, borderWidth: 1,
  },
  sharedItemIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sharedItemTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700' },
  sharedItemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  typeTag: { borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 1 },
  typeTagText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  sharedItemMeta: { fontSize: 10 },

  listItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: RADIUS.lg, padding: 12, marginBottom: 6, borderWidth: 1,
  },
  listItemDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  listItemTitle: { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  listItemMeta: { fontSize: FONTS.sizes.xs, marginTop: 2 },

  commentItem: { marginBottom: 6 },
  commentItemInner: { borderRadius: RADIUS.lg, padding: 12, borderWidth: 1, borderLeftWidth: 3 },
  commentItemTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  commentItemMeta: { fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },
  commentItemContent: { fontSize: FONTS.sizes.sm, lineHeight: 19, fontStyle: 'italic' },

  showAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: RADIUS.lg, borderWidth: 1, paddingVertical: 9, marginTop: 2, marginBottom: 4,
  },
  showAllText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },

  emptyActivity: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  emptyActivityText: { fontSize: FONTS.sizes.sm, textAlign: 'center' },
});

const statStyles = StyleSheet.create({
  box: { width: '47%', borderRadius: RADIUS.lg, padding: 16, alignItems: 'center', gap: 6, borderWidth: 1 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: FONTS.sizes.xl, fontWeight: '800' },
  label: { fontSize: FONTS.sizes.xs, textAlign: 'center' },
});

const sharedStyles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  chipValue: { fontSize: FONTS.sizes.sm, fontWeight: '800' },
  chipLabel: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
});

const secStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 16 },
  title: { fontSize: FONTS.sizes.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 },
  tapHint: { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  tapHintText: { fontSize: 9, fontWeight: '700' },
});