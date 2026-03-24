// src/components/ChatWidget.tsx
// Public-Reports — Embedded AI chat widget
//
// Fix: mount check defaults to limitReached=false unless server
// EXPLICITLY returns limitReached: true. Prevents new visitors from
// seeing "questions used up" on first visit.

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import SignupWall from './SignupWall';
import type { PublicChatMessage, PublicChatResponse } from '@/types/report';

interface ChatWidgetProps {
  shareId:       string;
  reportTitle:   string;
  questionsMax?: number;
}

const SUGGESTED_QUESTIONS = [
  'What are the most important findings?',
  'What does this mean for the future?',
  'What are the key statistics?',
  'Who are the main companies involved?',
  'What are the main risks or challenges?',
];

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <div className="typing-dot" />
      <div className="typing-dot" />
      <div className="typing-dot" />
    </div>
  );
}

function MessageBubble({ message }: { message: PublicChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      {!isUser && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
          style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
      )}
      <div
        className="max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
        style={
          isUser
            ? { background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)', color: '#fff', borderBottomRightRadius: '6px' }
            : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderBottomLeftRadius: '6px' }
        }
      >
        {message.content}
      </div>
    </div>
  );
}

export default function ChatWidget({
  shareId,
  reportTitle,
  questionsMax = 3,
}: ChatWidgetProps) {
  const [messages,      setMessages]      = useState<PublicChatMessage[]>([]);
  const [inputValue,    setInputValue]    = useState('');
  const [isLoading,     setIsLoading]     = useState(false);
  const [questionsUsed, setQuestionsUsed] = useState(0);
  const [limitReached,  setLimitReached]  = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [isOpen,        setIsOpen]        = useState(false);
  const [suggestions,   setSuggestions]   = useState(SUGGESTED_QUESTIONS.slice(0, 3));
  const [hasInteracted, setHasInteracted] = useState(false);
  const [usageChecked,  setUsageChecked]  = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  // ── Mount: check if visitor already hit the limit (e.g. after refresh) ────
  // CRITICAL: Only set limitReached=true when server EXPLICITLY returns
  // limitReached: true. Any error, non-ok response, or missing/null field
  // must default to false so new visitors always see the chat open.
  useEffect(() => {
    let cancelled = false;

    async function checkUsageOnMount() {
      try {
        const res = await fetch('/api/public-chat/status', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ shareId }),
        });

        if (!res.ok) {
          // Server error — fail open, don't block the user
          if (!cancelled) setUsageChecked(true);
          return;
        }

        const data = await res.json();

        if (cancelled) return;

        // Only trust an explicit boolean true
        const used    = typeof data.questionsUsed === 'number' && data.questionsUsed > 0
          ? data.questionsUsed
          : 0;
        const limited = data.limitReached === true; // strict equality, not truthy

        setQuestionsUsed(used);
        if (limited) setLimitReached(true);

      } catch {
        // Network error — fail open
      } finally {
        if (!cancelled) setUsageChecked(true);
      }
    }

    checkUsageOnMount();
    return () => { cancelled = true; };
  }, [shareId]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Focus on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const sendMessage = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isLoading || limitReached) return;

    setHasInteracted(true);
    setError(null);

    const userMsg: PublicChatMessage = {
      id:        crypto.randomUUID(),
      role:      'user',
      content:   trimmed,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/public-chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ shareId, question: trimmed, history }),
      });

      const data: PublicChatResponse = await res.json();

      // Limit reached (returned as 200 with limitReached flag)
      if (data.limitReached === true) {
        setLimitReached(true);
        setQuestionsUsed(data.questionsUsed ?? questionsMax);
        setMessages(prev => prev.filter(m => m.id !== userMsg.id));
        return;
      }

      if (!res.ok) {
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      setQuestionsUsed(data.questionsUsed);

      const assistantMsg: PublicChatMessage = {
        id:        crypto.randomUUID(),
        role:      'assistant',
        content:   data.answer,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.questionsUsed >= questionsMax) {
        setLimitReached(true);
      }

      setSuggestions(
        SUGGESTED_QUESTIONS
          .filter(q => !messages.some(m => m.content === q) && q !== trimmed)
          .slice(0, 3)
      );

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
      setMessages(prev => prev.filter(m => m.id !== userMsg.id));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, limitReached, messages, shareId, questionsMax]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(inputValue); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(inputValue); }
  };

  const questionsRemaining = Math.max(0, questionsMax - questionsUsed);
  const progressPct        = (questionsUsed / questionsMax) * 100;

  // ── Collapsed state ────────────────────────────────────────────────────────

  if (!isOpen) {
    // Already hit limit — show compact wall teaser
    if (limitReached && usageChecked) {
      return (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)',
            border:     '1px solid rgba(108,99,255,0.3)',
          }}
        >
          <div className="px-5 py-4 flex items-center gap-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                   stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                AI questions used up
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                You&apos;ve used all {questionsMax} free questions. Download DeepDive AI for unlimited access.
              </p>
            </div>
            <button
              onClick={() => setIsOpen(true)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
              style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)', color: '#fff' }}
            >
              Get App
            </button>
          </div>
        </div>
      );
    }

    // Normal teaser
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)',
          border:     '1px solid rgba(108,99,255,0.3)',
        }}
      >
        <button
          onClick={() => setIsOpen(true)}
          className="w-full px-5 py-4 flex items-center gap-4 text-left transition-colors hover:bg-white/[0.02]"
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)',
              boxShadow:  '0 0 20px rgba(108,99,255,0.3)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                 stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                Ask AI about this report
              </span>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(108,99,255,0.15)', color: '#6C63FF', border: '1px solid rgba(108,99,255,0.3)' }}
              >
                {questionsMax} free questions
              </span>
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
              RAG-powered · semantic search · ask anything about this research
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        <div className="px-5 pb-4 flex flex-wrap gap-2" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="w-full text-xs font-semibold pt-3 mb-1" style={{ color: 'var(--text-muted)' }}>
            Try asking:
          </p>
          {suggestions.map(q => (
            <button
              key={q}
              onClick={() => { setIsOpen(true); setTimeout(() => sendMessage(q), 100); }}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:bg-white/[0.04]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Expanded state ─────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col animate-fade-in"
      style={{
        background: 'var(--bg-card)',
        border:     '1px solid rgba(108,99,255,0.3)',
        height:     '520px',
        maxHeight:  '80vh',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1A1A35 0%, #12122A 100%)', borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>AI Research Assistant</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>RAG-powered · answers from this report</p>
        </div>

        {/* Question dots counter */}
        {!limitReached && (
          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: questionsMax }).map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full transition-colors duration-300"
                  style={{ background: i < questionsUsed ? 'rgba(255,255,255,0.2)' : '#6C63FF' }}
                />
              ))}
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
              {questionsRemaining} left
            </span>
          </div>
        )}

        {/* Close */}
        <button
          onClick={() => setIsOpen(false)}
          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
          style={{ border: '1px solid var(--border)' }}
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="var(--text-muted)" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
      >
        {/* Empty state */}
        {messages.length === 0 && !isLoading && !limitReached && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-6">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.25)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                   stroke="#6C63FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                Ask anything about this report
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                You have {questionsMax} free questions
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              {suggestions.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-left transition-all hover:bg-white/[0.03]"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}

        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
              style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                   stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <div
              className="px-4 py-3 rounded-2xl"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderBottomLeftRadius: '6px' }}
            >
              <TypingDots />
            </div>
          </div>
        )}

        {error && (
          <div
            className="flex items-start gap-2.5 px-4 py-3 rounded-xl text-xs animate-fade-in"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {limitReached && (
          <div className="pt-2">
            <SignupWall
              questionsUsed={questionsUsed}
              questionsMax={questionsMax}
              reportTitle={reportTitle}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!limitReached && (
        <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid var(--border)' }}>
          {hasInteracted && questionsUsed > 0 && (
            <div
              className="h-0.5 rounded-full mb-2.5 overflow-hidden"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width:      `${progressPct}%`,
                  background: questionsRemaining <= 1
                    ? 'linear-gradient(90deg, #F59E0B, #EF4444)'
                    : 'linear-gradient(90deg, #6C63FF, #8B5CF6)',
                }}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                questionsRemaining === 1
                  ? 'Last free question — make it count!'
                  : 'Ask anything about this report…'
              }
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm leading-relaxed outline-none"
              style={{
                background: 'var(--bg-elevated)',
                border:     '1px solid var(--border)',
                color:      'var(--text-primary)',
                minHeight:  '44px',
                maxHeight:  '120px',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: inputValue.trim() && !isLoading
                  ? 'linear-gradient(135deg, #6C63FF 0%, #8B5CF6 100%)'
                  : 'var(--bg-elevated)',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke={inputValue.trim() && !isLoading ? 'white' : 'var(--text-muted)'}
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </form>

          <p className="text-center text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            {questionsRemaining > 0
              ? `${questionsRemaining} of ${questionsMax} free questions remaining`
              : 'Limit reached'
            }
          </p>
        </div>
      )}
    </div>
  );
}