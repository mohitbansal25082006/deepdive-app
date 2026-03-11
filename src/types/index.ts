// src/types/index.ts
// Parts 1 + 2 + 3 + 4 + 5 + 6 + 7
// Part 7: Added AI Academic Paper Mode types (AcademicPaper, AcademicSection, etc.)

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

/**
 * Part 7: Research output mode.
 * - 'standard' → the existing multi-section report (default)
 * - 'academic' → generates an additional structured academic paper after the
 *                standard pipeline completes
 */
export type ResearchMode = 'standard' | 'academic';

export interface ResearchInput {
  query: string;
  depth: ResearchDepth;
  focusAreas: string[];
  /** Part 7 — defaults to 'standard' when omitted */
  mode?: ResearchMode;
}

// ─── Agent Progress ───────────────────────────────────────────────────────────

export type AgentName =
  | 'planner'
  | 'searcher'
  | 'analyst'
  | 'factchecker'
  | 'reporter'
  | 'visualizer'
  | 'academic'; // Part 7

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

  // Part 7 — Academic Paper Mode
  academicPaperId?: string;
  researchMode?: ResearchMode;

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
  | 'writing_paper'    // Part 7
  | 'completed'
  | 'failed';

// ─── Part 2: Conversation (legacy — kept for backward compat) ─────────────────

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
  // Part 6 additions
  totalAssistantMessages?: number;
  reportsWithEmbeddings?: number;
  // Part 7 additions
  academicPapersGenerated?: number;
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

export interface SlideStatItem {
  value: string;
  label: string;
  color?: string;
}

export interface PresentationSlide {
  id: string;
  slideNumber: number;
  layout: SlideLayout;
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  stats?: SlideStatItem[];
  quote?: string;
  quoteAttribution?: string;
  sectionTag?: string;
  badgeText?: string;
  speakerNotes?: string;
  accentColor?: string;
  icon?: string;
}

export type PresentationTheme = 'dark' | 'light' | 'corporate' | 'vibrant';

export interface PresentationThemeTokens {
  background: string;
  surface: string;
  primary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
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

export interface GeneratedPresentation {
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

export interface SlideGeneratorState {
  presentation: GeneratedPresentation | null;
  isGenerating: boolean;
  isExporting: boolean;
  exportFormat: SlideExportFormat | null;
  progress: string;
  error: string | null;
}

export type SlideExportFormat = 'pptx' | 'pdf' | 'html';

export interface SlideAgentOutput {
  presentationTitle: string;
  presentationSubtitle: string;
  slides: Omit<PresentationSlide, 'slideNumber'>[];
}

// ─── Part 6: AI Research Assistant Chat (RAG Pipeline) ───────────────────────

export type AssistantMode =
  | 'general'
  | 'beginner'
  | 'compare'
  | 'contradictions'
  | 'questions'
  | 'summarize'
  | 'factcheck';

export interface RetrievedChunkInfo {
  chunkId:    string;
  chunkType:  string;
  similarity: number;
}

export interface AssistantMessage {
  id:                 string;
  reportId:           string;
  userId:             string;
  role:               'user' | 'assistant';
  content:            string;
  mode:               AssistantMode;
  retrievedChunks?:   RetrievedChunkInfo[];
  suggestedFollowUps?: string[];
  isRAGPowered?:      boolean;
  confidence?:        'high' | 'medium' | 'low';
  createdAt:          string;
}

export interface AssistantAgentResponse {
  content:             string;
  mode:                AssistantMode;
  detectedMode:        AssistantMode;
  appliedMode:         AssistantMode;
  suggestedFollowUps:  string[];
  usedRAG:             boolean;
  retrievedChunkCount: number;
  confidence:          'high' | 'medium' | 'low';
}

export interface AssistantState {
  messages:      AssistantMessage[];
  isEmbedding:   boolean;
  isSending:     boolean;
  isEmbedded:    boolean;
  embedProgress: { done: number; total: number } | null;
  activeMode:    AssistantMode;
  error:         string | null;
}

export interface ReportEmbeddingStats {
  totalChunks: number;
  chunkTypes:  Record<string, number>;
  embeddedAt:  string | null;
}

// ─── Part 7: AI Academic Paper Mode ──────────────────────────────────────────

/**
 * Supported academic citation styles for the paper output.
 */
export type AcademicCitationStyle = 'apa' | 'mla' | 'chicago' | 'ieee';

/**
 * The seven canonical sections of an academic research paper.
 */
export type AcademicSectionType =
  | 'abstract'
  | 'introduction'
  | 'literature_review'
  | 'methodology'
  | 'findings'
  | 'conclusion'
  | 'references';

/**
 * A subsection within a major academic section (e.g. "2.1 Background").
 */
export interface AcademicSubsection {
  id: string;
  title: string;
  content: string;
}

/**
 * A single section in the academic paper (e.g. Introduction, Methodology).
 * Each section may contain multiple subsections.
 */
export interface AcademicSection {
  id: string;
  type: AcademicSectionType;
  /** Display heading — e.g. "1. Introduction" */
  title: string;
  /** Full prose content for this section (may be multi-paragraph) */
  content: string;
  subsections?: AcademicSubsection[];
  /** IDs from Citation[] used in this section */
  citationIds?: string[];
}

/**
 * The complete AI-generated academic paper linked to a ResearchReport.
 * Stored in the `academic_papers` Supabase table.
 */
export interface AcademicPaper {
  id: string;
  reportId: string;
  userId: string;
  /** Full title of the academic paper */
  title: string;
  /** Short running head (≤50 chars) for header/footer */
  runningHead: string;
  /** Structured abstract (background, objective, method, findings, conclusion) */
  abstract: string;
  /** 5–8 keyword phrases for indexing */
  keywords: string[];
  /**
   * Ordered sections: abstract → introduction → literature review →
   * methodology → findings → conclusion → references
   */
  sections: AcademicSection[];
  /** Full citation objects (shared from the parent report) */
  citations: Citation[];
  /** Citation style used throughout the paper */
  citationStyle: AcademicCitationStyle;
  /** Approximate total word count */
  wordCount: number;
  /** Estimated page count at standard academic formatting (250 words/page) */
  pageEstimate: number;
  /** Optional institution line on the title page */
  institution?: string;
  /** ISO timestamp when the paper was generated */
  generatedAt: string;
  /** How many times the paper has been exported */
  exportCount: number;
}

/**
 * The raw JSON output from runAcademicPaperAgent().
 * The orchestrator wraps this into a full AcademicPaper before saving.
 */
export interface AcademicAgentOutput {
  title: string;
  runningHead: string;
  abstract: string;
  keywords: string[];
  sections: Omit<AcademicSection, 'id'>[];
}

/**
 * State shape managed by useAcademicPaper hook.
 */
export interface AcademicPaperState {
  paper: AcademicPaper | null;
  isGenerating: boolean;
  isExporting: boolean;
  error: string | null;
  progress: string;
  activeSectionId: string | null;
  citationStyle: AcademicCitationStyle;
}

/**
 * Meta info shown in the paper header / stats bar.
 */
export interface AcademicPaperMeta {
  wordCount: number;
  pageEstimate: number;
  sectionCount: number;
  citationCount: number;
  generatedAt: string;
}