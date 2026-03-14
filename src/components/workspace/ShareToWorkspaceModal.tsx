// src/components/workspace/ShareToWorkspaceModal.tsx
// Part 14 FINAL FIX:
//   1. Maps "out_" prefixed columns from get_user_workspaces_for_sharing RPC
//      (prefix added to fix Postgres 42702 ambiguous column error).
//   2. Shows workspace avatar_url (logo) via Image component.
//   3. Retry button shown on load error.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  sharePresentationToWorkspace,
  shareAcademicPaperToWorkspace,
  removeSharedContent,
} from '../../services/workspaceSharingService';
import { SharedContentType, WorkspaceRole } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

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
      style={{
        flexDirection:   'row',
        alignItems:      'center',
        gap:             SPACING.md,
        backgroundColor: item.isShared
          ? `${COLORS.success}10`
          : COLORS.backgroundElevated,
        borderRadius: RADIUS.lg,
        padding:      SPACING.md,
        borderWidth:  1.5,
        borderColor:  item.isShared
          ? `${COLORS.success}40`
          : canShare ? COLORS.border : `${COLORS.border}60`,
        opacity: canShare ? 1 : 0.45,
      }}
    >
      {/* Workspace logo / fallback gradient */}
      {item.avatarUrl ? (
        <Image
          source={{ uri: item.avatarUrl }}
          style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={item.isShared
            ? [COLORS.success, COLORS.success + 'AA']
            : [COLORS.primary, '#8B5CF6']}
          style={{
            width: 44, height: 44, borderRadius: 12,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Ionicons
            name={item.isShared ? 'checkmark' : 'people'}
            size={20}
            color="#FFF"
          />
        </LinearGradient>
      )}

      {/* Name & role chips */}
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}
          numberOfLines={1}
        >
          {item.workspaceName}
        </Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          gap: 5, marginTop: 3, flexWrap: 'wrap',
        }}>
          <View style={{
            backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.full,
            paddingHorizontal: 7, paddingVertical: 1,
          }}>
            <Text style={{
              color: COLORS.primary, fontSize: 10, fontWeight: '700', textTransform: 'capitalize',
            }}>
              {item.userRole}
            </Text>
          </View>

          {item.isShared && (
            <View style={{
              backgroundColor: `${COLORS.success}18`, borderRadius: RADIUS.full,
              paddingHorizontal: 7, paddingVertical: 1,
              flexDirection: 'row', alignItems: 'center', gap: 3,
            }}>
              <Ionicons name="checkmark-circle" size={9} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>
                Shared
              </Text>
            </View>
          )}

          {!canShare && (
            <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
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
            <View style={{
              width: 28, height: 28, borderRadius: 8,
              backgroundColor: item.isShared ? `${COLORS.success}20` : `${COLORS.primary}15`,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1,
              borderColor: item.isShared ? `${COLORS.success}40` : `${COLORS.primary}30`,
            }}>
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
  // Uses get_user_workspaces_for_sharing() which returns out_-prefixed columns
  // to avoid Postgres 42702 ambiguous column reference error.
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
        // Map out_-prefixed columns; fall back to un-prefixed for safety
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown.duration(340).springify()}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor:      COLORS.backgroundCard,
          borderTopLeftRadius:  26,
          borderTopRightRadius: 26,
          borderTopWidth:       1,
          borderTopColor:       COLORS.border,
          paddingBottom:        insets.bottom + SPACING.md,
          maxHeight:            '88%',
        }}
      >
        {/* Handle */}
        <View style={{
          width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
          alignSelf: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md,
        }} />

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-start',
          paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
          borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md,
        }}>
          <LinearGradient
            colors={['#6C63FF', '#8B5CF6']}
            style={{
              width: 48, height: 48, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOWS.medium,
            }}
          >
            <Ionicons name={iconName as any} size={22} color="#FFF" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800',
            }}>
              Share {typeLabel}
            </Text>
            <Text
              style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }}
              numberOfLines={2}
            >
              {title}
            </Text>
            {sharedCount > 0 && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: `${COLORS.success}15`,
                borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
                alignSelf: 'flex-start', marginTop: 6,
                borderWidth: 1, borderColor: `${COLORS.success}30`,
              }}>
                <Ionicons name="checkmark-circle" size={11} color={COLORS.success} />
                <Text style={{ color: COLORS.success, fontSize: 11, fontWeight: '700' }}>
                  Shared to {sharedCount} workspace{sharedCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 32, height: 32, borderRadius: 10,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
            }}
          >
            <Ionicons name="close" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 12 }}>
                Loading workspaces…
              </Text>
            </View>

          ) : loadError ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: 12 }}>
              <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
              <Text style={{
                color: COLORS.error, fontSize: FONTS.sizes.sm, textAlign: 'center',
              }}>
                {loadError}
              </Text>
              <TouchableOpacity
                onPress={loadWorkspaces}
                style={{
                  backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
                  paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
                }}
              >
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>

          ) : workspaces.length === 0 ? (
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: 12 }}
            >
              <View style={{
                width: 64, height: 64, borderRadius: 18,
                backgroundColor: `${COLORS.primary}15`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="people-outline" size={32} color={COLORS.primary} />
              </View>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700',
              }}>
                No Workspaces Found
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                textAlign: 'center', lineHeight: 20,
              }}>
                Create or join a workspace to share your {typeLabel.toLowerCase()}.
              </Text>
            </Animated.View>

          ) : (
            <>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
                letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.xs,
              }}>
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

              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                textAlign: 'center', marginTop: SPACING.sm, lineHeight: 16,
              }}>
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