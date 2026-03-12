// src/types/index.ts
// Parts 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8
// Part 8: Added AI Podcast Generator types

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
  // Part 8 additions
  totalPodcasts?: number;
  podcastMinutesGenerated?: number;
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

/**
 * OpenAI TTS voices available for podcast generation.
 * alloy  — neutral, professional (good default host)
 * echo   — deep, resonant
 * fable  — warm, British accent
 * onyx   — deep, authoritative
 * nova   — warm, friendly (good default guest)
 * shimmer — bright, clear
 */
export type PodcastVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export type PodcastStatus =
  | 'pending'
  | 'generating_script'
  | 'generating_audio'
  | 'completed'
  | 'failed';

/**
 * A single spoken turn in the podcast dialogue.
 * Each turn maps to one TTS audio segment file.
 */
export interface PodcastTurn {
  id: string;
  /** 0-based index — determines audio file name & playback order */
  segmentIndex: number;
  speaker: 'host' | 'guest';
  /** Display name shown in transcript */
  speakerName: string;
  /** Text sent to TTS */
  text: string;
  /** Local filesystem path after TTS generation (empty string = not yet generated) */
  audioPath?: string;
  /** Estimated playback length in milliseconds */
  durationMs?: number;
}

/** The structured dialogue generated by the script agent */
export interface PodcastScript {
  turns: PodcastTurn[];
  totalWords: number;
  /** Estimated total duration at ~150 wpm */
  estimatedDurationMinutes: number;
}

/** Voice + personality configuration chosen by the user */
export interface PodcastConfig {
  hostVoice: PodcastVoice;
  guestVoice: PodcastVoice;
  hostName: string;
  guestName: string;
  /** Target episode length in minutes (default 10) */
  targetDurationMinutes: number;
}

/** A pre-defined voice pair the user can select from */
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

/**
 * The fully generated podcast object — mirrors the `podcasts` Supabase row
 * plus the config sub-object reconstructed from individual DB columns.
 */
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
  /** Ordered array of local file paths, one per turn */
  audioSegmentPaths: string[];
  errorMessage?: string;
  exportCount: number;
  createdAt: string;
  completedAt?: string;
}

/** State managed by usePodcast hook during generation */
export interface PodcastGenerationState {
  podcast: Podcast | null;
  isGeneratingScript: boolean;
  isGeneratingAudio: boolean;
  scriptGenerated: boolean;
  audioProgress: { completed: number; total: number };
  progressMessage: string;
  error: string | null;
}

/** State managed by usePodcastPlayer hook */
export interface PodcastPlayerState {
  isPlaying: boolean;
  currentTurnIndex: number;
  /** Current playback position in milliseconds within the current segment */
  positionMs: number;
  /** Duration of the current segment in milliseconds */
  segmentDurationMs: number;
  /** Cumulative position across all segments in milliseconds */
  totalPositionMs: number;
  /** Sum of all estimated segment durations in milliseconds */
  totalDurationMs: number;
  isLoading: boolean;
  isBuffering: boolean;
  playbackRate: number;
}

/** Callbacks used by the podcast generation pipeline */
export interface PodcastGenerationCallbacks {
  onScriptGenerated: (script: PodcastScript) => void;
  onSegmentGenerated: (
    segmentIndex: number,
    totalSegments: number,
    audioPath: string
  ) => void;
  onComplete: (podcast: Podcast) => void;
  onError: (message: string) => void;
  onProgress: (message: string) => void;
}