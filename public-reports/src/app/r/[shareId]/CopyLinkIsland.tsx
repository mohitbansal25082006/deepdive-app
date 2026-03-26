'use client';
// Public-Reports/src/app/r/[shareId]/CopyLinkIsland.tsx
// Part 34 update: increments share_count via Supabase when user copies the link.
// All Part 33 behaviour preserved.
import { useState } from 'react';
import { supabaseClient } from '@/lib/supabase-client';

interface Props {
  url: string;
  /** Part 34: pass shareId so we can track copies as shares */
  shareId?: string;
}

export function CopyLinkIsland({ url, shareId }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      // Part 34: increment share_count (fire-and-forget, non-blocking)
      if (shareId) {
        // Wrap in void + async IIFE so .catch() works on a real Promise
        void (async () => {
          try {
            await supabaseClient
              .rpc('increment_share_count', { p_share_id: shareId });
          } catch {
            /* silent */
          }
        })();
      }
    } catch {
      // clipboard API unavailable — silent fail
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80"
      style={{
        background: copied ? 'rgba(16,185,129,0.15)' : 'var(--bg-elevated)',
        border: '1px solid ' + (copied ? 'rgba(16,185,129,0.4)' : 'var(--border)'),
        color: copied ? '#10B981' : 'var(--text-secondary)',
      }}
      aria-label={copied ? 'Copied!' : 'Copy share link'}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}