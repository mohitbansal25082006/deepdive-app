// src/services/onboardingService.ts
// Part 43 CRASH FIX — never throws for new OAuth users.
//
// ROOT CAUSE:
//   New OAuth users have no row in the onboarding_status table.
//   checkOnboardingStatus() called get_onboarding_status RPC which either
//   threw or returned null for missing users. The caller in app/(app)/_layout.tsx
//   catches this, but the throw could race with other provider initialization.
//   More critically, completeOnboarding() in onboarding-flow.tsx could also
//   throw for brand-new users if the RPC doesn't handle missing rows via upsert.
//
// THE FIX:
//   1. checkOnboardingStatus() catches ALL errors and returns a safe default
//      { onboardingCompleted: false } instead of throwing.
//   2. completeOnboarding() tries the RPC first, falls back to direct upsert
//      if the RPC errors, and NEVER throws to the caller.
//   3. All analytics functions also wrapped in safe try/catch.
//
// All Part 27 milestone/analytics/streak logic preserved unchanged.

import { supabase }     from '../lib/supabase';
import AsyncStorage     from '@react-native-async-storage/async-storage';
import {
  OnboardingStatus,
  AnalyticsDashboardData,
  WeeklyHeatmapDay,
  TopicChartItem,
  MilestoneBadge,
  TOPIC_CHART_COLORS,
} from '../types/onboarding';

const onboardingCacheKey = (userId: string) =>
  `@deepdive/onboarding_v1_${userId}`;

// Safe default for new users who have no onboarding row yet
const defaultStatus = (userId: string): OnboardingStatus => ({
  userId,
  onboardingCompleted: false,
  selectedInterests:   [],
  monthlyReportGoal:   10,
  completedStep:       0,
  completedAt:         null,
});

// ─── Onboarding status ────────────────────────────────────────────────────────

export async function checkOnboardingStatus(
  userId: string,
  force = false,
): Promise<OnboardingStatus> {
  const cacheKey = onboardingCacheKey(userId);

  // Check cache first (unless forced)
  if (!force) {
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw) as OnboardingStatus;
    } catch {
      // Cache read failed — proceed to DB
    }
  }

  // ── CRASH FIX: wrap entire DB call in try/catch, never throw ─────────────
  try {
    const { data, error } = await supabase
      .rpc('get_onboarding_status', { p_user_id: userId });

    // If RPC errors or returns nothing, return safe default (new user)
    if (error || !data) {
      console.warn('[Onboarding] get_onboarding_status returned no data for user:', userId);
      return defaultStatus(userId);
    }

    const row = Array.isArray(data) ? data[0] : data;

    // If row is null/empty (new user, no DB record yet), return safe default
    if (!row) {
      return defaultStatus(userId);
    }

    const status: OnboardingStatus = {
      userId,
      onboardingCompleted: row?.onboarding_completed ?? false,
      selectedInterests:   row?.selected_interests   ?? [],
      monthlyReportGoal:   row?.monthly_report_goal  ?? 10,
      completedStep:       row?.completed_step        ?? 0,
      completedAt:         row?.completed_at          ?? null,
    };

    // Cache the result
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(status));
    } catch {
      // Cache write failed — non-fatal
    }

    return status;

  } catch (err) {
    // ── CRASH FIX: Any unexpected error → return safe default ────────────────
    // This handles network errors, RPC not existing, schema mismatches, etc.
    console.warn('[Onboarding] checkOnboardingStatus error (returning default):', err);
    return defaultStatus(userId);
  }
}

export async function completeOnboarding(
  userId:      string,
  interests:   string[],
  monthlyGoal: number = 10,
): Promise<OnboardingStatus> {
  // ── CRASH FIX: try RPC first, fall back to direct upsert ─────────────────
  try {
    const { data, error } = await supabase.rpc('complete_onboarding', {
      p_user_id:      userId,
      p_interests:    interests,
      p_monthly_goal: monthlyGoal,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;

    const status: OnboardingStatus = {
      userId,
      onboardingCompleted: true,
      selectedInterests:   row?.selected_interests  ?? interests,
      monthlyReportGoal:   row?.monthly_report_goal ?? monthlyGoal,
      completedStep:       4,
      completedAt:         row?.completed_at         ?? new Date().toISOString(),
    };

    try {
      await AsyncStorage.setItem(onboardingCacheKey(userId), JSON.stringify(status));
    } catch {}

    return status;

  } catch (rpcErr) {
    console.warn('[Onboarding] complete_onboarding RPC failed, trying direct upsert:', rpcErr);

    // Fallback: direct upsert into onboarding_status table
    try {
      await supabase
        .from('onboarding_status')
        .upsert({
          user_id:              userId,
          onboarding_completed: true,
          selected_interests:   interests,
          monthly_report_goal:  monthlyGoal,
          completed_step:       4,
          completed_at:         new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (upsertErr) {
      console.warn('[Onboarding] Direct upsert also failed:', upsertErr);
      // Non-fatal — still return a completed status so user proceeds to home
    }

    const status: OnboardingStatus = {
      userId,
      onboardingCompleted: true,
      selectedInterests:   interests,
      monthlyReportGoal:   monthlyGoal,
      completedStep:       4,
      completedAt:         new Date().toISOString(),
    };

    try {
      await AsyncStorage.setItem(onboardingCacheKey(userId), JSON.stringify(status));
    } catch {}

    return status;
  }
}

export async function updateMonthlyGoal(
  userId: string,
  goal:   number,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_monthly_goal', {
      p_user_id: userId,
      p_goal:    goal,
    });
    if (error) throw error;

    try {
      const cacheKey = onboardingCacheKey(userId);
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const cached: OnboardingStatus = JSON.parse(raw);
        cached.monthlyReportGoal = goal;
        await AsyncStorage.setItem(cacheKey, JSON.stringify(cached));
      }
    } catch {}
  } catch (err) {
    console.warn('[Onboarding] updateMonthlyGoal error:', err);
    // Non-fatal — don't throw
  }
}

export async function clearOnboardingCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(onboardingCacheKey(userId));
  } catch {}
}

// ─── Analytics data ───────────────────────────────────────────────────────────

export async function getAnalyticsData(userId: string): Promise<AnalyticsDashboardData> {
  try {
    const { data, error } = await supabase.rpc('get_user_analytics_data', {
      p_user_id: userId,
    });

    if (error) throw error;

    const raw = (Array.isArray(data) ? data[0] : data) ?? {};

    const totalReports       = Number(raw.total_reports       ?? 0);
    const reportsThisMonth   = Number(raw.reports_this_month  ?? 0);
    const monthlyGoal        = Number(raw.monthly_goal        ?? 10);
    const totalPodcasts      = Number(raw.total_podcasts      ?? 0);
    const totalDebates       = Number(raw.total_debates       ?? 0);
    const totalPapers        = Number(raw.total_papers        ?? 0);
    const totalPresentations = Number(raw.total_presentations ?? 0);
    const expertReports      = Number(raw.expert_reports      ?? 0);
    const totalSourcesAll    = Number(raw.total_sources_all   ?? 0);
    const kbQueriesCount     = Number(raw.kb_queries_count    ?? 0);
    const referralsCount     = Number(raw.referrals_count     ?? 0);
    const totalWords         = Number(raw.total_words         ?? 0);

    const activityDates: string[] = Array.isArray(raw.activity_dates) ? raw.activity_dates : [];
    const dailyCounts: { date: string; count: number }[] = Array.isArray(raw.daily_counts) ? raw.daily_counts : [];
    const topicRows: { keyword: string; score: number }[] = Array.isArray(raw.topic_distribution) ? raw.topic_distribution : [];

    const hoursResearched = parseFloat((totalWords / 250 / 60).toFixed(1));

    const { current: currentStreak, longest: longestStreak } = computeStreaks(activityDates);
    const weeklyHeatmap     = buildWeeklyHeatmap(dailyCounts);
    const topicDistribution = buildTopicDistribution(topicRows);
    const milestones        = buildMilestones({
      totalReports, expertReports, totalPodcasts, totalDebates,
      totalPapers, totalPresentations, referralsCount,
      currentStreak, longestStreak,
    });

    return {
      hoursResearched,
      wordsGenerated:     totalWords,
      totalReports,
      reportsThisMonth,
      monthlyGoal,
      totalPodcasts,
      totalDebates,
      totalPapers,
      totalPresentations,
      totalSourcesAll,
      expertReports,
      kbQueriesCount,
      referralsCount,
      weeklyHeatmap,
      currentStreak,
      longestStreak,
      topicDistribution,
      milestones,
    };
  } catch (err) {
    console.warn('[Onboarding] getAnalyticsData error:', err);
    // Return empty analytics instead of crashing
    return {
      hoursResearched: 0, wordsGenerated: 0, totalReports: 0,
      reportsThisMonth: 0, monthlyGoal: 10, totalPodcasts: 0,
      totalDebates: 0, totalPapers: 0, totalPresentations: 0,
      totalSourcesAll: 0, expertReports: 0, kbQueriesCount: 0,
      referralsCount: 0, weeklyHeatmap: buildWeeklyHeatmap([]),
      currentStreak: 0, longestStreak: 0,
      topicDistribution: [], milestones: [],
    };
  }
}

// ─── Streak ───────────────────────────────────────────────────────────────────

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

function computeStreaks(dates: string[]): { current: number; longest: number } {
  if (!dates.length) return { current: 0, longest: 0 };

  const set       = new Set(dates);
  const today     = formatDateKey(new Date());
  const yesterday = formatDateKey(new Date(Date.now() - 86_400_000));

  let current = 0;
  const startDate = set.has(today) ? new Date() : set.has(yesterday) ? new Date(Date.now() - 86_400_000) : null;

  if (startDate) {
    const cursor = new Date(startDate);
    while (set.has(formatDateKey(cursor))) {
      current++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  const sorted = [...dates].sort();
  let longest = current;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round(
      (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86_400_000,
    );
    if (diff === 1) { run++; if (run > longest) longest = run; }
    else run = 1;
  }

  return { current, longest: Math.max(longest, current) };
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function buildWeeklyHeatmap(dailyCounts: { date: string; count: number }[]): WeeklyHeatmapDay[] {
  const map      = new Map(dailyCounts.map(d => [d.date, d.count]));
  const today    = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return Array.from({ length: 7 }, (_, i) => {
    const date    = new Date(today.getTime() - (6 - i) * 86_400_000);
    const dateStr = formatDateKey(date);
    const count   = map.get(dateStr) ?? 0;
    return {
      date:    dateStr,
      dayName: dayNames[date.getDay()],
      dayNum:  String(date.getDate()),
      count,
      isToday: i === 6,
      level:   (count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3) as 0 | 1 | 2 | 3,
    };
  });
}

// ─── Topic distribution ───────────────────────────────────────────────────────

function buildTopicDistribution(rows: { keyword: string; score: number }[]): TopicChartItem[] {
  if (!rows.length) return [];
  const total = rows.reduce((s, r) => s + r.score, 0) || 1;
  return rows.slice(0, 6).map((row, idx) => ({
    keyword: row.keyword.replace(/\b\w/g, c => c.toUpperCase()),
    score:   row.score,
    color:   TOPIC_CHART_COLORS[idx % TOPIC_CHART_COLORS.length],
    percent: Math.round((row.score / total) * 100),
  }));
}

// ─── Milestones ───────────────────────────────────────────────────────────────

interface MilestoneInput {
  totalReports:       number;
  expertReports:      number;
  totalPodcasts:      number;
  totalDebates:       number;
  totalPapers:        number;
  totalPresentations: number;
  referralsCount:     number;
  currentStreak:      number;
  longestStreak:      number;
}

function buildMilestones(d: MilestoneInput): MilestoneBadge[] {
  const maxStreak = Math.max(d.currentStreak, d.longestStreak);

  const formatsUsed = [
    d.totalReports       > 0,
    d.totalPodcasts      > 0,
    d.totalDebates       > 0,
    d.totalPapers        > 0,
    d.totalPresentations > 0,
  ].filter(Boolean).length;

  function badge(
    id:           MilestoneBadge['id'],
    label:        string,
    description:  string,
    icon:         string,
    color:        string,
    gradient:     readonly [string, string],
    category:     string,
    current:      number,
    required:     number,
  ): MilestoneBadge {
    return {
      id, label, description, icon, color, gradient, category,
      achieved:      current >= required,
      progress:      required > 0 ? Math.min(1, current / required) : 0,
      currentCount:  Math.min(current, required),
      requiredCount: required,
    };
  }

  return [
    badge('first_report',   'Spark',           'Complete your first research report',                       'flash',        '#FFD700', ['#FFD700', '#FFA500'], 'Research',   d.totalReports,   1),
    badge('research_10',    'Analyst',          'Complete 10 research reports',                              'analytics',    '#6C63FF', ['#6C63FF', '#8B5CF6'], 'Research',   d.totalReports,   10),
    badge('research_50',    'Research Master',  'Complete 50 research reports',                              'ribbon',       '#A855F7', ['#A855F7', '#7C3AED'], 'Research',   d.totalReports,   50),
    badge('first_expert',   'Deep Diver',       'Run your first Expert-depth research',                      'telescope',    '#29B6F6', ['#29B6F6', '#0288D1'], 'Depth',      d.expertReports,  1),
    badge('expert_5',       'Expert Mind',      'Complete 5 Expert-depth research reports',                  'school',       '#0288D1', ['#0288D1', '#01579B'], 'Depth',      d.expertReports,  5),
    badge('streak_3',       'On Fire 🔥',       'Maintain a 3-day activity streak',                         'flame',        '#FF6B35', ['#FF6B35', '#FFA500'], 'Streak',     maxStreak,        3),
    badge('streak_7',       'Star Scholar',     'Maintain a 7-day activity streak',                         'star-outline', '#FFC107', ['#FFC107', '#FF8F00'], 'Streak',     maxStreak,        7),
    badge('streak_30',      'Diamond Mind',     'Maintain a 30-day activity streak',                        'diamond',      '#00BCD4', ['#00BCD4', '#006064'], 'Streak',     maxStreak,        30),
    badge('first_podcast',  'Broadcaster',      'Generate your first AI podcast episode',                   'radio',        '#EC407A', ['#EC407A', '#AD1457'], 'Content',    d.totalPodcasts,  1),
    badge('first_debate',   'Debater',          'Run your first AI debate session',                         'people',       '#26A69A', ['#26A69A', '#00695C'], 'Content',    d.totalDebates,   1),
    badge('all_formats',    'Creator',          'Use all 5 content formats',                                'apps',         '#AB47BC', ['#AB47BC', '#6A1B9A'], 'Content',    formatsUsed,      5),
    badge('first_referral', 'Ambassador',       'Refer your first friend to DeepDive AI',                   'gift',         '#F06292', ['#F06292', '#C2185B'], 'Power User', d.referralsCount, 1),
  ];
}