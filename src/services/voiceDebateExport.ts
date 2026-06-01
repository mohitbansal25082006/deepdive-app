// src/services/voiceDebateExport.ts
// Part 40 + Part 44 UPDATE
//
// Part 44 addition:
//   exportVoiceDebateAsMP3FromCloud(vd, cloudUrls, onProgress)
//     Downloads cloud segments via voiceDebateAudioCache.downloadVoiceDebateAudio(),
//     then concatenates base64 and shares exactly like exportVoiceDebateAsMP3.
//     Used by workspace-shared-voice-debate-player.tsx where audioSegmentPaths
//     are https:// URLs that the original exportVoiceDebateAsMP3 cannot handle.
//
// All original Part 40 functions unchanged:
//   exportVoiceDebateAsPDF(voiceDebate)
//   exportVoiceDebateAsMP3(voiceDebate)
//   copyVoiceDebateTranscript(voiceDebate)
//   shareVoiceDebateText(voiceDebate)

import * as Print     from 'expo-print';
import * as Sharing   from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Share }      from 'react-native';
import {
  readAsStringAsync,
  writeAsStringAsync,
  cacheDirectory,
  getInfoAsync,
  EncodingType,
} from 'expo-file-system/legacy';

import { SEGMENT_LABELS, SEGMENT_COLORS, VOICE_PERSONAS } from '../constants/voiceDebate';
import type { VoiceDebate, VoiceDebateTurn, DebateSegmentType } from '../types/voiceDebate';
import type { DebateAgentRole } from '../types';
import { supabase } from '../lib/supabase';
import { downloadVoiceDebateAudio } from '../lib/voiceDebateAudioCache';

// ─── HTML escaping ────────────────────────────────────────────────────────────

function esc(text: string): string {
  return (text ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
    .replace(/\n/g, '<br/>');
}

// ─── PDF Builder ──────────────────────────────────────────────────────────────

function buildVoiceDebateHTML(vd: VoiceDebate): string {
  const turns    = vd.script?.turns   ?? [];
  const segments = vd.script?.segments ?? [];
  const genDate  = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const durationMin = Math.round(vd.durationSeconds / 60);

  const segmentGroups = segments.map(seg => {
    const segTurns  = turns.filter(
      t => t.turnIndex >= seg.startTurnIdx && t.turnIndex <= seg.endTurnIdx
    );
    const segColor  = SEGMENT_COLORS[seg.type] ?? '#6C63FF';

    const turnsHtml = segTurns.map(t => {
      const persona  = VOICE_PERSONAS[t.speaker as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];
      const isMod    = t.speaker === 'moderator';
      const confBadge = t.confidence
        ? `<span style="background:${persona.color}15;color:${persona.color};border:1px solid ${persona.color}30;border-radius:99px;font-size:9px;font-weight:700;padding:2px 8px;margin-left:6px;">${t.confidence}/10</span>`
        : '';

      const argRefHtml = t.argRef
        ? (() => {
            const targetPersona = VOICE_PERSONAS[t.argRef.targetAgentRole as DebateAgentRole] ?? VOICE_PERSONAS['moderator'];
            const refLabel = t.argRef.refType === 'challenges' ? '⚡ Challenges'
              : t.argRef.refType === 'concedes' ? '✓ Concedes to'
              : t.argRef.refType === 'agrees_with' ? '↑ Agrees with'
              : '→ Extends';
            return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="font-size:9px;font-weight:700;background:${targetPersona.color}18;color:${targetPersona.color};border-radius:6px;padding:2px 7px;">${refLabel} ${targetPersona.displayName}</span>
              <span style="font-size:9px;color:#999;">Turn ${t.argRef.targetTurnIdx + 1}</span>
            </div>`;
          })()
        : '';

      return `
      <div style="
        padding:14px 16px;margin-bottom:8px;
        border-radius:10px;
        background:${isMod ? '#F8F7FF' : persona.color + '08'};
        border-left:3px solid ${persona.color};
        border:1px solid ${persona.color}20;
      ">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${persona.color};flex-shrink:0;"></div>
          <span style="font-size:10px;font-weight:800;color:${persona.color};text-transform:uppercase;letter-spacing:0.5px;">${esc(persona.displayName)}</span>
          ${confBadge}
          <span style="margin-left:auto;font-size:9px;color:#bbb;">Turn ${t.turnIndex + 1}</span>
        </div>
        ${argRefHtml}
        <div style="font-size:12.5px;color:#333;line-height:1.7;">${esc(t.text)}</div>
      </div>`;
    }).join('');

    return `
    <div style="margin-bottom:28px;page-break-inside:avoid;">
      <div style="
        display:flex;align-items:center;gap:10px;
        padding:12px 16px;margin-bottom:16px;
        background:${segColor}12;border-radius:10px;
        border-left:4px solid ${segColor};
      ">
        <span style="font-size:11px;font-weight:800;color:${segColor};text-transform:uppercase;letter-spacing:1px;">
          ${esc(SEGMENT_LABELS[seg.type] ?? seg.type)}
        </span>
        <span style="font-size:10px;color:#aaa;margin-left:auto;">${segTurns.length} turns</span>
      </div>
      ${turnsHtml}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Voice Debate: ${esc(vd.topic)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;background:#FFF;color:#1A1A2E;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style>
</head>
<body>

<!-- COVER -->
<div style="background:linear-gradient(135deg,#6C63FF 0%,#9B59FF 50%,#FF6584 100%);color:#FFF;padding:52px 48px 44px;">
  <div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.7;margin-bottom:14px;">
    🎙 DeepDive AI · Voice Debate Transcript
  </div>
  <h1 style="font-size:26px;font-weight:800;line-height:1.3;margin-bottom:14px;max-width:600px;">
    ${esc(vd.topic)}
  </h1>
  <div style="background:rgba(255,255,255,.14);border-left:3px solid rgba(255,255,255,.6);border-radius:0 8px 8px 0;padding:12px 16px;font-size:13px;max-width:580px;margin-bottom:24px;opacity:.93;">
    ${esc(vd.question)}
  </div>
  <div style="display:flex;gap:20px;font-size:11.5px;opacity:.75;">
    <span>🎙 ${vd.totalTurns} turns</span>
    <span>⏱ ${durationMin} minutes</span>
    <span>📝 ${vd.wordCount.toLocaleString()} words</span>
    <span>🤖 7 AI voices</span>
  </div>
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.2);display:flex;justify-content:space-between;font-size:10px;opacity:.55;">
    <span>Generated by DeepDive AI</span>
    <span>${genDate}</span>
  </div>
</div>

<!-- TRANSCRIPT -->
<div style="padding:40px 48px;">
  <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#6C63FF;margin-bottom:24px;padding-bottom:10px;border-bottom:2px solid #EBE9FF;">
    🎙 Full Debate Transcript
  </div>
  ${segmentGroups}
</div>

<!-- FOOTER -->
<div style="background:#F8F7FF;padding:20px 48px;text-align:center;font-size:10px;color:#BBBBCC;border-top:1px solid #EBE9FF;">
  Generated by <strong style="color:#6C63FF;">DeepDive AI</strong> · Voice Debate Engine · ${genDate}
</div>

</body>
</html>`;
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

export async function exportVoiceDebateAsPDF(vd: VoiceDebate): Promise<void> {
  const html    = buildVoiceDebateHTML(vd);
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: `Voice Debate: ${vd.topic}`,
      UTI:         'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }

  (async () => {
    try {
      await supabase.rpc('increment_voice_debate_export_count', { p_voice_debate_id: vd.id });
    } catch (_) {}
  })();
}

// ─── MP3 Export (local files — used by normal voice-debate-player.tsx) ────────

export async function exportVoiceDebateAsMP3(vd: VoiceDebate): Promise<void> {
  const paths = (vd.audioSegmentPaths ?? []).filter(Boolean);
  if (paths.length === 0) {
    throw new Error('No audio segments available to export.');
  }

  const localPaths = paths.filter(p => p.startsWith('file://') || p.startsWith('/'));

  if (localPaths.length === 0) {
    throw new Error('Audio is stored in the cloud. Stream it from the player instead.');
  }

  let combinedBase64 = '';
  for (const path of localPaths) {
    try {
      const b64 = await readAsStringAsync(path, { encoding: EncodingType.Base64 as any });
      combinedBase64 += b64;
    } catch (err) {
      console.warn('[VoiceDebateExport] Skipping segment:', path, err);
    }
  }

  if (!combinedBase64) {
    throw new Error('Could not read audio segments from device.');
  }

  const outputPath = `${cacheDirectory}voice_debate_${vd.id.slice(0, 8)}.mp3`;
  await writeAsStringAsync(outputPath, combinedBase64, { encoding: EncodingType.Base64 as any });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(outputPath, {
      mimeType:    'audio/mpeg',
      dialogTitle: `Voice Debate: ${vd.topic}`,
      UTI:         'public.mp3',
    });
  }

  (async () => {
    try {
      await supabase.rpc('increment_voice_debate_export_count', { p_voice_debate_id: vd.id });
    } catch (_) {}
  })();
}

// ─── MP3 Export from Cloud (Part 44 — used by workspace shared voice debate player) ──
//
// HOW IT WORKS:
//   1. Uses downloadVoiceDebateAudio() from voiceDebateAudioCache to download all
//      cloud segments into documentDirectory/deepdive_voice_debate_cache/{id}/.
//      This re-uses the same cache that the normal player uses for offline playback,
//      so if the user has already streamed the debate, segments are already cached.
//   2. Reads each cached local file as base64 with readAsStringAsync.
//   3. Concatenates all base64 chunks into a single string.
//   4. Writes the combined base64 to cacheDirectory as a single .mp3 file.
//   5. Shares via expo-sharing — identical to exportVoiceDebateAsMP3.
//
// PROGRESS:
//   onProgress(downloaded, total) is called after each segment downloads so the
//   UI can show "Downloading 3/12…" in the share sheet.
//
// CACHE HIT:
//   If segments were already downloaded by voiceDebateAudioCache (e.g. the user
//   previously opened the player on this device), downloadVoiceDebateAudio skips
//   re-downloading existing files, so export is instant.

export async function exportVoiceDebateAsMP3FromCloud(
  vd:          VoiceDebate,
  cloudUrls:   string[],
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  const validUrls = cloudUrls.filter(
    u => typeof u === 'string' && u.startsWith('https://')
  );

  if (validUrls.length === 0) {
    throw new Error('No cloud audio URLs available to download.');
  }

  // ── Step 1: Download all segments via the audio cache ──────────────────────
  // downloadVoiceDebateAudio stores files at:
  //   documentDirectory/deepdive_voice_debate_cache/{voiceDebateId}/turn_{N}.mp3
  // It checks for existing files first so cache hits are free.

  let downloadedCount = 0;
  const total = validUrls.length;

  await downloadVoiceDebateAudio(
    vd.id,
    vd.topic,
    validUrls,
    (progress) => {
      // segmentsComplete is cumulative from the cache downloader
      const newCount = progress.segmentsComplete;
      if (newCount > downloadedCount) {
        downloadedCount = newCount;
        onProgress?.(downloadedCount, total);
      }
    },
    30, // 30-day cache expiry
  );

  // ── Step 2: Build local file paths for each downloaded segment ─────────────
  // Matches the path structure in voiceDebateAudioCache.ts: segmentPath()
  const safeId    = vd.id.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 60);
  const cacheBase = `${(await import('expo-file-system/legacy')).documentDirectory}deepdive_voice_debate_cache/${safeId}/`;

  const localPaths: string[] = [];
  for (let i = 0; i < validUrls.length; i++) {
    const localPath = `${cacheBase}turn_${i}.mp3`;
    try {
      const info = await getInfoAsync(localPath);
      if (info.exists && (info as any).size > 100) {
        localPaths.push(localPath);
      } else {
        console.warn(`[VoiceDebateExport] Cloud: segment ${i} not found after download`);
      }
    } catch {
      console.warn(`[VoiceDebateExport] Cloud: could not stat segment ${i}`);
    }
  }

  if (localPaths.length === 0) {
    throw new Error('Could not download any audio segments. Check your connection and try again.');
  }

  // ── Step 3: Concatenate base64 (identical to exportVoiceDebateAsMP3) ───────
  let combinedBase64 = '';
  for (const path of localPaths) {
    try {
      const b64 = await readAsStringAsync(path, { encoding: EncodingType.Base64 as any });
      combinedBase64 += b64;
    } catch (err) {
      console.warn(`[VoiceDebateExport] Cloud: skipping segment read error: ${path}`, err);
    }
  }

  if (!combinedBase64) {
    throw new Error('Could not read downloaded audio segments.');
  }

  // ── Step 4: Write concatenated file ────────────────────────────────────────
  const outputPath = `${cacheDirectory}voice_debate_ws_${vd.id.slice(0, 8)}.mp3`;
  await writeAsStringAsync(outputPath, combinedBase64, {
    encoding: EncodingType.Base64 as any,
  });

  // ── Step 5: Share via expo-sharing (identical to normal export) ────────────
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(outputPath, {
    mimeType:    'audio/mpeg',
    dialogTitle: `Voice Debate: ${vd.topic}`,
    UTI:         'public.mp3',
  });

  // Fire-and-forget export count increment (non-critical)
  (async () => {
    try {
      await supabase.rpc('increment_voice_debate_export_count', { p_voice_debate_id: vd.id });
    } catch (_) {}
  })();
}

// ─── Plain-text Transcript ────────────────────────────────────────────────────

function buildPlainTextTranscript(vd: VoiceDebate): string {
  const turns    = vd.script?.turns   ?? [];
  const segments = vd.script?.segments ?? [];
  const sep      = '─'.repeat(60);

  const header = [
    '🎙 VOICE DEBATE TRANSCRIPT — DeepDive AI',
    sep,
    `TOPIC:    ${vd.topic}`,
    `QUESTION: ${vd.question}`,
    `TURNS:    ${vd.totalTurns}  |  DURATION: ~${Math.round(vd.durationSeconds / 60)} min  |  WORDS: ${vd.wordCount}`,
    sep,
  ].join('\n');

  const body = segments.map(seg => {
    const segTurns = turns.filter(
      t => t.turnIndex >= seg.startTurnIdx && t.turnIndex <= seg.endTurnIdx
    );
    const label = SEGMENT_LABELS[seg.type] ?? seg.type;

    const turnsText = segTurns.map(t => {
      const persona = VOICE_PERSONAS[t.speaker as DebateAgentRole | 'moderator'] ?? VOICE_PERSONAS['moderator'];
      const conf    = t.confidence ? ` [${t.confidence}/10]` : '';
      const argRef  = t.argRef
        ? ` (${t.argRef.refType === 'challenges' ? 'Challenges' : 'Responds to'} ${VOICE_PERSONAS[t.argRef.targetAgentRole as DebateAgentRole]?.displayName ?? t.argRef.targetAgentRole})`
        : '';
      return `${persona.displayName.toUpperCase()}${conf}${argRef}:\n  ${t.text}`;
    }).join('\n\n');

    return `\n${label.toUpperCase()}\n${sep}\n${turnsText}`;
  }).join(`\n\n${sep}\n`);

  const footer = `\n\n${sep}\nGenerated by DeepDive AI · ${new Date().toLocaleDateString()}\n${sep}`;

  return [header, body, footer].join('\n');
}

export async function copyVoiceDebateTranscript(vd: VoiceDebate): Promise<void> {
  const text = buildPlainTextTranscript(vd);
  await Clipboard.setStringAsync(text);
}

export async function shareVoiceDebateText(vd: VoiceDebate): Promise<void> {
  const text = buildPlainTextTranscript(vd);
  await Share.share(
    { message: text, title: `Voice Debate: ${vd.topic}` },
    { dialogTitle: `Share voice debate: ${vd.topic}` },
  );
}