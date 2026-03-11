// src/types/index.ts
// Parts 1 + 2 + 3 + 4 + 5 — Added slide / presentation types for AI Slide Generator

// ─── Auth & Profile ───────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  occupation: string | null;
  interests: string[] | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  created_at: string;
}

export interface OnboardingSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  gradientColors: readonly [string, string];
}

// ─── Research Input ───────────────────────────────────────────────────────────

export type ResearchDepth = 'quick' | 'deep' | 'expert';

export interface ResearchInput {
  query: string;
  depth: ResearchDepth;
  focusAreas: string[];
}

// ─── Agent Progress ───────────────────────────────────────────────────────────

export type AgentName =
  | 'planner'
  | 'searcher'
  | 'analyst'
  | 'factchecker'
  | 'reporter'
  | 'visualizer';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentStep {
  agent: AgentName;
  label: string;
  description: string;
  status: AgentStatus;
  startedAt?: number;
  completedAt?: number;
  detail?: string;
}

// ─── Research Plan ────────────────────────────────────────────────────────────

export interface ResearchPlan {
  topic: string;
  subtopics: string[];
  searchQueries: string[];
  researchGoals: string[];
  estimatedDepth: ResearchDepth;
  keyEntities: string[];
}

// ─── Web Search Results ───────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  source?: string;
  position: number;
  thumbnail?: string;
  imageUrl?: string;
}

export interface SearchBatch {
  query: string;
  results: SearchResult[];
}

// ─── Analysis Output ──────────────────────────────────────────────────────────

export interface ExtractedFact {
  claim: string;
  source: string;
  url: string;
  confidence: number;
}

export interface ExtractedStatistic {
  value: string;
  context: string;
  source: string;
  url: string;
}

export interface ExtractedTrend {
  trend: string;
  direction: 'rising' | 'falling' | 'stable' | 'emerging';
  evidence: string;
}

export interface AnalysisOutput {
  facts: ExtractedFact[];
  statistics: ExtractedStatistic[];
  trends: ExtractedTrend[];
  companies: string[];
  keyThemes: string[];
  contradictions: string[];
}

// ─── Fact-check Output ────────────────────────────────────────────────────────

export interface FactCheckOutput {
  verifiedFacts: ExtractedFact[];
  flaggedClaims: { claim: string; reason: string }[];
  reliabilityScore: number;
  sourceDiversity: number;
  notes: string;
}

// ─── Report (final output) ────────────────────────────────────────────────────

export interface Citation {
  id: string;
  title: string;
  url: string;
  source: string;
  date?: string;
  snippet: string;
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  bullets?: string[];
  statistics?: ExtractedStatistic[];
  citationIds: string[];
  icon?: string;
}

// ─── Part 4: Knowledge Graph ──────────────────────────────────────────────────

export type KnowledgeNodeType =
  | 'root'
  | 'primary'
  | 'secondary'
  | 'concept'
  | 'company'
  | 'trend';

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: KnowledgeNodeType;
  weight: number;
  description?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string | KnowledgeGraphNode;
  target: string | KnowledgeGraphNode;
  label?: string;
  strength: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  generatedAt: string;
}

// ─── Part 4: Infographics ─────────────────────────────────────────────────────

export type ChartType = 'bar' | 'line' | 'pie' | 'stat' | 'timeline';

export interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

export interface InfographicChart {
  id: string;
  type: ChartType;
  title: string;
  subtitle?: string;
  labels?: string[];
  datasets?: ChartDataset[];
  unit?: string;
  insight?: string;
}

export interface InfographicStat {
  id: string;
  label: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: string;
  color?: string;
}

export interface InfographicData {
  charts: InfographicChart[];
  stats: InfographicStat[];
  generatedAt: string;
}

// ─── Part 4: Source Images ────────────────────────────────────────────────────

export interface SourceImage {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
}

// ─── Research Report ──────────────────────────────────────────────────────────

export interface ResearchReport {
  id: string;
  userId: string;
  query: string;
  depth: ResearchDepth;
  focusAreas: string[];

  title: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyFindings: string[];
  futurePredictions: string[];
  citations: Citation[];
  statistics: ExtractedStatistic[];

  searchQueries: string[];
  sourcesCount: number;
  reliabilityScore: number;

  status: ResearchStatus;
  errorMessage?: string;
  agentLogs: AgentStep[];

  // Part 3
  isPinned?: boolean;
  tags?: string[];
  exportCount?: number;
  viewCount?: number;

  // Part 4 visuals
  knowledgeGraph?: KnowledgeGraph;
  infographicData?: InfographicData;
  sourceImages?: SourceImage[];

  // Part 5 — Slide Generator
  presentationId?: string;
  slideCount?: number;

  createdAt: string;
  completedAt?: string;
}

export type ResearchStatus =
  | 'pending'
  | 'planning'
  | 'searching'
  | 'analyzing'
  | 'fact_checking'
  | 'generating'
  | 'visualizing'
  | 'completed'
  | 'failed';

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  reportId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface OrchestratorCallbacks {
  onStepUpdate: (steps: AgentStep[]) => void;
  onStepDetail: (agent: AgentName, detail: string) => void;
  onComplete: (report: ResearchReport) => void;
  onError: (message: string) => void;
}

// ─── Part 3: Stats & Subscription ────────────────────────────────────────────

export interface UserStats {
  totalReports: number;
  completedReports: number;
  totalSources: number;
  avgReliability: number;
  favoriteTopic: string | null;
  reportsThisMonth: number;
  hoursResearched: number;
}

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface UserSubscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  reportsUsedThisMonth: number;
  reportsLimit: number;
  resetDate: string;
}

export interface SavedTopic {
  id: string;
  userId: string;
  topic: string;
  lastCheckedAt: string;
  notifyOnUpdate: boolean;
  createdAt: string;
}

export type CitationFormat = 'apa' | 'mla' | 'chicago';

export interface FormattedCitation {
  id: string;
  format: CitationFormat;
  formatted: string;
  raw: Citation;
}

// ─── Part 5: AI Slide Generator ───────────────────────────────────────────────

/**
 * Visual layout of a slide.
 * - title      : Full-screen cover with large title + subtitle
 * - agenda     : Numbered list of topics/sections (table of contents)
 * - section    : Divider slide for a new section (big label, minimal text)
 * - content    : Title + paragraph body text
 * - bullets    : Title + bulleted list (up to 6 bullets)
 * - stats      : Title + 3–4 stat cards (value + label)
 * - quote      : Pull-quote / highlighted key finding
 * - chart_ref  : Title + reference to infographic data + insight text
 * - predictions: Title + numbered future outlook items
 * - references : Title + numbered citation list
 * - closing    : Thank-you / branding slide
 */
export type SlideLayout =
  | 'title'
  | 'agenda'
  | 'section'
  | 'content'
  | 'bullets'
  | 'stats'
  | 'quote'
  | 'chart_ref'
  | 'predictions'
  | 'references'
  | 'closing';

/** A single stat displayed on a stats-layout slide */
export interface SlideStatItem {
  value: string;
  label: string;
  color?: string;   // hex WITH # — used by the app; stripped before pptxgenjs
}

/** One slide in a generated presentation */
export interface PresentationSlide {
  id: string;
  slideNumber: number;
  layout: SlideLayout;

  // Primary content — all layouts use at least title
  title: string;

  // Layout-specific content
  subtitle?: string;           // title, section, closing
  body?: string;               // content, chart_ref
  bullets?: string[];          // bullets, predictions, agenda, references
  stats?: SlideStatItem[];     // stats
  quote?: string;              // quote
  quoteAttribution?: string;   // quote — "— Source, Year"
  sectionTag?: string;         // section — small label above the big title
  badgeText?: string;          // title — small top badge e.g. "DeepDive AI · 2024"

  /** Optional presenter notes (not visible on slides) */
  speakerNotes?: string;

  /** Accent color override (app hex, e.g. '#6C63FF') — defaults to theme primary */
  accentColor?: string;

  /** Icon name from @expo/vector-icons (Ionicons) — used in app preview only */
  icon?: string;
}

/** Available visual themes for a presentation */
export type PresentationTheme = 'dark' | 'light' | 'corporate' | 'vibrant';

/** Theme colour tokens used by the slide renderer and PPTX builder */
export interface PresentationThemeTokens {
  background: string;       // slide background hex (app format WITH #)
  surface: string;          // card / elevated surface hex
  primary: string;          // accent / highlight colour hex
  textPrimary: string;      // heading text hex
  textSecondary: string;    // body text hex
  textMuted: string;        // caption / footnote text hex
  border: string;           // divider / border hex
  // PPTX versions — same colours WITHOUT the # prefix
  pptx: {
    background: string;
    surface: string;
    primary: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    border: string;
  };
}

/** A complete generated presentation */
export interface GeneratedPresentation {
  /** Supabase row id (set after persisting, empty string while in-memory) */
  id: string;
  reportId: string;
  userId: string;

  title: string;
  subtitle: string;

  theme: PresentationTheme;
  themeTokens: PresentationThemeTokens;

  slides: PresentationSlide[];
  totalSlides: number;

  generatedAt: string;
  exportCount: number;
}

/** State managed by useSlideGenerator */
export interface SlideGeneratorState {
  presentation: GeneratedPresentation | null;
  isGenerating: boolean;
  isExporting: boolean;
  exportFormat: SlideExportFormat | null;
  progress: string;
  error: string | null;
}

/** Supported export formats */
export type SlideExportFormat = 'pptx' | 'pdf' | 'html';

/** Raw output from the slideAgent (before wrapping in GeneratedPresentation) */
export interface SlideAgentOutput {
  presentationTitle: string;
  presentationSubtitle: string;
  slides: Omit<PresentationSlide, 'slideNumber'>[];
}