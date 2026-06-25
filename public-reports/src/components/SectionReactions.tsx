'use client';
// Public-Reports/src/components/SectionReactions.tsx
// Part 55.9 — Fully Themed Anonymous Emoji Reactions
// Anonymous emoji reactions at the end of each report section.
// - 4 emojis: 💡 Insightful · 😮 Surprising · 🤔 Disagree · 👍 Useful
// - No login required — identified by IP via the /api/reactions endpoint
// - Optimistic updates with rollback on error
// - Counts shown next to each button

import { useState, useTransition } from 'react';
import type { ReactionEmoji } from '@/types/report';

export const REACTION_EMOJIS: ReactionEmoji[] = ['💡', '😮', '🤔', '👍'];

export const REACTION_LABELS: Record<ReactionEmoji, string> = {
  '💡': 'Insightful',
  '😮': 'Surprising',
  '🤔': 'Disagree',
  '👍': 'Useful',
};

/** Per-emoji state for one section */
export interface EmojiState {
  count: number;
  hasReacted: boolean;
}

/** Full state for one section: map from emoji → { count, hasReacted } */
export type SectionEmojiMap = Record<ReactionEmoji, EmojiState>;

function buildEmpty(): SectionEmojiMap {
  return {
    '💡': { count: 0, hasReacted: false },
    '😮': { count: 0, hasReacted: false },
    '🤔': { count: 0, hasReacted: false },
    '👍': { count: 0, hasReacted: false },
  };
}

interface Props {
  shareId: string;
  sectionId: string;
  /** Initial reaction state from server (map of emoji → { count, hasReacted }) */
  initial?: Partial<Record<ReactionEmoji, { count: number; hasReacted: boolean }>>;
}

export default function SectionReactions({
  shareId,
  sectionId,
  initial,
}: Props) {
  const [emojis, setEmojis] = useState<SectionEmojiMap>(() => {
    const base = buildEmpty();
    if (initial) {
      for (const [e, v] of Object.entries(initial)) {
        if (v && base[e as ReactionEmoji] !== undefined) {
          base[e as ReactionEmoji] = { count: v.count ?? 0, hasReacted: v.hasReacted ?? false };
        }
      }
    }
    return base;
  });

  const [isPending, startTransition] = useTransition();
  const [lastError, setLastError] = useState<string | null>(null);

  const totalReactions = Object.values(emojis).reduce((s, v) => s + v.count, 0);
  const hasAnyReaction = Object.values(emojis).some(v => v.hasReacted);

  const handleToggle = (emoji: ReactionEmoji) => {
    setLastError(null);

    // Optimistic update
    const prev = { ...emojis };
    const wasReacted = emojis[emoji].hasReacted;
    setEmojis(cur => ({
      ...cur,
      [emoji]: {
        count: cur[emoji].count + (wasReacted ? -1 : 1),
        hasReacted: !wasReacted,
      },
    }));

    startTransition(async () => {
      try {
        const res = await fetch('/api/reactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shareId, sectionId, emoji }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        // Update with server-confirmed counts
        if (data.reactions) {
          setEmojis(cur => {
            const updated = { ...cur };
            for (const e of REACTION_EMOJIS) {
              const serverCount = data.reactions[e] ?? 0;
              updated[e] = {
                count: Number(serverCount),
                hasReacted: e === emoji ? !wasReacted : cur[e].hasReacted,
              };
            }
            return updated;
          });
        }
      } catch (err) {
        // Rollback optimistic update
        setEmojis(prev);
        setLastError('Could not save reaction. Try again.');
        setTimeout(() => setLastError(null), 3000);
      }
    });
  };

  return (
    <div
      className="mt-5 pt-4 transition-all duration-300"
      style={{
        borderTop: '1px solid var(--theme-border)',
      }}
      aria-label="Section reactions"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Label */}
        <p
          className="text-xs font-bold uppercase tracking-wider transition-all duration-300"
          style={{
            color: hasAnyReaction ? 'var(--theme-primary)' : 'var(--theme-text-muted)',
          }}
        >
          {totalReactions > 0
            ? `${totalReactions} reaction${totalReactions !== 1 ? 's' : ''}`
            : 'Was this section helpful?'}
        </p>

        {/* Emoji buttons */}
        <div className="flex items-center gap-2">
          {REACTION_EMOJIS.map(emoji => {
            const state = emojis[emoji];
            const isReacted = state.hasReacted;
            const count = state.count;

            return (
              <button
                key={emoji}
                onClick={() => handleToggle(emoji)}
                disabled={isPending}
                title={REACTION_LABELS[emoji]}
                aria-label={`${REACTION_LABELS[emoji]}${count > 0 ? ` (${count})` : ''}`}
                aria-pressed={isReacted}
                className="reaction-btn transition-all duration-300"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: '999px',
                  border: isReacted
                    ? '2px solid var(--theme-primary)'
                    : '1px solid var(--theme-border)',
                  background: isReacted
                    ? 'var(--theme-primary)'
                    : 'var(--theme-background-elevated)',
                  cursor: isPending ? 'wait' : 'pointer',
                  transform: isReacted ? 'scale(1.04)' : 'scale(1)',
                  boxShadow: isReacted
                    ? '0 2px 16px var(--theme-primary)'
                    : 'none',
                  opacity: isPending ? 0.6 : 1,
                }}
              >
                <span
                  className="reaction-emoji transition-all duration-300"
                  style={{
                    fontSize: '1rem',
                    lineHeight: 1,
                    filter: isReacted ? 'none' : 'grayscale(30%)',
                    transform: isReacted ? 'scale(1.15)' : 'scale(1)',
                    display: 'inline-block',
                  }}
                >
                  {emoji}
                </span>

                {count > 0 && (
                  <span
                    className="reaction-count transition-all duration-300"
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: isReacted ? 700 : 600,
                      color: isReacted ? '#FFFFFF' : 'var(--theme-text-secondary)',
                      lineHeight: 1,
                      minWidth: '12px',
                      textAlign: 'center',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error toast */}
      {lastError && (
        <p
          className="text-xs mt-2 animate-fade-in"
          style={{
            background: 'var(--theme-error)',
            padding: '6px 12px',
            borderRadius: '8px',
            border: '1px solid var(--theme-error)',
            fontWeight: 600,
            color: '#FFFFFF',
          }}
          role="alert"
        >
          {lastError}
        </p>
      )}

      <style>{`
        /* ── Reaction button hover effects ── */
        .reaction-btn:hover {
          transform: scale(1.05) !important;
          border-color: var(--theme-primary) !important;
          box-shadow: 0 2px 16px var(--theme-primary) !important;
        }

        .reaction-btn:hover .reaction-emoji {
          transform: scale(1.15) !important;
          filter: none !important;
        }

        .reaction-btn:hover .reaction-count {
          color: var(--theme-primary) !important;
        }

        /* ── Active state ── */
        .reaction-btn[aria-pressed="true"]:hover {
          transform: scale(1.08) !important;
          box-shadow: 0 4px 24px var(--theme-primary) !important;
        }

        .reaction-btn[aria-pressed="true"]:hover .reaction-emoji {
          transform: scale(1.2) !important;
        }

        /* ── Animation ── */
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out both;
        }

        /* ── Reduced motion support ── */
        @media (prefers-reduced-motion: reduce) {
          .reaction-btn,
          .reaction-emoji,
          .reaction-count,
          .animate-fade-in {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
          }
          .reaction-btn:hover {
            transform: none !important;
          }
          .reaction-btn:hover .reaction-emoji {
            transform: none !important;
          }
          .reaction-btn[aria-pressed="true"]:hover {
            transform: none !important;
          }
          .reaction-btn[aria-pressed="true"]:hover .reaction-emoji {
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}