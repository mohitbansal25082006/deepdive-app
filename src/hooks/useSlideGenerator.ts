// src/hooks/useSlideGenerator.ts
// Part 5 — Original (all stale-closure fixes FIX 1–4, ref guards, patch helper)
// Part 22 — Added: autoCachePresentation() called after generate() saves to DB
//            and also inside loadPresentation() on successful load.
//
// CHANGE LOG (Part 22 only):
//   Line added: import { autoCachePresentation } from '../lib/autoCacheMiddleware';
//   Line added inside generate()         after patch({ presentation, ... }): autoCachePresentation(presentation);
//   Line added inside loadPresentation() after patch({ presentation, ... }): autoCachePresentation(pres);
//   Everything else is byte-for-byte identical to Part 5.
//
// ─── FIXES (Part 5, carried forward unchanged) ────────────────────────────────
//  FIX 1 — Stale closure in `generate`      → ref guard isGeneratingRef
//  FIX 2 — Stale closure in `_trackExport`  → reads presentationRef
//  FIX 3 — Stale closures in export helpers → refs
//  FIX 4 — `deletePresentation` stale       → presentationRef
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { runSlideAgent } from '../services/agents/slideAgent';
import {
  generatePPTX,
  exportAsSlidePDF,
  exportAsHTMLSlides,
  getThemeTokens,
} from '../services/pptxExport';
import {
  ResearchReport,
  GeneratedPresentation,
  PresentationTheme,
  SlideGeneratorState,
  SlideExportFormat,
} from '../types';
// ── Part 22: Auto-cache import ───────────────────────────────────────────────
import { autoCachePresentation } from '../lib/autoCacheMiddleware';

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: SlideGeneratorState = {
  presentation: null,
  isGenerating: false,
  isExporting:  false,
  exportFormat: null,
  progress:     '',
  error:        null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSlideGenerator(report: ResearchReport | null) {
  const [state, setState] = useState<SlideGeneratorState>(initialState);

  /*
    FIX 1–4: Refs that always mirror the latest state values.
    Callbacks read from refs instead of capturing state at memoisation time,
    making them immune to stale-closure bugs regardless of dependency arrays.
  */
  const isGeneratingRef  = useRef(false);
  const isExportingRef   = useRef(false);
  const presentationRef  = useRef<GeneratedPresentation | null>(null);

  // Keep refs in sync whenever state changes
  const patch = useCallback((partial: Partial<SlideGeneratorState>) => {
    setState(prev => {
      const next = { ...prev, ...partial };
      // Mirror mutable flags into refs so callbacks always see latest values
      if ('isGenerating' in partial) isGeneratingRef.current  = next.isGenerating;
      if ('isExporting'  in partial) isExportingRef.current   = next.isExporting;
      if ('presentation' in partial) presentationRef.current  = next.presentation;
      return next;
    });
  }, []);

  // ── Load an existing presentation from Supabase ──────────────────────────

  const loadPresentation = useCallback(async (presentationId: string) => {
    if (!presentationId) return;
    patch({ isGenerating: true, progress: 'Loading presentation…', error: null });
    try {
      const { data, error } = await supabase
        .from('presentations')
        .select('*')
        .eq('id', presentationId)
        .single();

      if (error || !data) {
        patch({ isGenerating: false, progress: '', error: 'Could not load presentation.' });
        return;
      }

      const pres: GeneratedPresentation = {
        id:           data.id,
        reportId:     data.report_id,
        userId:       data.user_id,
        title:        data.title,
        subtitle:     data.subtitle ?? '',
        theme:        (data.theme as PresentationTheme) ?? 'dark',
        themeTokens:  getThemeTokens((data.theme as PresentationTheme) ?? 'dark'),
        slides:       data.slides ?? [],
        totalSlides:  data.total_slides ?? 0,
        generatedAt:  data.generated_at,
        exportCount:  data.export_count ?? 0,
      };

      patch({ presentation: pres, isGenerating: false, progress: '' });

      // ── Part 22: Auto-cache the loaded presentation ────────────────────
      autoCachePresentation(pres);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      patch({ isGenerating: false, progress: '', error: msg });
    }
  }, [patch]);

  // ── Generate a new presentation ──────────────────────────────────────────

  const generate = useCallback(async (theme: PresentationTheme = 'dark') => {
    // FIX 1: Read from ref, not from stale closure over state
    if (!report || isGeneratingRef.current) return;

    patch({ isGenerating: true, progress: 'AI is reading your report…', error: null });

    try {
      patch({ progress: 'Designing slide structure…' });
      const agentOutput = await runSlideAgent(report, theme);

      patch({ progress: 'Building presentation…' });
      const numberedSlides = agentOutput.slides.map((s, i) => ({
        ...s,
        slideNumber: i + 1,
      }));

      const themeTokens = getThemeTokens(theme);

      patch({ progress: 'Saving presentation…' });
      const { data: savedRow, error: saveError } = await supabase
        .from('presentations')
        .insert({
          report_id:    report.id,
          user_id:      report.userId,
          title:        agentOutput.presentationTitle,
          subtitle:     agentOutput.presentationSubtitle,
          theme,
          slides:       numberedSlides,
          total_slides: numberedSlides.length,
          export_count: 0,
        })
        .select()
        .single();

      if (saveError) {
        console.warn('[useSlideGenerator] Supabase save failed:', saveError.message);
      }

      if (savedRow?.id) {
        await supabase
          .from('research_reports')
          .update({
            presentation_id: savedRow.id,
            slide_count:     numberedSlides.length,
          })
          .eq('id', report.id);
      }

      const presentation: GeneratedPresentation = {
        id:           savedRow?.id ?? '',
        reportId:     report.id,
        userId:       report.userId,
        title:        agentOutput.presentationTitle,
        subtitle:     agentOutput.presentationSubtitle,
        theme,
        themeTokens,
        slides:       numberedSlides,
        totalSlides:  numberedSlides.length,
        generatedAt:  savedRow?.generated_at ?? new Date().toISOString(),
        exportCount:  0,
      };

      patch({ presentation, isGenerating: false, progress: '' });

      // ── Part 22: Auto-cache the generated presentation ─────────────────
      // Fire-and-forget — never throws, never blocks the UI update above
      autoCachePresentation(presentation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate presentation.';
      patch({ isGenerating: false, progress: '', error: msg });
      Alert.alert('Generation Failed', msg);
    }
  // FIX 1: No longer listing state.isGenerating — using ref guard instead
  }, [report, patch]);

  // ── Regenerate with a different theme ────────────────────────────────────

  const regenerate = useCallback(async (theme: PresentationTheme) => {
    patch({ presentation: null });
    await generate(theme);
  }, [generate, patch]);

  // ── Export helpers ────────────────────────────────────────────────────────

  // FIX 2: Reads from presentationRef (always current) not from stale closure
  const _trackExport = useCallback(async (_format: SlideExportFormat) => {
    const pres = presentationRef.current;
    if (!pres?.id) return;
    try {
      await supabase
        .from('presentations')
        .update({ export_count: (pres.exportCount ?? 0) + 1 })
        .eq('id', pres.id);
    } catch {
      // Non-fatal
    }
    patch({
      presentation: { ...pres, exportCount: (pres.exportCount ?? 0) + 1 },
    });
  }, [patch]);

  const exportPPTX = useCallback(async () => {
    // FIX 3: Read from refs — not from stale closure
    const pres = presentationRef.current;
    if (!pres || isExportingRef.current) return;
    patch({ isExporting: true, exportFormat: 'pptx' });
    try {
      await generatePPTX(pres);
      await _trackExport('pptx');
    } catch (pptxErr) {
      console.warn('[useSlideGenerator] PPTX export failed, falling back to PDF:', pptxErr);
      try {
        await exportAsSlidePDF(pres);
        await _trackExport('pdf');
        Alert.alert(
          'Note',
          'PPTX export fell back to PDF slides. The PDF looks great and all content is preserved!'
        );
      } catch (pdfErr) {
        const msg = pdfErr instanceof Error ? pdfErr.message : 'Export failed.';
        Alert.alert('Export Error', msg);
      }
    } finally {
      patch({ isExporting: false, exportFormat: null });
    }
  }, [patch, _trackExport]);

  const exportPDF = useCallback(async () => {
    const pres = presentationRef.current;
    if (!pres || isExportingRef.current) return;
    patch({ isExporting: true, exportFormat: 'pdf' });
    try {
      await exportAsSlidePDF(pres);
      await _trackExport('pdf');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF export failed.';
      Alert.alert('Export Error', msg);
    } finally {
      patch({ isExporting: false, exportFormat: null });
    }
  }, [patch, _trackExport]);

  const exportHTML = useCallback(async () => {
    const pres = presentationRef.current;
    if (!pres || isExportingRef.current) return;
    patch({ isExporting: true, exportFormat: 'html' });
    try {
      await exportAsHTMLSlides(pres);
      await _trackExport('html');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'HTML export failed.';
      Alert.alert('Export Error', msg);
    } finally {
      patch({ isExporting: false, exportFormat: null });
    }
  }, [patch, _trackExport]);

  // ── Delete presentation ───────────────────────────────────────────────────

  const deletePresentation = useCallback(async () => {
    // FIX 4: Read from ref instead of stale state closure
    const pres = presentationRef.current;
    if (!pres?.id) return;
    try {
      await supabase
        .from('presentations')
        .delete()
        .eq('id', pres.id);

      if (report) {
        await supabase
          .from('research_reports')
          .update({ presentation_id: null, slide_count: 0 })
          .eq('id', report.id);
      }

      patch({ presentation: null });
    } catch (err) {
      console.warn('[useSlideGenerator] Delete failed:', err);
    }
  }, [report, patch]);

  // ── Reset local state ─────────────────────────────────────────────────────

  const reset = useCallback(() => {
    isGeneratingRef.current = false;
    isExportingRef.current  = false;
    presentationRef.current = null;
    setState(initialState);
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    presentation:  state.presentation,
    isGenerating:  state.isGenerating,
    isExporting:   state.isExporting,
    exportFormat:  state.exportFormat,
    progress:      state.progress,
    error:         state.error,

    generate,
    regenerate,
    loadPresentation,
    exportPPTX,
    exportPDF,
    exportHTML,
    deletePresentation,
    reset,
  };
}