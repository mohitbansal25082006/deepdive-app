// src/types/index.ts
// Parts 1–9
// Part 9: Added AI Debate Agent types

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

export type ResearchMode = 'standard' | 'academic';

export interface ResearchInput {
  query: string;
  depth: ResearchDepth;
  focusAreas: string[];
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
  | 'academic';

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
  | 'writing_paper'
  | 'completed'
  | 'failed';

// ─── Part 2: Conversation (legacy) ───────────────────────────────────────────

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
  totalAssistantMessages?: number;
  reportsWithEmbeddings?: number;
  academicPapersGenerated?: number;
  // Part 8
  totalPodcasts?: number;
  podcastMinutesGenerated?: number;
  // Part 9
  totalDebates?: number;
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
  id:                  string;
  reportId:            string;
  userId:              string;
  role:                'user' | 'assistant';
  content:             string;
  mode:                AssistantMode;
  retrievedChunks?:    RetrievedChunkInfo[];
  suggestedFollowUps?: string[];
  isRAGPowered?:       boolean;
  confidence?:         'high' | 'medium' | 'low';
  createdAt:           string;
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

export type AcademicCitationStyle = 'apa' | 'mla' | 'chicago' | 'ieee';

export type AcademicSectionType =
  | 'abstract'
  | 'introduction'
  | 'literature_review'
  | 'methodology'
  | 'findings'
  | 'conclusion'
  | 'references';

export interface AcademicSubsection {
  id: string;
  title: string;
  content: string;
}

export interface AcademicSection {
  id: string;
  type: AcademicSectionType;
  title: string;
  content: string;
  subsections?: AcademicSubsection[];
  citationIds?: string[];
}

export interface AcademicPaper {
  id: string;
  reportId: string;
  userId: string;
  title: string;
  runningHead: string;
  abstract: string;
  keywords: string[];
  sections: AcademicSection[];
  citations: Citation[];
  citationStyle: AcademicCitationStyle;
  wordCount: number;
  pageEstimate: number;
  institution?: string;
  generatedAt: string;
  exportCount: number;
}

export interface AcademicAgentOutput {
  title: string;
  runningHead: string;
  abstract: string;
  keywords: string[];
  sections: Omit<AcademicSection, 'id'>[];
}

export interface AcademicPaperState {
  paper: AcademicPaper | null;
  isGenerating: boolean;
  isExporting: boolean;
  error: string | null;
  progress: string;
  activeSectionId: string | null;
  citationStyle: AcademicCitationStyle;
}

export interface AcademicPaperMeta {
  wordCount: number;
  pageEstimate: number;
  sectionCount: number;
  citationCount: number;
  generatedAt: string;
}

// ─── Part 8: AI Podcast Generator ────────────────────────────────────────────

export type PodcastVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export type PodcastStatus =
  | 'pending'
  | 'generating_script'
  | 'generating_audio'
  | 'completed'
  | 'failed';

export interface PodcastTurn {
  id: string;
  segmentIndex: number;
  speaker: 'host' | 'guest';
  speakerName: string;
  text: string;
  audioPath?: string;
  durationMs?: number;
}

export interface PodcastScript {
  turns: PodcastTurn[];
  totalWords: number;
  estimatedDurationMinutes: number;
}

export interface PodcastConfig {
  hostVoice: PodcastVoice;
  guestVoice: PodcastVoice;
  hostName: string;
  guestName: string;
  targetDurationMinutes: number;
}

export interface PodcastVoicePreset {
  id: string;
  name: string;
  description: string;
  hostVoice: PodcastVoice;
  guestVoice: PodcastVoice;
  hostName: string;
  guestName: string;
  icon: string;
  accentColor: string;
}

export interface Podcast {
  id: string;
  userId: string;
  reportId?: string;
  title: string;
  description: string;
  topic: string;
  script: PodcastScript;
  config: PodcastConfig;
  status: PodcastStatus;
  completedSegments: number;
  durationSeconds: number;
  wordCount: number;
  audioSegmentPaths: string[];
  errorMessage?: string;
  exportCount: number;
  createdAt: string;
  completedAt?: string;
}

export interface PodcastGenerationState {
  podcast: Podcast | null;
  isGeneratingScript: boolean;
  isGeneratingAudio: boolean;
  scriptGenerated: boolean;
  audioProgress: { completed: number; total: number };
  progressMessage: string;
  error: string | null;
}

export interface PodcastPlayerState {
  isPlaying: boolean;
  currentTurnIndex: number;
  positionMs: number;
  segmentDurationMs: number;
  totalPositionMs: number;
  totalDurationMs: number;
  isLoading: boolean;
  isBuffering: boolean;
  playbackRate: number;
}

export interface PodcastGenerationCallbacks {
  onScriptGenerated: (script: PodcastScript) => void;
  onSegmentGenerated: (segmentIndex: number, totalSegments: number, audioPath: string) => void;
  onComplete: (podcast: Podcast) => void;
  onError: (message: string) => void;
  onProgress: (message: string) => void;
}

// ─── Part 9: AI Debate Agent ──────────────────────────────────────────────────

/**
 * The six agent roles in a debate session.
 * Each role brings a distinct analytical lens to the topic.
 */
export type DebateAgentRole =
  | 'optimist'
  | 'skeptic'
  | 'economist'
  | 'technologist'
  | 'ethicist'
  | 'futurist';

/**
 * Lifecycle status of a debate session row in Supabase.
 */
export type DebateStatus =
  | 'pending'
  | 'searching'
  | 'debating'
  | 'moderating'
  | 'completed'
  | 'failed';

/**
 * How strongly an agent is positioned for or against the topic.
 */
export type DebateStanceType =
  | 'strongly_for'
  | 'for'
  | 'neutral'
  | 'against'
  | 'strongly_against';

/**
 * A single argument made by a debate agent.
 */
export interface DebateArgument {
  id: string;
  /** Short, punchy headline for the argument (< 15 words) */
  point: string;
  /** 2-3 sentence elaboration with evidence */
  evidence: string;
  /** Source URL from web search, if available */
  sourceUrl?: string;
  strength: 'strong' | 'moderate' | 'weak';
}

/**
 * The full perspective produced by one debate agent.
 */
export interface DebatePerspective {
  agentRole:       DebateAgentRole;
  agentName:       string;     // e.g. "The Optimist"
  tagline:         string;     // e.g. "Technology Optimist"
  stanceLabel:     string;     // e.g. "AI will augment, not replace, programmers"
  stanceType:      DebateStanceType;
  /** Multi-paragraph overview of this agent's perspective */
  summary:         string;
  arguments:       DebateArgument[];
  /** Most memorable, shareable statement from this agent */
  keyQuote:        string;
  /** 1–10 confidence score the agent assigns to its position */
  confidence:      number;
  searchedQueries: string[];
  sourcesUsed:     Citation[];
  /** Hex color for UI rendering */
  color:           string;
  /** Ionicons icon name */
  icon:            string;
}

/**
 * The moderator's synthesis of all perspectives.
 */
export interface DebateModerator {
  /** 3-4 paragraph synthesis of all perspectives */
  summary:           string;
  /** Top 4 arguments in favour of the proposition */
  argumentsFor:      string[];
  /** Top 4 arguments against the proposition */
  argumentsAgainst:  string[];
  /** 2-3 paragraph balanced conclusion */
  neutralConclusion: string;
  /** Points where most agents agree */
  consensusPoints:   string[];
  /** Fundamental tensions between agents */
  keyTensions:       string[];
  /** One powerful balanced verdict sentence */
  balancedVerdict:   string;
}

/**
 * The complete debate session — mirrors the `debate_sessions` Supabase row.
 */
export interface DebateSession {
  id:                 string;
  userId:             string;
  topic:              string;
  /** Refined yes/no or "will/should" question derived from the topic */
  question:           string;
  perspectives:       DebatePerspective[];
  moderator:          DebateModerator | null;
  status:             DebateStatus;
  agentRoles:         DebateAgentRole[];
  searchResultsCount: number;
  errorMessage?:      string;
  createdAt:          string;
  completedAt?:       string;
}

/**
 * Per-agent progress item used in the generation UI.
 */
export interface DebateAgentProgressItem {
  role:          DebateAgentRole;
  label:         string;
  status:        'pending' | 'searching' | 'thinking' | 'completed' | 'failed';
  detail?:       string;
  color:         string;
  icon:          string;
  startedAt?:    number;
  completedAt?:  number;
}

/**
 * Full state managed by useDebate hook.
 */
export interface DebateGenerationState {
  session:          DebateSession | null;
  agentProgress:    DebateAgentProgressItem[];
  isSearching:      boolean;
  isDebating:       boolean;
  isModerating:     boolean;
  completedAgents:  number;
  totalAgents:      number;
  progressMessage:  string;
  error:            string | null;
}

/**
 * Config passed to the debate pipeline.
 */
export interface DebateConfig {
  /** Defaults to all 6 roles if omitted */
  agentRoles?: DebateAgentRole[];
}

/**
 * Callbacks for the debate orchestrator, mirroring the research orchestrator pattern.
 */
export interface DebateOrchestratorCallbacks {
  onAgentProgressUpdate: (progress: DebateAgentProgressItem[]) => void;
  onAgentComplete:       (role: DebateAgentRole, perspective: DebatePerspective) => void;
  onStatusUpdate:        (message: string) => void;
  onComplete:            (session: DebateSession) => void;
  onError:               (message: string) => void;
}