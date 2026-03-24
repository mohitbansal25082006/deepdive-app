// src/types/report.ts
// Public-Reports — Shared TypeScript types
// These mirror the relevant fields from the React Native app's src/types/index.ts
// but are standalone for the Next.js project (no React Native deps).

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

// ─── Infographics ────────────────────────────────────────────────────────────

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

// ─── Public Report (assembled from DB row) ────────────────────────────────────

export interface PublicReport {
  reportId:          string;
  shareLinkId:       string;
  viewCount:         number;
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
  createdAt:  string;
  isActive:   boolean;
}