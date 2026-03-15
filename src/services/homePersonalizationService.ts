// src/services/homePersonalizationService.ts
// Part 21 — Home screen personalization.
//
// Fetches personalized topic suggestions from Supabase + GPT-4o follow-ups.
// Also updates affinity scores after each completed research session.

import { supabase } from '../lib/supabase';
import { chatCompletionJSON } from './openaiClient';
import { ResearchReport } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SuggestionSource = 'affinity' | 'recent' | 'trending' | 'followup';

export interface PersonalizedSuggestion {
  id:              string;
  keyword:         string;
  rawQuery:        string;
  source:          SuggestionSource;
  score:           number;
  lastSeenAt?:     string;   // ISO string — used for time-ago display
  tag:             string;
  icon:            string;
  gradient:        readonly [string, string];
  followUpAngle?:  string;
}

// Gradient palette
const GRADIENTS: readonly [string, string][] = [
  ['#6C63FF', '#8B5CF6'],
  ['#FF6584', '#FF8E53'],
  ['#43E97B', '#38F9D7'],
  ['#F093FB', '#F5576C'],
  ['#4FACFE', '#00F2FE'],
  ['#FA709A', '#FEE140'],
  ['#30CFD0', '#667EEA'],
  ['#A18CD1', '#FBC2EB'],
];

const SOURCE_ICONS: Record<SuggestionSource, string> = {
  affinity: 'bookmark',
  recent:   'time',
  trending: 'trending-up',
  followup: 'git-branch',
};

const SOURCE_TAGS: Record<SuggestionSource, string> = {
  affinity: 'Your Interest',
  recent:   'Recently Researched',
  trending: 'Trending',
  followup: 'Follow-up Angle',
};

// ─── Main fetch ───────────────────────────────────────────────────────────────

export async function fetchPersonalizedSuggestions(
  userId: string,
): Promise<PersonalizedSuggestion[]> {
  const suggestions: PersonalizedSuggestion[] = [];

  try {
    // 1. Personalized topics from Supabase RPC
    const { data: rows, error } = await supabase.rpc(
      'get_personalized_topics',
      { p_user_id: userId, p_limit: 10 },
    );

    if (!error && Array.isArray(rows) && rows.length > 0) {
      const dbRows = rows as {
        keyword:      string;
        raw_query:    string | null;
        score:        number;
        source:       SuggestionSource;
        last_seen_at: string;   // real ISO timestamp from DB
      }[];

      dbRows.forEach((row, idx) => {
        suggestions.push({
          id:          `${row.source}_${idx}`,
          keyword:     capitalizeKeyword(row.keyword),
          rawQuery:    row.raw_query ?? buildQueryFromKeyword(row.keyword),
          source:      row.source,
          score:       row.score,
          // ✅ Use the actual DB timestamp — this is what drives "X days ago"
          lastSeenAt:  row.last_seen_at,
          tag:         SOURCE_TAGS[row.source],
          icon:        SOURCE_ICONS[row.source],
          gradient:    GRADIENTS[idx % GRADIENTS.length],
        });
      });
    }

    // 2. AI follow-up angles from the user's most recent queries
    const recentItems = suggestions.filter(s => s.source === 'affinity' || s.source === 'recent');
    if (recentItems.length > 0) {
      const followUps = await generateFollowUpAngles(
        recentItems.slice(0, 2).map(s => s.rawQuery),
      );
      followUps.forEach((fu, idx) => {
        suggestions.push({
          id:            `followup_${idx}`,
          keyword:       fu.topic,
          rawQuery:      fu.query,
          source:        'followup',
          score:         1.2,
          // Follow-ups don't have a real last_seen_at — use now
          lastSeenAt:    new Date().toISOString(),
          tag:           SOURCE_TAGS.followup,
          icon:          SOURCE_ICONS.followup,
          gradient:      GRADIENTS[(idx + 5) % GRADIENTS.length],
          followUpAngle: fu.angle,
        });
      });
    }

    // 3. Pad with global trending if fewer than 6 suggestions
    if (suggestions.length < 6) {
      const { data: trending } = await supabase.rpc(
        'get_trending_topics',
        { p_limit: 8 },
      );
      if (Array.isArray(trending)) {
        const existingKeywords = new Set(
          suggestions.map(s => s.keyword.toLowerCase()),
        );
        (trending as { keyword: string; search_count: number; last_seen_at: string }[])
          .forEach((t, idx) => {
            if (!existingKeywords.has(t.keyword.toLowerCase())) {
              suggestions.push({
                id:          `trending_${idx}`,
                keyword:     capitalizeKeyword(t.keyword),
                rawQuery:    buildQueryFromKeyword(t.keyword),
                source:      'trending',
                score:       t.search_count / 100,
                lastSeenAt:  t.last_seen_at,
                tag:         SOURCE_TAGS.trending,
                icon:        SOURCE_ICONS.trending,
                gradient:    GRADIENTS[(idx + 2) % GRADIENTS.length],
              });
            }
          });
      }
    }
  } catch (err) {
    console.warn('[Personalization] fetch error:', err);
  }

  // Deduplicate by rawQuery, sort by score desc
  const seen = new Set<string>();
  return suggestions
    .filter(s => {
      const key = s.rawQuery.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ─── Post-research affinity update ───────────────────────────────────────────

export async function recordResearchCompletion(
  userId: string,
  report: ResearchReport,
): Promise<void> {
  try {
    const keywords = extractKeywords(report);
    if (keywords.length === 0) return;
    await supabase.rpc('upsert_topic_affinity', {
      p_user_id:   userId,
      p_keywords:  keywords,
      p_raw_query: report.query,
    });
  } catch (err) {
    console.warn('[Personalization] affinity update error:', err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalizeKeyword(kw: string): string {
  return kw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function buildQueryFromKeyword(kw: string): string {
  return `Latest trends and developments in ${capitalizeKeyword(kw)} 2025`;
}

function extractKeywords(report: ResearchReport): string[] {
  const candidates: string[] = [];
  // From query — bigrams
  const words = report.query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (let i = 0; i < words.length - 1 && candidates.length < 2; i++) {
    candidates.push(`${words[i]} ${words[i + 1]}`);
  }
  if (words.length > 0) candidates.push(words[0]);
  // From title
  const titleWords = report.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  titleWords.slice(0, 2).forEach(w => candidates.push(w));
  return [...new Set(candidates)].slice(0, 6).filter(k => k.length >= 3);
}

interface FollowUpAngle {
  topic: string;
  query: string;
  angle: string;
}

async function generateFollowUpAngles(recentQueries: string[]): Promise<FollowUpAngle[]> {
  if (recentQueries.length === 0) return [];
  try {
    const result = await chatCompletionJSON<{ angles: FollowUpAngle[] }>(
      [
        {
          role: 'system',
          content:
            'You are a research suggestion engine. Given recent research topics, ' +
            'suggest 2 highly relevant follow-up angles. Return JSON only.',
        },
        {
          role: 'user',
          content:
            `Recent research: ${recentQueries.slice(0, 3).join('; ')}\n\n` +
            'Return JSON: { "angles": [{ "topic": "Short topic name", "query": "Full research query", "angle": "Why this is a good follow-up in 1 sentence" }] }',
        },
      ],
      { temperature: 0.6, maxTokens: 400 },
    );
    return (result?.angles ?? []).slice(0, 2);
  } catch {
    return [];
  }
}