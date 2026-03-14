// app/(app)/slide-preview.tsx
// Part 14 — Added "Share to Workspace" button in the preview export bar.
// All other functionality unchanged from Part 5.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }                       from '../../src/lib/supabase';
import { SlidePreviewPanel }              from '../../src/components/research/SlidePreviewPanel';
import { LoadingOverlay }                 from '../../src/components/common/LoadingOverlay';
import { ShareToWorkspaceModal }          from '../../src/components/workspace/ShareToWorkspaceModal';
import { useSlideGenerator }              from '../../src/hooks/useSlideGenerator';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import type { ResearchReport, PresentationTheme } from '../../src/types';

const { width: SCREEN_W } = Dimensions.get('window');

interface ThemeOption {
  id:      PresentationTheme;
  label:   string;
  desc:    string;
  icon:    string;
  colors:  readonly [string, string];
  preview: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'dark',      label: 'Dark Pro',    desc: 'Deep space — our signature look',  icon: 'moon-outline',      colors: ['#6C63FF', '#8B5CF6'], preview: '#0A0A1A' },
  { id: 'light',     label: 'Clean Light', desc: 'Airy white — great for sharing',   icon: 'sunny-outline',     colors: ['#6C63FF', '#4FACFE'], preview: '#F8F7FF' },
  { id: 'corporate', label: 'Corporate',   desc: 'Classic blue — boardroom ready',   icon: 'briefcase-outline', colors: ['#0052CC', '#4FACFE'], preview: '#F0F4F8' },
  { id: 'vibrant',   label: 'Vibrant',     desc: 'Bold pink — stand out instantly',  icon: 'sparkles-outline',  colors: ['#FF6584', '#F093FB'], preview: '#0D0D2B' },
];

// ─── Generating animation ─────────────────────────────────────────────────────

function GeneratingView({ progress }: { progress: string }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 800, easing: Easing.out(Easing.ease) }),
        withTiming(1.0,  { duration: 800, easing: Easing.in(Easing.ease)  }),
      ),
      -1, false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const steps = [
    { label: 'Reading report content',    icon: 'document-text-outline' },
    { label: 'Designing slide structure', icon: 'grid-outline'          },
    { label: 'Writing slide content',     icon: 'pencil-outline'        },
    { label: 'Applying theme & styling',  icon: 'color-palette-outline' },
    { label: 'Saving presentation',       icon: 'cloud-upload-outline'  },
  ];

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.lg }}>
      <Animated.View style={[animStyle, { marginBottom: SPACING.xl }]}>
        <LinearGradient
          colors={['#6C63FF', '#8B5CF6']}
          style={{
            width: 88, height: 88, borderRadius: 26,
            alignItems: 'center', justifyContent: 'center', ...SHADOWS.large,
          }}
        >
          <Ionicons name="easel-outline" size={40} color="#FFF" />
        </LinearGradient>
      </Animated.View>

      <Animated.Text
        entering={FadeInDown.duration(300)}
        style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800', marginBottom: SPACING.sm, textAlign: 'center' }}
      >
        Generating Slides
      </Animated.Text>

      <Animated.Text
        entering={FadeInDown.duration(300).delay(60)}
        style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING['2xl'], textAlign: 'center', minHeight: 20 }}
      >
        {progress}
      </Animated.Text>

      <Animated.View entering={FadeInDown.duration(400).delay(120)} style={{ width: '100%', gap: SPACING.sm }}>
        {steps.map((step, i) => (
          <View key={i} style={{
            flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
            backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
            padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
          }}>
            <View style={{
              width: 34, height: 34, borderRadius: 10,
              backgroundColor: `${COLORS.primary}18`,
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Ionicons name={step.icon as any} size={16} color={COLORS.primary} />
            </View>
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, flex: 1 }}>
              {step.label}
            </Text>
            <ActivityIndicator size="small" color={`${COLORS.primary}60`} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SlidePreviewScreen() {
  const { reportId, presentationId: paramPresentationId } = useLocalSearchParams<{
    reportId: string;
    presentationId?: string;
  }>();
  const insets = useSafeAreaInsets();

  const [report,        setReport]        = useState<ResearchReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [selectedTheme, setSelectedTheme] = useState<PresentationTheme>('dark');
  const [screenPhase,   setScreenPhase]   = useState<'setup' | 'generating' | 'preview'>('setup');

  // Part 14: Share to workspace modal
  const [showShareModal, setShowShareModal] = useState(false);

  const {
    presentation, isGenerating, isExporting, exportFormat,
    progress, error, generate, loadPresentation,
    exportPPTX, exportPDF, exportHTML, deletePresentation,
  } = useSlideGenerator(report);

  useEffect(() => { if (reportId) loadReport(); }, [reportId]);

  useEffect(() => {
    if (isGenerating) { setScreenPhase('generating'); return; }
    if (presentation)  { setScreenPhase('preview');    return; }
  }, [isGenerating, presentation]);

  useEffect(() => {
    if (paramPresentationId && !presentation) loadPresentation(paramPresentationId);
  }, [paramPresentationId]);

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      const { data, error: dbErr } = await supabase
        .from('research_reports').select('*').eq('id', reportId).single();

      if (dbErr || !data) { Alert.alert('Error', 'Could not load report.'); router.back(); return; }

      const mapped: ResearchReport = {
        id: data.id, userId: data.user_id, query: data.query, depth: data.depth,
        focusAreas: data.focus_areas ?? [], title: data.title ?? data.query,
        executiveSummary: data.executive_summary ?? '', sections: data.sections ?? [],
        keyFindings: data.key_findings ?? [], futurePredictions: data.future_predictions ?? [],
        citations: data.citations ?? [], statistics: data.statistics ?? [],
        searchQueries: data.search_queries ?? [], sourcesCount: data.sources_count ?? 0,
        reliabilityScore: data.reliability_score ?? 0, status: data.status,
        agentLogs: data.agent_logs ?? [], knowledgeGraph: data.knowledge_graph ?? undefined,
        infographicData: data.infographic_data ?? undefined, sourceImages: data.source_images ?? [],
        presentationId: data.presentation_id ?? undefined, slideCount: data.slide_count ?? 0,
        createdAt: data.created_at, completedAt: data.completed_at,
      };
      setReport(mapped);
      if (data.presentation_id) await loadPresentation(data.presentation_id);
    } catch (err) {
      console.error('[SlidePreview] loadReport error:', err);
    } finally {
      setLoadingReport(false);
    }
  };

  const handleBack       = useCallback(() => router.back(), []);
  const handleGenerate   = useCallback(() => {
    if (!report || isGenerating) return;
    generate(selectedTheme);
  }, [report, selectedTheme, generate, isGenerating]);

  const handleRegenerate = useCallback(() => {
    Alert.alert('Regenerate Presentation', 'This will replace the current slides. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          await deletePresentation();
          setScreenPhase('setup');
          generate(selectedTheme);
        },
      },
    ]);
  }, [generate, selectedTheme, deletePresentation]);

  if (loadingReport) return <LoadingOverlay visible message="Loading report…" />;

  // ── PREVIEW MODE ──────────────────────────────────────────────────────────

  if (screenPhase === 'preview' && presentation) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <SlidePreviewPanel presentation={presentation} onClose={() => setScreenPhase('setup')} />

          <View style={{
            paddingHorizontal: SPACING.lg,
            paddingTop:        SPACING.sm,
            paddingBottom:     insets.bottom + SPACING.sm,
            backgroundColor:   COLORS.backgroundCard,
            borderTopWidth:    1,
            borderTopColor:    COLORS.border,
            gap:               SPACING.sm,
          }}>
            {/* Primary export row */}
            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <Pressable
                onPress={exportPPTX}
                disabled={isExporting}
                style={{ flex: 1.6, opacity: isExporting && exportFormat !== 'pptx' ? 0.5 : 1 }}
              >
                <LinearGradient
                  colors={['#6C63FF', '#8B5CF6']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius: RADIUS.lg, paddingVertical: 13,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, ...SHADOWS.medium,
                  }}
                >
                  {isExporting && exportFormat === 'pptx'
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Ionicons name="desktop-outline" size={17} color="#FFF" />}
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '800' }}>
                    {isExporting && exportFormat === 'pptx' ? 'Exporting…' : 'Export PPTX'}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={exportPDF}
                disabled={isExporting}
                style={{ flex: 1, opacity: isExporting && exportFormat !== 'pdf' ? 0.5 : 1 }}
              >
                <View style={{
                  borderRadius: RADIUS.lg, paddingVertical: 13,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  backgroundColor: COLORS.backgroundElevated, borderWidth: 1.5, borderColor: COLORS.border,
                }}>
                  {isExporting && exportFormat === 'pdf'
                    ? <ActivityIndicator size="small" color={COLORS.textSecondary} />
                    : <Ionicons name="document-outline" size={17} color={COLORS.textSecondary} />}
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '700' }}>
                    PDF
                  </Text>
                </View>
              </Pressable>
            </View>

            {/* Secondary row */}
            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <Pressable
                onPress={exportHTML}
                disabled={isExporting}
                style={[{
                  flex: 1, paddingVertical: 10, borderRadius: RADIUS.lg,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  backgroundColor: COLORS.backgroundElevated,
                  borderWidth: 1, borderColor: COLORS.border,
                }, isExporting && exportFormat !== 'html' ? { opacity: 0.5 } : {}]}
              >
                {isExporting && exportFormat === 'html'
                  ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                  : <Ionicons name="globe-outline" size={15} color={COLORS.textMuted} />}
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  HTML
                </Text>
              </Pressable>

              {/* Part 14: Share to Workspace button */}
              <Pressable
                onPress={() => setShowShareModal(true)}
                style={{
                  flex: 1.4, paddingVertical: 10, borderRadius: RADIUS.lg,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  backgroundColor: `${COLORS.primary}15`,
                  borderWidth: 1, borderColor: `${COLORS.primary}35`,
                }}
              >
                <Ionicons name="people-outline" size={15} color={COLORS.primary} />
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                  Share to Team
                </Text>
              </Pressable>

              <Pressable
                onPress={handleRegenerate}
                disabled={isExporting}
                style={[{
                  flex: 1, paddingVertical: 10, borderRadius: RADIUS.lg,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  backgroundColor: COLORS.backgroundElevated,
                  borderWidth: 1, borderColor: COLORS.border,
                }, isExporting ? { opacity: 0.5 } : {}]}
              >
                <Ionicons name="refresh-outline" size={15} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  Redo
                </Text>
              </Pressable>

              <Pressable
                onPress={handleBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: RADIUS.lg,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  backgroundColor: COLORS.backgroundElevated,
                  borderWidth: 1, borderColor: COLORS.border,
                }}
              >
                <Ionicons name="arrow-back-outline" size={15} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                  Back
                </Text>
              </Pressable>
            </View>

            {/* Stats row */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: SPACING.lg }}>
              {[
                { label: 'Slides',   value: String(presentation.totalSlides) },
                { label: 'Theme',    value: THEME_OPTIONS.find(t => t.id === presentation.theme)?.label ?? presentation.theme },
                { label: 'Exported', value: String(presentation.exportCount ?? 0) },
              ].map(stat => (
                <View key={stat.label} style={{ alignItems: 'center' }}>
                  <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                    {stat.value}
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </SafeAreaView>

        {/* Part 14: Share to Workspace Modal */}
        {presentation && (
          <ShareToWorkspaceModal
            visible={showShareModal}
            contentType="presentation"
            contentId={presentation.id}
            title={presentation.title}
            subtitle={presentation.subtitle}
            reportId={report?.id}
            metadata={{
              totalSlides: presentation.totalSlides,
              theme:       presentation.theme,
              exportCount: presentation.exportCount,
            }}
            onClose={() => setShowShareModal(false)}
            onShared={(workspaceId, workspaceName) => {
              Alert.alert(
                '✅ Shared!',
                `"${presentation.title}" has been shared to ${workspaceName}.`,
                [{ text: 'OK' }],
              );
            }}
          />
        )}
      </LinearGradient>
    );
  }

  // ── GENERATING STATE ──────────────────────────────────────────────────────

  if (screenPhase === 'generating' || isGenerating) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
            borderBottomWidth: 1, borderBottomColor: COLORS.border,
          }}>
            <Pressable
              onPress={handleBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
            </Pressable>
            <Text style={{
              color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700', marginLeft: SPACING.sm,
            }}>
              AI Slide Generator
            </Text>
          </View>
          <GeneratingView progress={progress} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── SETUP MODE ────────────────────────────────────────────────────────────

  const selectedThemeObj = THEME_OPTIONS.find(t => t.id === selectedTheme)!;

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
          borderBottomWidth: 1, borderBottomColor: COLORS.border,
        }}>
          <Pressable
            onPress={handleBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: COLORS.backgroundElevated,
              alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
            }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
              AI Slide Generator
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              Convert your research into a presentation
            </Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            paddingTop:        SPACING.lg,
            paddingBottom:     SPACING.xl,
          }}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
        >
          {/* Hero card */}
          <Animated.View entering={FadeInDown.duration(400).delay(60)} style={{ marginBottom: SPACING.lg }}>
            <LinearGradient
              colors={['#1A1A35', '#12122A']}
              style={{
                borderRadius: RADIUS.xl, padding: SPACING.lg,
                borderWidth: 1, borderColor: `${COLORS.primary}30`,
                flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
              }}
            >
              <LinearGradient
                colors={['#6C63FF', '#8B5CF6']}
                style={{
                  width: 56, height: 56, borderRadius: 16,
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...SHADOWS.medium,
                }}
              >
                <Ionicons name="easel-outline" size={26} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={{
                  color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800', marginBottom: 4,
                }}>
                  {report?.title
                    ? (report.title.length > 48 ? report.title.slice(0, 48) + '…' : report.title)
                    : 'Research Report'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { icon: 'layers-outline',           label: `${report?.sections.length ?? 0} sections` },
                    { icon: 'stats-chart-outline',      label: `${report?.statistics.length ?? 0} stats`  },
                    { icon: 'shield-checkmark-outline', label: `${report?.reliabilityScore ?? 0}/10`       },
                  ].map(tag => (
                    <View key={tag.label} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: `${COLORS.primary}15`,
                      borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
                    }}>
                      <Ionicons name={tag.icon as any} size={11} color={COLORS.primary} />
                      <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                        {tag.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* What's Generated */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={{ marginBottom: SPACING.lg }}>
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md,
            }}>
              What's Generated
            </Text>
            <View style={{ gap: SPACING.sm }}>
              {[
                { icon: 'easel-outline',        label: '13–15 professionally structured slides',   color: COLORS.primary   },
                { icon: 'grid-outline',          label: 'Title, agenda, sections, stats & closing', color: COLORS.info      },
                { icon: 'chatbubble-outline',    label: 'Speaker notes for every slide',            color: COLORS.accent    },
                { icon: 'download-outline',      label: 'Export as PPTX, PDF or HTML',             color: COLORS.warning   },
                { icon: 'people-outline',        label: 'Share directly to team workspaces',       color: COLORS.success   },
                { icon: 'color-palette-outline', label: '4 professional visual themes',            color: COLORS.secondary },
              ].map(item => (
                <View key={item.label} style={{
                  flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
                  backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg,
                  padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
                  borderLeftWidth: 3, borderLeftColor: item.color,
                }}>
                  <View style={{
                    width: 34, height: 34, borderRadius: 10,
                    backgroundColor: `${item.color}18`,
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Ionicons name={item.icon as any} size={16} color={item.color} />
                  </View>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, flex: 1 }}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Theme picker */}
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600',
              letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.md,
            }}>
              Choose Theme
            </Text>
            <View style={{ gap: SPACING.sm }}>
              {THEME_OPTIONS.map(theme => {
                const isSelected = selectedTheme === theme.id;
                return (
                  <Pressable
                    key={theme.id}
                    onPress={() => setSelectedTheme(theme.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      backgroundColor: isSelected ? `${theme.colors[0]}12` : COLORS.backgroundCard,
                      borderRadius: RADIUS.lg, padding: SPACING.md,
                      borderWidth: 1.5, borderColor: isSelected ? theme.colors[0] : COLORS.border,
                    }}
                  >
                    <View style={{
                      width: 48, height: 32, borderRadius: 8,
                      marginRight: SPACING.md, overflow: 'hidden', flexShrink: 0,
                      borderWidth: 1, borderColor: COLORS.border,
                      backgroundColor: theme.preview, alignItems: 'center', justifyContent: 'center',
                    }}>
                      <LinearGradient
                        colors={theme.colors}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8 }}
                      />
                      <Ionicons name={theme.icon as any} size={12} color={theme.colors[0]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        color: isSelected ? COLORS.textPrimary : COLORS.textSecondary,
                        fontSize: FONTS.sizes.base, fontWeight: '700',
                      }}>
                        {theme.label}
                      </Text>
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>
                        {theme.desc}
                      </Text>
                    </View>
                    {isSelected && (
                      <LinearGradient
                        colors={theme.colors}
                        style={{
                          width: 22, height: 22, borderRadius: 11,
                          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}
                      >
                        <Ionicons name="checkmark" size={13} color="#FFF" />
                      </LinearGradient>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {error ? (
            <View style={{
              marginBottom: SPACING.lg,
              backgroundColor: `${COLORS.error}12`, borderRadius: RADIUS.lg,
              padding: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`,
              flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
            }}>
              <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} style={{ flexShrink: 0 }} />
              <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, flex: 1, lineHeight: 18 }}>
                {error}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom CTA */}
        <View style={{
          paddingHorizontal: SPACING.lg,
          paddingTop:        SPACING.md,
          paddingBottom:     insets.bottom + SPACING.md,
          backgroundColor:   'rgba(10,10,26,0.97)',
          borderTopWidth:    1, borderTopColor: COLORS.border,
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'center', gap: 6, marginBottom: SPACING.sm,
          }}>
            <Ionicons name={selectedThemeObj.icon as any} size={13} color={selectedThemeObj.colors[0]} />
            <Text style={{ color: selectedThemeObj.colors[0], fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {selectedThemeObj.label} theme selected
            </Text>
          </View>

          <Pressable
            onPress={handleGenerate}
            disabled={isGenerating || !report}
            style={{ opacity: isGenerating || !report ? 0.55 : 1 }}
          >
            <LinearGradient
              colors={selectedThemeObj.colors}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{
                borderRadius: RADIUS.full, paddingVertical: 16,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 10, ...SHADOWS.large,
              }}
            >
              {isGenerating
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="sparkles" size={20} color="#FFF" />}
              <Text style={{ color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '800' }}>
                {isGenerating ? 'Generating…' : 'Generate Presentation'}
              </Text>
            </LinearGradient>
          </Pressable>

          <Text style={{
            color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
            textAlign: 'center', marginTop: SPACING.sm,
          }}>
            Powered by GPT-4o · Takes 15–30 seconds
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}