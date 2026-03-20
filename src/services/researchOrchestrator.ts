// src/services/researchOrchestrator.ts
// Part 25 — Updated
//
// CHANGES FROM PART 24:
//   1. Step 2 (Web Search) now calls serpSearchDeep() instead of serpSearchBatch()
//      for deep/expert modes — runs multi-round research with follow-up & news queries
//   2. sourcesCount now reflects true unique URL count from deduplication
//   3. Trust summary persisted to research_reports via save_report_trust_scores RPC
//   4. Orchestrator logs show round progress during search step
//   5. All other steps (planner, analysis, factcheck, reporter, visualizer, academic) unchanged
//
// PRESERVED: All Part 21 streaming callbacks, Part 24 credit system,
//            academic paper agent, knowledge graph, infographics — nothing removed.

import { supabase }                 from '../lib/supabase';
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
}                                    from '../types';
import { runPlannerAgent }           from './agents/plannerAgent';
import { runAnalysisAgent }          from './agents/analysisAgent';
import { runFactCheckerAgent }       from './agents/factCheckAgent';
import { runKnowledgeGraphAgent }    from './agents/knowledgeGraphAgent';
import { runInfographicAgent }       from './agents/infographicAgent';
import { runAcademicPaperAgent }     from './agents/academicPaperAgent';
import { runStreamingReportAgent, StreamingReportOutput } from './agents/streamingReportAgent';
import { serpSearchDeep, serpSearchBatch, DeepSearchCallbacks } from './serpApiClient';
import { extractSourceImages }       from './imageExtractor';
import { notifyReportComplete }      from '../lib/notifications';
import { recordResearchCompletion }  from './homePersonalizationService';
import { computeBatchTrustSummary }  from './sourceTrustScorer';

// ─── Agent step templates ──────────────────────────────────────────────────────

const BASE_STEPS: AgentStep[] = [
  {
    agent:       'planner',
    label:       'Research Planner',
    description: 'Analyzing query and creating research strategy',
    status:      'pending',
  },
  {
    agent:       'searcher',
    label:       'Web Search Agent',
    description: 'Multi-round web research with source trust scoring',
    status:      'pending',
  },
  {
    agent:       'analyst',
    label:       'Analysis Agent',
    description: 'Extracting insights from search data',
    status:      'pending',
  },
  {
    agent:       'factchecker',
    label:       'Fact Checker Agent',
    description: 'Verifying claims and scoring source reliability',
    status:      'pending',
  },
  {
    agent:       'reporter',
    label:       'Report Generator',
    description: 'Writing comprehensive research report — sections stream live',
    status:      'pending',
  },
  {
    agent:       'visualizer',
    label:       'Visual Intelligence',
    description: 'Generating knowledge graph & infographics',
    status:      'pending',
  },
];

const ACADEMIC_STEP: AgentStep = {
  agent:       'academic',
  label:       'Academic Paper Agent',
  description: 'Writing structured academic research paper',
  status:      'pending',
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
  userId:    string,
  input:     ResearchInput,
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

  // ── Pre-flight checks ─────────────────────────────────────────────────────

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
    // ── STEP 1 — PLANNER ───────────────────────────────────────────────────

    setStepRunning('planner');
    callbacks.onStepDetail('planner', 'Decomposing query into research strategy…');

    const plan = await runPlannerAgent(input);

    const config = DEPTH_SEARCH_CONFIG[input.depth];
    const totalExpectedQueries =
      config.maxQueries +
      config.followUpQueries +
      config.newsQueries +
      (input.depth === 'expert' ? 4 : 0);  // entity deep-dives

    callbacks.onStepDetail(
      'planner',
      `${plan.searchQueries.length} primary + up to ${config.followUpQueries} follow-up + ${config.newsQueries} news = ~${totalExpectedQueries} total queries planned`,
    );
    setStepDone('planner');
    await updateStatus('searching', { search_queries: plan.searchQueries });

    // ── STEP 2 — WEB SEARCH (Multi-round) ──────────────────────────────────

    setStepRunning('searcher');

    // Deep/Expert: use multi-round serpSearchDeep
    // Quick: use standard serpSearchBatch (faster, fewer queries)
    let searchBatches: import('../types').SearchBatch[];
    let totalUnique = 0;
    let trustSummary: ReturnType<typeof computeBatchTrustSummary> | null = null;

    if (input.depth === 'quick') {
      // Quick mode — single round, original logic
      callbacks.onStepDetail('searcher', `[Quick] Running ${plan.searchQueries.length} searches…`);

      searchBatches = await serpSearchBatch(
        plan.searchQueries,
        (query, index) => {
          callbacks.onStepDetail('searcher', `[${index + 1}/${plan.searchQueries.length}] "${query}"`);
        },
        config.resultsPerQuery,
      );

      totalUnique  = new Set(searchBatches.flatMap(b => b.results.map(r => r.url))).size;
      trustSummary = computeBatchTrustSummary(searchBatches.flatMap(b => b.results));

    } else {
      // Deep / Expert — multi-round
      const deepCallbacks: Partial<DeepSearchCallbacks> = {
        onRoundStart: (round, totalRounds, label) => {
          callbacks.onStepDetail(
            'searcher',
            `Round ${round}/${totalRounds}: ${label}`,
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

      const deepResult = await serpSearchDeep(
        plan.searchQueries,
        input.depth,
        deepCallbacks,
      );

      searchBatches = deepResult.batches;
      totalUnique   = deepResult.totalUnique;
      trustSummary  = {
        avgScore:           deepResult.trustSummary.avgScore,
        tierBreakdown:      {
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
        },
      ).catch(reject);
    });

    callbacks.onStepDetail(
      'reporter',
      `${reportOutput.sections.length} sections · ${reportOutput.citations.length} citations · ${totalUnique} sources`,
    );
    setStepDone('reporter');
    await updateStatus('visualizing');

    // ── STEP 6 — VISUALIZER ────────────────────────────────────────────────

    setStepRunning('visualizer');
    callbacks.onStepDetail('visualizer', 'Extracting source images…');

    const sourceImages = extractSourceImages(searchBatches, 12);

    callbacks.onStepDetail(
      'visualizer',
      `${sourceImages.length} source images · Generating infographics…`,
    );

    const partialReport: ResearchReport = {
      id:                reportId,
      userId,
      query:             input.query,
      depth:             input.depth,
      focusAreas:        input.focusAreas,
      title:             reportOutput.title,
      executiveSummary:  reportOutput.executiveSummary,
      sections:          reportOutput.sections,
      keyFindings:       reportOutput.keyFindings,
      futurePredictions: reportOutput.futurePredictions,
      citations:         reportOutput.citations,
      statistics:        reportOutput.statistics,
      searchQueries:     plan.searchQueries,
      sourcesCount:      totalUnique,  // ← now reflects real unique count
      reliabilityScore:  factCheck.reliabilityScore,
      status:            'visualizing',
      agentLogs:         steps,
      sourceImages,
      researchMode:      mode,
      createdAt:         reportRow.created_at,
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
        igResult ? `${igResult.charts.length} charts · ${igResult.stats.length} stat cards` : '(infographics skipped)',
      ].join(' · '),
    );
    setStepDone('visualizer');

    // ── STEP 7 — ACADEMIC PAPER (academic mode only) ──────────────────────

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
          input, plan, analysis, factCheck, searchBatches,
          reportForAcademic, 'apa',
        );

        callbacks.onStepDetail(
          'academic',
          `${paperOutput.sections.length} sections · ~${wordCount.toLocaleString()} words · ~${pageEstimate} pages`,
        );

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
            sections:       sectionsWithIds,
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
            reportId,
            userId,
            title:         paperOutput.title,
            runningHead:   paperOutput.runningHead,
            abstract:      paperOutput.abstract,
            keywords:      paperOutput.keywords,
            sections:      sectionsWithIds,
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
        const academicMsg = academicError instanceof Error ? academicError.message : 'Unknown error';
        console.error('[Orchestrator] Academic Paper Agent error:', academicError);
        setStepFailed('academic', academicMsg);
        callbacks.onStepDetail('academic', `⚠ Academic paper failed: ${academicMsg.slice(0, 80)}`);
      }
    }

    // ── SAVE COMPLETE REPORT ──────────────────────────────────────────────

    // Build trust score payload for citations
    const citationTrustPayload = reportOutput.citations.map(c => ({
      citation_id: c.id,
      trust_score: c.trustScore ?? null,
    }));

    const savePayload: Record<string, unknown> = {
      title:                   reportOutput.title,
      executive_summary:       reportOutput.executiveSummary,
      sections:                reportOutput.sections,
      key_findings:            reportOutput.keyFindings,
      future_predictions:      reportOutput.futurePredictions,
      citations:               reportOutput.citations,
      statistics:              reportOutput.statistics,
      reliability_score:       factCheck.reliabilityScore,
      sources_count:           totalUnique,
      agent_logs:              steps,
      knowledge_graph:         kgResult  ?? null,
      infographic_data:        igResult  ?? null,
      source_images:           sourceImages,
      research_mode:           mode,
      source_trust_scores:     citationTrustPayload,
      avg_source_quality:      trustSummary?.avgScore ?? factCheck.reliabilityScore,
      high_quality_source_pct: trustSummary?.highQualityPercent ?? 0,
      status:                  'completed',
      completed_at:            new Date().toISOString(),
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
      sourcesCount:    totalUnique,
      status:          'completed',
      agentLogs:       steps,
      knowledgeGraph:  kgResult,
      infographicData: igResult,
      sourceImages,
      researchMode:    mode,
      academicPaperId: academicPaper?.id,
      completedAt:     new Date().toISOString(),
    };

    // Part 21: Update home-screen personalization (non-fatal, background)
    recordResearchCompletion(userId, finalReport).catch(err => {
      console.warn('[Orchestrator] Personalization update error:', err);
    });

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