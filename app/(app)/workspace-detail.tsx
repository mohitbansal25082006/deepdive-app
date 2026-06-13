// app/(app)/workspace-detail.tsx
// Part 46 / 50.5 / 50.9 / 51 — see prior history.
// Part 51 REVISION — Shared content now loads ONLY when the Shared tab is first
//   opened (one-way latch `sharedTabActivated` → `enabled` on the four sharing
//   hooks). This stops the workspace from paying for four shared-content RPC
//   calls when you land on Feed. While the first fetch is in flight a spinner
//   shows; after it resolves the sections render and reveal more on scroll
//   (useLazyReveal). Realtime add/remove still updates the Shared tab live once
//   it has been opened.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, StyleSheet, Alert, Share, ActivityIndicator,
  type NativeSyntheticEvent, type NativeScrollEvent,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView }       from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { supabase }           from '../../src/lib/supabase';
import { useWorkspace }       from '../../src/hooks/useWorkspace';
import { useActivityFeed }    from '../../src/hooks/useActivityFeed';
import { usePendingAccessRequests }  from '../../src/hooks/useEditAccessRequest';
import { useWorkspaceSharing }       from '../../src/hooks/useWorkspaceSharing';
import { usePodcastSharing }         from '../../src/hooks/usePodcastSharing';
import { useDebateSharing }          from '../../src/hooks/useDebateSharing';
import { useVoiceDebateSharing }     from '../../src/hooks/useVoiceDebateSharing';
import { useLazyReveal }             from '../../src/hooks/useLazyReveal';
import { useWorkspaceBotIndex, triggerReportIndexing } from '../../src/hooks/useWorkspaceBotIndex';
import { useWorkspaceChatUnread } from '../../src/hooks/useWorkspaceChatUnread';
import { WorkspaceReportCard }       from '../../src/components/workspace/WorkspaceReportCard';
import { ActivityItem }              from '../../src/components/workspace/ActivityItem';
import { MemberAvatar }              from '../../src/components/workspace/MemberAvatar';
import { InviteModal }               from '../../src/components/workspace/InviteModal';
import { AddToWorkspaceSheet }       from '../../src/components/workspace/AddToWorkspaceSheet';
import { WorkspaceSearchModal }      from '../../src/components/workspace/WorkspaceSearchModal';
import { MemberProfileCard }         from '../../src/components/workspace/MemberProfileCard';
import { EditAccessRequestModal }    from '../../src/components/workspace/EditAccessRequestModal';
import { SharedContentCard }         from '../../src/components/workspace/SharedContentCard';
import { SharedPodcastCard }         from '../../src/components/workspace/SharedPodcastCard';
import { SharedDebateCard }          from '../../src/components/workspace/SharedDebateCard';
import { SharedVoiceDebateCard }     from '../../src/components/workspace/SharedVoiceDebateCard';
import { logPinToggled, logSharedContentAdded } from '../../src/services/activityService';
import {
  exportPodcastAsMP3, exportPodcastAsPDF, copyPodcastScriptToClipboard,
} from '../../src/services/podcastExport';
import { sharedPodcastToPodcast }    from '../../src/services/podcastSharingService';
import {
  exportDebateAsPDF, copyDebateSummary, shareDebateText,
} from '../../src/services/debateExport';
import { sharedDebateToSession }     from '../../src/services/debateSharingService';
import { VOICE_PERSONAS }            from '../../src/constants/voiceDebate';
import {
  WorkspaceReport, MiniProfile, SharedWorkspaceContent,
  SharedPodcast, SharedDebate,
} from '../../src/types';
import type { SharedVoiceDebate }    from '../../src/types/voiceDebateSharing';
import { leaveWorkspace }            from '../../src/services/workspaceInviteService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

type TabId = 'feed' | 'activity' | 'members' | 'shared';
type SharedFilter = 'all' | 'presentation' | 'academic_paper' | 'podcast' | 'debate' | 'voice_debate';

const TABS: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'feed',     label: 'Feed',     icon: 'documents-outline'    },
  { id: 'shared',   label: 'Shared',   icon: 'share-social-outline' },
  { id: 'activity', label: 'Activity', icon: 'pulse-outline'        },
  { id: 'members',  label: 'Members',  icon: 'people-outline'       },
];

const SCROLL_REVEAL_THRESHOLD = 360;

function formatJoined(raw: string | undefined | null): string {
  if (!raw) return 'Unknown date';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function copyVoiceDebateTranscript(item: SharedVoiceDebate): Promise<void> {
  const turns = item.script?.turns ?? [];
  const text = turns.map((t: any) => {
    const key = (t.speaker ?? 'moderator') as keyof typeof VOICE_PERSONAS;
    const persona = VOICE_PERSONAS[key] ?? VOICE_PERSONAS['moderator'];
    return `[${persona.displayName}]\n${t.text}`;
  }).join('\n\n');
  const { setString } = await import('expo-clipboard');
  await setString(`Voice Debate: ${item.topic}\n\n${text}`);
}

export default function WorkspaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    workspace, members, reports, userRole,
    isLoading, isRefreshing, error,
    refresh, update, addReport, removeReport,
    sharedContentVersion,
    isSelfRemoved,
    pinnedReportIds,
    updatePin,
    reportsHasMore, reportsLoadingMore, loadMoreReports,
  } = useWorkspace(id ?? null);

  useWorkspaceBotIndex(id);

  const { items: activities } = useActivityFeed(id ?? null);

  const {
    pendingCount, requests: pendingRequests,
    isActioning, approve: approveRequest, deny: denyRequest,
  } = usePendingAccessRequests(id ?? null, userRole);

  const [activeTab,     setActiveTab]     = useState<TabId>('feed');

  // ── Part 51: one-way latch — Shared content fetches only after first open ──
  const [sharedTabActivated, setSharedTabActivated] = useState(false);
  useEffect(() => {
    if (activeTab === 'shared') setSharedTabActivated(true);
  }, [activeTab]);

  const activeWorkspaceId = isSelfRemoved ? null : (id ?? null);
  const sharedEnabled     = sharedTabActivated && !isSelfRemoved;

  const sharing            = useWorkspaceSharing(activeWorkspaceId, sharedContentVersion, sharedEnabled);
  const podcastSharing     = usePodcastSharing(activeWorkspaceId, sharedContentVersion, sharedEnabled);
  const debateSharing      = useDebateSharing(activeWorkspaceId, sharedContentVersion, sharedEnabled);
  const voiceDebateSharing = useVoiceDebateSharing(activeWorkspaceId, sharedContentVersion, sharedEnabled);

  const isOwner  = userRole === 'owner';
  const isEditor = userRole === 'editor' || isOwner;

  const { unread: chatUnread, clear: clearChatUnread } =
    useWorkspaceChatUnread(id ?? null, isEditor);

  const [activeFilter,  setActiveFilter]  = useState<SharedFilter>('all');
  const [showInvite,    setShowInvite]    = useState(false);
  const [showAddReport, setShowAddReport] = useState(false);
  const [showSearch,    setShowSearch]    = useState(false);
  const pinnedIds = pinnedReportIds;
  const [isPinToggling, setIsPinToggling] = useState(false);
  const [profileMember, setProfileMember] = useState<MiniProfile | null>(null);
  const [showProfile,   setShowProfile]   = useState(false);
  const [showRequests,  setShowRequests]  = useState(false);

  const existingReportIds = reports.map(r => r.reportId);

  useEffect(() => {
    if (isSelfRemoved) {
      router.replace('/(app)/(tabs)/workspace' as any);
    }
  }, [isSelfRemoved]);

  // ── Pin toggle ─────────────────────────────────────────────────────────
  const handleTogglePin = async (reportId: string, reportTitle: string) => {
    if (!id || !isEditor || isPinToggling) return;
    setIsPinToggling(true);
    try {
      const { data, error } = await supabase.rpc('toggle_pin_workspace_report', {
        p_workspace_id: id, p_report_id: reportId,
      });
      if (error) throw error;
      const result = data as { pinned: boolean };
      updatePin(reportId, result.pinned);
      logPinToggled({
        workspaceId:  id,
        reportId,
        pinned:       result.pinned,
        reportTitle,
      }).catch(() => {});
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to toggle pin');
    } finally {
      setIsPinToggling(false);
    }
  };

  // ── Feature 4: remove a shared report ──────────────────────────────────
  const handleRemoveReport = useCallback(async (reportId: string) => {
    const { error } = await removeReport(reportId);
    if (error) Alert.alert('Error', error);
  }, [removeReport]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const openReport = useCallback((reportId: string) => {
    router.push({ pathname: '/(app)/workspace-report' as any, params: { reportId, workspaceId: id, userRole: userRole ?? 'viewer' } });
  }, [id, userRole]);

  const openChat = useCallback(() => {
    if (!id) return;
    clearChatUnread();
    router.push({ pathname: '/(app)/workspace-chat' as any, params: { id, name: workspace?.name ?? 'Team Chat', role: userRole ?? 'viewer' } });
  }, [id, workspace?.name, userRole, clearChatUnread]);

  const handleOpenMemberProfile = useCallback((member: MiniProfile) => {
    setProfileMember(member);
    setShowProfile(true);
  }, []);

  const handleOpenSharedContent = useCallback((item: SharedWorkspaceContent) => {
    router.push({ pathname: '/(app)/workspace-shared-viewer' as any, params: { contentType: item.contentType, contentId: item.contentId, workspaceId: item.workspaceId, sharerName: item.sharerName ?? '', sharedAt: item.sharedAt ?? '' } });
  }, []);

  const handleOpenSharedPodcast = useCallback((podcast: SharedPodcast) => {
    router.push({ pathname: '/(app)/workspace-shared-podcast-player' as any, params: { workspaceId: id, sharedId: podcast.id, contentTitle: podcast.title } });
  }, [id]);

  const handleOpenSharedDebate = useCallback((debate: SharedDebate) => {
    router.push({ pathname: '/(app)/workspace-shared-debate' as any, params: { workspaceId: id, sharedId: debate.id, contentTitle: debate.topic } });
  }, [id]);

  const handleOpenSharedVoiceDebate = useCallback((svd: SharedVoiceDebate) => {
    router.push({ pathname: '/(app)/workspace-shared-voice-debate-player' as any, params: { workspaceId: id, sharedId: svd.id, contentTitle: svd.topic } });
  }, [id]);

  const handleOpenSearchSharedContent = useCallback((
    contentType: 'presentation' | 'academic_paper' | 'podcast' | 'debate',
    contentId:   string,
    workspaceId: string,
  ) => {
    if (contentType === 'presentation' || contentType === 'academic_paper') {
      router.push({ pathname: '/(app)/workspace-shared-viewer' as any, params: { contentType, contentId, workspaceId, sharerName: '', sharedAt: '' } });
    } else if (contentType === 'podcast') {
      router.push({ pathname: '/(app)/workspace-shared-podcast-player' as any, params: { workspaceId, sharedId: contentId, contentTitle: '' } });
    } else if (contentType === 'debate') {
      router.push({ pathname: '/(app)/workspace-shared-debate' as any, params: { workspaceId, sharedId: contentId, contentTitle: '' } });
    }
  }, []);

  // ── Remove shared content ──────────────────────────────────────────────
  const handleRemoveSharedContent  = useCallback(async (item: SharedWorkspaceContent) => {
    const { error } = await sharing.remove(item.contentType, item.contentId);
    if (error) Alert.alert('Error', error);
  }, [sharing]);

  const handleRemoveSharedPodcast  = useCallback(async (podcast: SharedPodcast) => {
    const { error } = await podcastSharing.remove(podcast.podcastId);
    if (error) Alert.alert('Error', error);
  }, [podcastSharing]);

  const handleRemoveSharedDebate   = useCallback(async (debate: SharedDebate) => {
    const { error } = await debateSharing.remove(debate.debateId);
    if (error) Alert.alert('Error', error);
  }, [debateSharing]);

  const handleRemoveSharedVoiceDebate = useCallback(async (svd: SharedVoiceDebate) => {
    const { error } = await voiceDebateSharing.remove(svd.voiceDebateId);
    if (error) Alert.alert('Error', error);
  }, [voiceDebateSharing]);

  // ── Podcast export ─────────────────────────────────────────────────────
  const handleDownloadPodcastMP3  = useCallback(async (p: SharedPodcast) => { try { await exportPodcastAsMP3(sharedPodcastToPodcast(p)); } catch (e) { Alert.alert('Export Error', e instanceof Error ? e.message : 'Failed'); } }, []);
  const handleExportPodcastPDF    = useCallback(async (p: SharedPodcast) => { try { await exportPodcastAsPDF(sharedPodcastToPodcast(p)); } catch (e) { Alert.alert('Export Error', e instanceof Error ? e.message : 'Failed'); } }, []);
  const handleCopyPodcastScript   = useCallback(async (p: SharedPodcast) => { try { await copyPodcastScriptToClipboard(sharedPodcastToPodcast(p)); } catch { Alert.alert('Error', 'Failed to copy script'); } }, []);

  // ── Debate export ──────────────────────────────────────────────────────
  const handleExportDebatePDF     = useCallback(async (d: SharedDebate) => { try { await exportDebateAsPDF(sharedDebateToSession(d)); } catch (e) { Alert.alert('Export Error', e instanceof Error ? e.message : 'Failed'); } }, []);
  const handleCopyDebateText      = useCallback(async (d: SharedDebate) => { try { await copyDebateSummary(sharedDebateToSession(d)); } catch { Alert.alert('Error', 'Failed to copy'); } }, []);
  const handleShareDebateText     = useCallback(async (d: SharedDebate) => { try { await shareDebateText(sharedDebateToSession(d)); } catch {} }, []);
  const handleCopyVoiceDebateText = useCallback(async (svd: SharedVoiceDebate) => { try { await copyVoiceDebateTranscript(svd); } catch { Alert.alert('Error', 'Failed to copy transcript'); } }, []);

  // ── Leave workspace ────────────────────────────────────────────────────
  const handleLeave = () => {
    Alert.alert('Leave Workspace', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        if (!id) return;
        const { error } = await leaveWorkspace(id);
        if (!error) router.replace('/(app)/(tabs)/workspace' as any);
        else Alert.alert('Error', error);
      }},
    ]);
  };

  const handleApproveRequest = async (requestId: string) => {
    const { error } = await approveRequest(requestId);
    if (error) Alert.alert('Error', error);
    else refresh(false);
  };

  const handleDenyRequest = async (requestId: string) => {
    const { error } = await denyRequest(requestId);
    if (error) Alert.alert('Error', error);
  };

  // ── Sort feed: pinned first ────────────────────────────────────────────
  const sortedReports: WorkspaceReport[] = [
    ...reports.filter(r => pinnedIds.has(r.reportId)).map(r => ({ ...r, isPinned: true  })),
    ...reports.filter(r => !pinnedIds.has(r.reportId)).map(r => ({ ...r, isPinned: false })),
  ];

  // ── Shared content counts ──────────────────────────────────────────────
  const presentationCount  = sharing.presentations.length;
  const paperCount         = sharing.papers.length;
  const podcastCount       = podcastSharing.podcasts.length;
  const debateCount        = debateSharing.debates.length;
  const voiceDebateCount   = voiceDebateSharing.voiceDebates.length;
  const totalSharedCount   = presentationCount + paperCount + podcastCount + debateCount + voiceDebateCount;

  // Part 51 — all four first-loads resolved? (false until Shared opened + fetched)
  const sharedReady =
    sharing.hasLoaded && podcastSharing.hasLoaded &&
    debateSharing.hasLoaded && voiceDebateSharing.hasLoaded;

  const showPresentations = activeFilter === 'all' || activeFilter === 'presentation';
  const showPapers        = activeFilter === 'all' || activeFilter === 'academic_paper';
  const showPodcasts      = activeFilter === 'all' || activeFilter === 'podcast';
  const showDebates       = activeFilter === 'all' || activeFilter === 'debate';
  const showVoiceDebates  = activeFilter === 'all' || activeFilter === 'voice_debate';

  // ── Lazy-reveal windows ────────────────────────────────────────────────
  const feedReveal  = useLazyReveal(sortedReports.length,                  { initial: 6, step: 6 });
  const presReveal  = useLazyReveal(sharing.presentations.length,          { initial: 5, step: 5 });
  const paperReveal = useLazyReveal(sharing.papers.length,                 { initial: 5, step: 5 });
  const podReveal   = useLazyReveal(podcastSharing.podcasts.length,        { initial: 5, step: 5 });
  const debReveal   = useLazyReveal(debateSharing.debates.length,          { initial: 5, step: 5 });
  const vdReveal    = useLazyReveal(voiceDebateSharing.voiceDebates.length,{ initial: 5, step: 5 });

  useEffect(() => {
    feedReveal.reset(); presReveal.reset(); paperReveal.reset();
    podReveal.reset();  debReveal.reset();  vdReveal.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeFilter]);

  // ── Scroll-near-bottom handler ─────────────────────────────────────────
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const distanceToBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (distanceToBottom > SCROLL_REVEAL_THRESHOLD) return;

    if (activeTab === 'feed') {
      if (feedReveal.hasMore) {
        feedReveal.revealMore();
      } else if (reportsHasMore && !reportsLoadingMore) {
        loadMoreReports();
      }
    } else if (activeTab === 'shared') {
      if (presReveal.hasMore)  presReveal.revealMore();
      if (paperReveal.hasMore) paperReveal.revealMore();
      if (podReveal.hasMore)   podReveal.revealMore();
      if (debReveal.hasMore)   debReveal.revealMore();
      if (vdReveal.hasMore)    vdReveal.revealMore();
    }
  }, [
    activeTab, feedReveal, reportsHasMore, reportsLoadingMore, loadMoreReports,
    presReveal, paperReveal, podReveal, debReveal, vdReveal,
  ]);

  const visibleReports = sortedReports.slice(0, feedReveal.visible);

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

        {/* Top bar */}
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
            {isEditor && (
              <TouchableOpacity onPress={openChat} style={[styles.iconBtn, styles.chatBtn]} activeOpacity={0.8}>
                <Ionicons name="chatbubbles-outline" size={20} color={COLORS.primary} />
                {chatUnread > 0 && (
                  <View style={styles.chatBadge}>
                    <Text style={styles.chatBadgeText}>{chatUnread > 9 ? '9+' : chatUnread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
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
                onPress={() => router.push({ pathname: '/(app)/workspace-settings' as any, params: { id, role: userRole ?? 'editor' } })}
                style={styles.iconBtn}
              >
                <Ionicons name={isOwner ? 'settings-outline' : 'share-outline'} size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Pending requests banner */}
        {isEditor && pendingCount > 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.requestBanner}>
            <View style={styles.requestBannerLeft}>
              <Ionicons name="person-add-outline" size={16} color={COLORS.warning} />
              <Text style={styles.requestBannerText} numberOfLines={1}>
                {pendingCount} member{pendingCount !== 1 ? 's' : ''} requesting editor access
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowRequests(true)} style={styles.requestBannerCta} activeOpacity={0.85}>
              <Text style={styles.requestBannerCtaText}>Review</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Stats strip — Shared count populates after the tab is first opened */}
        {workspace && (
          <Animated.View entering={FadeIn.duration(500).delay(100)} style={styles.statsStrip}>
            <StatChip icon="people-outline"        value={members.length}    label="Members"  />
            <StatChip icon="document-text-outline" value={reports.length}    label="Reports"  />
            <StatChip icon="share-social-outline"  value={totalSharedCount}  label="Shared"   />
            <StatChip icon="pulse-outline"         value={activities.length} label="Activity" />
          </Animated.View>
        )}

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const badge    = tab.id === 'shared' && totalSharedCount > 0 ? totalSharedCount : null;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tabItem, isActive && styles.tabItemActive]}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons name={tab.icon} size={15} color={isActive ? COLORS.primary : COLORS.textMuted} />
                  {badge !== null && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                refresh(true);
                // Part 51 — only refresh shared content if it's actually been opened
                if (sharedTabActivated) {
                  sharing.load();
                  podcastSharing.load();
                  debateSharing.load();
                  voiceDebateSharing.load();
                }
              }}
              tintColor={COLORS.primary}
            />
          }
        >

          {/* ── FEED TAB ── */}
          {activeTab === 'feed' && (
            <>
              {isEditor && (
                <TouchableOpacity style={styles.addReportCta} onPress={() => setShowAddReport(true)} activeOpacity={0.8}>
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.addReportCtaText}>Add a research report</Text>
                </TouchableOpacity>
              )}
              {isEditor && (
                <TouchableOpacity onPress={openChat} style={styles.chatFeedCta} activeOpacity={0.8}>
                  <View style={styles.chatFeedCtaLeft}>
                    <View style={styles.chatFeedCtaIcon}><Ionicons name="chatbubbles" size={18} color={COLORS.primary} /></View>
                    <View>
                      <Text style={styles.chatFeedCtaTitle}>Team Chat</Text>
                      <Text style={styles.chatFeedCtaSub}>Private to owners & editors</Text>
                    </View>
                  </View>
                  <View style={styles.chatFeedCtaRight}>
                    {chatUnread > 0 && <View style={styles.chatFeedBadge}><Text style={styles.chatFeedBadgeText}>{chatUnread > 99 ? '99+' : chatUnread}</Text></View>}
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </View>
                </TouchableOpacity>
              )}
              {pinnedIds.size > 0 && visibleReports.some(r => r.isPinned) && (
                <View style={styles.pinnedHeader}>
                  <Ionicons name="pin" size={13} color={COLORS.warning} />
                  <Text style={styles.pinnedHeaderText}>Pinned</Text>
                </View>
              )}
              {sortedReports.length === 0 && !isLoading ? (
                <View style={styles.emptyState}>
                  <Ionicons name="documents-outline" size={40} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No reports yet</Text>
                  <Text style={styles.emptyDesc}>{isEditor ? 'Tap "Add a research report" above to share one.' : 'No reports have been shared to this workspace yet.'}</Text>
                  {isEditor && (
                    <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddReport(true)} activeOpacity={0.85}>
                      <Ionicons name="add-circle-outline" size={16} color="#FFF" />
                      <Text style={styles.emptyAddBtnText}>Add Report</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <>
                  {visibleReports.map((wr, i) => (
                    <React.Fragment key={wr.id}>
                      {i > 0 && visibleReports[i-1].isPinned && !wr.isPinned && (
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
                          canRemove={isEditor}
                          onRemove={() => handleRemoveReport(wr.reportId)}
                        />
                        {isEditor && (
                          <TouchableOpacity
                            onPress={() => handleTogglePin(wr.reportId, wr.report?.title ?? '')}
                            disabled={isPinToggling}
                            style={[styles.pinBtn, wr.isPinned && styles.pinBtnActive]}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name={wr.isPinned ? 'pin' : 'pin-outline'} size={14} color={wr.isPinned ? COLORS.warning : COLORS.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </React.Fragment>
                  ))}

                  {(feedReveal.hasMore || reportsHasMore || reportsLoadingMore) && (
                    <View style={styles.loadMoreRow}>
                      {reportsLoadingMore
                        ? <ActivityIndicator size="small" color={COLORS.primary} />
                        : <Text style={styles.loadMoreText}>Scroll to load more…</Text>
                      }
                    </View>
                  )}
                </>
              )}
            </>
          )}

          {/* ── SHARED TAB ── */}
          {activeTab === 'shared' && (
            <>
              <Animated.View entering={FadeInDown.duration(400)} style={styles.sharedHeader}>
                <LinearGradient colors={['#6C63FF', '#8B5CF6']} style={styles.sharedHeaderIcon}>
                  <Ionicons name="share-social" size={18} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sharedHeaderTitle}>Shared Content</Text>
                  <Text style={styles.sharedHeaderSub}>Presentations, papers, podcasts, debates & voice debates</Text>
                </View>
              </Animated.View>

              {/* Part 51 — first-open spinner until all four sections have fetched */}
              {!sharedReady ? (
                <View style={styles.sharedLoading}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.sharedLoadingText}>Loading shared content…</Text>
                </View>
              ) : (
                <>
                  {totalSharedCount > 0 && (
                    <Animated.View entering={FadeInDown.duration(300).delay(80)} style={styles.filterRow}>
                      {([
                        { id: 'all',           label: `All (${totalSharedCount})`,          icon: 'apps-outline'      },
                        ...(presentationCount > 0 ? [{ id: 'presentation',  label: `Slides (${presentationCount})`,   icon: 'easel-outline'     }] : []),
                        ...(paperCount        > 0 ? [{ id: 'academic_paper',label: `Papers (${paperCount})`,          icon: 'school-outline'    }] : []),
                        ...(podcastCount      > 0 ? [{ id: 'podcast',       label: `Podcasts (${podcastCount})`,      icon: 'mic-outline'       }] : []),
                        ...(debateCount       > 0 ? [{ id: 'debate',        label: `Debates (${debateCount})`,        icon: 'people-outline'    }] : []),
                        ...(voiceDebateCount  > 0 ? [{ id: 'voice_debate',  label: `Voice (${voiceDebateCount})`,     icon: 'mic-circle-outline'}] : []),
                      ] as { id: SharedFilter; label: string; icon: string }[]).map(chip => (
                        <TouchableOpacity
                          key={chip.id}
                          onPress={() => setActiveFilter(chip.id)}
                          style={[styles.filterChip, activeFilter === chip.id && styles.filterChipActive]}
                          activeOpacity={0.75}
                        >
                          <Ionicons name={chip.icon as any} size={11} color={activeFilter === chip.id ? COLORS.primary : COLORS.textMuted} />
                          <Text style={[styles.filterChipText, activeFilter === chip.id && styles.filterChipTextActive]}>{chip.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </Animated.View>
                  )}

                  {showPresentations && sharing.presentations.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                      <ContentSectionHeader label="Presentations"    count={sharing.presentations.length}       colors={['#6C63FF','#8B5CF6']} />
                      {sharing.presentations.slice(0, presReveal.visible).map((item, i) => (
                        <SharedContentCard key={item.id} item={item} index={i} userRole={userRole} onOpen={handleOpenSharedContent} onRemove={handleRemoveSharedContent} />
                      ))}
                      {presReveal.hasMore && <SectionMoreHint />}
                    </Animated.View>
                  )}
                  {showPapers && sharing.papers.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400).delay(140)}>
                      <ContentSectionHeader label="Academic Papers"  count={sharing.papers.length}              colors={['#10B981','#059669']} badgeColor={COLORS.success} />
                      {sharing.papers.slice(0, paperReveal.visible).map((item, i) => (
                        <SharedContentCard key={item.id} item={item} index={i} userRole={userRole} onOpen={handleOpenSharedContent} onRemove={handleRemoveSharedContent} />
                      ))}
                      {paperReveal.hasMore && <SectionMoreHint />}
                    </Animated.View>
                  )}
                  {showPodcasts && podcastSharing.podcasts.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400).delay(180)}>
                      <ContentSectionHeader label="Podcast Episodes" count={podcastSharing.podcasts.length}     colors={['#FF6584','#FF8FA3']} badgeColor="#FF6584" />
                      {podcastSharing.podcasts.slice(0, podReveal.visible).map((podcast, i) => (
                        <SharedPodcastCard key={podcast.id} item={podcast} index={i} userRole={userRole} onPlay={handleOpenSharedPodcast} onRemove={handleRemoveSharedPodcast} onDownloadMP3={handleDownloadPodcastMP3} onExportPDF={handleExportPodcastPDF} onCopyScript={handleCopyPodcastScript} />
                      ))}
                      {podReveal.hasMore && <SectionMoreHint />}
                    </Animated.View>
                  )}
                  {showDebates && debateSharing.debates.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400).delay(220)}>
                      <ContentSectionHeader label="AI Debates"       count={debateSharing.debates.length}       colors={['#6C63FF','#9B59FF']} badgeColor={COLORS.primary} />
                      {debateSharing.debates.slice(0, debReveal.visible).map((debate, i) => (
                        <SharedDebateCard key={debate.id} item={debate} index={i} userRole={userRole} onView={handleOpenSharedDebate} onRemove={handleRemoveSharedDebate} onExportPDF={handleExportDebatePDF} onCopyText={handleCopyDebateText} onShareText={handleShareDebateText} />
                      ))}
                      {debReveal.hasMore && <SectionMoreHint />}
                    </Animated.View>
                  )}
                  {showVoiceDebates && voiceDebateSharing.voiceDebates.length > 0 && (
                    <Animated.View entering={FadeInDown.duration(400).delay(260)}>
                      <ContentSectionHeader label="Voice Debates"    count={voiceDebateSharing.voiceDebates.length} colors={['#8B5CF6','#A78BFA']} badgeColor="#8B5CF6" />
                      {voiceDebateSharing.voiceDebates.slice(0, vdReveal.visible).map((svd, i) => (
                        <SharedVoiceDebateCard key={svd.id} item={svd} index={i} userRole={userRole} onPlay={handleOpenSharedVoiceDebate} onRemove={handleRemoveSharedVoiceDebate} onCopyText={handleCopyVoiceDebateText} />
                      ))}
                      {vdReveal.hasMore && <SectionMoreHint />}
                    </Animated.View>
                  )}

                  {totalSharedCount === 0 && (
                    <Animated.View entering={FadeInDown.duration(500)} style={styles.emptyState}>
                      <View style={styles.sharedEmptyIcon}><Ionicons name="share-social-outline" size={36} color={COLORS.textMuted} /></View>
                      <Text style={styles.emptyTitle}>Nothing Shared Yet</Text>
                      <Text style={styles.emptyDesc}>{isEditor ? 'Share presentations, papers, podcasts, debates, and voice debates from your content.' : 'No content has been shared to this workspace yet.'}</Text>
                      {isEditor && (
                        <View style={styles.sharedEmptyHint}>
                          <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
                          <Text style={styles.sharedEmptyHintText}>Open a report, debate, or podcast → tap the share icon to share here</Text>
                        </View>
                      )}
                    </Animated.View>
                  )}
                </>
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
              activities.map(a => <ActivityItem key={a.id} activity={a} />)
            )
          )}

          {/* ── MEMBERS TAB ── */}
          {activeTab === 'members' && (
            <>
              {isOwner && (
                <TouchableOpacity style={styles.manageMembersBtn} onPress={() => router.push({ pathname: '/(app)/workspace-members' as any, params: { id } })}>
                  <Ionicons name="settings-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.manageMembersBtnText}>Manage Members & Roles</Text>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
              {isEditor && (
                <TouchableOpacity onPress={openChat} style={styles.chatMembersEntryBtn} activeOpacity={0.8}>
                  <View style={styles.chatMembersEntryIcon}><Ionicons name="chatbubbles" size={18} color={COLORS.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chatMembersEntryTitle}>Team Chat</Text>
                    <Text style={styles.chatMembersEntrySub}>Chat with owners & editors only</Text>
                  </View>
                  {chatUnread > 0 && <View style={styles.chatFeedBadge}><Text style={styles.chatFeedBadgeText}>{chatUnread > 99 ? '99+' : chatUnread}</Text></View>}
                  <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
              {members.map((m, i) => (
                <Animated.View key={m.id} entering={FadeInDown.duration(300).delay(i * 40)} style={styles.memberRow}>
                  <TouchableOpacity onPress={() => { if (m.profile) { setProfileMember(m.profile); setShowProfile(true); } }} activeOpacity={0.75} style={styles.memberRowInner}>
                    <View style={styles.memberAvatarWrap}><MemberAvatar profile={m.profile} role={m.role} size={40} showLabel showRole /></View>
                    <View style={styles.memberTextBlock}>
                      <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">{m.profile?.fullName ?? m.profile?.username ?? 'Unknown'}</Text>
                      <Text style={styles.joinedText} numberOfLines={1} ellipsizeMode="tail">Joined {formatJoined(m.joinedAt)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </Animated.View>
              ))}
              {userRole !== 'owner' && userRole !== null && (
                <Animated.View entering={FadeInDown.duration(300).delay(200)}>
                  <View style={styles.leaveSection}>
                    <Text style={styles.leaveSectionLabel}>Your membership</Text>
                    <TouchableOpacity onPress={handleLeave} style={styles.leaveBtn} activeOpacity={0.8}>
                      <Ionicons name="log-out-outline" size={16} color={COLORS.error} />
                      <Text style={styles.leaveBtnText}>Leave Workspace</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
            </>
          )}
        </ScrollView>

        {/* Modals */}
        {workspace && <InviteModal workspace={workspace} visible={showInvite} isOwner={isOwner} onClose={() => setShowInvite(false)} onCodeUpdated={() => update({ name: workspace.name })} />}
        {id && (
          <AddToWorkspaceSheet
            workspaceId={id}
            existingReportIds={existingReportIds}
            visible={showAddReport}
            onClose={() => setShowAddReport(false)}
            onAdded={reportId => {
              addReport?.(reportId);
              triggerReportIndexing(id, reportId).catch(() => {});
            }}
          />
        )}
        {id && (
          <WorkspaceSearchModal
            visible={showSearch}
            workspaceId={id}
            userRole={userRole}
            onClose={() => setShowSearch(false)}
            onOpenReport={openReport}
            onOpenMemberProfile={handleOpenMemberProfile}
            onOpenSharedContent={handleOpenSearchSharedContent}
          />
        )}
        {id && <MemberProfileCard visible={showProfile} member={profileMember} workspaceId={id} onClose={() => { setShowProfile(false); setProfileMember(null); }} onNavigateToReport={openReport} onNavigateToComment={(reportId) => openReport(reportId)} />}
        <EditAccessRequestModal mode="owner" visible={showRequests} requests={pendingRequests} isActioning={isActioning} onApprove={handleApproveRequest} onDeny={handleDenyRequest} onClose={() => setShowRequests(false)} />
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionMoreHint() {
  return (
    <View style={styles.sectionMoreHint}>
      <Ionicons name="chevron-down" size={12} color={COLORS.textMuted} />
      <Text style={styles.sectionMoreHintText}>Scroll to load more</Text>
    </View>
  );
}

function ContentSectionHeader({ label, count, colors, badgeColor = COLORS.primary }: {
  label: string; count: number; colors: [string, string]; badgeColor?: string;
}) {
  return (
    <View style={styles.contentSectionHeader}>
      <LinearGradient colors={colors} style={styles.contentSectionDot} />
      <Text style={styles.contentSectionTitle}>{label}</Text>
      <View style={[styles.contentSectionBadge, { backgroundColor: `${badgeColor}20`, borderColor: `${badgeColor}35` }]}>
        <Text style={[styles.contentSectionBadgeText, { color: badgeColor }]}>{count}</Text>
      </View>
    </View>
  );
}

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
  topBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: 8 },
  backIconBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  topBarCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  wsName:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', flex: 1 },
  rolePill:     { backgroundColor: `${COLORS.primary}20`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  rolePillText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' },
  topBarRight:  { flexDirection: 'row', gap: 6 },
  iconBtn:      { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  chatBtn:      { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}35` },
  chatBadge:    { position: 'absolute', top: -4, right: -4, backgroundColor: COLORS.error, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: COLORS.background },
  chatBadgeText:{ color: '#FFF', fontSize: 8, fontWeight: '800' },
  requestBanner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SPACING.xl, marginBottom: SPACING.xs, backgroundColor: `${COLORS.warning}12`, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 9, borderWidth: 1, borderColor: `${COLORS.warning}30` },
  requestBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  requestBannerText: { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },
  requestBannerCta:  { backgroundColor: COLORS.warning, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 5 },
  requestBannerCtaText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },
  statsStrip: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  tabBar:         { flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: 6, marginBottom: SPACING.sm },
  tabItem:        { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: RADIUS.lg, backgroundColor: COLORS.backgroundCard, borderWidth: 1, borderColor: COLORS.border },
  tabItemActive:  { backgroundColor: `${COLORS.primary}20`, borderColor: `${COLORS.primary}50` },
  tabLabel:       { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  tabLabelActive: { color: COLORS.primary },
  tabBadge:       { position: 'absolute', top: -5, right: -7, backgroundColor: COLORS.primary, borderRadius: 7, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  tabBadgeText:   { color: '#FFF', fontSize: 8, fontWeight: '800' },
  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: 120 },
  addReportCta:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: `${COLORS.primary}50`, marginBottom: SPACING.sm },
  addReportCtaText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  chatFeedCta:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` },
  chatFeedCtaLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  chatFeedCtaIcon:  { width: 40, height: 40, borderRadius: 13, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chatFeedCtaTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  chatFeedCtaSub:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  chatFeedCtaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chatFeedBadge:    { backgroundColor: COLORS.error, borderRadius: RADIUS.full, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  chatFeedBadgeText:{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '800' },
  chatMembersEntryBtn:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` },
  chatMembersEntryIcon:  { width: 38, height: 38, borderRadius: 12, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chatMembersEntryTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  chatMembersEntrySub:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  pinnedHeader:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  pinnedHeaderText: { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionDivider:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: SPACING.sm },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  sectionDividerText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  reportCardWrap: { position: 'relative' },
  pinBtn:         { position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, zIndex: 10 },
  pinBtnActive:   { backgroundColor: `${COLORS.warning}15`, borderColor: `${COLORS.warning}40` },
  loadMoreRow:      { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.md, gap: 6 },
  loadMoreText:     { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  sectionMoreHint:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: SPACING.sm },
  sectionMoreHintText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  // Part 51 — shared tab first-load spinner
  sharedLoading:     { alignItems: 'center', justifyContent: 'center', paddingTop: 50, gap: 10 },
  sharedLoadingText: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  sharedHeader:     { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25` },
  sharedHeaderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sharedHeaderTitle:{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' },
  sharedHeaderSub:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3, lineHeight: 16 },
  filterRow:             { flexDirection: 'row', gap: 8, marginBottom: SPACING.md, flexWrap: 'wrap' },
  filterChip:            { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive:      { backgroundColor: `${COLORS.primary}15`, borderColor: `${COLORS.primary}35` },
  filterChipText:        { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  filterChipTextActive:  { color: COLORS.primary },
  contentSectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  contentSectionDot:       { width: 14, height: 14, borderRadius: 4, flexShrink: 0 },
  contentSectionTitle:     { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', flex: 1 },
  contentSectionBadge:     { backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  contentSectionBadgeText: { fontSize: 10, fontWeight: '700' },
  sharedEmptyIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: `${COLORS.primary}12`, alignItems: 'center', justifyContent: 'center' },
  sharedEmptyHint: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}20`, marginTop: 4, maxWidth: 280 },
  sharedEmptyHintText: { color: COLORS.primary, fontSize: FONTS.sizes.xs, lineHeight: 16, flex: 1 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '700' },
  emptyDesc:  { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 21, maxWidth: 290 },
  emptyAddBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: 10, marginTop: 4 },
  emptyAddBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },
  manageMembersBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}30` },
  manageMembersBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1 },
  memberRow:        { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  memberRowInner:   { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md },
  memberAvatarWrap: { width: 40, height: 40, flexShrink: 0 },
  memberTextBlock:  { flex: 1, minWidth: 0 },
  memberName:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  joinedText:       { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  leaveSection:     { marginTop: SPACING.xl, backgroundColor: `${COLORS.error}08`, borderRadius: RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}20`, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  leaveSectionLabel:{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },
  leaveBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${COLORS.error}15`, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 9, borderWidth: 1, borderColor: `${COLORS.error}30`, flexShrink: 0 },
  leaveBtnText:     { color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' },
});