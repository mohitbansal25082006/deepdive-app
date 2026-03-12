// src/components/workspace/AddToWorkspaceSheet.tsx
// Bottom sheet that lists the user's completed reports and lets them
// add one (or more) to the current workspace.

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useHistory } from '../../hooks/useHistory';
import { addReportToWorkspace } from '../../services/workspaceService';
import { ResearchReport } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  workspaceId:     string;
  /** IDs already in this workspace so we can dim/skip them */
  existingReportIds: string[];
  visible:         boolean;
  onClose:         () => void;
  onAdded:         (reportId: string) => void;
}

const DEPTH_COLOR: Record<string, string> = {
  quick:  COLORS.success,
  deep:   COLORS.primary,
  expert: COLORS.pro,
};

export function AddToWorkspaceSheet({
  workspaceId,
  existingReportIds,
  visible,
  onClose,
  onAdded,
}: Props) {
  const { reports, loading, refreshing, refresh } = useHistory();

  const [search,   setSearch]   = useState('');
  const [adding,   setAdding]   = useState<string | null>(null); // reportId being added
  const [addedIds, setAddedIds] = useState<string[]>([]);        // added this session

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return reports;
    return reports.filter(
      r =>
        r.title?.toLowerCase().includes(q) ||
        r.query?.toLowerCase().includes(q) ||
        r.executiveSummary?.toLowerCase().includes(q),
    );
  }, [reports, search]);

  const handleAdd = async (report: ResearchReport) => {
    if (adding) return;
    setAdding(report.id);
    try {
      const { error } = await addReportToWorkspace(workspaceId, report.id);
      if (!error) {
        setAddedIds(prev => [...prev, report.id]);
        onAdded(report.id);
      }
    } finally {
      setAdding(null);
    }
  };

  const handleClose = () => {
    setSearch('');
    setAddedIds([]);
    onClose();
  };

  const alreadyIn = (id: string) =>
    existingReportIds.includes(id) || addedIds.includes(id);

  const renderItem = ({ item, index }: { item: ResearchReport; index: number }) => {
    const isIn      = alreadyIn(item.id);
    const isAdding  = adding === item.id;
    const dColor    = DEPTH_COLOR[item.depth] ?? COLORS.primary;
    const reliability = item.reliabilityScore ?? 0;
    const relColor  = reliability >= 7 ? COLORS.success : reliability >= 5 ? COLORS.warning : COLORS.error;

    return (
      <Animated.View entering={FadeIn.duration(300).delay(index * 30)}>
        <View style={[styles.reportCard, isIn && styles.reportCardDimmed]}>
          {/* Top row */}
          <View style={styles.cardHeader}>
            <View style={[styles.depthBadge, { backgroundColor: `${dColor}20` }]}>
              <Text style={[styles.depthText, { color: dColor }]}>
                {item.depth?.toUpperCase() ?? 'DEEP'}
              </Text>
            </View>
            <Text style={styles.dateText}>
              {new Date(item.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: '2-digit',
              })}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title ?? item.query}
          </Text>

          {/* Summary */}
          {item.executiveSummary ? (
            <Text style={styles.cardSummary} numberOfLines={2}>
              {item.executiveSummary}
            </Text>
          ) : null}

          {/* Footer */}
          <View style={styles.cardFooter}>
            <View style={styles.cardStats}>
              {(item.sourcesCount ?? 0) > 0 && (
                <View style={styles.stat}>
                  <Ionicons name="link-outline" size={11} color={COLORS.textMuted} />
                  <Text style={styles.statText}>{item.sourcesCount} sources</Text>
                </View>
              )}
              {reliability > 0 && (
                <View style={[styles.stat, { backgroundColor: `${relColor}15` }]}>
                  <Ionicons name="shield-checkmark-outline" size={11} color={relColor} />
                  <Text style={[styles.statText, { color: relColor }]}>
                    {reliability}/10
                  </Text>
                </View>
              )}
            </View>

            {/* Add button */}
            <TouchableOpacity
              onPress={() => !isIn && handleAdd(item)}
              disabled={isIn || !!adding}
              activeOpacity={0.8}
              style={[
                styles.addBtn,
                isIn && styles.addBtnDone,
                !isIn && !adding && { backgroundColor: COLORS.primary },
                !!adding && !isAdding && { opacity: 0.4 },
              ]}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : isIn ? (
                <>
                  <Ionicons name="checkmark-circle" size={15} color={COLORS.success} />
                  <Text style={[styles.addBtnText, { color: COLORS.success }]}>Added</Text>
                </>
              ) : (
                <>
                  <Ionicons name="add-circle-outline" size={15} color="#FFF" />
                  <Text style={styles.addBtnText}>Add</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} onPress={handleClose} activeOpacity={1} />

        <Animated.View entering={SlideInDown.duration(380).springify()} style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Add Report to Workspace</Text>
              <Text style={styles.subtitle}>
                {reports.length} report{reports.length !== 1 ? 's' : ''} in your library
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search reports…"
              placeholderTextColor={COLORS.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} style={{ marginRight: 10 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Loading your reports…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>
                {search ? 'No matching reports' : 'No reports yet'}
              </Text>
              <Text style={styles.emptyDesc}>
                {search
                  ? 'Try a different search term.'
                  : 'Complete a research session first, then come back to add it here.'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              onRefresh={refresh}
              refreshing={refreshing}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: COLORS.backgroundCard,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '88%',
    paddingTop: SPACING.sm,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  title:    { color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' },
  subtitle: { color: COLORS.textMuted,   fontSize: FONTS.sizes.xs, marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.sm,
    paddingVertical: 11,
  },
  loadingWrap: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 60, gap: 12,
  },
  loadingText: { color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  emptyWrap: {
    alignItems: 'center', paddingVertical: 60,
    paddingHorizontal: SPACING.xl, gap: 10,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' },
  emptyDesc:  { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 20 },
  list: { paddingHorizontal: SPACING.xl, paddingBottom: 48 },

  // Report card
  reportCard: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  reportCardDimmed: { opacity: 0.6 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  depthBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  depthText: { fontSize: FONTS.sizes.xs, fontWeight: '800', letterSpacing: 0.5 },
  dateText:  { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: FONTS.sizes.base,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardSummary: {
    color: COLORS.textSecondary,
    fontSize: FONTS.sizes.xs,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardStats: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stat: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: `${COLORS.textMuted}12`,
    borderRadius: RADIUS.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  statText: { color: COLORS.textMuted, fontSize: FONTS.sizes.xs },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14, paddingVertical: 7,
    minWidth: 74, justifyContent: 'center',
  },
  addBtnDone: {
    backgroundColor: `${COLORS.success}15`,
    borderWidth: 1, borderColor: `${COLORS.success}35`,
  },
  addBtnText: { color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '700' },
});