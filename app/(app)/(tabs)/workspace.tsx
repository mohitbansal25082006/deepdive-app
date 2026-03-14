// app/(app)/(tabs)/workspace.tsx
// Part 14 fix — Better error messages when joining a workspace:
//   • Already a member → "You are already a member of this workspace."
//   • Blocked         → "You have been blocked from joining this workspace."
//   • Invalid code    → "Invalid invite code. Please check and try again."
// The joinWorkspaceByCode service function now maps Postgres error codes
// to these friendly strings, so this file just displays the error as-is.
//
// Also: join error shown inline below the code input (not just an Alert)
// for a smoother UX.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useWorkspaceList } from '../../../src/hooks/useWorkspaceList';
import { WorkspaceCard } from '../../../src/components/workspace/WorkspaceCard';
import { joinWorkspaceByCode, previewWorkspaceByCode } from '../../../src/services/workspaceService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

// ─── Join error type so we can show a specific icon ──────────────────────────

type JoinErrorKind = 'already_member' | 'blocked' | 'invalid_code' | 'generic';

function parseErrorKind(msg: string | null): JoinErrorKind {
  if (!msg) return 'generic';
  const lower = msg.toLowerCase();
  if (lower.includes('already')) return 'already_member';
  if (lower.includes('blocked')) return 'blocked';
  if (lower.includes('invalid') || lower.includes('invite')) return 'invalid_code';
  return 'generic';
}

function joinErrorIcon(kind: JoinErrorKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'already_member': return 'checkmark-circle-outline';
    case 'blocked':        return 'ban-outline';
    case 'invalid_code':   return 'key-outline';
    default:               return 'alert-circle-outline';
  }
}

function joinErrorColor(kind: JoinErrorKind): string {
  switch (kind) {
    case 'already_member': return COLORS.info;
    case 'blocked':        return COLORS.error;
    default:               return COLORS.warning;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorkspaceTab() {
  const { user } = useAuth();
  const { workspaces, isLoading, error, refresh, create } = useWorkspaceList();

  const [showCreate,  setShowCreate]  = useState(false);
  const [showJoin,    setShowJoin]    = useState(false);
  const [createName,  setCreateName]  = useState('');
  const [createDesc,  setCreateDesc]  = useState('');
  const [joinCode,    setJoinCode]    = useState('');
  const [isCreating,  setIsCreating]  = useState(false);
  const [isJoining,   setIsJoining]   = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [joinPreview, setJoinPreview] = useState<{
    id: string; name: string; description: string | null; memberCount: number;
  } | null>(null);

  // Part 14: inline join error state (so we can show icon + colour)
  const [joinError,     setJoinError]     = useState<string | null>(null);
  const [joinErrorKind, setJoinErrorKind] = useState<JoinErrorKind>('generic');

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setIsCreating(true);
    const { workspace, error } = await create(createName.trim(), createDesc.trim() || undefined);
    setIsCreating(false);
    if (error) { Alert.alert('Error', error); return; }
    setShowCreate(false);
    setCreateName('');
    setCreateDesc('');
    if (workspace) {
      router.push({ pathname: '/(app)/workspace-detail' as any, params: { id: workspace.id } });
    }
  };

  const handleJoinCodeChange = async (code: string) => {
    setJoinCode(code);
    setJoinPreview(null);
    setJoinError(null);
    if (code.length >= 8) {
      const { data } = await previewWorkspaceByCode(code);
      if (data) setJoinPreview(data);
    }
  };

  const resetJoinModal = () => {
    setJoinCode('');
    setJoinPreview(null);
    setJoinError(null);
    setJoinErrorKind('generic');
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setIsJoining(true);
    setJoinError(null);

    const { data, error } = await joinWorkspaceByCode(joinCode.trim());
    setIsJoining(false);

    if (error) {
      // Part 14: show inline error with specific message + icon
      const kind = parseErrorKind(error);
      setJoinError(error);
      setJoinErrorKind(kind);

      // For "already member" also navigate directly to that workspace
      if (kind === 'already_member' && joinPreview?.id) {
        setTimeout(() => {
          setShowJoin(false);
          resetJoinModal();
          router.push({
            pathname: '/(app)/workspace-detail' as any,
            params: { id: joinPreview.id },
          });
        }, 1400);
      }
      return;
    }

    setShowJoin(false);
    resetJoinModal();
    refresh();
    if (data) {
      router.push({
        pathname: '/(app)/workspace-detail' as any,
        params: { id: data.workspaceId },
      });
    }
  };

  const personalWs = workspaces.filter(w => w.isPersonal);
  const teamWs     = workspaces.filter(w => !w.isPersonal);

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Workspaces</Text>
            <Text style={styles.headerSub}>Collaborate on research</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setShowJoin(true)} style={styles.headerBtn}>
              <Ionicons name="link-outline" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowCreate(true)}
              style={[styles.headerBtn, { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
            >
              <Ionicons name="add" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* List */}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        >
          {isLoading && workspaces.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Loading workspaces…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={refresh} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : workspaces.length === 0 ? (
            <EmptyState
              onCreate={() => setShowCreate(true)}
              onJoin={() => setShowJoin(true)}
            />
          ) : (
            <>
              {personalWs.length > 0 && (
                <Animated.View entering={FadeInDown.duration(400)}>
                  <Text style={styles.sectionLabel}>Personal</Text>
                  {personalWs.map((ws, i) => (
                    <WorkspaceCard
                      key={ws.id} workspace={ws} index={i}
                      onPress={() => router.push({
                        pathname: '/(app)/workspace-detail' as any,
                        params: { id: ws.id },
                      })}
                    />
                  ))}
                </Animated.View>
              )}
              {teamWs.length > 0 && (
                <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                  <Text style={styles.sectionLabel}>Team Workspaces</Text>
                  {teamWs.map((ws, i) => (
                    <WorkspaceCard
                      key={ws.id} workspace={ws} index={i}
                      onPress={() => router.push({
                        pathname: '/(app)/workspace-detail' as any,
                        params: { id: ws.id },
                      })}
                    />
                  ))}
                </Animated.View>
              )}
              <Animated.View entering={FadeInDown.duration(400).delay(200)}>
                <TouchableOpacity onPress={() => setShowCreate(true)} style={styles.createCta}>
                  <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.createCtaText}>Create a new workspace</Text>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </ScrollView>

        {/* ── Create workspace modal ── */}
        <Modal
          visible={showCreate}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCreate(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => setShowCreate(false)}
              activeOpacity={1}
            />
            <Animated.View entering={SlideInDown.duration(350).springify()} style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Create Workspace</Text>
                  <Text style={styles.sheetSub}>Build a shared space for your team's research.</Text>
                </View>
                <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.sheetCloseBtn}>
                  <Ionicons name="close" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              <TextInput
                value={createName}
                onChangeText={setCreateName}
                placeholder="Workspace name"
                placeholderTextColor={COLORS.textMuted}
                style={styles.input}
                maxLength={60}
                autoFocus
                returnKeyType="next"
              />
              <TextInput
                value={createDesc}
                onChangeText={setCreateDesc}
                placeholder="Description (optional)"
                placeholderTextColor={COLORS.textMuted}
                style={[styles.input, styles.inputMultiline]}
                multiline
                maxLength={200}
                returnKeyType="done"
              />

              <TouchableOpacity
                onPress={handleCreate}
                disabled={!createName.trim() || isCreating}
                style={[
                  styles.primaryBtn,
                  { opacity: createName.trim() && !isCreating ? 1 : 0.45 },
                ]}
                activeOpacity={0.85}
              >
                {isCreating
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.primaryBtnText}>Create Workspace</Text>}
              </TouchableOpacity>
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Join workspace modal ── */}
        <Modal
          visible={showJoin}
          transparent
          animationType="fade"
          onRequestClose={() => { setShowJoin(false); resetJoinModal(); }}
        >
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => { setShowJoin(false); resetJoinModal(); }}
              activeOpacity={1}
            />
            <Animated.View entering={SlideInDown.duration(350).springify()} style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Join Workspace</Text>
                  <Text style={styles.sheetSub}>Enter the invite code shared with you.</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setShowJoin(false); resetJoinModal(); }}
                  style={styles.sheetCloseBtn}
                >
                  <Ionicons name="close" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>

              <TextInput
                value={joinCode}
                onChangeText={handleJoinCodeChange}
                placeholder="Enter invite code"
                placeholderTextColor={COLORS.textMuted}
                style={[
                  styles.input,
                  styles.inputCode,
                  joinError ? {
                    borderColor: joinErrorColor(joinErrorKind),
                    backgroundColor: `${joinErrorColor(joinErrorKind)}08`,
                  } : {},
                ]}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={12}
                autoFocus
                returnKeyType="go"
                onSubmitEditing={handleJoin}
              />

              {/* Part 14: Inline join error with specific message + icon */}
              {joinError && (
                <Animated.View
                  entering={FadeIn.duration(250)}
                  style={[
                    styles.joinErrorBanner,
                    { backgroundColor: `${joinErrorColor(joinErrorKind)}12`,
                      borderColor:     `${joinErrorColor(joinErrorKind)}35` },
                  ]}
                >
                  <Ionicons
                    name={joinErrorIcon(joinErrorKind)}
                    size={16}
                    color={joinErrorColor(joinErrorKind)}
                    style={{ flexShrink: 0 }}
                  />
                  <Text style={[styles.joinErrorText, { color: joinErrorColor(joinErrorKind) }]}>
                    {joinError}
                  </Text>
                </Animated.View>
              )}

              {/* Workspace preview */}
              {joinPreview && !joinError && (
                <Animated.View entering={FadeIn.duration(300)} style={styles.joinPreview}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.joinPreviewName}>{joinPreview.name}</Text>
                    {joinPreview.description
                      ? <Text style={styles.joinPreviewDesc} numberOfLines={1}>{joinPreview.description}</Text>
                      : null}
                    <Text style={styles.joinPreviewMeta}>{joinPreview.memberCount} members</Text>
                  </View>
                </Animated.View>
              )}

              <TouchableOpacity
                onPress={handleJoin}
                disabled={!joinCode.trim() || isJoining}
                style={[
                  styles.primaryBtn,
                  { opacity: joinCode.trim() && !isJoining ? 1 : 0.45 },
                ]}
                activeOpacity={0.85}
              >
                {isJoining
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Text style={styles.primaryBtnText}>Join Workspace</Text>}
              </TouchableOpacity>
            </Animated.View>
          </KeyboardAvoidingView>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(600)} style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Ionicons name="people" size={40} color={COLORS.primary} />
      </View>
      <Text style={styles.emptyTitle}>No Workspaces Yet</Text>
      <Text style={styles.emptySub}>
        Create a workspace to collaborate with teammates on research, share reports,
        presentations, and academic papers in real-time.
      </Text>
      <TouchableOpacity onPress={onCreate} style={styles.emptyCreateBtn} activeOpacity={0.85}>
        <Ionicons name="add-circle-outline" size={18} color="#FFF" />
        <Text style={styles.emptyCreateBtnText}>Create Workspace</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onJoin} style={styles.emptyJoinBtn} activeOpacity={0.8}>
        <Ionicons name="link-outline" size={18} color={COLORS.primary} />
        <Text style={styles.emptyJoinBtnText}>Join with Invite Code</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  headerTitle:   { color: COLORS.textPrimary, fontSize: FONTS.sizes['2xl'], fontWeight: '800' },
  headerSub:     { color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: COLORS.backgroundCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  scroll:       { paddingHorizontal: SPACING.xl, paddingBottom: 120, flexGrow: 1 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: SPACING.sm, marginTop: SPACING.md,
  },
  createCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: SPACING.md, borderRadius: RADIUS.lg,
    borderWidth: 1, borderStyle: 'dashed', borderColor: `${COLORS.primary}50`,
    marginTop: SPACING.sm,
  },
  createCtaText: { color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' },

  loadingWrap: { alignItems: 'center', paddingTop: 80, gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  errorWrap:   { alignItems: 'center', paddingTop: 80, gap: 12 },
  errorText:   { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center' },
  retryBtn:    {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  retryText: { color: '#FFF', fontWeight: '700' },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, paddingHorizontal: SPACING.xl },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
  },
  emptyTitle:        { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', marginBottom: SPACING.sm },
  emptySub:          { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl },
  emptyCreateBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    paddingVertical: 14, paddingHorizontal: SPACING.xl,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: SPACING.sm, width: '100%', justifyContent: 'center',
  },
  emptyCreateBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },
  emptyJoinBtn: {
    borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: SPACING.xl,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: `${COLORS.primary}40`,
    width: '100%', justifyContent: 'center',
  },
  emptyJoinBtnText: { color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: '600' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: SPACING.lg,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: SPACING.lg,
  },
  sheetTitle:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' },
  sheetSub:      { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, marginTop: 3 },
  sheetCloseBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, marginLeft: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 13,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  inputMultiline: { height: 88, textAlignVertical: 'top' },
  inputCode: {
    textAlign: 'center',
    letterSpacing: 4,
    fontSize: FONTS.sizes.xl,
    fontWeight: '800',
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  primaryBtnText: { color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },

  // Part 14: Inline join error banner
  joinErrorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1,
  },
  joinErrorText: { fontSize: FONTS.sizes.sm, fontWeight: '600', flex: 1, lineHeight: 20 },

  joinPreview: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: `${COLORS.success}12`,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: `${COLORS.success}30`,
  },
  joinPreviewName: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  joinPreviewDesc: { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginTop: 2 },
  joinPreviewMeta: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 },
});