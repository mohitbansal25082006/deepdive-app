// src/services/debateOrchestrator.ts
// Part 20 — Updated: passes DebateReportContext to every debate agent
// so they can ground arguments in imported research report data.
//
// Changes from Part 9:
//   • runDebatePipeline now accepts DebateConfigV2 (adds optional reportContext)
//   • Topic refinement prompt acknowledges report context when present
//   • Each runDebateAgent call receives the reportContext parameter
//   • Saves reportId to debate_sessions row when a report is attached
//   • All other logic (parallel agents, moderator, RLS checks) unchanged

import { supabase }           from '../lib/supabase';
import { chatCompletionJSON } from './openaiClient';
import { runDebateAgent, ROLE_DEFINITIONS } from './agents/debateAgent';
import type { DebateReportContext } from './agents/debateAgent';
import { runModeratorAgent }  from './agents/moderatorAgent';
import {
  DebateAgentRole,
  DebatePerspective,
  DebateSession,
  DebateOrchestratorCallbacks,
  DebateAgentProgressItem,
} from '../types';

// ─── Part 20: Extended config type ───────────────────────────────────────────

export interface DebateConfigV2 {
  agentRoles?:    DebateAgentRole[];
  reportContext?: DebateReportContext | null;
}

// ─── Default agent roster ─────────────────────────────────────────────────────

const DEFAULT_ROLES: DebateAgentRole[] = [
  'optimist',
  'skeptic',
  'economist',
  'technologist',
  'ethicist',
  'futurist',
];

// ─── Topic → Question refinement ─────────────────────────────────────────────
// Part 20: if a report context is provided, mention it so the question
// is more specific to the report's subject matter.

async function refineTopicToQuestion(
  topic:         string,
  reportContext: DebateReportContext | null,
): Promise<string> {
  const reportHint = reportContext
    ? `\nContext: We have a research report titled "${reportContext.reportTitle}" covering: ${reportContext.keyThemes.slice(0, 3).join(', ')}. The question should be specific enough to leverage the report's data.`
    : '';

  try {
    const result = await chatCompletionJSON<{ question: string }>(
      [
        {
          role:    'system',
          content: 'You convert debate topics into single clear debatable questions. Return only valid JSON.',
        },
        {
          role:    'user',
          content: `Debate topic: "${topic}"${reportHint}

Convert this into one clear, specific debatable question that:
- Can be argued for or against
- Is phrased as a "Will...", "Should...", "Is...", or "Can..." question
- Is specific enough that different analytical lenses produce genuinely different answers
- Is concise (under 15 words)

Return ONLY: {"question": "The refined question?"}`,
        },
      ],
      { temperature: 0.3, maxTokens: 120 },
    );
    return (result?.question?.trim()) || topic;
  } catch {
    return topic.endsWith('?') ? topic : `${topic}?`;
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runDebatePipeline(
  userId:    string,
  topic:     string,
  config:    DebateConfigV2,
  callbacks: DebateOrchestratorCallbacks,
): Promise<void> {
  const roles         = config.agentRoles?.length ? config.agentRoles : DEFAULT_ROLES;
  const reportContext = config.reportContext ?? null;

  // ── Pre-flight checks ─────────────────────────────────────────────────────

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError(
      'OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart: npx expo start --clear',
    );
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    callbacks.onError('Your session has expired. Please sign out and sign back in.');
    return;
  }

  if (sessionData.session.user.id !== userId) {
    callbacks.onError('Session mismatch. Please sign out and sign back in.');
    return;
  }

  // ── Initialise progress ───────────────────────────────────────────────────

  let agentProgress: DebateAgentProgressItem[] = roles.map(role => ({
    role,
    label:  ROLE_DEFINITIONS[role].label,
    status: 'pending' as const,
    color:  ROLE_DEFINITIONS[role].color,
    icon:   ROLE_DEFINITIONS[role].icon,
  }));

  const updateAgent = (
    role:    DebateAgentRole,
    status:  DebateAgentProgressItem['status'],
    detail?: string,
  ) => {
    agentProgress = agentProgress.map(p =>
      p.role === role
        ? {
            ...p,
            status,
            detail,
            startedAt:   status === 'searching'  ? Date.now() : p.startedAt,
            completedAt: status === 'completed'  ? Date.now() : p.completedAt,
          }
        : p,
    );
    callbacks.onAgentProgressUpdate([...agentProgress]);
  };

  callbacks.onAgentProgressUpdate([...agentProgress]);

  // ── Refine topic → question ───────────────────────────────────────────────

  callbacks.onStatusUpdate(
    reportContext
      ? `Analysing topic with research report context from "${reportContext.reportTitle}"...`
      : 'Analysing debate topic...',
  );
  const question = await refineTopicToQuestion(topic, reportContext);
  callbacks.onStatusUpdate(`Debate question: "${question}"`);

  // ── Create Supabase row ───────────────────────────────────────────────────
  // Part 20: store linked_report_id if a report was attached

  const insertPayload: Record<string, unknown> = {
    user_id:     userId,
    topic:       topic.trim(),
    question,
    status:      'searching',
    agent_roles: roles,
  };

  if (reportContext?.reportId) {
    insertPayload['linked_report_id'] = reportContext.reportId;
  }

  const { data: dbRow, error: insertError } = await supabase
    .from('debate_sessions')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError || !dbRow) {
    const msg = insertError?.message ?? 'Unknown database error';

    if (msg.includes('relation') && msg.includes('does not exist')) {
      callbacks.onError('Database table not found.\n\nRun schema_part9.sql in your Supabase SQL Editor.');
    } else if (msg.includes('column') && msg.includes('linked_report_id')) {
      // Schema not yet updated for Part 20 — retry without linked_report_id
      const { data: fallbackRow, error: fallbackError } = await supabase
        .from('debate_sessions')
        .insert({
          user_id:     userId,
          topic:       topic.trim(),
          question,
          status:      'searching',
          agent_roles: roles,
        })
        .select()
        .single();

      if (fallbackError || !fallbackRow) {
        callbacks.onError(`Database error: ${fallbackError?.message ?? 'Unknown error'}`);
        return;
      }

      // Continue with fallback row
      return runPipelineCore(
        userId, topic, question, roles, reportContext,
        fallbackRow, callbacks, updateAgent, (p) => { agentProgress = p; },
      );
    } else if (msg.includes('row-level security') || insertError?.code === '42501') {
      callbacks.onError('Database permission denied. Re-run schema_part9.sql.');
    } else {
      callbacks.onError(`Database error: ${msg}`);
    }
    return;
  }

  await runPipelineCore(
    userId, topic, question, roles, reportContext,
    dbRow, callbacks, updateAgent, (p) => { agentProgress = p; },
  );
}

// ─── Core pipeline (separated to allow fallback retry) ───────────────────────

async function runPipelineCore(
  userId:         string,
  topic:          string,
  question:       string,
  roles:          DebateAgentRole[],
  reportContext:  DebateReportContext | null,
  dbRow:          Record<string, unknown>,
  callbacks:      DebateOrchestratorCallbacks,
  updateAgent:    (role: DebateAgentRole, status: DebateAgentProgressItem['status'], detail?: string) => void,
  _setProgress:   (p: DebateAgentProgressItem[]) => void,
): Promise<void> {
  const sessionId = dbRow.id as string;

  const updateStatus = async (
    status: string,
    extra?: Record<string, unknown>,
  ) => {
    const { error } = await supabase
      .from('debate_sessions')
      .update({ status, ...extra })
      .eq('id', sessionId);
    if (error) console.warn('[DebateOrchestrator] Status update failed:', error.message);
  };

  try {
    // ── Run all debate agents in parallel ─────────────────────────────────

    await updateStatus('debating');
    callbacks.onStatusUpdate(
      reportContext
        ? `Running ${roles.length} debate agents — grounded in report + live web search...`
        : `Running ${roles.length} debate agents in parallel...`,
    );

    const collectedPerspectives: DebatePerspective[] = [];
    let totalSearchResults = 0;

    const agentPromises = roles.map(async (role): Promise<void> => {
      updateAgent(role, 'searching');

      try {
        // Part 20: pass reportContext into each agent
        const perspective = await runDebateAgent(
          topic,
          question,
          role,
          (detail: string) => {
            const isThinking =
              detail.toLowerCase().includes('forming') ||
              detail.toLowerCase().includes('arguments');
            updateAgent(role, isThinking ? 'thinking' : 'searching', detail);
          },
          reportContext,  // ← Part 20 addition
        );

        updateAgent(role, 'completed', perspective.stanceLabel);
        totalSearchResults += perspective.sourcesUsed.length;
        collectedPerspectives.push(perspective);
        callbacks.onAgentComplete(role, perspective);

      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Agent failed';
        console.warn(`[DebateOrchestrator] Agent "${role}" failed:`, err);
        updateAgent(role, 'failed', msg.slice(0, 100));
        // Non-fatal — other agents continue
      }
    });

    await Promise.all(agentPromises);

    if (collectedPerspectives.length === 0) {
      throw new Error(
        'All debate agents failed to generate perspectives. Check your API keys and network connection.',
      );
    }

    // Re-order perspectives to match the original roles array
    const orderedPerspectives = roles
      .map(r => collectedPerspectives.find(p => p.agentRole === r))
      .filter((p): p is DebatePerspective => p !== undefined);

    callbacks.onStatusUpdate(
      `${orderedPerspectives.length}/${roles.length} perspectives collected. Running moderator...`,
    );

    // ── Run moderator ──────────────────────────────────────────────────────

    await updateStatus('moderating');

    const moderator = await runModeratorAgent(topic, question, orderedPerspectives);

    // ── Save complete session ──────────────────────────────────────────────

    const completedAt = new Date().toISOString();

    const savePayload: Record<string, unknown> = {
      perspectives:         orderedPerspectives,
      moderator,
      status:               'completed',
      search_results_count: totalSearchResults,
      completed_at:         completedAt,
    };

    const { error: saveError } = await supabase
      .from('debate_sessions')
      .update(savePayload)
      .eq('id', sessionId);

    if (saveError) {
      throw new Error(`Failed to save debate session: ${saveError.message}`);
    }

    // ── Return final session ───────────────────────────────────────────────

    const finalSession: DebateSession = {
      id:                 sessionId,
      userId,
      topic,
      question,
      perspectives:       orderedPerspectives,
      moderator,
      status:             'completed',
      agentRoles:         roles,
      searchResultsCount: totalSearchResults,
      createdAt:          dbRow.created_at as string,
      completedAt,
    };

    callbacks.onComplete(finalSession);

  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown debate pipeline error';
    console.error('[DebateOrchestrator] Fatal pipeline error:', error);
    await updateStatus('failed', { error_message: message });
    callbacks.onError(message);
  }
}