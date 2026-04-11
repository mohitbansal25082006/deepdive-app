// src/services/slideCaptureExport.ts
// Part 41.6 — Screenshot-based export
//
// Flow:
//   1. captureSlides(refs[])           — react-native-view-shot → base64 JPEG per slide
//   2. generatePPTXFromImages(...)      — PPTX with full-bleed slide screenshots
//   3. exportAsSlidePDFFromImages(...)  — PDF with 1 slide per page, zero padding
//   4. buildSlideHTMLFromImages(...)    — interactive HTML viewer
// ─────────────────────────────────────────────────────────────────────────────

import { RefObject } from 'react';
import { Platform } from 'react-native';
import {
  documentDirectory,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import pptxgen      from 'pptxgenjs';

import type { GeneratedPresentation } from '../types';

// ─── Slide dimensions ─────────────────────────────────────────────────────────

/** Pixel size of each SlideCard captured off-screen. 2× for retina quality. */
export const CAPTURE_SCALE = 2;
export const CAPTURE_W     = 320 * CAPTURE_SCALE; // 640
export const CAPTURE_H     = 180 * CAPTURE_SCALE; // 360

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60);
}

function stripDataPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

// ─── Capture ──────────────────────────────────────────────────────────────────

/**
 * Capture a single React Native View ref as a base64 JPEG.
 *
 * WHY JPEG NOT PNG:
 *   jsPDF (and its dependency fast-png) calls new TextDecoder('latin1') at
 *   module load time. Expo/Hermes TextDecoder only supports UTF-8, so the
 *   entire app crashes with RangeError before any code runs.
 *   Our self-contained PDF builder uses ASCIIHexDecode+DCTDecode to embed
 *   JPEGs directly — it never calls TextDecoder at all.
 *   JPEG at quality 0.92 is visually lossless for slide screenshots and
 *   produces smaller files than PNG.
 */
export async function captureViewAsBase64(
  viewRef: RefObject<any>,
): Promise<string | null> {
  if (!viewRef.current) return null;
  try {
    const { captureRef } = await import('react-native-view-shot');
    const uri = await captureRef(viewRef, {
      format:  'jpg',
      quality: 0.92,
      result:  'base64',
      width:   CAPTURE_W,
      height:  CAPTURE_H,
    });
    return `data:image/jpeg;base64,${uri}`;
  } catch (err) {
    console.warn('[slideCaptureExport] captureRef failed:', err);
    return null;
  }
}

/** Capture all slide refs in order. */
export async function captureAllSlides(
  refs: RefObject<any>[],
): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  for (const ref of refs) {
    results.push(await captureViewAsBase64(ref));
  }
  return results;
}

// ─── PPTX from images ────────────────────────────────────────────────────────

export async function generatePPTXFromImages(
  images:       (string | null)[],
  presentation: GeneratedPresentation,
): Promise<void> {
  const pres = new pptxgen();
  pres.layout  = 'LAYOUT_16x9';
  pres.author  = 'DeepDive AI';
  pres.company = 'DeepDive AI';
  pres.title   = presentation.title;
  pres.subject = presentation.subtitle;

  const { generatePPTX: vectorPPTX } = await import('./pptxExport');

  for (let i = 0; i < presentation.slides.length; i++) {
    const slide   = pres.addSlide();
    const imgData = images[i];

    if (imgData) {
      slide.addImage({ data: imgData, x: 0, y: 0, w: '100%', h: '100%' });
    } else {
      const t = presentation.themeTokens;
      slide.background = { color: (t?.background ?? '#0A0A1A').replace('#', '') };
      const s = presentation.slides[i];
      if (s?.title) {
        slide.addText(s.title, {
          x: 0.5, y: 1.5, w: 9, h: 2,
          fontSize: 28, bold: true,
          color: (t?.textPrimary ?? 'FFFFFF').replace('#', ''),
          align: 'center', valign: 'middle',
          fontFace: 'Arial',
        });
      }
    }
  }

  const base64   = await pres.write({ outputType: 'base64' }) as string;
  const fileName = `${safeFileName(presentation.title)}_slides.pptx`;
  const fileUri  = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType:    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      dialogTitle: `Share: ${presentation.title}`,
      UTI:         'com.microsoft.powerpoint.pptx',
    });
  }
}

// ─── Self-contained PDF builder ───────────────────────────────────────────────
//
// WHY NO LIBRARY:
//   • expo-print: width/height params silently ignored on iOS (expo/expo#16052);
//     WebKit always uses Letter page → black strips on right and bottom.
//   • jsPDF: imports fast-png which calls new TextDecoder('latin1') at module
//     load time → RangeError crashes the whole app before any code runs.
//
// SOLUTION — write the PDF bytes ourselves:
//   A PDF with full-page JPEG images is a very simple format. JPEG bytes are
//   hex-encoded (ASCIIHexDecode filter), so the entire PDF is ASCII text.
//   We build it as a string, track xref byte offsets, and write with UTF-8.
//   Zero external dependencies. Zero Hermes compatibility issues.
//
// PDF object layout per slide i (0-indexed):
//   obj (3 + i*3) → Page
//   obj (4 + i*3) → Content stream  "q W 0 0 H 0 0 cm /Im0 Do Q"
//   obj (5 + i*3) → Image XObject   JPEG via [/ASCIIHexDecode /DCTDecode]

function buildImagePDF(params: {
  images:  (string | null)[];  // data:image/jpeg;base64,... per slide
  pageW:   number;              // PDF page width  in points (1280)
  pageH:   number;              // PDF page height in points (720)
  imgW:    number;              // actual JPEG pixel width  (CAPTURE_W = 640)
  imgH:    number;              // actual JPEG pixel height (CAPTURE_H = 360)
  bgColor: string;              // fallback bg hex e.g. '#0A0A1A'
}): string {
  const { images, pageW, pageH, imgW, imgH, bgColor } = params;
  const n = images.length;

  // ── Helpers ─────────────────────────────────────────────────────────────

  const stripPrefix = (d: string) => {
    const i = d.indexOf(',');
    return i >= 0 ? d.slice(i + 1) : d;
  };

  // base64 → hex stream.  atob() returns a binary string (charCode = byte value).
  // Each byte → 2 hex chars.  Terminated with '>' (PDF ASCIIHexDecode sentinel).
  const b64ToHexStream = (b64: string): string => {
    const bin = atob(b64);
    let hex = '';
    for (let i = 0; i < bin.length; i++) {
      hex += ('0' + bin.charCodeAt(i).toString(16)).slice(-2);
    }
    return hex + '>';
  };

  // '#RRGGBB' → 'R.RRR G.GGG B.BBB' for PDF colour operators
  const hexToRgbPDF = (hex: string): string => {
    const h = hex.replace('#', '');
    const r = (parseInt(h.slice(0, 2), 16) / 255).toFixed(3);
    const g = (parseInt(h.slice(2, 4), 16) / 255).toFixed(3);
    const b = (parseInt(h.slice(4, 6), 16) / 255).toFixed(3);
    return `${r} ${g} ${b}`;
  };

  // ── Build PDF ────────────────────────────────────────────────────────────

  // Object count: obj0(free) + obj1(catalog) + obj2(pages) + n×3(page+content+image)
  const xrefCount = 3 + n * 3;
  const offsets   = new Array<number>(xrefCount).fill(0);
  const parts: string[] = [];
  let pos = 0;

  // All chars are ASCII → s.length === byte count → offsets are exact
  const emit = (s: string) => { parts.push(s); pos += s.length; };

  emit('%PDF-1.4\n');

  // obj 1: Catalog
  offsets[1] = pos;
  emit('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // obj 2: Pages
  const kidsRef = images.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  offsets[2] = pos;
  emit(`2 0 obj\n<< /Type /Pages /Kids [${kidsRef}] /Count ${n} >>\nendobj\n`);

  // Per-slide objects
  for (let i = 0; i < n; i++) {
    const pageId    = 3 + i * 3;
    const contentId = 4 + i * 3;
    const imageId   = 5 + i * 3;
    const imgData   = images[i];

    if (imgData) {
      // PDF graphics: "q W 0 0 H 0 0 cm /Im0 Do Q"
      // The cm matrix [W 0 0 H 0 0] scales the unit-square image to pageW×pageH.
      const cs     = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q\n`;
      const hexImg = b64ToHexStream(stripPrefix(imgData));

      offsets[pageId] = pos;
      emit(
        `${pageId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}]\n` +
        `   /Contents ${contentId} 0 R\n` +
        `   /Resources << /XObject << /Im0 ${imageId} 0 R >> >> >>\n` +
        `endobj\n`,
      );

      offsets[contentId] = pos;
      emit(
        `${contentId} 0 obj\n<< /Length ${cs.length} >>\n` +
        `stream\n${cs}endstream\nendobj\n`,
      );

      // /Width & /Height must be the actual JPEG pixel dimensions, not the page size.
      // The content stream's cm operator handles the scaling to page size.
      offsets[imageId] = pos;
      emit(
        `${imageId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image\n` +
        `   /Width ${imgW} /Height ${imgH}\n` +
        `   /ColorSpace /DeviceRGB /BitsPerComponent 8\n` +
        `   /Filter [/ASCIIHexDecode /DCTDecode] /Length ${hexImg.length} >>\n` +
        `stream\n${hexImg}\nendstream\nendobj\n`,
      );
    } else {
      // Fallback: solid colour background (no image for this slide)
      const rgb = hexToRgbPDF(bgColor);
      const cs  = `${rgb} rg\n0 0 ${pageW} ${pageH} re f\n`;

      offsets[pageId] = pos;
      emit(
        `${pageId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}]\n` +
        `   /Contents ${contentId} 0 R /Resources << >> >>\n` +
        `endobj\n`,
      );

      offsets[contentId] = pos;
      emit(`${contentId} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}endstream\nendobj\n`);

      offsets[imageId] = pos;
      emit(`${imageId} 0 obj\n<< >>\nendobj\n`);  // unreferenced placeholder
    }
  }

  // xref table — each entry must be exactly 20 bytes (10-digit offset, space,
  // 5-digit generation, space, 'n'/'f', space, newline)
  const xrefPos = pos;
  emit(`xref\n0 ${xrefCount}\n`);
  emit('0000000000 65535 f \n');  // obj 0: always free
  for (let id = 1; id < xrefCount; id++) {
    emit(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  emit(`trailer\n<< /Size ${xrefCount} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  return parts.join('');
}

// ─── PDF from images ─────────────────────────────────────────────────────────

/**
 * Export slides as PDF — 1 full-bleed slide per page, zero padding.
 *
 * Uses the self-contained buildImagePDF() above.
 * No jsPDF, no expo-print, no external libs. Works with Hermes on iOS + Android.
 */
export async function exportAsSlidePDFFromImages(
  images:       (string | null)[],
  presentation: GeneratedPresentation,
): Promise<void> {
  const PAGE_W = 1280;
  const PAGE_H = 720;

  const pdfText = buildImagePDF({
    images,
    pageW:   PAGE_W,
    pageH:   PAGE_H,
    imgW:    CAPTURE_W,   // 640 — actual JPEG pixel width from captureRef
    imgH:    CAPTURE_H,   // 360 — actual JPEG pixel height from captureRef
    bgColor: presentation.themeTokens?.background ?? '#0A0A1A',
  });

  const fileName = `${safeFileName(presentation.title)}_slides.pdf`;
  const fileUri  = `${documentDirectory}${fileName}`;

  // pdfText is pure ASCII → UTF-8 writes the correct bytes with no conversion.
  await writeAsStringAsync(fileUri, pdfText, { encoding: EncodingType.UTF8 });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType:    'application/pdf',
      dialogTitle: `Share: ${presentation.title}`,
      UTI:         'com.adobe.pdf',
    });
  }
}

// ─── Interactive HTML from images ─────────────────────────────────────────────

export function buildSlideHTMLFromImages(
  images:       (string | null)[],
  presentation: GeneratedPresentation,
): string {
  const t      = presentation.themeTokens;
  const TOTAL  = presentation.totalSlides;
  const ac     = t?.primary ?? '#6C63FF';
  const slideMeta = JSON.stringify(
    presentation.slides.map(s => ({ notes: s.speakerNotes ?? '', title: s.title, layout: s.layout }))
  );

  const framesHTML = presentation.slides.map((s, i) => {
    const imgData = images[i];
    if (imgData) {
      return `<div class="slide-frame" data-idx="${i}"><img src="${imgData}" style="width:1280px;height:720px;display:block;object-fit:contain" /></div>`;
    }
    const bg = t?.background ?? '#0A0A1A';
    const fg = t?.textPrimary ?? '#FFFFFF';
    return `<div class="slide-frame" data-idx="${i}" style="background:${bg};display:flex;align-items:center;justify-content:center"><p style="color:${fg};font-size:28px;font-weight:700;font-family:Arial,sans-serif;text-align:center;padding:40px">${s.title ?? ''}</p></div>`;
  }).join('\n');

  const thumbsHTML = presentation.slides.map((s, i) => {
    const imgData = images[i];
    const bg = t?.background ?? '#0A0A1A';
    const inner = imgData
      ? `<img src="${imgData}" style="width:1280px;height:720px;display:block;object-fit:contain" />`
      : `<div style="width:100%;height:100%;background:${bg};display:flex;align-items:center;justify-content:center"><span style="color:${t?.textMuted ?? '#5A5A7A'};font-size:10px;font-family:Arial">${s.title ?? ''}</span></div>`;
    return `<div class="thumb-wrap${i===0?' active':''}" data-idx="${i}" onclick="goTo(${i})"><div class="thumb-clip"><div class="thumb-slide">${inner}</div></div><div class="thumb-label">${i+1}</div></div>`;
  }).join('\n');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><title>${presentation.title}</title>
<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}html,body{width:100%;height:100%;overflow:hidden;background:#04040E;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#FFF;-webkit-font-smoothing:antialiased;}#app{display:flex;flex-direction:column;height:100vh;}#topbar{flex-shrink:0;display:flex;align-items:center;gap:8px;height:44px;padding:0 12px;background:rgba(5,5,20,0.96);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(16px);z-index:30;}#tb-title{flex:1;min-width:0;}#tb-title h1{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#FFF;}#tb-title p{font-size:10px;color:rgba(255,255,255,0.45);margin-top:1px;}.tb-btn{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:7px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;}.tb-btn:hover{background:rgba(255,255,255,0.1);color:#FFF;}.tb-btn.on{background:${ac}20;border-color:${ac}55;color:${ac};}.tb-sep{width:1px;height:22px;background:rgba(255,255,255,0.09);margin:0 2px;}#prog-track{flex-shrink:0;height:3px;background:rgba(255,255,255,0.06);}#prog-fill{height:100%;background:${ac};border-radius:0 2px 2px 0;width:0;transition:width 0.35s;}#main{flex:1;display:flex;overflow:hidden;min-height:0;}#sidebar{flex-shrink:0;width:140px;overflow-y:auto;overflow-x:hidden;background:rgba(5,5,20,0.9);border-right:1px solid rgba(255,255,255,0.07);padding:10px 8px;display:flex;flex-direction:column;gap:6px;transition:width 0.25s,padding 0.25s,opacity 0.25s;}#sidebar.closed{width:0;padding:0;opacity:0;pointer-events:none;}.thumb-wrap{flex-shrink:0;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color 0.18s,transform 0.15s;}.thumb-wrap:hover{transform:scale(1.025);border-color:rgba(255,255,255,0.25);}.thumb-wrap.active{border-color:${ac};box-shadow:0 0 12px ${ac}50;}.thumb-clip{width:124px;height:70px;overflow:hidden;position:relative;}.thumb-slide{width:1280px;height:720px;transform:scale(0.097);transform-origin:top left;pointer-events:none;}.thumb-label{font-size:9px;font-weight:600;color:rgba(255,255,255,0.45);text-align:center;padding:2px 0 3px;background:rgba(0,0,0,0.5);}#stage-wrap{flex:1;display:flex;align-items:center;justify-content:center;background:#04040E;overflow:hidden;min-width:0;position:relative;padding:16px;}#stage{position:relative;border-radius:10px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.07);}#track{display:flex;position:absolute;top:0;left:0;height:720px;transition:transform 0.38s cubic-bezier(0.4,0,0.2,1);will-change:transform;}.slide-frame{flex-shrink:0;width:1280px;height:720px;position:relative;overflow:hidden;background:#04040E;}.nav-btn{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border-radius:50%;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.14);color:rgba(255,255,255,0.85);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;opacity:0;pointer-events:none;transition:opacity 0.2s,background 0.18s;}#stage-wrap:hover .nav-btn{opacity:1;pointer-events:all;}#stage-wrap .nav-btn:hover{background:${ac};border-color:${ac};}.nav-btn:disabled{opacity:0!important;pointer-events:none!important;}#nav-prev{left:10px;}#nav-next{right:10px;}#notes-panel{flex-shrink:0;overflow:hidden;background:rgba(8,8,24,0.97);border-top:1px solid rgba(255,255,255,0.07);height:0;transition:height 0.26s;}#notes-panel.open{height:108px;}#notes-inner{padding:10px 16px;height:100%;display:flex;flex-direction:column;gap:5px;}#notes-lbl{font-size:10px;font-weight:700;color:${ac};letter-spacing:1.2px;text-transform:uppercase;}#notes-body{font-size:12px;color:rgba(255,255,255,0.65);line-height:1.6;flex:1;overflow-y:auto;}#botbar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;height:46px;padding:0 12px;background:rgba(5,5,20,0.97);border-top:1px solid rgba(255,255,255,0.07);}.bot-nav{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.7);font-size:12px;font-weight:700;cursor:pointer;}.bot-nav:hover:not(:disabled){background:rgba(255,255,255,0.1);color:#FFF;}.bot-nav:disabled{opacity:0.25;cursor:default;}#dot-strip{display:flex;align-items:center;gap:4px;}.dot{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,0.18);cursor:pointer;transition:width 0.22s,background 0.22s;}.dot.on{width:18px;background:${ac};}#counter{font-size:12px;font-weight:800;color:${ac};background:${ac}1A;border:1px solid ${ac}35;border-radius:7px;padding:4px 12px;min-width:64px;text-align:center;}#layout-tag{font-size:10px;color:rgba(255,255,255,0.4);background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:3px 9px;}</style>
</head><body><div id="app"><div id="topbar"><button class="tb-btn on" id="btn-sidebar">&#9776;&nbsp;Slides</button><div class="tb-sep"></div><div id="tb-title"><h1>${presentation.title}</h1><p>${TOTAL} slides &middot; screenshot export</p></div><div class="tb-sep"></div><button class="tb-btn" id="btn-notes">&#128196;&nbsp;Notes</button><button class="tb-btn" onclick="window.print()">&#128438;&nbsp;Print</button><button class="tb-btn" id="btn-fs">&#x26F6;&nbsp;Full</button></div><div id="prog-track"><div id="prog-fill"></div></div><div id="main"><div id="sidebar">${thumbsHTML}</div><div id="stage-wrap"><button class="nav-btn" id="nav-prev" onclick="prev()" disabled>&#8249;</button><div id="stage"><div id="track">${framesHTML}</div></div><button class="nav-btn" id="nav-next" onclick="next()">&#8250;</button></div></div><div id="notes-panel"><div id="notes-inner"><div id="notes-lbl">&#127908;&nbsp;Speaker Notes</div><div id="notes-body">No notes.</div></div></div><div id="botbar"><button class="bot-nav" id="bb-prev" onclick="prev()" disabled>&#8592; Prev</button><div id="dot-strip"></div><div id="layout-tag"></div><div id="counter">1 / ${TOTAL}</div><button class="bot-nav" id="bb-next" onclick="next()">Next &#8594;</button></div></div>
<script>(function(){var META=${slideMeta},TOTAL=${TOTAL},current=0,sidebarOpen=true,notesOpen=false,SCALE=1;var stageWrap=document.getElementById('stage-wrap'),stage=document.getElementById('stage'),track=document.getElementById('track'),progFill=document.getElementById('prog-fill'),counter=document.getElementById('counter'),dotStrip=document.getElementById('dot-strip'),notesPan=document.getElementById('notes-panel'),notesBody=document.getElementById('notes-body'),layoutTag=document.getElementById('layout-tag'),sidebar=document.getElementById('sidebar'),thumbs=document.querySelectorAll('.thumb-wrap'),bbPrev=document.getElementById('bb-prev'),bbNext=document.getElementById('bb-next'),navPrev=document.getElementById('nav-prev'),navNext=document.getElementById('nav-next');var LL={title:'Title',agenda:'Agenda',section:'Section',content:'Content',bullets:'Key Points',stats:'Statistics',quote:'Pull Quote',chart_ref:'Chart',predictions:'Outlook',references:'References',closing:'Closing'};function scale(){var aw=stageWrap.clientWidth-32,ah=stageWrap.clientHeight-32;SCALE=Math.min(aw/1280,ah/720);var sw=Math.floor(1280*SCALE),sh=Math.floor(720*SCALE);stage.style.width=sw+'px';stage.style.height=sh+'px';track.style.width=(1280*TOTAL)+'px';track.style.height='720px';track.style.transformOrigin='top left';var p=track.style.transition;track.style.transition='none';applyT();requestAnimationFrame(function(){requestAnimationFrame(function(){track.style.transition=p;});});}function applyT(){track.style.transform='scale('+SCALE+') translateX('+(-current*1280)+'px)';}function goTo(idx){current=Math.max(0,Math.min(idx,TOTAL-1));track.style.transition='transform 0.38s cubic-bezier(0.4,0,0.2,1)';applyT();refresh();}function next(){goTo(current+1);}function prev(){goTo(current-1);}function refresh(){progFill.style.width=((current+1)/TOTAL*100)+'%';counter.textContent=(current+1)+' / '+TOTAL;var lay=(META[current]||{}).layout||'';layoutTag.textContent=LL[lay]||lay;dotStrip.innerHTML='';if(TOTAL<=15){for(var i=0;i<TOTAL;i++){var d=document.createElement('div');d.className='dot'+(i===current?' on':'');(function(ii){d.onclick=function(){goTo(ii);};})(i);dotStrip.appendChild(d);}}notesBody.textContent=(META[current]||{}).notes||'No notes.';thumbs.forEach(function(th,i){th.classList.toggle('active',i===current);if(i===current)th.scrollIntoView({block:'nearest',behavior:'smooth'});});bbPrev.disabled=current===0;bbNext.disabled=current===TOTAL-1;navPrev.disabled=current===0;navNext.disabled=current===TOTAL-1;}document.getElementById('btn-sidebar').onclick=function(){sidebarOpen=!sidebarOpen;sidebar.classList.toggle('closed',!sidebarOpen);document.getElementById('btn-sidebar').classList.toggle('on',sidebarOpen);setTimeout(scale,270);};document.getElementById('btn-notes').onclick=function(){notesOpen=!notesOpen;notesPan.classList.toggle('open',notesOpen);document.getElementById('btn-notes').classList.toggle('on',notesOpen);setTimeout(scale,290);};document.getElementById('btn-fs').onclick=function(){if(!document.fullscreenElement)(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen).call(document.documentElement);else(document.exitFullscreen||document.webkitExitFullscreen).call(document);};document.addEventListener('fullscreenchange',function(){setTimeout(scale,100);});document.addEventListener('webkitfullscreenchange',function(){setTimeout(scale,100);});document.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '){e.preventDefault();next();}else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();prev();}else if(e.key==='Home'){e.preventDefault();goTo(0);}else if(e.key==='End'){e.preventDefault();goTo(TOTAL-1);}});var tx0=0;stage.addEventListener('touchstart',function(e){tx0=e.touches[0].clientX;},{passive:true});stage.addEventListener('touchend',function(e){var dx=e.changedTouches[0].clientX-tx0;if(Math.abs(dx)>45){dx<0?next():prev();}});window.addEventListener('resize',scale);scale();refresh();window.goTo=goTo;window.next=next;window.prev=prev;})();</script></body></html>`;
}

// ─── Convenience: export HTML from captured images ─────────────────────────

export async function exportAsHTMLSlidesFromImages(
  images:       (string | null)[],
  presentation: GeneratedPresentation,
): Promise<void> {
  const html     = buildSlideHTMLFromImages(images, presentation);
  const fileName = `${safeFileName(presentation.title)}_slides.html`;
  const fileUri  = `${documentDirectory}${fileName}`;
  await writeAsStringAsync(fileUri, html, { encoding: EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType:    'text/html',
      dialogTitle: `Share: ${presentation.title}`,
    });
  }
}