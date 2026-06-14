// src/components/workspace/WorkspaceSearchModal.tsx
// Part 46 — Handles all 7 result types from search_workspace RPC.
// Part 52 REDESIGN — beautiful, voice-enabled, cross-platform search.
// Part 52 (update) — three fixes:
//   1. SMOOTH (no bounce): the sheet now enters with a duration-based
//      SlideInUp (Easing.out(Easing.cubic)) instead of .springify().damping(),
//      which was overshooting and bouncing. Calm, controlled slide-up.
//   2. KEYBOARD DISMISS ON OUTSIDE TAP: a transparent Pressable behind the
//      content + keyboardShouldPersistTaps='handled' on scrollables means
//      tapping anywhere outside the keyboard/inputs dismisses the keyboard
//      (first tap) and tapping the backdrop closes the sheet.
//   3. ANDROID KEYBOARD COMPATIBILITY: KeyboardAvoidingView uses 'padding' on
//      iOS and undefined behaviour on Android (Android resizes the window via
//      the manifest/app.json softwareKeyboardLayoutMode), with the result list
//      using keyboardShouldPersistTaps and keyboardDismissMode='on-drag' so the
//      keyboard lowers when the user starts scrolling results.

import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, StyleSheet, Keyboard,
  KeyboardAvoidingView, Platform, ScrollView, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown, FadeOut, SlideInUp, Easing,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../common/Avatar';
import { SearchVoiceButton } from './SearchVoiceButton';
import {
  useWorkspaceSearch,
  ExtendedWorkspaceSearchResult,
  ExtendedSearchResultType,
} from '../../hooks/useWorkspaceSearch';
import { useWorkspaceSearchVoice } from '../../hooks/useWorkspaceSearchVoice';
import { WorkspaceRole, MiniProfile } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Type config ──────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  ExtendedSearchResultType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; plural: string }
> = {
  report:         { icon: 'document-text',      color: COLORS.primary, label: 'Report',  plural: 'Reports'  },
  comment:        { icon: 'chatbubble',          color: COLORS.info,    label: 'Comment', plural: 'Comments' },
  member:         { icon: 'person-circle',       color: COLORS.accent,  label: 'Member',  plural: 'Members'  },
  presentation:   { icon: 'easel',               color: '#6C63FF',      label: 'Slides',  plural: 'Slides'   },
  academic_paper: { icon: 'school',              color: '#10B981',      label: 'Paper',   plural: 'Papers'   },
  podcast:        { icon: 'mic',                 color: '#F59E0B',      label: 'Podcast', plural: 'Podcasts' },
  debate:         { icon: 'git-compare-outline', color: '#8B5CF6',      label: 'Debate',  plural: 'Debates'  },
  voice_debate:   { icon: 'mic-circle',          color: '#A78BFA',      label: 'Voice',   plural: 'Voice Debates' },
};

const TYPE_ORDER: ExtendedSearchResultType[] = [
  'report', 'comment', 'member',
  'presentation', 'academic_paper', 'podcast', 'debate', 'voice_debate',
];

type FilterType = 'all' | ExtendedSearchResultType;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:      boolean;
  workspaceId:  string;
  userRole:     WorkspaceRole | null;
  onClose:      () => void;
  onOpenReport: (reportId: string) => void;
  onOpenMemberProfile?: (member: MiniProfile) => void;
  onOpenSharedContent?: (
    contentType: 'presentation' | 'academic_paper' | 'podcast' | 'debate' | 'voice_debate',
    contentId:   string,
    workspaceId: string,
  ) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkspaceSearchModal({
  visible, workspaceId, userRole, onClose, onOpenReport,
  onOpenMemberProfile, onOpenSharedContent,
}: Props) {
  const inputRef = useRef<TextInput>(null);
  const insets   = useSafeAreaInsets();

  const {
    query, results, isSearching, error, search, clear,
  } = useWorkspaceSearch(visible ? workspaceId : null);

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  // ── Voice search ───────────────────────────────────────────────────────────
  const { voiceState, startVoice, stopVoice, cancelVoice, clearError: clearVoiceError } =
    useWorkspaceSearchVoice({
      onTranscribed: (text) => {
        search(text);
        inputRef.current?.focus();
      },
    });

  useEffect(() => {
    if (!voiceState.error) return;
    const t = setTimeout(() => clearVoiceError(), 4000);
    return () => clearTimeout(t);
  }, [voiceState.error, clearVoiceError]);

  // ── Open / close lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      // Focus AFTER the slide-in settles so the keyboard rises smoothly once
      // the sheet is in place (prevents a layout jump on Android).
      const t = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    } else {
      clear();
      setActiveFilter('all');
      cancelVoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    cancelVoice();
    clear();
    setActiveFilter('all');
    onClose();
  };

  // ── Per-type counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of results) c[r.type] = (c[r.type] ?? 0) + 1;
    return c;
  }, [results]);

  const availableTypes = useMemo(
    () => TYPE_ORDER.filter(t => (counts[t] ?? 0) > 0),
    [counts],
  );

  useEffect(() => {
    if (activeFilter !== 'all' && (counts[activeFilter] ?? 0) === 0) {
      setActiveFilter('all');
    }
  }, [counts, activeFilter]);

  // ── Tap handler ───────────────────────────────────────────────────────────
  const handleResultPress = (item: ExtendedWorkspaceSearchResult) => {
    Keyboard.dismiss();

    if (item.type === 'report' && item.reportId)  { onOpenReport(item.reportId); handleClose(); return; }
    if (item.type === 'comment' && item.reportId) { onOpenReport(item.reportId); handleClose(); return; }

    if (item.type === 'member') {
      if (onOpenMemberProfile) {
        const miniProfile: MiniProfile = {
          id:        item.id,
          username:  item.subtitle.startsWith('@') ? item.subtitle.slice(1) : item.subtitle || null,
          fullName:  item.title || null,
          avatarUrl: item.avatarUrl ?? null,
        };
        handleClose();
        setTimeout(() => onOpenMemberProfile(miniProfile), 250);
      } else handleClose();
      return;
    }

    if (
      (item.type === 'presentation' || item.type === 'academic_paper' ||
       item.type === 'podcast' || item.type === 'debate' || item.type === 'voice_debate') &&
      item.contentId
    ) {
      if (onOpenSharedContent) {
        handleClose();
        setTimeout(() => onOpenSharedContent(item.type as any, item.contentId!, workspaceId), 250);
      } else handleClose();
      return;
    }

    handleClose();
  };

  // ── Build the grouped flat list, respecting the active filter ───────────────
  type FlatItem =
    | { kind: 'header'; type: ExtendedSearchResultType; count: number }
    | { kind: 'item';   data: ExtendedWorkspaceSearchResult; index: number };

  const flatItems: FlatItem[] = useMemo(() => {
    const out: FlatItem[] = [];
    const types = activeFilter === 'all' ? TYPE_ORDER : [activeFilter];
    for (const type of types) {
      const group = results.filter(r => r.type === type);
      if (group.length === 0) continue;
      if (activeFilter === 'all') out.push({ kind: 'header', type, count: group.length });
      group.forEach((d, i) => out.push({ kind: 'item', data: d, index: i }));
    }
    return out;
  }, [results, activeFilter]);

  const showEmpty = !isSearching && query.trim().length > 0 && results.length === 0 && !error;
  const showIdle  = query.trim().length === 0 && !voiceState.isRecording && !voiceState.isTranscribing;

  const isVoiceActive = voiceState.isRecording || voiceState.isTranscribing;

  return (
    <Modal
      visible={visible}
      transparent
      // IMPORTANT: native animation is "none" — the Reanimated SlideInUp below
      // owns the entrance. Using "fade"/"slide" here compounds with the
      // Reanimated animation and produces the bounce/jump on Android.
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        {/* Backdrop tap → close the sheet entirely */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        {/* Smooth, NON-bouncing slide-up (duration + cubic ease, no spring) */}
        <Animated.View
          entering={SlideInUp.duration(340).easing(Easing.out(Easing.cubic))}
          style={styles.sheet}
        >
          <LinearGradient
            colors={[COLORS.backgroundElevated, COLORS.backgroundCard, COLORS.background]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.sheetFill}
          >
            <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                {/* Handle */}
                <View style={styles.handleWrap}>
                  <View style={styles.handle} />
                </View>

                {/* Title row */}
                <Animated.View entering={FadeIn.duration(280)} style={styles.titleRow}>
                  <LinearGradient colors={['#6C63FF', '#8B5CF6']} style={styles.titleIcon}>
                    <Ionicons name="search" size={16} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.titleText}>Search workspace</Text>
                    <Text style={styles.titleSub}>Reports, members, slides, podcasts & more</Text>
                  </View>
                  <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </Animated.View>

                {/* Search field with inline voice button */}
                <Animated.View entering={FadeIn.duration(320).delay(40)} style={styles.searchFieldWrap}>
                  <View style={[styles.searchField, isVoiceActive && styles.searchFieldVoice]}>
                    <Ionicons
                      name={voiceState.isRecording ? 'radio-outline' : 'search-outline'}
                      size={18}
                      color={voiceState.isRecording ? COLORS.error : COLORS.textMuted}
                    />
                    <TextInput
                      ref={inputRef}
                      value={query}
                      onChangeText={search}
                      placeholder={
                        voiceState.isRecording
                          ? 'Listening…'
                          : voiceState.isTranscribing
                          ? 'Transcribing…'
                          : 'Type or speak to search'
                      }
                      placeholderTextColor={voiceState.isRecording ? COLORS.error : COLORS.textMuted}
                      style={styles.searchInput}
                      autoCorrect={false}
                      returnKeyType="search"
                      editable={!isVoiceActive}
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    {query.length > 0 && !isVoiceActive && (
                      <TouchableOpacity onPress={() => search('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={17} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    )}
                    {isSearching && !isVoiceActive && (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    )}
                    <SearchVoiceButton
                      voiceState={voiceState}
                      onStart={startVoice}
                      onStop={stopVoice}
                      size={30}
                    />
                  </View>

                  {voiceState.error && (
                    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.voiceErrorBanner}>
                      <Ionicons name="mic-off-outline" size={13} color={COLORS.error} />
                      <Text style={styles.voiceErrorText} numberOfLines={2}>{voiceState.error}</Text>
                    </Animated.View>
                  )}
                </Animated.View>

                {/* Filter chips */}
                {results.length > 0 && availableTypes.length > 1 && (
                  <Animated.View entering={FadeIn.duration(260)}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipsRow}
                      keyboardShouldPersistTaps="handled"
                    >
                      <FilterChip
                        label={`All (${results.length})`}
                        icon="apps-outline"
                        color={COLORS.primary}
                        active={activeFilter === 'all'}
                        onPress={() => setActiveFilter('all')}
                      />
                      {availableTypes.map(t => (
                        <FilterChip
                          key={t}
                          label={`${TYPE_CONFIG[t].plural} (${counts[t]})`}
                          icon={TYPE_CONFIG[t].icon}
                          color={TYPE_CONFIG[t].color}
                          active={activeFilter === t}
                          onPress={() => setActiveFilter(t)}
                        />
                      ))}
                    </ScrollView>
                  </Animated.View>
                )}

                {/* Content — wrapped so an outside tap dismisses the keyboard */}
                <View style={{ flex: 1 }}>
                  {/* Invisible layer: tap empty space → dismiss keyboard (keeps sheet open) */}
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={Keyboard.dismiss}
                    android_disableSound
                  />

                  {voiceState.isRecording || voiceState.isTranscribing ? (
                    <VoiceListeningState
                      isTranscribing={voiceState.isTranscribing}
                      durationMs={voiceState.durationMs}
                      onCancel={cancelVoice}
                    />
                  ) : showIdle ? (
                    <IdleState
                      hasMemberNav={!!onOpenMemberProfile}
                      hasContentNav={!!onOpenSharedContent}
                    />
                  ) : showEmpty ? (
                    <EmptyState query={query} />
                  ) : error ? (
                    <ErrorState error={error} />
                  ) : (
                    <FlatList
                      data={flatItems}
                      keyExtractor={(item, i) =>
                        item.kind === 'header' ? `header-${item.type}` : `item-${item.data.id}-${i}`
                      }
                      contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                      showsVerticalScrollIndicator={false}
                      renderItem={({ item }) => {
                        if (item.kind === 'header') {
                          const conf = TYPE_CONFIG[item.type];
                          return (
                            <View style={styles.sectionHeader}>
                              <View style={[styles.sectionDot, { backgroundColor: conf.color }]} />
                              <Text style={[styles.sectionHeaderText, { color: conf.color }]}>
                                {conf.plural}
                              </Text>
                              <Text style={styles.sectionCount}>{item.count}</Text>
                            </View>
                          );
                        }
                        const isMember     = item.data.type === 'member';
                        const hasMemberNav = isMember && !!onOpenMemberProfile;
                        const isShared     = ['presentation','academic_paper','podcast','debate','voice_debate'].includes(item.data.type);
                        const hasSharedNav = isShared && !!onOpenSharedContent;
                        const isNavigable  = !isMember || hasMemberNav || hasSharedNav;

                        return (
                          <SearchResultRow
                            item={item.data}
                            index={item.index}
                            isNavigable={isNavigable}
                            onPress={() => handleResultPress(item.data)}
                          />
                        );
                      }}
                    />
                  )}
                </View>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
  label, icon, color, active, onPress,
}: {
  label: string; icon: keyof typeof Ionicons.glyphMap; color: string;
  active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[styles.chip, active && { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}
    >
      <Ionicons name={icon} size={12} color={active ? color : COLORS.textMuted} />
      <Text style={[styles.chipText, active && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── SearchResultRow ──────────────────────────────────────────────────────────

function SearchResultRow({
  item, index, isNavigable, onPress,
}: {
  item: ExtendedWorkspaceSearchResult; index: number; isNavigable: boolean; onPress: () => void;
}) {
  const conf = TYPE_CONFIG[item.type];

  return (
    <Animated.View entering={FadeInDown.duration(240).delay(Math.min(index, 8) * 28)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={isNavigable ? 0.7 : 1}
        style={[styles.resultRow, !isNavigable && styles.resultRowDisabled]}
      >
        <View style={[styles.resultRail, { backgroundColor: conf.color }]} />

        {item.type === 'member' ? (
          <Avatar url={item.avatarUrl} name={item.title} size={38} />
        ) : (
          <View style={[styles.resultIconWrap, { backgroundColor: `${conf.color}18` }]}>
            <Ionicons name={conf.icon} size={17} color={conf.color} />
          </View>
        )}

        <View style={styles.resultText}>
          <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
          {!!item.subtitle && (
            <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          )}
        </View>

        {isNavigable
          ? <Ionicons name="chevron-forward" size={15} color={COLORS.textMuted} />
          : <Ionicons name="lock-closed-outline" size={13} color={COLORS.textMuted} />
        }
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function VoiceListeningState({
  isTranscribing, durationMs, onCancel,
}: {
  isTranscribing: boolean; durationMs: number; onCancel: () => void;
}) {
  const seconds = Math.floor(durationMs / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <Animated.View entering={FadeIn.duration(250)} style={stateStyles.wrap}>
      <View style={[stateStyles.iconCircle, { backgroundColor: isTranscribing ? `${COLORS.warning}18` : `${COLORS.error}18` }]}>
        {isTranscribing
          ? <ActivityIndicator size="large" color={COLORS.warning} />
          : <Ionicons name="mic" size={30} color={COLORS.error} />}
      </View>
      <Text style={stateStyles.title}>
        {isTranscribing ? 'Transcribing your search…' : 'Listening…'}
      </Text>
      <Text style={stateStyles.sub}>
        {isTranscribing
          ? 'Converting your speech to text.'
          : `Speak your search query.  ${mm}:${ss}`}
      </Text>
      {!isTranscribing && (
        <TouchableOpacity onPress={onCancel} style={stateStyles.cancelBtn} activeOpacity={0.8}>
          <Ionicons name="close" size={15} color={COLORS.textSecondary} />
          <Text style={stateStyles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

function IdleState({ hasMemberNav, hasContentNav }: { hasMemberNav: boolean; hasContentNav: boolean }) {
  const tips: { tip: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { tip: 'Type a report title or topic', icon: 'document-text-outline' },
    { tip: 'Search by a member’s name',     icon: 'person-outline'        },
    ...(hasContentNav ? [{ tip: 'Find shared slides or papers', icon: 'easel-outline' as const }] : []),
    ...(hasContentNav ? [{ tip: 'Search podcasts & debates',     icon: 'mic-outline'   as const }] : []),
    { tip: 'Tap the mic to search by voice', icon: 'mic-circle-outline'   },
  ];

  return (
    <View style={stateStyles.wrap}>
      <View style={stateStyles.iconCircle}>
        <Ionicons name="search" size={28} color={COLORS.primary} />
      </View>
      <Text style={stateStyles.title}>Find anything in this workspace</Text>
      <Text style={stateStyles.sub}>
        Search across reports, comments, members and shared content — or tap the mic to speak.
      </Text>
      <View style={stateStyles.tips}>
        {tips.map(({ tip, icon }) => (
          <View key={tip} style={stateStyles.tip}>
            <Ionicons name={icon} size={13} color={COLORS.primary} />
            <Text style={stateStyles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <View style={stateStyles.wrap}>
      <View style={[stateStyles.iconCircle, { backgroundColor: `${COLORS.textMuted}18` }]}>
        <Ionicons name="search-outline" size={28} color={COLORS.textMuted} />
      </View>
      <Text style={stateStyles.title}>No results for “{query}”</Text>
      <Text style={stateStyles.sub}>Try different keywords or check your spelling.</Text>
    </View>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <View style={stateStyles.wrap}>
      <View style={[stateStyles.iconCircle, { backgroundColor: `${COLORS.error}18` }]}>
        <Ionicons name="alert-circle-outline" size={28} color={COLORS.error} />
      </View>
      <Text style={stateStyles.title}>Search didn’t work</Text>
      <Text style={stateStyles.sub}>{error}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' },
  sheet:    { height: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  sheetFill:{ flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28 },

  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle:     { width: 42, height: 4, borderRadius: 2, backgroundColor: COLORS.border },

  titleRow:  { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  titleIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleText: { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  titleSub:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
  closeBtn:  { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.backgroundCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },

  searchFieldWrap: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  searchField: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl, paddingLeft: 14, paddingRight: 6, paddingVertical: 6,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  searchFieldVoice: { borderColor: `${COLORS.error}55`, backgroundColor: `${COLORS.error}08` },
  searchInput: { flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, padding: 0, paddingVertical: Platform.OS === 'ios' ? 8 : 4 },

  voiceErrorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8,
    backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.md,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: `${COLORS.error}30`,
  },
  voiceErrorText: { color: COLORS.error, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 },

  chipsRow: { gap: 8, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.border,
    flexShrink: 0,
  },
  chipText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  list: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.xs },
  sectionHeader:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: SPACING.sm, marginTop: SPACING.xs },
  sectionDot:        { width: 7, height: 7, borderRadius: 4 },
  sectionHeaderText: { fontSize: FONTS.sizes.xs, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', flex: 1 },
  sectionCount:      { color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg, paddingVertical: SPACING.md, paddingRight: SPACING.md, paddingLeft: SPACING.md + 5,
    marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  resultRowDisabled: { opacity: 0.7 },
  resultRail:    { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3.5, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  resultIconWrap:{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  resultText:    { flex: 1, minWidth: 0 },
  resultTitle:   { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
  resultSubtitle:{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 },
});

const stateStyles = StyleSheet.create({
  wrap:       { alignItems: 'center', paddingTop: 56, paddingHorizontal: SPACING.xl * 1.4, gap: 12 },
  iconCircle: { width: 74, height: 74, borderRadius: 24, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title:      { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', textAlign: 'center' },
  sub:        { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 21 },
  tips:       { marginTop: SPACING.md, gap: SPACING.sm, alignSelf: 'stretch' },
  tip:        { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  tipText:    { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '500' },
  cancelBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACING.md, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.full, paddingHorizontal: SPACING.lg, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' },
});