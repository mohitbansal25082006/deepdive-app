// app/(app)/collection-detail.tsx
// Part 35 — Collection Detail Screen
// Part 50.8 — UI UPGRADE (visual only; all logic preserved)
//   • Gradient hero header with a large collection icon and decorative glow.
//   • Glass stat ribbon (items / reports / podcasts / debates) as gradient tiles.
//   • Glassmorphic item rows: content-type accent rail, gradient type icon,
//     type/depth chips, press-scale micro-interaction.
//   • Upgraded loading, error and empty states.
//
// Unchanged: useCollectionDetail, navigateTo(), removeItem, refresh, the
// CONTENT_TYPE_META mapping, and all navigation targets.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient }   from 'expo-linear-gradient';
import { Ionicons }         from '@expo/vector-icons';
import * as Haptics         from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  Layout,
}                           from 'react-native-reanimated';
import { SafeAreaView }     from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useCollectionDetail } from '../../src/hooks/useCollections';
import { CollectionItem, CollectionItemType } from '../../src/types/collections';
import { CONTENT_TYPE_META }   from '../../src/constants/search';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';

const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  try { Haptics.impactAsync(style); } catch {}
};

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
      entering={FadeInDown.duration(350).delay(Math.min(index, 8) * 45)}
      exiting={FadeOut.duration(200)}
      layout={Layout.springify()}
    >
      <Pressable
        onPress={() => { haptic(); navigateTo(item.contentType, item.contentId); }}
        style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.985 : 1 }], marginBottom: SPACING.sm }]}
      >
        <View style={[styles.itemCard, { borderColor: `${meta.color}33` }]}>
          <LinearGradient colors={['#16162F', '#101024']} style={styles.itemGradient}>
            {/* Left accent rail */}
            <LinearGradient colors={[meta.color, `${meta.color}44`]} style={styles.itemAccent} />

            <View style={styles.itemBody}>
              {/* Icon */}
              <LinearGradient
                colors={[meta.color, `${meta.color}99`]}
                style={styles.itemIcon}
              >
                <Ionicons name={meta.icon as any} size={19} color="#FFF" />
              </LinearGradient>

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
                  <View style={[styles.typeChip, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}30` }]}>
                    <Ionicons name={meta.icon as any} size={9} color={meta.color} />
                    <Text style={[styles.typeChipText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {item.depth && (
                    <View style={[styles.typeChip, { backgroundColor: `${depthColor}15`, borderColor: `${depthColor}30` }]}>
                      <Text style={[styles.typeChipText, { color: depthColor }]}>
                        {item.depth.charAt(0).toUpperCase() + item.depth.slice(1)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.dateChip}>
                    <Ionicons name="add-circle-outline" size={9} color={COLORS.textMuted} />
                    <Text style={styles.itemDate}>{formattedDate}</Text>
                  </View>
                </View>
              </View>

              {/* Actions */}
              <View style={styles.itemActions}>
                <TouchableOpacity
                  onPress={() => { haptic(Haptics.ImpactFeedbackStyle.Medium); onRemove(); }}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  style={styles.removeBtn}
                >
                  <Ionicons name="remove-circle-outline" size={19} color={COLORS.error} />
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
              </View>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ collectionName, color }: { collectionName: string; color: string }) {
  return (
    <Animated.View entering={FadeIn.duration(500)} style={styles.emptyState}>
      <LinearGradient colors={['#1C1C40', '#14142E']} style={[styles.emptyIcon, { borderColor: `${color}30` }]}>
        <Ionicons name="folder-open-outline" size={42} color={color} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>Collection is empty</Text>
      <Text style={styles.emptySubtext}>
        Long-press any report, podcast, or debate and tap
        {' '}<Text style={{ color: COLORS.primary, fontWeight: '700' }}>"Add to Collection"</Text>
        {' '}to add it here
      </Text>

      {/* Tips */}
      <View style={styles.tipsList}>
        {[
          { icon: 'document-text-outline',    label: 'Reports — long-press card in History tab',  color: CONTENT_TYPE_META.report.color },
          { icon: 'radio-outline',             label: 'Podcasts — long-press card in Podcast tab', color: CONTENT_TYPE_META.podcast.color },
          { icon: 'chatbox-ellipses-outline',  label: 'Debates — long-press card in Debate tab',   color: CONTENT_TYPE_META.debate.color },
        ].map(tip => (
          <View key={tip.label} style={styles.tipRow}>
            <View style={[styles.tipIcon, { backgroundColor: `${tip.color}18`, borderColor: `${tip.color}30` }]}>
              <Ionicons name={tip.icon as any} size={14} color={tip.color} />
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
      <LinearGradient colors={[COLORS.background, '#0B0B1E', COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.centerState} edges={['top']}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading collection…</Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error || !collection) {
    return (
      <LinearGradient colors={[COLORS.background, '#0B0B1E', COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={styles.centerState} edges={['top']}>
          <LinearGradient colors={['#2A1420', '#1A1020']} style={styles.errorIcon}>
            <Ionicons name="alert-circle-outline" size={44} color={COLORS.error} />
          </LinearGradient>
          <Text style={styles.errorTitle}>{error ?? 'Collection not found'}</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.lg }}>
            <View style={styles.backChip}>
              <Ionicons name="arrow-back" size={15} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: FONTS.sizes.base }}>
                Go Back
              </Text>
            </View>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const reportCount  = items.filter(i => i.contentType === 'report').length;
  const podcastCount = items.filter(i => i.contentType === 'podcast').length;
  const debateCount  = items.filter(i => i.contentType === 'debate').length;

  return (
    <LinearGradient colors={[COLORS.background, '#0B0B1E', COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Gradient hero header ─────────────────────────────────────── */}
        <Animated.View entering={FadeIn.duration(500)}>
          <LinearGradient colors={['#15152F', '#0D0D22']} style={styles.header}>
            {/* decorative glow */}
            <View pointerEvents="none" style={[styles.glow, { backgroundColor: `${accentColor}1F` }]} />

            <View style={styles.headerTopRow}>
              <Pressable
                onPress={() => { haptic(); router.back(); }}
                style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
              </Pressable>

              <Pressable
                onPress={() => { haptic(); handleSearch(); }}
                style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="search-outline" size={20} color={COLORS.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.headerIdentity}>
              <LinearGradient
                colors={[accentColor, `${accentColor}99`]}
                style={styles.headerIconLarge}
              >
                <Ionicons name={collection.icon as any} size={28} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {collection.name}
                </Text>
                {collection.description ? (
                  <Text style={styles.headerSubtitle} numberOfLines={2}>
                    {collection.description}
                  </Text>
                ) : (
                  <Text style={styles.headerSubtitleMuted}>
                    {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'} saved
                  </Text>
                )}
              </View>
            </View>

            {/* ── Stat ribbon ── */}
            <View style={styles.statRibbon}>
              <StatTile icon="layers" value={collection.itemCount} label="Items" gradient={[accentColor, `${accentColor}99`]} accent={accentColor} />
              <StatTile icon="document-text" value={reportCount} label="Reports" gradient={[CONTENT_TYPE_META.report.color, `${CONTENT_TYPE_META.report.color}99`]} accent={CONTENT_TYPE_META.report.color} />
              <StatTile icon="radio" value={podcastCount} label="Podcasts" gradient={[CONTENT_TYPE_META.podcast.color, `${CONTENT_TYPE_META.podcast.color}99`]} accent={CONTENT_TYPE_META.podcast.color} />
              <StatTile icon="chatbox-ellipses" value={debateCount} label="Debates" gradient={[CONTENT_TYPE_META.debate.color, `${CONTENT_TYPE_META.debate.color}99`]} accent={CONTENT_TYPE_META.debate.color} />
            </View>
          </LinearGradient>
        </Animated.View>

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

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({ icon, value, label, gradient, accent }: {
  icon: string; value: number; label: string; gradient: readonly [string, string]; accent: string;
}) {
  return (
    <View style={[styles.statTile, { borderColor: `${accent}30` }]}>
      <LinearGradient colors={['#1A1A38', '#12122A']} style={styles.statTileGrad}>
        <LinearGradient colors={gradient} style={styles.statTileIcon}>
          <Ionicons name={icon as any} size={13} color="#FFF" />
        </LinearGradient>
        <Text style={styles.statTileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
        <Text style={styles.statTileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
      </LinearGradient>
    </View>
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
  errorIcon: {
    width:          88,
    height:         88,
    borderRadius:   26,
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    `${COLORS.error}30`,
    marginBottom:   SPACING.md,
  },
  errorTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '700',
    textAlign:  'center',
    marginTop:  SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  backChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                6,
    backgroundColor:   `${COLORS.primary}1A`,
    borderRadius:      RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical:   12,
    borderWidth:       1,
    borderColor:       `${COLORS.primary}40`,
  },

  // Header
  header: {
    paddingBottom: SPACING.md,
    overflow:      'hidden',
  },
  glow: {
    position:     'absolute',
    top:          -40,
    right:        -30,
    width:        160,
    height:       160,
    borderRadius: 80,
  },
  headerTopRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.sm,
    paddingBottom:     SPACING.sm,
  },
  headerBtn: {
    width:          40,
    height:         40,
    borderRadius:   12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems:     'center',
    justifyContent: 'center',
    borderWidth:    1,
    borderColor:    COLORS.border,
  },
  headerIdentity: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom:      SPACING.md,
  },
  headerIconLarge: {
    width:          56,
    height:         56,
    borderRadius:   18,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    ...SHADOWS.medium,
  },
  headerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.xl,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    color:     COLORS.textSecondary,
    fontSize:  FONTS.sizes.sm,
    marginTop: 3,
    lineHeight: 19,
  },
  headerSubtitleMuted: {
    color:     COLORS.textMuted,
    fontSize:  FONTS.sizes.sm,
    marginTop: 3,
  },

  // Stat ribbon
  statRibbon: {
    flexDirection:     'row',
    gap:               SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  statTile: {
    flex:         1,
    borderRadius: RADIUS.lg,
    overflow:     'hidden',
    borderWidth:  1,
  },
  statTileGrad: {
    paddingVertical:   SPACING.sm,
    paddingHorizontal: 4,
    alignItems:        'center',
    gap:               4,
  },
  statTileIcon: {
    width:          28,
    height:         28,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
  },
  statTileValue: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.md,
    fontWeight: '900',
  },
  statTileLabel: {
    color:      COLORS.textMuted,
    fontSize:   9,
    fontWeight: '700',
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop:        SPACING.md,
    paddingBottom:     90,
  },
  listHeader: {
    color:        COLORS.textMuted,
    fontSize:     FONTS.sizes.xs,
    fontWeight:   '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },

  // Item card
  itemCard: {
    borderRadius: RADIUS.xl,
    borderWidth:  1,
    overflow:     'hidden',
    ...SHADOWS.small,
  },
  itemGradient: {
    paddingLeft: 6,
  },
  itemAccent: {
    position: 'absolute',
    left:     0,
    top:      0,
    bottom:   0,
    width:    4,
  },
  itemBody: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    padding:       SPACING.md,
    gap:           SPACING.sm,
  },
  itemIcon: {
    width:          42,
    height:         42,
    borderRadius:   13,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    ...SHADOWS.small,
  },
  itemText: {
    flex:    1,
    minWidth: 0,
    gap:     3,
  },
  itemTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  itemSubtitle: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
  itemChips: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:           6,
    marginTop:     5,
  },
  typeChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               3,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderWidth:       1,
  },
  typeChipText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  dateChip: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
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
    width:          32,
    height:         32,
    borderRadius:    9,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: `${COLORS.error}10`,
    borderWidth:     1,
    borderColor:     `${COLORS.error}25`,
  },

  // Empty state
  emptyState: {
    flex:       1,
    padding:    SPACING.xl,
    alignItems: 'center',
    paddingTop: SPACING.xl * 2,
  },
  emptyIcon: {
    width:          92,
    height:         92,
    borderRadius:   28,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   SPACING.lg,
    borderWidth:    1,
  },
  emptyTitle: {
    color:        COLORS.textPrimary,
    fontSize:     FONTS.sizes.lg,
    fontWeight:   '800',
    marginBottom: SPACING.sm,
  },
  emptySubtext: {
    color:        COLORS.textMuted,
    fontSize:     FONTS.sizes.sm,
    textAlign:    'center',
    lineHeight:   20,
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    RADIUS.lg,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     COLORS.border,
  },
  tipIcon: {
    width:          34,
    height:         34,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
    borderWidth:    1,
  },
  tipText: {
    flex:     1,
    color:    COLORS.textSecondary,
    fontSize: FONTS.sizes.sm,
  },
});