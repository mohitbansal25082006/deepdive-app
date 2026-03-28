// src/components/collections/CollectionCard.tsx
// Part 35 — Collections: Card displayed in the list/grid

import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons }      from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Collection }    from '../../types/collections';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

interface CollectionCardProps {
  collection: Collection;
  index:      number;
  onPress:    () => void;
  onLongPress?: () => void;
  showMenu?:  boolean;
  onEdit?:    () => void;
  onDelete?:  () => void;
}

function CollectionCardComponent({
  collection,
  index,
  onPress,
  onLongPress,
  showMenu,
  onEdit,
  onDelete,
}: CollectionCardProps) {
  const color = collection.color ?? '#6C63FF';

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 55)}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.80}
        style={[styles.card, { borderColor: `${color}30` }]}
      >
        {/* Top gradient accent line */}
        <LinearGradient
          colors={[color, `${color}00`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.topAccent}
        />

        <View style={styles.body}>
          {/* Icon circle */}
          <LinearGradient
            colors={[color, `${color}BB`]}
            style={styles.iconCircle}
          >
            <Ionicons name={collection.icon as any} size={22} color="#FFF" />
          </LinearGradient>

          {/* Text block */}
          <View style={styles.textBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {collection.name}
            </Text>
            {collection.description ? (
              <Text style={styles.description} numberOfLines={2}>
                {collection.description}
              </Text>
            ) : null}
          </View>

          {/* Actions column */}
          <View style={styles.actions}>
            {showMenu ? (
              <>
                <TouchableOpacity
                  onPress={onEdit}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  style={styles.actionBtn}
                >
                  <Ionicons name="pencil-outline" size={15} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onDelete}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  style={styles.actionBtn}
                >
                  <Ionicons name="trash-outline" size={15} color={COLORS.error} />
                </TouchableOpacity>
              </>
            ) : (
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            )}
          </View>
        </View>

        {/* Footer: item count + date */}
        <View style={styles.footer}>
          <View style={[styles.countBadge, { backgroundColor: `${color}18`, borderColor: `${color}30` }]}>
            <Ionicons name="layers-outline" size={10} color={color} />
            <Text style={[styles.countText, { color }]}>
              {collection.itemCount} {collection.itemCount === 1 ? 'item' : 'items'}
            </Text>
          </View>
          <Text style={styles.dateText}>
            {new Date(collection.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day:   'numeric',
            })}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const CollectionCard = memo(CollectionCardComponent);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius:    RADIUS.xl,
    marginBottom:    SPACING.sm,
    borderWidth:     1,
    overflow:        'hidden',
    ...SHADOWS.small,
  },
  topAccent: {
    height: 2,
    width:  '100%',
  },
  body: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    padding:       SPACING.md,
    gap:           SPACING.md,
  },
  iconCircle: {
    width:          50,
    height:         50,
    borderRadius:   15,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  textBlock: {
    flex:    1,
    minWidth: 0,
    gap:     4,
  },
  name: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
  description: {
    color:      COLORS.textMuted,
    fontSize:   FONTS.sizes.xs,
    lineHeight: 17,
  },
  actions: {
    alignItems:     'center',
    gap:             6,
    justifyContent: 'center',
    flexShrink:     0,
  },
  actionBtn: {
    width:          28,
    height:         28,
    borderRadius:    8,
    alignItems:     'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundElevated,
  },
  footer: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingBottom:   SPACING.sm,
  },
  countBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                4,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderWidth:       1,
  },
  countText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
  },
  dateText: {
    color:    COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
  },
});