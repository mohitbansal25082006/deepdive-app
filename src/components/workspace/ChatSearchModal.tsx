// src/components/workspace/ChatSearchModal.tsx
// Part 50 — Full-screen search modal for workspace chat.
//
// KEY DESIGN DECISIONS:
//   • Renders as a Modal (not inline) so it sits in its own layer above
//     Stream's Channel/MessageInput. There is zero interaction between this
//     component's TextInput and Stream's MessageInput.
//   • Has its own independent TextInput for search queries.
//   • Pressing Cancel or tapping a result closes the modal.
//   • After closing, handleGoToMessage sets targetedMessage on MessageList
//     which causes Stream to scroll to and highlight the message.
//   • Search: tries channel.search() (Stream server-side full-text) first,
//     falls back to scanning channel.state.messages locally (instant, offline).

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
  if (!query.trim()) return <Text style={styles.resultText}>{text}</Text>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts   = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <Text style={styles.resultText}>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase()
          ? <Text key={i} style={styles.highlight}>{p}</Text>
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
      style={styles.resultRow}
      onPress={() => onPress(result.id)}
      activeOpacity={0.72}
    >
      <View style={styles.resultIconWrap}>
        {result.hasAttachment
          ? <Ionicons name="attach-outline"     size={16} color={COLORS.primary}  />
          : <Ionicons name="chatbubble-outline" size={16} color={COLORS.textMuted} />}
      </View>

      <View style={styles.resultContent}>
        <View style={styles.resultMeta}>
          <Text style={styles.resultAuthor} numberOfLines={1}>
            {result.authorName ?? 'Unknown'}
          </Text>
          <Text style={styles.resultTime}>{formatDate(result.createdAt)}</Text>
        </View>
        {result.text
          ? highlightText(result.text.slice(0, 120), query)
          : <Text style={styles.resultAttachment}>📎 {result.attachmentName ?? 'Attachment'}</Text>}
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

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (visible) {
      // Short delay lets the Modal animation finish before focus
      const t = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(t);
    } else {
      // Reset state when modal closes
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
      // 1️⃣ Server-side search via Stream API
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

      // 2️⃣ Local fallback: scan channel.state.messages
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

      // Merge: server first, then local not already in server set
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

  // Debounced input handler
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

  // Tap a result → close modal then scroll + highlight
  const handleResultPress = useCallback((messageId: string) => {
    Keyboard.dismiss();
    onClose();
    // Wait for Modal close animation before triggering scroll
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

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

        {/* ── Header ── */}
        <View style={styles.header}>
          {/* Search input — this is the ONLY TextInput in this modal */}
          <View style={styles.inputWrap}>
            <Ionicons name="search-outline" size={17} color={COLORS.textMuted} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search messages and files…"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={() => performSearch(query)}
              autoCapitalize="none"
              autoCorrect={false}
              // keyboardType default so it works well on both platforms
              keyboardType="default"
              // showSoftInputOnFocus ensures keyboard opens on Android
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

          {/* Cancel button */}
          <TouchableOpacity onPress={handleClose} style={styles.cancelBtn} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Body ── */}
        {error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={32} color={COLORS.error} />
            <Text style={styles.centerText}>{error}</Text>
            <TouchableOpacity onPress={() => performSearch(query)} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>

        ) : hasSearched && results.length === 0 ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.center}>
            <Ionicons name="search-outline" size={36} color={`${COLORS.textMuted}60`} />
            <Text style={styles.centerTitle}>No results</Text>
            <Text style={styles.centerText}>No messages found for "{query}"</Text>
          </Animated.View>

        ) : results.length > 0 ? (
          <>
            {/* Result count strip */}
            <View style={styles.countStrip}>
              <Ionicons name="checkmark-circle-outline" size={13} color={COLORS.success} />
              <Text style={styles.countText}>
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
          // Initial empty state — shown before user types anything
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Ionicons name="search-outline" size={32} color={COLORS.textMuted} />
            </View>
            <Text style={styles.centerTitle}>Search chat</Text>
            <Text style={styles.centerText}>
              Find any message, file, or attachment{'\n'}shared in this workspace chat
            </Text>
            <View style={styles.tipRow}>
              <View style={styles.tipChip}>
                <Ionicons name="chatbubble-outline" size={11} color={COLORS.primary} />
                <Text style={styles.tipText}>Messages</Text>
              </View>
              <View style={styles.tipChip}>
                <Ionicons name="attach-outline" size={11} color={COLORS.primary} />
                <Text style={styles.tipText}>Files</Text>
              </View>
              <View style={styles.tipChip}>
                <Ionicons name="image-outline" size={11} color={COLORS.primary} />
                <Text style={styles.tipText}>Images</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: SPACING.md,
    paddingVertical:  SPACING.sm,
    gap:              10,
    backgroundColor:  COLORS.background,
  },
  inputWrap: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   COLORS.backgroundCard,
    borderRadius:      RADIUS.xl,
    borderWidth:       1,
    borderColor:       COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical:   Platform.OS === 'android' ? 6 : SPACING.sm,
    gap:               8,
    minHeight:         44,
  },
  searchIcon: { flexShrink: 0 },
  input: {
    flex:      1,
    color:     COLORS.textPrimary,
    fontSize:  FONTS.sizes.base,
    padding:   0,
    // Ensure no overlap with Stream's hidden inputs
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
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.base,
    fontWeight: '600',
  },
  divider: {
    height:          1,
    backgroundColor: COLORS.border,
  },
  countStrip: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              6,
    paddingHorizontal: SPACING.xl,
    paddingVertical:  8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor:   COLORS.backgroundCard,
  },
  countText: {
    color:      COLORS.textMuted,
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
    borderBottomColor: `${COLORS.border}55`,
  },
  resultIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    11,
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    flexShrink:      0,
  },
  resultContent:    { flex: 1, minWidth: 0 },
  resultMeta:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  resultAuthor:     { color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700', flex: 1 },
  resultTime:       { color: COLORS.textMuted, fontSize: 10 },
  resultText:       { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, lineHeight: 19 },
  highlight:        { color: COLORS.primary, fontWeight: '700', backgroundColor: `${COLORS.primary}18` },
  resultAttachment: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  resultArrow:      { flexShrink: 0 },

  // Empty / loading states
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
    backgroundColor: COLORS.backgroundCard,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     COLORS.border,
    marginBottom:    4,
  },
  centerTitle: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.xl,
    fontWeight: '800',
  },
  centerText: {
    color:     COLORS.textSecondary,
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
    backgroundColor:  `${COLORS.primary}12`,
    borderRadius:     RADIUS.full,
    borderWidth:      1,
    borderColor:      `${COLORS.primary}25`,
  },
  tipText: {
    color:      COLORS.primary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '600',
  },
  retryBtn: {
    backgroundColor:  COLORS.primary,
    borderRadius:     RADIUS.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical:  SPACING.sm,
    marginTop:        4,
  },
  retryText: {
    color:      '#FFF',
    fontWeight: '700',
    fontSize:   FONTS.sizes.sm,
  },
});