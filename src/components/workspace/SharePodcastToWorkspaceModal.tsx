// src/components/workspace/SharePodcastToWorkspaceModal.tsx
// Part 15 UPDATED — Shows upload progress while audio segments are
// being pushed to Supabase Storage before the podcast is shared.
//
// NEW BEHAVIOUR:
//   1. When user taps "Share", shows an upload progress bar.
//   2. Audio segments upload concurrently (3 at a time) to Supabase Storage.
//   3. Cloud HTTPS URLs are stored in shared_podcasts so members on
//      other devices can stream the audio directly.
//   4. Success / error toast shown after share completes.

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
import Animated, { FadeInDown, SlideInDown, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase }                from '../../lib/supabase';
import { sharePodcastToWorkspace } from '../../services/podcastSharingService';
import { removeSharedPodcast }     from '../../services/podcastSharingService';
import { WorkspaceRole }           from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:         boolean;
  podcastId:       string;
  reportId?:       string;
  title:           string;
  hostName:        string;
  guestName:       string;
  durationSeconds: number;
  onClose:         () => void;
  onShared?:       (workspaceId: string, workspaceName: string) => void;
}

// ─── Workspace item ───────────────────────────────────────────────────────────

interface WorkspaceItem {
  workspaceId:   string;
  workspaceName: string;
  avatarUrl:     string | null;
  userRole:      WorkspaceRole;
  isShared:      boolean;
}

// ─── Upload progress bar ──────────────────────────────────────────────────────

function UploadProgressBar({
  uploaded,
  total,
  message,
}: {
  uploaded: number;
  total:    number;
  message:  string;
}) {
  const progress  = total > 0 ? uploaded / total : 0;
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(progress, { duration: 300 });
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value * 100}%` as any,
  }));

  return (
    <View style={{
      backgroundColor:   `${'#FF6584'}08`,
      borderRadius:      RADIUS.lg,
      padding:           SPACING.md,
      borderWidth:       1,
      borderColor:       `${'#FF6584'}20`,
      gap:               8,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIndicator size="small" color="#FF6584" />
        <Text style={{ color: '#FF6584', fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }}>
          {message}
        </Text>
        <Text style={{ color: '#FF6584', fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
          {uploaded}/{total}
        </Text>
      </View>
      <View style={{
        height:          5,
        backgroundColor: `${'#FF6584'}20`,
        borderRadius:    3,
        overflow:        'hidden',
      }}>
        <Animated.View style={[fillStyle, {
          height:          '100%',
          backgroundColor: '#FF6584',
          borderRadius:    3,
        }]} />
      </View>
      <Text style={{ color: COLORS.textMuted, fontSize: 10, textAlign: 'center' }}>
        Uploading audio to cloud so all workspace members can listen
      </Text>
    </View>
  );
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
  const accentColor = item.isShared ? COLORS.success : '#FF6584';

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
      {/* Logo or gradient */}
      {item.avatarUrl ? (
        <Image
          source={{ uri: item.avatarUrl }}
          style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={item.isShared ? [COLORS.success, COLORS.success + 'AA'] : ['#FF6584', '#FF8FA3']}
          style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Ionicons name={item.isShared ? 'checkmark' : 'people'} size={20} color="#FFF" />
        </LinearGradient>
      )}

      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }} numberOfLines={1}>
          {item.workspaceName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
          <View style={{ backgroundColor: `${COLORS.primary}18`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 1 }}>
            <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>{item.userRole}</Text>
          </View>
          {item.isShared && (
            <View style={{ backgroundColor: `${COLORS.success}18`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 1, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="checkmark-circle" size={9} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 10, fontWeight: '700' }}>Shared</Text>
            </View>
          )}
          {!canShare && <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Viewer — can't share</Text>}
        </View>
      </View>

      {canShare && (
        isSharing ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <View style={{
            width: 28, height: 28, borderRadius: 8,
            backgroundColor: item.isShared ? `${COLORS.success}20` : `${'#FF6584'}15`,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1,
            borderColor: item.isShared ? `${COLORS.success}40` : `${'#FF6584'}30`,
          }}>
            <Ionicons name={item.isShared ? 'remove-outline' : 'add-outline'} size={16} color={item.isShared ? COLORS.success : '#FF6584'} />
          </View>
        )
      )}
    </TouchableOpacity>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function SharePodcastToWorkspaceModal({
  visible,
  podcastId,
  reportId,
  title,
  hostName,
  guestName,
  durationSeconds,
  onClose,
  onShared,
}: Props) {
  const insets = useSafeAreaInsets();

  const [workspaces,      setWorkspaces]      = useState<WorkspaceItem[]>([]);
  const [isLoading,       setIsLoading]       = useState(true);
  const [sharingId,       setSharingId]       = useState<string | null>(null);
  const [sharedCount,     setSharedCount]     = useState(0);
  const [loadError,       setLoadError]       = useState<string | null>(null);
  const [uploadProgress,  setUploadProgress]  = useState<{ uploaded: number; total: number; message: string } | null>(null);

  const minutes = durationSeconds > 0 ? Math.round(durationSeconds / 60) : null;

  // ── Load workspaces ───────────────────────────────────────────────────────

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc('get_user_workspaces_for_sharing', {
        p_content_type: 'podcast',
        p_content_id:   podcastId,
      });

      if (error) throw error;

      const rows  = (data as Record<string, unknown>[]) ?? [];
      const items: WorkspaceItem[] = rows.map(row => ({
        workspaceId:   (row.out_workspace_id   ?? row.workspace_id)   as string,
        workspaceName: (row.out_workspace_name  ?? row.workspace_name) as string,
        avatarUrl:     ((row.out_avatar_url     ?? row.avatar_url) as string) ?? null,
        userRole:      (row.out_user_role       ?? row.user_role)      as WorkspaceRole,
        isShared:      (row.out_is_shared       ?? row.is_shared)      as boolean,
      }));

      setWorkspaces(items);
      setSharedCount(items.filter(i => i.isShared).length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  }, [podcastId]);

  useEffect(() => {
    if (visible) { loadWorkspaces(); setUploadProgress(null); }
  }, [visible, loadWorkspaces]);

  // ── Toggle share / unshare ────────────────────────────────────────────────

  const handleToggle = async (item: WorkspaceItem) => {
    if (sharingId) return;
    setSharingId(item.workspaceId);
    setUploadProgress(null);

    try {
      if (item.isShared) {
        // Unshare — no audio upload needed
        const { error } = await removeSharedPodcast(item.workspaceId, podcastId);
        if (error) throw new Error(error);
        setWorkspaces(prev => prev.map(w => w.workspaceId === item.workspaceId ? { ...w, isShared: false } : w));
        setSharedCount(c => c - 1);

      } else {
        // Share — uploads audio first, then shares
        const { error } = await sharePodcastToWorkspace(
          item.workspaceId,
          podcastId,
          reportId,
          (progress) => {
            setUploadProgress(progress);
          },
        );

        if (error) throw new Error(error);

        setUploadProgress(null);
        setWorkspaces(prev => prev.map(w => w.workspaceId === item.workspaceId ? { ...w, isShared: true } : w));
        setSharedCount(c => c + 1);
        onShared?.(item.workspaceId, item.workspaceName);
      }
    } catch (err) {
      setUploadProgress(null);
      Alert.alert('Error', err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSharingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }} activeOpacity={1} onPress={onClose} />

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
          maxHeight:            '90%',
        }}
      >
        {/* Handle */}
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginTop: SPACING.sm, marginBottom: SPACING.md }} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: SPACING.md }}>
          <LinearGradient colors={['#FF6584', '#FF8FA3']} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOWS.medium }}>
            <Ionicons name="mic" size={22} color="#FFF" />
          </LinearGradient>

          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>Share Podcast</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }} numberOfLines={2}>{title}</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
              {hostName} & {guestName}{minutes ? ` · ~${minutes} min` : ''}
            </Text>
            {sharedCount > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderColor: `${COLORS.success}30` }}>
                <Ionicons name="checkmark-circle" size={11} color={COLORS.success} />
                <Text style={{ color: COLORS.success, fontSize: 11, fontWeight: '700' }}>
                  Shared to {sharedCount} workspace{sharedCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, flexShrink: 0 }}>
            <Ionicons name="close" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: SPACING.sm }} showsVerticalScrollIndicator={false}>

          {/* Info banner */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: `${'#FF6584'}08`, borderRadius: RADIUS.lg, padding: SPACING.sm, borderWidth: 1, borderColor: `${'#FF6584'}20`, marginBottom: SPACING.xs }}>
            <Ionicons name="cloud-upload-outline" size={15} color="#FF6584" style={{ marginTop: 1 }} />
            <Text style={{ color: '#FF6584', fontSize: FONTS.sizes.xs, lineHeight: 16, flex: 1 }}>
              Audio is uploaded to the cloud so workspace members on any device can listen and download.
            </Text>
          </View>

          {/* Upload progress */}
          {uploadProgress && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <UploadProgressBar
                uploaded={uploadProgress.uploaded}
                total={uploadProgress.total}
                message={uploadProgress.message}
              />
            </Animated.View>
          )}

          {isLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl }}>
              <ActivityIndicator color="#FF6584" size="large" />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 12 }}>Loading workspaces…</Text>
            </View>

          ) : loadError ? (
            <View style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: 12 }}>
              <Ionicons name="alert-circle-outline" size={36} color={COLORS.error} />
              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, textAlign: 'center' }}>{loadError}</Text>
              <TouchableOpacity onPress={loadWorkspaces} style={{ backgroundColor: '#FF6584', borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}>
                <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>

          ) : workspaces.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center', paddingVertical: SPACING.xl, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: `${'#FF6584'}15`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people-outline" size={32} color="#FF6584" />
              </View>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>No Workspaces Found</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 }}>
                Create or join a workspace to share this episode.
              </Text>
            </Animated.View>

          ) : (
            <>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.xs }}>
                Your Workspaces
              </Text>

              {workspaces.map((item, i) => (
                <Animated.View key={item.workspaceId} entering={FadeInDown.duration(300).delay(i * 50)}>
                  <WorkspaceRow
                    item={item}
                    isSharing={sharingId === item.workspaceId}
                    onToggle={() => handleToggle(item)}
                  />
                </Animated.View>
              ))}

              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 16 }}>
                Audio is uploaded once and streamed to all members.{'\n'}
                Only owners and editors can share episodes.
              </Text>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}