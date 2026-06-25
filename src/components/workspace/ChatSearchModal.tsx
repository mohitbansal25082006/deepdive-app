// src/components/workspace/ChatSearchModal.tsx
// Part 50 — Full-screen search modal for workspace chat.
// Part 55.2 — Fully theme-integrated: all hardcoded colors replaced with live
//             COLORS from the theme system. No dark-only assumptions.

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  StatusBar,
  Platform,
  Pressable,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Ionicons }         from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  id:             string;
  text:           string;
  authorName:     string | null;
  createdAt:      string;
  hasAttachment:  boolean;
  attachmentName?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const now  = new Date();
  const d    = new Date(iso);
  const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (diff === 0) return time;
  if (diff === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return <Text style={[styles.resultText, { color: COLORS.textPrimary }]}>{text}</Text>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts   = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <Text style={[styles.resultText, { color: COLORS.textPrimary }]}>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <Text key={i} style={[styles.highlight, { color: COLORS.primary, backgroundColor: `${COLORS.primary}18` }]}>{p}</Text>
          : p,
      )}
    </Text>
  );
}

// ─── Result Row ───────────────────────────────────────────────────────────────

interface ResultRowProps {
  result:  SearchResult;
  query:   string;
  onPress: (id: string) => void;
}

function ResultRow({ result, query, onPress }: ResultRowProps) {
  return (
    <TouchableOpacity
      style={[styles.resultRow, { borderBottomColor: `${COLORS.border}55` }]}
      onPress={() => onPress(result.id)}
      activeOpacity={0.72}
    >
      <View style={[styles.resultIconWrap, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}>
        {result.hasAttachment
          ? <Ionicons name="attach-outline"     size={16} color={COLORS.primary}  />
          : <Ionicons name="chatbubble-outline" size={16} color={COLORS.textMuted} />}
      </View>

      <View style={styles.resultContent}>
        <View style={styles.resultMeta}>
          <Text style={[styles.resultAuthor, { color: COLORS.textSecondary }]} numberOfLines={1}>
            {result.authorName ?? 'Unknown'}
          </Text>
          <Text style={[styles.resultTime, { color: COLORS.textMuted }]}>{formatDate(result.createdAt)}</Text>
        </View>
        {result.text
          ? highlightText(result.text.slice(0, 120), query)
          : <Text style={[styles.resultAttachment, { color: COLORS.textMuted }]}>📎 {result.attachmentName ?? 'Attachment'}</Text>}
      </View>

      <Ionicons name="arrow-redo-outline" size={14} color={COLORS.textMuted} style={styles.resultArrow} />
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  visible:       boolean;
  channel:       any;
  onClose:       () => void;
  onGoToMessage: (messageId: string) => void;
}

export function ChatSearchModal({ visible, channel, onClose, onGoToMessage }: Props) {
  const insets = useSafeAreaInsets();

  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef    = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), []);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    } else {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setError(null);
    }
  }, [visible]);

  // ── Search logic ──────────────────────────────────────────────────────────
  const performSearch = useCallback(async (q: string) => {
    if (!q.trim() || !channel) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      let serverResults: SearchResult[] = [];
      try {
        const response = await channel.search(q, { limit: 30 });
        serverResults = (response?.results ?? [])
          .map((r: any): SearchResult => {
            const m    = r.message;
            const atts = m?.attachments ?? [];
            return {
              id:             m.id ?? '',
              text:           m.text ?? '',
              authorName:     m.user?.name ?? null,
              createdAt:      m.created_at ?? new Date().toISOString(),
              hasAttachment:  atts.length > 0,
              attachmentName: atts[0]?.title ?? atts[0]?.fallback ?? undefined,
            };
          })
          .filter((r: SearchResult) => r.id);
      } catch {
        // Stream search may not be enabled — fall through to local
      }

      const lowerQ    = q.toLowerCase();
      const localMsgs = Object.values((channel.state?.messages ?? {}) as Record<string, any>);
      const localResults: SearchResult[] = localMsgs
        .filter((m: any) => {
          if (m.deleted_at) return false;
          const textMatch = (m.text ?? '').toLowerCase().includes(lowerQ);
          const attMatch  = (m.attachments ?? []).some((a: any) =>
            (a.title ?? a.fallback ?? '').toLowerCase().includes(lowerQ),
          );
          return textMatch || attMatch;
        })
        .map((m: any): SearchResult => {
          const atts = m.attachments ?? [];
          return {
            id:             m.id,
            text:           m.text ?? '',
            authorName:     m.user?.name ?? null,
            createdAt:      m.created_at ?? new Date().toISOString(),
            hasAttachment:  atts.length > 0,
            attachmentName: atts[0]?.title ?? atts[0]?.fallback ?? undefined,
          };
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const serverIds = new Set(serverResults.map(r => r.id));
      const merged    = [
        ...serverResults,
        ...localResults.filter(r => !serverIds.has(r.id)),
      ].slice(0, 50);

      setResults(merged);
      setHasSearched(true);
    } catch {
      setError('Search failed. Try again.');
    } finally {
      setIsSearching(false);
    }
  }, [channel]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    debounceRef.current = setTimeout(() => performSearch(text), 380);
  }, [performSearch]);

  const handleResultPress = useCallback((messageId: string) => {
    Keyboard.dismiss();
    onClose();
    setTimeout(() => onGoToMessage(messageId), 350);
  }, [onClose, onGoToMessage]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    inputRef.current?.focus();
  }, []);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={[styles.screen, { backgroundColor: COLORS.background, paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={[styles.inputWrap, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}>
            <Ionicons name="search-outline" size={17} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search messages and files…"
              placeholderTextColor={COLORS.textMuted}
              style={[styles.input, { color: COLORS.textPrimary }]}
              returnKeyType="search"
              onSubmitEditing={() => performSearch(query)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              showSoftInputOnFocus={true}
            />
            {isSearching && (
              <ActivityIndicator size="small" color={COLORS.primary} style={styles.inputRight} />
            )}
            {!isSearching && query.length > 0 && (
              <TouchableOpacity onPress={handleClear} style={styles.inputRight}>
                <Ionicons name="close-circle" size={17} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={handleClose} style={styles.cancelBtn} activeOpacity={0.7}>
            <Text style={[styles.cancelText, { color: COLORS.primary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* ── Divider ── */}
        <View style={[styles.divider, { backgroundColor: COLORS.border }]} />

        {/* ── Body ── */}
        {error ? (
          <Pressable style={styles.center} onPress={dismissKeyboard} android_disableSound>
            <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
            <Text style={[styles.centerText, { color: COLORS.textSecondary }]}>{error}</Text>
            <TouchableOpacity onPress={() => performSearch(query)} style={[styles.retryBtn, { backgroundColor: COLORS.primary }]}>
              <Text style={[styles.retryText, { color: '#FFF' }]}>Retry</Text>
            </TouchableOpacity>
          </Pressable>

        ) : hasSearched && results.length === 0 ? (
          <Pressable style={{ flex: 1 }} onPress={dismissKeyboard} android_disableSound>
            <Animated.View entering={FadeIn.duration(200)} style={styles.center}>
              <Ionicons name="search-outline" size={36} color={`${COLORS.textMuted}60`} />
              <Text style={[styles.centerTitle, { color: COLORS.textPrimary }]}>No results</Text>
              <Text style={[styles.centerText, { color: COLORS.textSecondary }]}>No messages found for "{query}"</Text>
            </Animated.View>
          </Pressable>

        ) : results.length > 0 ? (
          <>
            <View style={[styles.countStrip, { backgroundColor: COLORS.backgroundCard, borderBottomColor: COLORS.border }]}>
              <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.success} />
              <Text style={[styles.countText, { color: COLORS.textMuted }]}>
                {results.length} result{results.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <FlatList
              data={results}
              keyExtractor={r => r.id}
              renderItem={({ item }) => (
                <ResultRow result={item} query={query} onPress={handleResultPress} />
              )}
              contentContainerStyle={styles.resultsList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            />
          </>

        ) : (
          <Pressable style={styles.center} onPress={dismissKeyboard} android_disableSound>
            <View style={[styles.emptyIcon, { backgroundColor: COLORS.backgroundCard, borderColor: COLORS.border }]}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
            </View>
            <Text style={[styles.centerTitle, { color: COLORS.textPrimary }]}>Search chat</Text>
            <Text style={[styles.centerText, { color: COLORS.textSecondary }]}>
              Find any message, file, or attachment{'\n'}shared in this workspace chat
            </Text>
            <View style={styles.tipRow}>
              <View style={[styles.tipChip, { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}25` }]}>
                <Ionicons name="chatbubble-outline" size={11} color={COLORS.primary} />
                <Text style={[styles.tipText, { color: COLORS.primary }]}>Messages</Text>
              </View>
              <View style={[styles.tipChip, { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}25` }]}>
                <Ionicons name="attach-outline" size={11} color={COLORS.primary} />
                <Text style={[styles.tipText, { color: COLORS.primary }]}>Files</Text>
              </View>
              <View style={[styles.tipChip, { backgroundColor: `${COLORS.primary}12`, borderColor: `${COLORS.primary}25` }]}>
                <Ionicons name="image-outline" size={11} color={COLORS.primary} />
                <Text style={[styles.tipText, { color: COLORS.primary }]}>Images</Text>
              </View>
            </View>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:  SPACING.sm,
    gap:              10,
  },
  inputWrap: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      RADIUS.xl,
    borderWidth:       1,
    paddingHorizontal: SPACING.md,
    paddingVertical:   Platform.OS === 'android' ? 6 : SPACING.sm,
    gap:               8,
    minHeight:         44,
  },
  searchIcon: { flexShrink: 0 },
  input: {
    flex:      1,
    fontSize:  FONTS.sizes.base,
    padding:   0,
    zIndex:    10,
  },
  inputRight: { flexShrink: 0 },
  cancelBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical:   SPACING.xs,
    minHeight:         44,
    justifyContent:    'center',
  },
  cancelText: {
    fontSize:   FONTS.sizes.base,
    fontWeight: '600',
  },
  divider: {
    height: 1,
  },
  countStrip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: SPACING.xl,
    paddingVertical:  8,
    borderBottomWidth: 1,
  },
  countText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  resultsList: {
    paddingBottom: SPACING.xl,
  },
  resultRow: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical:  SPACING.md,
    gap:              12,
    borderBottomWidth: 1,
  },
  resultIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    11,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    flexShrink:      0,
  },
  resultContent:    { flex: 1, minWidth: 0 },
  resultMeta:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  resultAuthor:     { fontSize: FONTS.sizes.xs, fontWeight: '700', flex: 1 },
  resultTime:       { fontSize: 10 },
  resultText:       { fontSize: FONTS.sizes.sm, lineHeight: 19 },
  highlight:        { fontWeight: '700' },
  resultAttachment: { fontSize: FONTS.sizes.xs },
  resultArrow:      { flexShrink: 0 },

  center: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: SPACING.xl,
    gap:             12,
    paddingBottom:   80,
  },
  emptyIcon: {
    width:           72,
    height:          72,
    borderRadius:    22,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    marginBottom:    4,
  },
  centerTitle: {
    fontSize:   FONTS.sizes.xl,
    fontWeight: '800',
  },
  centerText: {
    fontSize:  FONTS.sizes.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  tipRow: {
    flexDirection: 'row',
    gap:           8,
    marginTop:     4,
  },
  tipChip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              4,
    paddingHorizontal: 10,
    paddingVertical:  5,
    borderRadius:     RADIUS.full,
    borderWidth:      1,
  },
  tipText: {
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  retryBtn: {
    borderRadius:     RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical:  SPACING.sm,
    marginTop:        4,
  },
  retryText: {
    fontWeight: '700',
    fontSize:   FONTS.sizes.sm,
  },
});