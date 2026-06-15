// src/components/workspace/ExportBundleModal.tsx
// Part 52.1 — Advanced Workspace Export picker (Settings only).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS
//   A full-height bottom-sheet modal that replaces the old one-tap
//   "Export as PDF Bundle". The owner/editor can tick ANY combination of:
//     • Research reports        → full PDF each
//     • Presentations           → .pptx each
//     • Academic papers         → full PDF each
//     • Debates                 → full PDF each
//     • Podcasts                → .mp3 each
//     • Voice debates           → .mp3 each
//   …then taps Export → everything is bundled into ONE .zip and shared.
//
// BEHAVIOUR
//   • Opens deferred: the heavy item fetch (useWorkspaceBundleItems) only runs
//     once this modal is mounted with `visible=true` (enabled flips true).
//   • Per-kind collapsible sections with a select-all-in-section header toggle.
//   • A global "Select all" / "Clear" control + a live selected counter.
//   • Filter chips to focus on one kind at a time.
//   • During export: a progress overlay with phase + count; the sheet can't be
//     dismissed mid-export.
//   • On completion: success toast-row; if some items failed, a non-blocking
//     warning listing what couldn't be exported (the rest still bundled).
//
// IT DOES NOT
//   • Touch any standalone/original export. It only calls
//     exportWorkspaceBundle() from workspaceBundleExportService.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, ActivityIndicator,
  TouchableOpacity, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { SafeAreaView }   from 'react-native-safe-area-context';

import { useWorkspaceBundleItems, type BundleItemGroups } from '../../hooks/useWorkspaceBundleItems';
import {
  exportWorkspaceBundle,
  type BundleSelectableItem,
  type BundleItemKind,
  type BundleProgress,
  type BundleExportResult,
} from '../../services/workspaceBundleExportService';
import type { Workspace } from '../../types';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';

// ─── Per-kind display config ──────────────────────────────────────────────────

interface KindMeta {
  kind:    BundleItemKind;
  label:   string;          // plural section title
  icon:    string;
  color:   string;
  format:  string;          // file format hint shown in the row
}

const KIND_META: KindMeta[] = [
  { kind: 'report',         label: 'Reports',        icon: 'document-text', color: COLORS.primary, format: 'PDF'  },
  { kind: 'presentation',   label: 'Presentations',  icon: 'easel',         color: '#8B5CF6',       format: 'PPTX' },
  { kind: 'academic_paper', label: 'Academic Papers',icon: 'school',        color: COLORS.success,  format: 'PDF'  },
  { kind: 'debate',         label: 'Debates',        icon: 'people',        color: '#FF6584',       format: 'PDF'  },
  { kind: 'podcast',        label: 'Podcasts',       icon: 'mic',           color: '#29B6F6',       format: 'MP3'  },
  { kind: 'voice_debate',   label: 'Voice Debates',  icon: 'recording',     color: '#F59E0B',       format: 'MP3'  },
];

function itemsForKind(groups: BundleItemGroups, kind: BundleItemKind): BundleSelectableItem[] {
  switch (kind) {
    case 'report':         return groups.reports;
    case 'presentation':   return groups.presentations;
    case 'academic_paper': return groups.papers;
    case 'debate':         return groups.debates;
    case 'podcast':        return groups.podcasts;
    case 'voice_debate':   return groups.voiceDebates;
    default:               return [];
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  visible:     boolean;
  workspace:   Workspace;
  onClose:     () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportBundleModal({ visible, workspace, onClose }: Props) {
  // Deferred load: only fetch items while the modal is open.
  const { groups, allItems, totalCount, isLoading, hasLoaded, error, reload } =
    useWorkspaceBundleItems(workspace.id, visible);

  // Selection — set of item keys.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Active filter chip (null = show all sections).
  const [filter, setFilter] = useState<BundleItemKind | null>(null);

  // Collapsed sections.
  const [collapsed, setCollapsed] = useState<Set<BundleItemKind>>(new Set());

  // Export state.
  const [isExporting, setIsExporting] = useState(false);
  const [progress,    setProgress]    = useState<BundleProgress | null>(null);
  const [result,      setResult]      = useState<BundleExportResult | null>(null);

  // Reset selection + result whenever the modal opens fresh.
  useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setResult(null);
      setProgress(null);
      setFilter(null);
    }
  }, [visible]);

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleItem = useCallback((key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else               next.add(key);
      return next;
    });
  }, []);

  const isSectionAllSelected = useCallback((kind: BundleItemKind): boolean => {
    const items = itemsForKind(groups, kind);
    return items.length > 0 && items.every(i => selected.has(i.key));
  }, [groups, selected]);

  const toggleSection = useCallback((kind: BundleItemKind) => {
    const items = itemsForKind(groups, kind);
    if (items.length === 0) return;
    const allSelected = items.every(i => selected.has(i.key));
    setSelected(prev => {
      const next = new Set(prev);
      for (const i of items) {
        if (allSelected) next.delete(i.key);
        else             next.add(i.key);
      }
      return next;
    });
  }, [groups, selected]);

  const selectAll = useCallback(() => {
    setSelected(new Set(allItems.map(i => i.key)));
  }, [allItems]);

  const clearAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const toggleCollapse = useCallback((kind: BundleItemKind) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else                next.add(kind);
      return next;
    });
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedCount = selected.size;

  const selectedItems = useMemo(
    () => allItems.filter(i => selected.has(i.key)),
    [allItems, selected],
  );

  const visibleKinds = useMemo(
    () => KIND_META.filter(m => {
      if (filter && m.kind !== filter) return false;
      return itemsForKind(groups, m.kind).length > 0;
    }),
    [groups, filter],
  );

  // Counts per kind for the filter chips.
  const kindCounts = useMemo(() => {
    const map: Record<BundleItemKind, number> = {
      report: 0, presentation: 0, academic_paper: 0, debate: 0, podcast: 0, voice_debate: 0,
    };
    for (const m of KIND_META) map[m.kind] = itemsForKind(groups, m.kind).length;
    return map;
  }, [groups]);

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (selectedItems.length === 0 || isExporting) return;
    setIsExporting(true);
    setResult(null);
    setProgress({ phase: 'rendering', current: 0, total: selectedItems.length, label: 'Starting…' });

    try {
      const res = await exportWorkspaceBundle(
        workspace,
        selectedItems,
        (p) => setProgress(p),
      );
      setResult(res);
      if (!res.success && res.error) {
        Alert.alert('Export Failed', res.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setResult({ success: false, fileCount: 0, failures: [], error: msg });
      Alert.alert('Export Failed', msg);
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  }, [selectedItems, isExporting, workspace]);

  const handleClose = useCallback(() => {
    if (isExporting) return; // can't dismiss mid-export
    onClose();
  }, [isExporting, onClose]);

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderProgressLabel = (p: BundleProgress): string => {
    switch (p.phase) {
      case 'fetching':  return 'Fetching content…';
      case 'rendering': return p.label || `Preparing ${p.current}/${p.total}…`;
      case 'zipping':   return 'Building zip archive…';
      case 'sharing':   return 'Opening share sheet…';
      default:          return 'Working…';
    }
  };

  // ───────────────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        {/* Tap-outside to dismiss (disabled mid-export) */}
        <Pressable style={{ flex: 1 }} onPress={handleClose} />

        <Animated.View
          entering={FadeInUp.duration(260)}
          style={{
            maxHeight: '90%',
            backgroundColor: COLORS.background,
            borderTopLeftRadius:  RADIUS.xl,
            borderTopRightRadius: RADIUS.xl,
            borderWidth: 1,
            borderColor: COLORS.border,
            overflow: 'hidden',
          }}
        >
          <SafeAreaView edges={['bottom']} style={{ flex: 0 }}>
            {/* ── Header ───────────────────────────────────────────────────── */}
            <View style={{ paddingTop: SPACING.sm }}>
              <View style={{ alignItems: 'center', paddingBottom: SPACING.sm }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border }} />
              </View>

              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
                paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm,
              }}>
                <LinearGradient
                  colors={['#6C63FF', '#8B5CF6']}
                  style={{
                    width: 40, height: 40, borderRadius: 12,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons name="archive" size={20} color="#FFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>
                    Export Bundle
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    Pick what to include — downloads as one .zip
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  disabled={isExporting}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    backgroundColor: COLORS.backgroundElevated,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: isExporting ? 0.4 : 1,
                  }}
                >
                  <Ionicons name="close" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Filter chips + select-all bar ────────────────────────────── */}
            {hasLoaded && totalCount > 0 && (
              <View style={{ paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8, paddingBottom: 4 }}
                >
                  <FilterChip
                    label="All"
                    count={totalCount}
                    active={filter === null}
                    color={COLORS.primary}
                    onPress={() => setFilter(null)}
                  />
                  {KIND_META.filter(m => kindCounts[m.kind] > 0).map(m => (
                    <FilterChip
                      key={m.kind}
                      label={m.label}
                      count={kindCounts[m.kind]}
                      active={filter === m.kind}
                      color={m.color}
                      onPress={() => setFilter(filter === m.kind ? null : m.kind)}
                    />
                  ))}
                </ScrollView>

                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: SPACING.lg, marginTop: 6,
                }}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                    {selectedCount} selected
                  </Text>
                  <View style={{ flexDirection: 'row', gap: SPACING.md }}>
                    <TouchableOpacity onPress={selectAll} disabled={isExporting}>
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                        Select all
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={clearAll} disabled={isExporting || selectedCount === 0}>
                      <Text style={{
                        color: selectedCount === 0 ? COLORS.textMuted : COLORS.textSecondary,
                        fontSize: FONTS.sizes.xs, fontWeight: '700',
                      }}>
                        Clear
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* ── Body ─────────────────────────────────────────────────────── */}
            <ScrollView
              style={{ maxHeight: 460 }}
              contentContainerStyle={{ padding: SPACING.lg, paddingTop: SPACING.md }}
              showsVerticalScrollIndicator={false}
            >
              {/* Loading */}
              {isLoading && !hasLoaded && (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.md }}>
                    Loading exportable content…
                  </Text>
                </View>
              )}

              {/* Error */}
              {error && !isLoading && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="alert-circle-outline" size={40} color={COLORS.error} />
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginTop: SPACING.md, textAlign: 'center' }}>
                    {error}
                  </Text>
                  <TouchableOpacity
                    onPress={reload}
                    style={{ marginTop: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 22, paddingVertical: 10 }}
                  >
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.sm }}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Empty */}
              {hasLoaded && !error && totalCount === 0 && (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <View style={{
                    width: 64, height: 64, borderRadius: 20,
                    backgroundColor: COLORS.backgroundElevated,
                    alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md,
                  }}>
                    <Ionicons name="folder-open-outline" size={30} color={COLORS.textMuted} />
                  </View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Nothing to export yet
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 4, textAlign: 'center', lineHeight: 18, paddingHorizontal: SPACING.lg }}>
                    Add reports or share presentations, papers, podcasts, debates, or voice debates into this workspace first.
                  </Text>
                </View>
              )}

              {/* Sections */}
              {hasLoaded && !error && totalCount > 0 && visibleKinds.map((m) => {
                const items = itemsForKind(groups, m.kind);
                const isCollapsed = collapsed.has(m.kind);
                const allSel = isSectionAllSelected(m.kind);
                const someSel = items.some(i => selected.has(i.key));

                return (
                  <View key={m.kind} style={{ marginBottom: SPACING.md }}>
                    {/* Section header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                      <TouchableOpacity
                        onPress={() => toggleCollapse(m.kind)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                        activeOpacity={0.7}
                      >
                        <View style={{
                          width: 28, height: 28, borderRadius: 8,
                          backgroundColor: `${m.color}18`,
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 1, borderColor: `${m.color}30`,
                        }}>
                          <Ionicons name={m.icon as any} size={14} color={m.color} />
                        </View>
                        <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                          {m.label}
                        </Text>
                        <View style={{
                          backgroundColor: COLORS.backgroundElevated,
                          borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 1,
                        }}>
                          <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '700' }}>
                            {items.length}
                          </Text>
                        </View>
                        <View style={{
                          backgroundColor: `${m.color}12`,
                          borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 1,
                          borderWidth: 1, borderColor: `${m.color}25`,
                        }}>
                          <Text style={{ color: m.color, fontSize: 9, fontWeight: '700' }}>
                            {m.format}
                          </Text>
                        </View>
                        <Ionicons
                          name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                          size={14}
                          color={COLORS.textMuted}
                        />
                      </TouchableOpacity>

                      {/* Section select-all toggle */}
                      <TouchableOpacity
                        onPress={() => toggleSection(m.kind)}
                        disabled={isExporting}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ paddingLeft: SPACING.sm }}
                      >
                        <Text style={{
                          color: allSel ? m.color : COLORS.textMuted,
                          fontSize: FONTS.sizes.xs, fontWeight: '700',
                        }}>
                          {allSel ? 'Deselect' : 'All'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Section items */}
                    {!isCollapsed && items.map((item) => {
                      const checked = selected.has(item.key);
                      return (
                        <TouchableOpacity
                          key={item.key}
                          onPress={() => toggleItem(item.key)}
                          disabled={isExporting}
                          activeOpacity={0.7}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
                            backgroundColor: checked ? `${m.color}10` : COLORS.backgroundCard,
                            borderRadius: RADIUS.lg,
                            paddingVertical: 10, paddingHorizontal: SPACING.md,
                            marginBottom: 6,
                            borderWidth: 1,
                            borderColor: checked ? `${m.color}40` : COLORS.border,
                          }}
                        >
                          {/* Checkbox */}
                          <View style={{
                            width: 22, height: 22, borderRadius: 7,
                            backgroundColor: checked ? m.color : 'transparent',
                            borderWidth: 2,
                            borderColor: checked ? m.color : COLORS.border,
                            alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            {checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                          </View>

                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}
                              numberOfLines={1}
                            >
                              {item.title}
                            </Text>
                            {item.subtitle ? (
                              <Text
                                style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}
                                numberOfLines={1}
                              >
                                {item.subtitle}
                              </Text>
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}

              {/* Failure summary after an export run */}
              {result && result.failures.length > 0 && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  style={{
                    backgroundColor: `${COLORS.warning}12`,
                    borderRadius: RADIUS.lg,
                    borderWidth: 1, borderColor: `${COLORS.warning}30`,
                    padding: SPACING.md, marginTop: SPACING.sm,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons name="warning-outline" size={15} color={COLORS.warning} />
                    <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>
                      {result.failures.length} item{result.failures.length !== 1 ? 's' : ''} couldn't be exported
                    </Text>
                  </View>
                  {result.failures.slice(0, 5).map(f => (
                    <Text key={f.key} style={{ color: COLORS.textMuted, fontSize: 11, lineHeight: 16 }}>
                      • {f.title} — {f.reason}
                    </Text>
                  ))}
                  {result.failures.length > 5 && (
                    <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                      …and {result.failures.length - 5} more
                    </Text>
                  )}
                </Animated.View>
              )}

              {/* Success row */}
              {result && result.success && result.failures.length === 0 && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  style={{
                    backgroundColor: `${COLORS.success}12`,
                    borderRadius: RADIUS.lg,
                    borderWidth: 1, borderColor: `${COLORS.success}30`,
                    padding: SPACING.md, marginTop: SPACING.sm,
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                  }}
                >
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                  <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs, fontWeight: '700', flex: 1 }}>
                    Bundled {result.fileCount} file{result.fileCount !== 1 ? 's' : ''} into a zip.
                  </Text>
                </Animated.View>
              )}
            </ScrollView>

            {/* ── Footer / Export button ───────────────────────────────────── */}
            <View style={{
              padding: SPACING.lg, paddingTop: SPACING.md,
              borderTopWidth: 1, borderTopColor: COLORS.border,
            }}>
              <Pressable
                onPress={handleExport}
                disabled={selectedCount === 0 || isExporting}
                style={{ opacity: selectedCount === 0 || isExporting ? 0.5 : 1 }}
              >
                <LinearGradient
                  colors={['#6C63FF', '#8B5CF6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: RADIUS.lg, paddingVertical: 15,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, ...SHADOWS.medium,
                  }}
                >
                  {isExporting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Ionicons name="download" size={18} color="#FFF" />
                  )}
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                    {isExporting
                      ? (progress ? renderProgressLabel(progress) : 'Exporting…')
                      : selectedCount > 0
                        ? `Export ${selectedCount} as .zip`
                        : 'Select items to export'}
                  </Text>
                </LinearGradient>
              </Pressable>

              {/* Progress sub-line during rendering */}
              {isExporting && progress && progress.phase === 'rendering' && progress.total > 0 && (
                <View style={{ marginTop: SPACING.sm }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: COLORS.backgroundElevated, overflow: 'hidden' }}>
                    <View style={{
                      height: '100%',
                      width: `${Math.round((progress.current / progress.total) * 100)}%`,
                      backgroundColor: COLORS.primary,
                      borderRadius: 2,
                    }} />
                  </View>
                  <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 5, textAlign: 'center' }}>
                    {progress.current}/{progress.total} prepared
                  </Text>
                </View>
              )}
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  label, count, active, color, onPress,
}: {
  label: string; count: number; active: boolean; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: active ? `${color}1A` : COLORS.backgroundCard,
        borderRadius: RADIUS.full,
        paddingHorizontal: 12, paddingVertical: 6,
        borderWidth: 1,
        borderColor: active ? `${color}50` : COLORS.border,
        flexShrink: 0,
      }}
    >
      <Text style={{ color: active ? color : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
        {label}
      </Text>
      <View style={{
        backgroundColor: active ? color : COLORS.backgroundElevated,
        borderRadius: RADIUS.full, minWidth: 18, paddingHorizontal: 5, paddingVertical: 1,
        alignItems: 'center',
      }}>
        <Text style={{ color: active ? '#FFF' : COLORS.textMuted, fontSize: 9, fontWeight: '800' }}>
          {count}
        </Text>
      </View>
    </TouchableOpacity>
  );
}