'use client';
// Public-Reports/src/app/r/[shareId]/CopyLinkIsland.tsx
// Part 55.9 — Fully Themed Copy Link Component

import { useState } from 'react';
import { supabaseClient } from '@/lib/supabase-client';

interface Props {
  url: string;
  shareId?: string;
}

export function CopyLinkIsland({ url, shareId }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      if (shareId) {
        void (async () => {
          try {
            await supabaseClient.rpc('increment_share_count', { p_share_id: shareId });
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
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95"
      style={{
        background: copied 
          ? 'var(--theme-success)' 
          : 'var(--theme-background-card)',
        border: copied 
          ? '2px solid var(--theme-success)' 
          : '1px solid var(--theme-border)',
        color: copied ? '#FFFFFF' : 'var(--theme-text-secondary)',
        boxShadow: copied 
          ? '0 4px 16px var(--theme-success)' 
          : 'none',
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}