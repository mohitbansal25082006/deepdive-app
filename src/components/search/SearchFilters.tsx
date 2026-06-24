// src/components/search/SearchFilters.tsx
// Part 35 — Global Search: Filter bar + advanced filter sheet
// Part 50.8 — UI UPGRADE (visual only)
// Part 55.2 — FULL THEME-COMPATIBILITY PASS
//
// Part 55.2 changes: ALL hardcoded dark hex literals replaced with live
// COLORS tokens. Every text color uses theme-aware tokens.
// Background colors now use COLORS.background/COLORS.backgroundElevated.

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
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModalBackdrop(opacity: number = 0.70): string {
  const bg = COLORS.background;
  const hex = bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

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
              activeOpacity={0.75}
            >
              {isActive ? (
                <LinearGradient
                  colors={[meta.color, `${meta.color}CC`]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[styles.chip, { borderColor: meta.color }]}
                >
                  <Ionicons name={meta.icon as any} size={13} color="#FFF" />
                  <Text style={[styles.chipText, { color: '#FFF', fontWeight: '700' }]}>
                    {meta.label}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={[styles.chip, { backgroundColor: COLORS.backgroundElevated, borderColor: COLORS.border }]}>
                  <Ionicons name={meta.icon as any} size={13} color={COLORS.textMuted} />
                  <Text style={[styles.chipText, { color: COLORS.textMuted }]}>
                    {meta.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Advanced filter button */}
      <TouchableOpacity
        onPress={onOpenAdvanced}
        style={[
          styles.advancedBtn,
          {
            backgroundColor: activeFilterCount > 0 ? `${COLORS.primary}20` : COLORS.backgroundElevated,
            borderColor: activeFilterCount > 0 ? `${COLORS.primary}50` : COLORS.border,
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
          <View style={[styles.filterBadge, { backgroundColor: COLORS.primary }]}>
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
              {
                backgroundColor: isActive ? `${meta.color}18` : COLORS.backgroundElevated,
                borderColor: isActive ? `${meta.color}50` : COLORS.border,
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
            <Text style={[styles.modeDesc, { color: COLORS.textMuted }]} numberOfLines={2}>
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
        tint={COLORS.background === '#FFFFFF' || COLORS.background === '#F5F6FB' ? 'light' : 'dark'}
        style={[styles.overlay, { backgroundColor: getModalBackdrop(0.70) }]}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetOuter}>
          <LinearGradient colors={COLORS.gradientCard as [string, string]} style={[styles.sheet, { borderTopColor: `${COLORS.primary}30` }]}>
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: COLORS.border }]} />

            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderLeft}>
                <LinearGradient colors={COLORS.gradientPrimary} style={styles.sheetHeaderIcon}>
                  <Ionicons name="options" size={16} color="#FFF" />
                </LinearGradient>
                <Text style={[styles.sheetTitle, { color: COLORS.textPrimary }]}>Search Filters</Text>
              </View>
              <TouchableOpacity onPress={onReset} style={[styles.resetBtn, { backgroundColor: `${COLORS.error}15`, borderColor: `${COLORS.error}30` }]}>
                <Ionicons name="refresh" size={12} color={COLORS.error} />
                <Text style={[styles.resetText, { color: COLORS.error }]}>Reset</Text>
              </TouchableOpacity>
            </View>

            {/* Search Mode */}
            <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>SEARCH MODE</Text>
            <SearchModeRow
              selected={filters.searchMode}
              onSelect={mode => onChange({ searchMode: mode })}
            />

            {/* Sort By */}
            <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: SPACING.lg }]}>SORT BY</Text>
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
                      {
                        backgroundColor: isActive ? `${COLORS.primary}20` : COLORS.backgroundElevated,
                        borderColor: isActive ? COLORS.primary : COLORS.border,
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
            <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: SPACING.lg }]}>DATE RANGE</Text>
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
                      {
                        backgroundColor: isActive ? `${COLORS.info}20` : COLORS.backgroundElevated,
                        borderColor: isActive ? COLORS.info : COLORS.border,
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
                <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: SPACING.lg }]}>RESEARCH DEPTH</Text>
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
                          {
                            backgroundColor: isActive ? `${opt.color}20` : COLORS.backgroundElevated,
                            borderColor: isActive ? opt.color : COLORS.border,
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
                <Ionicons name="checkmark-circle" size={17} color="#FFF" />
                <Text style={styles.doneBtnText}>Apply Filters</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </BlurView>
    </Modal>
  );
});

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
    fontWeight: '600',
  },
  advancedBtn: {
    width:           38,
    height:          38,
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
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
    justifyContent:   'flex-end',
  },
  sheetOuter: {
    borderTopLeftRadius:  28,
    borderTopRightRadius: 28,
    overflow:             'hidden',
  },
  sheet: {
    padding:              SPACING.xl,
    paddingBottom:        SPACING.xl + 20,
    borderTopWidth:       1,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    SPACING.lg,
  },
  sheetHeader: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    marginBottom:    SPACING.lg,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           SPACING.sm,
  },
  sheetHeaderIcon: {
    width:          34,
    height:         34,
    borderRadius:   11,
    alignItems:     'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  sheetTitle: {
    fontSize:   FONTS.sizes.lg,
    fontWeight: '800',
  },
  resetBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               4,
    borderRadius:      RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderWidth:       1,
  },
  resetText: {
    fontSize:   FONTS.sizes.sm,
    fontWeight: '700',
  },
  sectionLabel: {
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
    borderRadius:    RADIUS.lg,
    padding:         SPACING.sm,
    alignItems:      'center',
    borderWidth:     1,
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
  },
  sortChipText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '500',
  },

  // Done
  doneBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    borderRadius:   RADIUS.full,
    paddingVertical: 15,
  },
  doneBtnText: {
    color:      '#FFF',
    fontSize:   FONTS.sizes.base,
    fontWeight: '800',
  },
});