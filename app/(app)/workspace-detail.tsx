// app/(app)/workspace-detail.tsx
// Part 10: Workspace detail screen — 3 tabs: Feed | Activity | Members
// FIX: Members tab — "Joined" text no longer overflows.
//      Avatar is flexShrink:0, name/joined text block is flex:1 + minWidth:0.
//      formatJoined() guards against null/invalid dates.

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useWorkspace } from '../../src/hooks/useWorkspace';
import { useActivityFeed } from '../../src/hooks/useActivityFeed';
import { WorkspaceReportCard } from '../../src/components/workspace/WorkspaceReportCard';
import { ActivityItem } from '../../src/components/workspace/ActivityItem';
import { MemberAvatar } from '../../src/components/workspace/MemberAvatar';
import { InviteModal } from '../../src/components/workspace/InviteModal';
import { AddToWorkspaceSheet } from '../../src/components/workspace/AddToWorkspaceSheet';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

type TabId = 'feed' | 'activity' | 'members';

const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'feed',     label: 'Feed',     icon: 'documents-outline' },
  { id: 'activity', label: 'Activity', icon: 'pulse-outline' },
  { id: 'members',  label: 'Members',  icon: 'people-outline' },
];

// ─── Safe date formatter ───────────────────────────────────────────────────────
function formatJoined(raw: string | undefined | null): string {
  if (!raw) return 'Unknown date';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function WorkspaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    workspace, members, reports, userRole,
    isLoading, isRefreshing, error,
    refresh, update, addReport,
  } = useWorkspace(id ?? null);
  const { items: activities } = useActivityFeed(id ?? null);

  const [activeTab,     setActiveTab]     = useState<TabId>('feed');
  const [showInvite,    setShowInvite]    = useState(false);
  const [showAddReport, setShowAddReport] = useState(false);

  const isOwner  = userRole === 'owner';
  const isEditor = userRole === 'editor' || isOwner;

  const existingReportIds = reports.map(r => r.reportId);

  const handleReportAdded = (reportId: string) => {
    addReport?.(reportId);
  };

  if (error) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Top bar ── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backIconBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.topBarCenter}>
            <Text style={styles.wsName} numberOfLines={1}>
              {workspace?.name ?? '…'}
            </Text>
            {userRole && (
              <View style={styles.rolePill}>
                <Text style={styles.rolePillText}>{userRole}</Text>
              </View>
            )}
          </View>
          <View style={styles.topBarRight}>
            {isEditor && (
              <TouchableOpacity onPress={() => setShowInvite(true)} style={styles.iconBtn}>
                <Ionicons name="person-add-outline" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
            {isOwner && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(app)/workspace-settings' as any,
                    params:   { id },
                  })
                }
                style={styles.iconBtn}
              >
                <Ionicons name="settings-outline" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* ── Stats strip ── */}
        {workspace && (
          <Animated.View entering={FadeIn.duration(500).delay(100)} style={styles.statsStrip}>
            <StatChip icon="people-outline"        value={members.length}    label="Members" />
            <StatChip icon="document-text-outline" value={reports.length}    label="Reports" />
            <StatChip icon="pulse-outline"         value={activities.length} label="Activities" />
          </Animated.View>
        )}

        {/* ── Tabs ── */}
        <View style={styles.tabBar}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={activeTab === tab.id ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab content ── */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => refresh(true)}
              tintColor={COLORS.primary}
            />
          }
        >

          {/* ── Feed tab ── */}
          {activeTab === 'feed' && (
            <>
              {isEditor && (
                <Animated.View entering={FadeInDown.duration(400)}>
                  <TouchableOpacity
                    style={styles.addReportCta}
                    onPress={() => setShowAddReport(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.addReportCtaText}>Add a research report</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {reports.length === 0 && !isLoading ? (
                <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyState}>
                  <Ionicons name="documents-outline" size={40} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No reports yet</Text>
                  <Text style={styles.emptyDesc}>
                    {isEditor
                      ? 'Tap "Add a research report" above to share one of your reports with this workspace.'
                      : 'No reports have been shared to this workspace yet.'}
                  </Text>
                  {isEditor && (
                    <TouchableOpacity
                      style={styles.emptyAddBtn}
                      onPress={() => setShowAddReport(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="add-circle-outline" size={16} color="#FFF" />
                      <Text style={styles.emptyAddBtnText}>Add Report</Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              ) : (
                reports.map((wr, i) => (
                  <WorkspaceReportCard
                    key={wr.id}
                    item={wr}
                    index={i}
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/workspace-report' as any,
                        params: {
                          reportId:    wr.reportId,
                          workspaceId: id,
                          userRole:    userRole ?? 'viewer',
                        },
                      })
                    }
                  />
                ))
              )}
            </>
          )}

          {/* ── Activity tab ── */}
          {activeTab === 'activity' && (
            <>
              {activities.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="pulse-outline" size={40} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No activity yet</Text>
                  <Text style={styles.emptyDesc}>
                    Workspace activity will appear here in real-time.
                  </Text>
                </View>
              ) : (
                activities.map(a => <ActivityItem key={a.id} activity={a} />)
              )}
            </>
          )}

          {/* ── Members tab ── */}
          {activeTab === 'members' && (
            <>
              {isOwner && (
                <TouchableOpacity
                  style={styles.manageMembersBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/workspace-members' as any,
                      params:   { id },
                    })
                  }
                >
                  <Ionicons name="settings-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.manageMembersBtnText}>Manage Members & Roles</Text>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}

              {members.map((m, i) => (
                <Animated.View
                  key={m.id}
                  entering={FadeInDown.duration(300).delay(i * 40)}
                  style={styles.memberRow}
                >
                  {/* Avatar — fixed size, never shrinks */}
                  <View style={styles.memberAvatarWrap}>
                    <MemberAvatar profile={m.profile} role={m.role} size={40} showLabel showRole />
                  </View>

                  {/* Name + joined — flex:1 + minWidth:0 so text truncates */}
                  <View style={styles.memberTextBlock}>
                    <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                      {m.profile?.fullName ?? m.profile?.username ?? 'Unknown'}
                    </Text>
                    <Text style={styles.joinedText} numberOfLines={1} ellipsizeMode="tail">
                      Joined {formatJoined(m.joinedAt)}
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </>
          )}

        </ScrollView>

        {/* ── Invite modal ── */}
        {workspace && (
          <InviteModal
            workspace={workspace}
            visible={showInvite}
            isOwner={isOwner}
            onClose={() => setShowInvite(false)}
            onCodeUpdated={() => update({ name: workspace.name })}
          />
        )}

        {/* ── Add report sheet ── */}
        {id && (
          <AddToWorkspaceSheet
            workspaceId={id}
            existingReportIds={existingReportIds}
            visible={showAddReport}
            onClose={() => setShowAddReport(false)}
            onAdded={handleReportAdded}
          />
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}

/* ─── StatChip ───────────────────────────────────────────────────────────── */
function StatChip({
  icon, value, label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
}) {
  return (
    <View style={statStyles.chip}>
      <Ionicons name={icon} size={14} color={COLORS.primary} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  value: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  label: { color: COLORS.textMuted,   fontSize: FONTS.sizes.xs },
});

const styles = StyleSheet.create({
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  errorText:   { color: COLORS.textSecondary, textAlign: 'center', marginVertical: SPACING.md },
  backBtn:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  backBtnText: { color: '#FFF', fontWeight: '700' },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8,
  },
  backIconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  topBarCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  wsName:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', flex: 1 },
  rolePill: {
    backgroundColor: `${COLORS.primary}20`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  rolePillText: {
    color: COLORS.primary, fontSize: FONTS.sizes.xs,
    fontWeight: '700', textTransform: 'capitalize',
  },
  topBarRight: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  // ── Stats ──────────────────────────────────────────────────────────────────
  statsStrip: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm,
  },

  // ── Tabs ───────────────────────────────────────────────────────────────────
  tabBar:         { flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: SPACING.sm, marginBottom: SPACING.sm },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 5,
    paddingVertical: 9, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tabItemActive:  { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}50` },
  tabLabel:       { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  tabLabelActive: { color: COLORS.primary },

  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: 120 },

  // ── Feed ───────────────────────────────────────────────────────────────────
  addReportCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: SPACING.md, borderRadius: RADIUS.lg,
    borderWidth: 1, borderStyle: 'dashed',
    borderColor: `${COLORS.primary}50`, marginBottom: SPACING.md,
  },
  addReportCtaText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700' },
  emptyDesc: {
    color: COLORS.textSecondary, fontSize: FONTS.sizes.sm,
    textAlign: 'center', lineHeight: 21, maxWidth: 290,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 10,
    marginTop: 4,
  },
  emptyAddBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  // ── Members tab ────────────────────────────────────────────────────────────
  manageMembersBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${COLORS.primary}12`,
    borderRadius: RADIUS.lg, padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1, borderColor: `${COLORS.primary}30`,
  },
  manageMembersBtnText: {
    color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',           // prevents any child from widening the card
  },

  // Avatar wrapper — fixed 40×40, never shrinks or grows
  memberAvatarWrap: {
    width: 40,
    height: 40,
    flexShrink: 0,
  },

  // Text block — must have flex:1 + minWidth:0 for truncation to work in RN
  memberTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  joinedText: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
  },
});