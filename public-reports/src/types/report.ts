// Public-Reports/src/types/report.ts
// Part 34 — Added: tags, shareCount, PublicFeedReport, TrendingReport,
//                  SectionReactionData, ReactionEmoji, TagCount

// ─── Source Trust ─────────────────────────────────────────────────────────────

export type SourceBias =
  | 'left' | 'center-left' | 'center' | 'center-right' | 'right'
  | 'financial' | 'technical' | 'academic' | 'government' | 'unknown';

export type SourceTrustTier = 1 | 2 | 3 | 4;

export interface SourceTrustScore {
  credibilityScore: number;
  bias:             SourceBias;
  tier:             SourceTrustTier;
  tierLabel:        string;
  domainAuthority:  number;
  isVerified:       boolean;
  tags:             string[];
}

// ─── Core Report Types ────────────────────────────────────────────────────────

export interface Citation {
  id:          string;
  title:       string;
  url:         string;
  source:      string;
  date?:       string;
  snippet:     string;
  trustScore?: SourceTrustScore;
}

export interface ExtractedStatistic {
  value:   string;
  context: string;
  source:  string;
  url:     string;
}

export interface ReportSection {
  id:          string;
  title:       string;
  content:     string;
  bullets?:    string[];
  statistics?: ExtractedStatistic[];
  citationIds: string[];
  icon?:       string;
}

// ─── Infographics ─────────────────────────────────────────────────────────────

export interface InfographicStat {
  id:          string;
  label:       string;
  value:       string;
  change?:     string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?:       string;
  color?:      string;
}

export interface InfographicChart {
  id:        string;
  type:      'bar' | 'line' | 'pie' | 'stat' | 'timeline';
  title:     string;
  subtitle?: string;
  labels?:   string[];
  datasets?: { label: string; data: number[]; color?: string }[];
  unit?:     string;
  insight?:  string;
}

export interface InfographicData {
  charts:      InfographicChart[];
  stats:       InfographicStat[];
  generatedAt: string;
}

// ─── Source Images ────────────────────────────────────────────────────────────

export interface SourceImage {
  url:           string;
  thumbnailUrl?: string;
  title?:        string;
  sourceUrl?:    string;
  width?:        number;
  height?:       number;
}

// ─── Public Report (assembled from DB row) ─────────────────────────────────────

export interface PublicReport {
  reportId:          string;
  shareLinkId:       string;
  viewCount:         number;
  shareCount:        number;         // ← Part 34: how many times shared via native sheet
  tags:              string[];       // ← Part 34: up to 5 topic tags
  query:             string;
  depth:             'quick' | 'deep' | 'expert';
  title:             string;
  executiveSummary:  string;
  sections:          ReportSection[];
  keyFindings:       string[];
  futurePredictions: string[];
  citations:         Citation[];
  statistics:        ExtractedStatistic[];
  sourcesCount:      number;
  reliabilityScore:  number;
  infographicData?:  InfographicData;
  sourceImages?:     SourceImage[];
  researchMode:      'standard' | 'academic';
  completedAt?:      string;
  createdAt:         string;
  ownerUsername?:    string;
  ownerAvatarUrl?:   string;
}

// ─── Part 34: Discovery Feed ──────────────────────────────────────────────────

/** Lightweight report card used in the Discover feed and topic tag pages */
export interface PublicFeedReport {
  shareId:       string;
  viewCount:     number;
  shareCount:    number;
  cachedTitle:   string;
  cachedSummary: string;
  tags:          string[];
  depth:         'quick' | 'deep' | 'expert';
  researchMode?: 'standard' | 'academic';
  ownerUsername?: string;
  createdAt:     string;
  lastViewedAt?: string;
}

/** Trending report used in the sidebar widget */
export interface TrendingReport {
  shareId:       string;
  viewCount:     number;
  cachedTitle:   string;
  tags:          string[];
  depth:         'quick' | 'deep' | 'expert';
  ownerUsername?: string;
  createdAt:     string;
}

/** Tag with usage count — for tag cloud / filter chips */
export interface TagCount {
  tag:   string;
  count: number;
}

// ─── Part 34: Section Reactions ───────────────────────────────────────────────

export const REACTION_EMOJIS = ['💡', '😮', '🤔', '👍'] as const;
export type ReactionEmoji = typeof REACTION_EMOJIS[number];

export const REACTION_LABELS: Record<ReactionEmoji, string> = {
  '💡': 'Insightful',
  '😮': 'Surprising',
  '🤔': 'Disagree',
  '👍': 'Useful',
};

/** Per-emoji data for one section — returned by /api/reactions */
export interface EmojiCount {
  emoji:      ReactionEmoji;
  count:      number;
  hasReacted: boolean;
}

/** All reactions for one section */
export interface SectionReactionData {
  sectionId: string;
  emojis:    EmojiCount[];
}

/** Shape returned by /api/reactions GET */
export interface ReportReactionsResponse {
  /** Map from sectionId → { emoji → count } */
  bySection: Record<string, Record<ReactionEmoji, { count: number; hasReacted: boolean }>>;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface PublicChatMessage {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  timestamp: number;
}

export interface PublicChatRequest {
  shareId:  string;
  question: string;
  history:  { role: 'user' | 'assistant'; content: string }[];
}

export interface PublicChatResponse {
  answer:        string;
  limitReached:  boolean;
  questionsUsed: number;
  questionsMax:  number;
  error?:        string;
}

// ─── Share Link ───────────────────────────────────────────────────────────────

export interface ShareLink {
  shareId:    string;
  publicUrl:  string;
  viewCount:  number;
  shareCount: number;
  tags:       string[];
  isActive:   boolean;
  createdAt:  string;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────

export interface DiscoverFeedResponse {
  reports: PublicFeedReport[];
  sort:    'trending' | 'recent';
  tag:     string | null;
  hasMore: boolean;
}

export interface SearchResponse {
  results: (PublicFeedReport & { rank: number })[];
  query:   string;
}

export interface TrendingResponse {
  reports: TrendingReport[];
}

export interface TagsResponse {
  tags: TagCount[];
}