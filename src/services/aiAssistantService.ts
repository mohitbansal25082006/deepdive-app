// src/services/aiAssistantService.ts
// Part 50.6 — Personal AI Assistant client
//
// Calls the `deepdive-assistant` Supabase Edge Function. supabase.functions.invoke
// automatically attaches the signed-in user's JWT (Authorization header) + the
// project apikey, so the function can verify the caller and enforce workspace
// membership. Returns the same answer the @deepdive team-chat bot would give.

import { supabase } from '../lib/supabase';

export interface AIAssistantSource {
  reportId:    string;
  reportTitle: string;
}

export interface AIAssistantResult {
  answer:      string;
  sources:     AIAssistantSource[];
  reportCount: number;
  mode:        'research' | 'conversation' | 'none';
  error?:      string;
}

export interface AIAssistantHistoryTurn {
  role:    'user' | 'assistant';
  content: string;
}

const NETWORK_FALLBACK: AIAssistantResult = {
  answer:      'I couldn’t reach the assistant. Check your connection and try again.',
  sources:     [],
  reportCount: 0,
  mode:        'none',
  error:       'network_error',
};

export async function askWorkspaceAI(params: {
  workspaceId: string;
  query:       string;
  history?:    AIAssistantHistoryTurn[];
}): Promise<AIAssistantResult> {
  const { workspaceId, query, history } = params;

  if (!workspaceId || !query.trim()) {
    return { answer: 'Please type a question first.', sources: [], reportCount: 0, mode: 'none', error: 'empty' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('deepdive-assistant', {
      body: {
        workspaceId,
        query:   query.trim(),
        history: (history ?? []).slice(-6),
      },
    });

    if (error) {
      // Try to surface a server-provided message if present in the error context
      let serverMsg: string | undefined;
      try {
        const ctx: any = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          const parsed = await ctx.json();
          if (parsed?.answer) serverMsg = parsed.answer;
        }
      } catch { /* ignore */ }

      return {
        answer:      serverMsg ?? 'I couldn’t reach the assistant right now. Please try again.',
        sources:     [],
        reportCount: 0,
        mode:        'none',
        error:       error.message ?? 'invoke_error',
      };
    }

    const d = (data ?? {}) as Partial<AIAssistantResult>;
    return {
      answer:      typeof d.answer === 'string' && d.answer.trim() ? d.answer : 'I couldn’t generate a response. Please try again.',
      sources:     Array.isArray(d.sources) ? d.sources : [],
      reportCount: typeof d.reportCount === 'number' ? d.reportCount : 0,
      mode:        (d.mode as AIAssistantResult['mode']) ?? 'none',
      error:       d.error,
    };
  } catch (e: any) {
    console.warn('[aiAssistantService] invoke failed:', e?.message ?? e);
    return NETWORK_FALLBACK;
  }
}