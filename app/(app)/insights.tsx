// app/(app)/insights.tsx
// Part 27 — "Your Insights" Analytics Dashboard Screen
//
// Sections:
//  1. Summary stat cards (hours saved, words generated, reports, streak)
//  2. Monthly goal progress bar with editable target
//  3. Weekly activity heatmap (7 cells — last 7 days)
//  4. Topic distribution bar chart (top 6 categories)
//  5. Milestone badges grid (10 achievements)
//  6. Content breakdown row (podcasts / debates / papers)

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient }  from 'expo-linear-gradient';
import { Ionicons }        from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { SafeAreaView }    from 'react-native-safe-area-context';
import { router }          from 'expo-router';
import { BlurView }        from 'expo-blur';

import { useAnalytics }    from '../../src/hooks/useAnalytics';
import type {
  WeeklyHeatmapDay,
  TopicChartItem,
  MilestoneBadge,
} from '../../src/types/onboarding';
import { COLORS, FONTS, SPACING, RADIUS } from '../../src/constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatHours(h: number): string {
  if (h < 1)  return `${Math.round(h * 60)}m`;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon, label, value, sublabel, color, delay,
}: {
  icon:     string;
  label:    string;
  value:    string;
  sublabel: string;
  color:    string;
  delay:    number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(delay)}
      style={{ flex: 1 }}
    >
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.md,
        borderWidth:     1,
        borderColor:     `${color}25`,
        alignItems:      'center',
        minHeight:       110,
        justifyContent:  'center',
      }}>
        <View style={{
          width:           40, height: 40, borderRadius: 12,
          backgroundColor: `${color}18`,
          alignItems:      'center', justifyContent: 'center',
          marginBottom:    8,
        }}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <Text style={{
          color:       color,
          fontSize:    FONTS.sizes.xl,
          fontWeight:  '900',
          letterSpacing: -0.5,
        }}>
          {value}
        </Text>
        <Text style={{
          color:     COLORS.textPrimary,
          fontSize:  FONTS.sizes.xs,
          fontWeight: '600',
          marginTop: 2,
          textAlign: 'center',
        }}>
          {label}
        </Text>
        <Text style={{
          color:     COLORS.textMuted,
          fontSize:  10,
          marginTop: 2,
          textAlign: 'center',
        }}>
          {sublabel}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Monthly goal ─────────────────────────────────────────────────────────────

function MonthlyGoalCard({
  reportsThisMonth,
  monthlyGoal,
  onEditGoal,
  delay,
}: {
  reportsThisMonth: number;
  monthlyGoal:      number;
  onEditGoal:       () => void;
  delay:            number;
}) {
  const progress  = Math.min(1, reportsThisMonth / Math.max(1, monthlyGoal));
  const pctLabel  = Math.round(progress * 100);
  const color     = progress >= 1 ? COLORS.success : progress >= 0.6 ? COLORS.warning : COLORS.primary;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.md,
        borderWidth:     1,
        borderColor:     `${color}25`,
        marginBottom:    SPACING.sm,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
          <View style={{
            width:           36, height: 36, borderRadius: 11,
            backgroundColor: `${color}18`,
            alignItems:      'center', justifyContent: 'center',
            marginRight:     10,
          }}>
            <Ionicons name="flag-outline" size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
              Monthly Goal
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
              {reportsThisMonth} of {monthlyGoal} reports this month
            </Text>
          </View>
          <TouchableOpacity
            onPress={onEditGoal}
            style={{
              backgroundColor: `${COLORS.textMuted}15`,
              borderRadius:    RADIUS.md,
              paddingHorizontal: 10, paddingVertical: 5,
              flexDirection:   'row', alignItems: 'center', gap: 4,
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="pencil-outline" size={12} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              Edit
            </Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={{
          backgroundColor: COLORS.backgroundElevated,
          borderRadius:    RADIUS.full,
          height:          10,
          overflow:        'hidden',
          marginBottom:    8,
        }}>
          <Animated.View
            entering={FadeIn.duration(800).delay(delay + 200)}
            style={{
              width:           `${pctLabel}%`,
              height:          '100%',
              backgroundColor: color,
              borderRadius:    RADIUS.full,
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            0
          </Text>
          <Text style={{
            color:     color,
            fontSize:  FONTS.sizes.xs,
            fontWeight: '700',
          }}>
            {pctLabel}%{progress >= 1 ? ' 🎉 Goal reached!' : ` · ${monthlyGoal - reportsThisMonth} to go`}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            {monthlyGoal}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Weekly heatmap ───────────────────────────────────────────────────────────

const HEATMAP_COLORS = {
  0: COLORS.backgroundElevated,
  1: `${COLORS.primary}35`,
  2: `${COLORS.primary}65`,
  3: COLORS.primary,
} as const;

function WeeklyHeatmap({
  days,
  delay,
}: {
  days:  WeeklyHeatmapDay[];
  delay: number;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.md,
        borderWidth:     1,
        borderColor:     COLORS.border,
        marginBottom:    SPACING.sm,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
          <View style={{
            width: 32, height: 32, borderRadius: 9,
            backgroundColor: `${COLORS.info}18`,
            alignItems: 'center', justifyContent: 'center',
            marginRight: 10,
          }}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.info} />
          </View>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
            Activity This Week
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
          {days.map((day, i) => (
            <View key={day.date} style={{ alignItems: 'center', flex: 1 }}>
              <Animated.View
                entering={FadeInDown.duration(300).delay(delay + 100 + i * 40)}
                style={{
                  width:           '100%',
                  aspectRatio:     1,
                  borderRadius:    RADIUS.md,
                  backgroundColor: HEATMAP_COLORS[day.level],
                  borderWidth:     day.isToday ? 1.5 : 0.5,
                  borderColor:     day.isToday ? COLORS.primary : `${COLORS.border}80`,
                  alignItems:      'center',
                  justifyContent:  'center',
                  marginBottom:    5,
                }}
              >
                {day.count > 0 && (
                  <Text style={{
                    color:      day.level >= 2 ? '#FFF' : COLORS.primary,
                    fontSize:   11,
                    fontWeight: '800',
                  }}>
                    {day.count}
                  </Text>
                )}
              </Animated.View>
              <Text style={{
                color:     day.isToday ? COLORS.primary : COLORS.textMuted,
                fontSize:  10,
                fontWeight: day.isToday ? '700' : '400',
                textAlign: 'center',
              }}>
                {day.dayName}
              </Text>
              <Text style={{
                color:     COLORS.textMuted,
                fontSize:  9,
                textAlign: 'center',
              }}>
                {day.dayNum}
              </Text>
            </View>
          ))}
        </View>

        {/* Legend */}
        <View style={{
          flexDirection:   'row',
          alignItems:      'center',
          justifyContent:  'flex-end',
          gap:              4,
          marginTop:       SPACING.sm,
        }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 9, marginRight: 2 }}>Less</Text>
          {([0, 1, 2, 3] as const).map(level => (
            <View key={level} style={{
              width:           12, height: 12, borderRadius: 3,
              backgroundColor: HEATMAP_COLORS[level],
              borderWidth:     0.5, borderColor: `${COLORS.border}60`,
            }} />
          ))}
          <Text style={{ color: COLORS.textMuted, fontSize: 9, marginLeft: 2 }}>More</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Topic distribution ───────────────────────────────────────────────────────

function TopicDistributionCard({
  topics,
  delay,
}: {
  topics: TopicChartItem[];
  delay:  number;
}) {
  if (!topics.length) return null;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(delay)}>
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.md,
        borderWidth:     1,
        borderColor:     COLORS.border,
        marginBottom:    SPACING.sm,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md }}>
          <View style={{
            width: 32, height: 32, borderRadius: 9,
            backgroundColor: `${COLORS.secondary}18`,
            alignItems: 'center', justifyContent: 'center',
            marginRight: 10,
          }}>
            <Ionicons name="pie-chart-outline" size={16} color={COLORS.secondary} />
          </View>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
            Research Topics
          </Text>
        </View>

        {topics.map((item, i) => (
          <Animated.View
            key={item.keyword}
            entering={FadeInDown.duration(350).delay(delay + 100 + i * 50)}
            style={{ marginBottom: 12 }}
          >
            <View style={{
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'space-between',
              marginBottom:    5,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{
                  width:           10, height: 10, borderRadius: 2,
                  backgroundColor: item.color,
                }} />
                <Text style={{
                  color:    COLORS.textSecondary,
                  fontSize: FONTS.sizes.xs,
                  fontWeight: '500',
                  maxWidth:  180,
                }}>
                  {item.keyword}
                </Text>
              </View>
              <Text style={{
                color:    item.color,
                fontSize: FONTS.sizes.xs,
                fontWeight: '700',
              }}>
                {item.percent}%
              </Text>
            </View>
            <View style={{
              backgroundColor: COLORS.backgroundElevated,
              borderRadius:    RADIUS.full,
              height:          6,
              overflow:        'hidden',
            }}>
              <View style={{
                width:           `${item.percent}%`,
                height:          '100%',
                backgroundColor: item.color,
                borderRadius:    RADIUS.full,
              }} />
            </View>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Milestone badges ─────────────────────────────────────────────────────────

function MilestoneBadgeCard({
  badge,
  delay,
}: {
  badge: MilestoneBadge;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(delay)}
      style={{ width: '48%' }}
    >
      <View style={{
        backgroundColor: badge.achieved ? `${badge.color}12` : COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.md,
        borderWidth:     1,
        borderColor:     badge.achieved ? `${badge.color}35` : COLORS.border,
        alignItems:      'center',
        opacity:         badge.achieved ? 1 : 0.55,
      }}>
        {/* Icon */}
        {badge.achieved ? (
          <LinearGradient
            colors={badge.gradient}
            style={{
              width: 48, height: 48, borderRadius: 14,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: SPACING.sm,
            }}
          >
            <Ionicons name={badge.icon as any} size={24} color="#FFF" />
          </LinearGradient>
        ) : (
          <View style={{
            width:           48, height: 48, borderRadius: 14,
            backgroundColor: COLORS.backgroundElevated,
            alignItems:      'center', justifyContent: 'center',
            marginBottom:    SPACING.sm,
          }}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.textMuted} />
          </View>
        )}

        <Text style={{
          color:      badge.achieved ? COLORS.textPrimary : COLORS.textMuted,
          fontSize:   FONTS.sizes.xs,
          fontWeight: '700',
          textAlign:  'center',
          marginBottom: 4,
        }}>
          {badge.label}
        </Text>

        {/* Progress bar for unachieved badges */}
        {!badge.achieved && badge.progress > 0 && (
          <View style={{
            width:           '100%',
            backgroundColor: COLORS.backgroundElevated,
            borderRadius:    RADIUS.full,
            height:          4,
            marginTop:       4,
            overflow:        'hidden',
          }}>
            <View style={{
              width:           `${badge.progress * 100}%`,
              height:          '100%',
              backgroundColor: badge.color,
              borderRadius:    RADIUS.full,
            }} />
          </View>
        )}

        <Text style={{
          color:    COLORS.textMuted,
          fontSize: 10,
          marginTop: 3,
          textAlign: 'center',
        }}>
          {badge.achieved
            ? '✓ Achieved'
            : `${badge.currentCount} / ${badge.requiredCount}`
          }
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Edit goal modal ──────────────────────────────────────────────────────────

function EditGoalModal({
  visible,
  currentGoal,
  onSave,
  onClose,
}: {
  visible:     boolean;
  currentGoal: number;
  onSave:      (goal: number) => void;
  onClose:     () => void;
}) {
  const [value, setValue] = useState(String(currentGoal));

  const handleSave = () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 200) {
      Alert.alert('Invalid Goal', 'Please enter a number between 1 and 200.');
      return;
    }
    onSave(n);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <BlurView
        intensity={20}
        style={{
          flex: 1,
          backgroundColor: 'rgba(10,10,26,0.75)',
          justifyContent:  'center',
          alignItems:      'center',
          paddingHorizontal: SPACING.xl,
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={{
            backgroundColor: COLORS.backgroundCard,
            borderRadius:    RADIUS.xl,
            padding:         SPACING.xl,
            width:           '100%',
            borderWidth:     1,
            borderColor:     COLORS.border,
          }}>
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.xl,
              fontWeight: '800',
              marginBottom: SPACING.sm,
            }}>
              Monthly Goal
            </Text>
            <Text style={{
              color:      COLORS.textSecondary,
              fontSize:   FONTS.sizes.sm,
              marginBottom: SPACING.xl,
              lineHeight:  20,
            }}>
              How many research reports do you want to complete this month?
            </Text>

            <TextInput
              value={value}
              onChangeText={setValue}
              keyboardType="number-pad"
              autoFocus
              style={{
                backgroundColor:   COLORS.backgroundElevated,
                borderRadius:      RADIUS.lg,
                paddingHorizontal: SPACING.md,
                paddingVertical:   14,
                color:             COLORS.textPrimary,
                fontSize:          FONTS.sizes.xl,
                fontWeight:        '700',
                textAlign:         'center',
                borderWidth:       1,
                borderColor:       COLORS.border,
                marginBottom:      SPACING.xl,
              }}
              maxLength={3}
            />

            <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex:            1,
                  borderRadius:    RADIUS.lg,
                  paddingVertical: 14,
                  alignItems:      'center',
                  backgroundColor: COLORS.backgroundElevated,
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                }}
                activeOpacity={0.78}
              >
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                activeOpacity={0.85}
                style={{ flex: 1 }}
              >
                <LinearGradient
                  colors={COLORS.gradientPrimary}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{
                    borderRadius:    RADIUS.lg,
                    paddingVertical: 14,
                    alignItems:      'center',
                  }}
                >
                  <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                    Save Goal
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <View style={{ padding: SPACING.xl }}>
      {[0, 1, 2, 3].map(i => (
        <View
          key={i}
          style={{
            backgroundColor: COLORS.backgroundCard,
            borderRadius:    RADIUS.xl,
            height:          120,
            marginBottom:    SPACING.sm,
            borderWidth:     1,
            borderColor:     COLORS.border,
          }}
        />
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const {
    data,
    isLoading,
    isRefreshing,
    refresh,
    setMonthlyGoal,
  } = useAnalytics();

  const [goalModalVisible, setGoalModalVisible] = useState(false);

  const handleSaveGoal = useCallback(async (goal: number) => {
    await setMonthlyGoal(goal);
  }, [setMonthlyGoal]);

  const achievedCount = data?.milestones.filter(m => m.achieved).length ?? 0;
  const totalBadges   = data?.milestones.length ?? 0;

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(400)}
          style={{
            flexDirection:     'row',
            alignItems:        'center',
            paddingHorizontal: SPACING.xl,
            paddingVertical:   SPACING.md,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              width:           38, height: 38, borderRadius: 19,
              backgroundColor: `${COLORS.textMuted}15`,
              alignItems:      'center', justifyContent: 'center',
              marginRight:     SPACING.md,
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.xl,
              fontWeight: '800',
            }}>
              Your Insights
            </Text>
            <Text style={{
              color:    COLORS.textMuted,
              fontSize: FONTS.sizes.xs,
              marginTop: 1,
            }}>
              Research analytics &amp; milestones
            </Text>
          </View>
          {/* Milestone count */}
          {data && (
            <View style={{
              backgroundColor:   `${COLORS.warning}15`,
              borderRadius:      RADIUS.full,
              paddingHorizontal: 10, paddingVertical: 5,
              borderWidth:       1, borderColor: `${COLORS.warning}30`,
              flexDirection:     'row', alignItems: 'center', gap: 5,
            }}>
              <Ionicons name="trophy-outline" size={13} color={COLORS.warning} />
              <Text style={{ color: COLORS.warning, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>
                {achievedCount}/{totalBadges}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Content */}
        {isLoading && !data ? (
          <InsightsSkeleton />
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding:      SPACING.xl,
              paddingBottom: 100,
            }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={refresh}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
          >
            {/* ── Summary cards ────────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(400).delay(50)}>
              <Text style={{
                color:         COLORS.textMuted,
                fontSize:      FONTS.sizes.xs,
                fontWeight:    '600',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom:  SPACING.sm,
              }}>
                Research Summary
              </Text>
            </Animated.View>

            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm }}>
              <SummaryCard
                icon="time-outline"
                label="Hours Saved"
                value={formatHours(data?.hoursResearched ?? 0)}
                sublabel="from manual research"
                color={COLORS.primary}
                delay={80}
              />
              <SummaryCard
                icon="create-outline"
                label="Words Generated"
                value={formatNumber(data?.wordsGenerated ?? 0)}
                sublabel="across all reports"
                color={COLORS.secondary}
                delay={120}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl }}>
              <SummaryCard
                icon="document-text-outline"
                label="Reports"
                value={String(data?.totalReports ?? 0)}
                sublabel="total completed"
                color={COLORS.info}
                delay={160}
              />
              <SummaryCard
                icon="flame-outline"
                label="Day Streak"
                value={String(data?.currentStreak ?? 0)}
                sublabel={`best: ${data?.longestStreak ?? 0} days`}
                color={COLORS.warning}
                delay={200}
              />
            </View>

            {/* ── Monthly goal ──────────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(400).delay(240)}>
              <Text style={{
                color:         COLORS.textMuted,
                fontSize:      FONTS.sizes.xs,
                fontWeight:    '600',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom:  SPACING.sm,
              }}>
                This Month
              </Text>
            </Animated.View>

            <MonthlyGoalCard
              reportsThisMonth={data?.reportsThisMonth ?? 0}
              monthlyGoal={data?.monthlyGoal ?? 10}
              onEditGoal={() => setGoalModalVisible(true)}
              delay={260}
            />

            {/* Content breakdown */}
            {data && (data.totalPodcasts > 0 || data.totalDebates > 0 || data.totalPapers > 0) && (
              <Animated.View
                entering={FadeInDown.duration(400).delay(290)}
                style={{ marginBottom: SPACING.xl }}
              >
                <View style={{
                  flexDirection: 'row',
                  gap:           SPACING.sm,
                }}>
                  {[
                    { icon: 'radio-outline',   label: 'Podcasts',        value: data.totalPodcasts, color: COLORS.secondary },
                    { icon: 'people-outline',  label: 'Debates',         value: data.totalDebates,  color: COLORS.accent    },
                    { icon: 'school-outline',  label: 'Academic Papers', value: data.totalPapers,   color: COLORS.warning   },
                  ].filter(i => i.value > 0).map(item => (
                    <View
                      key={item.label}
                      style={{
                        flex:            1,
                        backgroundColor: `${item.color}12`,
                        borderRadius:    RADIUS.lg,
                        padding:         SPACING.sm,
                        alignItems:      'center',
                        borderWidth:     1,
                        borderColor:     `${item.color}20`,
                      }}
                    >
                      <Ionicons name={item.icon as any} size={18} color={item.color} />
                      <Text style={{
                        color:     item.color,
                        fontSize:  FONTS.sizes.lg,
                        fontWeight: '800',
                        marginTop: 4,
                      }}>
                        {item.value}
                      </Text>
                      <Text style={{
                        color:    COLORS.textMuted,
                        fontSize: 10,
                        textAlign: 'center',
                        marginTop: 2,
                      }}>
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* ── Weekly heatmap ────────────────────────────────────────────── */}
            {data && data.weeklyHeatmap.length > 0 && (
              <>
                <Animated.View entering={FadeInDown.duration(400).delay(320)}>
                  <Text style={{
                    color:         COLORS.textMuted,
                    fontSize:      FONTS.sizes.xs,
                    fontWeight:    '600',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom:  SPACING.sm,
                  }}>
                    Weekly Activity
                  </Text>
                </Animated.View>
                <WeeklyHeatmap days={data.weeklyHeatmap} delay={340} />
              </>
            )}

            {/* ── Topic distribution ────────────────────────────────────────── */}
            {data && data.topicDistribution.length > 0 && (
              <>
                <Animated.View entering={FadeInDown.duration(400).delay(440)}>
                  <Text style={{
                    color:         COLORS.textMuted,
                    fontSize:      FONTS.sizes.xs,
                    fontWeight:    '600',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom:  SPACING.sm,
                    marginTop:     SPACING.md,
                  }}>
                    Topic Breakdown
                  </Text>
                </Animated.View>
                <TopicDistributionCard topics={data.topicDistribution} delay={460} />
              </>
            )}

            {/* ── Milestone badges ──────────────────────────────────────────── */}
            {data && data.milestones.length > 0 && (
              <>
                <Animated.View entering={FadeInDown.duration(400).delay(560)}>
                  <View style={{
                    flexDirection:   'row',
                    alignItems:      'center',
                    justifyContent:  'space-between',
                    marginBottom:    SPACING.sm,
                    marginTop:       SPACING.md,
                  }}>
                    <Text style={{
                      color:         COLORS.textMuted,
                      fontSize:      FONTS.sizes.xs,
                      fontWeight:    '600',
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                    }}>
                      Milestones
                    </Text>
                    <Text style={{
                      color:    COLORS.warning,
                      fontSize: FONTS.sizes.xs,
                      fontWeight: '700',
                    }}>
                      {achievedCount} / {totalBadges} earned
                    </Text>
                  </View>
                </Animated.View>

                <View style={{
                  flexDirection: 'row',
                  flexWrap:      'wrap',
                  gap:           SPACING.sm,
                }}>
                  {data.milestones.map((badge, i) => (
                    <MilestoneBadgeCard
                      key={badge.id}
                      badge={badge}
                      delay={580 + i * 35}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Empty state */}
            {data && data.totalReports === 0 && (
              <Animated.View
                entering={FadeIn.duration(500).delay(300)}
                style={{
                  alignItems:      'center',
                  paddingVertical: SPACING['2xl'],
                }}
              >
                <Ionicons name="analytics-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
                <Text style={{
                  color:      COLORS.textSecondary,
                  fontSize:   FONTS.sizes.base,
                  fontWeight: '600',
                  textAlign:  'center',
                  marginBottom: SPACING.sm,
                }}>
                  No data yet
                </Text>
                <Text style={{
                  color:    COLORS.textMuted,
                  fontSize: FONTS.sizes.sm,
                  textAlign: 'center',
                  lineHeight: 20,
                }}>
                  Complete your first research report and your insights will appear here.
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(app)/research-input' as any)}
                  style={{ marginTop: SPACING.lg }}
                  activeOpacity={0.82}
                >
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      borderRadius:      RADIUS.xl,
                      paddingHorizontal: SPACING.xl,
                      paddingVertical:   14,
                      flexDirection:     'row',
                      alignItems:        'center',
                      gap:                8,
                    }}
                  >
                    <Ionicons name="telescope" size={16} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' }}>
                      Start Your First Research
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}
          </ScrollView>
        )}

        {/* Edit goal modal */}
        <EditGoalModal
          visible={goalModalVisible}
          currentGoal={data?.monthlyGoal ?? 10}
          onSave={handleSaveGoal}
          onClose={() => setGoalModalVisible(false)}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}