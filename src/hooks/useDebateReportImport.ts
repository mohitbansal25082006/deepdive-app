// src/hooks/useDebateReportImport.ts
// Part 20 — Manages an imported research report in the Debate tab.
//
// Converts a full ResearchReport into a lean DebateReportContext that
// is injected into each debate agent's prompt to ground responses in
// verified facts and statistics.

import { useState, useCallback } from 'react';
import type { ResearchReport, DebateReportContext } from '../types';

// ─── Helper: build context ─────────────────────────────────────────────────────

/**
 * Distil a full ResearchReport into the lean DebateReportContext that
 * gets injected into debate-agent prompts.
 *
 * We cap collections to avoid blowing out the context window:
 *   keyFindings  → first 8
 *   statistics   → first 10
 *   keyThemes    → inferred from section titles (first 6)
 *   citations    → first 10 (title + url + snippet)
 */
function buildReportContext(report: ResearchReport): DebateReportContext {
  // Pull key themes from section titles if keyThemes isn't on the report
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

  const handleReportSelected = useCallback((report: ResearchReport) => {
    setImportedReport(report);
    setReportContext(buildReportContext(report));
  }, []);

  const clearReport = useCallback(() => {
    setImportedReport(null);
    setReportContext(null);
  }, []);

  return {
    importedReport,
    reportContext,
    handleReportSelected,
    clearReport,
    hasReport: importedReport !== null,
  };
}