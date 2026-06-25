// src/components/offline/offlinereportviewer.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Offline Report Viewer — Full theme-compatible report viewer for offline mode
// Part 55 — FULL THEME SYSTEM
//   All colors derive from the active theme via COLORS object.
//   Uses useTheme() for light/dark mode awareness.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  LayoutChangeEvent,
  Pressable,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import type { ResearchReport } from '../../types';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Type Definitions ─────────────────────────────────────────────────────────

interface SegTab {
  key: 'report' | 'findings' | 'sources';
  label: string;
}

interface ReportViewerProps {
  report: ResearchReport;
  onClose: () => void;
  onExport: () => void;
  exporting: boolean;
}

// ─── Theme-aware style helpers ───────────────────────────────────────────────

function sectionLabelStyle() {
  return {
    color: COLORS.textMuted,
    fontSize: FONTS.sizes.xs,
    fontWeight: '700' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  };
}

// ─── Segmented Tabs ──────────────────────────────────────────────────────────

function SegmentedTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SegTab[];
  active: string;
  onChange: (k: SegTab['key']) => void;
}) {
  const [w, setW] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const pad = 4;
  const tabW = w > 0 ? (w - pad * 2) / tabs.length : 0;
  const activeIndex = Math.max(0, tabs.findIndex(t => t.key === active));

  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: pad + activeIndex * tabW,
      useNativeDriver: true,
      friction: 9,
      tension: 80,
    }).start();
  }, [activeIndex, tabW]);

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={{
        flexDirection: 'row',
        backgroundColor: `${COLORS.textMuted}0A`,
        borderRadius: RADIUS.full,
        padding: pad,
        borderWidth: 1,
        borderColor: COLORS.border,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {tabW > 0 && (
        <Animated.View
          style={{
            position: 'absolute',
            top: pad,
            bottom: pad,
            left: 0,
            width: tabW,
            transform: [{ translateX: indicatorX }],
          }}
        >
          <LinearGradient 
            colors={COLORS.gradientPrimary} 
            style={{ flex: 1, borderRadius: RADIUS.full }} 
          />
        </Animated.View>
      )}
      {tabs.map(tab => {
        const isActive = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={{ flex: 1, paddingVertical: 9, alignItems: 'center', zIndex: 1 }}
          >
            <Text
              style={{
                color: isActive ? '#FFF' : COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
                fontWeight: isActive ? '800' : '600',
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Rich Text ──────────────────────────────────────────────────────────────

interface RichTextProps {
  content: string;
  highlightStats?: boolean;
  accent?: string;
  size: number;
  color: string;
  weight?: '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | 'normal' | 'bold';
  lineHeight?: number;
  style?: any;
}

function RichText({
  content,
  highlightStats,
  accent,
  size,
  color,
  weight = '400',
  lineHeight,
  style,
}: RichTextProps) {
  if (!content) return null;

  // Simple render: just display the text with optional stat highlighting
  if (highlightStats) {
    // Try to find and highlight numbers/statistics
    const parts = content.split(/(\d+[\.,]?\d*%?)/);
    if (parts.length > 1) {
      return (
        <Text style={{ flexDirection: 'row', flexWrap: 'wrap', ...style }}>
          {parts.map((part, i) => {
            const isStat = /^\d+[\.,]?\d*%?$/.test(part);
            return (
              <Text
                key={i}
                style={{
                  color: isStat && accent ? accent : color,
                  fontSize: size,
                  fontWeight: isStat ? '900' : (weight || '400'),
                  lineHeight: lineHeight || size * 1.6,
                }}
              >
                {part}
              </Text>
            );
          })}
        </Text>
      );
    }
  }

  return (
    <Text
      style={{
        color,
        fontSize: size,
        fontWeight: weight || '400',
        lineHeight: lineHeight || size * 1.6,
        ...style,
      }}
    >
      {content}
    </Text>
  );
}

// ─── Main Report Viewer ─────────────────────────────────────────────────────

export function OfflineReportViewer({
  report,
  onClose,
  onExport,
  exporting,
}: ReportViewerProps) {
  const insets = useSafeAreaInsets();
  const { isLight } = useTheme();
  const [activeTab, setActiveTab] = useState<'report' | 'findings' | 'sources'>('report');

  const reliabilityColor =
    (report.reliabilityScore ?? 0) >= 8
      ? COLORS.success
      : (report.reliabilityScore ?? 0) >= 6
        ? COLORS.warning
        : COLORS.error;

  const sortedCitations = report.citations
    ? [...report.citations].sort((a, b) => {
        const ta = a.trustScore?.tier ?? 3;
        const tb = b.trustScore?.tier ?? 3;
        if (ta !== tb) return ta - tb;
        return (b.trustScore?.credibilityScore ?? 5) - (a.trustScore?.credibilityScore ?? 5);
      })
    : [];

  const openURL = async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Cannot open URL', url);
    } catch {
      Alert.alert('Error', 'Could not open this link.');
    }
  };

  const bgGradient: readonly [string, string] = isLight
    ? ['#F5F6FB', '#FFFFFF']
    : [COLORS.background, COLORS.backgroundCard];

  return (
    <LinearGradient colors={bgGradient} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View
          style={{
            paddingHorizontal: SPACING.lg,
            paddingBottom: SPACING.sm,
            paddingTop: SPACING.sm,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.sm,
                fontWeight: '700',
                lineHeight: 20,
              }}
              numberOfLines={1}
            >
              {report.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View
                style={{
                  backgroundColor: `${COLORS.info}20`,
                  borderRadius: RADIUS.sm,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                }}
              >
                <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {report.sourcesCount} sources · {report.reliabilityScore}/10
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={onExport}
            disabled={exporting}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: `${COLORS.primary}18`,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: `${COLORS.primary}30`,
            }}
          >
            {exporting ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Ionicons name="download-outline" size={17} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}>
          <SegmentedTabs
            tabs={[
              { key: 'report', label: 'Report' },
              { key: 'findings', label: 'Findings' },
              { key: 'sources', label: `Sources${sortedCitations.length > 0 ? ` (${sortedCitations.length})` : ''}` },
            ]}
            active={activeTab}
            onChange={setActiveTab}
          />
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: SPACING.lg,
            paddingTop: SPACING.sm,
            paddingBottom: insets.bottom + SPACING.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats */}
          <Reanimated.View entering={FadeInDown.duration(400)} style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
            <View style={{ flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${COLORS.info}33` }}>
              <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#1A1A38', '#12122A']} style={{ padding: SPACING.sm, alignItems: 'center' }}>
                <LinearGradient colors={[COLORS.info, `${COLORS.info}99`] as readonly [string, string]} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  <Ionicons name="globe-outline" size={15} color="#FFF" />
                </LinearGradient>
                <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.md, fontWeight: '900' }}>{report.sourcesCount}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: '600' }}>Sources</Text>
              </LinearGradient>
            </View>

            <View style={{ flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${COLORS.primary}33` }}>
              <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#1A1A38', '#12122A']} style={{ padding: SPACING.sm, alignItems: 'center' }}>
                <LinearGradient colors={[COLORS.primary, `${COLORS.primary}99`] as readonly [string, string]} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  <Ionicons name="link-outline" size={15} color="#FFF" />
                </LinearGradient>
                <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.md, fontWeight: '900' }}>{report.citations?.length ?? 0}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: '600' }}>Citations</Text>
              </LinearGradient>
            </View>

            <View style={{ flex: 1, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: 1, borderColor: `${reliabilityColor}33` }}>
              <LinearGradient colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#1A1A38', '#12122A']} style={{ padding: SPACING.sm, alignItems: 'center' }}>
                <LinearGradient colors={[reliabilityColor, `${reliabilityColor}99`] as readonly [string, string]} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                  <Ionicons name="shield-checkmark-outline" size={15} color="#FFF" />
                </LinearGradient>
                <Text style={{ color: reliabilityColor, fontSize: FONTS.sizes.md, fontWeight: '900' }}>{report.reliabilityScore}/10</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center', fontWeight: '600' }}>Reliability</Text>
              </LinearGradient>
            </View>
          </Reanimated.View>

          {activeTab === 'report' && (
            <>
              {/* Executive Summary */}
              <Reanimated.View entering={FadeInDown.duration(400).delay(100)}>
                <View
                  style={{
                    borderRadius: RADIUS.xl,
                    marginBottom: SPACING.lg,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: `${COLORS.primary}2A`,
                  }}
                >
                  <LinearGradient
                    colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#1B1B3C', '#121228']}
                    style={{ padding: SPACING.lg }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
                      <LinearGradient
                        colors={COLORS.gradientPrimary}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: SPACING.sm,
                        }}
                      >
                        <Ionicons name="newspaper" size={16} color="#FFF" />
                      </LinearGradient>
                      <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '800' }}>
                        Executive Summary
                      </Text>
                    </View>
                    <RichText
                      content={report.executiveSummary}
                      highlightStats
                      accent={COLORS.primaryLight}
                      size={FONTS.sizes.sm}
                      color={COLORS.textSecondary}
                      lineHeight={22}
                    />
                  </LinearGradient>
                </View>
              </Reanimated.View>

              {/* Sections */}
              {report.sections.map((section, i) => (
                <Reanimated.View
                  key={section.id ?? i}
                  entering={FadeInDown.duration(350).delay(i * 50 + 150)}
                >
                  <View
                    style={{
                      backgroundColor: isLight ? '#FFFFFF' : COLORS.backgroundCard,
                      borderRadius: RADIUS.lg,
                      padding: SPACING.md,
                      marginBottom: SPACING.sm,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      borderLeftWidth: 3,
                      borderLeftColor: COLORS.primary,
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.textPrimary,
                        fontSize: FONTS.sizes.base,
                        fontWeight: '700',
                        marginBottom: SPACING.sm,
                      }}
                    >
                      {section.title}
                    </Text>
                    <RichText
                      content={section.content}
                      highlightStats
                      accent={COLORS.primaryLight}
                      size={FONTS.sizes.sm}
                      color={COLORS.textSecondary}
                      lineHeight={22}
                    />
                    {section.bullets?.map((b, bi) => (
                      <View key={bi} style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                        <Text style={{ color: COLORS.primary }}>•</Text>
                        <Text
                          style={{
                            color: COLORS.textSecondary,
                            fontSize: FONTS.sizes.sm,
                            flex: 1,
                            lineHeight: 20,
                          }}
                        >
                          {b}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Reanimated.View>
              ))}
            </>
          )}

          {activeTab === 'findings' && (
            <>
              <Text style={[sectionLabelStyle(), { marginBottom: SPACING.md }]}>Key Findings</Text>
              {report.keyFindings.map((finding, i) => (
                <Reanimated.View
                  key={i}
                  entering={FadeInDown.duration(350).delay(i * 50)}
                  style={{
                    borderRadius: RADIUS.lg,
                    marginBottom: SPACING.sm,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <LinearGradient
                    colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#16162F', '#101024']}
                    style={{
                      padding: SPACING.md,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      borderLeftWidth: 3,
                      borderLeftColor: COLORS.primary,
                    }}
                  >
                    <LinearGradient
                      colors={COLORS.gradientPrimary}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: SPACING.sm,
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ color: '#FFF', fontSize: FONTS.sizes.xs, fontWeight: '900' }}>
                        {i + 1}
                      </Text>
                    </LinearGradient>
                    <RichText
                      content={finding}
                      highlightStats
                      accent={COLORS.primaryLight}
                      size={FONTS.sizes.sm}
                      color={COLORS.textPrimary}
                      weight="500"
                      lineHeight={21}
                      style={{ flex: 1 }}
                    />
                  </LinearGradient>
                </Reanimated.View>
              ))}

              {report.futurePredictions.length > 0 && (
                <>
                  <Text style={[sectionLabelStyle(), { marginTop: SPACING.lg, marginBottom: SPACING.md }]}>
                    Future Predictions
                  </Text>
                  {report.futurePredictions.map((pred, i) => (
                    <View
                      key={i}
                      style={{
                        borderRadius: RADIUS.lg,
                        marginBottom: SPACING.sm,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: `${COLORS.warning}2A`,
                      }}
                    >
                      <LinearGradient
                        colors={[`${COLORS.warning}14`, `${COLORS.warning}06`] as readonly [string, string]}
                        style={{ padding: SPACING.md, flexDirection: 'row', alignItems: 'flex-start' }}
                      >
                        <Ionicons
                          name="telescope"
                          size={16}
                          color={COLORS.warning}
                          style={{ marginRight: SPACING.sm, marginTop: 2, flexShrink: 0 }}
                        />
                        <RichText
                          content={pred}
                          highlightStats
                          accent={COLORS.warning}
                          size={FONTS.sizes.sm}
                          color={COLORS.textSecondary}
                          lineHeight={21}
                          style={{ flex: 1 }}
                        />
                      </LinearGradient>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {activeTab === 'sources' && (
            <>
              <Text style={[sectionLabelStyle(), { marginBottom: SPACING.md }]}>
                {sortedCitations.length} Sources
              </Text>

              {sortedCitations.map((c, i) => (
                <Pressable
                  key={c.id ?? i}
                  onPress={() => openURL(c.url)}
                  style={{
                    borderRadius: RADIUS.lg,
                    marginBottom: SPACING.sm,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor:
                      c.trustScore?.tier === 1
                        ? `${COLORS.success}33`
                        : c.trustScore?.tier === 2
                          ? `${COLORS.primary}2A`
                          : COLORS.border,
                  }}
                >
                  <LinearGradient
                    colors={isLight ? ['#FFFFFF', '#EEF0F8'] : ['#16162F', '#101024']}
                    style={{ padding: SPACING.md }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 7,
                          backgroundColor:
                            c.trustScore?.tier === 1
                              ? `${COLORS.success}22`
                              : `${COLORS.primary}22`,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 9,
                          flexShrink: 0,
                        }}
                      >
                        <Text
                          style={{
                            color: c.trustScore?.tier === 1 ? COLORS.success : COLORS.primary,
                            fontSize: 10,
                            fontWeight: '900',
                          }}
                        >
                          {i + 1}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: COLORS.textPrimary,
                          fontSize: FONTS.sizes.sm,
                          fontWeight: '700',
                          flex: 1,
                          lineHeight: 20,
                        }}
                      >
                        {c.title}
                      </Text>
                      <Ionicons
                        name="open-outline"
                        size={16}
                        color={COLORS.primary}
                        style={{ marginLeft: 6, flexShrink: 0, marginTop: 2 }}
                      />
                    </View>
                    <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, marginBottom: 6 }}>
                      {c.source}
                      {c.date ? ` · ${c.date}` : ''}
                    </Text>
                    {c.trustScore && (
                      <View style={{ marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View
                            style={{
                              backgroundColor:
                                c.trustScore.tier === 1
                                  ? `${COLORS.success}22`
                                  : c.trustScore.tier === 2
                                    ? `${COLORS.primary}22`
                                    : `${COLORS.textMuted}22`,
                              borderRadius: RADIUS.sm,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  c.trustScore.tier === 1
                                    ? COLORS.success
                                    : c.trustScore.tier === 2
                                      ? COLORS.primary
                                      : COLORS.textMuted,
                                fontSize: 9,
                                fontWeight: '700',
                              }}
                            >
                              {c.trustScore.tier === 1
                                ? '● HIGH TRUST'
                                : c.trustScore.tier === 2
                                  ? '● MEDIUM'
                                  : '● LOW'}
                            </Text>
                          </View>
                          {c.trustScore.credibilityScore && (
                            <Text
                              style={{
                                color: COLORS.textMuted,
                                fontSize: 9,
                                fontWeight: '600',
                              }}
                            >
                              Score: {c.trustScore.credibilityScore}/10
                            </Text>
                          )}
                        </View>
                      </View>
                    )}
                    <Text
                      style={{
                        color: COLORS.textMuted,
                        fontSize: FONTS.sizes.xs,
                        lineHeight: 16,
                      }}
                    >
                      {c.snippet}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}