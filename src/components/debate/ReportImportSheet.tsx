// src/components/debate/ReportImportSheet.tsx
// Part 20 — Bottom-sheet report picker for the Debate tab.
//
// Adapted from src/components/podcast/ReportImportSheet.tsx but
// styled for the Debate context and exposes debate-specific UI copy.
//
// Features:
//   • Loads all completed reports from Supabase
//   • Search/filter by title or query
//   • Shows depth badge, sections, sources, reliability
//   • Checkmark on currently selected report
//   • Tap row → fetches full report → calls onSelectReport → closes sheet

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { BlurView }             from 'expo-blur';
import { Ionicons }             from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { supabase }                        from '../../lib/supabase';
import { useAuth }                         from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS }  from '../../constants/theme';
import type { ResearchReport }             from '../../types';

// ─── Local summary type ────────────────────────────────────────────────────────

interface ReportSummary {
  id:               string;
  title:            string;
  query:            string;
  depth:            string;
  sectionsCount:    number;
  sourcesCount:     number;
  reliabilityScore: number;
  keyFindingsCount: number;
  createdAt:        string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReportImportSheetProps {
  visible:           boolean;
  onClose:           () => void;
  onSelectReport:    (report: ResearchReport) => void;
  selectedReportId?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEPTH_COLOR: Record<string, string> = {
  quick:  COLORS.info    ?? '#29B6F6',
  deep:   COLORS.primary,
  expert: COLORS.warning,
};

const DEPTH_LABEL: Record<string, string> = {
  quick:  'Quick',
  deep:   'Deep',
  expert: 'Expert',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
  });
}

function reliabilityColor(score: number) {
  if (score >= 0.8) return COLORS.success;
  if (score >= 0.6) return COLORS.warning;
  return COLORS.error;
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ReportRow({
  report,
  isSelected,
  onPress,
}: {
  report:     ReportSummary;
  isSelected: boolean;
  onPress:    () => void;
}) {
  const depthColor = DEPTH_COLOR[report.depth] ?? COLORS.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection:   'row',
        alignItems:      'center',
        gap:             12,
        padding:         SPACING.md,
        backgroundColor: isSelected
          ? `${COLORS.primary}14`
          : COLORS.backgroundElevated,
        borderRadius:    RADIUS.lg,
        marginBottom:    SPACING.sm,
        borderWidth:     1.5,
        borderColor:     isSelected ? COLORS.primary : COLORS.border,
      }}
    >
      {/* Icon */}
      <View style={{
        width:           46,
        height:          46,
        borderRadius:    14,
        backgroundColor: `${depthColor}18`,
        alignItems:      'center',
        justifyContent:  'center',
        borderWidth:     1,
        borderColor:     `${depthColor}28`,
        flexShrink:      0,
      }}>
        <Ionicons name="document-text" size={22} color={depthColor} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.sm,
            fontWeight: '700',
            lineHeight: 19,
          }}
          numberOfLines={2}
        >
          {report.title}
        </Text>

        {/* Chips row */}
        <View style={{
          flexDirection: 'row',
          flexWrap:      'wrap',
          alignItems:    'center',
          gap:            6,
          marginTop:      5,
        }}>
          <View style={{
            backgroundColor:  `${depthColor}18`,
            borderRadius:     RADIUS.full,
            paddingHorizontal: 7,
            paddingVertical:   2,
          }}>
            <Text style={{ color: depthColor, fontSize: 10, fontWeight: '700' }}>
              {DEPTH_LABEL[report.depth] ?? report.depth}
            </Text>
          </View>

          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {report.sectionsCount} sections
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {report.sourcesCount} sources
          </Text>

          {report.reliabilityScore > 0 && (
            <Text style={{
              color:     reliabilityColor(report.reliabilityScore),
              fontSize:  10,
              fontWeight: '600',
            }}>
              {Math.round(report.reliabilityScore * 100)}% reliable
            </Text>
          )}

          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {formatDate(report.createdAt)}
          </Text>
        </View>
      </View>

      {/* Selection indicator */}
      <View style={{
        width:           26,
        height:          26,
        borderRadius:    13,
        backgroundColor: isSelected ? COLORS.primary : COLORS.backgroundCard,
        alignItems:      'center',
        justifyContent:  'center',
        borderWidth:     1.5,
        borderColor:     isSelected ? COLORS.primary : COLORS.border,
        flexShrink:      0,
      }}>
        {isSelected && <Ionicons name="checkmark" size={14} color="#FFF" />}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReportImportSheet({
  visible,
  onClose,
  onSelectReport,
  selectedReportId,
}: ReportImportSheetProps) {
  const { user } = useAuth();

  const [reports,    setReports]    = useState<ReportSummary[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selecting,  setSelecting]  = useState<string | null>(null);

  // ── Fetch reports list ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible || !user) return;
    fetchReports();
  }, [visible, user]);

  const fetchReports = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('research_reports')
        .select('id, title, query, depth, sections, sources_count, reliability_score, key_findings, created_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const mapped: ReportSummary[] = (data ?? []).map(row => ({
        id:               row.id,
        title:            row.title ?? row.query ?? 'Untitled',
        query:            row.query ?? '',
        depth:            row.depth ?? 'deep',
        sectionsCount:    Array.isArray(row.sections)     ? row.sections.length     : 0,
        sourcesCount:     row.sources_count               ?? 0,
        reliabilityScore: row.reliability_score           ?? 0,
        keyFindingsCount: Array.isArray(row.key_findings) ? row.key_findings.length : 0,
        createdAt:        row.created_at,
      }));

      setReports(mapped);
    } catch (err) {
      console.error('[ReportImportSheet:Debate] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Select report (fetch full) ─────────────────────────────────────────────

  const handleSelect = useCallback(async (summary: ReportSummary) => {
    setSelecting(summary.id);
    try {
      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('id', summary.id)
        .single();

      if (error || !data) {
        console.error('[ReportImportSheet:Debate] full report fetch error:', error);
        return;
      }

      const full: ResearchReport = {
        id:                data.id,
        userId:            data.user_id,
        query:             data.query,
        depth:             data.depth,
        focusAreas:        data.focus_areas        ?? [],
        title:             data.title              ?? data.query,
        executiveSummary:  data.executive_summary  ?? '',
        sections:          data.sections           ?? [],
        keyFindings:       data.key_findings       ?? [],
        futurePredictions: data.future_predictions ?? [],
        citations:         data.citations          ?? [],
        statistics:        data.statistics         ?? [],
        searchQueries:     data.search_queries     ?? [],
        sourcesCount:      data.sources_count      ?? 0,
        reliabilityScore:  data.reliability_score  ?? 0,
        status:            data.status,
        agentLogs:         data.agent_logs         ?? [],
        knowledgeGraph:    data.knowledge_graph    ?? undefined,
        infographicData:   data.infographic_data   ?? undefined,
        sourceImages:      data.source_images      ?? [],
        presentationId:    data.presentation_id    ?? undefined,
        slideCount:        data.slide_count        ?? 0,
        academicPaperId:   data.academic_paper_id  ?? undefined,
        researchMode:      data.research_mode      ?? 'standard',
        createdAt:         data.created_at,
        completedAt:       data.completed_at,
      };

      onSelectReport(full);
      onClose();
    } catch (err) {
      console.error('[ReportImportSheet:Debate] error loading full report:', err);
    } finally {
      setSelecting(null);
    }
  }, [onSelectReport, onClose]);

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!searchText.trim()) return reports;
    const q = searchText.toLowerCase();
    return reports.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.query.toLowerCase().includes(q),
    );
  }, [reports, searchText]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <BlurView
        intensity={20}
        style={{
          flex:            1,
          backgroundColor: 'rgba(10,10,26,0.72)',
          justifyContent:  'flex-end',
        }}
      >
        {/* Tap-outside dismiss */}
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <Animated.View
          entering={FadeInDown.duration(300)}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  28,
            borderTopRightRadius: 28,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
            maxHeight:            '82%',
          }}
        >
          {/* Handle */}
          <View style={{
            width:          40, height: 4, borderRadius: 2,
            backgroundColor: COLORS.border,
            alignSelf:      'center', marginTop: SPACING.sm, marginBottom: SPACING.md,
          }} />

          {/* Header */}
          <View style={{
            flexDirection:     'row', alignItems: 'center',
            justifyContent:    'space-between',
            paddingHorizontal: SPACING.xl, marginBottom: SPACING.md,
          }}>
            <View>
              <Text style={{
                color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800',
              }}>
                Import from Research
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 3 }}>
                Ground debate agents in verified facts & data
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 1, borderColor: COLORS.border,
              }}
            >
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Info banner */}
          <View style={{
            flexDirection:     'row', alignItems: 'flex-start', gap: 10,
            backgroundColor:   `${COLORS.primary}10`,
            borderRadius:      RADIUS.lg, padding: SPACING.md,
            marginHorizontal:  SPACING.xl, marginBottom: SPACING.md,
            borderWidth:       1, borderColor: `${COLORS.primary}28`,
          }}>
            <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
            <Text style={{
              flex: 1, color: COLORS.textSecondary,
              fontSize: FONTS.sizes.xs, lineHeight: 18,
            }}>
              Agents will use this report's findings, statistics, and sources as
              a foundation, then also search the web for the latest information.
            </Text>
          </View>

          {/* Search */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
            paddingHorizontal: SPACING.md, paddingVertical: 10,
            marginHorizontal: SPACING.xl, marginBottom: SPACING.md, gap: 8,
          }}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search reports..."
              placeholderTextColor={COLORS.textMuted}
              style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.sm }}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* List */}
          {loading ? (
            <View style={{
              alignItems: 'center', justifyContent: 'center',
              paddingVertical: SPACING.xl * 2,
            }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: SPACING.md }}>
                Loading reports…
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{
              alignItems: 'center', paddingVertical: SPACING.xl * 2,
              paddingHorizontal: SPACING.xl,
            }}>
              <Ionicons name="document-text-outline" size={42} color={COLORS.border} />
              <Text style={{
                color: COLORS.textSecondary, fontSize: FONTS.sizes.base,
                fontWeight: '600', marginTop: SPACING.md, textAlign: 'center',
              }}>
                {searchText ? 'No reports match your search' : 'No completed reports yet'}
              </Text>
              <Text style={{
                color: COLORS.textMuted, fontSize: FONTS.sizes.sm,
                marginTop: SPACING.sm, textAlign: 'center', lineHeight: 20,
              }}>
                {searchText
                  ? 'Try a different search term'
                  : 'Generate a research report first to use it as debate context'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              contentContainerStyle={{
                paddingHorizontal: SPACING.xl,
                paddingBottom:     SPACING.xl * 2,
              }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ opacity: selecting && selecting !== item.id ? 0.5 : 1 }}>
                  {selecting === item.id ? (
                    <View style={{
                      flexDirection:   'row',
                      alignItems:      'center',
                      gap:             12,
                      padding:         SPACING.md,
                      backgroundColor: `${COLORS.primary}14`,
                      borderRadius:    RADIUS.lg,
                      marginBottom:    SPACING.sm,
                      borderWidth:     1.5,
                      borderColor:     COLORS.primary,
                    }}>
                      <ActivityIndicator size="small" color={COLORS.primary} />
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>
                        Loading report…
                      </Text>
                    </View>
                  ) : (
                    <ReportRow
                      report={item}
                      isSelected={item.id === selectedReportId}
                      onPress={() => handleSelect(item)}
                    />
                  )}
                </View>
              )}
            />
          )}
        </Animated.View>
      </BlurView>
    </Modal>
  );
}