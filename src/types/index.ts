// src/types/index.ts
// Parts 1–16 — All type definitions
// Part 15 adds: SharedPodcast, SharedPodcastState, extended SharedContentType to include 'podcast'
// Part 16 adds: SharedDebate, SharedDebateState, SharedDebateSummary, extends SharedContentType and WorkspaceActivityAction

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
export type ResearchMode  = 'standard' | 'academic';

export interface ResearchInput {
  query:       string;
  depth:       ResearchDepth;
  focusAreas:  string[];
  mode?:       ResearchMode;
}

// ─── Agent Progress ───────────────────────────────────────────────────────────

export type AgentName =
  | 'planner' | 'searcher' | 'analyst' | 'factchecker'
  | 'reporter' | 'visualizer' | 'academic';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentStep {
  agent:        AgentName;
  label:        string;
  description:  string;
  status:       AgentStatus;
  startedAt?:   number;
  completedAt?: number;
  detail?:      string;
}

// ─── Research Plan ────────────────────────────────────────────────────────────

export interface ResearchPlan {
  topic:          string;
  subtopics:      string[];
  searchQueries:  string[];
  researchGoals:  string[];
  estimatedDepth: ResearchDepth;
  keyEntities:    string[];
}

// ─── Web Search Results ───────────────────────────────────────────────────────

export interface SearchResult {
  title:      string;
  url:        string;
  snippet:    string;
  date?:      string;
  source?:    string;
  position:   number;
  thumbnail?: string;
  imageUrl?:  string;
}

export interface SearchBatch {
  query:   string;
  results: SearchResult[];
}

// ─── Analysis Output ──────────────────────────────────────────────────────────

export interface ExtractedFact {
  claim:      string;
  source:     string;
  url:        string;
  confidence: number;
}

export interface ExtractedStatistic {
  value:   string;
  context: string;
  source:  string;
  url:     string;
}

export interface ExtractedTrend {
  trend:     string;
  direction: 'rising' | 'falling' | 'stable' | 'emerging';
  evidence:  string;
}

export interface AnalysisOutput {
  facts:          ExtractedFact[];
  statistics:     ExtractedStatistic[];
  trends:         ExtractedTrend[];
  companies:      string[];
  keyThemes:      string[];
  contradictions: string[];
}

// ─── Fact-check Output ────────────────────────────────────────────────────────

export interface FactCheckOutput {
  verifiedFacts:    ExtractedFact[];
  flaggedClaims:    { claim: string; reason: string }[];
  reliabilityScore: number;
  sourceDiversity:  number;
  notes:            string;
}

// ─── Report (final output) ────────────────────────────────────────────────────

export interface Citation {
  id:       string;
  title:    string;
  url:      string;
  source:   string;
  date?:    string;
  snippet:  string;
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

// ─── Part 4: Knowledge Graph ──────────────────────────────────────────────────

export type KnowledgeNodeType =
  | 'root' | 'primary' | 'secondary' | 'concept' | 'company' | 'trend';

export interface KnowledgeGraphNode {
  id:           string;
  label:        string;
  type:         KnowledgeNodeType;
  weight:       number;
  description?: string;
  x?:  number; y?:  number;
  vx?: number; vy?: number;
  fx?: number | null; fy?: number | null;
}

export interface KnowledgeGraphEdge {
  id:       string;
  source:   string | KnowledgeGraphNode;
  target:   string | KnowledgeGraphNode;
  label?:   string;
  strength: number;
}

export interface KnowledgeGraph {
  nodes:       KnowledgeGraphNode[];
  edges:       KnowledgeGraphEdge[];
  generatedAt: string;
}

// ─── Part 4: Infographics ─────────────────────────────────────────────────────

export type ChartType = 'bar' | 'line' | 'pie' | 'stat' | 'timeline';

export interface ChartDataset { label: string; data: number[]; color?: string; }

export interface InfographicChart {
  id:        string;
  type:      ChartType;
  title:     string;
  subtitle?: string;
  labels?:   string[];
  datasets?: ChartDataset[];
  unit?:     string;
  insight?:  string;
}

export interface InfographicStat {
  id:          string;
  label:       string;
  value:       string;
  change?:     string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?:       string;
  color?:      string;
}

export interface InfographicData {
  charts:      InfographicChart[];
  stats:       InfographicStat[];
  generatedAt: string;
}

// ─── Part 4: Source Images ────────────────────────────────────────────────────

export interface SourceImage {
  url:           string;
  thumbnailUrl?: string;
  title?:        string;
  sourceUrl?:    string;
  width?:        number;
  height?:       number;
}

// ─── Research Report ──────────────────────────────────────────────────────────

export interface ResearchReport {
  id:                 string;
  userId:             string;
  query:              string;
  depth:              ResearchDepth;
  focusAreas:         string[];
  title:              string;
  executiveSummary:   string;
  sections:           ReportSection[];
  keyFindings:        string[];
  futurePredictions:  string[];
  citations:          Citation[];
  statistics:         ExtractedStatistic[];
  searchQueries:      string[];
  sourcesCount:       number;
  reliabilityScore:   number;
  status:             ResearchStatus;
  errorMessage?:      string;
  agentLogs:          AgentStep[];
  isPinned?:          boolean;
  tags?:              string[];
  exportCount?:       number;
  viewCount?:         number;
  knowledgeGraph?:    KnowledgeGraph;
  infographicData?:   InfographicData;
  sourceImages?:      SourceImage[];
  presentationId?:    string;
  slideCount?:        number;
  academicPaperId?:   string;
  researchMode?:      ResearchMode;
  createdAt:          string;
  completedAt?:       string;
}

export type ResearchStatus =
  | 'pending' | 'planning' | 'searching' | 'analyzing'
  | 'fact_checking' | 'generating' | 'visualizing'
  | 'writing_paper' | 'completed' | 'failed';

// ─── Part 2: Conversation (legacy) ───────────────────────────────────────────

export interface ConversationMessage {
  id:        string;
  reportId:  string;
  userId:    string;
  role:      'user' | 'assistant';
  content:   string;
  createdAt: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface OrchestratorCallbacks {
  onStepUpdate: (steps: AgentStep[]) => void;
  onStepDetail: (agent: AgentName, detail: string) => void;
  onComplete:   (report: ResearchReport) => void;
  onError:      (message: string) => void;
}

// ─── Part 3: Stats & Subscription ────────────────────────────────────────────

export interface UserStats {
  totalReports:                number;
  completedReports:            number;
  totalSources:                number;
  avgReliability:              number;
  favoriteTopic:               string | null;
  reportsThisMonth:            number;
  hoursResearched:             number;
  totalAssistantMessages?:     number;
  reportsWithEmbeddings?:      number;
  academicPapersGenerated?:    number;
  totalPodcasts?:              number;
  podcastMinutesGenerated?:    number;
  totalDebates?:               number;
}

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface UserSubscription {
  id:                   string;
  userId:               string;
  tier:                 SubscriptionTier;
  reportsUsedThisMonth: number;
  reportsLimit:         number;
  resetDate:            string;
}

export interface SavedTopic {
  id:              string;
  userId:          string;
  topic:           string;
  lastCheckedAt:   string;
  notifyOnUpdate:  boolean;
  createdAt:       string;
}

export type CitationFormat = 'apa' | 'mla' | 'chicago';

export interface FormattedCitation {
  id:        string;
  format:    CitationFormat;
  formatted: string;
  raw:       Citation;
}

// ─── Part 5: AI Slide Generator ───────────────────────────────────────────────

export type SlideLayout =
  | 'title' | 'agenda' | 'section' | 'content' | 'bullets' | 'stats'
  | 'quote' | 'chart_ref' | 'predictions' | 'references' | 'closing';

export interface SlideStatItem { value: string; label: string; color?: string; }

export interface PresentationSlide {
  id:               string;
  slideNumber:      number;
  layout:           SlideLayout;
  title:            string;
  subtitle?:        string;
  body?:            string;
  bullets?:         string[];
  stats?:           SlideStatItem[];
  quote?:           string;
  quoteAttribution?: string;
  sectionTag?:      string;
  badgeText?:       string;
  speakerNotes?:    string;
  accentColor?:     string;
  icon?:            string;
}

export type PresentationTheme = 'dark' | 'light' | 'corporate' | 'vibrant';

export interface PresentationThemeTokens {
  background: string; surface: string; primary: string;
  textPrimary: string; textSecondary: string; textMuted: string; border: string;
  pptx: {
    background: string; surface: string; primary: string;
    textPrimary: string; textSecondary: string; textMuted: string; border: string;
  };
}

export interface GeneratedPresentation {
  id:           string;
  reportId:     string;
  userId:       string;
  title:        string;
  subtitle:     string;
  theme:        PresentationTheme;
  themeTokens:  PresentationThemeTokens;
  slides:       PresentationSlide[];
  totalSlides:  number;
  generatedAt:  string;
  exportCount:  number;
}

export interface SlideGeneratorState {
  presentation:  GeneratedPresentation | null;
  isGenerating:  boolean;
  isExporting:   boolean;
  exportFormat:  SlideExportFormat | null;
  progress:      string;
  error:         string | null;
}

export type SlideExportFormat = 'pptx' | 'pdf' | 'html';

export interface SlideAgentOutput {
  presentationTitle:    string;
  presentationSubtitle: string;
  slides:               Omit<PresentationSlide, 'slideNumber'>[];
}

// ─── Part 6: AI Research Assistant Chat (RAG Pipeline) ───────────────────────

export type AssistantMode =
  | 'general' | 'beginner' | 'compare' | 'contradictions'
  | 'questions' | 'summarize' | 'factcheck';

export interface RetrievedChunkInfo {
  chunkId: string; chunkType: string; similarity: number;
}

export interface AssistantMessage {
  id: string; reportId: string; userId: string;
  role: 'user' | 'assistant';
  content: string;
  mode: AssistantMode;
  retrievedChunks?:    RetrievedChunkInfo[];
  suggestedFollowUps?: string[];
  isRAGPowered?:       boolean;
  confidence?:         'high' | 'medium' | 'low';
  createdAt:           string;
}

export interface AssistantAgentResponse {
  content:               string;
  mode:                  AssistantMode;
  detectedMode:          AssistantMode;
  appliedMode:           AssistantMode;
  suggestedFollowUps:    string[];
  usedRAG:               boolean;
  retrievedChunkCount:   number;
  confidence:            'high' | 'medium' | 'low';
}

export interface AssistantState {
  messages:     AssistantMessage[];
  isEmbedding:  boolean;
  isSending:    boolean;
  isEmbedded:   boolean;
  embedProgress:{ done: number; total: number } | null;
  activeMode:   AssistantMode;
  error:        string | null;
}

export interface ReportEmbeddingStats {
  totalChunks:  number;
  chunkTypes:   Record<string, number>;
  embeddedAt:   string | null;
}

// ─── Part 7: AI Academic Paper Mode ──────────────────────────────────────────

export type AcademicCitationStyle = 'apa' | 'mla' | 'chicago' | 'ieee';

export type AcademicSectionType =
  | 'abstract' | 'introduction' | 'literature_review'
  | 'methodology' | 'findings' | 'conclusion' | 'references';

export interface AcademicSubsection { id: string; title: string; content: string; }

export interface AcademicSection {
  id:           string;
  type:         AcademicSectionType;
  title:        string;
  content:      string;
  subsections?: AcademicSubsection[];
  citationIds?: string[];
}

export interface AcademicPaper {
  id: string; reportId: string; userId: string;
  title: string; runningHead: string; abstract: string; keywords: string[];
  sections:       AcademicSection[];
  citations:      Citation[];
  citationStyle:  AcademicCitationStyle;
  wordCount:      number;
  pageEstimate:   number;
  institution?:   string;
  generatedAt:    string;
  exportCount:    number;
}

export interface AcademicAgentOutput {
  title: string; runningHead: string; abstract: string; keywords: string[];
  sections: Omit<AcademicSection, 'id'>[];
}

export interface AcademicPaperState {
  paper:           AcademicPaper | null;
  isGenerating:    boolean;
  isExporting:     boolean;
  error:           string | null;
  progress:        string;
  activeSectionId: string | null;
  citationStyle:   AcademicCitationStyle;
}

export interface AcademicPaperMeta {
  wordCount:    number;
  pageEstimate: number;
  sectionCount: number;
  citationCount:number;
  generatedAt:  string;
}

// ─── Part 8: AI Podcast Generator ────────────────────────────────────────────

export type PodcastVoice  = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type PodcastStatus = 'pending' | 'generating_script' | 'generating_audio' | 'completed' | 'failed';

export interface PodcastTurn {
  id: string; segmentIndex: number;
  speaker: 'host' | 'guest'; speakerName: string;
  text: string; audioPath?: string; durationMs?: number;
}

export interface PodcastScript {
  turns: PodcastTurn[]; totalWords: number; estimatedDurationMinutes: number;
}

export interface PodcastConfig {
  hostVoice: PodcastVoice; guestVoice: PodcastVoice;
  hostName: string; guestName: string; targetDurationMinutes: number;
}

export interface PodcastVoicePreset {
  id: string; name: string; description: string;
  hostVoice: PodcastVoice; guestVoice: PodcastVoice;
  hostName: string; guestName: string; icon: string; accentColor: string;
}

export interface Podcast {
  id: string; userId: string; reportId?: string;
  title: string; description: string; topic: string;
  script: PodcastScript; config: PodcastConfig;
  status: PodcastStatus;
  completedSegments: number; durationSeconds: number; wordCount: number;
  audioSegmentPaths: string[]; errorMessage?: string;
  exportCount: number; createdAt: string; completedAt?: string;
}

export interface PodcastGenerationState {
  podcast: Podcast | null;
  isGeneratingScript: boolean; isGeneratingAudio: boolean; scriptGenerated: boolean;
  audioProgress: { completed: number; total: number };
  progressMessage: string; error: string | null;
}

export interface PodcastPlayerState {
  isPlaying: boolean; currentTurnIndex: number;
  positionMs: number; segmentDurationMs: number;
  totalPositionMs: number; totalDurationMs: number;
  isLoading: boolean; isBuffering: boolean; playbackRate: number;
}

export interface PodcastGenerationCallbacks {
  onScriptGenerated:    (script: PodcastScript) => void;
  onSegmentGenerated:   (segmentIndex: number, totalSegments: number, audioPath: string) => void;
  onComplete:           (podcast: Podcast) => void;
  onError:              (message: string) => void;
  onProgress:           (message: string) => void;
}

// ─── Part 9: AI Debate Agent ──────────────────────────────────────────────────

export type DebateAgentRole =
  | 'optimist' | 'skeptic' | 'economist'
  | 'technologist' | 'ethicist' | 'futurist';

export type DebateStatus =
  | 'pending' | 'searching' | 'debating' | 'moderating' | 'completed' | 'failed';

export type DebateStanceType =
  | 'strongly_for' | 'for' | 'neutral' | 'against' | 'strongly_against';

export interface DebateArgument {
  id: string; point: string; evidence: string;
  sourceUrl?: string; strength: 'strong' | 'moderate' | 'weak';
}

export interface DebatePerspective {
  agentRole: DebateAgentRole; agentName: string; tagline: string;
  stanceLabel: string; stanceType: DebateStanceType;
  summary: string; arguments: DebateArgument[];
  keyQuote: string; confidence: number;
  searchedQueries: string[]; sourcesUsed: Citation[];
  color: string; icon: string;
}

export interface DebateModerator {
  summary: string; argumentsFor: string[]; argumentsAgainst: string[];
  neutralConclusion: string; consensusPoints: string[];
  keyTensions: string[]; balancedVerdict: string;
}

export interface DebateSession {
  id: string; userId: string; topic: string; question: string;
  perspectives:       DebatePerspective[];
  moderator:          DebateModerator | null;
  status:             DebateStatus;
  agentRoles:         DebateAgentRole[];
  searchResultsCount: number;
  errorMessage?:      string;
  createdAt:          string;
  completedAt?:       string;
}

export interface DebateAgentProgressItem {
  role: DebateAgentRole; label: string;
  status: 'pending' | 'searching' | 'thinking' | 'completed' | 'failed';
  detail?: string; color: string; icon: string;
  startedAt?: number; completedAt?: number;
}

export interface DebateGenerationState {
  session:        DebateSession | null;
  agentProgress:  DebateAgentProgressItem[];
  isSearching:    boolean; isDebating: boolean; isModerating: boolean;
  completedAgents: number; totalAgents: number;
  progressMessage: string; error: string | null;
}

export interface DebateConfig { agentRoles?: DebateAgentRole[]; }

export interface DebateOrchestratorCallbacks {
  onAgentProgressUpdate: (progress: DebateAgentProgressItem[]) => void;
  onAgentComplete:       (role: DebateAgentRole, perspective: DebatePerspective) => void;
  onStatusUpdate:        (message: string) => void;
  onComplete:            (session: DebateSession) => void;
  onError:               (message: string) => void;
}

// ─── Part 10: Collaborative Workspace ────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export type WorkspaceActivityAction =
  | 'workspace_created' | 'workspace_updated'
  | 'report_added'      | 'report_removed'
  | 'member_joined'     | 'member_left'     | 'member_removed'
  | 'member_role_changed' | 'comment_added' | 'comment_resolved'
  | 'ownership_transferred'
  | 'member_blocked'
  | 'debate_shared'; // Added from Part 16

// ─── Part 11 WorkspaceSettings ────────────────────────────────────────────────

export type WorkspaceAccentColor =
  | 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'cyan';

export const WORKSPACE_ACCENT_COLORS: Record<WorkspaceAccentColor, string> = {
  purple: '#6C63FF', blue: '#3B82F6', green: '#10B981',
  orange: '#F59E0B', pink: '#EC4899', cyan:  '#06B6D4',
};

export interface WorkspaceSettings {
  notifyOnNewReport?:  boolean;
  notifyOnComment?:    boolean;
  notifyOnMention?:    boolean;
  accentColor?:        WorkspaceAccentColor;
}

export interface Workspace {
  id:           string;
  name:         string;
  description:  string | null;
  avatarUrl:    string | null;
  inviteCode:   string;
  ownerId:      string;
  isPersonal:   boolean;
  settings:     WorkspaceSettings;
  createdAt:    string;
  updatedAt:    string;
  memberCount?: number;
  reportCount?: number;
  userRole?:    WorkspaceRole;
}

export interface MiniProfile {
  id:        string;
  username:  string | null;
  fullName:  string | null;
  avatarUrl: string | null;
}

export interface WorkspaceMember {
  id:          string;
  workspaceId: string;
  userId:      string;
  role:        WorkspaceRole;
  invitedBy:   string | null;
  joinedAt:    string;
  profile?:    MiniProfile;
}

export interface WorkspaceReport {
  id:               string;
  workspaceId:      string;
  reportId:         string;
  addedBy:          string | null;
  addedAt:          string;
  report?:          Partial<ResearchReport>;
  addedByProfile?:  MiniProfile;
  commentCount?:    number;
  isPinned?:        boolean;
}

export interface ReportComment {
  id:          string;
  workspaceId: string;
  reportId:    string;
  sectionId:   string | null;
  userId:      string;
  content:     string;
  isResolved:  boolean;
  resolvedBy:  string | null;
  resolvedAt:  string | null;
  mentions:    string[];
  createdAt:   string;
  updatedAt:   string;
  author?:     MiniProfile;
  replies?:    CommentReply[];
  reactions?:  CommentReactionSummary[];
}

export interface CommentReply {
  id:        string;
  commentId: string;
  userId:    string;
  content:   string;
  mentions:  string[];
  createdAt: string;
  updatedAt: string;
  author?:   MiniProfile;
}

export interface WorkspaceActivity {
  id:           string;
  workspaceId:  string;
  userId:       string | null;
  action:       WorkspaceActivityAction;
  resourceType: string | null;
  resourceId:   string | null;
  metadata:     Record<string, unknown>;
  createdAt:    string;
  actorProfile?: MiniProfile;
}

export interface PresenceUser {
  userId:    string;
  username:  string | null;
  fullName:  string | null;
  avatarUrl: string | null;
  onlineAt:  string;
  reportId?: string;
}

// ─── Part 11: Comment Reactions ───────────────────────────────────────────────

export const REACTION_EMOJIS = ['👍', '✅', '❓', '🔥'] as const;
export type CommentReactionEmoji = typeof REACTION_EMOJIS[number];

export interface CommentReaction {
  id:        string;
  commentId: string;
  userId:    string;
  emoji:     CommentReactionEmoji;
  createdAt: string;
}

export interface CommentReactionSummary {
  emoji:      CommentReactionEmoji;
  count:      number;
  hasReacted: boolean;
}

// ─── Part 11: Avatar Picker ───────────────────────────────────────────────────

export type AvatarStyle =
  | 'avataaars' | 'pixel-art' | 'lorelei' | 'bottts'
  | 'micah' | 'adventurer' | 'fun-emoji' | 'shapes';

export interface AvatarStyleOption { id: AvatarStyle; label: string; emoji: string; }
export interface AvatarOption      { url: string; style: AvatarStyle; seed: string; }

// ─── Part 11: Workspace Search ────────────────────────────────────────────────

export interface WorkspaceSearchResult {
  type:        'report' | 'comment' | 'member';
  id:          string;
  title:       string;
  subtitle:    string;
  reportId?:   string;
  workspaceId?: string;
  avatarUrl?:  string;
  createdAt?:  string;
}

export interface WorkspaceSearchState {
  query:       string;
  results:     WorkspaceSearchResult[];
  isSearching: boolean;
  error:       string | null;
}

// ─── Part 11: Pinned Reports ──────────────────────────────────────────────────

export interface PinnedWorkspaceReport {
  id:          string;
  workspaceId: string;
  reportId:    string;
  pinnedBy:    string;
  pinnedAt:    string;
}

// ─── Part 13B: Blocked Members ───────────────────────────────────────────────

export interface BlockedMember {
  id:            string;
  workspaceId:   string;
  blockedUserId: string;
  blockedBy:     string;
  reason:        string | null;
  blockedAt:     string;
  profile?:      MiniProfile;
}

// ─── State shapes ─────────────────────────────────────────────────────────────

export interface WorkspaceListState {
  workspaces: Workspace[];
  isLoading:  boolean;
  error:      string | null;
}

export interface WorkspaceDetailState {
  workspace:   Workspace | null;
  members:     WorkspaceMember[];
  reports:     WorkspaceReport[];
  userRole:    WorkspaceRole | null;
  isLoading:   boolean;
  isRefreshing: boolean;
  error:       string | null;
}

export interface CommentState {
  comments:     ReportComment[];
  sectionCounts: Record<string, number>;
  isLoading:    boolean;
  isSending:    boolean;
  isReplying:   boolean;
  error:        string | null;
}

export interface PresenceState {
  onlineUsers: PresenceUser[];
  isTracking:  boolean;
}

export interface ActivityFeedState {
  items:     WorkspaceActivity[];
  isLoading: boolean;
  hasMore:   boolean;
  error:     string | null;
}

export interface ReactionState {
  reactionsByComment: Record<string, CommentReactionSummary[]>;
  isToggling:         boolean;
  error:              string | null;
}

// ─── Part 14: Workspace Shared Content ────────────────────────────────────────
// Part 15 & 16: Extended SharedContentType to include 'podcast' and 'debate'

export type SharedContentType = 'presentation' | 'academic_paper' | 'podcast' | 'debate';

export interface SharedWorkspaceContent {
  id:           string;
  workspaceId:  string;
  sharedBy:     string;
  contentType:  SharedContentType;
  contentId:    string;
  title:        string;
  subtitle?:    string;
  reportId?:    string;
  metadata:     Record<string, unknown>;
  sharedAt:     string;
  sharerName?:  string;
  sharerAvatar?: string;
}

export interface WorkspaceSharingState {
  items:      SharedWorkspaceContent[];
  isLoading:  boolean;
  isSharing:  boolean;
  error:      string | null;
}

// ─── Part 15: Shared Podcast ──────────────────────────────────────────────────

/**
 * A podcast episode shared into a workspace.
 * Stores a full denormalised copy of the podcast data (script, audio paths)
 * so any workspace member can play or download it without owning the source row.
 */
export interface SharedPodcast {
  /** Row ID in shared_podcasts table */
  id:                 string;
  workspaceId:        string;
  podcastId:          string;
  sharedBy:           string;
  reportId?:          string;

  // Denormalised podcast fields
  title:              string;
  description:        string;
  topic:              string;
  hostName:           string;
  guestName:          string;
  durationSeconds:    number;
  wordCount:          number;
  completedSegments:  number;

  // Full playable data
  script:             PodcastScript;
  audioSegmentPaths:  string[];

  // Analytics
  downloadCount:      number;
  playCount:          number;

  sharedAt:           string;
  sharerName?:        string;
  sharerAvatar?:      string;
}

export interface SharedPodcastState {
  podcasts:   SharedPodcast[];
  isLoading:  boolean;
  isSharing:  boolean;
  error:      string | null;
}

/**
 * Lightweight summary shown in SharedContentCard for podcasts.
 * Derived from SharedPodcast.
 */
export interface SharedPodcastSummary {
  id:              string;
  workspaceId:     string;
  podcastId:       string;
  title:           string;
  hostName:        string;
  guestName:       string;
  durationSeconds: number;
  downloadCount:   number;
  playCount:       number;
  sharedAt:        string;
  sharerName?:     string;
}

// ─── Part 15: Workspace Report Download ──────────────────────────────────────

export interface WorkspaceReportDownload {
  id:           string;
  workspaceId:  string;
  reportId:     string;
  downloadedBy: string;
  downloadedAt: string;
  format:       'pdf' | 'markdown' | 'text';
}

// ─── Part 16: Workspace Shared Debate ─────────────────────────────────────────

/**
 * A debate session shared into a workspace.
 * Full denormalised copy so any workspace member can view/download
 * without owning the source debate_sessions row.
 * Re-generation is NOT possible from a shared debate — view + export only.
 */
export interface SharedDebate {
  /** Row ID in shared_debates table */
  id:                   string;
  workspaceId:          string;
  debateId:             string;
  sharedBy:             string;
  reportId?:            string;

  // Denormalised debate fields
  topic:                string;
  question:             string;
  agentRoles:           DebateAgentRole[];
  searchResultsCount:   number;

  // Full debate data (read-only for workspace members)
  perspectives:         DebatePerspective[];
  moderator:            DebateModerator | null;
  debateStatus:         DebateStatus;

  // Analytics
  viewCount:            number;
  downloadCount:        number;

  // Timestamps
  debateCreatedAt?:     string;
  debateCompletedAt?:   string;
  sharedAt:             string;

  // Enriched sharer info
  sharerName?:          string;
  sharerAvatar?:        string;
}

export interface SharedDebateState {
  debates:   SharedDebate[];
  isLoading: boolean;
  isSharing: boolean;
  error:     string | null;
}

/**
 * Lightweight summary for SharedContentCard (debate variant).
 */
export interface SharedDebateSummary {
  id:                 string;
  workspaceId:        string;
  debateId:           string;
  topic:              string;
  question:           string;
  perspectiveCount:   number;
  searchResultsCount: number;
  forCount:           number;
  againstCount:       number;
  viewCount:          number;
  downloadCount:      number;
  sharedAt:           string;
  sharerName?:        string;
}