// src/services/podcastExport.ts
// Part 8 — Podcast export utilities: MP3, PDF, clipboard script copy.
//
// MP3 STRATEGY:
//   Each podcast turn is stored as a separate .mp3 file on device.
//   MP3 files are "frame-based" — concatenating their raw bytes produces a
//   valid playable file in all major media players (iTunes, VLC, Android Media).
//   We read every segment as Base64, decode to Uint8Array, concatenate, encode
//   back to Base64, write to a temp file, then share/delete.
//
// PDF STRATEGY:
//   Build a full HTML page of the script with speaker colours, then use
//   expo-print to render it as a PDF file and expo-sharing to share.
//
// SCRIPT COPY:
//   Build plain-text transcript and push to expo-clipboard.

import {
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
  getInfoAsync,
  deleteAsync,
  EncodingType,
}                        from 'expo-file-system/legacy';
import * as Print        from 'expo-print';
import * as Sharing      from 'expo-sharing';
import * as Clipboard    from 'expo-clipboard';
import { Podcast }       from '../types';

// ─── Binary helpers ───────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK  = 8192;
  let   binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...Array.from(slice));
  }
  return btoa(binary);
}

// ─── MP3 Export ───────────────────────────────────────────────────────────────

/**
 * Concatenate all available audio segments into a single .mp3 file and
 * open the native share sheet so the user can save / AirDrop / send it.
 *
 * The temp file is deleted after sharing regardless of whether the share
 * succeeded (the share sheet copies the file before returning).
 */
export async function exportPodcastAsMP3(podcast: Podcast): Promise<void> {
  const paths = (podcast.audioSegmentPaths ?? []).filter(Boolean);

  if (paths.length === 0) {
    throw new Error('No audio segments found for this episode.');
  }

  // ── Read all segments ──────────────────────────────────────────────────────

  const chunks: Uint8Array[] = [];

  for (const path of paths) {
    try {
      const info = await getInfoAsync(path);
      if (!info.exists) continue;

      const base64 = await readAsStringAsync(path, {
        encoding: EncodingType.Base64,
      });
      const bytes = base64ToUint8Array(base64);
      if (bytes.length > 0) chunks.push(bytes);
    } catch {
      // Skip unreadable / missing segment — non-fatal
    }
  }

  if (chunks.length === 0) {
    throw new Error(
      'Audio files could not be read. They may have been cleared by the OS. ' +
      'Try regenerating the podcast.'
    );
  }

  // ── Concatenate ────────────────────────────────────────────────────────────

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const combined    = new Uint8Array(totalLength);
  let   offset      = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // ── Write temp file ────────────────────────────────────────────────────────

  // Sanitise title for use in a filename
  const safeTitle  = podcast.title
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const outputPath = `${documentDirectory ?? ''}${safeTitle}_podcast.mp3`;

  await writeAsStringAsync(outputPath, uint8ArrayToBase64(combined), {
    encoding: EncodingType.Base64,
  });

  // ── Share ──────────────────────────────────────────────────────────────────

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error(
      'Sharing is not available on this device. ' +
      'The podcast file has been saved locally.'
    );
  }

  await Sharing.shareAsync(outputPath, {
    mimeType:    'audio/mpeg',
    dialogTitle: `Share: ${podcast.title}`,
    UTI:         'public.mp3',
  });

  // ── Cleanup temp file ──────────────────────────────────────────────────────
  // Share sheet has already copied the file, so it's safe to delete now.

  try {
    await deleteAsync(outputPath, { idempotent: true });
  } catch {
    // Non-fatal
  }
}

// ─── Script Copy ──────────────────────────────────────────────────────────────

/**
 * Build a readable plain-text transcript and copy it to the clipboard.
 * Returns the full text string so the caller can show a confirmation toast.
 */
export async function copyPodcastScriptToClipboard(podcast: Podcast): Promise<string> {
  const turns = podcast.script?.turns ?? [];

  const header =
    `${podcast.title}\n` +
    `${'─'.repeat(Math.min(podcast.title.length, 60))}\n\n` +
    `${podcast.description}\n\n` +
    `Hosts: ${podcast.config.hostName} (host) & ${podcast.config.guestName} (guest)\n` +
    `Duration: ~${Math.round(podcast.durationSeconds / 60)} min · ${turns.length} turns\n\n` +
    `${'─'.repeat(60)}\n\n`;

  const body = turns
    .map(t => `${t.speakerName.toUpperCase()}:\n${t.text}`)
    .join('\n\n');

  const footer =
    `\n\n${'─'.repeat(60)}\n` +
    `Generated by DeepDive AI`;

  const fullText = header + body + footer;

  await Clipboard.setStringAsync(fullText);
  return fullText;
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function buildPodcastHTML(podcast: Podcast): string {
  const turns    = podcast.script?.turns ?? [];
  const minutes  = Math.round(podcast.durationSeconds / 60);

  const turnsHTML = turns.map((turn, i) => {
    const isHost   = turn.speaker === 'host';
    const bgColor  = isHost ? '#f0eeff' : '#fff0f4';
    const barColor = isHost ? '#6C63FF' : '#FF6584';
    const nameColor = isHost ? '#6C63FF' : '#FF6584';

    return `
      <div class="turn" style="
        background:    ${bgColor};
        border-left:   4px solid ${barColor};
        border-radius: 10px;
        padding:       16px 18px;
        margin-bottom: 14px;
      ">
        <div class="speaker" style="
          color:       ${nameColor};
          font-size:   11px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 6px;
        ">
          ${turn.speakerName}
          <span style="
            color:       #aaa;
            font-weight: 400;
            font-size:   10px;
            margin-left: 6px;
            text-transform: none;
            letter-spacing: 0;
          ">
            Turn ${i + 1}
          </span>
        </div>
        <div class="text" style="
          font-size:   14px;
          line-height: 1.7;
          color:       #333;
        ">
          ${turn.text}
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${podcast.title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size:   14px;
    line-height: 1.6;
    color:       #1a1a2e;
    background:  #fff;
  }
  .cover {
    background: linear-gradient(135deg, #6C63FF 0%, #FF6584 100%);
    color:       white;
    padding:     52px 48px 44px;
  }
  .cover-label {
    font-size:     11px;
    font-weight:   700;
    letter-spacing: 2px;
    text-transform: uppercase;
    opacity:       0.75;
    margin-bottom: 14px;
    display:       flex;
    align-items:   center;
    gap:           6px;
  }
  .cover h1 {
    font-size:   28px;
    font-weight: 800;
    line-height: 1.3;
    margin-bottom: 14px;
  }
  .cover p {
    font-size:   15px;
    opacity:     0.88;
    line-height: 1.6;
    max-width:   560px;
    margin-bottom: 24px;
  }
  .cover-meta {
    display:     flex;
    gap:         18px;
    flex-wrap:   wrap;
    font-size:   12px;
    opacity:     0.78;
  }
  .cover-meta span {
    display:     flex;
    align-items: center;
    gap:         5px;
  }
  .stats-bar {
    display:         flex;
    background:      #f8f7ff;
    padding:         18px 48px;
    gap:             40px;
    border-bottom:   2px solid #ebe9ff;
  }
  .stat-item { text-align: center; }
  .stat-item .value {
    font-size:   20px;
    font-weight: 800;
    color:       #6C63FF;
  }
  .stat-item .label {
    font-size:      10px;
    color:          #999;
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-top:     2px;
  }
  .content { padding: 40px 48px; }
  .section-heading {
    font-size:      12px;
    font-weight:    700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color:          #6C63FF;
    margin-bottom:  20px;
    padding-bottom: 10px;
    border-bottom:  2px solid #ebe9ff;
  }
  .footer {
    background:  #f8f7ff;
    padding:     22px 48px;
    text-align:  center;
    font-size:   11px;
    color:       #bbb;
    border-top:  1px solid #ebe9ff;
    margin-top:  40px;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  <div class="cover">
    <div class="cover-label">🎙 DeepDive AI Podcast</div>
    <h1>${podcast.title}</h1>
    <p>${podcast.description}</p>
    <div class="cover-meta">
      <span>🎤 ${podcast.config.hostName} & ${podcast.config.guestName}</span>
      <span>⏱ ~${minutes} min</span>
      <span>💬 ${turns.length} turns</span>
      <span>📅 ${formatDate(podcast.createdAt)}</span>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-item">
      <div class="value">${minutes}</div>
      <div class="label">Minutes</div>
    </div>
    <div class="stat-item">
      <div class="value">${turns.length}</div>
      <div class="label">Turns</div>
    </div>
    <div class="stat-item">
      <div class="value">${podcast.script?.totalWords?.toLocaleString() ?? '—'}</div>
      <div class="label">Words</div>
    </div>
    <div class="stat-item">
      <div class="value">${turns.filter(t => t.speaker === 'host').length}</div>
      <div class="label">Host turns</div>
    </div>
    <div class="stat-item">
      <div class="value">${turns.filter(t => t.speaker === 'guest').length}</div>
      <div class="label">Guest turns</div>
    </div>
  </div>

  <div class="content">
    <div class="section-heading">Full Transcript</div>
    ${turnsHTML}
  </div>

  <div class="footer">
    Generated by DeepDive AI · ${formatDate(podcast.createdAt)} · deepdive.app
  </div>

</body>
</html>`;
}

/**
 * Render the podcast script as a styled PDF and open the native share sheet.
 */
export async function exportPodcastAsPDF(podcast: Podcast): Promise<void> {
  const html = buildPodcastHTML(podcast);

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: `Share Script: ${podcast.title}`,
      UTI:         'com.adobe.pdf',
    });
  }
}