// src/components/search/SearchFilters.tsx
// Part 35 — Global Search: Filter bar + advanced filter sheet
//
// Two parts:
//   <SearchFilterBar />      — horizontal scrollable content-type chips
//   <SearchAdvancedFilters/> — bottom sheet with sort, date range, search mode

import React, { useState, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons }      from '@expo/vector-icons';
import { BlurView }      from 'expo-blur';
import Animated, { FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  SearchFilters,
  SearchContentType,
  SearchSortBy,
  SearchMode,
} from '../../types/search';
import {
  CONTENT_TYPE_META,
  SORT_OPTIONS,
  SEARCH_MODE_META,
} from '../../constants/search';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Horizontal content-type chips ───────────────────────────────────────────

interface SearchFilterBarProps {
  filters:    SearchFilters;
  onChange:   (partial: Partial<SearchFilters>) => void;
  onOpenAdvanced: () => void;
  activeFilterCount: number;
}

export function SearchFilterBar({
  filters,
  onChange,
  onOpenAdvanced,
  activeFilterCount,
}: SearchFilterBarProps) {
  const types: SearchContentType[] = ['all', 'report', 'podcast', 'debate', 'presentation', 'academic_paper'];

  return (
    <View style={styles.barWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.barScroll}
      >
        {types.map(type => {
          const isActive = filters.contentType === type;
          const meta     = CONTENT_TYPE_META[type];
          return (
            <TouchableOpacity
              key={type}
              onPress={() => onChange({ contentType: type })}
              style={[
                styles.chip,
                isActive && { backgroundColor: meta.color, borderColor: meta.color },
                !isActive && { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border },
              ]}
              activeOpacity={0.75}
            >
              <Ionicons
                name={meta.icon as any}
                size={13}
                color={isActive ? '#FFF' : COLORS.textMuted}
              />
              <Text style={[
                styles.chipText,
                { color: isActive ? '#FFF' : COLORS.textMuted },
                isActive && { fontWeight: '700' },
              ]}>
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Advanced filter button */}
      <TouchableOpacity
        onPress={onOpenAdvanced}
        style={[
          styles.advancedBtn,
          activeFilterCount > 0 && {
            backgroundColor: `${COLORS.primary}20`,
            borderColor:     `${COLORS.primary}50`,
          },
        ]}
        activeOpacity={0.8}
      >
        <Ionicons
          name="options-outline"
          size={16}
          color={activeFilterCount > 0 ? COLORS.primary : COLORS.textMuted}
        />
        {activeFilterCount > 0 && (
          <View style={styles.filterBadge}>
            <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Search Mode Selector ─────────────────────────────────────────────────────

function SearchModeRow({
  selected,
  onSelect,
}: {
  selected: SearchMode;
  onSelect: (m: SearchMode) => void;
}) {
  const modes: SearchMode[] = ['hybrid', 'keyword', 'semantic'];
  return (
    <View style={styles.modeRow}>
      {modes.map(mode => {
        const meta    = SEARCH_MODE_META[mode];
        const isActive = selected === mode;
        return (
          <TouchableOpacity
            key={mode}
            onPress={() => onSelect(mode)}
            activeOpacity={0.8}
            style={[
              styles.modeCard,
              isActive && {
                backgroundColor: `${meta.color}18`,
                borderColor:     `${meta.color}50`,
              },
            ]}
          >
            <View style={[
              styles.modeIcon,
              { backgroundColor: isActive ? `${meta.color}25` : COLORS.backgroundElevated },
            ]}>
              <Ionicons
                name={meta.icon as any}
                size={16}
                color={isActive ? meta.color : COLORS.textMuted}
              />
            </View>
            <Text style={[
              styles.modeLabel,
              { color: isActive ? meta.color : COLORS.textPrimary },
            ]}>
              {meta.label}
            </Text>
            <Text style={styles.modeDesc} numberOfLines={2}>
              {meta.description}
            </Text>
            {isActive && (
              <View style={[styles.modeCheck, { backgroundColor: meta.color }]}>
                <Ionicons name="checkmark" size={10} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Advanced Filter Sheet ────────────────────────────────────────────────────

interface SearchAdvancedFiltersProps {
  visible:  boolean;
  filters:  SearchFilters;
  onChange: (partial: Partial<SearchFilters>) => void;
  onReset:  () => void;
  onClose:  () => void;
}

export const SearchAdvancedFilters = memo(function SearchAdvancedFilters({
  visible,
  filters,
  onChange,
  onReset,
  onClose,
}: SearchAdvancedFiltersProps) {
  const DATE_PRESETS = [
    { label: 'Any time',    from: undefined, to: undefined },
    { label: 'Today',       from: daysAgo(1),    to: undefined },
    { label: 'This week',   from: daysAgo(7),    to: undefined },
    { label: 'This month',  from: daysAgo(30),   to: undefined },
    { label: 'This year',   from: daysAgo(365),  to: undefined },
  ];

  const activeDateLabel = (() => {
    if (!filters.dateFrom) return 'Any time';
    const msAgo = Date.now() - new Date(filters.dateFrom).getTime();
    const days  = msAgo / 86400000;
    if (days <= 1.5)   return 'Today';
    if (days <= 8)     return 'This week';
    if (days <= 31)    return 'This month';
    if (days <= 366)   return 'This year';
    return 'Custom';
  })();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <BlurView
        intensity={20}
        style={styles.overlay}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Search Filters</Text>
            <TouchableOpacity onPress={onReset} style={styles.resetBtn}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Search Mode */}
          <Text style={styles.sectionLabel}>SEARCH MODE</Text>
          <SearchModeRow
            selected={filters.searchMode}
            onSelect={mode => onChange({ searchMode: mode })}
          />

          {/* Sort By */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>SORT BY</Text>
          <View style={styles.sortRow}>
            {SORT_OPTIONS.map(opt => {
              const isActive = filters.sortBy === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => onChange({ sortBy: opt.value as SearchSortBy })}
                  activeOpacity={0.8}
                  style={[
                    styles.sortChip,
                    isActive && {
                      backgroundColor: `${COLORS.primary}20`,
                      borderColor:     COLORS.primary,
                    },
                  ]}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={13}
                    color={isActive ? COLORS.primary : COLORS.textMuted}
                  />
                  <Text style={[
                    styles.sortChipText,
                    { color: isActive ? COLORS.primary : COLORS.textMuted },
                    isActive && { fontWeight: '700' },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Date Range */}
          <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>DATE RANGE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          >
            {DATE_PRESETS.map(preset => {
              const isActive = activeDateLabel === preset.label;
              return (
                <TouchableOpacity
                  key={preset.label}
                  onPress={() => onChange({ dateFrom: preset.from, dateTo: preset.to })}
                  activeOpacity={0.8}
                  style={[
                    styles.sortChip,
                    isActive && {
                      backgroundColor: `${COLORS.info}20`,
                      borderColor:     COLORS.info,
                    },
                  ]}
                >
                  <Text style={[
                    styles.sortChipText,
                    { color: isActive ? COLORS.info : COLORS.textMuted },
                    isActive && { fontWeight: '700' },
                  ]}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Depth filter (reports only) */}
          {(filters.contentType === 'all' || filters.contentType === 'report') && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>RESEARCH DEPTH</Text>
              <View style={styles.sortRow}>
                {[
                  { value: undefined, label: 'All depths', color: COLORS.textMuted },
                  { value: 'quick',   label: 'Quick',      color: COLORS.info      },
                  { value: 'deep',    label: 'Deep',       color: COLORS.primary   },
                  { value: 'expert',  label: 'Expert',     color: COLORS.warning   },
                ].map(opt => {
                  const isActive = filters.depth === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      onPress={() => onChange({ depth: opt.value as any })}
                      activeOpacity={0.8}
                      style={[
                        styles.sortChip,
                        isActive && {
                          backgroundColor: `${opt.color}20`,
                          borderColor:     opt.color,
                        },
                      ]}
                    >
                      <Text style={[
                        styles.sortChipText,
                        { color: isActive ? opt.color : COLORS.textMuted },
                        isActive && { fontWeight: '700' },
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* Done button */}
          <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={{ marginTop: SPACING.xl }}>
            <LinearGradient
              colors={COLORS.gradientPrimary}
              style={styles.doneBtn}
            >
              <Text style={styles.doneBtnText}>Apply Filters</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Filter bar
  barWrapper: {
    flexDirection: 'row',
    alignItems:    'center',
    paddingLeft:   SPACING.lg,
  },
  barScroll: {
    gap:          8,
    paddingRight: SPACING.sm,
    paddingVertical: 2,
  },
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                5,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical:    7,
    borderWidth:       1,
  },
  chipText: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: '500',
  },
  advancedBtn: {
    width:           38,
    height:          38,
    borderRadius:    12,
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    marginHorizontal: SPACING.sm,
    position:        'relative',
    flexShrink:      0,
  },
  filterBadge: {
    position:        'absolute',
    top:             -4,
    right:           -4,
    width:           16,
    height:          16,
    borderRadius:    8,
    backgroundColor: COLORS.primary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  filterBadgeText: {
    color:      '#FFF',
    fontSize:   9,
    fontWeight: '800',
  },

  // Sheet
  overlay: {
    flex:             1,
    backgroundColor:  'rgba(10,10,26,0.70)',
    justifyContent:   'flex-end',
  },
  sheet: {
    backgroundColor:      COLORS.backgroundCard,
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    padding:              SPACING.xl,
    paddingBottom:        SPACING.xl + 20,
    borderTopWidth:       1,
    borderTopColor:       COLORS.border,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: COLORS.border,
    alignSelf:       'center',
    marginBottom:    SPACING.lg,
  },
  sheetHeader: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    marginBottom:    SPACING.lg,
  },
  sheetTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
  },
  resetBtn: {
    backgroundColor:   `${COLORS.error}15`,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderWidth:       1,
    borderColor:       `${COLORS.error}30`,
  },
  resetText: {
    color:      COLORS.error,
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  sectionLabel: {
    color:         COLORS.textMuted,
    fontSize:      FONTS.sizes.xs,
    fontWeight:    '700',
    letterSpacing: 1,
    marginBottom:  SPACING.sm,
  },

  // Search mode
  modeRow: {
    flexDirection: 'row',
    gap:            8,
  },
  modeCard: {
    flex:            1,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius:    RADIUS.lg,
    padding:         SPACING.sm,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    gap:              4,
    position:        'relative',
  },
  modeIcon: {
    width:          34,
    height:         34,
    borderRadius:   10,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   2,
  },
  modeLabel: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    textAlign:  'center',
  },
  modeDesc: {
    color:     COLORS.textMuted,
    fontSize:  8,
    textAlign: 'center',
    lineHeight: 12,
  },
  modeCheck: {
    position:        'absolute',
    top:             -5,
    right:           -5,
    width:           16,
    height:          16,
    borderRadius:    8,
    alignItems:      'center',
    justifyContent:  'center',
  },

  // Sort
  sortRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:            8,
  },
  sortChip: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:                5,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical:    7,
    borderWidth:       1,
    borderColor:       COLORS.border,
    backgroundColor:   COLORS.backgroundElevated,
  },
  sortChipText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '500',
  },

  // Done
  doneBtn: {
    borderRadius:   RADIUS.full,
    paddingVertical: 15,
    alignItems:     'center',
  },
  doneBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '700',
  },
});