// src/services/researchOrchestrator.ts
// Part 7: Added step 7 — Academic Paper Agent (runs only when input.mode === 'academic')
// FIX: AcademicAgentOutput.sections is Omit<AcademicSection,'id'>[] but
//      AcademicPaper.sections / the DB column require AcademicSection[].
//      hydrateSections() inside academicPaperAgent already adds ids before
//      returning so we cast with `as AcademicSection[]` at the call sites.

import { supabase } from '../lib/supabase';
import {
  ResearchInput,
  ResearchReport,
  AgentStep,
  AgentName,
  OrchestratorCallbacks,
  ResearchMode,
  AcademicPaper,
  AcademicSection,
} from '../types';
import { runPlannerAgent }        from './agents/plannerAgent';
import { runAnalysisAgent }       from './agents/analysisAgent';
import { runFactCheckerAgent }    from './agents/factCheckAgent';
import { runReportAgent }         from './agents/reportAgent';
import { runKnowledgeGraphAgent } from './agents/knowledgeGraphAgent';
import { runInfographicAgent }    from './agents/infographicAgent';
import { runAcademicPaperAgent }  from './agents/academicPaperAgent';
import { serpSearchBatch }        from './serpApiClient';
import { extractSourceImages }    from './imageExtractor';
import { notifyReportComplete }   from '../lib/notifications';

// ─── Agent step templates ─────────────────────────────────────────────────────

const BASE_STEPS: AgentStep[] = [
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

const ACADEMIC_STEP: AgentStep = {
  agent: 'academic',
  label: 'Academic Paper Agent',
  description: 'Writing structured academic research paper',
  status: 'pending',
};

function buildSteps(mode: ResearchMode = 'standard'): AgentStep[] {
  const steps = BASE_STEPS.map(s => ({ ...s }));
  if (mode === 'academic') steps.push({ ...ACADEMIC_STEP });
  return steps;
}

function cloneSteps(steps: AgentStep[]): AgentStep[] {
  return steps.map(s => ({ ...s }));
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runResearchPipeline(
  userId: string,
  input:  ResearchInput,
  callbacks: OrchestratorCallbacks,
): Promise<void> {
  const mode  = input.mode ?? 'standard';
  const steps = buildSteps(mode);

  // ── Step state helpers ────────────────────────────────────────────────────

  const setStepRunning = (agent: AgentName) => {
    const s = steps.find(s => s.agent === agent);
    if (s) { s.status = 'running'; s.startedAt = Date.now(); }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  const setStepDone = (agent: AgentName) => {
    const s = steps.find(s => s.agent === agent);
    if (s) { s.status = 'completed'; s.completedAt = Date.now(); }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  const setStepFailed = (agent: AgentName, detail?: string) => {
    const s = steps.find(s => s.agent === agent);
    if (s) { s.status = 'failed'; s.detail = detail; }
    callbacks.onStepUpdate(cloneSteps(steps));
  };

  // ── Pre-flight ────────────────────────────────────────────────────────────

  const openaiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!openaiKey?.trim()) {
    callbacks.onError(
      'OpenAI API key is missing.\n\nAdd EXPO_PUBLIC_OPENAI_API_KEY to your .env file and restart with: npx expo start --clear',
    );
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

  // ── Create DB row ─────────────────────────────────────────────────────────

  const { data: reportRow, error: insertError } = await supabase
    .from('research_reports')
    .insert({
      user_id:       userId,
      query:         input.query,
      depth:         input.depth,
      focus_areas:   input.focusAreas,
      status:        'planning',
      research_mode: mode,
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
    // ── STEP 1 — PLANNER ────────────────────────────────────────────────────

    setStepRunning('planner');
    callbacks.onStepDetail('planner', 'Decomposing query into research strategy…');
    const plan = await runPlannerAgent(input);
    callbacks.onStepDetail(
      'planner',
      `${plan.searchQueries.length} searches planned across ${plan.subtopics.length} subtopics`,
    );
    setStepDone('planner');
    await updateStatus('searching', { search_queries: plan.searchQueries });

    // ── STEP 2 — WEB SEARCH ─────────────────────────────────────────────────

    setStepRunning('searcher');
    const searchBatches = await serpSearchBatch(plan.searchQueries, (query, index) => {
      callbacks.onStepDetail('searcher', `[${index + 1}/${plan.searchQueries.length}] "${query}"`);
    });
    const totalResults = searchBatches.reduce((sum, b) => sum + (b.results?.length ?? 0), 0);
    callbacks.onStepDetail('searcher', `${totalResults} results from ${searchBatches.length} searches`);
    setStepDone('searcher');
    await updateStatus('analyzing', { sources_count: totalResults });

    // ── STEP 3 — ANALYSIS ───────────────────────────────────────────────────

    setStepRunning('analyst');
    callbacks.onStepDetail('analyst', 'Extracting facts, statistics, and trends…');
    const analysis = await runAnalysisAgent(plan.topic, searchBatches);
    callbacks.onStepDetail(
      'analyst',
      `${analysis.facts.length} facts · ${analysis.statistics.length} stats · ${analysis.trends.length} trends`,
    );
    setStepDone('analyst');
    await updateStatus('fact_checking');

    // ── STEP 4 — FACT CHECK ─────────────────────────────────────────────────

    setStepRunning('factchecker');
    callbacks.onStepDetail('factchecker', 'Cross-verifying claims across sources…');
    const factCheck = await runFactCheckerAgent(plan.topic, analysis);
    callbacks.onStepDetail(
      'factchecker',
      `${factCheck.verifiedFacts.length} verified · Reliability: ${factCheck.reliabilityScore}/10`,
    );
    setStepDone('factchecker');
    await updateStatus('generating');

    // ── STEP 5 — REPORT GENERATION ──────────────────────────────────────────

    setStepRunning('reporter');
    callbacks.onStepDetail('reporter', 'Writing comprehensive research report…');
    const reportOutput = await runReportAgent(input, plan, analysis, factCheck, searchBatches);
    callbacks.onStepDetail(
      'reporter',
      `${reportOutput.sections.length} sections · ${reportOutput.citations.length} citations`,
    );
    setStepDone('reporter');
    await updateStatus('visualizing');

    // ── STEP 6 — VISUALIZER ─────────────────────────────────────────────────

    setStepRunning('visualizer');
    callbacks.onStepDetail('visualizer', 'Extracting source images…');

    const sourceImages = extractSourceImages(searchBatches, 12);
    callbacks.onStepDetail(
      'visualizer',
      `${sourceImages.length} source images · Generating infographics…`,
    );

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
      researchMode:     mode,
      createdAt:        reportRow.created_at,
    };

    const [knowledgeGraph, infographicData] = await Promise.allSettled([
      runKnowledgeGraphAgent(partialReport),
      runInfographicAgent(partialReport),
    ]);

    const kgResult = knowledgeGraph.status  === 'fulfilled' ? knowledgeGraph.value  : undefined;
    const igResult = infographicData.status === 'fulfilled' ? infographicData.value : undefined;

    callbacks.onStepDetail(
      'visualizer',
      [
        kgResult ? `Knowledge graph: ${kgResult.nodes.length} nodes` : '(graph skipped)',
        igResult ? `${igResult.charts.length} charts · ${igResult.stats.length} stats` : '(infographics skipped)',
      ].join(' · '),
    );
    setStepDone('visualizer');

    // ── STEP 7 — ACADEMIC PAPER (academic mode only) ─────────────────────────

    let academicPaper: AcademicPaper | null = null;

    if (mode === 'academic') {
      await updateStatus('writing_paper');
      setStepRunning('academic');
      callbacks.onStepDetail('academic', 'Structuring academic paper sections…');

      try {
        const reportForAcademic: ResearchReport = {
          ...partialReport,
          knowledgeGraph:  kgResult,
          infographicData: igResult,
          sourceImages,
        };

        callbacks.onStepDetail('academic', 'Writing Abstract & Introduction…');

        const {
          output: paperOutput,
          citations: paperCitations,
          wordCount,
          pageEstimate,
        } = await runAcademicPaperAgent(
          input,
          plan,
          analysis,
          factCheck,
          searchBatches,
          reportForAcademic,
          'apa',
        );

        callbacks.onStepDetail(
          'academic',
          `${paperOutput.sections.length} sections · ~${wordCount.toLocaleString()} words · ~${pageEstimate} pages`,
        );

        // FIX: paperOutput.sections is Omit<AcademicSection,'id'>[] per the
        // AcademicAgentOutput type, but hydrateSections() inside the agent
        // already adds an `id` to every section before returning.
        // We cast to AcademicSection[] here — the runtime value is correct.
        const sectionsWithIds = paperOutput.sections as AcademicSection[];

        const { data: paperRow, error: paperInsertError } = await supabase
          .from('academic_papers')
          .insert({
            report_id:      reportId,
            user_id:        userId,
            title:          paperOutput.title,
            running_head:   paperOutput.runningHead,
            abstract:       paperOutput.abstract,
            keywords:       paperOutput.keywords,
            sections:       sectionsWithIds,   // ← cast applied here
            citations:      paperCitations,
            citation_style: 'apa',
            word_count:     wordCount,
            page_estimate:  pageEstimate,
            generated_at:   new Date().toISOString(),
          })
          .select()
          .single();

        if (paperInsertError || !paperRow) {
          console.warn('[Orchestrator] Academic paper save failed:', paperInsertError?.message);
          callbacks.onStepDetail('academic', '⚠ Paper generated but could not be saved');
        } else {
          academicPaper = {
            id:            paperRow.id,
            reportId:      reportId,
            userId:        userId,
            title:         paperOutput.title,
            runningHead:   paperOutput.runningHead,
            abstract:      paperOutput.abstract,
            keywords:      paperOutput.keywords,
            sections:      sectionsWithIds,   // ← cast applied here
            citations:     paperCitations,
            citationStyle: 'apa',
            wordCount,
            pageEstimate,
            generatedAt:   paperRow.generated_at,
            exportCount:   0,
          };

          callbacks.onStepDetail(
            'academic',
            `✓ Academic paper saved · ${wordCount.toLocaleString()} words · ${pageEstimate} pages`,
          );
        }

        setStepDone('academic');
      } catch (academicError) {
        // Non-fatal: log and mark step failed but don't throw — the standard
        // report is complete and usable.
        const academicMsg =
          academicError instanceof Error ? academicError.message : 'Unknown error';
        console.error('[Orchestrator] Academic Paper Agent error:', academicError);
        setStepFailed('academic', academicMsg);
        callbacks.onStepDetail(
          'academic',
          `⚠ Academic paper failed: ${academicMsg.slice(0, 80)}`,
        );
      }
    }

    // ── SAVE COMPLETE REPORT ─────────────────────────────────────────────────

    const savePayload: Record<string, unknown> = {
      title:              reportOutput.title,
      executive_summary:  reportOutput.executiveSummary,
      sections:           reportOutput.sections,
      key_findings:       reportOutput.keyFindings,
      future_predictions: reportOutput.futurePredictions,
      citations:          reportOutput.citations,
      statistics:         reportOutput.statistics,
      reliability_score:  factCheck.reliabilityScore,
      agent_logs:         steps,
      knowledge_graph:    kgResult  ?? null,
      infographic_data:   igResult  ?? null,
      source_images:      sourceImages,
      research_mode:      mode,
      status:             'completed',
      completed_at:       new Date().toISOString(),
    };

    if (academicPaper) {
      savePayload.academic_paper_id = academicPaper.id;
    }

    const { error: saveError } = await supabase
      .from('research_reports')
      .update(savePayload)
      .eq('id', reportId);

    if (saveError) throw new Error(`Failed to save report: ${saveError.message}`);

    // ── Final report object ──────────────────────────────────────────────────

    const finalReport: ResearchReport = {
      ...partialReport,
      status:          'completed',
      agentLogs:       steps,
      knowledgeGraph:  kgResult,
      infographicData: igResult,
      sourceImages,
      researchMode:    mode,
      academicPaperId: academicPaper?.id,
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