// src/components/offline/SelectiveCacheSheet.tsx
// Part 45 FIX — Updated to match the fixed useSelectiveCache behaviour:
//
// FIX 1: Pre-ticked items (already cached) are shown with a filled purple checkbox
//   + green "Cached" badge. The user can un-tick them to explicitly remove from cache.
//
// FIX 2: Summary bar now shows the actual delta:
//   "X to add · Y to remove" instead of the old combined total.
//   "Save Changes" button label replaces "Cache Selected" when there are removals too.
//   Button is enabled whenever there is any delta (new items to add OR items to remove).
//
// FIX 3: Replaced BlurView backdrop with plain View (same freeze-prevention fix
//   as CacheManagerModal) — consistent across all sheets.
//
// BUG 2 FIX: Progress overlay now shows only the actual work items count,
//   not the combined previously-cached + new total.

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient }      from 'expo-linear-gradient';
import { Ionicons }            from '@expo/vector-icons';
import { useSafeAreaInsets }   from 'react-native-safe-area-context';
import { useSelectiveCache }   from '../../hooks/useSelectiveCache';
import { formatBytes }         from '../../lib/cacheStorage';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { CachedContentType, CacheFilterType, SelectiveCacheItem } from '../../types/cache';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_MAX_H           = SCREEN_H * 0.94;

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<CachedContentType, { label: string; icon: string; color: string }> = {
  report:         { label: 'Reports',       icon: 'document-text-outline',   color: '#6C63FF' },
  podcast:        { label: 'Podcasts',       icon: 'radio-outline',            color: '#FF6584' },
  debate:         { label: 'Debates',        icon: 'chatbox-ellipses-outline', color: '#F97316' },
  academic_paper: { label: 'Papers',         icon: 'school-outline',           color: '#43E97B' },
  presentation:   { label: 'Slides',         icon: 'easel-outline',            color: '#29B6F6' },
  voice_debate:   { label: 'Voice Debates',  icon: 'mic-circle-outline',       color: '#8B5CF6' },
};

const ALL_CONTENT_TYPES: CachedContentType[] = [
  'report', 'podcast', 'debate', 'academic_paper', 'presentation', 'voice_debate',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSize(kb: number, isReal = false): string {
  if (kb <= 0) return '—';
  const prefix = isReal ? '' : '~';
  if (kb < 1024) return `${prefix}${Math.round(kb)} KB`;
  return `${prefix}${(kb / 1024).toFixed(1)} MB`;
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const diff  = Date.now() - new Date(iso).getTime();
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (hours < 1)  return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  if (days < 30)  return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

function FilterChips({ activeFilter, counts, onSelect }: {
  activeFilter: CacheFilterType;
  counts:       Record<string, number>;
  onSelect:     (f: CacheFilterType) => void;
}) {
  const filters: { id: CacheFilterType; label: string; icon: string; color: string }[] = [
    { id: 'all', label: 'All', icon: 'layers-outline', color: COLORS.primary },
    ...ALL_CONTENT_TYPES.map(t => ({
      id:    t as CacheFilterType,
      label: TYPE_CONFIG[t].label,
      icon:  TYPE_CONFIG[t].icon,
      color: TYPE_CONFIG[t].color,
    })),
  ];

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: 4 }}
      data={filters}
      keyExtractor={f => f.id}
      renderItem={({ item: f }) => {
        const isActive = activeFilter === f.id;
        const count    = counts[f.id] ?? 0;
        return (
          <TouchableOpacity
            onPress={() => onSelect(f.id)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor:   isActive ? f.color : COLORS.backgroundCard,
              borderRadius:      RADIUS.full,
              paddingHorizontal: 12, paddingVertical: 7,
              borderWidth:       1,
              borderColor:       isActive ? f.color : COLORS.border,
            }}
          >
            <Ionicons name={f.icon as any} size={12} color={isActive ? '#FFF' : f.color} />
            <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
              {f.label}
            </Text>
            {count > 0 && (
              <View style={{
                backgroundColor:   isActive ? 'rgba(255,255,255,0.25)' : `${f.color}22`,
                borderRadius:      RADIUS.full,
                paddingHorizontal: 5, paddingVertical: 1,
                minWidth:          18, alignItems: 'center',
              }}>
                <Text style={{ color: isActive ? '#FFF' : f.color, fontSize: 9, fontWeight: '800' }}>
                  {count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ─── Single item row ──────────────────────────────────────────────────────────

function ItemRow({ item, isSelected, onToggle }: {
  item:       SelectiveCacheItem;
  isSelected: boolean;
  onToggle:   () => void;
}) {
  const cfg   = TYPE_CONFIG[item.contentType];
  const color = cfg.color;

  // Visual state:
  //   isCached + isSelected   = already cached, kept (green border, purple tick)
  //   isCached + !isSelected  = will be REMOVED (red dashed border, red X)
  //   !isCached + isSelected  = will be ADDED (normal selected, purple tick)
  //   !isCached + !isSelected = untouched (normal unselected)

  const willRemove  = item.isCached && !isSelected;
  const willAdd     = !item.isCached && isSelected;
  const keepCached  = item.isCached && isSelected;

  const borderColor = willRemove
    ? `${COLORS.error}50`
    : keepCached
    ? `${COLORS.success}40`
    : isSelected
    ? `${color}45`
    : COLORS.border;

  const bgColor = willRemove
    ? `${COLORS.error}08`
    : keepCached
    ? `${COLORS.success}08`
    : isSelected
    ? `${color}0A`
    : COLORS.backgroundCard;

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: bgColor,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.md,
        marginBottom:    SPACING.sm,
        borderWidth:     1.5,
        borderColor:     borderColor,
        borderStyle:     willRemove ? 'dashed' : 'solid',
      }}
    >
      {/* Type icon */}
      <View style={{
        width:           38, height: 38, borderRadius: 11,
        backgroundColor: `${color}15`,
        alignItems:      'center', justifyContent: 'center',
        borderWidth:     1, borderColor: `${color}30`, flexShrink: 0,
      }}>
        <Ionicons name={cfg.icon as any} size={17} color={color} />
      </View>

      {/* Text */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: 2 }}
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>
            {item.subtitle}
          </Text>
          {item.createdAt && (
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              · {formatRelativeDate(item.createdAt)}
            </Text>
          )}
        </View>

        {/* Status badges */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <View style={{
            backgroundColor: `${color}15`, borderRadius: RADIUS.full,
            paddingHorizontal: 6, paddingVertical: 2,
            borderWidth: 1, borderColor: `${color}28`,
          }}>
            <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
              {cfg.label}
            </Text>
          </View>

          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {formatSize(item.sizeHintKb, item.isCached)}
          </Text>

          {/* Already cached badge */}
          {item.isCached && !willRemove && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              backgroundColor: `${COLORS.success}15`, borderRadius: RADIUS.full,
              paddingHorizontal: 6, paddingVertical: 2,
              borderWidth: 1, borderColor: `${COLORS.success}30`,
            }}>
              <Ionicons name="checkmark-circle" size={9} color={COLORS.success} />
              <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>Cached</Text>
            </View>
          )}

          {/* Will remove badge */}
          {willRemove && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 3,
              backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.full,
              paddingHorizontal: 6, paddingVertical: 2,
              borderWidth: 1, borderColor: `${COLORS.error}30`,
            }}>
              <Ionicons name="trash-outline" size={9} color={COLORS.error} />
              <Text style={{ color: COLORS.error, fontSize: 9, fontWeight: '700' }}>Will remove</Text>
            </View>
          )}
        </View>
      </View>

      {/* Checkbox */}
      <View style={{
        width:           26, height: 26, borderRadius: 8,
        backgroundColor: willRemove
          ? `${COLORS.error}15`
          : isSelected
          ? color
          : COLORS.backgroundElevated,
        borderWidth:     isSelected || willRemove ? 0 : 1.5,
        borderColor:     isSelected ? 'transparent' : COLORS.border,
        alignItems:      'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {isSelected && !willRemove && (
          <Ionicons name="checkmark" size={15} color="#FFF" />
        )}
        {willRemove && (
          <Ionicons name="close" size={15} color={COLORS.error} />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ filter, hasSearch }: { filter: CacheFilterType; hasSearch: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, paddingTop: 60 }}>
      <View style={{
        width: 64, height: 64, borderRadius: 20,
        backgroundColor: `${COLORS.primary}12`,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}25`,
      }}>
        <Ionicons name="folder-open-outline" size={28} color={COLORS.primary} />
      </View>
      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', textAlign: 'center', marginBottom: SPACING.xs }}>
        {hasSearch ? 'No results' : 'No content found'}
      </Text>
      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', lineHeight: 18 }}>
        {hasSearch
          ? 'Try a different search term or filter'
          : filter === 'all'
            ? 'Complete some research, podcasts, or debates to see them here.'
            : `No ${TYPE_CONFIG[filter as CachedContentType]?.label ?? ''} found.`}
      </Text>
    </View>
  );
}

// ─── Progress overlay ─────────────────────────────────────────────────────────
// BUG 2 FIX: Shows only the actual work items count (delta), not combined total.

function ProgressOverlay({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <View style={{
      position: 'absolute', inset: 0, zIndex: 50,
      backgroundColor: 'rgba(10,10,26,0.85)',
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 28,
    }}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius: RADIUS.xl, padding: SPACING.xl,
        alignItems: 'center', width: 260,
        borderWidth: 1, borderColor: COLORS.border,
      }}>
        <LinearGradient
          colors={COLORS.gradientPrimary as [string, string]}
          style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}
        >
          <Ionicons name="cloud-download-outline" size={24} color="#FFF" />
        </LinearGradient>
        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800', marginBottom: 6 }}>
          Saving changes…
        </Text>
        {/* BUG 2 FIX: only shows items being processed (add+remove), not preserved items */}
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginBottom: SPACING.md }}>
          {done} / {total} item{total !== 1 ? 's' : ''}
        </Text>
        <View style={{ width: '100%', height: 6, backgroundColor: COLORS.backgroundElevated, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%` as any, height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 }} />
        </View>
        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginTop: 8 }}>
          {pct}%
        </Text>
      </View>
    </View>
  );
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

interface SelectiveCacheSheetProps {
  visible:  boolean;
  onClose:  () => void;
  onDone?:  () => void;
}

export function SelectiveCacheSheet({ visible, onClose, onDone }: SelectiveCacheSheetProps) {
  const insets = useSafeAreaInsets();

  const {
    items,
    filteredItems,
    isLoading,
    isCachingBatch,
    selectedIds,
    filter,
    searchQuery,
    error,
    progress,
    selectedNewItems,
    selectedTotalKb,
    itemsToRemove,
    loadItems,
    toggleSelected,
    selectAll,
    clearSelection,
    setFilter,
    setSearch,
    cacheSelected,
  } = useSelectiveCache(visible);

  // ── Count by type for filter chips ─────────────────────────────────────────

  const countsByType = useMemo(() => {
    const acc: Record<string, number> = { all: items.length };
    for (const item of items) {
      acc[item.contentType] = (acc[item.contentType] ?? 0) + 1;
    }
    return acc;
  }, [items]);

  const alreadyCachedCount = filteredItems.filter(i => i.isCached).length;

  // ── Handle save action ─────────────────────────────────────────────────────

  const hasDelta = selectedNewItems.length > 0 || itemsToRemove.length > 0;

  const handleSaveChanges = useCallback(async () => {
    if (!hasDelta) {
      Alert.alert('No changes', 'Select new items to cache, or un-tick cached items to remove them.');
      return;
    }
    await cacheSelected();
    onDone?.();
  }, [hasDelta, cacheSelected, onDone]);

  // ── Select all visible ──────────────────────────────────────────────────────

  const handleSelectAllVisible = useCallback(() => {
    const allSelected = filteredItems.every(i => selectedIds.has(i.id));
    if (allSelected) clearSelection();
    else selectAll();
  }, [filteredItems, selectedIds, selectAll, clearSelection]);

  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id));

  // ── Summary bar label ──────────────────────────────────────────────────────

  const summaryLabel = useMemo(() => {
    const addCount    = selectedNewItems.length;
    const removeCount = itemsToRemove.length;

    if (addCount === 0 && removeCount === 0) {
      return 'No changes — tap items to add or remove';
    }
    const parts: string[] = [];
    if (addCount > 0)    parts.push(`+${addCount} to cache (${formatSize(selectedTotalKb, false)})`);
    if (removeCount > 0) parts.push(`−${removeCount} to remove`);
    return parts.join(' · ');
  }, [selectedNewItems.length, itemsToRemove.length, selectedTotalKb]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Plain View backdrop — no BlurView (prevents freeze-on-dismiss) */}
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.72)', justifyContent: 'flex-end' }}>

        {/* Tap outside to close */}
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={isCachingBatch ? undefined : onClose}
        />

        <View style={{
          backgroundColor:      COLORS.backgroundCard,
          borderTopLeftRadius:  28, borderTopRightRadius: 28,
          maxHeight:            SHEET_MAX_H,
          borderTopWidth:       1, borderTopColor: COLORS.border,
          paddingBottom:        insets.bottom + 8,
          overflow:             'hidden',
        }}>

          {/* Progress overlay */}
          {isCachingBatch && progress && (
            <ProgressOverlay done={progress.done} total={progress.total} />
          )}

          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.xs }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
          </View>

          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md,
            borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
          }}>
            <LinearGradient
              colors={COLORS.gradientPrimary as [string, string]}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <Ionicons name="cloud-download-outline" size={17} color="#FFF" />
            </LinearGradient>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                Cache Specific Items
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }} numberOfLines={1}>
                {isLoading
                  ? 'Loading…'
                  : `${items.length} items · ${alreadyCachedCount} already cached`}
              </Text>
            </View>

            {/* Select all / none */}
            <TouchableOpacity
              onPress={handleSelectAllVisible}
              disabled={isLoading || filteredItems.length === 0}
              style={{
                backgroundColor:   allVisibleSelected ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                borderRadius:      RADIUS.md,
                paddingHorizontal: 10, paddingVertical: 6,
                borderWidth:       1,
                borderColor:       allVisibleSelected ? `${COLORS.primary}40` : COLORS.border,
                flexShrink:        0,
              }}
            >
              <Text style={{ color: allVisibleSelected ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                {allVisibleSelected ? 'None' : 'All'}
              </Text>
            </TouchableOpacity>

            {/* Close */}
            <TouchableOpacity
              onPress={onClose}
              disabled={isCachingBatch}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={{
                width: 32, height: 32, borderRadius: 9,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border, flexShrink: 0,
              }}
            >
              <Ionicons name="close" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Legend */}
          {!isLoading && items.length > 0 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 14,
              paddingHorizontal: SPACING.lg, paddingVertical: SPACING.xs,
              borderBottomWidth: 1, borderBottomColor: COLORS.border,
              backgroundColor: COLORS.backgroundElevated,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COLORS.primary }} />
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Tick to cache</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COLORS.success }} />
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Green = already cached</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: COLORS.error }} />
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>Red = will remove</Text>
              </View>
            </View>
          )}

          {/* Search bar */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.lg,
            marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.xs,
            paddingHorizontal: SPACING.md,
            borderWidth: 1, borderColor: COLORS.border, height: 40,
          }}>
            <Ionicons name="search-outline" size={15} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearch}
              placeholder="Search content…"
              placeholderTextColor={COLORS.textMuted}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm }}
              editable={!isCachingBatch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter chips */}
          <View style={{ marginBottom: SPACING.xs }}>
            <FilterChips activeFilter={filter} counts={countsByType} onSelect={setFilter} />
          </View>

          {/* Error */}
          {error && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.md,
              marginHorizontal: SPACING.lg, marginBottom: SPACING.sm,
              padding: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.error}25`,
            }}>
              <Ionicons name="alert-circle-outline" size={14} color={COLORS.error} />
              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, flex: 1 }}>{error}</Text>
              <TouchableOpacity onPress={loadItems}>
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* List */}
          {isLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, marginTop: SPACING.sm, fontSize: FONTS.sizes.sm }}>
                Loading your content…
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredItems}
              keyExtractor={item => `${item.contentType}-${item.id}`}
              contentContainerStyle={{
                paddingHorizontal: SPACING.lg,
                paddingTop:        SPACING.sm,
                paddingBottom:     110,
                flexGrow:          1,
              }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <EmptyState
                  filter={filter}
                  hasSearch={searchQuery.trim().length > 0}
                />
              }
              renderItem={({ item }) => (
                <ItemRow
                  item={item}
                  isSelected={selectedIds.has(item.id)}
                  onToggle={() => !isCachingBatch && toggleSelected(item.id)}
                />
              )}
            />
          )}

          {/* Bottom action bar */}
          <View style={{
            position:          'absolute',
            bottom:            insets.bottom,
            left:              0, right: 0,
            paddingHorizontal: SPACING.lg,
            paddingVertical:   SPACING.md,
            borderTopWidth:    1, borderTopColor: COLORS.border,
            backgroundColor:   COLORS.backgroundCard,
            flexDirection:     'row', alignItems: 'center', gap: SPACING.md,
          }}>
            {/* Summary */}
            <View style={{ flex: 1 }}>
              <Text style={{
                color:      hasDelta ? COLORS.textPrimary : COLORS.textMuted,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}>
                {hasDelta
                  ? `${selectedNewItems.length + itemsToRemove.length} change${selectedNewItems.length + itemsToRemove.length !== 1 ? 's' : ''}`
                  : 'No changes'}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }} numberOfLines={2}>
                {summaryLabel}
              </Text>
            </View>

            {/* Save button */}
            <TouchableOpacity
              onPress={handleSaveChanges}
              disabled={isLoading || isCachingBatch || !hasDelta}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                borderRadius: RADIUS.lg,
                paddingVertical: 10, paddingHorizontal: SPACING.lg,
                opacity: (isLoading || isCachingBatch || !hasDelta) ? 0.45 : 1,
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={COLORS.gradientPrimary as [string, string]}
                style={{ position: 'absolute', inset: 0, borderRadius: RADIUS.lg }}
              />
              {isCachingBatch ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="cloud-done-outline" size={16} color="#FFF" />
              )}
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                {isCachingBatch ? 'Saving…' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}