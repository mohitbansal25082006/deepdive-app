// src/hooks/useConversation.ts
// FIXED:
// 1. Supabase insert now sends two separate rows correctly
// 2. Error is properly logged (was silently swallowed before)
// 3. Added session re-check before insert to avoid RLS failures

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { chatCompletion, ChatMessage } from '../services/openaiClient';
import { ConversationMessage, ResearchReport } from '../types';
import { useAuth } from '../context/AuthContext';

export function useConversation(report: ResearchReport) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sending, setSending] = useState(false);

  const saveMessages = async (
    reportId: string,
    userId: string,
    userText: string,
    assistantText: string
  ) => {
    try {
      // Re-fetch session to ensure the token is still valid before inserting
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        console.warn('[Conversation] Session expired — conversation not saved');
        return;
      }

      // Insert user message
      const { error: userError } = await supabase
        .from('research_conversations')
        .insert({
          report_id: reportId,
          user_id: userId,
          role: 'user',
          content: userText,
        });

      if (userError) {
        console.warn('[Conversation] Failed to save user message:', userError.code, userError.message);
      }

      // Insert assistant message
      const { error: assistantError } = await supabase
        .from('research_conversations')
        .insert({
          report_id: reportId,
          user_id: userId,
          role: 'assistant',
          content: assistantText,
        });

      if (assistantError) {
        console.warn('[Conversation] Failed to save assistant message:', assistantError.code, assistantError.message);
      }
    } catch (err) {
      console.warn('[Conversation] Save error:', err instanceof Error ? err.message : String(err));
    }
  };

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!user || !userText.trim() || sending || !report) return;

      const userMsg: ConversationMessage = {
        id: `local-${Date.now()}`,
        reportId: report.id,
        userId: user.id,
        role: 'user',
        content: userText.trim(),
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setSending(true);

      try {
        // Build compact report context (stay within token limits)
        const sectionsSummary = Array.isArray(report.sections)
          ? report.sections
              .map((s) => `## ${s.title}\n${(s.content ?? '').slice(0, 400)}`)
              .join('\n\n')
          : '';

        const reportContext = `
REPORT TITLE: ${report.title}

EXECUTIVE SUMMARY:
${(report.executiveSummary ?? '').slice(0, 800)}

KEY FINDINGS:
${Array.isArray(report.keyFindings) ? report.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n') : 'None'}

SECTIONS:
${sectionsSummary}
`.slice(0, 5500);

        // Build conversation history for context
        const conversationHistory: ChatMessage[] = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const systemPrompt = `You are an expert research assistant. You just completed a research report and are answering follow-up questions.

RESEARCH CONTEXT:
${reportContext}

Answer based on the research above. If a question goes beyond the report, use your general knowledge and say so. Be concise, specific, and cite statistics when available.`;

        const response = await chatCompletion(
          [
            { role: 'system', content: systemPrompt },
            ...conversationHistory,
            { role: 'user', content: userText },
          ],
          { temperature: 0.6, maxTokens: 800 }
        );

        const assistantMsg: ConversationMessage = {
          id: `local-ai-${Date.now()}`,
          reportId: report.id,
          userId: user.id,
          role: 'assistant',
          content: response,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Save in background — non-blocking, with proper error logging
        saveMessages(report.id, user.id, userText.trim(), response);

      } catch (err) {
        const errorText =
          err instanceof Error ? err.message : 'Could not generate a response. Please try again.';

        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            reportId: report.id,
            userId: user.id,
            role: 'assistant',
            content: `Sorry, ${errorText}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [user, report, messages, sending]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, sending, sendMessage, clearMessages };
}