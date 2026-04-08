// src/hooks/useDebateReportImport.ts
// Part 20 — Manages an imported research report in the Debate tab.
// Part 40 Fix — Added suggestedTopic: the report's query is exposed so
//   the Debate screen can auto-fill the topic input when a report is imported.
//
// Changes from Part 20:
//   • `suggestedTopic` field added to return value — set to report.query
//     (trimmed, question-mark-normalised) when a report is selected, null otherwise.
//   • clearReport() also clears suggestedTopic.
//   • Everything else is identical.

import { useState, useCallback } from 'react';
import type { ResearchReport, DebateReportContext } from '../types';

// ─── Helper: normalise a query/title into a debate-ready topic string ─────────

function normaliseAsTopic(text: string): string {
  const trimmed = text.trim();
  // If it already looks like a question, keep it; otherwise, leave as-is
  // (the orchestrator's refineTopicToQuestion will shape it into a proper question)
  return trimmed;
}

// ─── Helper: build context ────────────────────────────────────────────────────

function buildReportContext(report: ResearchReport): DebateReportContext {
  const keyThemes = report.sections
    .slice(0, 6)
    .map(s => s.title)
    .filter(Boolean);

  const citations = (report.citations ?? [])
    .slice(0, 10)
    .map(c => ({
      title:   c.title,
      url:     c.url,
      snippet: (c.snippet ?? '').slice(0, 200),
    }));

  const statistics = (report.statistics ?? [])
    .slice(0, 10)
    .map(s => ({
      value:   s.value,
      context: s.context,
      source:  s.source,
    }));

  return {
    reportId:         report.id,
    reportTitle:      report.title,
    reportQuery:      report.query,
    executiveSummary: (report.executiveSummary ?? '').slice(0, 800),
    keyFindings:      (report.keyFindings ?? []).slice(0, 8),
    statistics,
    keyThemes,
    citations,
    sourcesCount:     report.sourcesCount,
    reliabilityScore: report.reliabilityScore,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseDebateReportImportReturn {
  /** The currently imported report (full object, for display). */
  importedReport: ResearchReport | null;
  /** The lean context object ready to be passed to the orchestrator. */
  reportContext:  DebateReportContext | null;
  /**
   * FIX (Part 40): The report's original query, ready to use as a debate topic.
   * The Debate screen sets the topic input to this value when a report is imported,
   * so the user always has a sensible starting point and the debate is properly
   * grounded in the report's subject matter.
   * null when no report is imported.
   */
  suggestedTopic: string | null;
  /** Call with the report selected from ReportImportSheet. */
  handleReportSelected: (report: ResearchReport) => void;
  /** Clear the imported report. */
  clearReport:    () => void;
  /** Whether a report is currently attached. */
  hasReport:      boolean;
}

export function useDebateReportImport(): UseDebateReportImportReturn {
  const [importedReport, setImportedReport] = useState<ResearchReport | null>(null);
  const [reportContext,  setReportContext]  = useState<DebateReportContext | null>(null);
  const [suggestedTopic, setSuggestedTopic] = useState<string | null>(null);

  const handleReportSelected = useCallback((report: ResearchReport) => {
    setImportedReport(report);
    setReportContext(buildReportContext(report));
    // FIX: expose the report's query so the debate screen can auto-fill the topic
    setSuggestedTopic(normaliseAsTopic(report.query || report.title));
  }, []);

  const clearReport = useCallback(() => {
    setImportedReport(null);
    setReportContext(null);
    setSuggestedTopic(null);
  }, []);

  return {
    importedReport,
    reportContext,
    suggestedTopic,
    handleReportSelected,
    clearReport,
    hasReport: importedReport !== null,
  };
}