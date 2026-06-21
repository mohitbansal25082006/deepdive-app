// src/hooks/useResearch.ts
// Part 21 — Original (streaming report generation)
// Part 22 — Added autoCacheReport() in onComplete
// Part 53F — Notifications now fire from the HOOK's onComplete (after the abort
//   check), NOT from the orchestrator. This fixes the cancel bug: when the user
//   cancels (reset() sets abortRef=true), onComplete returns early and NO
//   notification is sent. Fires BOTH the report and (academic mode) paper.

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
import { autoCacheReport }     from '../lib/autoCacheMiddleware';
// ── Part 53F: fire content notifications from the hook (respects cancel) ──
import { notifyContentReady }  from '../services/appNotificationService';

export type ResearchPhase = 'idle' | 'running' | 'completed' | 'error';

export type StreamingPhase =
  | 'agents'
  | 'streaming_report'
  | 'streaming_visuals'
  | 'done';

export interface PartialSection {
  index:      number;
  title:      string;
  content:    string;
  isComplete: boolean;
  section?:   ReportSection;
}

export function useResearch() {
  const { user } = useAuth();

  const [phase, setPhase]   = useState<ResearchPhase>('idle');
  const [steps, setSteps]   = useState<AgentStep[]>([]);
  const [stepDetails, setStepDetails] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError]   = useState<string | null>(null);

  const [streamingPhase, setStreamingPhase]       = useState<StreamingPhase>('agents');
  const [streamingSections, setStreamingSections] = useState<PartialSection[]>([]);
  const [streamingSectionIndex, setStreamingSectionIndex] = useState<number>(-1);
  const [streamingSectionTitle, setStreamingSectionTitle] = useState<string>('');
  const [executiveSummary, setExecutiveSummary]   = useState<string>('');

  const abortRef = useRef(false);
  // Part 53G: real cancellation — aborts in-flight OpenAI fetches.
  const controllerRef = useRef<AbortController | null>(null);

  const startResearch = useCallback(
    async (input: ResearchInput) => {
      if (!user) {
        setError('You must be signed in to run research.');
        return;
      }

      abortRef.current = false;
      controllerRef.current = new AbortController();   // Part 53G
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

        onComplete: (completedReport: ResearchReport) => {
          // ── Part 53F: CANCEL GUARD ──
          // If the user cancelled, do NOT update UI and do NOT notify.
          if (abortRef.current) return;

          setReport(completedReport);
          setStreamingPhase('done');
          setPhase('completed');

          autoCacheReport(completedReport);

          // ── Part 53F: fire notifications HERE (after the abort check) ──
          notifyContentReady({
            kind:      'report',
            contentId: completedReport.id,
            reportId:  completedReport.id,
            title:     completedReport.title,
          }).catch(() => {});

          // Academic mode also produced a paper inside the orchestrator.
          if (completedReport.academicPaperId) {
            notifyContentReady({
              kind:      'paper',
              contentId: completedReport.academicPaperId,
              reportId:  completedReport.id,
              title:     completedReport.title,
            }).catch(() => {});
          }
        },

        onError: (message: string) => {
          if (abortRef.current) return;
          setError(message);
          setPhase('error');
        },
      },
      controllerRef.current.signal,   // ── Part 53G: cancel signal ──
      );
    },
    [user],
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    // Part 53G: abort any in-flight OpenAI requests so generation truly stops.
    try { controllerRef.current?.abort(); } catch {}
    controllerRef.current = null;
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

  const currentAgent   = steps.find(s => s.status === 'running')?.agent ?? null;
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalSteps     = steps.length || 6;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

  const sectionsCompleted = streamingSections.filter(s => s.isComplete).length;
  const reportStreamPercent = Math.round((sectionsCompleted / 6) * 100);

  return {
    phase,
    steps,
    stepDetails,
    report,
    error,
    currentAgent,
    progressPercent,
    startResearch,
    reset,
    streamingPhase,
    streamingSections,
    streamingSectionIndex,
    streamingSectionTitle,
    executiveSummary,
    sectionsCompleted,
    reportStreamPercent,
  };
}