// app/(app)/workspace-detail.tsx
// Part 12 CHANGES:
//   1. Pending access-request notification banner for owners/editors
//      (shows count, tapping opens workspace-members with requests tab pre-focused)
//   2. Members tab rows are now tappable → MemberProfileCard
//   3. usePendingAccessRequests wired in for realtime badge count

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useWorkspace } from '../../src/hooks/useWorkspace';
import { useActivityFeed } from '../../src/hooks/useActivityFeed';
import { usePendingAccessRequests } from '../../src/hooks/useEditAccessRequest';
import { WorkspaceReportCard } from '../../src/components/workspace/WorkspaceReportCard';
import { ActivityItem } from '../../src/components/workspace/ActivityItem';
import { MemberAvatar } from '../../src/components/workspace/MemberAvatar';
import { InviteModal } from '../../src/components/workspace/InviteModal';
import { AddToWorkspaceSheet } from '../../src/components/workspace/AddToWorkspaceSheet';
import { WorkspaceSearchModal } from '../../src/components/workspace/WorkspaceSearchModal';
import { MemberProfileCard } from '../../src/components/workspace/MemberProfileCard';       // Part 12
import { EditAccessRequestModal } from '../../src/components/workspace/EditAccessRequestModal'; // Part 12
import { WorkspaceReport, MiniProfile } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

type TabId = 'feed' | 'activity' | 'members';

const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'feed',     label: 'Feed',     icon: 'documents-outline' },
  { id: 'activity', label: 'Activity', icon: 'pulse-outline' },
  { id: 'members',  label: 'Members',  icon: 'people-outline' },
];

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

  // Part 12 — pending access requests
  const {
    pendingCount,
    requests: pendingRequests,
    isActioning,
    approve: approveRequest,
    deny:    denyRequest,
  } = usePendingAccessRequests(id ?? null, userRole);

  const [activeTab,      setActiveTab]      = useState<TabId>('feed');
  const [showInvite,     setShowInvite]     = useState(false);
  const [showAddReport,  setShowAddReport]  = useState(false);
  const [showSearch,     setShowSearch]     = useState(false);
  const [pinnedIds,      setPinnedIds]      = useState<Set<string>>(new Set());
  const [isPinToggling,  setIsPinToggling]  = useState(false);

  // Part 12 — member profile card
  const [profileMember,  setProfileMember]  = useState<MiniProfile | null>(null);
  const [showProfile,    setShowProfile]    = useState(false);
  // Part 12 — access request modal (quick review from detail screen)
  const [showRequests,   setShowRequests]   = useState(false);

  const isOwner  = userRole === 'owner';
  const isEditor = userRole === 'editor' || isOwner;

  const existingReportIds = reports.map((r) => r.reportId);

  // ── Load pinned report IDs ─────────────────────────────────────────────────
  const loadPinnedIds = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .rpc('get_pinned_report_ids', { p_workspace_id: id });
      if (!error && data) {
        const ids = (data as { report_id: string }[]).map((r) => r.report_id);
        setPinnedIds(new Set(ids));
      }
    } catch { /* non-fatal */ }
  }, [id]);

  useEffect(() => { loadPinnedIds(); }, [loadPinnedIds]);

  // ── Toggle pin ────────────────────────────────────────────────────────────
  const handleTogglePin = async (reportId: string) => {
    if (!id || !isEditor || isPinToggling) return;
    setIsPinToggling(true);
    try {
      const { data, error } = await supabase
        .rpc('toggle_pin_workspace_report', {
          p_workspace_id: id,
          p_report_id:    reportId,
        });
      if (error) throw error;
      const result = data as { pinned: boolean };
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (result.pinned) next.add(reportId);
        else               next.delete(reportId);
        return next;
      });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to toggle pin');
    } finally {
      setIsPinToggling(false);
    }
  };

  // ── Navigate to report from search ────────────────────────────────────────
  const handleOpenReportFromSearch = (reportId: string) => {
    router.push({
      pathname: '/(app)/workspace-report' as any,
      params:   { reportId, workspaceId: id, userRole: userRole ?? 'viewer' },
    });
  };

  // ── Sort feed: pinned first, then by addedAt ───────────────────────────────
  const sortedReports: WorkspaceReport[] = [
    ...reports.filter((r) => pinnedIds.has(r.reportId)).map((r) => ({ ...r, isPinned: true })),
    ...reports.filter((r) => !pinnedIds.has(r.reportId)).map((r) => ({ ...r, isPinned: false })),
  ];

  // ── Access request handlers ────────────────────────────────────────────────
  const handleApproveRequest = async (requestId: string) => {
    const { error } = await approveRequest(requestId);
    if (error) Alert.alert('Error', error);
    else refresh(false);
  };
  const handleDenyRequest = async (requestId: string) => {
    const { error } = await denyRequest(requestId);
    if (error) Alert.alert('Error', error);
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
            <Text style={styles.wsName} numberOfLines={1}>{workspace?.name ?? '…'}</Text>
            {userRole && (
              <View style={styles.rolePill}>
                <Text style={styles.rolePillText}>{userRole}</Text>
              </View>
            )}
          </View>
          <View style={styles.topBarRight}>
            <TouchableOpacity onPress={() => setShowSearch(true)} style={styles.iconBtn}>
              <Ionicons name="search-outline" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            {isEditor && (
              <TouchableOpacity onPress={() => setShowInvite(true)} style={styles.iconBtn}>
                <Ionicons name="person-add-outline" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
            {isEditor && (
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(app)/workspace-settings' as any,
                    params:   { id, role: userRole ?? 'editor' },
                  })
                }
                style={styles.iconBtn}
              >
                <Ionicons
                  name={isOwner ? 'settings-outline' : 'share-outline'}
                  size={20}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* ── Part 12: Pending access request banner ── */}
        {isEditor && pendingCount > 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.requestBanner}>
            <View style={styles.requestBannerLeft}>
              <Ionicons name="person-add-outline" size={16} color={COLORS.warning} />
              <Text style={styles.requestBannerText} numberOfLines={1}>
                {pendingCount} member{pendingCount !== 1 ? 's' : ''} requesting editor access
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowRequests(true)}
              style={styles.requestBannerCta}
              activeOpacity={0.85}
            >
              <Text style={styles.requestBannerCtaText}>Review</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Stats strip ── */}
        {workspace && (
          <Animated.View entering={FadeIn.duration(500).delay(100)} style={styles.statsStrip}>
            <StatChip icon="people-outline"        value={members.length}    label="Members" />
            <StatChip icon="document-text-outline" value={reports.length}    label="Reports" />
            <StatChip icon="pulse-outline"         value={activities.length} label="Activity" />
            {pinnedIds.size > 0 && (
              <StatChip icon="pin-outline" value={pinnedIds.size} label="Pinned" />
            )}
            {/* Part 12 — requests chip */}
            {isEditor && pendingCount > 0 && (
              <TouchableOpacity onPress={() => setShowRequests(true)} activeOpacity={0.8}>
                <View style={[statChipStyles.chip, { backgroundColor: `${COLORS.warning}15` }]}>
                  <Ionicons name="person-add-outline" size={14} color={COLORS.warning} />
                  <Text style={[statChipStyles.value, { color: COLORS.warning }]}>{pendingCount}</Text>
                  <Text style={[statChipStyles.label, { color: COLORS.warning }]}>Requests</Text>
                </View>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* ── Tabs ── */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
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
              onRefresh={() => { refresh(true); loadPinnedIds(); }}
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

              {pinnedIds.size > 0 && sortedReports.some((r) => r.isPinned) && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.pinnedHeader}>
                  <Ionicons name="pin" size={13} color={COLORS.warning} />
                  <Text style={styles.pinnedHeaderText}>Pinned</Text>
                </Animated.View>
              )}

              {sortedReports.length === 0 && !isLoading ? (
                <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyState}>
                  <Ionicons name="documents-outline" size={40} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No reports yet</Text>
                  <Text style={styles.emptyDesc}>
                    {isEditor
                      ? 'Tap "Add a research report" above to share one.'
                      : 'No reports have been shared to this workspace yet.'}
                  </Text>
                  {isEditor && (
                    <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddReport(true)} activeOpacity={0.85}>
                      <Ionicons name="add-circle-outline" size={16} color="#FFF" />
                      <Text style={styles.emptyAddBtnText}>Add Report</Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              ) : (
                <>
                  {sortedReports.map((wr, i) => (
                    <React.Fragment key={wr.id}>
                      {i > 0 && sortedReports[i - 1].isPinned && !wr.isPinned && (
                        <View style={styles.sectionDivider}>
                          <View style={styles.sectionDividerLine} />
                          <Text style={styles.sectionDividerText}>All Reports</Text>
                          <View style={styles.sectionDividerLine} />
                        </View>
                      )}
                      <View style={styles.reportCardWrap}>
                        <WorkspaceReportCard
                          item={wr}
                          index={i}
                          onPress={() =>
                            router.push({
                              pathname: '/(app)/workspace-report' as any,
                              params: { reportId: wr.reportId, workspaceId: id, userRole: userRole ?? 'viewer' },
                            })
                          }
                        />
                        {isEditor && (
                          <TouchableOpacity
                            onPress={() => handleTogglePin(wr.reportId)}
                            disabled={isPinToggling}
                            style={[styles.pinBtn, wr.isPinned && styles.pinBtnActive]}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons
                              name={wr.isPinned ? 'pin' : 'pin-outline'}
                              size={14}
                              color={wr.isPinned ? COLORS.warning : COLORS.textMuted}
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    </React.Fragment>
                  ))}
                </>
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
                  <Text style={styles.emptyDesc}>All workspace actions are logged here in real-time.</Text>
                </View>
              ) : (
                activities.map((a) => <ActivityItem key={a.id} activity={a} />)
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
                    router.push({ pathname: '/(app)/workspace-members' as any, params: { id } })
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
                  {/* Part 12 — tappable member row → profile card */}
                  <TouchableOpacity
                    onPress={() => {
                      if (m.profile) {
                        setProfileMember(m.profile);
                        setShowProfile(true);
                      }
                    }}
                    activeOpacity={0.75}
                    style={styles.memberRowInner}
                  >
                    <View style={styles.memberAvatarWrap}>
                      <MemberAvatar profile={m.profile} role={m.role} size={40} showLabel showRole />
                    </View>
                    <View style={styles.memberTextBlock}>
                      <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                        {m.profile?.fullName ?? m.profile?.username ?? 'Unknown'}
                      </Text>
                      <Text style={styles.joinedText} numberOfLines={1} ellipsizeMode="tail">
                        Joined {formatJoined(m.joinedAt)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                  </TouchableOpacity>
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
            onAdded={(reportId) => addReport?.(reportId)}
          />
        )}

        {/* ── Search modal ── */}
        {id && (
          <WorkspaceSearchModal
            visible={showSearch}
            workspaceId={id}
            userRole={userRole}
            onClose={() => setShowSearch(false)}
            onOpenReport={handleOpenReportFromSearch}
          />
        )}

        {/* ── Part 12: Member profile card ── */}
        {id && (
          <MemberProfileCard
            visible={showProfile}
            member={profileMember}
            workspaceId={id}
            onClose={() => { setShowProfile(false); setProfileMember(null); }}
          />
        )}

        {/* ── Part 12: Access requests modal (quick review) ── */}
        <EditAccessRequestModal
          mode="owner"
          visible={showRequests}
          requests={pendingRequests}
          isActioning={isActioning}
          onApprove={handleApproveRequest}
          onDeny={handleDenyRequest}
          onClose={() => setShowRequests(false)}
        />

      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── StatChip ─────────────────────────────────────────────────────────────────

function StatChip({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
  return (
    <View style={statChipStyles.chip}>
      <Ionicons name={icon} size={14} color={COLORS.primary} />
      <Text style={statChipStyles.value}>{value}</Text>
      <Text style={statChipStyles.label}>{label}</Text>
    </View>
  );
}

const statChipStyles = StyleSheet.create({
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5 },
  value: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  label: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
});

const styles = StyleSheet.create({
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  errorText:   { color: COLORS.textSecondary, textAlign: 'center', marginVertical: SPACING.md },
  backBtn:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  backBtnText: { color: '#FFF', fontWeight: '700' },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8 },
  backIconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  topBarCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  wsName: { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', flex: 1 },
  rolePill: { backgroundColor: `${COLORS.primary}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' },
  topBarRight: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },

  // Part 12 — request banner
  requestBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: SPACING.xl, marginBottom: SPACING.xs,
    backgroundColor: `${COLORS.warning}12`,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 9,
    borderWidth: 1, borderColor: `${COLORS.warning}30`,
  },
  requestBannerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  requestBannerText:  { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },
  requestBannerCta:   { backgroundColor: COLORS.warning, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 5 },
  requestBannerCtaText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },

  statsStrip:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  tabBar:      { flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: SPACING.sm, marginBottom: SPACING.sm },
  tabItem:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border },
  tabItemActive: { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}50` },
  tabLabel:    { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  tabLabelActive: { color: COLORS.primary },
  scroll:      { paddingHorizontal: SPACING.xl, paddingBottom: 120 },

  addReportCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: `${COLORS.primary}50`, marginBottom: SPACING.md },
  addReportCtaText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  pinnedHeaderText: { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: SPACING.sm },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  sectionDividerText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  reportCardWrap: { position: 'relative' },
  pinBtn: { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, zIndex: 10 },
  pinBtnActive: { backgroundColor: `${COLORS.warning}15`, borderColor: `${COLORS.warning}40` },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700' },
  emptyDesc:  { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 21, maxWidth: 290 },
  emptyAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 10, marginTop: 4 },
  emptyAddBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  manageMembersBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30` },
  manageMembersBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 },

  memberRow: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  memberRowInner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md },
  memberAvatarWrap: { width: 40, height: 40, flexShrink: 0 },
  memberTextBlock:  { flex: 1, minWidth: 0 },
  memberName:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  joinedText:       { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
});