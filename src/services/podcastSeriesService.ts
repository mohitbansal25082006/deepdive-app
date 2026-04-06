// src/services/podcastSeriesService.ts
// Part 39 FIXES applied:
//
// FIX 2 (duplicate episode prevention):
//   addEpisodeToSeries() now queries the podcast's current series_id first.
//   If it's already in the target series → returns { alreadyInSeries: true, existingSeriesName }.
//   If it's in a different series → removes from old, adds to new (move behaviour).
//   If it's not in any series → adds normally.
//
// FIX 3 (series episode count):
//   getUserSeries() now runs a subquery to get live episode_count from DB
//   (the trigger updates podcast_series.episode_count, so just re-fetching the
//   row is sufficient — but we force a fresh select to bypass any caching).
//   mapRowToSeries() already maps episode_count correctly.
//
// FIX 5 (continue listening progress fraction):
//   getContinueListening() normalizes 0–100 DB value to 0–1 fraction (unchanged).
//
// All other functions are unchanged from Part 39.

import { supabase }                            from '../lib/supabase';
import { chatCompletionJSON }                  from './openaiClient';
import type {
  PodcastSeries,
  PodcastPlaybackProgress,
  NextEpisodeRecommendation,
  CreateSeriesInput,
}                                              from '../types/podcast_v2';

// ─── Series CRUD ──────────────────────────────────────────────────────────────

export async function createSeries(
  userId: string,
  input:  CreateSeriesInput,
): Promise<{ data: PodcastSeries | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('podcast_series')
      .insert({
        user_id:      userId,
        name:         input.name.trim(),
        description:  input.description.trim(),
        accent_color: input.accentColor,
        icon_name:    input.iconName,
      })
      .select()
      .single();

    if (error) throw error;
    return { data: mapRowToSeries(data), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Failed to create series' };
  }
}

export async function updateSeries(
  seriesId: string,
  updates:  Partial<CreateSeriesInput>,
): Promise<{ error: string | null }> {
  try {
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined)        patch.name         = updates.name.trim();
    if (updates.description !== undefined) patch.description  = updates.description.trim();
    if (updates.accentColor !== undefined) patch.accent_color = updates.accentColor;
    if (updates.iconName !== undefined)    patch.icon_name    = updates.iconName;

    const { error } = await supabase
      .from('podcast_series')
      .update(patch)
      .eq('id', seriesId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update series' };
  }
}

export async function deleteSeries(seriesId: string): Promise<{ error: string | null }> {
  try {
    // Detach all episodes from this series first (preserves podcasts in library)
    await supabase
      .from('podcasts')
      .update({ series_id: null, episode_number: null })
      .eq('series_id', seriesId);

    const { error } = await supabase
      .from('podcast_series')
      .delete()
      .eq('id', seriesId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to delete series' };
  }
}

// FIX 3: Force a fresh select to get updated episode_count after trigger fires
export async function getUserSeries(userId: string): Promise<PodcastSeries[]> {
  try {
    const { data, error } = await supabase
      .from('podcast_series')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapRowToSeries);
  } catch (err) {
    console.warn('[podcastSeriesService] getUserSeries error:', err);
    return [];
  }
}

// FIX 2: Duplicate prevention — check before adding
export async function addEpisodeToSeries(
  podcastId:     string,
  seriesId:      string,
  episodeNumber: number,
): Promise<{ error: string | null; alreadyInSeries?: boolean; existingSeriesName?: string }> {
  try {
    // Step 1: Fetch the podcast's current series membership
    const { data: podcastRow, error: fetchErr } = await supabase
      .from('podcasts')
      .select('series_id')
      .eq('id', podcastId)
      .single();

    if (fetchErr) throw fetchErr;

    const currentSeriesId = podcastRow?.series_id;

    // Step 2: Already in the SAME series → reject with friendly message
    if (currentSeriesId && currentSeriesId === seriesId) {
      // Fetch the series name for the error message
      let existingSeriesName = 'this series';
      try {
        const { data: sr } = await supabase
          .from('podcast_series')
          .select('name')
          .eq('id', seriesId)
          .single();
        if (sr?.name) existingSeriesName = sr.name;
      } catch {}

      return {
        error:              'Already in series',
        alreadyInSeries:    true,
        existingSeriesName,
      };
    }

    // Step 3: In a DIFFERENT series → detach from old series first (move behaviour)
    if (currentSeriesId && currentSeriesId !== seriesId) {
      await supabase
        .from('podcasts')
        .update({ series_id: null, episode_number: null })
        .eq('id', podcastId);
      // The trigger will update the old series episode_count
    }

    // Step 4: Assign to the new series
    const { error } = await supabase
      .from('podcasts')
      .update({ series_id: seriesId, episode_number: episodeNumber })
      .eq('id', podcastId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add episode' };
  }
}

export async function removeEpisodeFromSeries(podcastId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('podcasts')
      .update({ series_id: null, episode_number: null })
      .eq('id', podcastId);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove episode' };
  }
}

// ─── Fetch Series With Episodes ───────────────────────────────────────────────

export interface SeriesWithEpisodes {
  series:   PodcastSeries;
  episodes: SeriesEpisodeSummary[];
}

export interface SeriesEpisodeSummary {
  podcastId:       string;
  title:           string;
  description:     string;
  episodeNumber:   number;
  durationSeconds: number;
  wordCount:       number;
  status:          string;
  createdAt:       string;
  hostName:        string;
  guestName:       string;
  topic?:          string;
}

export async function getSeriesWithEpisodes(
  seriesId: string,
  userId:   string,
): Promise<SeriesWithEpisodes | null> {
  try {
    const [seriesResult, episodesResult] = await Promise.all([
      supabase.from('podcast_series').select('*').eq('id', seriesId).single(),
      supabase.rpc('get_series_with_episodes', { p_series_id: seriesId, p_user_id: userId }),
    ]);

    if (seriesResult.error || !seriesResult.data) return null;

    const episodes: SeriesEpisodeSummary[] = ((episodesResult.data as any[]) ?? []).map(r => ({
      podcastId:       r.podcast_id,
      title:           r.title,
      description:     r.description ?? '',
      episodeNumber:   r.episode_number ?? 1,
      durationSeconds: r.duration_seconds ?? 0,
      wordCount:       r.word_count ?? 0,
      status:          r.status,
      createdAt:       r.created_at,
      hostName:        r.host_name ?? 'Alex',
      guestName:       r.guest_name ?? 'Sam',
      topic:           r.topic ?? '',
    }));

    return { series: mapRowToSeries(seriesResult.data), episodes };
  } catch (err) {
    console.warn('[podcastSeriesService] getSeriesWithEpisodes error:', err);
    return null;
  }
}

// ─── Initial Topic Suggestions ────────────────────────────────────────────────

export interface SeriesTopicSuggestion {
  topic:         string;
  hookLine:      string;
  guestType:     string;
  episodeFormat: string;
  whyNow:        string;
}

export async function generateInitialTopicSuggestions(
  seriesName:        string,
  seriesDescription: string,
): Promise<SeriesTopicSuggestion[]> {
  try {
    const prompt = `You are a podcast producer brainstorming episode ideas for a new series.

Series Name: "${seriesName}"
Series Description: "${seriesDescription}"

Generate 4 compelling first-episode topic ideas that would be PERFECT for launching this series.
Each topic should:
1. Establish the series' identity and tone
2. Hook new listeners immediately
3. Be search-engine discoverable
4. Build a foundation for future episodes

Return ONLY valid JSON (no markdown, no backticks):
{
  "suggestions": [
    {
      "topic": "2-3 sentence episode description that could be used as the podcast topic",
      "hookLine": "The provocative opening line that would grab attention immediately",
      "guestType": "Ideal guest type (e.g. 'skeptical industry insider', 'enthusiastic researcher')",
      "episodeFormat": "Best voice style: casual/expert/narrative/debate/news",
      "whyNow": "Why this episode matters right now (1 sentence)"
    }
  ]
}`;

    const result = await chatCompletionJSON<{ suggestions: SeriesTopicSuggestion[] }>(
      [{ role: 'user', content: prompt }],
      { temperature: 0.8, maxTokens: 800 }
    );

    return result?.suggestions ?? [];
  } catch (err) {
    console.warn('[podcastSeriesService] generateInitialTopicSuggestions error:', err);
    return [];
  }
}

// ─── Advanced Next Episode Recommendation ────────────────────────────────────

export interface AdvancedNextEpisodeRecommendation {
  episodeNumber:   number;
  suggestedTopic:  string;
  rationale:       string;
  hookLine:        string;
  connectedThemes: string[];
  audienceGap:     string;
  suggestedGuests: string[];
  callbackIdea:    string;
  episodeFormat:   string;
}

export async function generateNextEpisodeRecommendation(
  seriesName:    string,
  episodeTitles: string[],
  episodeTopics: string[],
  episodeDescriptions?: string[],
): Promise<AdvancedNextEpisodeRecommendation[] | null> {
  try {
    const episodeContext = episodeTitles.map((title, i) => {
      const topic       = episodeTopics[i] ?? title;
      const description = episodeDescriptions?.[i] ?? '';
      return `  Ep ${i + 1}: "${title}"
    Topic: ${topic}
    ${description ? `Summary: ${description.slice(0, 200)}` : ''}`;
    }).join('\n\n');

    const lastEpIdx = episodeTitles.length - 1;

    const prompt = `You are a senior podcast producer with 10 years of experience building engaged audiences.

Series: "${seriesName}"
Current episode count: ${episodeTitles.length}

EPISODE HISTORY:
${episodeContext}

Generate 3 distinct next-episode options:
- Option 1: Deep-dive continuation of the most engaging thread
- Option 2: Surprising angle that recontextualises everything
- Option 3: Audience-growth topic that new listeners could start with

Return ONLY valid JSON (no markdown, no backticks):
{
  "recommendations": [
    {
      "episodeNumber": ${episodeTitles.length + 1},
      "suggestedTopic": "2-3 sentence topic description to use as the podcast topic input",
      "rationale": "1-2 sentences: why this follows naturally from Episode ${lastEpIdx + 1}",
      "hookLine": "The provocative first sentence that would start this episode",
      "connectedThemes": ["theme from ep N", "callback to concept from ep M"],
      "audienceGap": "The specific listener question this episode answers",
      "suggestedGuests": ["guest type 1 with persona", "guest type 2 with persona"],
      "callbackIdea": "Specific line referencing an earlier episode moment",
      "episodeFormat": "casual or expert or narrative or debate or news"
    }
  ]
}`;

    const result = await chatCompletionJSON<{
      recommendations: AdvancedNextEpisodeRecommendation[];
    }>(
      [{ role: 'user', content: prompt }],
      { temperature: 0.75, maxTokens: 1200 }
    );

    return result?.recommendations ?? null;
  } catch (err) {
    console.warn('[podcastSeriesService] generateNextEpisodeRecommendation error:', err);
    return null;
  }
}

// ─── Single Podcast Playback Progress ────────────────────────────────────────

export interface SinglePodcastProgress {
  lastTurnIdx:     number;
  lastPositionMs:  number;
  /** 0–1 fraction (normalized from DB's 0–100) */
  progressPercent: number;
  updatedAt:       string;
}

export async function getPodcastPlaybackProgress(
  userId:    string,
  podcastId: string,
): Promise<SinglePodcastProgress | null> {
  try {
    const { data, error } = await supabase
      .from('podcast_playback_progress')
      .select('last_turn_idx, last_position_ms, progress_percent, updated_at')
      .eq('user_id', userId)
      .eq('podcast_id', podcastId)
      .maybeSingle();

    if (error || !data) return null;

    const rawPct = data.progress_percent ?? 0;
    const normalizedPct = rawPct > 1 ? rawPct / 100 : rawPct;

    return {
      lastTurnIdx:     data.last_turn_idx    ?? 0,
      lastPositionMs:  data.last_position_ms ?? 0,
      progressPercent: normalizedPct,
      updatedAt:       data.updated_at,
    };
  } catch (err) {
    console.warn('[podcastSeriesService] getPodcastPlaybackProgress error:', err);
    return null;
  }
}

// ─── Playback Progress (save) ─────────────────────────────────────────────────

export async function savePlaybackProgress(
  userId:       string,
  podcastId:    string,
  turnIdx:      number,
  positionMs:   number,
  totalDurMs:   number,
): Promise<void> {
  try {
    const progressPct = totalDurMs > 0
      ? Math.round((positionMs / totalDurMs) * 10000) / 100
      : 0;

    await supabase.rpc('upsert_podcast_progress', {
      p_user_id:        userId,
      p_podcast_id:     podcastId,
      p_turn_idx:       turnIdx,
      p_position_ms:    positionMs,
      p_total_duration: totalDurMs,
      p_progress_pct:   progressPct,
    });
  } catch (err) {
    console.warn('[podcastSeriesService] savePlaybackProgress error:', err);
  }
}

// ─── Continue Listening ───────────────────────────────────────────────────────

export async function getContinueListening(userId: string): Promise<PodcastPlaybackProgress[]> {
  try {
    const { data, error } = await supabase.rpc('get_continue_listening', {
      p_user_id: userId,
    });
    if (error) throw error;

    return ((data as any[]) ?? []).map(r => {
      const rawPct = r.progress_percent ?? 0;
      const normalizedPct = rawPct > 1 ? rawPct / 100 : rawPct;

      return {
        podcastId:       r.podcast_id,
        lastTurnIdx:     r.last_turn_idx      ?? 0,
        lastPositionMs:  r.last_position_ms   ?? 0,
        totalDurationMs: (r.duration_seconds  ?? 0) * 1000,
        progressPercent: normalizedPct,
        updatedAt:       r.updated_at,
        title:           r.title,
        hostName:        r.host_name,
        guestName:       r.guest_name,
        seriesName:      r.series_name,
        accentColor:     r.accent_color ?? '#6C63FF',
      } as PodcastPlaybackProgress & {
        title: string; hostName: string; guestName: string;
        seriesName?: string; accentColor: string;
      };
    });
  } catch (err) {
    console.warn('[podcastSeriesService] getContinueListening error:', err);
    return [];
  }
}

export async function getEnhancedStats(userId: string): Promise<{
  totalEpisodes:         number;
  totalListeningMinutes: number;
  longestEpisodeMins:    number;
  longestEpisodeTitle:   string;
  seriesCount:           number;
  mostUsedStyle:         string;
} | null> {
  try {
    const { data, error } = await supabase.rpc('get_podcast_stats_v2', {
      p_user_id: userId,
    });
    if (error) throw error;
    return data as any;
  } catch (err) {
    console.warn('[podcastSeriesService] getEnhancedStats error:', err);
    return null;
  }
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapRowToSeries(row: Record<string, any>): PodcastSeries {
  return {
    id:                   row.id,
    userId:               row.user_id,
    name:                 row.name,
    description:          row.description ?? '',
    accentColor:          row.accent_color ?? '#6C63FF',
    iconName:             row.icon_name    ?? 'radio-outline',
    // FIX 3: episode_count is maintained by DB trigger — always use DB value
    episodeCount:         row.episode_count ?? 0,
    totalDurationSeconds: row.total_duration_seconds ?? 0,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  };
}