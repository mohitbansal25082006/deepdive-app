// src/services/researchOrchestrator.ts
// FIXED: Added auth pre-check, surfaces real Supabase errors,
// validates API keys before starting the pipeline.

import { supabase } from '../lib/supabase';
import {
  ResearchInput,
  ResearchReport,
  AgentStep,
  AgentName,
  OrchestratorCallbacks,
} from '../types';
import { runPlannerAgent } from './agents/plannerAgent';
import { runAnalysisAgent } from './agents/analysisAgent';
import { runFactCheckerAgent } from './agents/factCheckAgent';
import { runReportAgent } from './agents/reportAgent';
import { serpSearchBatch } from './serpApiClient';

const AGENT_STEPS: AgentStep[] = [
  {
    agent: 'planner',
    label: 'Research Planner',
    description: 'Analyzing query and creating research strategy',
    status: 'pending',
  },
  {
    agent: 'searcher',
    label: 'Web Search Agent',
    description: 'Searching the web for current information',
    status: 'pending',
  },
  {
    agent: 'analyst',
    label: 'Analysis Agent',
    description: 'Extracting insights from search data',
    status: 'pending',
  },
  {
    agent: 'factchecker',
    label: 'Fact Checker Agent',
    description: 'Verifying claims and scoring source reliability',
    status: 'pending',
  },
  {
    agent: 'reporter',
    label: 'Report Generator',
    description: 'Writing comprehensive research report',
    status: 'pending',
  },
];

function cloneSteps(steps: AgentStep[]): AgentStep[] {
  return steps.map((s) => ({ ...s }));
}

export async function runResearchPipeline(
  userId: string,
  input: ResearchInput,
  callbacks: OrchestratorCallbacks
): Promise<void> {
  const steps = cloneSteps(AGENT_STEPS);

  const setStepRunning = (agent: AgentName) => {
    const step = steps.find((s) => s.agent === agent);
    if (step) { step.status = 'running'; step.startedAt = Date.now(); }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  const setStepDone = (agent: AgentName) => {
    const step = steps.find((s) => s.agent === agent);
    if (step) { step.status = 'completed'; step.completedAt = Date.now(); }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  const setStepFailed = (agent: AgentName, detail?: string) => {
    const step = steps.find((s) => s.agent === agent);
    if (step) { step.status = 'failed'; step.detail = detail; }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  // ── PRE-FLIGHT CHECKS ────────────────────────────────────────────────────

  // 1. Validate OpenAI key
  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey || openaiKey.trim() === '') {
    callbacks.onError(
      'OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart the dev server with: npx expo start --clear'
    );
    return;
  }

  // 2. Validate Supabase session — the INSERT will fail silently if the
  //    auth session has expired or wasn't loaded yet.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) {
    callbacks.onError(
      'Your session has expired. Please sign out and sign back in, then try again.'
    );
    return;
  }

  // 3. Validate userId matches session (sanity check)
  const sessionUserId = sessionData.session.user.id;
  if (sessionUserId !== userId) {
    callbacks.onError('Session mismatch. Please sign out and sign back in.');
    return;
  }

  // ── CREATE SUPABASE RECORD ────────────────────────────────────────────────
  const { data: reportRow, error: insertError } = await supabase
    .from('research_reports')
    .insert({
      user_id: userId,
      query: input.query,
      depth: input.depth,
      focus_areas: input.focusAreas,
      status: 'planning',
    })
    .select()
    .single();

  if (insertError) {
    // Surface the real Supabase error so the user (and developer) can see it
    const msg = insertError.message ?? JSON.stringify(insertError);
    console.error('[Orchestrator] Supabase insert error:', insertError);

    if (msg.includes('relation') && msg.includes('does not exist')) {
      callbacks.onError(
        'Database table not found.\n\nRun the schema_part2_fixed.sql migration in your Supabase SQL Editor, then try again.'
      );
    } else if (msg.includes('row-level security') || msg.includes('RLS') || insertError.code === '42501') {
      callbacks.onError(
        'Database permission denied (RLS).\n\nRe-run schema_part2_fixed.sql in your Supabase SQL Editor to reset the policies.'
      );
    } else {
      callbacks.onError(`Database error: ${msg}`);
    }
    return;
  }

  if (!reportRow) {
    callbacks.onError('Failed to create research record. Please try again.');
    return;
  }

  const reportId = reportRow.id;

  const updateStatus = async (status: string, extra?: Record<string, unknown>) => {
    const { error } = await supabase
      .from('research_reports')
      .update({ status, ...extra })
      .eq('id', reportId);
    if (error) console.warn('[Orchestrator] Status update failed:', error.message);
  };

  try {
    // ── STEP 1: PLANNER ────────────────────────────────────────────────────
    setStepRunning('planner');
    callbacks.onStepDetail('planner', 'Decomposing query into research strategy...');

    const plan = await runPlannerAgent(input);
    callbacks.onStepDetail(
      'planner',
      `Planning ${plan.searchQueries.length} searches across ${plan.subtopics.length} subtopics`
    );
    setStepDone('planner');
    await updateStatus('searching', { search_queries: plan.searchQueries });

    // ── STEP 2: WEB SEARCH ──────────────────────────────────────────────────
    setStepRunning('searcher');

    const searchBatches = await serpSearchBatch(
      plan.searchQueries,
      (query, index) => {
        callbacks.onStepDetail(
          'searcher',
          `[${index + 1}/${plan.searchQueries.length}] Searching: "${query}"`
        );
      }
    );

    const totalResults = searchBatches.reduce((sum, b) => sum + b.results.length, 0);
    callbacks.onStepDetail('searcher', `Collected ${totalResults} results from ${searchBatches.length} searches`);
    setStepDone('searcher');
    await updateStatus('analyzing', { sources_count: totalResults });

    // ── STEP 3: ANALYSIS ────────────────────────────────────────────────────
    setStepRunning('analyst');
    callbacks.onStepDetail('analyst', 'Extracting facts, statistics, and trends...');

    const analysis = await runAnalysisAgent(plan.topic, searchBatches);
    callbacks.onStepDetail(
      'analyst',
      `Found ${analysis.facts.length} facts, ${analysis.statistics.length} statistics, ${analysis.trends.length} trends`
    );
    setStepDone('analyst');
    await updateStatus('fact_checking');

    // ── STEP 4: FACT CHECKING ───────────────────────────────────────────────
    setStepRunning('factchecker');
    callbacks.onStepDetail('factchecker', 'Cross-verifying claims across sources...');

    const factCheck = await runFactCheckerAgent(plan.topic, analysis);
    callbacks.onStepDetail(
      'factchecker',
      `Verified ${factCheck.verifiedFacts.length} facts — Reliability: ${factCheck.reliabilityScore}/10`
    );
    setStepDone('factchecker');
    await updateStatus('generating');

    // ── STEP 5: REPORT GENERATION ───────────────────────────────────────────
    setStepRunning('reporter');
    callbacks.onStepDetail('reporter', 'Writing comprehensive research report...');

    const reportOutput = await runReportAgent(input, plan, analysis, factCheck, searchBatches);
    callbacks.onStepDetail(
      'reporter',
      `Generated ${reportOutput.sections.length} sections with ${reportOutput.citations.length} citations`
    );
    setStepDone('reporter');

    // ── SAVE COMPLETE REPORT ────────────────────────────────────────────────
    const { error: saveError } = await supabase
      .from('research_reports')
      .update({
        title: reportOutput.title,
        executive_summary: reportOutput.executiveSummary,
        sections: reportOutput.sections,
        key_findings: reportOutput.keyFindings,
        future_predictions: reportOutput.futurePredictions,
        citations: reportOutput.citations,
        statistics: reportOutput.statistics,
        reliability_score: factCheck.reliabilityScore,
        agent_logs: steps,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    if (saveError) {
      console.error('[Orchestrator] Save error:', saveError);
      throw new Error(`Failed to save report: ${saveError.message}`);
    }

    // ── RETURN COMPLETE REPORT ──────────────────────────────────────────────
    const finalReport: ResearchReport = {
      id: reportId,
      userId,
      query: input.query,
      depth: input.depth,
      focusAreas: input.focusAreas,
      title: reportOutput.title,
      executiveSummary: reportOutput.executiveSummary,
      sections: reportOutput.sections,
      keyFindings: reportOutput.keyFindings,
      futurePredictions: reportOutput.futurePredictions,
      citations: reportOutput.citations,
      statistics: reportOutput.statistics,
      searchQueries: plan.searchQueries,
      sourcesCount: totalResults,
      reliabilityScore: factCheck.reliabilityScore,
      status: 'completed',
      agentLogs: steps,
      createdAt: reportRow.created_at,
      completedAt: new Date().toISOString(),
    };

    callbacks.onComplete(finalReport);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown research error';
    console.error('[Orchestrator] Pipeline error:', error);

    const runningStep = steps.find((s) => s.status === 'running');
    if (runningStep) setStepFailed(runningStep.agent, message);

    await updateStatus('failed', { error_message: message, agent_logs: steps });
    callbacks.onError(message);
  }
}