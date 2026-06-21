// app/(app)/workspace-settings.tsx
// Part 11 (patched) — Copy invite code, editor PDF export, etc.
// Part 13A — Workspace Logo section (owner + editor) via update_workspace_logo RPC.
// Part 52 — Feature 1 (realtime settings + delete).
// Part 52.1 — Feature 1 (advanced workspace export via ExportBundleModal).
// Part 52.2 — Feature 1f (Activity feed): log granular settings changes —
//   workspace renamed (old → new), description changed (old → new), and logo
//   set/removed — each with the actor's full name. These appear in the
//   Activity tab in realtime.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Image, ActionSheetIOS,
  Platform, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useWorkspace } from '../../src/hooks/useWorkspace';
import { useAuth } from '../../src/context/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { ExportBundleModal } from '../../src/components/workspace/ExportBundleModal';
import {
  pickAndUploadWorkspaceLogo,
  takeAndUploadWorkspaceLogo,
  removeWorkspaceLogo,
} from '../../src/services/workspaceMediaService';
import {
  logWorkspaceRenamed,
  logWorkspaceDescriptionChanged,
  logWorkspaceLogoChanged,
} from '../../src/services/activityService';
import { WorkspaceRole } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkspaceSettingsScreen() {
  const { id, role: roleParam } = useLocalSearchParams<{ id: string; role?: string }>();
  const userRole = (roleParam as WorkspaceRole) ?? 'owner';
  const isOwner  = userRole === 'owner';
  const isEditor = userRole === 'editor' || isOwner;

  const {
    workspace, reports, members, update, remove, refresh, isLoading,
    isSelfRemoved, isDeleted, // Part 52
  } = useWorkspace(id ?? null);

  const { user } = useAuth();

  // General info fields (owner only)
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [isSaving,    setIsSaving]    = useState(false);
  const [codeCopied,  setCodeCopied]  = useState(false);

  // Part 52.1 — advanced export modal
  const [showExportModal, setShowExportModal] = useState(false);

  // Logo state (owner + editor)
  const [logoUrl,         setLogoUrl]         = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Part 52 — track whether the user is actively editing text so a live
  // broadcast from another member doesn't clobber their in-progress edit.
  const isEditingTextRef = useRef(false);

  // ── Part 52.2: resolve the current user's display name for activity logs ──
  const resolveActorName = useCallback(async (): Promise<string> => {
    try {
      if (!user) return 'A member';
      const { data } = await supabase
        .from('profiles')
        .select('full_name, username')
        .eq('id', user.id)
        .single();
      const p = data as { full_name?: string; username?: string } | null;
      return p?.full_name ?? p?.username ?? 'A member';
    } catch {
      return 'A member';
    }
  }, [user]);

  // ── Seed local fields from the live workspace object ───────────────────────
  useEffect(() => {
    if (!workspace) return;
    // Logo always re-seeds (image edits don't conflict with text editing)
    setLogoUrl(workspace.avatarUrl ?? null);

    // Text fields re-seed only when the user is NOT mid-edit.
    if (!isEditingTextRef.current) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
    }
  }, [workspace]);

  // ── Part 52: navigate out when the workspace is deleted (by anyone) ───────
  useEffect(() => {
    if (isDeleted || isSelfRemoved) {
      router.replace('/(app)/(tabs)/workspace' as any);
    }
  }, [isDeleted, isSelfRemoved]);

  // ── General save (owner only) ──────────────────────────────────────────────

  const hasChanges =
    isOwner &&
    workspace &&
    (name.trim() !== workspace.name ||
      description.trim() !== (workspace.description ?? ''));

  const handleSave = async () => {
    if (!hasChanges || !workspace || !id) return;
    setIsSaving(true);

    const prevName = workspace.name;
    const prevDesc = workspace.description ?? '';
    const nextName = name.trim();
    const nextDesc = description.trim();

    const { error } = await update({
      name:        nextName,
      description: nextDesc,
    } as any);

    setIsSaving(false);
    isEditingTextRef.current = false; // edit committed

    if (error) { Alert.alert('Error', error); return; }

    // Part 52.2 (Feature 1f) — log granular changes with old → new + actor name.
    const actorName = await resolveActorName();
    if (nextName !== prevName) {
      logWorkspaceRenamed({
        workspaceId: id, oldName: prevName, newName: nextName, actorName,
      }).catch(() => {});
    }
    if (nextDesc !== prevDesc) {
      logWorkspaceDescriptionChanged({
        workspaceId: id, oldDescription: prevDesc, newDescription: nextDesc, actorName,
      }).catch(() => {});
    }
  };

  // ── Logo upload ────────────────────────────────────────────────────────────

  const handleLogoUpload = async (source: 'library' | 'camera') => {
    if (!id || !isEditor) return;
    setIsUploadingLogo(true);

    const result =
      source === 'camera'
        ? await takeAndUploadWorkspaceLogo(id)
        : await pickAndUploadWorkspaceLogo(id);

    setIsUploadingLogo(false);

    if (result.cancelled) return; // user dismissed picker
    if (result.error) {
      Alert.alert('Upload Failed', result.error);
      return;
    }
    if (result.url) {
      setLogoUrl(result.url);
      // The update_workspace_logo RPC fires the broadcast trigger, so other
      // members' headers/cards update automatically. Local refresh keeps this
      // screen authoritative.
      await refresh?.(true);

      // Part 52.2 (Feature 1f) — log logo set.
      const actorName = await resolveActorName();
      logWorkspaceLogoChanged({ workspaceId: id, actorName, removed: false }).catch(() => {});
    }
  };

  const handlePickLogo = () => {
    if (!isEditor) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options:       ['Cancel', 'Take Photo', 'Choose from Library', 'Remove Logo'],
          destructiveButtonIndex: 3,
          cancelButtonIndex:      0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handleLogoUpload('camera');
          if (buttonIndex === 2) handleLogoUpload('library');
          if (buttonIndex === 3) handleRemoveLogo();
        },
      );
    } else {
      Alert.alert('Workspace Logo', 'Choose an option', [
        { text: 'Cancel',              style: 'cancel' },
        { text: 'Take Photo',          onPress: () => handleLogoUpload('camera')  },
        { text: 'Choose from Library', onPress: () => handleLogoUpload('library') },
        { text: 'Remove Logo',         style: 'destructive', onPress: handleRemoveLogo },
      ]);
    }
  };

  const handleRemoveLogo = async () => {
    if (!id || !logoUrl) return;
    Alert.alert('Remove Logo', 'Remove the workspace logo?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setIsUploadingLogo(true);
          const { error } = await removeWorkspaceLogo(id, logoUrl);
          setIsUploadingLogo(false);
          if (error) Alert.alert('Error', error);
          else {
            setLogoUrl(null);
            await refresh?.(true);

            // Part 52.2 (Feature 1f) — log logo removed.
            const actorName = await resolveActorName();
            logWorkspaceLogoChanged({ workspaceId: id, actorName, removed: true }).catch(() => {});
          }
        },
      },
    ]);
  };

  // ── Copy invite code ───────────────────────────────────────────────────────

  const handleCopyInviteCode = async () => {
    if (!workspace) return;
    await Clipboard.setStringAsync(workspace.inviteCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  // ── Delete workspace ───────────────────────────────────────────────────────
  // Part 52: We no longer manually navigate on success. The delete fires the
  // broadcast trigger → isDeleted flips → the useEffect above navigates out.
  // This keeps the owner and every member on the same exit path. We keep a
  // safety fallback navigate in case the broadcast is delayed.

  const handleDelete = () => {
    Alert.alert(
      'Delete Workspace',
      'This permanently deletes the workspace, all reports, comments, and activity. Every member will be removed instantly. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            const { error } = await remove();
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            // Safety fallback — if the broadcast hasn't navigated us out
            // within a moment, do it manually.
            setTimeout(() => {
              router.replace('/(app)/(tabs)/workspace' as any);
            }, 600);
          },
        },
      ],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const initials = (workspace?.name ?? '').slice(0, 2).toUpperCase();

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>
            {isOwner ? 'Workspace Settings' : 'Export & Sharing'}
          </Text>
          {hasChanges && isOwner && (
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              style={styles.saveBtn}
            >
              {isSaving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          )}
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {isLoading || !workspace ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <>
              {/* ── WORKSPACE LOGO (owner + editor) ── */}
              {isEditor && (
                <Animated.View entering={FadeInDown.duration(400).delay(40)}>
                  <Text style={styles.sectionLabel}>Workspace Logo</Text>

                  <View style={styles.logoSection}>
                    {/* Current logo preview */}
                    <TouchableOpacity
                      onPress={handlePickLogo}
                      disabled={isUploadingLogo}
                      activeOpacity={0.8}
                      style={styles.logoPreviewBtn}
                    >
                      {isUploadingLogo ? (
                        <View style={styles.logoPlaceholder}>
                          <ActivityIndicator color={COLORS.primary} />
                        </View>
                      ) : logoUrl ? (
                        <Animated.View entering={ZoomIn.duration(300)}>
                          <Image
                            source={{ uri: logoUrl }}
                            style={styles.logoImage}
                            resizeMode="cover"
                          />
                          <View style={styles.logoEditOverlay}>
                            <Ionicons name="camera" size={16} color="#FFF" />
                          </View>
                        </Animated.View>
                      ) : (
                        <LinearGradient
                          colors={COLORS.gradientPrimary as readonly [string, string]}
                          style={styles.logoPlaceholder}
                        >
                          <Text style={styles.logoInitials}>{initials}</Text>
                          <View style={styles.logoAddBadge}>
                            <Ionicons name="add" size={14} color="#FFF" />
                          </View>
                        </LinearGradient>
                      )}
                    </TouchableOpacity>

                    {/* Action buttons */}
                    <View style={styles.logoActions}>
                      <TouchableOpacity
                        onPress={() => handleLogoUpload('library')}
                        disabled={isUploadingLogo}
                        style={styles.logoActionBtn}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                        <Text style={styles.logoActionBtnText}>Choose Image</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleLogoUpload('camera')}
                        disabled={isUploadingLogo}
                        style={styles.logoActionBtn}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
                        <Text style={styles.logoActionBtnText}>Take Photo</Text>
                      </TouchableOpacity>

                      {logoUrl && (
                        <TouchableOpacity
                          onPress={handleRemoveLogo}
                          disabled={isUploadingLogo}
                          style={[styles.logoActionBtn, styles.logoRemoveBtn]}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                          <Text style={[styles.logoActionBtnText, { color: COLORS.error }]}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <Text style={styles.logoHint}>
                    Square images work best (max 5 MB). Changes appear instantly for all members.
                  </Text>
                </Animated.View>
              )}

              {/* ── GENERAL INFO (owner only) ── */}
              {isOwner && (
                <Animated.View entering={FadeInDown.duration(400).delay(80)}>
                  <Text style={styles.sectionLabel}>General</Text>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Workspace Name</Text>
                    <TextInput
                      value={name}
                      onChangeText={(t) => { isEditingTextRef.current = true; setName(t); }}
                      onBlur={() => { if (!hasChanges) isEditingTextRef.current = false; }}
                      placeholder="Workspace name"
                      placeholderTextColor={COLORS.textMuted}
                      style={styles.input}
                      maxLength={60}
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>Description</Text>
                    <TextInput
                      value={description}
                      onChangeText={(t) => { isEditingTextRef.current = true; setDescription(t); }}
                      onBlur={() => { if (!hasChanges) isEditingTextRef.current = false; }}
                      placeholder="What is this workspace for?"
                      placeholderTextColor={COLORS.textMuted}
                      style={[styles.input, { height: 90 }]}
                      multiline
                      maxLength={200}
                    />
                  </View>
                </Animated.View>
              )}

              {/* ── EXPORT & SHARING ── */}
              <Animated.View entering={FadeInDown.duration(400).delay(120)}>
                <Text style={styles.sectionLabel}>Export & Sharing</Text>

                {/* Part 52.1 — Advanced export: opens the bundle picker modal */}
                <TouchableOpacity
                  onPress={() => setShowExportModal(true)}
                  style={styles.actionRow}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, { backgroundColor: `${COLORS.primary}18` }]}>
                    <Ionicons name="archive-outline" size={20} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLabel}>Export Bundle</Text>
                    <Text style={styles.actionDesc}>
                      Pick any reports & shared content — downloads as one .zip
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCopyInviteCode}
                  style={styles.actionRow}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, { backgroundColor: `${COLORS.primary}18` }]}>
                    <Ionicons
                      name={codeCopied ? 'checkmark-outline' : 'copy-outline'}
                      size={20}
                      color={codeCopied ? COLORS.success : COLORS.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLabel}>
                      {codeCopied ? 'Code Copied!' : 'Copy Invite Code'}
                    </Text>
                    <Text style={styles.actionDesc}>
                      {codeCopied
                        ? `"${workspace.inviteCode}" is now in your clipboard`
                        : `Share code: ${workspace.inviteCode}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </Animated.View>

              {/* ── STATS ── */}
              <Animated.View entering={FadeInDown.duration(400).delay(160)}>
                <Text style={styles.sectionLabel}>Stats</Text>
                <View style={styles.statsGrid}>
                  <StatBox label="Members" value={String(members.length)} />
                  <StatBox label="Reports" value={String(reports.length)} />
                  <StatBox
                    label="Created"
                    value={new Date(workspace.createdAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: '2-digit',
                    })}
                  />
                </View>
              </Animated.View>

              {/* ── DANGER ZONE (owner only) ── */}
              {isOwner && (
                <Animated.View entering={FadeInDown.duration(400).delay(200)}>
                  <Text style={[styles.sectionLabel, { color: COLORS.error }]}>Danger Zone</Text>
                  <TouchableOpacity
                    onPress={handleDelete}
                    style={styles.deleteBtn}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deleteBtnText}>Delete Workspace</Text>
                      <Text style={styles.deleteBtnDesc}>
                        Removes workspace and kicks all members instantly
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.error} />
                  </TouchableOpacity>
                </Animated.View>
              )}
            </>
          )}
        </ScrollView>

        {/* Part 52.1 — Advanced export modal */}
        {workspace && (
          <ExportBundleModal
            visible={showExportModal}
            workspace={workspace}
            onClose={() => setShowExportModal(false)}
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── StatBox ──────────────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={stat.box}>
      <Text style={stat.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={stat.label}>{label}</Text>
    </View>
  );
}

const stat = StyleSheet.create({
  box:   { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  value: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  label: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.md },
  backBtn:     { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  title:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', flex: 1 },
  saveBtn:     { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.sm },
  scroll:      { paddingHorizontal: SPACING.xl, paddingBottom: 80 },
  loadingWrap: { alignItems: 'center', paddingTop: 60 },
  sectionLabel:{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm, marginTop: SPACING.lg },

  // ── Logo section ──
  logoSection: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.lg,
    backgroundColor: COLORS.backgroundCard,
    borderRadius:  RADIUS.xl,
    padding:       SPACING.md,
    borderWidth:   1,
    borderColor:   COLORS.border,
  },
  logoPreviewBtn: { position: 'relative' },
  logoImage: {
    width: 80, height: 80, borderRadius: 20,
    borderWidth: 2, borderColor: `${COLORS.primary}40`,
  },
  logoPlaceholder: {
    width: 80, height: 80, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    borderWidth: 2, borderColor: `${COLORS.primary}30`,
  },
  logoInitials: { color: '#FFF', fontSize: FONTS.sizes['2xl'], fontWeight: '800' },
  logoAddBadge: {
    position:        'absolute',
    bottom:          -4,
    right:           -4,
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: COLORS.primary,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     2,
    borderColor:     COLORS.backgroundCard,
  },
  logoEditOverlay: {
    position:        'absolute',
    bottom:          0,
    right:           0,
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     2,
    borderColor:     COLORS.backgroundCard,
  },
  logoActions: { flex: 1, gap: 8 },
  logoActionBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    backgroundColor: `${COLORS.primary}12`,
    borderRadius:    RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical:   8,
    borderWidth:     1,
    borderColor:     `${COLORS.primary}25`,
  },
  logoActionBtnText: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '600',
  },
  logoRemoveBtn: {
    backgroundColor: `${COLORS.error}10`,
    borderColor:     `${COLORS.error}25`,
  },
  logoHint: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.xs,
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 17,
  },

  // Fields
  fieldWrap:  { marginBottom: SPACING.md },
  fieldLabel: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 6 },
  input:      { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, borderWidth: 1, borderColor: COLORS.border },

  // Action rows
  actionRow:   { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  actionIcon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' },
  actionDesc:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },

  // Stats
  statsGrid: { flexDirection: 'row', gap: SPACING.sm },

  // Delete
  deleteBtn:     { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30` },
  deleteBtnText: { color: COLORS.error, fontSize: FONTS.sizes.base, fontWeight: '700' },
  deleteBtnDesc: { color: `${COLORS.error}80`, fontSize: FONTS.sizes.xs, marginTop: 2 },
});