// app/(app)/(tabs)/history.tsx
// Research history dashboard — shows all completed reports
// with search/filter, swipe to delete, and tap to reopen.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, Layout } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useHistory } from '../../../src/hooks/useHistory';
import { Avatar } from '../../../src/components/common/Avatar';
import { useAuth } from '../../../src/context/AuthContext';
import { ResearchReport } from '../../../src/types';
import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';

const DEPTH_COLORS: Record<string, string> = {
  quick: COLORS.info,
  deep: COLORS.primary,
  expert: COLORS.warning,
};

const DEPTH_LABELS: Record<string, string> = {
  quick: 'Quick',
  deep: 'Deep',
  expert: 'Expert',
};

function ReportCard({
  report,
  onOpen,
  onDelete,
  index,
}: {
  report: ResearchReport;
  onOpen: () => void;
  onDelete: () => void;
  index: number;
}) {
  const depthColor = DEPTH_COLORS[report.depth] ?? COLORS.primary;
  const sectionCount = report.sections?.length ?? 0;
  const citationCount = report.citations?.length ?? 0;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 60)}
      layout={Layout.springify()}
    >
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.75}
        style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius: RADIUS.xl,
          padding: SPACING.md,
          marginBottom: SPACING.sm,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        {/* Top row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm }}>
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: `${depthColor}15`,
            alignItems: 'center', justifyContent: 'center',
            marginRight: SPACING.sm,
            borderWidth: 1,
            borderColor: `${depthColor}30`,
          }}>
            <Ionicons name="document-text" size={20} color={depthColor} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.base,
              fontWeight: '700',
              lineHeight: 20,
            }} numberOfLines={2}>
              {report.title}
            </Text>
            <Text style={{
              color: COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              marginTop: 4,
            }}>
              {formatDate(report.createdAt)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Summary preview */}
        {report.executiveSummary ? (
          <Text style={{
            color: COLORS.textSecondary,
            fontSize: FONTS.sizes.xs,
            lineHeight: 18,
            marginBottom: SPACING.sm,
          }} numberOfLines={2}>
            {report.executiveSummary}
          </Text>
        ) : null}

        {/* Footer chips */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <View style={{
            backgroundColor: `${depthColor}15`,
            borderRadius: RADIUS.full,
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}>
            <Text style={{
              color: depthColor,
              fontSize: FONTS.sizes.xs,
              fontWeight: '600',
            }}>
              {DEPTH_LABELS[report.depth]}
            </Text>
          </View>

          {sectionCount > 0 && (
            <View style={{
              backgroundColor: `${COLORS.primary}10`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs }}>
                {sectionCount} sections
              </Text>
            </View>
          )}

          {citationCount > 0 && (
            <View style={{
              backgroundColor: `${COLORS.textMuted}15`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                {citationCount} sources
              </Text>
            </View>
          )}

          {report.reliabilityScore > 0 && (
            <View style={{
              backgroundColor: `${COLORS.success}10`,
              borderRadius: RADIUS.full,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
              <Text style={{ color: COLORS.success, fontSize: FONTS.sizes.xs }}>
                {report.reliabilityScore}/10 ✓
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HistoryScreen() {
  const { profile } = useAuth();
  const { reports, loading, refreshing, refresh, deleteReport } = useHistory();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = reports.filter(
    (r) =>
      r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.query?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (report: ResearchReport) => {
    Alert.alert(
      'Delete Report',
      `Delete "${report.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteReport(report.id),
        },
      ]
    );
  };

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(600)}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: SPACING.xl,
            paddingBottom: SPACING.md,
          }}
        >
          <View>
            <Text style={{
              color: COLORS.textPrimary,
              fontSize: FONTS.sizes.xl,
              fontWeight: '800',
            }}>
              Research History
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
              {reports.length} report{reports.length !== 1 ? 's' : ''} saved
            </Text>
          </View>
          <Avatar url={profile?.avatar_url} name={profile?.full_name} size={44} />
        </Animated.View>

        {/* Search */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
          style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}
        >
          <View style={{
            backgroundColor: COLORS.backgroundCard,
            borderRadius: RADIUS.lg,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: SPACING.md,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search reports..."
              placeholderTextColor={COLORS.textMuted}
              style={{
                flex: 1,
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.sm,
                marginLeft: 10,
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Report list */}
        <ScrollView
          contentContainerStyle={{
            padding: SPACING.xl,
            paddingTop: 0,
            paddingBottom: 100,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {loading && reports.length === 0 ? (
            // Skeleton loaders
            Array.from({ length: 3 }).map((_, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius: RADIUS.xl,
                  height: 130,
                  marginBottom: SPACING.sm,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  opacity: 1 - i * 0.25,
                }}
              />
            ))
          ) : filtered.length === 0 ? (
            // Empty state
            <Animated.View
              entering={FadeIn.duration(600)}
              style={{ alignItems: 'center', paddingTop: 80 }}
            >
              <View style={{
                width: 80, height: 80, borderRadius: 24,
                backgroundColor: COLORS.backgroundElevated,
                alignItems: 'center', justifyContent: 'center',
                marginBottom: SPACING.lg,
              }}>
                <Ionicons name="time-outline" size={36} color={COLORS.border} />
              </View>
              <Text style={{
                color: COLORS.textPrimary,
                fontSize: FONTS.sizes.lg,
                fontWeight: '700',
                textAlign: 'center',
              }}>
                {searchQuery ? 'No results found' : 'No research yet'}
              </Text>
              <Text style={{
                color: COLORS.textMuted,
                fontSize: FONTS.sizes.sm,
                textAlign: 'center',
                marginTop: SPACING.sm,
                lineHeight: 20,
                paddingHorizontal: SPACING.xl,
              }}>
                {searchQuery
                  ? 'Try a different search term'
                  : 'Start your first research query on the Home tab'}
              </Text>
              {!searchQuery && (
                <TouchableOpacity
                  onPress={() => router.push('/(app)/(tabs)/home')}
                  style={{ marginTop: SPACING.lg }}
                >
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      borderRadius: RADIUS.full,
                      paddingHorizontal: SPACING.xl,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Ionicons name="telescope-outline" size={18} color="#FFF" />
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.base }}>
                      Start Research
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animated.View>
          ) : (
            filtered.map((report, i) => (
              <ReportCard
                key={report.id}
                report={report}
                index={i}
                onOpen={() =>
                  router.push({
                    pathname: '/(app)/research-report' as any,
                    params: { reportId: report.id },
                  })
                }
                onDelete={() => handleDelete(report)}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}