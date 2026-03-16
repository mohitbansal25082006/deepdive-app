// src/components/profile/CacheManagerModal.tsx
// Part 22 — Cache Manager Modal.
// Opened from the Profile tab → Offline Cache row.
//
// Features:
//   • Storage usage ring + per-type breakdown
//   • Storage limit selector (50 MB → 1 GB presets + custom)
//   • Auto-cache toggle
//   • Expiry days selector
//   • Per-type delete with item count
//   • Individual item list with delete (swipe-style confirmation)
//   • Delete all button
//
// Uses useCache() hook from Part 22A.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCache } from '../../hooks/useCache';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { CachedContentType, CacheFilterType } from '../../types/cache';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MAX_H = SCREEN_H * 0.92;

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<CachedContentType, { label: string; icon: string; color: string }> = {
  report:         { label: 'Research Reports', icon: 'document-text-outline', color: '#6C63FF' },
  podcast:        { label: 'Podcast Episodes', icon: 'radio-outline',          color: '#FF6584' },
  debate:         { label: 'AI Debates',        icon: 'chatbox-ellipses-outline', color: '#F97316' },
  academic_paper: { label: 'Academic Papers',  icon: 'school-outline',          color: '#43E97B' },
  presentation:   { label: 'Presentations',    icon: 'easel-outline',           color: '#29B6F6' },
};

const EXPIRY_OPTIONS = [
  { label: '7 days',  days: 7  },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

// ─── Usage ring (SVG-free, CSS-like circle via border trick) ─────────────────

function UsageRing({ percent, usedLabel, limitLabel }: {
  percent:    number;
  usedLabel:  string;
  limitLabel: string;
}) {
  const SIZE = 100;
  const clampedPct = Math.min(100, Math.max(0, percent));
  const color =
    clampedPct > 85 ? COLORS.error :
    clampedPct > 65 ? COLORS.warning :
    COLORS.primary;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer ring using border */}
      <View style={{
        width:        SIZE,
        height:       SIZE,
        borderRadius: SIZE / 2,
        borderWidth:  8,
        borderColor:  COLORS.backgroundElevated,
        alignItems:   'center',
        justifyContent: 'center',
      }}>
        {/* Filled arc — approximate using a rotated half with overflow hidden */}
        <View style={{
          position:     'absolute',
          width:        SIZE - 8,
          height:       SIZE - 8,
          borderRadius: (SIZE - 8) / 2,
          borderWidth:  8,
          borderColor:  'transparent',
          borderTopColor: color,
          borderRightColor: clampedPct > 25 ? color : 'transparent',
          borderBottomColor: clampedPct > 50 ? color : 'transparent',
          borderLeftColor:  clampedPct > 75 ? color : 'transparent',
          transform:    [{ rotate: `${(clampedPct / 100) * 360 - 90}deg` }],
        }} />

        {/* Center text */}
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
            {Math.round(clampedPct)}%
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>used</Text>
        </View>
      </View>

      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginTop: 8 }}>
        {usedLabel}
      </Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
        of {limitLabel} limit
      </Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{
      color:         COLORS.textMuted,
      fontSize:      FONTS.sizes.xs,
      fontWeight:    '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom:  SPACING.sm,
      marginTop:     SPACING.lg,
    }}>
      {title}
    </Text>
  );
}

// ─── Per-type row ─────────────────────────────────────────────────────────────

function TypeRow({
  type,
  count,
  bytes,
  formatBytes,
  onDelete,
  isDeleting,
}: {
  type:        CachedContentType;
  count:       number;
  bytes:       number;
  formatBytes: (b: number) => string;
  onDelete:    () => void;
  isDeleting:  boolean;
}) {
  const cfg = TYPE_CONFIG[type];
  if (count === 0) return null;

  const handleDelete = () => {
    Alert.alert(
      `Clear ${cfg.label}`,
      `Delete all ${count} cached ${cfg.label.toLowerCase()} from this device?\n\nYour data remains in the cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete All', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <View style={{
      flexDirection:   'row',
      alignItems:      'center',
      gap:             12,
      backgroundColor: COLORS.backgroundCard,
      borderRadius:    RADIUS.lg,
      padding:         SPACING.md,
      marginBottom:    SPACING.sm,
      borderWidth:     1,
      borderColor:     COLORS.border,
    }}>
      <View style={{
        width:  38, height: 38, borderRadius: 11,
        backgroundColor: `${cfg.color}18`,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: `${cfg.color}30`,
        flexShrink: 0,
      }}>
        <Ionicons name={cfg.icon as any} size={17} color={cfg.color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
          {cfg.label}
        </Text>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
          {count} item{count !== 1 ? 's' : ''} · {formatBytes(bytes)}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleDelete}
        disabled={isDeleting}
        style={{
          backgroundColor: `${COLORS.error}10`,
          borderRadius:    RADIUS.md,
          paddingHorizontal: 10, paddingVertical: 6,
          borderWidth: 1, borderColor: `${COLORS.error}25`,
          flexShrink: 0,
        }}
      >
        {isDeleting
          ? <ActivityIndicator size="small" color={COLORS.error} />
          : <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Clear</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Limit preset row ─────────────────────────────────────────────────────────

function LimitRow({
  bytes,
  label,
  isSelected,
  onPress,
}: {
  bytes:      number;
  label:      string;
  isSelected: boolean;
  onPress:    () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection:   'row',
        alignItems:      'center',
        justifyContent:  'space-between',
        backgroundColor: isSelected ? `${COLORS.primary}12` : COLORS.backgroundCard,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        marginBottom:    SPACING.sm,
        borderWidth:     1.5,
        borderColor:     isSelected ? COLORS.primary : COLORS.border,
      }}
    >
      <Text style={{
        color:      isSelected ? COLORS.primary : COLORS.textSecondary,
        fontSize:   FONTS.sizes.base,
        fontWeight: isSelected ? '700' : '500',
      }}>
        {label}
      </Text>
      {isSelected && (
        <LinearGradient
          colors={COLORS.gradientPrimary}
          style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="checkmark" size={13} color="#FFF" />
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
}

// ─── Individual item row ──────────────────────────────────────────────────────

function ItemRow({
  entry,
  onDelete,
  isDeleting,
  formatBytes,
}: {
  entry:       import('../../types/cache').CacheEntry;
  onDelete:    () => void;
  isDeleting:  boolean;
  formatBytes: (b: number) => string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cfg = TYPE_CONFIG[entry.type];

  const handlePress = () => {
    if (confirmDelete) {
      onDelete();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 2500);
    }
  };

  return (
    <View style={{
      flexDirection:   'row',
      alignItems:      'center',
      gap:             10,
      backgroundColor: COLORS.backgroundCard,
      borderRadius:    RADIUS.md,
      padding:         SPACING.sm,
      marginBottom:    6,
      borderWidth:     1,
      borderColor:     COLORS.border,
    }}>
      <View style={{
        width: 30, height: 30, borderRadius: 9,
        backgroundColor: `${cfg.color}15`,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Ionicons name={entry.icon as any ?? cfg.icon} size={13} color={cfg.color} />
      </View>

      <Text style={{
        color:    COLORS.textSecondary,
        fontSize: FONTS.sizes.xs,
        flex:     1,
        lineHeight: 16,
      }} numberOfLines={2}>
        {entry.title}
      </Text>

      <Text style={{ color: COLORS.textMuted, fontSize: 10, flexShrink: 0 }}>
        {formatBytes(entry.sizeBytes)}
      </Text>

      <TouchableOpacity
        onPress={handlePress}
        disabled={isDeleting}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width:  28, height: 28, borderRadius: 8,
          backgroundColor: confirmDelete ? `${COLORS.error}20` : COLORS.backgroundElevated,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1,
          borderColor: confirmDelete ? `${COLORS.error}40` : COLORS.border,
          flexShrink: 0,
        }}
      >
        {isDeleting
          ? <ActivityIndicator size="small" color={COLORS.error} />
          : <Ionicons
              name={confirmDelete ? 'checkmark' : 'trash-outline'}
              size={13}
              color={confirmDelete ? COLORS.error : COLORS.textMuted}
            />
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface CacheManagerModalProps {
  visible:  boolean;
  onClose:  () => void;
}

export function CacheManagerModal({ visible, onClose }: CacheManagerModalProps) {
  const insets = useSafeAreaInsets();
  const {
    entries, stats, settings, summary,
    isLoading, isDeleting,
    activeFilter, filteredEntries, setFilter,
    limitPresets, formatBytes,
    refresh, deleteItem, deleteByType, deleteAll,
    setLimit, toggleAutoCache,
  } = useCache();

  const [activeTab, setActiveTab] = useState<'overview' | 'items'>('overview');

  useEffect(() => {
    if (visible) refresh();
  }, [visible]);

  const handleDeleteAll = () => {
    if (!stats || stats.totalItems === 0) return;
    Alert.alert(
      'Clear All Cache',
      `Delete all ${stats.totalItems} cached items (${formatBytes(stats.totalBytes)}) from this device?\n\nYour data remains safely in the cloud.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All Cache', style: 'destructive', onPress: deleteAll },
      ]
    );
  };

  const CONTENT_TYPES: CachedContentType[] = ['report', 'podcast', 'debate', 'academic_paper', 'presentation'];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <BlurView
        intensity={20}
        style={{
          flex:            1,
          backgroundColor: 'rgba(10,10,26,0.65)',
          justifyContent:  'flex-end',
        }}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={{
          backgroundColor:    COLORS.backgroundCard,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          maxHeight:          SHEET_MAX_H,
          borderTopWidth:     1,
          borderTopColor:     COLORS.border,
          paddingBottom:      insets.bottom,
        }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: SPACING.sm, marginBottom: SPACING.sm }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
          </View>

          {/* Modal header */}
          <View style={{
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'space-between',
            paddingHorizontal: SPACING.xl,
            paddingBottom:   SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LinearGradient
                colors={['#29B6F6', '#0085D2']}
                style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="cloud-offline-outline" size={16} color="#FFF" />
              </LinearGradient>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                  Cache Manager
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                  {summary || 'Loading…'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 34, height: 34, borderRadius: 10,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Ionicons name="close" size={17} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Tab bar */}
          <View style={{
            flexDirection:   'row',
            paddingHorizontal: SPACING.xl,
            paddingVertical: SPACING.sm,
            gap:             SPACING.sm,
          }}>
            {(['overview', 'items'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex:            1,
                  paddingVertical: 8,
                  borderRadius:    RADIUS.md,
                  backgroundColor: activeTab === tab ? COLORS.primary : COLORS.backgroundElevated,
                  alignItems:      'center',
                  borderWidth:     1,
                  borderColor:     activeTab === tab ? COLORS.primary : COLORS.border,
                }}
              >
                <Text style={{
                  color:      activeTab === tab ? '#FFF' : COLORS.textMuted,
                  fontSize:   FONTS.sizes.xs,
                  fontWeight: '700',
                }}>
                  {tab === 'overview' ? 'Storage' : `Items (${stats?.totalItems ?? 0})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING['2xl'] }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: SPACING.xl,
                paddingBottom:     SPACING.xl,
              }}
              keyboardShouldPersistTaps="handled"
            >

              {/* ══ OVERVIEW TAB ══ */}
              {activeTab === 'overview' && (
                <>
                  {/* Usage ring */}
                  {stats && (
                    <View style={{ alignItems: 'center', paddingVertical: SPACING.lg }}>
                      <UsageRing
                        percent={stats.percentUsed}
                        usedLabel={formatBytes(stats.totalBytes)}
                        limitLabel={formatBytes(stats.limitBytes)}
                      />
                    </View>
                  )}

                  {/* Per-type breakdown */}
                  <SectionHeader title="By Content Type" />
                  {CONTENT_TYPES.map(type => (
                    <TypeRow
                      key={type}
                      type={type}
                      count={stats?.byType[type]?.count ?? 0}
                      bytes={stats?.byType[type]?.bytes ?? 0}
                      formatBytes={formatBytes}
                      onDelete={() => deleteByType(type)}
                      isDeleting={isDeleting}
                    />
                  ))}

                  {/* Storage limit */}
                  <SectionHeader title="Storage Limit" />
                  {limitPresets.map(preset => (
                    <LimitRow
                      key={preset.bytes}
                      bytes={preset.bytes}
                      label={preset.display}
                      isSelected={settings?.limitBytes === preset.bytes}
                      onPress={() => setLimit(preset.bytes)}
                    />
                  ))}

                  {/* Auto-cache toggle */}
                  <SectionHeader title="Settings" />
                  <View style={{
                    flexDirection:   'row',
                    alignItems:      'center',
                    justifyContent:  'space-between',
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius:    RADIUS.lg,
                    padding:         SPACING.md,
                    marginBottom:    SPACING.sm,
                    borderWidth:     1,
                    borderColor:     COLORS.border,
                  }}>
                    <View style={{ flex: 1, marginRight: SPACING.md }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>
                        Auto-Cache Content
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                        Automatically save new reports, podcasts, debates, papers and slides for offline use
                      </Text>
                    </View>
                    <Switch
                      value={settings?.autoCache ?? true}
                      onValueChange={toggleAutoCache}
                      trackColor={{ false: COLORS.border, true: `${COLORS.primary}80` }}
                      thumbColor={settings?.autoCache ? COLORS.primary : COLORS.textMuted}
                    />
                  </View>

                  {/* Expiry picker */}
                  <View style={{
                    backgroundColor: COLORS.backgroundCard,
                    borderRadius:    RADIUS.lg,
                    padding:         SPACING.md,
                    marginBottom:    SPACING.sm,
                    borderWidth:     1,
                    borderColor:     COLORS.border,
                  }}>
                    <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600', marginBottom: SPACING.sm }}>
                      Cache Expiry
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {EXPIRY_OPTIONS.map(opt => {
                        const isSelected = settings?.expiryDays === opt.days;
                        return (
                          <TouchableOpacity
                            key={opt.days}
                            onPress={async () => {
                              const { updateSettings } = await import('../../lib/cacheSettings');
                              await updateSettings({ expiryDays: opt.days });
                              await refresh();
                            }}
                            style={{
                              backgroundColor: isSelected ? `${COLORS.primary}15` : COLORS.backgroundElevated,
                              borderRadius:    RADIUS.full,
                              paddingHorizontal: 12, paddingVertical: 6,
                              borderWidth:     1,
                              borderColor:     isSelected ? COLORS.primary : COLORS.border,
                            }}
                          >
                            <Text style={{
                              color:      isSelected ? COLORS.primary : COLORS.textMuted,
                              fontSize:   FONTS.sizes.xs,
                              fontWeight: isSelected ? '700' : '500',
                            }}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Delete all */}
                  <TouchableOpacity
                    onPress={handleDeleteAll}
                    disabled={isDeleting || (stats?.totalItems ?? 0) === 0}
                    style={{
                      flexDirection:   'row',
                      alignItems:      'center',
                      justifyContent:  'center',
                      gap:             8,
                      marginTop:       SPACING.sm,
                      backgroundColor: `${COLORS.error}10`,
                      borderRadius:    RADIUS.lg,
                      padding:         SPACING.md,
                      borderWidth:     1,
                      borderColor:     `${COLORS.error}25`,
                      opacity:         (stats?.totalItems ?? 0) === 0 ? 0.4 : 1,
                    }}
                  >
                    {isDeleting
                      ? <ActivityIndicator size="small" color={COLORS.error} />
                      : <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                    }
                    <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                      Clear All Cache
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ══ ITEMS TAB ══ */}
              {activeTab === 'items' && (
                <>
                  {/* Filter chips */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: SPACING.md }}>
                    {(['all', ...CONTENT_TYPES] as CacheFilterType[]).map(f => {
                      const cfg = f === 'all' ? { label: 'All', color: COLORS.primary } : TYPE_CONFIG[f as CachedContentType];
                      const count = f === 'all'
                        ? stats?.totalItems ?? 0
                        : stats?.byType[f as CachedContentType]?.count ?? 0;
                      const isActive = activeFilter === f;
                      return (
                        <TouchableOpacity
                          key={f}
                          onPress={() => setFilter(f)}
                          style={{
                            flexDirection:   'row',
                            alignItems:      'center',
                            gap:             5,
                            backgroundColor: isActive ? cfg.color : COLORS.backgroundElevated,
                            borderRadius:    RADIUS.full,
                            paddingHorizontal: 10, paddingVertical: 6,
                            borderWidth:     1,
                            borderColor:     isActive ? cfg.color : COLORS.border,
                          }}
                        >
                          <Text style={{
                            color:      isActive ? '#FFF' : COLORS.textSecondary,
                            fontSize:   FONTS.sizes.xs,
                            fontWeight: '600',
                          }}>
                            {f === 'all' ? 'All' : TYPE_CONFIG[f as CachedContentType].label}
                          </Text>
                          {count > 0 && (
                            <View style={{
                              backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${cfg.color}20`,
                              borderRadius:    RADIUS.full,
                              paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center',
                            }}>
                              <Text style={{ color: isActive ? '#FFF' : cfg.color, fontSize: 9, fontWeight: '800' }}>
                                {count}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {filteredEntries.length === 0 ? (
                    <View style={{ alignItems: 'center', padding: SPACING.xl }}>
                      <Ionicons name="folder-open-outline" size={40} color={COLORS.textMuted} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.sm, textAlign: 'center' }}>
                        No items cached for this type
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.sm }}>
                        Tap the trash icon once to arm, again to confirm delete
                      </Text>
                      {filteredEntries.map(entry => (
                        <ItemRow
                          key={`${entry.type}-${entry.id}`}
                          entry={entry}
                          formatBytes={formatBytes}
                          onDelete={() => deleteItem(entry.type, entry.id)}
                          isDeleting={isDeleting}
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </BlurView>
    </Modal>
  );
}