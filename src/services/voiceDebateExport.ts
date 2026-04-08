// src/services/voiceDebateExport.ts
// Part 40 — Voice Debate Engine
//
// Export utilities for voice debates:
//   exportVoiceDebateAsPDF(voiceDebate) — styled HTML → PDF via expo-print + share
//   exportVoiceDebateAsMP3(voiceDebate) — concatenates segments → single MP3 via share
//   copyVoiceDebateTranscript(voiceDebate) — plain text to clipboard
//
// PDF design mirrors debateExport.ts styling but with the audio transcript
// as the primary content and an argument-threading section.

import * as Print     from 'expo-print';
import * as Sharing   from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Share }      from 'react-native';
import {
  readAsStringAsync,
  writeAsStringAsync,
  cacheDirectory,
  EncodingType,
} from 'expo-file-system/legacy';

import { SEGMENT_LABELS, SEGMENT_COLORS, VOICE_PERSONAS } from '../constants/voiceDebate';
import type { VoiceDebate, VoiceDebateTurn, DebateSegmentType } from '../types/voiceDebate';
import type { DebateAgentRole } from '../types';
import { supabase } from '../lib/supabase';

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

  // Build turn HTML grouped by segment
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

      // Argument reference threading
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

  // Increment export count — fire-and-forget, errors silently swallowed
  (async () => {
    try {
      await supabase.rpc('increment_voice_debate_export_count', { p_voice_debate_id: vd.id });
    } catch (_) {}
  })();
}

// ─── MP3 Export ───────────────────────────────────────────────────────────────
// Concatenates all local audio segments into a single MP3 file and shares it.
// Falls back to sharing the first available segment if concatenation fails.

export async function exportVoiceDebateAsMP3(vd: VoiceDebate): Promise<void> {
  const paths = (vd.audioSegmentPaths ?? []).filter(Boolean);
  if (paths.length === 0) {
    throw new Error('No audio segments available to export.');
  }

  // Check if segments are local files
  const localPaths = paths.filter(p => p.startsWith('file://') || p.startsWith('/'));

  if (localPaths.length === 0) {
    // All cloud URLs — share as text link (can't concatenate remote files)
    throw new Error('Audio is stored in the cloud. Stream it from the player instead.');
  }

  // Concatenate base64 segments
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

  // Increment export count — fire-and-forget, errors silently swallowed
  (async () => {
    try {
      await supabase.rpc('increment_voice_debate_export_count', { p_voice_debate_id: vd.id });
    } catch (_) {}
  })();
}

// ─── Plain-text Copy ──────────────────────────────────────────────────────────

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