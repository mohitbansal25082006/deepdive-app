// src/components/podcast/ReportImportSheet.tsx
// Part 19 — NEW component: bottom sheet for importing a research report
// into the podcast creation form. Lets users pick any completed report
// from their history to use as the podcast's knowledge base.
//
// Features:
//   • Pulls all completed reports from Supabase
//   • Search/filter by title or query
//   • Shows report stats (sections, sources, reliability)
//   • Selected report displayed as a dismissible chip in the create form
//   • Import clears when user manually types a different topic

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
}                                 from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
}                                 from 'react-native';
import { BlurView }               from 'expo-blur';
import { Ionicons }               from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
}                                 from 'react-native-reanimated';
import { supabase }               from '../../lib/supabase';
import { useAuth }                from '../../context/AuthContext';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { ResearchReport }    from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportSummary {
  id:               string;
  title:            string;
  query:            string;
  depth:            string;
  sectionsCount:    number;
  sourcesCount:     number;
  reliabilityScore: number;
  createdAt:        string;
}

interface ReportImportSheetProps {
  visible:           boolean;
  onClose:           () => void;
  onSelectReport:    (report: ResearchReport) => void;
  selectedReportId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEPTH_COLOR: Record<string, string> = {
  quick:  COLORS.info,
  deep:   COLORS.primary,
  expert: COLORS.warning,
};

const DEPTH_LABEL: Record<string, string> = {
  quick:  'Quick',
  deep:   'Deep',
  expert: 'Expert',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit',
  });
}

// ─── Report Row ───────────────────────────────────────────────────────────────

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
          ? `${COLORS.primary}15`
          : COLORS.backgroundElevated,
        borderRadius:    RADIUS.lg,
        marginBottom:    SPACING.sm,
        borderWidth:     1.5,
        borderColor:     isSelected ? COLORS.primary : COLORS.border,
      }}
    >
      {/* Icon */}
      <View style={{
        width:           44,
        height:          44,
        borderRadius:    13,
        backgroundColor: `${depthColor}18`,
        alignItems:      'center',
        justifyContent:  'center',
        borderWidth:     1,
        borderColor:     `${depthColor}28`,
        flexShrink:      0,
      }}>
        <Ionicons
          name="document-text"
          size={20}
          color={depthColor}
        />
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
        <View style={{
          flexDirection:  'row',
          alignItems:     'center',
          gap:            8,
          marginTop:      5,
          flexWrap:       'wrap',
        }}>
          <View style={{
            backgroundColor: `${depthColor}15`,
            borderRadius:    RADIUS.full,
            paddingHorizontal: 7,
            paddingVertical:   2,
          }}>
            <Text style={{ color: depthColor, fontSize: 10, fontWeight: '700' }}>
              {DEPTH_LABEL[report.depth]}
            </Text>
          </View>

          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {report.sectionsCount} sections
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {report.sourcesCount} sources
          </Text>
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
        {isSelected && (
          <Ionicons name="checkmark" size={14} color="#FFF" />
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReportImportSheet({
  visible,
  onClose,
  onSelectReport,
  selectedReportId,
}: ReportImportSheetProps) {
  const { user }                        = useAuth();
  const [reports,    setReports]        = useState<ReportSummary[]>([]);
  const [loading,    setLoading]        = useState(false);
  const [searchText, setSearchText]     = useState('');

  // Fetch reports when sheet opens
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
        .select('id, title, query, depth, sections, sources_count, reliability_score, created_at, status')
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
        sectionsCount:    Array.isArray(row.sections) ? row.sections.length : 0,
        sourcesCount:     row.sources_count ?? 0,
        reliabilityScore: row.reliability_score ?? 0,
        createdAt:        row.created_at,
      }));

      setReports(mapped);
    } catch (err) {
      console.error('[ReportImportSheet] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch full report when selected
  const handleSelect = useCallback(async (summary: ReportSummary) => {
    try {
      const { data, error } = await supabase
        .from('research_reports')
        .select('*')
        .eq('id', summary.id)
        .single();

      if (error || !data) {
        console.error('[ReportImportSheet] full report fetch error:', error);
        return;
      }

      const fullReport: ResearchReport = {
        id:                data.id,
        userId:            data.user_id,
        query:             data.query,
        depth:             data.depth,
        focusAreas:        data.focus_areas ?? [],
        title:             data.title ?? data.query,
        executiveSummary:  data.executive_summary ?? '',
        sections:          data.sections ?? [],
        keyFindings:       data.key_findings ?? [],
        futurePredictions: data.future_predictions ?? [],
        citations:         data.citations ?? [],
        statistics:        data.statistics ?? [],
        searchQueries:     data.search_queries ?? [],
        sourcesCount:      data.sources_count ?? 0,
        reliabilityScore:  data.reliability_score ?? 0,
        status:            data.status,
        agentLogs:         data.agent_logs ?? [],
        knowledgeGraph:    data.knowledge_graph ?? undefined,
        infographicData:   data.infographic_data ?? undefined,
        sourceImages:      data.source_images ?? [],
        presentationId:    data.presentation_id ?? undefined,
        slideCount:        data.slide_count ?? 0,
        academicPaperId:   data.academic_paper_id ?? undefined,
        researchMode:      data.research_mode ?? 'standard',
        createdAt:         data.created_at,
        completedAt:       data.completed_at,
      };

      onSelectReport(fullReport);
      onClose();
    } catch (err) {
      console.error('[ReportImportSheet] error loading full report:', err);
    }
  }, [onSelectReport, onClose]);

  // Filter reports by search
  const filtered = useMemo(() => {
    if (!searchText.trim()) return reports;
    const q = searchText.toLowerCase();
    return reports.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.query.toLowerCase().includes(q)
    );
  }, [reports, searchText]);

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
          backgroundColor: 'rgba(10,10,26,0.7)',
          justifyContent:  'flex-end',
        }}
      >
        {/* Tap outside to close */}
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          entering={FadeInDown.duration(300)}
          style={{
            backgroundColor:      COLORS.backgroundCard,
            borderTopLeftRadius:  28,
            borderTopRightRadius: 28,
            borderTopWidth:       1,
            borderTopColor:       COLORS.border,
            maxHeight:            '80%',
          }}
        >
          {/* Handle */}
          <View style={{
            width:           40,
            height:          4,
            borderRadius:    2,
            backgroundColor: COLORS.border,
            alignSelf:       'center',
            marginTop:       SPACING.sm,
            marginBottom:    SPACING.md,
          }} />

          {/* Header */}
          <View style={{
            flexDirection:    'row',
            alignItems:       'center',
            justifyContent:   'space-between',
            paddingHorizontal: SPACING.xl,
            marginBottom:      SPACING.md,
          }}>
            <View>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.lg,
                fontWeight: '800',
              }}>
                Import from Research
              </Text>
              <Text style={{
                color:     COLORS.textMuted,
                fontSize:  FONTS.sizes.xs,
                marginTop: 3,
              }}>
                Select a report to ground your podcast in real data
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width:           36,
                height:          36,
                borderRadius:    10,
                backgroundColor: COLORS.backgroundElevated,
                alignItems:      'center',
                justifyContent:  'center',
                borderWidth:     1,
                borderColor:     COLORS.border,
              }}
            >
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={{
            flexDirection:    'row',
            alignItems:       'center',
            backgroundColor:  COLORS.backgroundElevated,
            borderRadius:     RADIUS.lg,
            borderWidth:      1,
            borderColor:      COLORS.border,
            paddingHorizontal: SPACING.md,
            paddingVertical:   10,
            marginHorizontal:  SPACING.xl,
            marginBottom:      SPACING.md,
            gap:               8,
          }}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search reports..."
              placeholderTextColor={COLORS.textMuted}
              style={{
                flex:      1,
                color:     COLORS.textPrimary,
                fontSize:  FONTS.sizes.sm,
              }}
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
              alignItems:    'center',
              justifyContent:'center',
              paddingVertical: SPACING.xl * 2,
            }}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={{
                color:     COLORS.textMuted,
                fontSize:  FONTS.sizes.sm,
                marginTop: SPACING.md,
              }}>
                Loading reports...
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={{
              alignItems:     'center',
              paddingVertical: SPACING.xl * 2,
              paddingHorizontal: SPACING.xl,
            }}>
              <Ionicons
                name="document-text-outline"
                size={40}
                color={COLORS.border}
              />
              <Text style={{
                color:      COLORS.textSecondary,
                fontSize:   FONTS.sizes.base,
                fontWeight: '600',
                marginTop:  SPACING.md,
                textAlign:  'center',
              }}>
                {searchText ? 'No reports match your search' : 'No completed reports yet'}
              </Text>
              <Text style={{
                color:      COLORS.textMuted,
                fontSize:   FONTS.sizes.sm,
                marginTop:  SPACING.sm,
                textAlign:  'center',
                lineHeight: 20,
              }}>
                {searchText
                  ? 'Try a different search term'
                  : 'Generate a research report first, then come back to create a podcast from it'
                }
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
                <ReportRow
                  report={item}
                  isSelected={item.id === selectedReportId}
                  onPress={() => handleSelect(item)}
                />
              )}
            />
          )}
        </Animated.View>
      </BlurView>
    </Modal>
  );
}