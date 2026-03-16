// src/hooks/useAcademicPaper.ts
// Part 7 — Original (full academic paper generation, sections fix, load/generate/export)
// Part 22 — Added: autoCacheAcademicPaper() called after generate() saves to DB
//            and also after loadPaper() / loadByReportId() succeeds.
//
// CHANGE LOG (Part 22 only):
//   Line added: import { autoCacheAcademicPaper } from '../lib/autoCacheMiddleware';
//   Line added inside generate()     after setPaper(newPaper):  autoCacheAcademicPaper(newPaper);
//   Line added inside loadPaper()    after setPaper(loaded):    autoCacheAcademicPaper(loaded);
//   Line added inside loadByReportId after setPaper(loaded):    autoCacheAcademicPaper(loaded);
//   Everything else is byte-for-byte identical to Part 7.

import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert, Share } from 'react-native';
import { supabase }     from '../lib/supabase';
import { useAuth }      from '../context/AuthContext';
import {
  ResearchReport,
  AcademicPaper,
  AcademicPaperState,
  AcademicCitationStyle,
  AcademicSection,
} from '../types';
import { exportAcademicPaperAsPDF } from '../services/academicPdfExport';
// ── Part 22: Auto-cache import ───────────────────────────────────────────────
import { autoCacheAcademicPaper }   from '../lib/autoCacheMiddleware';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMarkdown(paper: AcademicPaper): string {
  const lines: string[] = [];

  lines.push(`# ${paper.title}`);
  lines.push('');
  if (paper.runningHead) {
    lines.push(`**Running Head:** ${paper.runningHead}`);
    lines.push('');
  }
  lines.push(`**Keywords:** ${paper.keywords.join(', ')}`);
  lines.push(`**Word Count:** ~${paper.wordCount.toLocaleString()} words · ~${paper.pageEstimate} pages`);
  lines.push(`**Citation Style:** ${paper.citationStyle.toUpperCase()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Abstract
  lines.push('## Abstract');
  lines.push('');
  lines.push(paper.abstract);
  lines.push('');

  // Sections (skip abstract — already rendered; render references last)
  for (const section of paper.sections) {
    if (section.type === 'abstract')    continue;
    if (section.type === 'references')  continue;

    lines.push(`## ${section.title}`);
    lines.push('');
    if (section.content?.trim()) {
      lines.push(section.content);
      lines.push('');
    }
    for (const sub of section.subsections ?? []) {
      lines.push(`### ${sub.title}`);
      lines.push('');
      lines.push(sub.content);
      lines.push('');
    }
  }

  const refSection = paper.sections.find(s => s.type === 'references');
  if (refSection) {
    lines.push(`## ${refSection.title}`);
    lines.push('');
    lines.push(refSection.content);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Map a raw Supabase row to an AcademicPaper object.
 */
function mapRow(data: Record<string, any>): AcademicPaper {
  return {
    id:            data.id,
    reportId:      data.report_id,
    userId:        data.user_id,
    title:         data.title          ?? '',
    runningHead:   data.running_head   ?? '',
    abstract:      data.abstract       ?? '',
    keywords:      data.keywords       ?? [],
    // sections from DB are already fully hydrated with ids
    sections:      (data.sections      ?? []) as AcademicSection[],
    citations:     data.citations      ?? [],
    citationStyle: data.citation_style ?? 'apa',
    wordCount:     data.word_count     ?? 0,
    pageEstimate:  data.page_estimate  ?? 0,
    institution:   data.institution    ?? undefined,
    generatedAt:   data.generated_at,
    exportCount:   data.export_count   ?? 0,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAcademicPaper(report: ResearchReport | null) {
  const { user }   = useAuth();
  const isMounted  = useRef(true);

  const [paper,          setPaper]          = useState<AcademicPaper | null>(null);
  const [isLoading,      setIsLoading]      = useState(false);
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [isExporting,    setIsExporting]    = useState(false);
  const [progress,       setProgress]       = useState('');
  const [error,          setError]          = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [citationStyle,  setCitationStyle]  = useState<AcademicCitationStyle>('apa');

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── Auto-load if report already has an academic_paper_id ────────────────
  useEffect(() => {
    if (report?.academicPaperId) {
      loadPaper(report.academicPaperId);
    } else {
      setPaper(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.academicPaperId]);

  // ── Load by paper id ────────────────────────────────────────────────────
  const loadPaper = useCallback(async (paperId: string) => {
    if (!isMounted.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('academic_papers')
        .select('*')
        .eq('id', paperId)
        .single();

      if (fetchError || !data) {
        if (isMounted.current) setError('Could not load academic paper.');
        return;
      }

      const loaded = mapRow(data);
      if (isMounted.current) {
        setPaper(loaded);
        setCitationStyle(loaded.citationStyle);
        const first = loaded.sections.find(s => s.type !== 'abstract');
        if (first) setActiveSectionId(first.id);

        // ── Part 22: Auto-cache the loaded paper ───────────────────────
        autoCacheAcademicPaper(loaded);
      }
    } catch (err) {
      if (isMounted.current) setError('Unexpected error loading paper.');
      console.error('[useAcademicPaper] loadPaper error:', err);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  // ── Load by report_id ────────────────────────────────────────────────────
  const loadByReportId = useCallback(async (reportId: string) => {
    if (!isMounted.current) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('academic_papers')
        .select('*')
        .eq('report_id', reportId)
        .single();

      if (fetchError) {
        // PGRST116 = no rows — paper just hasn't been generated yet
        if (fetchError.code !== 'PGRST116') {
          console.warn('[useAcademicPaper] loadByReportId:', fetchError.message);
        }
        if (isMounted.current) setPaper(null);
        return;
      }

      if (!data) {
        if (isMounted.current) setPaper(null);
        return;
      }

      const loaded = mapRow(data);
      if (isMounted.current) {
        setPaper(loaded);
        setCitationStyle(loaded.citationStyle);
        const first = loaded.sections.find(s => s.type !== 'abstract');
        if (first) setActiveSectionId(first.id);

        // ── Part 22: Auto-cache the loaded paper ───────────────────────
        autoCacheAcademicPaper(loaded);
      }
    } catch (err) {
      console.error('[useAcademicPaper] loadByReportId error:', err);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  // ── Generate paper on-demand ─────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!report || !user || isGenerating) return;
    if (!isMounted.current) return;

    setIsGenerating(true);
    setError(null);
    setProgress('Loading research data…');

    try {
      const { runAcademicPaperAgent } = await import('../services/agents/academicPaperAgent');

      setProgress('Preparing research context…');

      const minimalPlan = {
        topic:          report.title,
        subtopics:      report.focusAreas ?? [],
        searchQueries:  report.searchQueries ?? [],
        researchGoals:  report.keyFindings.slice(0, 4),
        estimatedDepth: report.depth,
        keyEntities:    [],
      };

      const minimalAnalysis = {
        facts: report.citations.map(c => ({
          claim:      c.title,
          source:     c.source,
          url:        c.url,
          confidence: 0.8,
        })),
        statistics:     report.statistics ?? [],
        trends:         [],
        companies:      [],
        keyThemes:      report.focusAreas ?? [],
        contradictions: [],
      };

      const minimalFactCheck = {
        verifiedFacts:   minimalAnalysis.facts,
        flaggedClaims:   [],
        reliabilityScore: report.reliabilityScore,
        sourceDiversity:  report.sourcesCount,
        notes:           '',
      };

      setProgress('Writing Abstract & Introduction…');

      const { output, citations, wordCount, pageEstimate } =
        await runAcademicPaperAgent(
          {
            query:      report.query,
            depth:      report.depth,
            focusAreas: report.focusAreas ?? [],
            mode:       'academic',
          },
          minimalPlan,
          minimalAnalysis,
          minimalFactCheck,
          [],   // no raw search batches needed — report already has citations
          report,
          citationStyle,
        );

      setProgress('Saving academic paper…');

      // FIX: output.sections is typed as Omit<AcademicSection,'id'>[] by
      // AcademicAgentOutput, but hydrateSections() in the agent already adds
      // ids to every section before returning. Safe to cast here.
      const sectionsWithIds = output.sections as AcademicSection[];

      const { data: paperRow, error: saveError } = await supabase
        .from('academic_papers')
        .insert({
          report_id:      report.id,
          user_id:        user.id,
          title:          output.title,
          running_head:   output.runningHead,
          abstract:       output.abstract,
          keywords:       output.keywords,
          sections:       sectionsWithIds,
          citations,
          citation_style: citationStyle,
          word_count:     wordCount,
          page_estimate:  pageEstimate,
          generated_at:   new Date().toISOString(),
        })
        .select()
        .single();

      if (saveError || !paperRow) {
        throw new Error(saveError?.message ?? 'Failed to save academic paper');
      }

      // Link paper to report
      await supabase
        .from('research_reports')
        .update({ academic_paper_id: paperRow.id })
        .eq('id', report.id);

      const newPaper: AcademicPaper = {
        id:            paperRow.id,
        reportId:      report.id,
        userId:        user.id,
        title:         output.title,
        runningHead:   output.runningHead,
        abstract:      output.abstract,
        keywords:      output.keywords,
        sections:      sectionsWithIds,
        citations,
        citationStyle,
        wordCount,
        pageEstimate,
        generatedAt:   paperRow.generated_at,
        exportCount:   0,
      };

      if (isMounted.current) {
        setPaper(newPaper);
        const first = newPaper.sections.find(s => s.type !== 'abstract');
        if (first) setActiveSectionId(first.id);
        setProgress('');

        // ── Part 22: Auto-cache the newly generated paper ──────────────
        // Fire-and-forget — never throws, never blocks state updates above
        autoCacheAcademicPaper(newPaper);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (isMounted.current) {
        setError(msg);
        setProgress('');
      }
      console.error('[useAcademicPaper] generate error:', err);
    } finally {
      if (isMounted.current) setIsGenerating(false);
    }
  }, [report, user, isGenerating, citationStyle]);

  // ── Export as PDF ────────────────────────────────────────────────────────
  const exportPDF = useCallback(async () => {
    if (!paper || isExporting) return;
    setIsExporting(true);
    try {
      await exportAcademicPaperAsPDF(paper);
      await supabase
        .from('academic_papers')
        .update({ export_count: (paper.exportCount ?? 0) + 1 })
        .eq('id', paper.id);
    } catch (err) {
      Alert.alert('Export Error', 'Could not generate PDF. Please try again.');
      console.error('[useAcademicPaper] exportPDF error:', err);
    } finally {
      if (isMounted.current) setIsExporting(false);
    }
  }, [paper, isExporting]);

  // ── Export as Markdown ───────────────────────────────────────────────────
  const exportMarkdown = useCallback(async () => {
    if (!paper) return;
    try {
      const md = buildMarkdown(paper);
      await Share.share({ title: paper.title, message: md });
      await supabase
        .from('academic_papers')
        .update({ export_count: (paper.exportCount ?? 0) + 1 })
        .eq('id', paper.id);
    } catch (err) {
      Alert.alert('Share Error', 'Could not share the paper. Please try again.');
      console.error('[useAcademicPaper] exportMarkdown error:', err);
    }
  }, [paper]);

  // ── Navigate to a section ────────────────────────────────────────────────
  const navigateToSection = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
  }, []);

  // ── Computed ─────────────────────────────────────────────────────────────

  const activeSection: AcademicSection | null =
    paper?.sections.find(s => s.id === activeSectionId) ?? null;

  const sectionProgress = paper
    ? {
        done:  paper.sections.findIndex(s => s.id === activeSectionId) + 1,
        total: paper.sections.length,
      }
    : null;

  const hasPaper = !!paper;

  const state: AcademicPaperState = {
    paper,
    isGenerating,
    isExporting,
    error,
    progress,
    activeSectionId,
    citationStyle,
  };

  return {
    // State
    state,
    paper,
    isLoading,
    isGenerating,
    isExporting,
    progress,
    error,
    hasPaper,
    activeSectionId,
    activeSection,
    sectionProgress,
    citationStyle,
    messages: [] as any[], // kept for compat with report-details modal chat count

    // Actions
    loadPaper,
    loadByReportId,
    generate,
    exportPDF,
    exportMarkdown,
    navigateToSection,
    setCitationStyle,
    clearError: () => setError(null),
  };
}