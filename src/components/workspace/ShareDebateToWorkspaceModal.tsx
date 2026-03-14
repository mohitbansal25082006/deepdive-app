// src/components/workspace/ShareDebateToWorkspaceModal.tsx
// Part 16 — FIXED v3
//
// Fixes applied:
//   • S1 calls get_debate_sharing_workspaces(p_debate_id uuid) — dedicated,
//     no overloading possible
//   • S2 calls get_user_workspaces_for_debate_sharing(p_debate_id uuid) — alias
//   • S3 direct table query — works with zero RPC dependency
//
// The generic get_user_workspaces_for_sharing is NOT called here at all
// — it is now reserved for podcast and presentation sharing modals only.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase }               from '../../lib/supabase';
import { shareDebateToWorkspace } from '../../services/debateSharingService';
import { removeSharedDebate }     from '../../services/debateSharingService';
import { WorkspaceRole }          from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

const ACCENT = '#6C63FF';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:            boolean;
  debateId:           string;
  topic:              string;
  question:           string;
  perspectiveCount:   number;
  searchResultsCount: number;
  onClose:            () => void;
  onShared?:          (workspaceId: string, workspaceName: string) => void;
}

interface WorkspaceItem {
  workspaceId:   string;
  workspaceName: string;
  avatarUrl:     string | null;
  userRole:      WorkspaceRole;
  isShared:      boolean;
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

function mapRow(r: Record<string, unknown>): WorkspaceItem {
  return {
    workspaceId:   (r.out_workspace_id   ?? r.workspace_id)   as string,
    workspaceName: (r.out_workspace_name  ?? r.workspace_name) as string,
    avatarUrl:     ((r.out_avatar_url     ?? r.avatar_url) as string) ?? null,
    userRole:      (r.out_user_role       ?? r.user_role)      as WorkspaceRole,
    isShared:      Boolean(r.out_is_shared ?? r.is_shared),
  };
}

// ─── Three-strategy loader ────────────────────────────────────────────────────

async function loadWorkspacesForDebate(debateId: string): Promise<WorkspaceItem[]> {

  // S1: get_debate_sharing_workspaces — unique name, UUID param, no overloading
  try {
    const { data, error } = await supabase.rpc(
      'get_debate_sharing_workspaces',
      { p_debate_id: debateId },
    );
    if (!error && data !== null) {
      return ((data as Record<string, unknown>[]) ?? []).map(mapRow);
    }
    console.warn('[ShareDebateModal] S1 failed:', error?.message);
  } catch (e) {
    console.warn('[ShareDebateModal] S1 threw:', e);
  }

  // S2: alias with same UUID param
  try {
    const { data, error } = await supabase.rpc(
      'get_user_workspaces_for_debate_sharing',
      { p_debate_id: debateId },
    );
    if (!error && data !== null) {
      return ((data as Record<string, unknown>[]) ?? []).map(mapRow);
    }
    console.warn('[ShareDebateModal] S2 failed:', error?.message);
  } catch (e) {
    console.warn('[ShareDebateModal] S2 threw:', e);
  }

  // S3: direct table query — always works, no RPC needed
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated — please sign in again.');

  const { data: memberRows, error: memberErr } = await supabase
    .from('workspace_members')
    .select('role, workspace:workspaces(id, name, avatar_url, is_personal)')
    .eq('user_id', user.id);

  if (memberErr) throw new Error(memberErr.message);

  const allWorkspaces: WorkspaceItem[] = (
    (memberRows ?? []) as Record<string, unknown>[]
  )
    .filter(row => {
      const ws = row.workspace as Record<string, unknown> | null;
      return ws && ws.is_personal === false;
    })
    .map(row => {
      const ws = row.workspace as Record<string, unknown>;
      return {
        workspaceId:   ws.id       as string,
        workspaceName: ws.name     as string,
        avatarUrl:     (ws.avatar_url as string) ?? null,
        userRole:      row.role    as WorkspaceRole,
        isShared:      false,
      };
    });

  if (allWorkspaces.length === 0) return [];

  // Check which workspaces this debate is already shared to
  const ids = allWorkspaces.map(w => w.workspaceId);
  const { data: sharedRows } = await supabase
    .from('shared_debates')
    .select('workspace_id')
    .eq('debate_id', debateId)
    .in('workspace_id', ids);

  const sharedSet = new Set(
    ((sharedRows ?? []) as { workspace_id: string }[]).map(r => r.workspace_id)
  );

  return allWorkspaces.map(w => ({ ...w, isShared: sharedSet.has(w.workspaceId) }));
}

// ─── WorkspaceRow ─────────────────────────────────────────────────────────────

function WorkspaceRow({
  item, isSharing, onToggle,
}: {
  item: WorkspaceItem; isSharing: boolean; onToggle: () => void;
}) {
  const canShare = item.userRole === 'owner' || item.userRole === 'editor';

  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={!canShare || isSharing}
      activeOpacity={0.78}
      style={{
        flexDirection:   'row',
        alignItems:      'center',
        gap:             SPACING.md,
        backgroundColor: item.isShared ? `${COLORS.success}10` : COLORS.backgroundElevated,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        borderWidth:     1.5,
        borderColor:     item.isShared
          ? `${COLORS.success}40`
          : canShare ? COLORS.border : `${COLORS.border}60`,
        opacity: canShare ? 1 : 0.45,
      }}
    >
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
            : [ACCENT, '#8B5CF6']}
          style={{
            width: 44, height: 44, borderRadius: 12,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Ionicons name={item.isShared ? 'checkmark' : 'people'} size={20} color="#FFF" />
        </LinearGradient>
      )}

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
            backgroundColor: `${ACCENT}18`, borderRadius: RADIUS.full,
            paddingHorizontal: 7, paddingVertical: 1,
          }}>
            <Text style={{
              color: ACCENT, fontSize: 10, fontWeight: '700', textTransform: 'capitalize',
            }}>
              {item.userRole}
            </Text>
          </View>
          {item.isShared && (
            <View style={{
              backgroundColor: `${COLORS.success}18`, borderRadius: RADIUS.full,
              paddingHorizontal: 7, paddingVertical: 1,
              flexDirection: 'row', alignItems: 'center', gap: 3,
              borderWidth: 1, borderColor: `${COLORS.success}30`,
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

      {canShare && (
        isSharing ? (
          <ActivityIndicator size="small" color={item.isShared ? COLORS.success : ACCENT} />
        ) : (
          <View style={{
            width: 28, height: 28, borderRadius: 8,
            backgroundColor: item.isShared ? `${COLORS.success}20` : `${ACCENT}15`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1,
            borderColor: item.isShared ? `${COLORS.success}40` : `${ACCENT}30`,
          }}>
            <Ionicons
              name={item.isShared ? 'remove-outline' : 'add-outline'}
              size={16}
              color={item.isShared ? COLORS.success : ACCENT}
            />
          </View>
        )
      )}
    </TouchableOpacity>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ShareDebateToWorkspaceModal({
  visible, debateId, topic, question,
  perspectiveCount, searchResultsCount, onClose, onShared,
}: Props) {
  const insets = useSafeAreaInsets();

  const [workspaces,  setWorkspaces]  = useState<WorkspaceItem[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [sharingId,   setSharingId]   = useState<string | null>(null);
  const [sharedCount, setSharedCount] = useState(0);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    if (!debateId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const items = await loadWorkspacesForDebate(debateId);
      setWorkspaces(items);
      setSharedCount(items.filter(i => i.isShared).length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load workspaces';
      console.error('[ShareDebateModal]', msg);
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [debateId]);

  useEffect(() => {
    if (visible && debateId) loadWorkspaces();
  }, [visible, debateId, loadWorkspaces]);

  const handleToggle = async (item: WorkspaceItem) => {
    if (sharingId) return;
    setSharingId(item.workspaceId);
    try {
      if (item.isShared) {
        const { error } = await removeSharedDebate(item.workspaceId, debateId);
        if (error) throw new Error(error);
        setWorkspaces(prev =>
          prev.map(w => w.workspaceId === item.workspaceId ? { ...w, isShared: false } : w)
        );
        setSharedCount(c => Math.max(0, c - 1));
      } else {
        const { error } = await shareDebateToWorkspace(item.workspaceId, debateId);
        if (error) throw new Error(error);
        setWorkspaces(prev =>
          prev.map(w => w.workspaceId === item.workspaceId ? { ...w, isShared: true } : w)
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }}
        activeOpacity={1}
        onPress={onClose}
      />

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
        {/* Drag handle */}
        <View style={{
          width: 40, height: 4, borderRadius: 2,
          backgroundColor: COLORS.border, alignSelf: 'center',
          marginTop: SPACING.sm, marginBottom: SPACING.md,
        }} />

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-start',
          paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
          borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md,
        }}>
          <LinearGradient
            colors={[ACCENT, '#8B5CF6']}
            style={{
              width: 48, height: 48, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, ...SHADOWS.medium,
            }}
          >
            <Ionicons name="people" size={22} color="#FFF" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800',
            }}>
              Share Debate
            </Text>
            <Text
              style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3, lineHeight: 16 }}
              numberOfLines={2}
            >
              {topic}
            </Text>
            {question && question !== topic && (
              <Text
                style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2, fontStyle: 'italic' }}
                numberOfLines={1}
              >
                {question}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: `${ACCENT}12`, borderRadius: RADIUS.full,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: `${ACCENT}25`,
              }}>
                <Ionicons name="people-outline" size={10} color={ACCENT} />
                <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '700' }}>
                  {perspectiveCount} agents
                </Text>
              </View>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                backgroundColor: `${COLORS.info}12`, borderRadius: RADIUS.full,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: `${COLORS.info}25`,
              }}>
                <Ionicons name="globe-outline" size={10} color={COLORS.info} />
                <Text style={{ color: COLORS.info, fontSize: 10, fontWeight: '700' }}>
                  {searchResultsCount} sources
                </Text>
              </View>
              {sharedCount > 0 && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderWidth: 1, borderColor: `${COLORS.success}30`,
                }}>
                  <Ionicons name="checkmark-circle" size={10} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>
                    {sharedCount} workspace{sharedCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </View>
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

        {/* Info banner */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 8,
          backgroundColor: `${ACCENT}08`, borderRadius: RADIUS.lg,
          padding: SPACING.sm, marginHorizontal: SPACING.lg, marginTop: SPACING.md,
          borderWidth: 1, borderColor: `${ACCENT}20`,
        }}>
          <Ionicons name="information-circle-outline" size={15} color={ACCENT} style={{ marginTop: 1 }} />
          <Text style={{ color: ACCENT, fontSize: FONTS.sizes.xs, lineHeight: 16, flex: 1 }}>
            Members can view and download this debate.
            Re-generation is not available for shared debates.
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
          showsVerticalScrollIndicator={false}
        >
          {/* Loading */}
          {isLoading && (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
              <ActivityIndicator color={ACCENT} size="large" />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 12 }}>
                Loading workspaces…
              </Text>
            </View>
          )}

          {/* Error */}
          {!isLoading && loadError && (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: 12 }}>
              <View style={{
                width: 56, height: 56, borderRadius: 16,
                backgroundColor: `${COLORS.error}12`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="alert-circle-outline" size={28} color={COLORS.error} />
              </View>
              <Text style={{
                color: COLORS.error, fontSize: FONTS.sizes.sm,
                textAlign: 'center', fontWeight: '600',
              }}>
                Could not load workspaces
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                textAlign: 'center', lineHeight: 18, maxWidth: 260,
              }}>
                {loadError}
              </Text>
              <TouchableOpacity
                onPress={loadWorkspaces}
                style={{
                  backgroundColor: ACCENT, borderRadius: RADIUS.lg,
                  paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                <Ionicons name="refresh-outline" size={14} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Empty */}
          {!isLoading && !loadError && workspaces.length === 0 && (
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: 12 }}
            >
              <View style={{
                width: 64, height: 64, borderRadius: 18,
                backgroundColor: `${ACCENT}15`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="people-outline" size={32} color={ACCENT} />
              </View>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700',
              }}>
                No Workspaces Found
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                textAlign: 'center', lineHeight: 20, maxWidth: 260,
              }}>
                Create or join a workspace as editor or owner to share this debate.
              </Text>
            </Animated.View>
          )}

          {/* Workspace list */}
          {!isLoading && !loadError && workspaces.length > 0 && (
            <>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                fontWeight: '600', letterSpacing: 1,
                textTransform: 'uppercase', marginBottom: SPACING.xs,
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
                Only owners and editors can share.{'\n'}
                All members can view and download.
              </Text>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}