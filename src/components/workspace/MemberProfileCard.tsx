// src/components/workspace/MemberProfileCard.tsx
// Part 12 — Full bottom-sheet profile card with smooth animation.
// Tap any member avatar anywhere in the workspace UI to open this.

import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeOut,
  SlideInDown, SlideOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../common/Avatar';
import { useMemberProfile } from '../../hooks/useMemberProfile';
import { MiniProfile, WorkspaceRole } from '../../types';
import { COLORS, FONTS, RADIUS } from '../../constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.78;

const ROLE_CONFIG: Record<WorkspaceRole, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  owner:  { label: 'Owner',  color: COLORS.pro,     icon: 'shield-checkmark' },
  editor: { label: 'Editor', color: COLORS.primary,  icon: 'create' },
  viewer: { label: 'Viewer', color: COLORS.textMuted, icon: 'eye-outline' },
};

interface Props {
  visible:     boolean;
  member:      MiniProfile | null;
  workspaceId: string;
  onClose:     () => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateStr);
}

export function MemberProfileCard({ visible, member, workspaceId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, load, clear } = useMemberProfile();
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible && member?.id) {
      load(member.id, workspaceId);
      // Scroll to top when opening
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);
    } else if (!visible) {
      clear();
    }
  }, [visible, member?.id, workspaceId]);

  const roleConf = data?.workspaceStats?.role
    ? ROLE_CONFIG[data.workspaceStats.role]
    : null;

  // Handle animation completion - wrapped in runOnJS if needed, but for now just a placeholder
  const handleAnimationEnd = () => {
    // Animation completed callback
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={StyleSheet.absoluteFillObject}
      >
        <TouchableOpacity 
          style={{ flex: 1 }} 
          activeOpacity={1} 
          onPress={onClose}
        />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown
          .duration(300)
          .springify()
          .damping(15)
          .stiffness(200)
          .mass(1)
        }
        exiting={SlideOutDown.duration(200)}
        style={[
          styles.sheet, 
          { 
            height: SHEET_HEIGHT, 
            paddingBottom: Math.max(insets.bottom, 16),
          }
        ]}
      >
        {/* Handle */}
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        {/* Close button */}
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={COLORS.primary} size="large" />
            <Text style={styles.loadingText}>Loading profile…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : data ? (
          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            bounces={false}
            overScrollMode="never"
          >
            {/* ── Hero section ── */}
            <Animated.View 
              entering={FadeIn.duration(300)} 
              style={styles.hero}
            >
              <View style={styles.avatarRing}>
                <Avatar
                  url={data.profile.avatarUrl}
                  name={data.profile.fullName ?? data.profile.username}
                  size={72}
                />
              </View>

              <Text style={styles.heroName}>
                {data.profile.fullName ?? data.profile.username ?? 'Unknown Member'}
              </Text>
              {data.profile.username && (
                <Text style={styles.heroUsername}>@{data.profile.username}</Text>
              )}
              {data.occupation && (
                <Text style={styles.heroOccupation}>{data.occupation}</Text>
              )}

              {/* Role badge */}
              {roleConf && (
                <View style={[styles.roleBadge, { backgroundColor: `${roleConf.color}18` }]}>
                  <Ionicons name={roleConf.icon} size={13} color={roleConf.color} />
                  <Text style={[styles.roleBadgeText, { color: roleConf.color }]}>
                    {roleConf.label}
                  </Text>
                </View>
              )}

              {/* Join date */}
              {data.workspaceStats.joinedAt && (
                <Text style={styles.joinedText}>
                  Joined workspace {formatDate(data.workspaceStats.joinedAt)}
                </Text>
              )}
            </Animated.View>

            {/* ── Bio ── */}
            {data.bio && (
              <Animated.View 
                entering={FadeIn.duration(300).delay(50)} 
                style={styles.bioCard}
              >
                <Text style={styles.bioText}>{data.bio}</Text>
              </Animated.View>
            )}

            {/* ── Interests ── */}
            {data.interests && data.interests.length > 0 && (
              <Animated.View 
                entering={FadeIn.duration(300).delay(70)} 
                style={styles.interestsWrap}
              >
                {data.interests.map((tag) => (
                  <View key={tag} style={styles.interestTag}>
                    <Text style={styles.interestTagText}>{tag}</Text>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Stats grid ── */}
            <Animated.View 
              entering={FadeIn.duration(300).delay(90)} 
              style={styles.statsGrid}
            >
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

            {/* ── Recent Reports ── */}
            {data.recentReports.length > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(110)}>
                <SectionHeader icon="document-text-outline" title="Reports Added" />
                {data.recentReports.map((report) => (
                  <View key={report.id} style={styles.listItem}>
                    <View style={styles.listItemDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemTitle} numberOfLines={2}>
                        {report.title}
                      </Text>
                      <Text style={styles.listItemMeta}>{timeAgo(report.addedAt)}</Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* ── Recent Comments ── */}
            {data.recentComments.length > 0 && (
              <Animated.View entering={FadeIn.duration(300).delay(130)}>
                <SectionHeader icon="chatbubble-outline" title="Recent Comments" />
                {data.recentComments.map((comment) => (
                  <View key={comment.id} style={styles.commentItem}>
                    <View style={styles.commentItemInner}>
                      <Text style={styles.commentItemMeta} numberOfLines={1}>
                        On: {comment.reportTitle}
                        {comment.sectionId ? ' (section)' : ''}
                      </Text>
                      <Text style={styles.commentItemContent} numberOfLines={3}>
                        "{comment.content}"
                      </Text>
                      <Text style={styles.listItemMeta}>{timeAgo(comment.createdAt)}</Text>
                    </View>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Empty activity state */}
            {data.recentReports.length === 0 && data.recentComments.length === 0 && (
              <View style={styles.emptyActivity}>
                <Ionicons name="time-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.emptyActivityText}>No activity in this workspace yet</Text>
              </View>
            )}
          </ScrollView>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBox({
  icon, value, label, color,
}: {
  icon:  keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <View style={[statStyles.box, { borderColor: `${color}25` }]}>
      <View style={[statStyles.iconWrap, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

function SectionHeader({
  icon, title,
}: {
  icon:  keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  return (
    <View style={secStyles.row}>
      <Ionicons name={icon} size={14} color={COLORS.primary} />
      <Text style={secStyles.title}>{title}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position:              'absolute',
    left:                  0,
    right:                 0,
    bottom:                0,
    backgroundColor:       COLORS.backgroundCard,
    borderTopLeftRadius:   28,
    borderTopRightRadius:  28,
    borderTopWidth:        1,
    borderColor:           COLORS.border,
    shadowColor:           '#000',
    shadowOffset:          { width: 0, height: -6 },
    shadowOpacity:         0.3,
    shadowRadius:          20,
    elevation:             24,
    overflow: 'hidden',
  },
  handleWrap: { 
    alignItems: 'center', 
    paddingTop: 10, 
    paddingBottom: 4,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  handle: { 
    width: 40, 
    height: 4, 
    borderRadius: 2, 
    backgroundColor: COLORS.border,
  },
  closeBtn: {
    position: 'absolute', 
    top: 12, 
    right: 16,
    width: 32, 
    height: 32, 
    borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1, 
    borderColor: COLORS.border,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  centered: {
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    gap: 12, 
    paddingHorizontal: 24,
  },
  loadingText: { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.sm,
  },
  errorText: { 
    color: COLORS.textSecondary, 
    textAlign: 'center', 
    fontSize: FONTS.sizes.sm,
  },

  scroll: { 
    paddingHorizontal: 24, 
    paddingTop: 44,
    paddingBottom: 20,
  },

  // Hero
  hero: { 
    alignItems: 'center', 
    paddingTop: 8, 
    paddingBottom: 16, 
    gap: 6,
  },
  avatarRing: {
    width: 84, 
    height: 84, 
    borderRadius: 42,
    borderWidth: 3, 
    borderColor: `${COLORS.primary}40`,
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroName: { 
    color: COLORS.textPrimary, 
    fontSize: FONTS.sizes.xl, 
    fontWeight: '800',
  },
  heroUsername: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.sm,
  },
  heroOccupation: { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.sm, 
    fontStyle: 'italic',
  },
  roleBadge: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 5,
    borderRadius: RADIUS.full,
    paddingHorizontal: 12, 
    paddingVertical: 5,
    marginTop: 4,
  },
  roleBadgeText: { 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '700',
  },
  joinedText: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    marginTop: 4,
  },

  // Bio
  bioCard: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1, 
    borderColor: COLORS.border,
  },
  bioText: { 
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.sm, 
    lineHeight: 20,
  },

  // Interests
  interestsWrap: {
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8,
    marginBottom: 16,
  },
  interestTag: {
    backgroundColor: `${COLORS.primary}15`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10, 
    paddingVertical: 4,
    borderWidth: 1, 
    borderColor: `${COLORS.primary}25`,
  },
  interestTagText: { 
    color: COLORS.primary, 
    fontSize: FONTS.sizes.xs, 
    fontWeight: '600',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: 8,
    marginBottom: 16,
  },

  // List items (reports)
  listItem: {
    flexDirection: 'row', 
    alignItems: 'flex-start', 
    gap: 10,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, 
    padding: 12,
    marginBottom: 6,
    borderWidth: 1, 
    borderColor: COLORS.border,
  },
  listItemDot: {
    width: 6, 
    height: 6, 
    borderRadius: 3,
    backgroundColor: COLORS.primary,
    marginTop: 6, 
    flexShrink: 0,
  },
  listItemTitle: { 
    color: COLORS.textPrimary, 
    fontSize: FONTS.sizes.sm, 
    fontWeight: '600',
  },
  listItemMeta: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    marginTop: 2,
  },

  // Comment items
  commentItem: {
    marginBottom: 6,
  },
  commentItemInner: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg, 
    padding: 12,
    borderWidth: 1, 
    borderColor: COLORS.border,
    borderLeftWidth: 3, 
    borderLeftColor: `${COLORS.info}60`,
  },
  commentItemMeta: {
    color: COLORS.primary, 
    fontSize: FONTS.sizes.xs,
    fontWeight: '600', 
    marginBottom: 4,
  },
  commentItemContent: {
    color: COLORS.textSecondary, 
    fontSize: FONTS.sizes.sm,
    lineHeight: 19, 
    fontStyle: 'italic',
  },

  // Empty
  emptyActivity: {
    alignItems: 'center', 
    paddingVertical: 24, 
    gap: 10,
  },
  emptyActivityText: {
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.sm, 
    textAlign: 'center',
  },
});

const statStyles = StyleSheet.create({
  box: {
    width: '47%',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    padding: 16,
    alignItems: 'center', 
    gap: 6,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36, 
    height: 36, 
    borderRadius: 10,
    alignItems: 'center', 
    justifyContent: 'center',
  },
  value: { 
    fontSize: FONTS.sizes.xl, 
    fontWeight: '800',
  },
  label: { 
    color: COLORS.textMuted, 
    fontSize: FONTS.sizes.xs, 
    textAlign: 'center',
  },
});

const secStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6,
    marginBottom: 8, 
    marginTop: 16,
  },
  title: {
    color: COLORS.textPrimary, 
    fontSize: FONTS.sizes.sm,
    fontWeight: '700', 
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});