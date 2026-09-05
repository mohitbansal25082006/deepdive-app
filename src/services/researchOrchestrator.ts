// src/services/researchOrchestrator.ts
// Part 58.2 — SERPAPI → TAVILY MIGRATION
// All web search calls now use tavilySearchDeep / tavilySearchBatch
// The external API is identical — the orchestrator doesn't need changes
// beyond replacing the import and function calls.
//
// Part 59 — SECURE SERVER-SIDE API KEYS
// The env-var pre-flight checks are gone. There is no OpenAI or Tavily key in
// the app to check for any more: openaiClient and tavilyClient both call
// Supabase Edge Functions, which hold the keys. Failure is now reported by the
// first real call rather than guessed at up front, which is both more accurate
// (a present-but-revoked key used to pass the old check) and more graceful
// (Tavily degrades to mock results instead of blocking the whole run).

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
  ReportSection,
  DEPTH_SEARCH_CONFIG,
} from '../types';
import { runPlannerAgent } from './agents/plannerAgent';
import { runAnalysisAgent } from './agents/analysisAgent';
import { runFactCheckerAgent } from './agents/factCheckAgent';
import { runKnowledgeGraphAgent } from './agents/knowledgeGraphAgent';
import { runInfographicAgent } from './agents/infographicAgent';
import { runAcademicPaperAgent } from './agents/academicPaperAgent';
import { runStreamingReportAgent, StreamingReportOutput } from './agents/streamingReportAgent';
import { extractSourceImages } from './imageExtractor';
// ── Part 58.2: Tavily replaces SerpAPI ──
import {
  tavilySearchDeep,
  tavilySearchBatch,
  DeepSearchCallbacks,
} from './tavilyClient';
import { recordResearchCompletion } from './homePersonalizationService';
import { computeBatchTrustSummary } from './sourceTrustScorer';

// ─── Agent step templates ──────────────────────────────────────────────────────

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
    description: 'Multi-round web research with source trust scoring (Tavily)',
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
    description: 'Writing comprehensive research report — sections stream live',
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
  input: ResearchInput,
  callbacks: OrchestratorCallbacks,
  signal?: AbortSignal,
): Promise<void> {

  const aborted = () => signal?.aborted === true;
  const mode = input.mode ?? 'standard';
  const steps = buildSteps(mode);

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

  // ── Pre-flight checks ─────────────────────────────────────────────────────
  //
  // Part 59: the API-key checks that used to live here are gone. The keys are
  // server-side now, so there is nothing in process.env to inspect. What
  // remains is the session check — which matters MORE than it used to, because
  // every gateway call is authenticated with this session. Starting a report
  // without a valid session would now fail on the very first agent call.

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
      user_id: userId,
      query: input.query,
      depth: input.depth,
      focus_areas: input.focusAreas,
      status: 'planning',
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
    // ── STEP 1 — PLANNER ───────────────────────────────────────────────────

    if (aborted()) return;
    setStepRunning('planner');
    callbacks.onStepDetail('planner', 'Decomposing query into research strategy…');

    const plan = await runPlannerAgent(input);

    const config = DEPTH_SEARCH_CONFIG[input.depth];
    const totalExpectedQueries =
      config.maxQueries +
      config.followUpQueries +
      (input.depth === 'expert' ? 4 : 0);

    callbacks.onStepDetail(
      'planner',
      `${plan.searchQueries.length} primary + up to ${config.followUpQueries} follow-up = ~${totalExpectedQueries} total queries planned`,
    );
    setStepDone('planner');
    await updateStatus('searching', { search_queries: plan.searchQueries });

    // ── STEP 2 — WEB SEARCH (Tavily) ──────────────────────────────────────

    if (aborted()) return;
    setStepRunning('searcher');

    let searchBatches: import('../types').SearchBatch[];
    let totalUnique = 0;
    let trustSummary: ReturnType<typeof computeBatchTrustSummary> | null = null;

    if (input.depth === 'quick') {
      callbacks.onStepDetail('searcher', `[Quick] Running ${plan.searchQueries.length} Tavily searches…`);

      searchBatches = await tavilySearchBatch(
        plan.searchQueries,
        (query, index) => {
          callbacks.onStepDetail('searcher', `[${index + 1}/${plan.searchQueries.length}] "${query}"`);
        },
        config.resultsPerQuery,
        'basic', // Tavily search depth
      );

      totalUnique = new Set(searchBatches.flatMap(b => b.results.map(r => r.url))).size;
      trustSummary = computeBatchTrustSummary(searchBatches.flatMap(b => b.results));

    } else {
      // Deep / Expert — multi-round with Tavily
      const deepCallbacks: Partial<DeepSearchCallbacks> = {
        onRoundStart: (round, totalRounds, label) => {
          callbacks.onStepDetail(
            'searcher',
            `Round ${round}/${totalRounds}: ${label} (Tavily)`,
          );
        },
        onQueryProgress: (query, qi, total) => {
          callbacks.onStepDetail(
            'searcher',
            `Searching [${qi}/${total}]: "${query.slice(0, 60)}…"`,
          );
        },
        onRoundComplete: (round, newCount, totalUniq) => {
          callbacks.onStepDetail(
            'searcher',
            `Round ${round} complete — ${newCount} new sources · ${totalUniq} unique total`,
          );
        },
      };

      const deepResult = await tavilySearchDeep(
        plan.searchQueries,
        input.depth,
        deepCallbacks,
      );

      searchBatches = deepResult.batches;
      totalUnique = deepResult.totalUnique;
      trustSummary = {
        avgScore: deepResult.trustSummary.avgScore,
        tierBreakdown: {
          1: deepResult.trustSummary.tier1Count,
          2: deepResult.trustSummary.tier2Count,
          3: deepResult.trustSummary.tier3Count,
          4: deepResult.trustSummary.tier4Count,
        },
        highQualityPercent: deepResult.trustSummary.highQualityPercent,
      };
    }

    const totalResults = searchBatches.reduce((sum, b) => sum + (b.results?.length ?? 0), 0);

    callbacks.onStepDetail(
      'searcher',
      [
        `${totalUnique} unique sources`,
        `${searchBatches.length} search queries executed`,
        trustSummary
          ? `avg quality ${trustSummary.avgScore}/10 · ${trustSummary.highQualityPercent}% high-quality`
          : '',
      ].filter(Boolean).join(' · '),
    );
    setStepDone('searcher');
    await updateStatus('analyzing', { sources_count: totalUnique });

    // ── STEP 3 — ANALYSIS ──────────────────────────────────────────────────

    if (aborted()) return;
    setStepRunning('analyst');
    callbacks.onStepDetail('analyst', `Extracting facts & statistics from ${totalUnique} sources…`);

    const analysis = await runAnalysisAgent(plan.topic, searchBatches);

    callbacks.onStepDetail(
      'analyst',
      `${analysis.facts.length} facts · ${analysis.statistics.length} stats · ${analysis.trends.length} trends · ${analysis.companies.length} companies`,
    );
    setStepDone('analyst');
    await updateStatus('fact_checking');

    // ── STEP 4 — FACT CHECK ────────────────────────────────────────────────

    if (aborted()) return;
    setStepRunning('factchecker');
    callbacks.onStepDetail('factchecker', 'Cross-verifying claims with trust-weighted scoring…');

    const factCheck = await runFactCheckerAgent(plan.topic, analysis);

    callbacks.onStepDetail(
      'factchecker',
      `${factCheck.verifiedFacts.length} verified · ${factCheck.flaggedClaims.length} flagged · Reliability: ${factCheck.reliabilityScore}/10 · Source diversity: ${factCheck.sourceDiversity}/10`,
    );
    setStepDone('factchecker');
    await updateStatus('generating');

    // ── STEP 5 — STREAMING REPORT GENERATION ──────────────────────────────

    if (aborted()) return;
    setStepRunning('reporter');
    callbacks.onStepDetail('reporter', 'Starting live report generation…');

    const streamedSections: ReportSection[] = [];
    let reportOutput!: StreamingReportOutput;

    await new Promise<void>((resolve, reject) => {
      runStreamingReportAgent(
        input,
        plan,
        analysis,
        factCheck,
        searchBatches,
        {
          onSectionStart: (index, title) => {
            callbacks.onStepDetail('reporter', `Writing section ${index + 1}/6: "${title}"…`);
            callbacks.onSectionStart?.(index, title);
          },
          onSectionToken: (index, token) => {
            callbacks.onSectionToken?.(index, token);
          },
          onSectionComplete: (index, section) => {
            streamedSections[index] = section;
            callbacks.onSectionComplete?.(index, section);
            callbacks.onStepDetail(
              'reporter',
              `✓ Section ${index + 1}/6 · ${(streamedSections.filter(Boolean).length * 100 / 6) | 0}% done`,
            );
          },
          onSummaryReady: (summary) => {
            callbacks.onSummaryReady?.(summary);
          },
          onComplete: (output) => {
            reportOutput = output;
            resolve();
          },
          onError: (err) => {
            reject(err);
          },
          signal,
        },
      ).catch(reject);
    });

    callbacks.onStepDetail(
      'reporter',
      `${reportOutput.sections.length} sections · ${reportOutput.citations.length} citations · ${totalUnique} sources`,
    );
    if (aborted()) return;
    setStepDone('reporter');
    await updateStatus('visualizing');

    // ── STEP 6 — VISUALIZER ────────────────────────────────────────────────

    if (aborted()) return;
    setStepRunning('visualizer');
    callbacks.onStepDetail('visualizer', 'Extracting source images…');

    const sourceImages = extractSourceImages(searchBatches, 12);

    callbacks.onStepDetail(
      'visualizer',
      `${sourceImages.length} source images · Generating infographics…`,
    );

    const partialReport: ResearchReport = {
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
      sourcesCount: totalUnique,
      reliabilityScore: factCheck.reliabilityScore,
      status: 'visualizing',
      agentLogs: steps,
      sourceImages,
      researchMode: mode,
      createdAt: reportRow.created_at,
    };

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
        igResult ? `${igResult.charts.length} charts · ${igResult.stats.length} stat cards` : '(infographics skipped)',
      ].join(' · '),
    );
    setStepDone('visualizer');

    // ── STEP 7 — ACADEMIC PAPER (academic mode only) ──────────────────────

    let academicPaper: AcademicPaper | null = null;

    if (mode === 'academic' && !aborted()) {
      await updateStatus('writing_paper');
      setStepRunning('academic');
      callbacks.onStepDetail('academic', 'Structuring academic paper sections…');

      try {
        const reportForAcademic: ResearchReport = {
          ...partialReport,
          knowledgeGraph: kgResult,
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
          input, plan, analysis, factCheck, searchBatches,
          reportForAcademic, 'apa', signal,
        );

        callbacks.onStepDetail(
          'academic',
          `${paperOutput.sections.length} sections · ~${wordCount.toLocaleString()} words · ~${pageEstimate} pages`,
        );

        const sectionsWithIds = paperOutput.sections as AcademicSection[];

        const { data: paperRow, error: paperInsertError } = await supabase
          .from('academic_papers')
          .insert({
            report_id: reportId,
            user_id: userId,
            title: paperOutput.title,
            running_head: paperOutput.runningHead,
            abstract: paperOutput.abstract,
            keywords: paperOutput.keywords,
            sections: sectionsWithIds,
            citations: paperCitations,
            citation_style: 'apa',
            word_count: wordCount,
            page_estimate: pageEstimate,
            generated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (paperInsertError || !paperRow) {
          console.warn('[Orchestrator] Academic paper save failed:', paperInsertError?.message);
          callbacks.onStepDetail('academic', '⚠ Paper generated but could not be saved');
        } else {
          academicPaper = {
            id: paperRow.id,
            reportId,
            userId,
            title: paperOutput.title,
            runningHead: paperOutput.runningHead,
            abstract: paperOutput.abstract,
            keywords: paperOutput.keywords,
            sections: sectionsWithIds,
            citations: paperCitations,
            citationStyle: 'apa',
            wordCount,
            pageEstimate,
            generatedAt: paperRow.generated_at,
            exportCount: 0,
          };
          callbacks.onStepDetail(
            'academic',
            `✓ Academic paper saved · ${wordCount.toLocaleString()} words · ${pageEstimate} pages`,
          );
        }
        setStepDone('academic');
      } catch (academicError) {
        const academicMsg = academicError instanceof Error ? academicError.message : 'Unknown error';
        console.error('[Orchestrator] Academic Paper Agent error:', academicError);
        setStepFailed('academic', academicMsg);
        callbacks.onStepDetail('academic', `⚠ Academic paper failed: ${academicMsg.slice(0, 80)}`);
      }
    }

    if (aborted()) return;

    // ── SAVE COMPLETE REPORT ──────────────────────────────────────────────

    const citationTrustPayload = reportOutput.citations.map(c => ({
      citation_id: c.id,
      trust_score: c.trustScore ?? null,
    }));

    const savePayload: Record<string, unknown> = {
      title: reportOutput.title,
      executive_summary: reportOutput.executiveSummary,
      sections: reportOutput.sections,
      key_findings: reportOutput.keyFindings,
      future_predictions: reportOutput.futurePredictions,
      citations: reportOutput.citations,
      statistics: reportOutput.statistics,
      reliability_score: factCheck.reliabilityScore,
      sources_count: totalUnique,
      agent_logs: steps,
      knowledge_graph: kgResult ?? null,
      infographic_data: igResult ?? null,
      source_images: sourceImages,
      research_mode: mode,
      source_trust_scores: citationTrustPayload,
      avg_source_quality: trustSummary?.avgScore ?? factCheck.reliabilityScore,
      high_quality_source_pct: trustSummary?.highQualityPercent ?? 0,
      status: 'completed',
      completed_at: new Date().toISOString(),
    };

    if (academicPaper) {
      savePayload.academic_paper_id = academicPaper.id;
    }

    const { error: saveError } = await supabase
      .from('research_reports')
      .update(savePayload)
      .eq('id', reportId);

    if (saveError) throw new Error(`Failed to save report: ${saveError.message}`);

    // ── Final report object ────────────────────────────────────────────────

    const finalReport: ResearchReport = {
      ...partialReport,
      sourcesCount: totalUnique,
      status: 'completed',
      agentLogs: steps,
      knowledgeGraph: kgResult,
      infographicData: igResult,
      sourceImages,
      researchMode: mode,
      academicPaperId: academicPaper?.id,
      completedAt: new Date().toISOString(),
    };

    recordResearchCompletion(userId, finalReport).catch(err => {
      console.warn('[Orchestrator] Personalization update error:', err);
    });

    callbacks.onComplete(finalReport);

  } catch (error) {
    if ((error as { name?: string })?.name === 'AbortError' || aborted()) {
      await updateStatus('cancelled').catch(() => {});
      return;
    }
    const message = error instanceof Error ? error.message : 'Unknown research error';
    console.error('[Orchestrator] Pipeline error:', error);
    const runningStep = steps.find(s => s.status === 'running');
    if (runningStep) setStepFailed(runningStep.agent, message);
    await updateStatus('failed', { error_message: message, agent_logs: steps });
    callbacks.onError(message);
  }
}