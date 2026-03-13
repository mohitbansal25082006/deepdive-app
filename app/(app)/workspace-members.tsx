// app/(app)/workspace-members.tsx
// Part 12 CHANGES:
//   1. Tapping any member row opens MemberProfileCard bottom sheet
//   2. Owner sees pending access requests badge + review sheet
//   3. Full MemberProfileCard + EditAccessRequestModal wired in

import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useWorkspaceMembers } from '../../src/hooks/useWorkspaceMembers';
import { useWorkspace } from '../../src/hooks/useWorkspace';
import { usePendingAccessRequests } from '../../src/hooks/useEditAccessRequest';
import { MemberAvatar } from '../../src/components/workspace/MemberAvatar';
import { MemberRoleModal } from '../../src/components/workspace/MemberRoleModal';
import { InviteModal } from '../../src/components/workspace/InviteModal';
import { MemberProfileCard } from '../../src/components/workspace/MemberProfileCard';
import { EditAccessRequestModal } from '../../src/components/workspace/EditAccessRequestModal';
import { WorkspaceMember, WorkspaceRole, MiniProfile } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

const ROLE_COLOR: Record<WorkspaceRole, string> = {
  owner:  COLORS.pro,
  editor: COLORS.primary,
  viewer: COLORS.textMuted,
};

export default function WorkspaceMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    members, isLoading, isUpdating, userRole, isOwner,
    refresh, changeRole, remove, leave, transferOwner,
  } = useWorkspaceMembers(id ?? null);
  const { workspace } = useWorkspace(id ?? null);

  // Part 12 — Pending access requests (owner/editor only)
  const {
    requests: pendingRequests,
    pendingCount,
    isActioning,
    approve: approveRequest,
    deny:    denyRequest,
  } = usePendingAccessRequests(id ?? null, userRole);

  // Modal states
  const [selectedMember,      setSelectedMember]      = useState<WorkspaceMember | null>(null);
  const [showRoleModal,       setShowRoleModal]        = useState(false);
  const [showInvite,          setShowInvite]           = useState(false);
  const [profileMember,       setProfileMember]        = useState<MiniProfile | null>(null);  // Part 12
  const [showProfile,         setShowProfile]          = useState(false);                      // Part 12
  const [showAccessRequests,  setShowAccessRequests]   = useState(false);                      // Part 12

  const isEditor = userRole === 'editor' || isOwner;

  // ── Open role modal (owner taps a non-owner member) ───────────────────────
  const handleManageMember = (member: WorkspaceMember) => {
    if (!isOwner || member.role === 'owner') return;
    setSelectedMember(member);
    setShowRoleModal(true);
  };

  // ── Open profile card (any member tap) ────────────────────────────────────
  const handleViewProfile = (member: WorkspaceMember) => {
    if (!member.profile) return;
    setProfileMember(member.profile);
    setShowProfile(true);
  };

  const handleChangeRole = async (userId: string, role: Exclude<WorkspaceRole, 'owner'>) => {
    const { error } = await changeRole(userId, role);
    if (error) Alert.alert('Error', error);
  };

  const handleRemove = async (userId: string) => {
    Alert.alert('Remove Member', 'Remove this member from the workspace?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await remove(userId);
          if (error) Alert.alert('Error', error);
        },
      },
    ]);
  };

  const handleTransfer = (member: WorkspaceMember) => {
    const name = member.profile?.fullName ?? member.profile?.username ?? 'this member';
    Alert.alert(
      'Transfer Ownership',
      `Transfer ownership to ${name}? You will become an Editor.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transfer', style: 'destructive',
          onPress: async () => {
            const { error } = await transferOwner(member.userId);
            if (error) Alert.alert('Error', error);
            else router.back();
          },
        },
      ],
    );
  };

  const handleApproveRequest = async (requestId: string) => {
    const { error } = await approveRequest(requestId);
    if (error) Alert.alert('Error', error);
    else {
      Alert.alert('✅ Approved', 'Member has been upgraded to Editor.');
      refresh(); // Refresh member list to reflect new role
    }
  };

  const handleDenyRequest = async (requestId: string) => {
    const { error } = await denyRequest(requestId);
    if (error) Alert.alert('Error', error);
  };

  const owners  = members.filter(m => m.role === 'owner');
  const editors = members.filter(m => m.role === 'editor');
  const viewers = members.filter(m => m.role === 'viewer');

  const sections: { role: WorkspaceRole; label: string; data: WorkspaceMember[] }[] = (
    [
      { role: 'owner'  as const, label: 'Owner',   data: owners  },
      { role: 'editor' as const, label: 'Editors', data: editors },
      { role: 'viewer' as const, label: 'Viewers', data: viewers },
    ] as { role: WorkspaceRole; label: string; data: WorkspaceMember[] }[]
  ).filter(s => s.data.length > 0);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>Members</Text>
            <Text style={styles.memberCount}>{members.length} total</Text>
          </View>

          {/* Part 12 — Pending requests badge (owner/editor) */}
          {isEditor && pendingCount > 0 && (
            <TouchableOpacity
              onPress={() => setShowAccessRequests(true)}
              style={styles.pendingBadgeBtn}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={16} color={COLORS.warning} />
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
              <Text style={styles.pendingBadgeLabel}>Pending</Text>
            </TouchableOpacity>
          )}

          {isOwner && (
            <TouchableOpacity onPress={() => setShowInvite(true)} style={styles.inviteBtn}>
              <Ionicons name="person-add-outline" size={15} color="#FFF" />
              <Text style={styles.inviteBtnText}>Invite</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Part 12 — Access request notification banner */}
        {isEditor && pendingCount > 0 && (
          <Animated.View entering={FadeIn.duration(300)} style={styles.requestBanner}>
            <Ionicons name="notifications-outline" size={15} color={COLORS.warning} />
            <Text style={styles.requestBannerText} numberOfLines={1}>
              {pendingCount} viewer{pendingCount !== 1 ? 's are' : ' is'} requesting editor access
            </Text>
            <TouchableOpacity
              onPress={() => setShowAccessRequests(true)}
              style={styles.requestBannerCta}
            >
              <Text style={styles.requestBannerCtaText}>Review</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              {sections.map(section => (
                <Animated.View key={section.role} entering={FadeInDown.duration(400)}>
                  {/* Section label */}
                  <View style={styles.sectionLabelRow}>
                    <View style={[styles.sectionDot, { backgroundColor: ROLE_COLOR[section.role] }]} />
                    <Text style={[styles.sectionLabel, { color: ROLE_COLOR[section.role] }]}>
                      {section.label}
                    </Text>
                    <Text style={styles.sectionCount}>{section.data.length}</Text>
                  </View>

                  {/* Member rows */}
                  {section.data.map((member, i) => {
                    const name      = member.profile?.fullName ?? member.profile?.username ?? 'Unknown';
                    const username  = member.profile?.username;
                    const joinedDate = new Date(member.joinedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    });
                    const canManage = isOwner && member.role !== 'owner';

                    return (
                      <Animated.View
                        key={member.id}
                        entering={FadeInDown.duration(300).delay(i * 40)}
                      >
                        {/* Part 12: whole row tappable → profile card */}
                        <TouchableOpacity
                          onPress={() => handleViewProfile(member)}
                          activeOpacity={0.75}
                          style={styles.memberCard}
                        >
                          {/* Left: avatar + info */}
                          <View style={styles.memberLeft}>
                            <MemberAvatar
                              profile={member.profile}
                              role={member.role}
                              size={40}
                            />
                            <View style={styles.memberInfo}>
                              <Text style={styles.memberName} numberOfLines={1}>{name}</Text>
                              {username && (
                                <Text style={styles.memberUsername} numberOfLines={1}>
                                  @{username}
                                </Text>
                              )}
                              <Text style={styles.memberJoined} numberOfLines={1}>
                                Joined {joinedDate}
                              </Text>
                            </View>
                          </View>

                          {/* Right: role badge + manage button */}
                          <View style={styles.memberRight}>
                            <View style={[
                              styles.roleBadge,
                              { backgroundColor: `${ROLE_COLOR[member.role]}15` },
                            ]}>
                              <Text style={[
                                styles.roleBadgeText,
                                { color: ROLE_COLOR[member.role] },
                              ]}>
                                {member.role}
                              </Text>
                            </View>

                            {canManage && (
                              <View style={styles.memberActions}>
                                {/* Transfer key */}
                                <TouchableOpacity
                                  onPress={() => handleTransfer(member)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  style={[styles.iconBtn, { backgroundColor: `${COLORS.warning}15` }]}
                                >
                                  <Ionicons name="key-outline" size={14} color={COLORS.warning} />
                                </TouchableOpacity>
                                {/* Manage role */}
                                <TouchableOpacity
                                  onPress={() => handleManageMember(member)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  style={[styles.iconBtn, { backgroundColor: `${COLORS.primary}15` }]}
                                >
                                  <Ionicons name="settings-outline" size={14} color={COLORS.primary} />
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </Animated.View>
              ))}

              {/* Leave workspace (non-owners) */}
              {userRole !== 'owner' && (
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Leave Workspace', 'Are you sure you want to leave?', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Leave', style: 'destructive',
                        onPress: async () => {
                          const { error } = await leave();
                          if (!error) router.replace('/(app)/(tabs)/workspace' as any);
                          else Alert.alert('Error', error);
                        },
                      },
                    ])
                  }
                  style={styles.leaveBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="log-out-outline" size={18} color={COLORS.error} />
                  <Text style={styles.leaveBtnText}>Leave Workspace</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>

        {/* ── Role management modal ── */}
        <MemberRoleModal
          member={selectedMember}
          visible={showRoleModal}
          isUpdating={isUpdating}
          onClose={() => { setShowRoleModal(false); setSelectedMember(null); }}
          onChangeRole={handleChangeRole}
          onRemove={handleRemove}
        />

        {/* ── Invite modal ── */}
        {workspace && (
          <InviteModal
            workspace={workspace}
            visible={showInvite}
            isOwner={isOwner}
            onClose={() => setShowInvite(false)}
            onCodeUpdated={() => {}}
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

        {/* ── Part 12: Access requests modal (owner/editor) ── */}
        <EditAccessRequestModal
          mode="owner"
          visible={showAccessRequests}
          requests={pendingRequests}
          isActioning={isActioning}
          onApprove={handleApproveRequest}
          onDeny={handleDenyRequest}
          onClose={() => setShowAccessRequests(false)}
        />

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    flexShrink: 0,
  },
  headerInfo:  { flex: 1, minWidth: 0 },
  title:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' },
  memberCount: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 },

  // Part 12 — pending badge
  pendingBadgeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${COLORS.warning}15`,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: `${COLORS.warning}35`,
    flexShrink: 0,
  },
  pendingBadgeText:  { color: COLORS.warning, fontSize: FONTS.sizes.sm, fontWeight: '800' },
  pendingBadgeLabel: { color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600' },

  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14, paddingVertical: 9,
    flexShrink: 0,
  },
  inviteBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  // Part 12 — request banner
  requestBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: `${COLORS.warning}12`,
    marginHorizontal: SPACING.xl, marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg, padding: SPACING.sm,
    borderWidth: 1, borderColor: `${COLORS.warning}30`,
  },
  requestBannerText: { flex: 1, color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '600' },
  requestBannerCta: {
    backgroundColor: COLORS.warning,
    borderRadius: RADIUS.md,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  requestBannerCtaText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },

  scroll:      { paddingHorizontal: SPACING.xl, paddingBottom: 80 },
  loadingWrap: { alignItems: 'center', paddingTop: 60 },

  // Sections
  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  sectionDot:   { width: 7, height: 7, borderRadius: 4 },
  sectionLabel: { fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionCount: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' },

  // Member card
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  memberLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
    marginRight: SPACING.sm,
  },
  memberInfo:     { flex: 1, minWidth: 0 },
  memberName:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', flexShrink: 1 },
  memberUsername: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1, flexShrink: 1 },
  memberJoined:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2, flexShrink: 1 },
  memberRight:    { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  roleBadge:      { borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText:  { fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' },
  memberActions:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn:        { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Leave
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: `${COLORS.error}10`,
    borderRadius: RADIUS.lg, padding: SPACING.md,
    marginTop: SPACING.xl,
    borderWidth: 1, borderColor: `${COLORS.error}30`,
  },
  leaveBtnText: { color: COLORS.error, fontSize: FONTS.sizes.base, fontWeight: '600' },
});