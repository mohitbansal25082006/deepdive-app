// src/services/debateOrchestrator.ts
// Part 9 — Debate Pipeline Orchestrator
//
// Flow:
//   1. Validate credentials + API keys
//   2. Create pending debate_sessions row in Supabase
//   3. Refine topic → specific debatable question via GPT
//   4. Run all 6 debate agents in parallel (each with web search + GPT)
//   5. Run moderator agent on all collected perspectives
//   6. Save complete session to Supabase
//   7. Fire onComplete callback
//
// Non-fatal failures: if 1–5 agents fail, the debate continues with the
// remaining perspectives. Only if ALL agents fail does the pipeline error out.

import { supabase }            from '../lib/supabase';
import { chatCompletionJSON }  from './openaiClient';
import { runDebateAgent, ROLE_DEFINITIONS } from './agents/debateAgent';
import { runModeratorAgent }   from './agents/moderatorAgent';
import {
  DebateAgentRole,
  DebatePerspective,
  DebateSession,
  DebateConfig,
  DebateOrchestratorCallbacks,
  DebateAgentProgressItem,
} from '../types';

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

async function refineTopicToQuestion(topic: string): Promise<string> {
  try {
    const result = await chatCompletionJSON<{ question: string }>(
      [
        {
          role: 'system',
          content:
            'You convert debate topics into single clear debatable questions. Return only valid JSON.',
        },
        {
          role: 'user',
          content:
`Debate topic: "${topic}"

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
    // Fallback: use topic as-is
    return topic.endsWith('?') ? topic : `${topic}?`;
  }
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runDebatePipeline(
  userId:    string,
  topic:     string,
  config:    DebateConfig,
  callbacks: DebateOrchestratorCallbacks,
): Promise<void> {
  const roles = config.agentRoles?.length ? config.agentRoles : DEFAULT_ROLES;

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
            startedAt:   status === 'searching' ? Date.now()  : p.startedAt,
            completedAt: status === 'completed'  ? Date.now() : p.completedAt,
          }
        : p,
    );
    callbacks.onAgentProgressUpdate([...agentProgress]);
  };

  callbacks.onAgentProgressUpdate([...agentProgress]);

  // ── Refine topic → question ───────────────────────────────────────────────

  callbacks.onStatusUpdate('Analysing debate topic...');
  const question = await refineTopicToQuestion(topic);
  callbacks.onStatusUpdate(`Debate question: "${question}"`);

  // ── Create Supabase row ───────────────────────────────────────────────────

  const { data: dbRow, error: insertError } = await supabase
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

  if (insertError || !dbRow) {
    const msg = insertError?.message ?? 'Unknown database error';

    if (msg.includes('relation') && msg.includes('does not exist')) {
      callbacks.onError('Database table not found.\n\nRun schema_part9.sql in your Supabase SQL Editor.');
    } else if (msg.includes('row-level security') || insertError?.code === '42501') {
      callbacks.onError('Database permission denied. Re-run schema_part9.sql.');
    } else {
      callbacks.onError(`Database error: ${msg}`);
    }
    return;
  }

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
    callbacks.onStatusUpdate(`Running ${roles.length} debate agents in parallel...`);

    const collectedPerspectives: DebatePerspective[] = [];
    let totalSearchResults = 0;

    const agentPromises = roles.map(async (role): Promise<void> => {
      updateAgent(role, 'searching');

      try {
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

    // Wait for all agents (successes AND failures)
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

    const { error: saveError } = await supabase
      .from('debate_sessions')
      .update({
        perspectives:         orderedPerspectives,
        moderator,
        status:               'completed',
        search_results_count: totalSearchResults,
        completed_at:         completedAt,
      })
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
      createdAt:          dbRow.created_at,
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