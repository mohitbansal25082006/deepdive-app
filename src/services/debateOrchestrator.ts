// src/services/debateOrchestrator.ts
// Part 20 — passes DebateReportContext to every debate agent.
// Part 53G — AbortSignal support at the pipeline level.
// Part 56 — Cost: the only direct LLM call here (refineTopicToQuestion: topic →
//   debatable question) is routed to NANO. All agent/moderator model routing is
//   handled inside debateAgent.ts / moderatorAgent.ts.

import { supabase }           from '../lib/supabase';
import { chatCompletionJSON } from './openaiClient';
import { runDebateAgent, ROLE_DEFINITIONS } from './agents/debateAgent';
import type { DebateReportContext } from './agents/debateAgent';
import { runModeratorAgent }  from './agents/moderatorAgent';
import { modelFor }           from '../constants/aiModels';
import {
  DebateAgentRole,
  DebatePerspective,
  DebateSession,
  DebateOrchestratorCallbacks,
  DebateAgentProgressItem,
} from '../types';

export interface DebateConfigV2 {
  agentRoles?:    DebateAgentRole[];
  reportContext?: DebateReportContext | null;
}

const DEFAULT_ROLES: DebateAgentRole[] = [
  'optimist', 'skeptic', 'economist', 'technologist', 'ethicist', 'futurist',
];

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

async function refineTopicToQuestion(
  topic:         string,
  reportContext: DebateReportContext | null,
  signal?:       AbortSignal,
): Promise<string> {
  const reportHint = reportContext
    ? `\nContext: We have a research report titled "${reportContext.reportTitle}" covering: ${reportContext.keyThemes.slice(0, 3).join(', ')}. The question should be specific enough to leverage the report's data.`
    : '';
  try {
    const result = await chatCompletionJSON<{ question: string }>(
      [
        { role: 'system', content: 'You convert debate topics into single clear debatable questions. Return only valid JSON.' },
        { role: 'user', content: `Debate topic: "${topic}"${reportHint}

Convert this into one clear, specific debatable question that:
- Can be argued for or against
- Is phrased as a "Will...", "Should...", "Is...", or "Can..." question
- Is specific enough that different analytical lenses produce genuinely different answers
- Is concise (under 15 words)

Return ONLY: {"question": "The refined question?"}` },
      ],
      { temperature: 0.3, maxTokens: 120, signal, model: modelFor('debateRefineTopic') }, // ← Part 56 NANO
    );
    return (result?.question?.trim()) || topic;
  } catch (err) {
    if (isAbortError(err)) throw err;
    return topic.endsWith('?') ? topic : `${topic}?`;
  }
}

export async function runDebatePipeline(
  userId:    string,
  topic:     string,
  config:    DebateConfigV2,
  callbacks: DebateOrchestratorCallbacks,
  signal?:   AbortSignal,
): Promise<void> {
  const aborted = () => signal?.aborted === true;
  const roles         = config.agentRoles?.length ? config.agentRoles : DEFAULT_ROLES;
  const reportContext = config.reportContext ?? null;

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError('OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart: npx expo start --clear');
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) { callbacks.onError('Your session has expired. Please sign out and sign back in.'); return; }
  if (sessionData.session.user.id !== userId) { callbacks.onError('Session mismatch. Please sign out and sign back in.'); return; }

  if (aborted()) return;

  let agentProgress: DebateAgentProgressItem[] = roles.map(role => ({
    role, label: ROLE_DEFINITIONS[role].label, status: 'pending' as const,
    color: ROLE_DEFINITIONS[role].color, icon: ROLE_DEFINITIONS[role].icon,
  }));

  const updateAgent = (
    role: DebateAgentRole, status: DebateAgentProgressItem['status'], detail?: string,
  ) => {
    agentProgress = agentProgress.map(p =>
      p.role === role
        ? { ...p, status, detail,
            startedAt:   status === 'searching'  ? Date.now() : p.startedAt,
            completedAt: status === 'completed'  ? Date.now() : p.completedAt }
        : p,
    );
    callbacks.onAgentProgressUpdate([...agentProgress]);
  };

  callbacks.onAgentProgressUpdate([...agentProgress]);

  callbacks.onStatusUpdate(
    reportContext
      ? `Analysing topic with research report context from "${reportContext.reportTitle}"...`
      : 'Analysing debate topic...',
  );

  let question: string;
  try {
    question = await refineTopicToQuestion(topic, reportContext, signal);
  } catch (err) {
    if (isAbortError(err) || aborted()) return;
    question = topic.endsWith('?') ? topic : `${topic}?`;
  }
  callbacks.onStatusUpdate(`Debate question: "${question}"`);

  if (aborted()) return;

  const insertPayload: Record<string, unknown> = {
    user_id: userId, topic: topic.trim(), question,
    status: 'searching', agent_roles: roles,
  };
  if (reportContext?.reportId) insertPayload['linked_report_id'] = reportContext.reportId;

  const { data: dbRow, error: insertError } = await supabase
    .from('debate_sessions').insert(insertPayload).select().single();

  if (insertError || !dbRow) {
    const msg = insertError?.message ?? 'Unknown database error';
    if (msg.includes('relation') && msg.includes('does not exist')) {
      callbacks.onError('Database table not found.\n\nRun schema_part9.sql in your Supabase SQL Editor.');
    } else if (msg.includes('column') && msg.includes('linked_report_id')) {
      const { data: fallbackRow, error: fallbackError } = await supabase
        .from('debate_sessions')
        .insert({ user_id: userId, topic: topic.trim(), question, status: 'searching', agent_roles: roles })
        .select().single();
      if (fallbackError || !fallbackRow) { callbacks.onError(`Database error: ${fallbackError?.message ?? 'Unknown error'}`); return; }
      return runPipelineCore(userId, topic, question, roles, reportContext, fallbackRow, callbacks, updateAgent, (p) => { agentProgress = p; }, signal);
    } else if (msg.includes('row-level security') || insertError?.code === '42501') {
      callbacks.onError('Database permission denied. Re-run schema_part9.sql.');
    } else {
      callbacks.onError(`Database error: ${msg}`);
    }
    return;
  }

  await runPipelineCore(userId, topic, question, roles, reportContext, dbRow, callbacks, updateAgent, (p) => { agentProgress = p; }, signal);
}

async function runPipelineCore(
  userId:        string,
  topic:         string,
  question:      string,
  roles:         DebateAgentRole[],
  reportContext: DebateReportContext | null,
  dbRow:         Record<string, unknown>,
  callbacks:     DebateOrchestratorCallbacks,
  updateAgent:   (role: DebateAgentRole, status: DebateAgentProgressItem['status'], detail?: string) => void,
  _setProgress:  (p: DebateAgentProgressItem[]) => void,
  signal?:       AbortSignal,
): Promise<void> {
  const aborted = () => signal?.aborted === true;
  const sessionId = dbRow.id as string;

  const updateStatus = async (status: string, extra?: Record<string, unknown>) => {
    const { error } = await supabase.from('debate_sessions').update({ status, ...extra }).eq('id', sessionId);
    if (error) console.warn('[DebateOrchestrator] Status update failed:', error.message);
  };

  try {
    if (aborted()) { await updateStatus('cancelled'); return; }

    await updateStatus('debating');
    callbacks.onStatusUpdate(
      reportContext
        ? `Running ${roles.length} debate agents — grounded in report + live web search...`
        : `Running ${roles.length} debate agents in parallel...`,
    );

    const collectedPerspectives: DebatePerspective[] = [];
    let totalSearchResults = 0;

    const agentPromises = roles.map(async (role): Promise<void> => {
      if (aborted()) return;
      updateAgent(role, 'searching');
      try {
        const perspective = await runDebateAgent(
          topic, question, role,
          (detail: string) => {
            const isThinking = detail.toLowerCase().includes('forming') || detail.toLowerCase().includes('arguments');
            updateAgent(role, isThinking ? 'thinking' : 'searching', detail);
          },
          reportContext,
        );
        if (aborted()) return;
        updateAgent(role, 'completed', perspective.stanceLabel);
        totalSearchResults += perspective.sourcesUsed.length;
        collectedPerspectives.push(perspective);
        callbacks.onAgentComplete(role, perspective);
      } catch (err) {
        if (isAbortError(err)) return;
        const msg = err instanceof Error ? err.message : 'Agent failed';
        console.warn(`[DebateOrchestrator] Agent "${role}" failed:`, err);
        updateAgent(role, 'failed', msg.slice(0, 100));
      }
    });

    await Promise.all(agentPromises);

    if (aborted()) { await updateStatus('cancelled'); return; }

    if (collectedPerspectives.length === 0) {
      throw new Error('All debate agents failed to generate perspectives. Check your API keys and network connection.');
    }

    const orderedPerspectives = roles
      .map(r => collectedPerspectives.find(p => p.agentRole === r))
      .filter((p): p is DebatePerspective => p !== undefined);

    callbacks.onStatusUpdate(`${orderedPerspectives.length}/${roles.length} perspectives collected. Running moderator...`);

    if (aborted()) { await updateStatus('cancelled'); return; }

    await updateStatus('moderating');
    const moderator = await runModeratorAgent(topic, question, orderedPerspectives);

    if (aborted()) { await updateStatus('cancelled'); return; }

    const completedAt = new Date().toISOString();
    const savePayload: Record<string, unknown> = {
      perspectives: orderedPerspectives, moderator,
      status: 'completed', search_results_count: totalSearchResults, completed_at: completedAt,
    };

    const { error: saveError } = await supabase.from('debate_sessions').update(savePayload).eq('id', sessionId);
    if (saveError) throw new Error(`Failed to save debate session: ${saveError.message}`);

    const finalSession: DebateSession = {
      id: sessionId, userId, topic, question,
      perspectives: orderedPerspectives, moderator, status: 'completed',
      agentRoles: roles, searchResultsCount: totalSearchResults,
      createdAt: dbRow.created_at as string, completedAt,
    };

    callbacks.onComplete(finalSession);

  } catch (error) {
    if (isAbortError(error) || aborted()) { await updateStatus('cancelled').catch(() => {}); return; }
    const message = error instanceof Error ? error.message : 'Unknown debate pipeline error';
    console.error('[DebateOrchestrator] Fatal pipeline error:', error);
    await updateStatus('failed', { error_message: message });
    callbacks.onError(message);
  }
}