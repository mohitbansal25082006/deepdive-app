'use client';
// Public-Reports/src/components/SectionReactions.tsx
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
  count:      number;
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
  shareId:    string;
  sectionId:  string;
  /** Initial reaction state from server (map of emoji → { count, hasReacted }) */
  initial?:   Partial<Record<ReactionEmoji, { count: number; hasReacted: boolean }>>;
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
  const [lastError, setLastError]    = useState<string | null>(null);

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
        count:      cur[emoji].count + (wasReacted ? -1 : 1),
        hasReacted: !wasReacted,
      },
    }));

    startTransition(async () => {
      try {
        const res = await fetch('/api/reactions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ shareId, sectionId, emoji }),
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
                count:      Number(serverCount),
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
      className="mt-5 pt-4"
      style={{ borderTop: '1px solid var(--border)' }}
      aria-label="Section reactions"
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Label */}
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: hasAnyReaction ? 'rgba(108,99,255,0.8)' : 'var(--text-muted)' }}
        >
          {totalReactions > 0
            ? `${totalReactions} reaction${totalReactions !== 1 ? 's' : ''}`
            : 'Was this section helpful?'}
        </p>

        {/* Emoji buttons */}
        <div className="flex items-center gap-2">
          {REACTION_EMOJIS.map(emoji => {
            const state      = emojis[emoji];
            const isReacted  = state.hasReacted;
            const count      = state.count;

            return (
              <button
                key={emoji}
                onClick={() => handleToggle(emoji)}
                disabled={isPending}
                title={REACTION_LABELS[emoji]}
                aria-label={`${REACTION_LABELS[emoji]}${count > 0 ? ` (${count})` : ''}`}
                aria-pressed={isReacted}
                style={{
                  display:        'inline-flex',
                  alignItems:     'center',
                  gap:            5,
                  padding:        '5px 10px',
                  borderRadius:   '999px',
                  border:         '1px solid ' + (isReacted ? 'rgba(108,99,255,0.5)' : 'var(--border)'),
                  background:     isReacted ? 'rgba(108,99,255,0.12)' : 'var(--bg-elevated)',
                  cursor:         isPending ? 'wait' : 'pointer',
                  transition:     'all 0.15s ease',
                  transform:      isReacted ? 'scale(1.04)' : 'scale(1)',
                  boxShadow:      isReacted ? '0 0 0 2px rgba(108,99,255,0.15)' : 'none',
                  opacity:        isPending ? 0.7 : 1,
                }}
              >
                <span
                  style={{
                    fontSize:   '1rem',
                    lineHeight: 1,
                    filter:     isReacted ? 'none' : 'grayscale(30%)',
                    transition: 'filter 0.15s, transform 0.15s',
                    transform:  isReacted ? 'scale(1.1)' : 'scale(1)',
                    display:    'inline-block',
                  }}
                >
                  {emoji}
                </span>

                {count > 0 && (
                  <span
                    style={{
                      fontSize:   '0.6875rem',
                      fontWeight: isReacted ? 700 : 500,
                      color:      isReacted ? '#A78BFA' : 'var(--text-muted)',
                      lineHeight: 1,
                      minWidth:   '12px',
                      textAlign:  'center',
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
          className="text-xs mt-2"
          style={{ color: '#EF4444' }}
          role="alert"
        >
          {lastError}
        </p>
      )}
    </div>
  );
}