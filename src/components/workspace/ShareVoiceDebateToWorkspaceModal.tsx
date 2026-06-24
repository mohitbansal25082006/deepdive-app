// src/components/workspace/ShareVoiceDebateToWorkspaceModal.tsx
// Part 55.3 — FULL THEME-COMPATIBILITY PASS
// All hardcoded hex colors replaced with COLORS tokens.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }           from '@expo/vector-icons';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  loadWorkspacesForVoiceDebate,
  shareVoiceDebateToWorkspace,
  removeSharedVoiceDebate,
} from '../../services/voiceDebateSharingService';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS, getModalBackdrop } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:           boolean;
  voiceDebateId:     string;
  topic:             string;
  question:          string;
  totalTurns:        number;
  durationSeconds:   number;
  audioAllUploaded:  boolean;
  onClose:           () => void;
  onShared?:         (workspaceId: string, workspaceName: string) => void;
}

interface WorkspaceItem {
  workspaceId:   string;
  workspaceName: string;
  avatarUrl:     string | null;
  userRole:      string;
  isShared:      boolean;
}

// ─── Helper: format duration ──────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m > 0 ? `${m} min` : `${seconds}s`;
}

// ─── WorkspaceRow ─────────────────────────────────────────────────────────────

function WorkspaceRow({
  item, isSharing, audioAllUploaded, onToggle,
}: {
  item:             WorkspaceItem;
  isSharing:        boolean;
  audioAllUploaded: boolean;
  onToggle:         () => void;
}) {
  const canShare = (item.userRole === 'owner' || item.userRole === 'editor') && audioAllUploaded;
  const isDisabledByUpload = (item.userRole === 'owner' || item.userRole === 'editor') && !audioAllUploaded;

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
          : (canShare ? COLORS.border : `${COLORS.border}60`),
        opacity: canShare ? 1 : 0.5,
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
            : [COLORS.primary, COLORS.primaryLight]}
          style={{
            width: 44, height: 44, borderRadius: 12,
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Ionicons name={item.isShared ? 'checkmark' : 'people'} size={20} color={COLORS.textPrimary} />
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
              borderWidth: 1, borderColor: `${COLORS.success}30`,
            }}>
              <Ionicons name="checkmark-circle" size={9} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>
                Shared
              </Text>
            </View>
          )}
          {isDisabledByUpload && (
            <Text style={{ color: COLORS.warning, fontSize: 10, fontWeight: '600' }}>
              Audio uploading…
            </Text>
          )}
          {!canShare && !isDisabledByUpload && item.userRole === 'viewer' && (
            <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
              Viewer — can't share
            </Text>
          )}
        </View>
      </View>

      {canShare && (
        isSharing ? (
          <ActivityIndicator size="small" color={item.isShared ? COLORS.success : COLORS.primary} />
        ) : (
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

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ShareVoiceDebateToWorkspaceModal({
  visible, voiceDebateId, topic, question,
  totalTurns, durationSeconds, audioAllUploaded,
  onClose, onShared,
}: Props) {
  const insets = useSafeAreaInsets();

  const [workspaces,  setWorkspaces]  = useState<WorkspaceItem[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [sharingId,   setSharingId]   = useState<string | null>(null);
  const [sharedCount, setSharedCount] = useState(0);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    if (!voiceDebateId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const items = await loadWorkspacesForVoiceDebate(voiceDebateId);
      setWorkspaces(items as WorkspaceItem[]);
      setSharedCount(items.filter(i => i.isShared).length);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load workspaces';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [voiceDebateId]);

  useEffect(() => {
    if (visible && voiceDebateId) loadWorkspaces();
  }, [visible, voiceDebateId, loadWorkspaces]);

  const handleToggle = async (item: WorkspaceItem) => {
    if (sharingId) return;
    if (!audioAllUploaded && !item.isShared) {
      Alert.alert(
        'Upload in Progress',
        'The voice debate audio is still uploading to the cloud. Please wait for the upload to complete before sharing.',
      );
      return;
    }

    setSharingId(item.workspaceId);
    try {
      if (item.isShared) {
        const { error } = await removeSharedVoiceDebate(item.workspaceId, voiceDebateId);
        if (error) throw new Error(error);
        setWorkspaces(prev =>
          prev.map(w => w.workspaceId === item.workspaceId ? { ...w, isShared: false } : w)
        );
        setSharedCount(c => Math.max(0, c - 1));
      } else {
        const { error } = await shareVoiceDebateToWorkspace(item.workspaceId, voiceDebateId);
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
        style={{ flex: 1, backgroundColor: getModalBackdrop(0.65) }}
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
            colors={[COLORS.primary, COLORS.primaryLight]}
            style={{
              width: 48, height: 48, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, ...SHADOWS.medium,
            }}
          >
            <Ionicons name="mic-circle" size={24} color={COLORS.textPrimary} />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800',
            }}>
              Share Voice Debate
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
              {totalTurns > 0 && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: `${COLORS.primary}12`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderWidth: 1, borderColor: `${COLORS.primary}25`,
                }}>
                  <Ionicons name="chatbubbles-outline" size={10} color={COLORS.primary} />
                  <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>
                    {totalTurns} turns
                  </Text>
                </View>
              )}
              {durationSeconds > 0 && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: `${COLORS.info}12`, borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderWidth: 1, borderColor: `${COLORS.info}25`,
                }}>
                  <Ionicons name="time-outline" size={10} color={COLORS.info} />
                  <Text style={{ color: COLORS.info, fontSize: 10, fontWeight: '700' }}>
                    {formatDuration(durationSeconds)}
                  </Text>
                </View>
              )}
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

        {/* Upload status banner */}
        {!audioAllUploaded && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: `${COLORS.warning}12`, borderRadius: RADIUS.lg,
            padding: SPACING.sm, marginHorizontal: SPACING.lg, marginTop: SPACING.md,
            borderWidth: 1, borderColor: `${COLORS.warning}30`,
          }}>
            <ActivityIndicator size="small" color={COLORS.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                Audio uploading to cloud…
              </Text>
              <Text style={{ color: COLORS.warning, fontSize: 10, opacity: 0.8, marginTop: 2 }}>
                Sharing will be enabled once upload completes. This usually takes under a minute.
              </Text>
            </View>
          </View>
        )}

        {/* Info banner (when audio is ready) */}
        {audioAllUploaded && (
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 8,
            backgroundColor: `${COLORS.primary}08`, borderRadius: RADIUS.lg,
            padding: SPACING.sm, marginHorizontal: SPACING.lg, marginTop: SPACING.md,
            borderWidth: 1, borderColor: `${COLORS.primary}20`,
          }}>
            <Ionicons name="cloud-done-outline" size={15} color={COLORS.primary} style={{ marginTop: 1 }} />
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, lineHeight: 16, flex: 1 }}>
              Audio is uploaded to cloud. Workspace members can stream it directly from any device.
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }}
          showsVerticalScrollIndicator={false}
        >
          {/* Loading */}
          {isLoading && (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
              <ActivityIndicator color={COLORS.primary} size="large" />
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
                  backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
                  paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                <Ionicons name="refresh-outline" size={14} color={COLORS.textPrimary} />
                <Text style={{ color: COLORS.textPrimary, fontWeight: '700' }}>Try Again</Text>
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
                textAlign: 'center', lineHeight: 20, maxWidth: 260,
              }}>
                Create or join a workspace as editor or owner to share this voice debate.
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
                    audioAllUploaded={audioAllUploaded}
                    onToggle={() => handleToggle(item)}
                  />
                </Animated.View>
              ))}
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
                textAlign: 'center', marginTop: SPACING.sm, lineHeight: 16,
              }}>
                Only owners and editors can share.{'\n'}
                All members can stream and download.
              </Text>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}