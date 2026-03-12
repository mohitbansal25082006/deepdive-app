// app/(app)/workspace-settings.tsx
// Part 10: Owner-only workspace settings — name, description, danger zone.

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useWorkspace } from '../../src/hooks/useWorkspace';
import { exportWorkspaceAsPDF, buildReadOnlyShareLink } from '../../src/services/workspaceExport';
import * as Clipboard from 'expo-clipboard';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

export default function WorkspaceSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace, reports, update, remove, isLoading } = useWorkspace(id ?? null);

  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [isSaving,    setIsSaving]    = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copied,      setCopied]      = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
    }
  }, [workspace]);

  const hasChanges = workspace &&
    (name.trim() !== workspace.name || description.trim() !== (workspace.description ?? ''));

  const handleSave = async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    const { error } = await update({ name: name.trim(), description: description.trim() });
    setIsSaving(false);
    if (error) Alert.alert('Error', error);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Workspace',
      'This will permanently delete the workspace, all its reports, comments, and activity. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            const { error } = await remove();
            if (!error) {
              router.replace('/(app)/(tabs)/workspace' as any);
            } else {
              Alert.alert('Error', error);
            }
          },
        },
      ],
    );
  };

  const handleExportPDF = async () => {
    if (!workspace) return;
    setIsExporting(true);
    const { success, error } = await exportWorkspaceAsPDF(workspace, reports);
    setIsExporting(false);
    if (!success && error) Alert.alert('Export Failed', error);
  };

  const handleCopyShareLink = async () => {
    if (!workspace) return;
    await Clipboard.setStringAsync(buildReadOnlyShareLink(workspace));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>Workspace Settings</Text>
          {hasChanges && (
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
              {/* ── General settings ── */}
              <Animated.View entering={FadeInDown.duration(400)}>
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

              {/* ── Export & sharing ── */}
              <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                <Text style={styles.sectionLabel}>Export & Sharing</Text>

                <TouchableOpacity
                  onPress={handleExportPDF}
                  disabled={isExporting || reports.length === 0}
                  style={[styles.actionRow, { opacity: reports.length === 0 ? 0.4 : 1 }]}
                >
                  <View style={[styles.actionIcon, { backgroundColor: `${COLORS.error}20` }]}>
                    {isExporting
                      ? <ActivityIndicator size="small" color={COLORS.error} />
                      : <Ionicons name="document-attach-outline" size={20} color={COLORS.error} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLabel}>Export as PDF Bundle</Text>
                    <Text style={styles.actionDesc}>
                      Download all {reports.length} reports as a single PDF
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleCopyShareLink} style={styles.actionRow}>
                  <View style={[styles.actionIcon, { backgroundColor: `${COLORS.primary}20` }]}>
                    <Ionicons
                      name={copied ? 'checkmark-outline' : 'share-outline'}
                      size={20}
                      color={copied ? COLORS.success : COLORS.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionLabel}>
                      {copied ? 'Link Copied!' : 'Copy Read-Only Share Link'}
                    </Text>
                    <Text style={styles.actionDesc}>Share workspace view access with anyone</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
              </Animated.View>

              {/* ── Stats ── */}
              <Animated.View entering={FadeInDown.duration(400).delay(150)}>
                <Text style={styles.sectionLabel}>Stats</Text>
                <View style={styles.statsGrid}>
                  <StatBox label="Reports"    value={reports.length.toString()} />
                  <StatBox label="Created"    value={new Date(workspace.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })} />
                  <StatBox label="Invite Code" value={workspace.inviteCode} mono />
                </View>
              </Animated.View>

              {/* ── Danger zone ── */}
              <Animated.View entering={FadeInDown.duration(400).delay(200)}>
                <Text style={[styles.sectionLabel, { color: COLORS.error }]}>Danger Zone</Text>
                <TouchableOpacity
                  onPress={handleDelete}
                  style={styles.deleteBtn}
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
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function StatBox({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={statStyles.box}>
      <Text style={[statStyles.value, mono && { fontSize: FONTS.sizes.base, letterSpacing: 1 }]}>
        {value}
      </Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box:   { flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  value: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  label: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 },
});

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.md },
  backBtn:      { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  title:        { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', flex: 1 },
  saveBtn:      { backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  saveBtnText:  { color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.sm },
  scroll:       { paddingHorizontal: SPACING.xl, paddingBottom: 80 },
  loadingWrap:  { alignItems: 'center', paddingTop: 60 },
  sectionLabel: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm, marginTop: SPACING.lg },
  fieldWrap:    { marginBottom: SPACING.md },
  fieldLabel:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600', marginBottom: 6 },
  input:        { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 12, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, borderWidth: 1, borderColor: COLORS.border },
  actionRow:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  actionIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel:  { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' },
  actionDesc:   { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  statsGrid:    { flexDirection: 'row', gap: SPACING.sm },
  deleteBtn:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30` },
  deleteBtnText:{ color: COLORS.error, fontSize: FONTS.sizes.base, fontWeight: '700' },
  deleteBtnDesc:{ color: `${COLORS.error}80`, fontSize: FONTS.sizes.xs, marginTop: 2 },
});