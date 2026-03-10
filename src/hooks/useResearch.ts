// src/hooks/useResearch.ts
// Manages all research state: input, agent steps, progress, and the final report.
// Components call this hook and never interact with agents directly.

import { useState, useCallback, useRef } from 'react';
import {
  ResearchInput,
  ResearchReport,
  AgentStep,
  AgentName,
} from '../types';
import { runResearchPipeline } from '../services/researchOrchestrator';
import { useAuth } from '../context/AuthContext';

export type ResearchPhase =
  | 'idle'
  | 'running'
  | 'completed'
  | 'error';

export function useResearch() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<ResearchPhase>('idle');
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [stepDetails, setStepDetails] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

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

      await runResearchPipeline(user.id, input, {
        onStepUpdate: (updatedSteps) => {
          if (!abortRef.current) setSteps(updatedSteps);
        },
        onStepDetail: (agent: AgentName, detail: string) => {
          if (!abortRef.current) {
            setStepDetails((prev) => ({ ...prev, [agent]: detail }));
          }
        },
        onComplete: (completedReport: ResearchReport) => {
          if (!abortRef.current) {
            setReport(completedReport);
            setPhase('completed');
          }
        },
        onError: (message: string) => {
          if (!abortRef.current) {
            setError(message);
            setPhase('error');
          }
        },
      });
    },
    [user]
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setPhase('idle');
    setSteps([]);
    setStepDetails({});
    setReport(null);
    setError(null);
  }, []);

  const currentAgent = steps.find((s) => s.status === 'running')?.agent ?? null;
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const totalSteps = steps.length || 5;
  const progressPercent = Math.round((completedCount / totalSteps) * 100);

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
  };
}