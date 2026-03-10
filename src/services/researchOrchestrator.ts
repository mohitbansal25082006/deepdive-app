// src/services/researchOrchestrator.ts
// Part 4: Added step 6 — Visualizer (runs knowledgeGraphAgent + infographicAgent)
// Also extracts source images and saves all visual data to Supabase.

import { supabase } from '../lib/supabase';
import {
  ResearchInput,
  ResearchReport,
  AgentStep,
  AgentName,
  OrchestratorCallbacks,
} from '../types';
import { runPlannerAgent }      from './agents/plannerAgent';
import { runAnalysisAgent }     from './agents/analysisAgent';
import { runFactCheckerAgent }  from './agents/factCheckAgent';
import { runReportAgent }       from './agents/reportAgent';
import { runKnowledgeGraphAgent } from './agents/knowledgeGraphAgent';
import { runInfographicAgent }  from './agents/infographicAgent';
import { serpSearchBatch }      from './serpApiClient';
import { extractSourceImages }  from './imageExtractor';
import { notifyReportComplete } from '../lib/notifications';

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
  {
    agent: 'visualizer',
    label: 'Visual Intelligence',
    description: 'Generating knowledge graph & infographics',
    status: 'pending',
  },
];

function cloneSteps(steps: AgentStep[]): AgentStep[] {
  return steps.map(s => ({ ...s }));
}

export async function runResearchPipeline(
  userId: string,
  input: ResearchInput,
  callbacks: OrchestratorCallbacks
): Promise<void> {
  const steps = cloneSteps(AGENT_STEPS);

  const setStepRunning = (agent: AgentName) => {
    const step = steps.find(s => s.agent === agent);
    if (step) { step.status = 'running'; step.startedAt = Date.now(); }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  const setStepDone = (agent: AgentName) => {
    const step = steps.find(s => s.agent === agent);
    if (step) { step.status = 'completed'; step.completedAt = Date.now(); }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  const setStepFailed = (agent: AgentName, detail?: string) => {
    const step = steps.find(s => s.agent === agent);
    if (step) { step.status = 'failed'; step.detail = detail; }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  // ── PRE-FLIGHT ────────────────────────────────────────────────────────────

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError('OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart with: npx expo start --clear');
    return;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) {
    callbacks.onError('Your session has expired. Please sign out and sign back in.');
    return;
  }

  if (sessionData.session.user.id !== userId) {
    callbacks.onError('Session mismatch. Please sign out and sign back in.');
    return;
  }

  // ── CREATE ROW ────────────────────────────────────────────────────────────

  const { data: reportRow, error: insertError } = await supabase
    .from('research_reports')
    .insert({
      user_id:     userId,
      query:       input.query,
      depth:       input.depth,
      focus_areas: input.focusAreas,
      status:      'planning',
    })
    .select()
    .single();

  if (insertError || !reportRow) {
    const msg = insertError?.message ?? 'Unknown error';
    if (msg.includes('relation') && msg.includes('does not exist')) {
      callbacks.onError('Database table not found.\n\nRun the schema SQL in your Supabase SQL Editor.');
    } else if (msg.includes('row-level security') || insertError?.code === '42501') {
      callbacks.onError('Database permission denied. Re-run the schema SQL.');
    } else {
      callbacks.onError(`Database error: ${msg}`);
    }
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
    // ── 1. PLANNER ────────────────────────────────────────────────────────────

    setStepRunning('planner');
    callbacks.onStepDetail('planner', 'Decomposing query into research strategy…');
    const plan = await runPlannerAgent(input);
    callbacks.onStepDetail('planner', `${plan.searchQueries.length} searches planned across ${plan.subtopics.length} subtopics`);
    setStepDone('planner');
    await updateStatus('searching', { search_queries: plan.searchQueries });

    // ── 2. WEB SEARCH ─────────────────────────────────────────────────────────

    setStepRunning('searcher');
    const searchBatches = await serpSearchBatch(plan.searchQueries, (query, index) => {
      callbacks.onStepDetail('searcher', `[${index + 1}/${plan.searchQueries.length}] "${query}"`);
    });
    const totalResults = searchBatches.reduce((sum, b) => sum + (b.results?.length ?? 0), 0);
    callbacks.onStepDetail('searcher', `${totalResults} results from ${searchBatches.length} searches`);
    setStepDone('searcher');
    await updateStatus('analyzing', { sources_count: totalResults });

    // ── 3. ANALYSIS ───────────────────────────────────────────────────────────

    setStepRunning('analyst');
    callbacks.onStepDetail('analyst', 'Extracting facts, statistics, and trends…');
    const analysis = await runAnalysisAgent(plan.topic, searchBatches);
    callbacks.onStepDetail('analyst', `${analysis.facts.length} facts · ${analysis.statistics.length} stats · ${analysis.trends.length} trends`);
    setStepDone('analyst');
    await updateStatus('fact_checking');

    // ── 4. FACT CHECK ─────────────────────────────────────────────────────────

    setStepRunning('factchecker');
    callbacks.onStepDetail('factchecker', 'Cross-verifying claims across sources…');
    const factCheck = await runFactCheckerAgent(plan.topic, analysis);
    callbacks.onStepDetail('factchecker', `${factCheck.verifiedFacts.length} verified · Reliability: ${factCheck.reliabilityScore}/10`);
    setStepDone('factchecker');
    await updateStatus('generating');

    // ── 5. REPORT GENERATION ──────────────────────────────────────────────────

    setStepRunning('reporter');
    callbacks.onStepDetail('reporter', 'Writing comprehensive research report…');
    const reportOutput = await runReportAgent(input, plan, analysis, factCheck, searchBatches);
    callbacks.onStepDetail('reporter', `${reportOutput.sections.length} sections · ${reportOutput.citations.length} citations`);
    setStepDone('reporter');
    await updateStatus('visualizing');

    // ── 6. VISUALIZER: Knowledge Graph + Infographics + Images ───────────────

    setStepRunning('visualizer');
    callbacks.onStepDetail('visualizer', 'Extracting source images…');

    const sourceImages = extractSourceImages(searchBatches, 12);
    callbacks.onStepDetail('visualizer', `${sourceImages.length} source images · Generating infographics…`);

    // Build a partial report object so agents can work from it
    const partialReport: ResearchReport = {
      id:               reportId,
      userId,
      query:            input.query,
      depth:            input.depth,
      focusAreas:       input.focusAreas,
      title:            reportOutput.title,
      executiveSummary: reportOutput.executiveSummary,
      sections:         reportOutput.sections,
      keyFindings:      reportOutput.keyFindings,
      futurePredictions:reportOutput.futurePredictions,
      citations:        reportOutput.citations,
      statistics:       reportOutput.statistics,
      searchQueries:    plan.searchQueries,
      sourcesCount:     totalResults,
      reliabilityScore: factCheck.reliabilityScore,
      status:           'visualizing',
      agentLogs:        steps,
      sourceImages,
      createdAt:        reportRow.created_at,
    };

    // Run knowledge graph and infographic agents in parallel
    const [knowledgeGraph, infographicData] = await Promise.allSettled([
      runKnowledgeGraphAgent(partialReport),
      runInfographicAgent(partialReport),
    ]);

    const kgResult = knowledgeGraph.status === 'fulfilled' ? knowledgeGraph.value : undefined;
    const igResult = infographicData.status === 'fulfilled' ? infographicData.value : undefined;

    callbacks.onStepDetail(
      'visualizer',
      [
        kgResult ? `Knowledge graph: ${kgResult.nodes.length} nodes` : '(graph skipped)',
        igResult ? `${igResult.charts.length} charts · ${igResult.stats.length} stats` : '(infographics skipped)',
      ].join(' · ')
    );
    setStepDone('visualizer');

    // ── SAVE COMPLETE REPORT ──────────────────────────────────────────────────

    const { error: saveError } = await supabase
      .from('research_reports')
      .update({
        title:             reportOutput.title,
        executive_summary: reportOutput.executiveSummary,
        sections:          reportOutput.sections,
        key_findings:      reportOutput.keyFindings,
        future_predictions:reportOutput.futurePredictions,
        citations:         reportOutput.citations,
        statistics:        reportOutput.statistics,
        reliability_score: factCheck.reliabilityScore,
        agent_logs:        steps,
        knowledge_graph:   kgResult ?? null,
        infographic_data:  igResult ?? null,
        source_images:     sourceImages,
        status:            'completed',
        completed_at:      new Date().toISOString(),
      })
      .eq('id', reportId);

    if (saveError) throw new Error(`Failed to save report: ${saveError.message}`);

    // ── FINAL REPORT OBJECT ───────────────────────────────────────────────────

    const finalReport: ResearchReport = {
      ...partialReport,
      status:          'completed',
      agentLogs:       steps,
      knowledgeGraph:  kgResult,
      infographicData: igResult,
      sourceImages,
      completedAt:     new Date().toISOString(),
    };

    await notifyReportComplete(reportId, reportOutput.title);
    callbacks.onComplete(finalReport);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown research error';
    console.error('[Orchestrator] Pipeline error:', error);
    const runningStep = steps.find(s => s.status === 'running');
    if (runningStep) setStepFailed(runningStep.agent, message);
    await updateStatus('failed', { error_message: message, agent_logs: steps });
    callbacks.onError(message);
  }
}