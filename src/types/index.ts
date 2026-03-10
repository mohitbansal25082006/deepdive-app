// src/types/index.ts
// Parts 1 + 2 + 3 + 4 — PublicShareInfo removed; ResearchReport no longer
// has isPublic / publicToken / publicViewCount fields.

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