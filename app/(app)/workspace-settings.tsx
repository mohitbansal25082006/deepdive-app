// app/(app)/workspace-settings.tsx
// Part 11 (patched) — Copy invite code, editor PDF export, etc.
// Part 13A UPDATE:
//   • New "Workspace Logo" section at the top — visible to BOTH owners AND editors.
//   • Logo preview with current image, pick-from-library button, take-photo button,
//     and remove-logo button.
//   • Uses workspaceMediaService (Part 13A) which calls update_workspace_logo RPC,
//     allowing editors to update the logo despite owner-only RLS on the workspaces table.

import React, { useState, useEffect } from 'react';
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
import { exportWorkspaceAsPDF } from '../../src/services/workspaceExport';
import {
  pickAndUploadWorkspaceLogo,
  takeAndUploadWorkspaceLogo,
  removeWorkspaceLogo,
} from '../../src/services/workspaceMediaService';
import { WorkspaceRole } from '../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkspaceSettingsScreen() {
  const { id, role: roleParam } = useLocalSearchParams<{ id: string; role?: string }>();
  const userRole = (roleParam as WorkspaceRole) ?? 'owner';
  const isOwner  = userRole === 'owner';
  const isEditor = userRole === 'editor' || isOwner;

  const { workspace, reports, members, update, remove, refresh, isLoading } =
    useWorkspace(id ?? null);

  // General info fields (owner only)
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [isSaving,    setIsSaving]    = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [codeCopied,  setCodeCopied]  = useState(false);

  // Logo state (owner + editor)
  const [logoUrl,       setLogoUrl]       = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
      setLogoUrl(workspace.avatarUrl ?? null);
    }
  }, [workspace]);

  // ── General save (owner only) ──────────────────────────────────────────────

  const hasChanges =
    isOwner &&
    workspace &&
    (name.trim() !== workspace.name ||
      description.trim() !== (workspace.description ?? ''));

  const handleSave = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    const { error } = await update({
      name: name.trim(),
      description: description.trim(),
    } as any);
    setIsSaving(false);
    if (error) Alert.alert('Error', error);
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
      // Also refresh the workspace in the hook so the card reflects the new logo
      await refresh?.();
    }
  };

  const handlePickLogo = () => {
    if (!isEditor) return;

    // On iOS show ActionSheet for camera vs library choice
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
      // Android — show a simple Alert
      Alert.alert('Workspace Logo', 'Choose an option', [
        { text: 'Cancel',              style: 'cancel' },
        { text: 'Take Photo',          onPress: () => handleLogoUpload('camera')  },
        { text: 'Choose from Library', onPress: () => handleLogoUpload('library') },
        {
          text: 'Remove Logo',
          style: 'destructive',
          onPress: handleRemoveLogo,
        },
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
            await refresh?.();
          }
        },
      },
    ]);
  };

  // ── PDF export ─────────────────────────────────────────────────────────────

  const handleExportPDF = async () => {
    if (!workspace) return;
    setIsExporting(true);
    const { success, error } = await exportWorkspaceAsPDF(workspace, reports);
    setIsExporting(false);
    if (!success && error) Alert.alert('Export Failed', error);
  };

  // ── Copy invite code ───────────────────────────────────────────────────────

  const handleCopyInviteCode = async () => {
    if (!workspace) return;
    await Clipboard.setStringAsync(workspace.inviteCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  };

  // ── Delete workspace ───────────────────────────────────────────────────────

  const handleDelete = () => {
    Alert.alert(
      'Delete Workspace',
      'This permanently deletes the workspace, all reports, comments, and activity. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            const { error } = await remove();
            if (!error) router.replace('/(app)/(tabs)/workspace' as any);
            else Alert.alert('Error', error);
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
                          {/* Edit overlay */}
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
                    Square images work best (max 5 MB). Visible to all workspace members.
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
                      onChangeText={setName}
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
                      onChangeText={setDescription}
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

                <TouchableOpacity
                  onPress={handleExportPDF}
                  disabled={isExporting || reports.length === 0}
                  style={[styles.actionRow, reports.length === 0 && { opacity: 0.4 }]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, { backgroundColor: `${COLORS.error}18` }]}>
                    {isExporting
                      ? <ActivityIndicator size="small" color={COLORS.error} />
                      : <Ionicons name="document-attach-outline" size={20} color={COLORS.error} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLabel}>Export as PDF Bundle</Text>
                    <Text style={styles.actionDesc}>
                      {reports.length} report{reports.length !== 1 ? 's' : ''} combined into one PDF
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
                        Permanently removes workspace and all data
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.error} />
                  </TouchableOpacity>
                </Animated.View>
              )}
            </>
          )}
        </ScrollView>
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