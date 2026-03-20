// src/types/onboarding.ts
// Part 27 (Patch C) — 12 focused milestones replacing the previous 20.

// ─── Onboarding Status ────────────────────────────────────────────────────────

export interface OnboardingStatus {
  userId:              string;
  onboardingCompleted: boolean;
  selectedInterests:   string[];
  monthlyReportGoal:   number;
  completedStep:       number;
  completedAt:         string | null;
}

// ─── Interest Topics ──────────────────────────────────────────────────────────

export interface InterestTopic {
  id:       string;
  label:    string;
  icon:     string;
  gradient: readonly [string, string];
  category: string;
  keywords: string[];
}

export const INTEREST_TOPICS: InterestTopic[] = [
  {
    id: 'ai_ml', label: 'AI & Machine Learning',
    icon: 'hardware-chip-outline', category: 'tech',
    gradient: ['#6C63FF', '#8B5CF6'],
    keywords: ['artificial intelligence', 'machine learning', 'llm models'],
  },
  {
    id: 'crypto_web3', label: 'Crypto & Web3',
    icon: 'logo-bitcoin', category: 'finance',
    gradient: ['#F7931A', '#FF6B35'],
    keywords: ['crypto regulation', 'blockchain', 'defi web3'],
  },
  {
    id: 'climate', label: 'Climate & Sustainability',
    icon: 'leaf-outline', category: 'science',
    gradient: ['#43E97B', '#38F9D7'],
    keywords: ['climate tech', 'renewable energy', 'sustainability'],
  },
  {
    id: 'biotech', label: 'Biotech & Health',
    icon: 'medical-outline', category: 'science',
    gradient: ['#FF6584', '#FF8E53'],
    keywords: ['biotech startups', 'genomics', 'digital health'],
  },
  {
    id: 'space', label: 'Space & Aerospace',
    icon: 'planet-outline', category: 'science',
    gradient: ['#667EEA', '#764BA2'],
    keywords: ['space economy', 'satellite tech', 'aerospace'],
  },
  {
    id: 'fintech', label: 'Fintech & Finance',
    icon: 'trending-up-outline', category: 'finance',
    gradient: ['#11998E', '#38EF7D'],
    keywords: ['fintech startups', 'banking tech', 'payment systems'],
  },
  {
    id: 'cybersecurity', label: 'Cybersecurity',
    icon: 'shield-checkmark-outline', category: 'tech',
    gradient: ['#F953C6', '#B91D73'],
    keywords: ['cybersecurity threats', 'data privacy', 'zero trust'],
  },
  {
    id: 'ev', label: 'Electric Vehicles',
    icon: 'car-sport-outline', category: 'tech',
    gradient: ['#30CFD0', '#667EEA'],
    keywords: ['electric vehicles', 'ev battery', 'autonomous vehicles'],
  },
  {
    id: 'quantum', label: 'Quantum Computing',
    icon: 'flask-outline', category: 'science',
    gradient: ['#4776E6', '#8E54E9'],
    keywords: ['quantum computing', 'quantum cryptography'],
  },
  {
    id: 'gaming', label: 'Gaming & Metaverse',
    icon: 'game-controller-outline', category: 'entertainment',
    gradient: ['#FF6B6B', '#FFA500'],
    keywords: ['gaming industry', 'metaverse', 'vr ar tech'],
  },
  {
    id: 'geopolitics', label: 'Geopolitics & Policy',
    icon: 'earth-outline', category: 'world',
    gradient: ['#2193B0', '#6DD5ED'],
    keywords: ['geopolitics', 'international trade', 'tech policy'],
  },
  {
    id: 'startups', label: 'Startups & Venture Capital',
    icon: 'rocket-outline', category: 'business',
    gradient: ['#DA22FF', '#9733EE'],
    keywords: ['startup funding', 'venture capital', 'unicorn startups'],
  },
  {
    id: 'robotics', label: 'Robotics & Automation',
    icon: 'construct-outline', category: 'tech',
    gradient: ['#56CCF2', '#2F80ED'],
    keywords: ['robotics', 'automation', 'industrial ai'],
  },
  {
    id: 'energy', label: 'Renewable Energy',
    icon: 'flash-outline', category: 'science',
    gradient: ['#F2994A', '#F2C94C'],
    keywords: ['solar energy', 'nuclear fusion', 'energy storage'],
  },
  {
    id: 'social_media', label: 'Social Media & Tech',
    icon: 'share-social-outline', category: 'tech',
    gradient: ['#FC466B', '#3F5EFB'],
    keywords: ['social media trends', 'creator economy', 'content platforms'],
  },
];

export const MIN_INTERESTS = 3;

// ─── Analytics Dashboard ──────────────────────────────────────────────────────

export interface WeeklyHeatmapDay {
  date:    string;
  dayName: string;
  dayNum:  string;
  count:   number;
  isToday: boolean;
  level:   0 | 1 | 2 | 3;
}

export interface TopicChartItem {
  keyword: string;
  score:   number;
  color:   string;
  percent: number;
}

// ── 12 milestone IDs — accurate and meaningful ────────────────────────────────

export type MilestoneId =
  // Research volume (3)
  | 'first_report'
  | 'research_10'
  | 'research_50'
  // Research depth (2)
  | 'first_expert'
  | 'expert_5'
  // Consistency streaks (3)
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  // Content creation (3)
  | 'first_podcast'
  | 'first_debate'
  | 'all_formats'
  // Power user (1)
  | 'first_referral';

export interface MilestoneBadge {
  id:            MilestoneId;
  label:         string;
  description:   string;
  icon:          string;
  color:         string;
  gradient:      readonly [string, string];
  category:      string;
  achieved:      boolean;
  progress:      number;
  currentCount:  number;
  requiredCount: number;
}

export interface AnalyticsDashboardData {
  hoursResearched:    number;
  wordsGenerated:     number;
  totalReports:       number;
  reportsThisMonth:   number;
  monthlyGoal:        number;
  totalPodcasts:      number;
  totalDebates:       number;
  totalPapers:        number;
  totalPresentations: number;
  totalSourcesAll:    number;
  expertReports:      number;
  kbQueriesCount:     number;
  referralsCount:     number;
  weeklyHeatmap:      WeeklyHeatmapDay[];
  currentStreak:      number;
  longestStreak:      number;
  topicDistribution:  TopicChartItem[];
  milestones:         MilestoneBadge[];
}

// ─── Referral ─────────────────────────────────────────────────────────────────

export interface ReferralStats {
  code:           string;
  totalReferrals: number;
  creditsEarned:  number;
  /** Number of different codes this user has successfully redeemed (0 = none yet) */
  redeemedCount:  number;
}

export interface ReferralRedeemResult {
  success:         boolean;
  message:         string;
  creditsAwarded?: number;
  newBalance?:     number;
}

export interface ReferralState {
  stats:        ReferralStats | null;
  isLoading:    boolean;
  isRedeeming:  boolean;
  redeemResult: ReferralRedeemResult | null;
  error:        string | null;
}

// ─── Topic chart colours ──────────────────────────────────────────────────────

export const TOPIC_CHART_COLORS = [
  '#6C63FF', '#FF6584', '#43E97B', '#FFA726',
  '#29B6F6', '#EC407A', '#66BB6A', '#AB47BC',
] as const;