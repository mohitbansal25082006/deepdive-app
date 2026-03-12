// app/(app)/workspace-members.tsx
// FIX: Member rows no longer overflow — all text is properly constrained
//      with flex: 1 / numberOfLines / minWidth: 0 throughout.

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
import { MemberAvatar } from '../../src/components/workspace/MemberAvatar';
import { MemberRoleModal } from '../../src/components/workspace/MemberRoleModal';
import { InviteModal } from '../../src/components/workspace/InviteModal';
import { useWorkspace } from '../../src/hooks/useWorkspace';
import { WorkspaceMember, WorkspaceRole } from '../../src/types';
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

  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);
  const [showRoleModal,  setShowRoleModal]  = useState(false);
  const [showInvite,     setShowInvite]     = useState(false);

  const handleMemberPress = (member: WorkspaceMember) => {
    if (!isOwner || member.role === 'owner') return;
    setSelectedMember(member);
    setShowRoleModal(true);
  };

  const handleChangeRole = async (userId: string, role: Exclude<WorkspaceRole, 'owner'>) => {
    const { error } = await changeRole(userId, role);
    if (error) Alert.alert('Error', error);
  };

  const handleRemove = async (userId: string) => {
    Alert.alert(
      'Remove Member',
      'Remove this member from the workspace?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            const { error } = await remove(userId);
            if (error) Alert.alert('Error', error);
          },
        },
      ],
    );
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

  const owners  = members.filter(m => m.role === 'owner');
  const editors = members.filter(m => m.role === 'editor');
  const viewers = members.filter(m => m.role === 'viewer');

  const sections = [
    { role: 'owner'  as WorkspaceRole, label: 'Owner',   data: owners  },
    { role: 'editor' as WorkspaceRole, label: 'Editors', data: editors },
    { role: 'viewer' as WorkspaceRole, label: 'Viewers', data: viewers },
  ].filter(s => s.data.length > 0);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>Members</Text>
            <Text style={styles.memberCount}>{members.length} total</Text>
          </View>
          {isOwner && (
            <TouchableOpacity onPress={() => setShowInvite(true)} style={styles.inviteBtn}>
              <Ionicons name="person-add-outline" size={15} color="#FFF" />
              <Text style={styles.inviteBtnText}>Invite</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

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
                    const name = member.profile?.fullName ?? member.profile?.username ?? 'Unknown';
                    const username = member.profile?.username;
                    const joinedDate = new Date(member.joinedAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    });
                    const isClickable = isOwner && member.role !== 'owner';

                    return (
                      <Animated.View
                        key={member.id}
                        entering={FadeInDown.duration(300).delay(i * 40)}
                      >
                        <TouchableOpacity
                          onPress={() => handleMemberPress(member)}
                          activeOpacity={isClickable ? 0.75 : 1}
                          style={styles.memberCard}
                        >
                          {/* Left: avatar + info — constrained with minWidth:0 */}
                          <View style={styles.memberLeft}>
                            <MemberAvatar
                              profile={member.profile}
                              role={member.role}
                              size={40}
                            />
                            {/* Text block: must have flex:1 + minWidth:0 to truncate */}
                            <View style={styles.memberInfo}>
                              <Text style={styles.memberName} numberOfLines={1}>
                                {name}
                              </Text>
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

                          {/* Right: role badge + actions */}
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

                            {isClickable && (
                              <View style={styles.memberActions}>
                                <TouchableOpacity
                                  onPress={() => handleTransfer(member)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  style={[styles.iconBtn, { backgroundColor: `${COLORS.warning}15` }]}
                                >
                                  <Ionicons name="key-outline" size={14} color={COLORS.warning} />
                                </TouchableOpacity>
                                <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
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

        {/* Role modal */}
        <MemberRoleModal
          member={selectedMember}
          visible={showRoleModal}
          isUpdating={isUpdating}
          onClose={() => { setShowRoleModal(false); setSelectedMember(null); }}
          onChangeRole={handleChangeRole}
          onRemove={handleRemove}
        />

        {/* Invite modal */}
        {workspace && (
          <InviteModal
            workspace={workspace}
            visible={showInvite}
            isOwner={isOwner}
            onClose={() => setShowInvite(false)}
            onCodeUpdated={() => {}}
          />
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.md,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
    flexShrink: 0,
  },
  headerInfo:    { flex: 1, minWidth: 0 },
  title:         { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' },
  memberCount:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14, paddingVertical: 9,
    flexShrink: 0,
  },
  inviteBtnText: { color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' },

  scroll: { paddingHorizontal: SPACING.xl, paddingBottom: 80 },
  loadingWrap: { alignItems: 'center', paddingTop: 60 },

  // Section
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
    // Prevent any child from making the card wider than the screen:
    overflow: 'hidden',
  },

  // Left side — MUST have flex:1 + minWidth:0 so text can shrink
  memberLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,          // ← key: allows flex children to shrink below natural size
    marginRight: SPACING.sm,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,          // ← key: allows Text to truncate
  },
  memberName: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    flexShrink: 1,
  },
  memberUsername: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
    flexShrink: 1,
  },
  memberJoined: {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 2,
    flexShrink: 1,
  },

  // Right side — fixed width, no flex growth
  memberRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  roleBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  roleBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  memberActions: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  iconBtn: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },

  // Leave button
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: `${COLORS.error}10`,
    borderRadius: RADIUS.lg, padding: SPACING.md,
    marginTop: SPACING.xl,
    borderWidth: 1, borderColor: `${COLORS.error}30`,
  },
  leaveBtnText: { color: COLORS.error, fontSize: FONTS.sizes.base, fontWeight: '600' },
});