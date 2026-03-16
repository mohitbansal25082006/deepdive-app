// src/hooks/useResearch.ts
// Part 21 — Original (streaming report generation, streaming sections/tokens)
// Part 22 — Added: autoCacheReport() called inside onComplete
//
// CHANGE LOG (Part 22 only):
//   Line added: import { autoCacheReport } from '../lib/autoCacheMiddleware';
//   Line added inside onComplete callback: autoCacheReport(completedReport);
//   Everything else is byte-for-byte identical to Part 21.

import { useState, useCallback, useRef } from 'react';
import {
  ResearchInput,
  ResearchReport,
  AgentStep,
  AgentName,
  ReportSection,
} from '../types';
import { runResearchPipeline } from '../services/researchOrchestrator';
import { useAuth }             from '../context/AuthContext';
// ── Part 22: Auto-cache import ───────────────────────────────────────────────
import { autoCacheReport }     from '../lib/autoCacheMiddleware';

export type ResearchPhase =
  | 'idle'
  | 'running'
  | 'completed'
  | 'error';

/** Which sub-phase of the running state we are in */
export type StreamingPhase =
  | 'agents'           // steps 1-4 (planner, search, analyst, factcheck)
  | 'streaming_report' // step 5 — sections arriving one-by-one
  | 'streaming_visuals'// step 6 — knowledge graph + infographics
  | 'done';

export interface PartialSection {
  index:      number;
  title:      string;
  content:    string;   // accumulates as tokens arrive
  isComplete: boolean;
  section?:   ReportSection; // set when complete
}

export function useResearch() {
  const { user } = useAuth();

  // ── Core state ────────────────────────────────────────────────────────────
  const [phase, setPhase]   = useState<ResearchPhase>('idle');
  const [steps, setSteps]   = useState<AgentStep[]>([]);
  const [stepDetails, setStepDetails] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError]   = useState<string | null>(null);

  // ── Streaming state ───────────────────────────────────────────────────────
  const [streamingPhase, setStreamingPhase]       = useState<StreamingPhase>('agents');
  const [streamingSections, setStreamingSections] = useState<PartialSection[]>([]);
  const [streamingSectionIndex, setStreamingSectionIndex] = useState<number>(-1);
  const [streamingSectionTitle, setStreamingSectionTitle] = useState<string>('');
  const [executiveSummary, setExecutiveSummary]   = useState<string>('');

  const abortRef = useRef(false);

  // ── Start research ────────────────────────────────────────────────────────

  const startResearch = useCallback(
    async (input: ResearchInput) => {
      if (!user) {
        setError('You must be signed in to run research.');
        return;
      }

      abortRef.current = false;
      setPhase('running');
      setSteps([]);
      setStepDetails({});
      setReport(null);
      setError(null);
      setStreamingPhase('agents');
      setStreamingSections([]);
      setStreamingSectionIndex(-1);
      setStreamingSectionTitle('');
      setExecutiveSummary('');

      await runResearchPipeline(user.id, input, {
        onStepUpdate: (updatedSteps) => {
          if (abortRef.current) return;
          setSteps(updatedSteps);

          // Switch streaming phase based on current running step
          const runningStep = updatedSteps.find(s => s.status === 'running');
          if (runningStep?.agent === 'reporter') {
            setStreamingPhase('streaming_report');
          } else if (runningStep?.agent === 'visualizer') {
            setStreamingPhase('streaming_visuals');
          } else if (runningStep) {
            setStreamingPhase('agents');
          }
        },

        onStepDetail: (agent: AgentName, detail: string) => {
          if (abortRef.current) return;
          setStepDetails(prev => ({ ...prev, [agent]: detail }));
        },

        // ── Streaming section callbacks ──────────────────────────────────

        onSectionStart: (index: number, title: string) => {
          if (abortRef.current) return;
          setStreamingSectionIndex(index);
          setStreamingSectionTitle(title);
          setStreamingSections(prev => {
            const next = [...prev];
            next[index] = { index, title, content: '', isComplete: false };
            return next;
          });
        },

        onSectionToken: (index: number, token: string) => {
          if (abortRef.current) return;
          setStreamingSections(prev => {
            const next = [...prev];
            if (next[index]) {
              next[index] = { ...next[index], content: next[index].content + token };
            }
            return next;
          });
        },

        onSectionComplete: (index: number, section: ReportSection) => {
          if (abortRef.current) return;
          setStreamingSections(prev => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              content:    section.content,
              isComplete: true,
              section,
            };
            return next;
          });
        },

        onSummaryReady: (summary: string) => {
          if (abortRef.current) return;
          setExecutiveSummary(summary);
        },

        // ── Completion ────────────────────────────────────────────────────

        onComplete: (completedReport: ResearchReport) => {
          if (abortRef.current) return;
          setReport(completedReport);
          setStreamingPhase('done');
          setPhase('completed');

          // ── Part 22: Auto-cache the completed report ───────────────────
          // Fire-and-forget — never throws, never blocks the UI update above
          autoCacheReport(completedReport);
        },

        onError: (message: string) => {
          if (abortRef.current) return;
          setError(message);
          setPhase('error');
        },
      });
    },
    [user],
  );

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    abortRef.current = true;
    setPhase('idle');
    setSteps([]);
    setStepDetails({});
    setReport(null);
    setError(null);
    setStreamingPhase('agents');
    setStreamingSections([]);
    setStreamingSectionIndex(-1);
    setStreamingSectionTitle('');
    setExecutiveSummary('');
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const currentAgent   = steps.find(s => s.status === 'running')?.agent ?? null;
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalSteps     = steps.length || 6;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  // Streaming report progress: 0-100 within the reporter step
  const sectionsCompleted = streamingSections.filter(s => s.isComplete).length;
  const reportStreamPercent = Math.round((sectionsCompleted / 6) * 100);

  return {
    // Core
    phase,
    steps,
    stepDetails,
    report,
    error,
    currentAgent,
    progressPercent,
    startResearch,
    reset,
    // Streaming
    streamingPhase,
    streamingSections,
    streamingSectionIndex,
    streamingSectionTitle,
    executiveSummary,
    sectionsCompleted,
    reportStreamPercent,
  };
}