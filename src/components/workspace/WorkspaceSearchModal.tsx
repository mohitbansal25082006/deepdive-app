// src/components/workspace/WorkspaceSearchModal.tsx
// Part 11 — Full-screen workspace search: reports, comments, members.
// Part 13A UPDATE:
//   • Added `onOpenMemberProfile` optional callback.
//   • Member results now show a tappable arrow and open the profile card
//     instead of silently dismissing.
//   • Added `workspaceId` to the result so the parent can open MemberProfileCard.

import React, { useRef, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, StyleSheet, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../common/Avatar';
import { useWorkspaceSearch } from '../../hooks/useWorkspaceSearch';
import { WorkspaceSearchResult, WorkspaceRole, MiniProfile } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Icon + colour map ────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  WorkspaceSearchResult['type'],
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }
> = {
  report:  { icon: 'document-text',  color: COLORS.primary, label: 'Report'  },
  comment: { icon: 'chatbubble',     color: COLORS.info,    label: 'Comment' },
  member:  { icon: 'person-circle',  color: COLORS.accent,  label: 'Member'  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:      boolean;
  workspaceId:  string;
  userRole:     WorkspaceRole | null;
  onClose:      () => void;
  /** Called when user taps a report or comment result */
  onOpenReport: (reportId: string) => void;
  /**
   * Part 13A — Called when user taps a member result.
   * Receives a MiniProfile built from the search result.
   * If not provided, member taps just close the modal.
   */
  onOpenMemberProfile?: (member: MiniProfile) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceSearchModal({
  visible, workspaceId, userRole, onClose, onOpenReport, onOpenMemberProfile,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const {
    query, results, isSearching, error, search, clear,
  } = useWorkspaceSearch(visible ? workspaceId : null);

  // Auto-focus on open
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    } else {
      clear();
    }
  }, [visible, clear]);

  const handleClose = () => {
    Keyboard.dismiss();
    clear();
    onClose();
  };

  // ── Tap handler ───────────────────────────────────────────────────────────

  const handleResultPress = (item: WorkspaceSearchResult) => {
    Keyboard.dismiss();

    if (item.type === 'report' && item.reportId) {
      onOpenReport(item.reportId);
      handleClose();
      return;
    }

    if (item.type === 'comment' && item.reportId) {
      onOpenReport(item.reportId);
      handleClose();
      return;
    }

    if (item.type === 'member') {
      if (onOpenMemberProfile) {
        // Build a MiniProfile from search result data
        const miniProfile: MiniProfile = {
          id:        item.id,
          username:  item.subtitle.startsWith('@') ? item.subtitle.slice(1) : item.subtitle || null,
          fullName:  item.title || null,
          avatarUrl: item.avatarUrl ?? null,
        };
        handleClose();
        // Small delay so modal exit animation doesn't conflict with profile card open
        setTimeout(() => onOpenMemberProfile(miniProfile), 250);
      } else {
        handleClose();
      }
      return;
    }

    handleClose();
  };

  // ── Group results ─────────────────────────────────────────────────────────

  const reports  = results.filter((r) => r.type === 'report');
  const comments = results.filter((r) => r.type === 'comment');
  const members  = results.filter((r) => r.type === 'member');

  const grouped = [
    ...(reports.length  > 0 ? [{ sectionType: 'report'  as const, data: reports  }] : []),
    ...(comments.length > 0 ? [{ sectionType: 'comment' as const, data: comments }] : []),
    ...(members.length  > 0 ? [{ sectionType: 'member'  as const, data: members  }] : []),
  ];

  type FlatItem =
    | { kind: 'header'; type: WorkspaceSearchResult['type'] }
    | { kind: 'item';   data: WorkspaceSearchResult; index: number };

  const flatItems: FlatItem[] = [];
  for (const group of grouped) {
    flatItems.push({ kind: 'header', type: group.sectionType });
    group.data.forEach((d, i) => flatItems.push({ kind: 'item', data: d, index: i }));
  }

  const showEmpty = !isSearching && query.trim().length > 0 && results.length === 0 && !error;
  const showIdle  = query.trim().length === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />

        <Animated.View entering={SlideInUp.duration(320)} style={styles.sheet}>
          <LinearGradient
            colors={[COLORS.background, COLORS.backgroundCard]}
            style={{ flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
          >
            <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>

              {/* Handle */}
              <View style={styles.handleWrap}>
                <View style={styles.handle} />
              </View>

              {/* Search bar */}
              <Animated.View entering={FadeIn.duration(300)} style={styles.searchBar}>
                <View style={styles.searchInputWrap}>
                  <Ionicons name="search-outline" size={18} color={COLORS.textMuted} />
                  <TextInput
                    ref={inputRef}
                    value={query}
                    onChangeText={search}
                    placeholder="Search reports, comments, members…"
                    placeholderTextColor={COLORS.textMuted}
                    style={styles.searchInput}
                    autoCorrect={false}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                  />
                  {isSearching && <ActivityIndicator size="small" color={COLORS.primary} />}
                </View>
                <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Content */}
              {showIdle ? (
                <IdleState hasMemberNav={!!onOpenMemberProfile} />
              ) : showEmpty ? (
                <EmptyState query={query} />
              ) : error ? (
                <ErrorState error={error} />
              ) : (
                <FlatList
                  data={flatItems}
                  keyExtractor={(item, i) =>
                    item.kind === 'header'
                      ? `header-${item.type}`
                      : `item-${item.data.id}-${i}`
                  }
                  contentContainerStyle={styles.list}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    if (item.kind === 'header') {
                      const conf = TYPE_CONFIG[item.type];
                      return (
                        <View style={styles.sectionHeader}>
                          <Ionicons name={conf.icon} size={13} color={conf.color} />
                          <Text style={[styles.sectionHeaderText, { color: conf.color }]}>
                            {conf.label}s
                          </Text>
                        </View>
                      );
                    }
                    const isMember      = item.data.type === 'member';
                    const hasMemberNav  = isMember && !!onOpenMemberProfile;
                    const isNavigable   = !isMember || hasMemberNav;

                    return (
                      <SearchResultRow
                        item={item.data}
                        index={item.index}
                        isNavigable={isNavigable}
                        onPress={() => handleResultPress(item.data)}
                      />
                    );
                  }}
                />
              )}

            </SafeAreaView>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── SearchResultRow ──────────────────────────────────────────────────────────

function SearchResultRow({
  item, index, isNavigable, onPress,
}: {
  item:        WorkspaceSearchResult;
  index:       number;
  isNavigable: boolean;
  onPress:     () => void;
}) {
  const conf = TYPE_CONFIG[item.type];

  return (
    <Animated.View entering={FadeInDown.duration(250).delay(index * 30)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={isNavigable ? 0.75 : 1}
        style={[styles.resultRow, !isNavigable && styles.resultRowDisabled]}
      >
        {/* Left: avatar for members, icon for others */}
        {item.type === 'member' ? (
          <Avatar url={item.avatarUrl} name={item.title} size={36} />
        ) : (
          <View style={[styles.resultIconWrap, { backgroundColor: `${conf.color}18` }]}>
            <Ionicons name={conf.icon} size={17} color={conf.color} />
          </View>
        )}

        {/* Text */}
        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
          {!!item.subtitle && (
            <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          )}
        </View>

        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: `${conf.color}15` }]}>
          <Text style={[styles.typeBadgeText, { color: conf.color }]}>{conf.label}</Text>
        </View>

        {/* Navigation arrow — always shown for reports/comments; shown for members only if handler exists */}
        {isNavigable ? (
          <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
        ) : (
          <Ionicons name="person-outline" size={14} color={COLORS.textMuted} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Idle / Empty / Error states ─────────────────────────────────────────────

function IdleState({ hasMemberNav }: { hasMemberNav: boolean }) {
  return (
    <View style={stateStyles.wrap}>
      <View style={stateStyles.iconCircle}>
        <Ionicons name="search" size={28} color={COLORS.primary} />
      </View>
      <Text style={stateStyles.title}>Search your workspace</Text>
      <Text style={stateStyles.sub}>
        Find reports by title, comments by content, or members by name.
      </Text>
      <View style={stateStyles.tips}>
        {[
          { tip: 'Try "AI trends"',               icon: 'bulb-outline'   },
          { tip: 'Search by member name',          icon: 'person-outline' },
          { tip: hasMemberNav
              ? 'Tap a member to view their profile'
              : 'Find a comment keyword',           icon: hasMemberNav ? 'card-outline' : 'chatbubble-outline' },
        ].map(({ tip, icon }) => (
          <View key={tip} style={stateStyles.tip}>
            <Ionicons name={icon as any} size={12} color={COLORS.warning} />
            <Text style={stateStyles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <View style={stateStyles.wrap}>
      <Ionicons name="search-outline" size={40} color={COLORS.textMuted} />
      <Text style={stateStyles.title}>No results for "{query}"</Text>
      <Text style={stateStyles.sub}>Try different keywords or check your spelling.</Text>
    </View>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <View style={stateStyles.wrap}>
      <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
      <Text style={stateStyles.title}>Search failed</Text>
      <Text style={stateStyles.sub}>{error}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:    { height: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.xl, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, padding: 0 },
  cancelBtn:     { paddingVertical: 6, paddingHorizontal: 4 },
  cancelBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' },

  list:          { paddingHorizontal: SPACING.xl, paddingBottom: 40, paddingTop: SPACING.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.sm, marginTop: SPACING.sm },
  sectionHeaderText: { fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  resultRowDisabled: { opacity: 0.7 },
  resultIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resultText:    { flex: 1, minWidth: 0 },
  resultTitle:   { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  resultSubtitle: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  typeBadge:     { borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  typeBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
});

const stateStyles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl * 1.5, gap: 12 },
  iconCircle: { width: 72, height: 72, borderRadius: 22, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700', textAlign: 'center' },
  sub:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 21 },
  tips:  { marginTop: SPACING.md, gap: SPACING.sm, alignSelf: 'stretch' },
  tip:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  tipText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '500' },
});