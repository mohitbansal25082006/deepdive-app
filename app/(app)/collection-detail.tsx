// app/(app)/collection-detail.tsx
// Part 35 — Collection Detail Screen
//
// Shows all items inside a collection with content-type icons,
// navigation to each item, and swipe-to-remove.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
  Layout,
}                           from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useCollectionDetail } from '../../src/hooks/useCollections';
import { CollectionItem, CollectionItemType } from '../../src/types/collections';
import { CONTENT_TYPE_META }   from '../../src/constants/search';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';

// ─── Navigate to content ─────────────────────────────────────────────────────

function navigateTo(contentType: CollectionItemType, contentId: string) {
  switch (contentType) {
    case 'report':
      router.push({ pathname: '/(app)/research-report' as any, params: { reportId: contentId } });
      break;
    case 'podcast':
      router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId: contentId } });
      break;
    case 'debate':
      router.push({ pathname: '/(app)/debate-detail' as any, params: { sessionId: contentId } });
      break;
  }
}

// ─── Collection Item Row ──────────────────────────────────────────────────────

interface ItemRowProps {
  item:     CollectionItem;
  index:    number;
  color:    string;
  onRemove: () => void;
}

function CollectionItemRow({ item, index, color, onRemove }: ItemRowProps) {
  const meta = CONTENT_TYPE_META[item.contentType];

  const formattedDate = new Date(item.addedAt).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });

  const depthColor =
    item.depth === 'expert' ? COLORS.warning :
    item.depth === 'deep'   ? COLORS.primary :
    COLORS.info;

  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(index * 45)}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        onPress={() => navigateTo(item.contentType, item.contentId)}
        activeOpacity={0.78}
        style={styles.itemCard}
      >
        {/* Left accent */}
        <View style={[styles.itemAccent, { backgroundColor: meta.color }]} />

        <View style={styles.itemBody}>
          {/* Icon */}
          <View style={[styles.itemIcon, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}30` }]}>
            <Ionicons name={meta.icon as any} size={18} color={meta.color} />
          </View>

          {/* Text */}
          <View style={styles.itemText}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={styles.itemSubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}

            {/* Chips */}
            <View style={styles.itemChips}>
              <View style={[styles.typeChip, { backgroundColor: `${meta.color}15`, borderColor: `${meta.color}25` }]}>
                <Text style={[styles.typeChipText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {item.depth && (
                <View style={[styles.typeChip, { backgroundColor: `${depthColor}12`, borderColor: `${depthColor}25` }]}>
                  <Text style={[styles.typeChipText, { color: depthColor }]}>
                    {item.depth.charAt(0).toUpperCase() + item.depth.slice(1)}
                  </Text>
                </View>
              )}
              <Text style={styles.itemDate}>Added {formattedDate}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.itemActions}>
            <TouchableOpacity
              onPress={onRemove}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={styles.removeBtn}
            >
              <Ionicons name="remove-circle-outline" size={20} color={COLORS.error} />
            </TouchableOpacity>
            <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ collectionName, color }: { collectionName: string; color: string }) {
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name="folder-open-outline" size={40} color={color} />
      </View>
      <Text style={styles.emptyTitle}>Collection is empty</Text>
      <Text style={styles.emptySubtext}>
        Long-press any report, podcast, or debate and tap
        {' '}<Text style={{ color: COLORS.primary, fontWeight: '700' }}>"Add to Collection"</Text>
        {' '}to add it here
      </Text>

      {/* Tips */}
      <View style={styles.tipsList}>
        {[
          { icon: 'document-text-outline',    label: 'Reports — long-press card in History tab'   },
          { icon: 'radio-outline',             label: 'Podcasts — long-press card in Podcast tab'  },
          { icon: 'chatbox-ellipses-outline',  label: 'Debates — long-press card in Debate tab'    },
        ].map(tip => (
          <View key={tip.label} style={styles.tipRow}>
            <View style={[styles.tipIcon, { backgroundColor: `${color}15` }]}>
              <Ionicons name={tip.icon as any} size={14} color={color} />
            </View>
            <Text style={styles.tipText}>{tip.label}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CollectionDetailScreen() {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();

  const {
    collection,
    items,
    isLoading,
    error,
    refresh,
    removeItem,
  } = useCollectionDetail(collectionId ?? null);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleRemove = useCallback((item: CollectionItem) => {
    Alert.alert(
      'Remove from Collection',
      `Remove "${item.title}" from this collection?\nThe item itself won't be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:    'Remove',
          style:   'destructive',
          onPress: () => removeItem(item.contentType, item.contentId),
        },
      ],
    );
  }, [removeItem]);

  const accentColor = collection?.color ?? COLORS.primary;

  // Header actions: search button
  const handleSearch = useCallback(() => {
    router.push({ pathname: '/(app)/global-search' as any });
  }, []);

  if (isLoading && !collection) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.centerState} edges={['top']}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading collection…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error || !collection) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.centerState} edges={['top']}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={styles.errorTitle}>{error ?? 'Collection not found'}</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.lg }}>
            <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.base }}>
              ← Go Back
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={styles.headerBtn}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <LinearGradient
              colors={[accentColor, `${accentColor}BB`]}
              style={styles.headerIconGrad}
            >
              <Ionicons name={collection.icon as any} size={16} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {collection.name}
              </Text>
              {collection.description ? (
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {collection.description}
                </Text>
              ) : null}
            </View>
          </View>

          <TouchableOpacity
            onPress={handleSearch}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            style={styles.headerBtn}
          >
            <Ionicons name="search-outline" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Stats strip ─────────────────────────────────────────────── */}
        <View style={[styles.statsStrip, { borderColor: `${accentColor}20` }]}>
          <View style={styles.statItem}>
            <Ionicons name="layers-outline" size={14} color={accentColor} />
            <Text style={[styles.statValue, { color: accentColor }]}>{collection.itemCount}</Text>
            <Text style={styles.statLabel}>items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="document-text-outline" size={14} color={COLORS.primary} />
            <Text style={[styles.statValue, { color: COLORS.primary }]}>
              {items.filter(i => i.contentType === 'report').length}
            </Text>
            <Text style={styles.statLabel}>reports</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="radio-outline" size={14} color={COLORS.secondary} />
            <Text style={[styles.statValue, { color: COLORS.secondary }]}>
              {items.filter(i => i.contentType === 'podcast').length}
            </Text>
            <Text style={styles.statLabel}>podcasts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="chatbox-ellipses-outline" size={14} color={COLORS.accent} />
            <Text style={[styles.statValue, { color: COLORS.accent }]}>
              {items.filter(i => i.contentType === 'debate').length}
            </Text>
            <Text style={styles.statLabel}>debates</Text>
          </View>
        </View>

        {/* ── Items list ───────────────────────────────────────────────── */}
        {items.length === 0 && !isLoading ? (
          <EmptyState collectionName={collection.name} color={accentColor} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={item => item.itemId}
            renderItem={({ item, index }) => (
              <CollectionItemRow
                item={item}
                index={index}
                color={accentColor}
                onRemove={() => handleRemove(item)}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={accentColor}
                colors={[accentColor]}
              />
            }
            ListHeaderComponent={
              <Text style={styles.listHeader}>
                {items.length} item{items.length !== 1 ? 's' : ''}
              </Text>
            }
          />
        )}

      </SafeAreaView>
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  centerState: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            SPACING.sm,
  },
  loadingText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.sm,
  },
  errorTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '700',
    textAlign:  'center',
    marginTop:  SPACING.sm,
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical:   SPACING.sm,
    gap:               SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: {
    width:          38,
    height:         38,
    borderRadius:   12,
    backgroundColor: COLORS.backgroundElevated,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    COLORS.border,
    flexShrink:     0,
  },
  headerCenter: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
    minWidth:      0,
  },
  headerIconGrad: {
    width:          32,
    height:         32,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  headerSubtitle: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    marginTop: 1,
  },

  // Stats strip
  statsStrip: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical:   SPACING.sm,
    borderBottomWidth: 1,
  },
  statItem: {
    flex:           1,
    alignItems:     'center',
    flexDirection:  'row',
    gap:             4,
    justifyContent: 'center',
  },
  statValue: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
  statLabel: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  statDivider: {
    width:           1,
    height:          20,
    backgroundColor: COLORS.border,
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.sm,
    paddingBottom:     80,
  },
  listHeader: {
    color:        COLORS.textMuted,
    fontSize:     FONTS.sizes.xs,
    fontWeight:   '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },

  // Item card
  itemCard: {
    flexDirection:   'row',
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.xl,
    marginBottom:    SPACING.sm,
    borderWidth:     1,
    borderColor:     COLORS.border,
    overflow:        'hidden',
    ...SHADOWS.small,
  },
  itemAccent: {
    width: 3,
  },
  itemBody: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'flex-start',
    padding:       SPACING.md,
    gap:           SPACING.sm,
  },
  itemIcon: {
    width:          40,
    height:         40,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    borderWidth:    1,
  },
  itemText: {
    flex:    1,
    minWidth: 0,
    gap:     3,
  },
  itemTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
    lineHeight: 20,
  },
  itemSubtitle: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  itemChips: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:            6,
    marginTop:     4,
  },
  typeChip: {
    borderRadius:      RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical:   2,
    borderWidth:       1,
  },
  typeChipText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  itemDate: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  itemActions: {
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            SPACING.sm,
    flexShrink:     0,
  },
  removeBtn: {
    padding: 2,
  },

  // Empty state
  emptyState: {
    flex:    1,
    padding: SPACING.xl,
    alignItems: 'center',
    paddingTop: SPACING.xl * 2,
  },
  emptyIcon: {
    width:          80,
    height:         80,
    borderRadius:   24,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.md,
  },
  emptyTitle: {
    color:        COLORS.textPrimary,
    fontSize:     FONTS.sizes.lg,
    fontWeight:   '700',
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  tipsList: {
    width: '100%',
    gap:   SPACING.sm,
  },
  tipRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             SPACING.md,
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  tipIcon: {
    width:          32,
    height:         32,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  tipText: {
    flex:     1,
    color:    COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
  },
});