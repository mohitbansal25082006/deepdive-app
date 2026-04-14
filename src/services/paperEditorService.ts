// src/services/paperEditorService.ts
// Part 38 — Paper editor: save, load, versioning helpers
// Part 41.8 FIX (Problem 1) — savePaperEdits now passes p_editor_data: null
//   so PostgREST always hits the single 6-arg overload instead of failing
//   with PGRST203 "could not choose best candidate" when two overloads exist.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase }       from '../lib/supabase';
import { openaiClient }   from './openaiClient';
import type {
  AcademicSection,
  AcademicCitationStyle,
  Citation,
} from '../types';
import type {
  PaperVersion,
  PaperExportConfig,
} from '../types/paperEditor';

// ─── Save edits ───────────────────────────────────────────────────────────────
// FIX: always pass p_editor_data so PostgREST hits the single 6-arg function.

export async function savePaperEdits(
  paperId:   string,
  userId:    string,
  sections:  AcademicSection[],
  abstract:  string,
  wordCount: number,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('save_paper_editor', {
      p_paper_id:    paperId,
      p_user_id:     userId,
      p_sections:    sections as any,
      p_abstract:    abstract,
      p_word_count:  wordCount,
      p_editor_data: null,   // ← explicit null avoids overload ambiguity
    });
    if (error) {
      console.warn('[paperEditorService] savePaperEdits error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[paperEditorService] savePaperEdits exception:', err);
    return false;
  }
}

// ─── Save citations atomically ────────────────────────────────────────────────

export async function savePaperCitations(
  paperId:   string,
  userId:    string,
  citations: Citation[],
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('academic_papers')
      .update({
        citations:  citations as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paperId)
      .eq('user_id', userId);

    if (error) {
      console.warn('[paperEditorService] savePaperCitations error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[paperEditorService] savePaperCitations exception:', err);
    return false;
  }
}

// ─── Save export config ───────────────────────────────────────────────────────

export async function saveExportConfig(
  paperId: string,
  userId:  string,
  config:  PaperExportConfig,
): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('save_paper_export_config', {
      p_paper_id: paperId,
      p_user_id:  userId,
      p_config:   config as any,
    });
    return !error;
  } catch {
    return false;
  }
}

// ─── Save citation style ──────────────────────────────────────────────────────

export async function saveCitationStyle(
  paperId: string,
  userId:  string,
  style:   AcademicCitationStyle,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('academic_papers')
      .update({ citation_style: style, updated_at: new Date().toISOString() })
      .eq('id', paperId)
      .eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}

// ─── Versioning ───────────────────────────────────────────────────────────────

export async function createPaperVersion(
  paperId:      string,
  userId:       string,
  versionLabel: string,
  sections:     AcademicSection[],
  abstract:     string,
  wordCount:    number,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('save_paper_version', {
      p_paper_id:      paperId,
      p_user_id:       userId,
      p_version_label: versionLabel,
      p_sections:      sections as any,
      p_abstract:      abstract,
      p_word_count:    wordCount,
    });
    if (error) {
      console.warn('[paperEditorService] createPaperVersion error:', error.message);
      return null;
    }
    return data as string;
  } catch {
    return null;
  }
}

export async function getPaperVersions(paperId: string): Promise<PaperVersion[]> {
  try {
    const { data, error } = await supabase.rpc('get_paper_versions', {
      p_paper_id: paperId,
    });
    if (error || !data) return [];
    return (data as any[]).map(row => ({
      id:            row.id,
      versionNumber: row.version_number,
      versionLabel:  row.version_label,
      wordCount:     row.word_count,
      createdAt:     row.created_at,
    }));
  } catch {
    return [];
  }
}

export async function restorePaperVersion(
  versionId: string,
  userId:    string,
): Promise<{ sections: AcademicSection[]; abstract: string; wordCount: number } | null> {
  try {
    const { data, error } = await supabase.rpc('restore_paper_version', {
      p_version_id: versionId,
      p_user_id:    userId,
    });
    if (error || !data) {
      console.warn('[paperEditorService] restorePaperVersion error:', error?.message);
      return null;
    }
    return {
      sections:  (data as any).sections ?? [],
      abstract:  (data as any).abstract ?? '',
      wordCount: (data as any).word_count ?? 0,
    };
  } catch {
    return null;
  }
}

// ─── AI edits counter ─────────────────────────────────────────────────────────

export async function incrementPaperAIEdits(
  paperId: string,
  userId:  string,
): Promise<void> {
  try {
    await supabase.rpc('increment_paper_ai_edits', {
      p_paper_id: paperId,
      p_user_id:  userId,
    });
  } catch {
    // Non-fatal
  }
}

// ─── Citation URL fetcher (OpenAI-powered) ────────────────────────────────────

export async function fetchCitationFromUrl(url: string): Promise<{
  title:     string;
  authors:   string;
  year:      string;
  publisher: string;
  doi?:      string;
} | null> {
  try {
    let htmlSnippet = '';

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 6000);
      const response   = await fetch(url, {
        signal:  controller.signal,
        headers: { 'Accept': 'text/html,application/xhtml+xml' },
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const html      = await response.text();
        const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
        htmlSnippet     = headMatch ? headMatch[1].slice(0, 3000) : html.slice(0, 3000);
      }
    } catch {
      // CORS / timeout — continue to OpenAI-only path
    }

    const contextBlock = htmlSnippet ? `HTML HEAD SNIPPET:\n${htmlSnippet}\n\n` : '';

    const prompt = `${contextBlock}URL: ${url}

Extract academic citation metadata from the above URL${htmlSnippet ? ' and HTML' : ''}.

Return ONLY a valid JSON object with these exact keys:
{
  "title": "Full article/page title",
  "authors": "Author names (comma separated, or empty string)",
  "year": "Publication year as 4-digit string, or empty string",
  "publisher": "Publisher, journal, or website name",
  "doi": "DOI string without https://doi.org/ prefix, or empty string"
}

If you cannot determine a field with confidence, use an empty string.
Do not include any text outside the JSON object.`;

    const raw = await openaiClient.chat.completions.create({
      model:       'gpt-4o-mini',
      max_tokens:  200,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are an academic citation extractor. Return only valid JSON.' },
        { role: 'user',   content: prompt },
      ],
    });

    const text     = raw.choices[0]?.message?.content?.trim() ?? '';
    const jsonText = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const parsed = JSON.parse(jsonText);
    return {
      title:     (parsed.title     ?? '').trim(),
      authors:   (parsed.authors   ?? '').trim(),
      year:      (parsed.year      ?? '').trim(),
      publisher: (parsed.publisher ?? '').trim(),
      doi:       (parsed.doi       ?? '').trim() || undefined,
    };
  } catch (err) {
    console.warn('[paperEditorService] fetchCitationFromUrl error:', err);
    return null;
  }
}