// src/components/workspace/MemberProfileCard.tsx
// Part 18 — Added shared-content stats (presentations, papers, podcasts, debates)
// and tappable shared-item rows that navigate to the shared content.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. Uses getModalBackdrop for backdrop.
//             No dark-only assumptions.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInUp, SlideOutDown, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../common/Avatar';
import { useMemberProfile } from '../../hooks/useMemberProfile';
import { MiniProfile, WorkspaceRole, MemberSharedStats, MemberSharedItem } from '../../types';
import { COLORS, FONTS, RADIUS, getModalBackdrop } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;

const ROLE_CONFIG: Record<
  WorkspaceRole,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  owner:  { label: 'Owner',  color: COLORS.pro ?? COLORS.warning, icon: 'shield-checkmark' },
  editor: { label: 'Editor', color: COLORS.primary,               icon: 'create'           },
  viewer: { label: 'Viewer', color: COLORS.textMuted,             icon: 'eye-outline'      },
};

const SHARED_CONTENT_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  presentation:   { icon: 'easel-outline',        color: '#3B82F6' },
  academic_paper: { icon: 'school-outline',        color: '#10B981' },
  podcast:        { icon: 'mic-outline',           color: '#F59E0B' },
  debate:         { icon: 'git-compare-outline',   color: '#8B5CF6' },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:      boolean;
  member:       MiniProfile | null;
  workspaceId:  string;
  onClose:      () => void;
  onNavigateToReport?:  (reportId: string)                      => void;
  onNavigateToComment?: (reportId: string, commentId: string)   => void;
  /** Part 18: navigate to a shared content item */
  onNavigateToSharedContent?: (item: MemberSharedItem) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function timeAgo(d: string): string {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
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
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, load, clear } = useMemberProfile();
  const scrollRef = useRef<ScrollView>(null);

  // Part 18: shared content stats + items
  const [sharedStats, setSharedStats] = React.useState<MemberSharedStats | null>(null);
  const [sharedItems, setSharedItems] = React.useState<MemberSharedItem[]>([]);
  const [loadingShared, setLoadingShared] = React.useState(false);

  useEffect(() => {
    if (visible && member?.id) {
      load(member.id, workspaceId);
      loadSharedContent(member.id);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 50);
    } else if (!visible) {
      clear();
      setSharedStats(null);
      setSharedItems([]);
    }
  }, [visible, member?.id, workspaceId]);

  const loadSharedContent = async (userId: string) => {
    setLoadingShared(true);
    try {
      const [statsRes, itemsRes] = await Promise.all([
        supabase.rpc('get_member_shared_content_stats', {
          p_user_id:      userId,
          p_workspace_id: workspaceId,
        }),
        supabase.rpc('get_member_shared_items', {
          p_user_id:      userId,
          p_workspace_id: workspaceId,
          p_limit:        8,
        }),
      ]);

      if (statsRes.data) {
        const r = statsRes.data as Record<string, number>;
        setSharedStats({
          presentations: r.presentations ?? 0,
          papers:        r.papers        ?? 0,
          podcasts:      r.podcasts      ?? 0,
          debates:       r.debates       ?? 0,
        });
      }

      if (itemsRes.data && Array.isArray(itemsRes.data)) {
        setSharedItems(
          (itemsRes.data as Record<string, unknown>[]).map(row => ({
            id:          row.id          as string,
            contentType: row.content_type as MemberSharedItem['contentType'],
            title:       row.title        as string,
            subtitle:    row.subtitle     as string | undefined,
            contentId:   row.content_id   as string,
            reportId:    row.report_id    as string | undefined,
            sharedAt:    row.shared_at    as string,
          })),
        );
      }
    } catch (e) {
      console.warn('[MemberProfileCard] loadSharedContent error:', e);
    } finally {
      setLoadingShared(false);
    }
  };

  const roleConf = data?.workspaceStats?.role ? ROLE_CONFIG[data.workspaceStats.role] : null;

  const navigate = (fn: (() => void) | undefined) => {
    if (!fn) return;
    onClose();
    setTimeout(fn, 200);
  };

  const totalShared = sharedStats
    ? (sharedStats.presentations + sharedStats.papers + sharedStats.podcasts + sharedStats.debates)
    : 0;

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
          style={[
            styles.closeBtn,
            { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
          ]}
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
                style={[
                  styles.bioCard,
                  { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border },
                ]}
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
                    style={[
                      styles.interestTag,
                      { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}25` },
                    ]}
                  >
                    <Text style={[styles.interestTagText, { color: COLORS.primary }]}>{tag}</Text>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Workspace stats grid ── */}
            <Animated.View entering={FadeIn.duration(300).delay(90)} style={styles.statsGrid}>
              <StatBox
                icon="document-text-outline"
                value={data.workspaceStats.reportsAdded}
                label="Reports Added"
                color={COLORS.primary}
              />
              <StatBox
                icon="chatbubble-outline"
                value={data.workspaceStats.commentsMade}
                label="Comments"
                color={COLORS.info}
              />
              <StatBox
                icon="return-down-forward-outline"
                value={data.workspaceStats.repliesMade}
                label="Replies"
                color={COLORS.success}
              />
              <StatBox
                icon="pin-outline"
                value={data.workspaceStats.reportsPinned}
                label="Pinned"
                color={COLORS.warning}
              />
            </Animated.View>

            {/* ── Part 18: Shared content stats ── */}
            {sharedStats && totalShared > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(100)}>
                <SectionHeader icon="share-outline" title="Shared Content" hasNav={false} />
                <View style={styles.sharedStatsRow}>
                  {sharedStats.presentations > 0 && (
                    <SharedStatChip
                      count={sharedStats.presentations}
                      label="Slides"
                      icon="easel-outline"
                      color="#3B82F6"
                    />
                  )}
                  {sharedStats.papers > 0 && (
                    <SharedStatChip
                      count={sharedStats.papers}
                      label="Papers"
                      icon="school-outline"
                      color="#10B981"
                    />
                  )}
                  {sharedStats.podcasts > 0 && (
                    <SharedStatChip
                      count={sharedStats.podcasts}
                      label="Podcasts"
                      icon="mic-outline"
                      color="#F59E0B"
                    />
                  )}
                  {sharedStats.debates > 0 && (
                    <SharedStatChip
                      count={sharedStats.debates}
                      label="Debates"
                      icon="git-compare-outline"
                      color="#8B5CF6"
                    />
                  )}
                </View>

                {/* Shared items list */}
                {sharedItems.length > 0 && (
                  <View style={styles.sharedItemsList}>
                    {sharedItems.map(item => {
                      const conf = SHARED_CONTENT_ICONS[item.contentType] ?? {
                        icon: 'attach-outline' as keyof typeof Ionicons.glyphMap,
                        color: COLORS.primary,
                      };
                      const canNav = !!onNavigateToSharedContent;
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.sharedItem,
                            {
                              backgroundColor: COLORS.backgroundElevated,
                              borderColor: COLORS.border,
                            },
                            canNav && {
                              borderColor: `${COLORS.primary}30`,
                            },
                          ]}
                          onPress={() => canNav && navigate(() => onNavigateToSharedContent!(item))}
                          disabled={!canNav}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.sharedItemIcon, { backgroundColor: `${conf.color}15` }]}>
                            <Ionicons name={conf.icon} size={14} color={conf.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.sharedItemTitle, { color: COLORS.textPrimary }]} numberOfLines={1}>
                              {item.title}
                            </Text>
                            <Text style={[styles.sharedItemMeta, { color: COLORS.textMuted }]}>
                              {timeAgo(item.sharedAt)}
                            </Text>
                          </View>
                          {canNav && (
                            <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </Animated.View>
            )}

            {/* ── Recent Reports ── */}
            {data.recentReports.length > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(110)}>
                <SectionHeader icon="document-text-outline" title="Reports Added" hasNav={!!onNavigateToReport} />
                {data.recentReports.map(report => (
                  <TouchableOpacity
                    key={report.id}
                    style={[
                      styles.listItem,
                      {
                        backgroundColor: COLORS.backgroundElevated,
                        borderColor: COLORS.border,
                      },
                      !!onNavigateToReport && {
                        borderColor: `${COLORS.primary}30`,
                      },
                    ]}
                    onPress={() => onNavigateToReport && navigate(() => onNavigateToReport(report.id))}
                    disabled={!onNavigateToReport}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.listItemDot, { backgroundColor: COLORS.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listItemTitle, { color: COLORS.textPrimary }]} numberOfLines={2}>
                        {report.title}
                      </Text>
                      <Text style={[styles.listItemMeta, { color: COLORS.textMuted }]}>
                        {timeAgo(report.addedAt)}
                      </Text>
                    </View>
                    {!!onNavigateToReport && (
                      <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}

            {/* ── Recent Comments ── */}
            {data.recentComments.length > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(130)}>
                <SectionHeader
                  icon="chatbubble-outline"
                  title="Recent Comments"
                  hasNav={!!(onNavigateToComment || onNavigateToReport)}
                />
                {data.recentComments.map(comment => {
                  const canNav = !!(onNavigateToComment || onNavigateToReport);
                  return (
                    <TouchableOpacity
                      key={comment.id}
                      style={[
                        styles.commentItem,
                        canNav && styles.commentItemTappable,
                      ]}
                      onPress={() => canNav && navigate(() => {
                        if (onNavigateToComment) onNavigateToComment(comment.reportId, comment.id);
                        else if (onNavigateToReport) onNavigateToReport(comment.reportId);
                      })}
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
                          {canNav && (
                            <Ionicons name="chevron-forward" size={12} color={COLORS.primary} />
                          )}
                        </View>
                        <Text style={[styles.commentItemContent, { color: COLORS.textSecondary }]} numberOfLines={3}>
                          "{comment.content}"
                        </Text>
                        <Text style={[styles.listItemMeta, { color: COLORS.textMuted }]}>
                          {timeAgo(comment.createdAt)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            )}

            {/* Empty activity */}
            {data.recentReports.length === 0 && data.recentComments.length === 0 && totalShared === 0 && (
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
    <View style={[
      statStyles.box,
      {
        backgroundColor: COLORS.backgroundElevated,
        borderColor: `${color}25`,
      },
    ]}>
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
    <View style={[
      sharedStyles.chip,
      { backgroundColor: `${color}12`, borderColor: `${color}25` },
    ]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[sharedStyles.chipValue, { color }]}>{count}</Text>
      <Text style={[sharedStyles.chipLabel, { color: COLORS.textMuted }]}>{label}</Text>
    </View>
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
  sharedItemsList: { gap: 6, marginBottom: 8 },
  sharedItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: RADIUS.lg, padding: 10, borderWidth: 1,
  },
  sharedItemIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sharedItemTitle: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  sharedItemMeta: { fontSize: 10, marginTop: 1 },

  listItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: RADIUS.lg, padding: 12, marginBottom: 6, borderWidth: 1,
  },
  listItemDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, flexShrink: 0 },
  listItemTitle: { fontSize: FONTS.sizes.sm, fontWeight: '600' },
  listItemMeta: { fontSize: FONTS.sizes.xs, marginTop: 2 },
  commentItem: { marginBottom: 6 },
  commentItemTappable: {},
  commentItemInner: {
    borderRadius: RADIUS.lg, padding: 12, borderWidth: 1, borderLeftWidth: 3,
  },
  commentItemTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
  },
  commentItemMeta: { fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },
  commentItemContent: { fontSize: FONTS.sizes.sm, lineHeight: 19, fontStyle: 'italic' },
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