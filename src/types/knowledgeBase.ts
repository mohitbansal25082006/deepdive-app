// src/types/knowledgeBase.ts
// Part 26 — Personal AI Knowledge Base (Second Brain)
//
// All types used by the KB feature.
// These are imported by the hook, agent, and UI components.

// ─── KB Stats ─────────────────────────────────────────────────────────────────

export interface KBStats {
  totalReports:   number;
  indexedReports: number;
  totalChunks:    number;
  lastIndexedAt:  string | null;
  /** Percentage of reports indexed (0–100) */
  indexedPct:     number;
}

// ─── KB Indexing ──────────────────────────────────────────────────────────────

/** One report that needs embedding */
export interface UnembeddedReport {
  reportId:    string;
  reportTitle: string;
  createdAt:   string;
}

export type KBIndexStatus =
  | 'idle'        // no indexing running
  | 'checking'    // checking which reports need indexing
  | 'indexing'    // actively embedding reports
  | 'complete'    // all reports indexed
  | 'error';      // indexing failed

export interface KBIndexState {
  status:       KBIndexStatus;
  /** Reports remaining to be indexed */
  pendingCount: number;
  /** Reports indexed so far in this run */
  doneCount:    number;
  /** Currently indexing this report title */
  currentTitle: string | null;
  error:        string | null;
}

// ─── Source Report Attribution ─────────────────────────────────────────────────

/** One report that contributed to an AI answer */
export interface KBSourceReport {
  reportId:     string;
  reportTitle:  string;
  /** Highest similarity score among this report's chunks */
  topSimilarity: number;
  /** Number of chunks retrieved from this report */
  chunkCount:   number;
  /** Types of chunks (section, finding, statistic, etc.) */
  chunkTypes:   string[];
  /** Date of the original research */
  createdAt?:   string;
}

// ─── Retrieved Chunk ──────────────────────────────────────────────────────────

export interface KBRetrievedChunk {
  id:          string;
  reportId:    string;
  reportTitle: string;
  chunkId:     string;
  chunkType:   string;
  content:     string;
  metadata:    Record<string, unknown>;
  similarity:  number;
}

// ─── KB Messages ──────────────────────────────────────────────────────────────

export interface KBMessage {
  id:             string;
  sessionId:      string;
  userId:         string;
  role:           'user' | 'assistant';
  content:        string;
  sourceReports:  KBSourceReport[];
  totalChunks:    number;
  reportsCount:   number;
  confidence:     'high' | 'medium' | 'low';
  queryExpansion: string[];
  createdAt:      string;
}

// ─── KB Session ───────────────────────────────────────────────────────────────

export interface KBSession {
  id:           string;
  userId:       string;
  title:        string;
  messageCount: number;
  createdAt:    string;
  updatedAt:    string;
}

// ─── Agent Response ───────────────────────────────────────────────────────────

export interface KBAgentResponse {
  content:        string;
  sourceReports:  KBSourceReport[];
  retrievedChunks: KBRetrievedChunk[];
  totalChunks:    number;
  reportsCount:   number;
  confidence:     'high' | 'medium' | 'low';
  queryExpansion: string[];
}

// ─── Hook State ───────────────────────────────────────────────────────────────

export interface KBState {
  // Session
  sessionId:     string | null;
  messages:      KBMessage[];

  // Sending
  isSending:     boolean;
  error:         string | null;

  // Indexing
  stats:         KBStats | null;
  indexState:    KBIndexState;

  // UI
  isLoadingHistory: boolean;
}

// ─── Suggested Queries ────────────────────────────────────────────────────────

export interface KBSuggestedQuery {
  label:    string;
  query:    string;
  icon:     string;
  gradient: readonly [string, string];
}

export const KB_SUGGESTED_QUERIES: KBSuggestedQuery[] = [
  {
    label:    'AI & Tech Trends',
    query:    'What have I researched about artificial intelligence and technology trends?',
    icon:     'sparkles-outline',
    gradient: ['#6C63FF', '#8B5CF6'] as const,
  },
  {
    label:    'Market Research',
    query:    'Summarize all the market research and business insights I have collected',
    icon:     'trending-up-outline',
    gradient: ['#43E97B', '#38F9D7'] as const,
  },
  {
    label:    'Key Statistics',
    query:    'What are the most important statistics and data points across all my research?',
    icon:     'bar-chart-outline',
    gradient: ['#FF6584', '#FF8E53'] as const,
  },
  {
    label:    'Future Predictions',
    query:    'What future predictions and forecasts appear across my research reports?',
    icon:     'telescope-outline',
    gradient: ['#4FACFE', '#00F2FE'] as const,
  },
  {
    label:    'Compare Topics',
    query:    'What topics appear in multiple reports and how do they connect?',
    icon:     'git-compare-outline',
    gradient: ['#FA709A', '#FEE140'] as const,
  },
  {
    label:    'Recent Research',
    query:    'What are the most important things I learned from my most recent research sessions?',
    icon:     'time-outline',
    gradient: ['#30CFD0', '#667EEA'] as const,
  },
];