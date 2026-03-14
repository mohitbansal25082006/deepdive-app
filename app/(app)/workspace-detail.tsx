// app/(app)/workspace-detail.tsx
// Part 14 — Added "Shared" tab showing presentations & academic papers
// shared into the workspace. Members can open/export; editors/owners can remove.
//
// Changes from Part 13:
//   • New tab: "Shared" (4th tab alongside Feed / Activity / Members)
//   • useWorkspaceSharing hook wired in
//   • SharedContentCard rendered in Shared tab
//   • Navigation to slide-preview / academic-paper when card is opened

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, StyleSheet, Alert,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }      from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }          from '../../src/lib/supabase';
import { useWorkspace }      from '../../src/hooks/useWorkspace';
import { useActivityFeed }   from '../../src/hooks/useActivityFeed';
import { usePendingAccessRequests }  from '../../src/hooks/useEditAccessRequest';
import { useWorkspaceSharing }       from '../../src/hooks/useWorkspaceSharing';
import { WorkspaceReportCard }       from '../../src/components/workspace/WorkspaceReportCard';
import { ActivityItem }              from '../../src/components/workspace/ActivityItem';
import { MemberAvatar }              from '../../src/components/workspace/MemberAvatar';
import { InviteModal }               from '../../src/components/workspace/InviteModal';
import { AddToWorkspaceSheet }       from '../../src/components/workspace/AddToWorkspaceSheet';
import { WorkspaceSearchModal }      from '../../src/components/workspace/WorkspaceSearchModal';
import { MemberProfileCard }         from '../../src/components/workspace/MemberProfileCard';
import { EditAccessRequestModal }    from '../../src/components/workspace/EditAccessRequestModal';
import { SharedContentCard }         from '../../src/components/workspace/SharedContentCard';
import {
  WorkspaceReport, MiniProfile, SharedWorkspaceContent,
} from '../../src/types';
import { leaveWorkspace }            from '../../src/services/workspaceInviteService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

type TabId = 'feed' | 'activity' | 'members' | 'shared';

const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'feed',     label: 'Feed',     icon: 'documents-outline'    },
  { id: 'shared',   label: 'Shared',   icon: 'share-social-outline' },
  { id: 'activity', label: 'Activity', icon: 'pulse-outline'        },
  { id: 'members',  label: 'Members',  icon: 'people-outline'       },
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

  const {
    pendingCount,
    requests: pendingRequests,
    isActioning,
    approve: approveRequest,
    deny:    denyRequest,
  } = usePendingAccessRequests(id ?? null, userRole);

  // Part 14: shared content
  const sharing = useWorkspaceSharing(id ?? null);

  const [activeTab,     setActiveTab]     = useState<TabId>('feed');
  const [showInvite,    setShowInvite]    = useState(false);
  const [showAddReport, setShowAddReport] = useState(false);
  const [showSearch,    setShowSearch]    = useState(false);
  const [pinnedIds,     setPinnedIds]     = useState<Set<string>>(new Set());
  const [isPinToggling, setIsPinToggling] = useState(false);

  const [profileMember, setProfileMember] = useState<MiniProfile | null>(null);
  const [showProfile,   setShowProfile]   = useState(false);
  const [showRequests,  setShowRequests]  = useState(false);

  const isOwner  = userRole === 'owner';
  const isEditor = userRole === 'editor' || isOwner;
  const existingReportIds = reports.map((r) => r.reportId);

  // ── Load pinned IDs ────────────────────────────────────────────────────────
  const loadPinnedIds = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await supabase.rpc('get_pinned_report_ids', { p_workspace_id: id });
      if (data) {
        setPinnedIds(new Set((data as { report_id: string }[]).map((r) => r.report_id)));
      }
    } catch { /* non-fatal */ }
  }, [id]);

  useEffect(() => { loadPinnedIds(); }, [loadPinnedIds]);

  // ── Toggle pin ─────────────────────────────────────────────────────────────
  const handleTogglePin = async (reportId: string) => {
    if (!id || !isEditor || isPinToggling) return;
    setIsPinToggling(true);
    try {
      const { data, error } = await supabase.rpc('toggle_pin_workspace_report', {
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

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const openReport = useCallback((reportId: string) => {
    router.push({
      pathname: '/(app)/workspace-report' as any,
      params:   { reportId, workspaceId: id, userRole: userRole ?? 'viewer' },
    });
  }, [id, userRole]);

  const handleOpenReportFromSearch = useCallback((reportId: string) => {
    openReport(reportId);
  }, [openReport]);

  const handleNavigateToComment = useCallback((reportId: string, commentId: string) => {
    router.push({
      pathname: '/(app)/workspace-report' as any,
      params:   { reportId, workspaceId: id, userRole: userRole ?? 'viewer', scrollToComment: commentId },
    });
  }, [id, userRole]);

  const handleOpenMemberProfile = useCallback((member: MiniProfile) => {
    setProfileMember(member);
    setShowProfile(true);
  }, []);

  // ── Part 14: Open shared content ───────────────────────────────────────────
  // Routes to workspace-shared-viewer which uses SECURITY DEFINER RPCs to
  // load the content, bypassing owner RLS so non-owners view without
  // triggering any generation flow.
  const handleOpenSharedContent = useCallback((item: SharedWorkspaceContent) => {
    router.push({
      pathname: '/(app)/workspace-shared-viewer' as any,
      params:   {
        workspaceId:  id,
        contentType:  item.contentType,
        contentId:    item.contentId,
        contentTitle: item.title,
      },
    });
  }, [id]);

  // ── Part 14: Remove shared content ────────────────────────────────────────
  const handleRemoveSharedContent = useCallback(async (item: SharedWorkspaceContent) => {
    const { error } = await sharing.remove(item.contentType, item.contentId);
    if (error) Alert.alert('Error', error);
  }, [sharing]);

  // ── Leave workspace ────────────────────────────────────────────────────────
  const handleLeave = () => {
    Alert.alert(
      'Leave Workspace',
      'Are you sure you want to leave this workspace? You will lose access to all shared reports and comments.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            const { error } = await leaveWorkspace(id);
            if (!error) router.replace('/(app)/(tabs)/workspace' as any);
            else Alert.alert('Error', error);
          },
        },
      ],
    );
  };

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

  // ── Sort feed: pinned first ────────────────────────────────────────────────
  const sortedReports: WorkspaceReport[] = [
    ...reports.filter((r) => pinnedIds.has(r.reportId)).map((r) => ({ ...r, isPinned: true  })),
    ...reports.filter((r) => !pinnedIds.has(r.reportId)).map((r) => ({ ...r, isPinned: false })),
  ];

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

  // Shared tab badge count
  const sharedCount = sharing.items.length;

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

        {/* ── Pending requests banner ── */}
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
            <StatChip icon="people-outline"        value={members.length}    label="Members"  />
            <StatChip icon="document-text-outline" value={reports.length}    label="Reports"  />
            <StatChip icon="share-social-outline"  value={sharedCount}       label="Shared"   />
            <StatChip icon="pulse-outline"         value={activities.length} label="Activity" />
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
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            // Badge for shared tab
            const badge = tab.id === 'shared' && sharedCount > 0 ? sharedCount : null;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons
                    name={tab.icon}
                    size={15}
                    color={isActive ? COLORS.primary : COLORS.textMuted}
                  />
                  {badge !== null && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Tab content ── */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { refresh(true); loadPinnedIds(); sharing.load(); }}
              tintColor={COLORS.primary}
            />
          }
        >

          {/* ── FEED TAB ── */}
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
                sortedReports.map((wr, i) => (
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
                        onPress={() => openReport(wr.reportId)}
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
                ))
              )}
            </>
          )}

          {/* ── SHARED TAB (Part 14) ── */}
          {activeTab === 'shared' && (
            <>
              {/* Section header */}
              <Animated.View entering={FadeInDown.duration(400)} style={styles.sharedHeader}>
                <LinearGradient
                  colors={['#6C63FF', '#8B5CF6']}
                  style={styles.sharedHeaderIcon}
                >
                  <Ionicons name="share-social" size={18} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sharedHeaderTitle}>Shared Content</Text>
                  <Text style={styles.sharedHeaderSub}>
                    Presentations and academic papers shared by team members
                  </Text>
                </View>
              </Animated.View>

              {/* Filter chips */}
              {sharedCount > 0 && (
                <Animated.View
                  entering={FadeInDown.duration(300).delay(80)}
                  style={styles.filterRow}
                >
                  {[
                    {
                      label: `All (${sharedCount})`,
                      count: sharedCount,
                      icon:  'apps-outline',
                    },
                    {
                      label: `Slides (${sharing.presentations.length})`,
                      count: sharing.presentations.length,
                      icon:  'easel-outline',
                    },
                    {
                      label: `Papers (${sharing.papers.length})`,
                      count: sharing.papers.length,
                      icon:  'school-outline',
                    },
                  ].map(f => (
                    <View
                      key={f.label}
                      style={[
                        styles.filterChip,
                        f.count === sharedCount && styles.filterChipActive,
                      ]}
                    >
                      <Ionicons
                        name={f.icon as any}
                        size={11}
                        color={f.count === sharedCount ? COLORS.primary : COLORS.textMuted}
                      />
                      <Text style={[
                        styles.filterChipText,
                        f.count === sharedCount && styles.filterChipTextActive,
                      ]}>
                        {f.label}
                      </Text>
                    </View>
                  ))}
                </Animated.View>
              )}

              {/* Presentations section */}
              {sharing.presentations.length > 0 && (
                <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                  <View style={styles.contentSectionHeader}>
                    <LinearGradient
                      colors={['#6C63FF', '#8B5CF6']}
                      style={styles.contentSectionDot}
                    />
                    <Text style={styles.contentSectionTitle}>Presentations</Text>
                    <View style={styles.contentSectionBadge}>
                      <Text style={styles.contentSectionBadgeText}>
                        {sharing.presentations.length}
                      </Text>
                    </View>
                  </View>
                  {sharing.presentations.map((item, i) => (
                    <SharedContentCard
                      key={item.id}
                      item={item}
                      index={i}
                      userRole={userRole}
                      onOpen={handleOpenSharedContent}
                      onRemove={handleRemoveSharedContent}
                    />
                  ))}
                </Animated.View>
              )}

              {/* Academic Papers section */}
              {sharing.papers.length > 0 && (
                <Animated.View entering={FadeInDown.duration(400).delay(160)}>
                  <View style={styles.contentSectionHeader}>
                    <LinearGradient
                      colors={['#10B981', '#059669']}
                      style={styles.contentSectionDot}
                    />
                    <Text style={styles.contentSectionTitle}>Academic Papers</Text>
                    <View style={[styles.contentSectionBadge, {
                      backgroundColor: `${COLORS.success}20`,
                      borderColor: `${COLORS.success}35`,
                    }]}>
                      <Text style={[styles.contentSectionBadgeText, { color: COLORS.success }]}>
                        {sharing.papers.length}
                      </Text>
                    </View>
                  </View>
                  {sharing.papers.map((item, i) => (
                    <SharedContentCard
                      key={item.id}
                      item={item}
                      index={i}
                      userRole={userRole}
                      onOpen={handleOpenSharedContent}
                      onRemove={handleRemoveSharedContent}
                    />
                  ))}
                </Animated.View>
              )}

              {/* Empty state */}
              {sharing.items.length === 0 && !sharing.isLoading && (
                <Animated.View entering={FadeInDown.duration(500)} style={styles.emptyState}>
                  <View style={styles.sharedEmptyIcon}>
                    <Ionicons name="share-social-outline" size={36} color={COLORS.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>Nothing Shared Yet</Text>
                  <Text style={styles.emptyDesc}>
                    {isEditor
                      ? 'Share presentations and academic papers from your research reports into this workspace.'
                      : 'No presentations or academic papers have been shared to this workspace yet.'}
                  </Text>
                  {isEditor && (
                    <View style={styles.sharedEmptyHint}>
                      <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.sharedEmptyHintText}>
                        Open a report → generate slides or a paper → tap the share icon
                      </Text>
                    </View>
                  )}
                </Animated.View>
              )}
            </>
          )}

          {/* ── ACTIVITY TAB ── */}
          {activeTab === 'activity' && (
            activities.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="pulse-outline" size={40} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No activity yet</Text>
                <Text style={styles.emptyDesc}>All workspace actions are logged here in real-time.</Text>
              </View>
            ) : (
              activities.map((a) => <ActivityItem key={a.id} activity={a} />)
            )
          )}

          {/* ── MEMBERS TAB ── */}
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

              {userRole !== 'owner' && userRole !== null && (
                <Animated.View entering={FadeInDown.duration(300).delay(200)}>
                  <View style={styles.leaveSection}>
                    <Text style={styles.leaveSectionLabel}>Your membership</Text>
                    <TouchableOpacity
                      onPress={handleLeave}
                      style={styles.leaveBtn}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="log-out-outline" size={16} color={COLORS.error} />
                      <Text style={styles.leaveBtnText}>Leave Workspace</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
            </>
          )}
        </ScrollView>

        {/* ── Modals ── */}
        {workspace && (
          <InviteModal
            workspace={workspace}
            visible={showInvite}
            isOwner={isOwner}
            onClose={() => setShowInvite(false)}
            onCodeUpdated={() => update({ name: workspace.name })}
          />
        )}
        {id && (
          <AddToWorkspaceSheet
            workspaceId={id}
            existingReportIds={existingReportIds}
            visible={showAddReport}
            onClose={() => setShowAddReport(false)}
            onAdded={(reportId) => addReport?.(reportId)}
          />
        )}
        {id && (
          <WorkspaceSearchModal
            visible={showSearch}
            workspaceId={id}
            userRole={userRole}
            onClose={() => setShowSearch(false)}
            onOpenReport={handleOpenReportFromSearch}
            onOpenMemberProfile={handleOpenMemberProfile}
          />
        )}
        {id && (
          <MemberProfileCard
            visible={showProfile}
            member={profileMember}
            workspaceId={id}
            onClose={() => { setShowProfile(false); setProfileMember(null); }}
            onNavigateToReport={handleOpenReportFromSearch}
            onNavigateToComment={handleNavigateToComment}
          />
        )}
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

function StatChip({ icon, value, label }: {
  icon: keyof typeof Ionicons.glyphMap; value: number; label: string;
}) {
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
  label: { color: COLORS.textMuted,   fontSize: FONTS.sizes.xs },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  errorText:   { color: COLORS.textSecondary, textAlign: 'center', marginVertical: SPACING.md },
  backBtn:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  backBtnText: { color: '#FFF', fontWeight: '700' },

  topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8 },
  backIconBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  topBarCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  wsName:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', flex: 1 },
  rolePill:     { backgroundColor: `${COLORS.primary}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' },
  topBarRight:  { flexDirection: 'row', gap: 6 },
  iconBtn:      { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },

  requestBanner:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.xl, marginBottom: SPACING.xs, backgroundColor: `${COLORS.warning}12`, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 9, borderWidth: 1, borderColor: `${COLORS.warning}30` },
  requestBannerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  requestBannerText:    { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },
  requestBannerCta:     { backgroundColor: COLORS.warning, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 5 },
  requestBannerCtaText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },

  statsStrip: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },

  // Tabs
  tabBar:         { flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: 6, marginBottom: SPACING.sm },
  tabItem:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border },
  tabItemActive:  { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}50` },
  tabLabel:       { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  tabLabelActive: { color: COLORS.primary },
  tabBadge:       { position: 'absolute', top: -5, right: -7, backgroundColor: COLORS.primary, borderRadius: 7, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabBadgeText:   { color: '#FFF', fontSize: 8, fontWeight: '800' },

  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: 120 },

  // Feed
  addReportCta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: `${COLORS.primary}50`, marginBottom: SPACING.md },
  addReportCtaText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  pinnedHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  pinnedHeaderText: { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionDivider:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: SPACING.sm },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  sectionDividerText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  reportCardWrap:   { position: 'relative' },
  pinBtn:           { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, zIndex: 10 },
  pinBtnActive:     { backgroundColor: `${COLORS.warning}15`, borderColor: `${COLORS.warning}40` },

  // Shared tab
  sharedHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` },
  sharedHeaderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sharedHeaderTitle:{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' },
  sharedHeaderSub:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3, lineHeight: 16 },

  filterRow:       { flexDirection: 'row', gap: 8, marginBottom: SPACING.md, flexWrap: 'wrap' },
  filterChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive:{ backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}35` },
  filterChipText:  { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.primary },

  contentSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  contentSectionDot:    { width: 14, height: 14, borderRadius: 4, flexShrink: 0 },
  contentSectionTitle:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  contentSectionBadge:  { backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.primary}30` },
  contentSectionBadgeText: { color: COLORS.primary, fontSize: 10, fontWeight: '700' },

  sharedEmptyIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center' },
  sharedEmptyHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}20`, marginTop: 4, maxWidth: 280 },
  sharedEmptyHintText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, lineHeight: 16, flex: 1 },

  // Empty
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary,   fontSize: FONTS.sizes.lg, fontWeight: '700' },
  emptyDesc:  { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 21, maxWidth: 290 },
  emptyAddBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 10, marginTop: 4 },
  emptyAddBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  // Members
  manageMembersBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30` },
  manageMembersBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 },
  memberRow:       { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  memberRowInner:  { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md },
  memberAvatarWrap:{ width: 40, height: 40, flexShrink: 0 },
  memberTextBlock: { flex: 1, minWidth: 0 },
  memberName:      { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  joinedText:      { color: COLORS.textMuted,   fontSize: FONTS.sizes.xs, marginTop: 2 },

  leaveSection: { marginTop: SPACING.xl, backgroundColor: `${COLORS.error}08`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}20`, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  leaveSectionLabel: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },
  leaveBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${COLORS.error}15`, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 9, borderWidth: 1, borderColor: `${COLORS.error}30`, flexShrink: 0 },
  leaveBtnText:      { color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' },
});