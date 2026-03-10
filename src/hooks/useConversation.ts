// src/hooks/useConversation.ts
// Manages follow-up Q&A on a completed research report.
// Keeps conversation history for context in each new message.

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { chatCompletion, ChatMessage } from '../services/openaiClient';
import { ConversationMessage, ResearchReport } from '../types';
import { useAuth } from '../context/AuthContext';

export function useConversation(report: ResearchReport) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [sending, setSending] = useState(false);

  const sendMessage = useCallback(async (userText: string) => {
    if (!user || !userText.trim() || sending) return;

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
      // Build context from report
      const reportContext = `
RESEARCH REPORT TITLE: ${report.title}
EXECUTIVE SUMMARY: ${report.executiveSummary}

KEY FINDINGS:
${report.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

SECTIONS COVERED: ${report.sections.map((s) => s.title).join(', ')}

FULL SECTIONS:
${report.sections.map((s) => `## ${s.title}\n${s.content}`).join('\n\n')}
`.slice(0, 6000); // Keep within context limits

      // Build conversation history for OpenAI
      const conversationHistory: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const systemPrompt = `You are an expert research assistant who has just completed a comprehensive research report. You have deep knowledge of the topic and can answer follow-up questions based on the research findings.

RESEARCH CONTEXT:
${reportContext}

Answer questions based on this research. If asked about something not covered in the report, use your general knowledge and clearly indicate when you're going beyond the report. Be specific, cite data when available, and keep answers concise but thorough.`;

      const response = await chatCompletion([
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userText },
      ], { temperature: 0.6, maxTokens: 1000 });

      const assistantMsg: ConversationMessage = {
        id: `local-ai-${Date.now()}`,
        reportId: report.id,
        userId: user.id,
        role: 'assistant',
        content: response,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Save to Supabase in background (don't await)
      supabase.from('research_conversations').insert([
        { report_id: report.id, user_id: user.id, role: 'user', content: userText },
        { report_id: report.id, user_id: user.id, role: 'assistant', content: response },
      ]).then(({ error }) => {
        if (error) console.warn('Failed to save conversation:', error);
      });

    } catch (err) {
      const errMsg: ConversationMessage = {
        id: `err-${Date.now()}`,
        reportId: report.id,
        userId: user.id,
        role: 'assistant',
        content: 'Sorry, I could not generate a response. Please try again.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }, [user, report, messages, sending]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, sending, sendMessage, clearMessages };
}