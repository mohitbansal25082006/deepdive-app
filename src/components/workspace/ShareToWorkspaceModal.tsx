// src/components/workspace/ShareToWorkspaceModal.tsx
// Part 14 FINAL FIX:
//   1. Maps "out_" prefixed columns from get_user_workspaces_for_sharing RPC
//      (prefix added to fix Postgres 42702 ambiguous column error).
//   2. Shows workspace avatar_url (logo) via Image component.
//   3. Retry button shown on load error.
// Part 52.2 FOLLOW-UP:
//   Activity logging for share/unshare is handled SERVER-SIDE by DB triggers on
//   shared_workspace_content (schema_part52_2.sql §9), so this modal no longer
//   logs activity itself — one correct entry per action regardless of path.
// Part 55.3 — Theme compatibility: Replaced all hardcoded colors and gradients
//             with theme-aware values from COLORS. All surfaces, badges, and
//             status indicators now follow the active theme palette.
// Part 55.4 — Takes up 80% of screen height from the bottom.
//             Smooth non-bouncing animation with SlideInUp + cubic easing.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Image,
  StyleSheet, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, SlideInUp, SlideOutDown, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  sharePresentationToWorkspace,
  shareAcademicPaperToWorkspace,
  removeSharedContent,
} from '../../services/workspaceSharingService';
import { SharedContentType, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, getModalBackdrop } from '../../constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_HEIGHT_RATIO = 0.8; // 80% of screen height

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:     boolean;
  contentType: SharedContentType;
  contentId:   string;
  title:       string;
  subtitle?:   string;
  reportId?:   string;
  metadata?:   Record<string, unknown>;
  onClose:     () => void;
  onShared?:   (workspaceId: string, workspaceName: string) => void;
}

// ─── Workspace item (mapped from out_-prefixed RPC columns) ──────────────────

interface WorkspaceItem {
  workspaceId:   string;
  workspaceName: string;
  avatarUrl:     string | null;
  userRole:      WorkspaceRole;
  isShared:      boolean;
}

// ─── WorkspaceRow ─────────────────────────────────────────────────────────────

function WorkspaceRow({
  item,
  isSharing,
  onToggle,
}: {
  item:      WorkspaceItem;
  isSharing: boolean;
  onToggle:  () => void;
}) {
  const canShare    = item.userRole === 'owner' || item.userRole === 'editor';
  const accentColor = item.isShared ? COLORS.success : COLORS.primary;

  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={!canShare || isSharing}
      activeOpacity={0.78}
      style={[
        styles.workspaceRow,
        {
          backgroundColor: item.isShared
            ? `${COLORS.success}10`
            : COLORS.backgroundElevated,
          borderColor: item.isShared
            ? `${COLORS.success}40`
            : canShare ? COLORS.border : `${COLORS.border}60`,
          opacity: canShare ? 1 : 0.45,
        }
      ]}
    >
      {/* Workspace logo / fallback gradient */}
      {item.avatarUrl ? (
        <Image
          source={{ uri: item.avatarUrl }}
          style={styles.workspaceAvatar}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={item.isShared
            ? [COLORS.success, COLORS.success + 'AA']
            : COLORS.gradientPrimary}
          style={styles.workspaceAvatarGradient}
        >
          <Ionicons
            name={item.isShared ? 'checkmark' : 'people'}
            size={20}
            color="#FFF"
          />
        </LinearGradient>
      )}

      {/* Name & role chips */}
      <View style={styles.workspaceInfo}>
        <Text
          style={[styles.workspaceName, { color: COLORS.textPrimary }]}
          numberOfLines={1}
        >
          {item.workspaceName}
        </Text>
        <View style={styles.workspaceChips}>
          <View style={[styles.roleChip, { backgroundColor: `${COLORS.primary}18` }]}>
            <Text style={[styles.roleChipText, { color: COLORS.primary }]}>
              {item.userRole}
            </Text>
          </View>

          {item.isShared && (
            <View style={[styles.sharedChip, { backgroundColor: `${COLORS.success}18` }]}>
              <Ionicons name="checkmark-circle" size={9} color={COLORS.success} />
              <Text style={[styles.sharedChipText, { color: COLORS.success }]}>
                Shared
              </Text>
            </View>
          )}

          {!canShare && (
            <Text style={[styles.viewerText, { color: COLORS.textMuted }]}>
              Viewer — can't share
            </Text>
          )}
        </View>
      </View>

      {/* Add / remove toggle */}
      {canShare && (
        isSharing
          ? <ActivityIndicator size="small" color={accentColor} />
          : (
            <View style={[
              styles.toggleButton,
              {
                backgroundColor: item.isShared ? `${COLORS.success}20` : `${COLORS.primary}15`,
                borderColor: item.isShared ? `${COLORS.success}40` : `${COLORS.primary}30`,
              }
            ]}>
              <Ionicons
                name={item.isShared ? 'remove-outline' : 'add-outline'}
                size={16}
                color={item.isShared ? COLORS.success : COLORS.primary}
              />
            </View>
          )
      )}
    </TouchableOpacity>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function ShareToWorkspaceModal({
  visible,
  contentType,
  contentId,
  title,
  subtitle,
  reportId,
  metadata = {},
  onClose,
  onShared,
}: Props) {
  const insets = useSafeAreaInsets();

  const [workspaces,  setWorkspaces]  = useState<WorkspaceItem[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [sharingId,   setSharingId]   = useState<string | null>(null);
  const [sharedCount, setSharedCount] = useState(0);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  // ── Load workspaces via SECURITY DEFINER RPC ──────────────────────────────
  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc(
        'get_user_workspaces_for_sharing',
        {
          p_content_type: contentType,
          p_content_id:   contentId,
        },
      );

      if (error) throw error;

      const rows = (data as Record<string, unknown>[]) ?? [];

      const items: WorkspaceItem[] = rows.map(row => ({
        workspaceId:   (row.out_workspace_id   ?? row.workspace_id)   as string,
        workspaceName: (row.out_workspace_name  ?? row.workspace_name) as string,
        avatarUrl:     ((row.out_avatar_url     ?? row.avatar_url)     as string) ?? null,
        userRole:      (row.out_user_role       ?? row.user_role)      as WorkspaceRole,
        isShared:      (row.out_is_shared       ?? row.is_shared)      as boolean,
      }));

      setWorkspaces(items);
      setSharedCount(items.filter(i => i.isShared).length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load workspaces';
      console.error('[ShareToWorkspaceModal] loadWorkspaces error:', err);
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [contentType, contentId]);

  useEffect(() => {
    if (visible) loadWorkspaces();
  }, [visible, loadWorkspaces]);

  // ── Toggle share / unshare ─────────────────────────────────────────────────
  const handleToggle = async (item: WorkspaceItem) => {
    if (sharingId) return;
    setSharingId(item.workspaceId);

    try {
      if (item.isShared) {
        const { error } = await removeSharedContent(
          item.workspaceId, contentType, contentId,
        );
        if (error) throw new Error(error);
        setWorkspaces(prev =>
          prev.map(w =>
            w.workspaceId === item.workspaceId ? { ...w, isShared: false } : w
          )
        );
        setSharedCount(c => c - 1);
      } else {
        let result: { data: unknown; error: string | null };
        if (contentType === 'presentation') {
          result = await sharePresentationToWorkspace(
            item.workspaceId, contentId, title, subtitle, reportId, metadata,
          );
        } else {
          result = await shareAcademicPaperToWorkspace(
            item.workspaceId, contentId, title, subtitle, reportId, metadata,
          );
        }
        if (result.error) throw new Error(result.error);
        setWorkspaces(prev =>
          prev.map(w =>
            w.workspaceId === item.workspaceId ? { ...w, isShared: true } : w
          )
        );
        setSharedCount(c => c + 1);
        onShared?.(item.workspaceId, item.workspaceName);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSharingId(null);
    }
  };

  const iconName  = contentType === 'presentation' ? 'easel' : 'school';
  const typeLabel = contentType === 'presentation' ? 'Presentation' : 'Academic Paper';
  const backdropColor = getModalBackdrop(0.65);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={[styles.backdrop, { backgroundColor: backdropColor }]}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet — 80% height from bottom, smooth non-bouncing animation */}
      <Animated.View
        entering={SlideInUp.duration(340).easing(Easing.out(Easing.cubic))}
        exiting={SlideOutDown.duration(220).easing(Easing.in(Easing.quad))}
        style={[
          styles.sheet,
          {
            backgroundColor: COLORS.backgroundCard,
            borderTopColor: COLORS.border,
            height: SCREEN_H * SHEET_HEIGHT_RATIO,
            paddingBottom: insets.bottom + SPACING.md,
          }
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: COLORS.border }]} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
          <LinearGradient
            colors={COLORS.gradientPrimary}
            style={[styles.headerIcon, SHADOWS.medium]}
          >
            <Ionicons name={iconName as any} size={22} color="#FFF" />
          </LinearGradient>

          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: COLORS.textPrimary }]}>
              Share {typeLabel}
            </Text>
            <Text
              style={[styles.headerSubtitle, { color: COLORS.textMuted }]}
              numberOfLines={2}
            >
              {title}
            </Text>
            {sharedCount > 0 && (
              <View style={[
                styles.sharedBadge,
                {
                  backgroundColor: `${COLORS.success}15`,
                  borderColor: `${COLORS.success}30`,
                }
              ]}>
                <Ionicons name="checkmark-circle" size={11} color={COLORS.success} />
                <Text style={[styles.sharedBadgeText, { color: COLORS.success }]}>
                  Shared to {sharedCount} workspace{sharedCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={[
              styles.closeButton,
              {
                backgroundColor: COLORS.backgroundElevated,
                borderColor: COLORS.border,
              }
            ]}
          >
            <Ionicons name="close" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: SPACING.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={[styles.centerStateText, { color: COLORS.textMuted }]}>
                Loading workspaces…
              </Text>
            </View>

          ) : loadError ? (
            <View style={styles.errorState}>
              <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
              <Text style={[styles.errorText, { color: COLORS.error }]}>
                {loadError}
              </Text>
              <TouchableOpacity
                onPress={loadWorkspaces}
                style={[styles.retryButton, { backgroundColor: COLORS.primary }]}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>

          ) : workspaces.length === 0 ? (
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={styles.emptyState}
            >
              <View style={[styles.emptyIcon, { backgroundColor: `${COLORS.primary}15` }]}>
                <Ionicons name="people-outline" size={32} color={COLORS.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: COLORS.textPrimary }]}>
                No Workspaces Found
              </Text>
              <Text style={[styles.emptySubtitle, { color: COLORS.textMuted }]}>
                Create or join a workspace to share your {typeLabel.toLowerCase()}.
              </Text>
            </Animated.View>

          ) : (
            <>
              <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>
                Your Workspaces
              </Text>

              {workspaces.map((item, i) => (
                <Animated.View
                  key={item.workspaceId}
                  entering={FadeInDown.duration(300).delay(i * 50)}
                >
                  <WorkspaceRow
                    item={item}
                    isSharing={sharingId === item.workspaceId}
                    onToggle={() => handleToggle(item)}
                  />
                </Animated.View>
              ))}

              <Text style={[styles.footerNote, { color: COLORS.textMuted }]}>
                Tap to share or unshare.{'\n'}
                Only owners and editors can share content.
              </Text>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Backdrop
  backdrop: {
    flex: 1,
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    gap: SPACING.md,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: FONTS.sizes.xs,
    marginTop: 3,
  },
  sharedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderWidth: 1,
  },
  sharedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },

  // Scroll content
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },

  // Workspace row
  workspaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
  },
  workspaceAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    flexShrink: 0,
  },
  workspaceAvatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  workspaceInfo: {
    flex: 1,
  },
  workspaceName: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  workspaceChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  roleChip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  roleChipText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  sharedChip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sharedChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  viewerText: {
    fontSize: 10,
  },
  toggleButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // States
  centerState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  centerStateText: {
    fontSize: FONTS.sizes.sm,
    marginTop: 12,
  },
  errorState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: 12,
  },
  errorText: {
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Section
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  footerNote: {
    fontSize: FONTS.sizes.xs,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 16,
  },
});