// src/services/podcastSharingService.ts
// Part 15 UPDATED — Now uploads audio segments to Supabase Storage
// BEFORE inserting the shared_podcasts row, so workspace members on
// other devices can stream the audio via HTTPS URLs.
//
// KEY CHANGE from original:
//   sharePodcastToWorkspace() now:
//     1. Uploads all local audio segments to Supabase Storage.
//     2. Replaces local file:/// paths with signed Supabase URLs.
//     3. Calls share_podcast_to_workspace RPC with the cloud URLs.
//   This means the audio_segment_paths stored in shared_podcasts
//   are always HTTPS URLs, playable by any workspace member.

import { supabase }       from '../lib/supabase';
import {
  SharedPodcast,
  PodcastScript,
  Podcast,
} from '../types';
import {
  uploadPodcastAudioToStorage,
  UploadProgressCallback,
} from './podcastAudioUploadService';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapSharedPodcastRow(row: Record<string, unknown>): SharedPodcast {
  const get = (prefixed: string, plain: string) =>
    row[prefixed] !== undefined ? row[prefixed] : row[plain];

  return {
    id:                (get('out_id',                  'id'))                   as string,
    workspaceId:       (get('out_workspace_id',         'workspace_id'))         as string,
    podcastId:         (get('out_podcast_id',           'podcast_id'))           as string,
    sharedBy:          (get('out_shared_by',            'shared_by'))            as string,
    reportId:          (get('out_report_id',            'report_id') as string)  ?? undefined,
    title:             (get('out_title',                'title'))                as string,
    description:       ((get('out_description',         'description') as string) ?? ''),
    topic:             ((get('out_topic',               'topic') as string) ?? ''),
    hostName:          ((get('out_host_name',           'host_name') as string) ?? 'Alex'),
    guestName:         ((get('out_guest_name',          'guest_name') as string) ?? 'Sam'),
    durationSeconds:   ((get('out_duration_seconds',    'duration_seconds') as number) ?? 0),
    wordCount:         ((get('out_word_count',          'word_count') as number) ?? 0),
    completedSegments: ((get('out_completed_segments',  'completed_segments') as number) ?? 0),
    script:            (get('out_script',               'script') as PodcastScript)
                       ?? { turns: [], totalWords: 0, estimatedDurationMinutes: 0 },
    audioSegmentPaths: ((get('out_audio_segment_paths', 'audio_segment_paths') as string[]) ?? []),
    downloadCount:     ((get('out_download_count',      'download_count') as number) ?? 0),
    playCount:         ((get('out_play_count',          'play_count') as number) ?? 0),
    sharedAt:          (get('out_shared_at',            'shared_at'))            as string,
    sharerName:        ((get('out_sharer_name',         'sharer_name') as string) ?? undefined),
    sharerAvatar:      ((get('out_sharer_avatar',       'sharer_avatar') as string) ?? undefined),
  };
}

// ─── Load source podcast to get audio paths ───────────────────────────────────

async function getPodcastAudioPaths(
  podcastId: string,
): Promise<{ paths: string[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('podcasts')
      .select('audio_segment_paths, status')
      .eq('id', podcastId)
      .single();

    if (error) throw error;
    if (!data)  return { paths: [], error: 'Podcast not found' };

    const rawPaths = data.audio_segment_paths;
    let paths: string[] = [];

    if (Array.isArray(rawPaths)) {
      paths = rawPaths.filter(Boolean);
    } else if (typeof rawPaths === 'string') {
      try {
        const parsed = JSON.parse(rawPaths);
        paths = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        paths = [];
      }
    }

    return { paths, error: null };
  } catch (err) {
    return {
      paths: [],
      error: err instanceof Error ? err.message : 'Failed to load podcast',
    };
  }
}

// ─── Share a podcast into a workspace ────────────────────────────────────────
// Now uploads audio to Supabase Storage first so other devices can play it.

export async function sharePodcastToWorkspace(
  workspaceId:  string,
  podcastId:    string,
  reportId?:    string,
  onProgress?:  UploadProgressCallback,
): Promise<{ data: SharedPodcast | null; error: string | null }> {
  try {
    // ── Step 1: Get local audio paths from source podcast ──────────────────
    const { paths: localPaths, error: pathError } =
      await getPodcastAudioPaths(podcastId);

    if (pathError) {
      return { data: null, error: pathError };
    }

    // ── Step 2: Upload local segments to Supabase Storage ──────────────────
    let cloudPaths: (string | null)[] = localPaths.map(() => null);

    if (localPaths.length > 0) {
      onProgress?.({ uploaded: 0, total: localPaths.length, message: 'Uploading audio to cloud…' });

      const uploadResult = await uploadPodcastAudioToStorage(
        podcastId,
        localPaths,
        onProgress,
      );

      cloudPaths = uploadResult.uploadedUrls;

      // Require at least 50% of segments uploaded for a usable podcast
      if (uploadResult.successCount < Math.ceil(localPaths.length * 0.5)) {
        console.warn(
          `[sharePodcastToWorkspace] Only ${uploadResult.successCount}/${localPaths.length} ` +
          'segments uploaded — sharing anyway with partial audio.'
        );
      }
    }

    // ── Step 3: Update the shared_podcasts row via SECURITY DEFINER RPC ────
    // We pass the cloud URLs so the RPC stores them directly.
    // The RPC patch (schema_part15_patch3.sql) accepts an optional
    // p_audio_paths parameter to override the source podcast paths.

    onProgress?.({
      uploaded: localPaths.length,
      total:    localPaths.length,
      message:  'Saving to workspace…',
    });

    const { data, error } = await supabase.rpc('share_podcast_to_workspace', {
      p_workspace_id: workspaceId,
      p_podcast_id:   podcastId,
      p_report_id:    reportId ?? null,
      p_audio_paths:  cloudPaths.filter(Boolean) as string[],
    });

    if (error) {
      console.error('[sharePodcastToWorkspace] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    const row  = rows[0] ?? (data as Record<string, unknown>);
    if (!row) throw new Error('No data returned from share_podcast_to_workspace RPC');

    return { data: mapSharedPodcastRow(row), error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to share podcast';
    const cleaned = msg
      .replace('new row violates row-level security', 'Permission denied')
      .replace('duplicate key value violates unique constraint', 'Already shared to this workspace');
    return { data: null, error: cleaned };
  }
}

// ─── Remove shared podcast ────────────────────────────────────────────────────

export async function removeSharedPodcast(
  workspaceId: string,
  podcastId:   string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('remove_shared_podcast', {
      p_workspace_id: workspaceId,
      p_podcast_id:   podcastId,
    });

    if (error) {
      console.error('[removeSharedPodcast] RPC error:', error);
      throw error;
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove shared podcast' };
  }
}

// ─── Get all shared podcasts for a workspace ──────────────────────────────────

export async function getWorkspaceSharedPodcasts(
  workspaceId: string,
): Promise<{ data: SharedPodcast[]; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_workspace_shared_podcasts', {
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error('[getWorkspaceSharedPodcasts] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return { data: rows.map(mapSharedPodcastRow), error: null };
  } catch (err) {
    return {
      data:  [],
      error: err instanceof Error ? err.message : 'Failed to load shared podcasts',
    };
  }
}

// ─── Get a single shared podcast ─────────────────────────────────────────────

export async function getSharedPodcastForWorkspace(
  workspaceId: string,
  sharedId:    string,
): Promise<{ data: SharedPodcast | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_shared_podcast_for_workspace', {
      p_workspace_id: workspaceId,
      p_shared_id:    sharedId,
    });

    if (error) {
      console.error('[getSharedPodcastForWorkspace] RPC error:', error);
      throw error;
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    if (rows.length === 0) {
      return { data: null, error: 'Podcast not found or not shared to this workspace.' };
    }

    return { data: mapSharedPodcastRow(rows[0]), error: null };
  } catch (err) {
    return {
      data:  null,
      error: err instanceof Error ? err.message : 'Failed to load shared podcast',
    };
  }
}

// ─── Get workspace IDs a podcast is already shared to ────────────────────────

export async function getWorkspacesPodcastIsSharedTo(
  podcastId: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('get_workspaces_podcast_is_shared_to', {
      p_podcast_id: podcastId,
    });

    if (error) {
      console.warn('[getWorkspacesPodcastIsSharedTo] error:', error);
      return [];
    }

    const rows = (data as Record<string, unknown>[]) ?? [];
    return rows.map(r => (r.out_workspace_id ?? r.workspace_id) as string);
  } catch {
    return [];
  }
}

// ─── Track plays (fire-and-forget) ───────────────────────────────────────────

export function trackPodcastPlay(sharedId: string): void {
  supabase
    .rpc('increment_shared_podcast_plays', { p_shared_id: sharedId })
    .then(({ error }) => {
      if (error) console.warn('[trackPodcastPlay] error:', error.message);
    });
}

// ─── Track downloads ──────────────────────────────────────────────────────────

export async function trackPodcastDownload(sharedId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_shared_podcast_downloads', {
    p_shared_id: sharedId,
  });
  if (error) console.warn('[trackPodcastDownload] error:', error.message);
}

// ─── Convert SharedPodcast → Podcast (for reuse in usePodcastPlayer) ─────────

export function sharedPodcastToPodcast(sp: SharedPodcast): Podcast {
  return {
    id:                sp.podcastId,
    userId:            sp.sharedBy,
    reportId:          sp.reportId,
    title:             sp.title,
    description:       sp.description,
    topic:             sp.topic,
    script:            sp.script,
    config: {
      hostVoice:             'alloy',
      guestVoice:            'nova',
      hostName:              sp.hostName,
      guestName:             sp.guestName,
      targetDurationMinutes: Math.round(sp.durationSeconds / 60),
    },
    status:            'completed',
    completedSegments: sp.completedSegments,
    durationSeconds:   sp.durationSeconds,
    wordCount:         sp.wordCount,
    audioSegmentPaths: sp.audioSegmentPaths,
    exportCount:       sp.downloadCount,
    createdAt:         sp.sharedAt,
  };
}