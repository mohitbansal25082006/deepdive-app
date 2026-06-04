// src/components/workspace/DocumentPreviewModal.tsx
// Part 18C — PPT/PPTX Google Slides viewer
// Part 47 — Fixed getViewerUrl
// Part 48  — CSV/Excel inline viewer; always show file name
// Part 48b — iOS CSV/Excel fix: pre-fetch in RN, inject data into HTML
// Part 48e — FIX: Long filename truncation with extension always visible.
//   When a filename is long, we truncate the middle and always show the
//   extension at the end: "very-long-document-na….pdf" instead of
//   "very-long-document-name-that-…" (which hides the extension).

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ActivityIndicator,
  StyleSheet, Share, Platform, Dimensions, Linking,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAttachment } from '../../types/chat';
import {
  getSignedUrl, openOrDownloadAttachment,
  getFileIcon, getMimeLabel, isPreviewableMime,
} from '../../services/chatAttachmentService';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Part 48e: Smart filename display ─────────────────────────────────────────
// Shows stem truncated + extension always visible.
// e.g. "very-long-document-name.pdf" → "very-long-doc….pdf"

function formatDisplayName(name: string, maxLength = 28): string {
  if (!name || name.length <= maxLength) return name || 'Document';
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx <= 0) {
    // No extension — just truncate
    return name.slice(0, maxLength - 1) + '…';
  }
  const ext  = name.slice(dotIdx);          // e.g. ".pdf"
  const stem = name.slice(0, dotIdx);       // everything before dot
  const maxStem = maxLength - ext.length - 1; // 1 for the ellipsis
  if (maxStem <= 0) return name.slice(0, maxLength - 1) + '…';
  return stem.slice(0, maxStem) + '…' + ext;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCsv(mime: string, url: string): boolean {
  return (
    mime === 'text/csv' ||
    mime === 'application/csv' ||
    url.toLowerCase().includes('.csv')
  );
}

function isExcel(mime: string, url: string): boolean {
  const lower = url.toLowerCase();
  return (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    lower.includes('.xls') ||
    lower.includes('.xlsx')
  );
}

function isGoogleDocsSupported(mime: string): boolean {
  return (
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('powerpoint') || mime.includes('presentation') ||
    mime === 'text/plain' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

// ─── CSV HTML builder ─────────────────────────────────────────────────────────

function buildCsvHtmlWithData(csvText: string): string {
  const escaped = csvText
    .replace(/\\/g, '\\\\')
    .replace(/`/g,  '\\`')
    .replace(/\$/g, '\\$');

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, system-ui, sans-serif; background: #0f0f14; color: #e2e8f0; }
#msg { padding: 16px; color: #94a3b8; font-size: 13px; text-align: center; }
.table-wrap { overflow-x: auto; max-height: 100vh; }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th { background: #1e1e2e; color: #7c6af7; padding: 8px 10px; text-align: left;
     border: 1px solid #2d2d44; font-weight: 600; position: sticky; top: 0; z-index: 1; white-space: nowrap; }
td { padding: 7px 10px; border: 1px solid #1e1e2e; color: #e2e8f0; white-space: nowrap; }
tr:nth-child(even) td { background: #13131b; }
</style>
</head>
<body>
<div id="msg">Rendering CSV…</div>
<div class="table-wrap"><table id="t"></table></div>
<script>
(function() {
  const raw = \`${escaped}\`;
  const msgEl = document.getElementById('msg');
  const table = document.getElementById('t');
  try {
    const rows = raw.split(/\\r?\\n/).filter(r => r.trim());
    if (!rows.length) { msgEl.textContent = 'Empty file'; return; }
    msgEl.style.display = 'none';
    let html = '';
    rows.forEach((row, i) => {
      const cols = []; let cur = '', inQ = false;
      for (let j = 0; j < row.length; j++) {
        const ch = row[j];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
        else { cur += ch; }
      }
      cols.push(cur);
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>' + cols.map(c => '<' + tag + '>' + c.replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</' + tag + '>').join('') + '</tr>';
    });
    table.innerHTML = html;
  } catch(e) {
    msgEl.textContent = 'Parse error: ' + e.message;
  }
})();
</script>
</body>
</html>`;
}

// ─── Excel HTML builder ───────────────────────────────────────────────────────

function buildExcelHtmlWithBase64(base64Data: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, system-ui, sans-serif; background: #0f0f14; color: #e2e8f0; }
#msg { padding: 16px; color: #94a3b8; font-size: 13px; text-align: center; }
.tabs { display: flex; gap: 4px; padding: 8px; background: #1e1e2e; overflow-x: auto; }
.tab { padding: 5px 12px; border-radius: 6px; font-size: 11px; cursor: pointer;
       background: #2d2d44; color: #94a3b8; border: 1px solid #3d3d54; white-space: nowrap; }
.tab.active { background: #7c6af7; color: #fff; border-color: #7c6af7; }
.table-wrap { overflow-x: auto; max-height: calc(100vh - 80px); }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
th { background: #1e1e2e; color: #7c6af7; padding: 8px 10px; text-align: left;
     border: 1px solid #2d2d44; font-weight: 600; position: sticky; top: 0; z-index: 1; }
td { padding: 7px 10px; border: 1px solid #1e1e2e; color: #e2e8f0; white-space: nowrap; }
tr:nth-child(even) td { background: #13131b; }
</style>
</head>
<body>
<div id="msg">Loading spreadsheet…</div>
<div id="tabs" class="tabs" style="display:none"></div>
<div class="table-wrap"><table id="t"></table></div>
<script>
(function() {
  const b64 = "${base64Data}";
  const msgEl = document.getElementById('msg');
  const tabsEl = document.getElementById('tabs');
  const table = document.getElementById('t');
  let wb;
  function showSheet(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.name === name));
    const ws = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    let html = '';
    data.forEach((row, i) => {
      const tag = i === 0 ? 'th' : 'td';
      html += '<tr>' + row.map(c => '<' + tag + '>' + String(c).replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</' + tag + '>').join('') + '</tr>';
    });
    table.innerHTML = html;
  }
  function waitForXLSX() {
    if (typeof XLSX === 'undefined') { setTimeout(waitForXLSX, 100); return; }
    try {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      wb = XLSX.read(arr, { type: 'array' });
      msgEl.style.display = 'none';
      if (wb.SheetNames.length > 1) {
        tabsEl.style.display = 'flex';
        wb.SheetNames.forEach(name => {
          const btn = document.createElement('div');
          btn.className = 'tab'; btn.dataset.name = name; btn.textContent = name;
          btn.onclick = () => showSheet(name);
          tabsEl.appendChild(btn);
        });
      }
      showSheet(wb.SheetNames[0]);
    } catch(e) { msgEl.textContent = 'Error: ' + e.message; }
  }
  waitForXLSX();
})();
</script>
</body>
</html>`;
}

// ─── Viewer strategy ──────────────────────────────────────────────────────────

type ViewerStrategy =
  | { type: 'csv_preloaded';   html: string }
  | { type: 'excel_preloaded'; html: string }
  | { type: 'google_docs';     url:  string }
  | { type: 'unsupported' };

// ─── Document Preview Trigger chip ───────────────────────────────────────────

interface TriggerProps { attachment: ChatAttachment; isOwnMessage: boolean; }

export function DocumentPreviewTrigger({ attachment, isOwnMessage }: TriggerProps) {
  const [open, setOpen] = useState(false);

  const rawName    = attachment.name?.trim() || 'Document';
  // Part 48e: truncate long names but always keep extension visible
  const displayName = formatDisplayName(rawName, 28);
  const mimeLabel   = getMimeLabel(attachment.type);
  const canPreview  = isPreviewableMime(attachment.type);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[styles.trigger, isOwnMessage && styles.triggerOwn]}
        activeOpacity={0.75}
      >
        {/* Icon */}
        <View style={[styles.triggerIcon, isOwnMessage && styles.triggerIconOwn]}>
          <Ionicons
            name={getFileIcon(attachment.type) as any}
            size={16}
            color={isOwnMessage ? 'rgba(255,255,255,0.85)' : COLORS.primary}
          />
        </View>

        {/* Meta — truncated name with extension always visible */}
        <View style={styles.triggerMeta}>
          <Text
            style={[styles.triggerName, isOwnMessage && styles.triggerNameOwn]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Text
            style={[styles.triggerSub, isOwnMessage && styles.triggerSubOwn]}
            numberOfLines={1}
          >
            {mimeLabel} · {canPreview ? 'Tap to preview' : 'Tap to download'}
          </Text>
        </View>

        {/* Action icon */}
        <Ionicons
          name={canPreview ? 'eye-outline' : 'download-outline'}
          size={13}
          color={isOwnMessage ? 'rgba(255,255,255,0.6)' : COLORS.textMuted}
          style={{ flexShrink: 0 }}
        />
      </TouchableOpacity>

      {open && (
        <DocumentPreviewModal
          attachment={attachment}
          visible={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Full-screen preview modal ────────────────────────────────────────────────

interface ModalProps { attachment: ChatAttachment; visible: boolean; onClose: () => void; }

export function DocumentPreviewModal({ attachment, visible, onClose }: ModalProps) {
  const insets = useSafeAreaInsets();

  const [strategy,      setStrategy]      = useState<ViewerStrategy | null>(null);
  const [isLoading,     setIsLoading]     = useState(true);
  const [loadError,     setLoadError]     = useState<string | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const signedRef = useRef<string | null>(null);

  const buildStrategy = useCallback(async () => {
    if (strategy || isFetchingUrl) return;
    setIsFetchingUrl(true);
    setLoadError(null);

    const signed = await getSignedUrl(attachment.url);
    if (!signed) {
      setLoadError('Could not load document. Try downloading it instead.');
      setIsFetchingUrl(false);
      return;
    }
    signedRef.current = signed;

    const mime = attachment.type?.toLowerCase() ?? '';

    if (isCsv(mime, signed)) {
      try {
        const resp = await fetch(signed);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        setStrategy({ type: 'csv_preloaded', html: buildCsvHtmlWithData(text) });
      } catch (e: any) {
        setLoadError(`Could not load CSV: ${e.message ?? 'network error'}`);
      }
      setIsFetchingUrl(false);
      return;
    }

    if (isExcel(mime, signed)) {
      try {
        const resp = await fetch(signed);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const ab    = await resp.arrayBuffer();
        const bytes = new Uint8Array(ab);
        let binary  = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...(bytes.subarray(i, i + chunk) as any));
        }
        const b64 = btoa(binary);
        setStrategy({ type: 'excel_preloaded', html: buildExcelHtmlWithBase64(b64) });
      } catch (e: any) {
        setLoadError(`Could not load spreadsheet: ${e.message ?? 'network error'}`);
      }
      setIsFetchingUrl(false);
      return;
    }

    if (isGoogleDocsSupported(mime)) {
      const encoded = encodeURIComponent(signed);
      setStrategy({ type: 'google_docs', url: `https://docs.google.com/viewer?url=${encoded}&embedded=true` });
      setIsFetchingUrl(false);
      return;
    }

    setStrategy({ type: 'unsupported' });
    setIsFetchingUrl(false);
  }, [attachment.url, attachment.type, strategy, isFetchingUrl]);

  React.useEffect(() => {
    if (visible && !strategy) buildStrategy();
  }, [visible]);

  const handleClose = useCallback(() => {
    setIsLoading(true); setLoadError(null); setStrategy(null); onClose();
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    await openOrDownloadAttachment(attachment);
    setIsDownloading(false);
  }, [attachment, isDownloading]);

  const handleShare = useCallback(async () => {
    if (!signedRef.current) return;
    try {
      await Share.share({
        message: Platform.OS === 'ios' ? attachment.name : signedRef.current,
        url:     Platform.OS === 'ios' ? signedRef.current : undefined,
        title:   attachment.name,
      });
    } catch {}
  }, [attachment.name]);

  const handleLoadEnd   = useCallback(() => setIsLoading(false), []);
  const handleLoadError = useCallback(() => {
    setIsLoading(false);
    setLoadError('Preview could not load. Check your internet connection and try downloading instead.');
  }, []);

  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.url && !nav.url.includes('docs.google.com') && !nav.url.startsWith('about:') && !nav.url.startsWith('data:')) {
      Linking.openURL(nav.url).catch(() => {});
    }
  }, []);

  const mimeLabel   = getMimeLabel(attachment.type);
  const fileIcon    = getFileIcon(attachment.type) as any;
  // Full name in the modal header (not truncated — user can scroll)
  const displayName = attachment.name?.trim() || 'Document';

  const isUnsupported = strategy?.type === 'unsupported';
  const hasWebView    = strategy?.type === 'csv_preloaded' ||
                        strategy?.type === 'excel_preloaded' ||
                        strategy?.type === 'google_docs';

  let webviewSource: { html: string } | { uri: string } | undefined;
  if (strategy?.type === 'csv_preloaded' || strategy?.type === 'excel_preloaded') {
    webviewSource = { html: (strategy as any).html };
  } else if (strategy?.type === 'google_docs') {
    webviewSource = { uri: (strategy as any).url };
  }

  return (
    <Modal visible={visible} animationType="none" transparent={false} onRequestClose={handleClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]}>

        {/* Top bar */}
        <Animated.View entering={FadeIn.duration(250)} style={styles.topBar}>
          <TouchableOpacity onPress={handleClose} style={styles.topBtn}>
            <Ionicons name="close" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <View style={styles.mimeChip}>
              <Ionicons name={fileIcon} size={11} color={COLORS.primary} />
              <Text style={styles.mimeLabel}>{mimeLabel}</Text>
            </View>
            <Text style={styles.topName} numberOfLines={1}>{displayName}</Text>
          </View>
          <View style={styles.topActions}>
            {signedRef.current && (
              <TouchableOpacity onPress={handleShare} style={styles.topBtn}>
                <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleDownload} style={styles.topBtn} disabled={isDownloading}>
              {isDownloading
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Ionicons name="download-outline" size={18} color={COLORS.textSecondary} />
              }
            </TouchableOpacity>
          </View>
        </Animated.View>

        {isFetchingUrl && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.centerText}>
              {isCsv(attachment.type, attachment.url)   ? 'Loading CSV…' :
               isExcel(attachment.type, attachment.url) ? 'Loading spreadsheet…' :
               'Preparing preview…'}
            </Text>
          </View>
        )}

        {!isFetchingUrl && isUnsupported && (
          <Animated.View entering={SlideInDown.duration(300)} style={styles.errorScreen}>
            <View style={styles.errorIcon}><Ionicons name={fileIcon} size={44} color={COLORS.textMuted} /></View>
            <Text style={styles.errorTitle}>Preview not available</Text>
            <Text style={styles.errorDesc}>{mimeLabel} files cannot be previewed inline. Tap below to open in an external app.</Text>
            <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn} disabled={isDownloading}>
              {isDownloading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="open-outline" size={17} color="#FFF" />}
              <Text style={styles.downloadBtnText}>{isDownloading ? 'Opening…' : 'Open in App'}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {!isFetchingUrl && !isUnsupported && loadError && (
          <Animated.View entering={SlideInDown.duration(300)} style={styles.errorScreen}>
            <View style={styles.errorIcon}><Ionicons name={fileIcon} size={44} color={COLORS.textMuted} /></View>
            <Text style={styles.errorTitle}>Preview unavailable</Text>
            <Text style={styles.errorDesc}>{loadError}</Text>
            <TouchableOpacity onPress={handleDownload} style={styles.downloadBtn} disabled={isDownloading}>
              {isDownloading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="download-outline" size={17} color="#FFF" />}
              <Text style={styles.downloadBtnText}>{isDownloading ? 'Downloading…' : 'Download to Open'}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {!isFetchingUrl && !isUnsupported && !loadError && hasWebView && webviewSource && (
          <>
            <WebView
              source={webviewSource as any}
              style={styles.webview}
              onLoadEnd={handleLoadEnd}
              onError={handleLoadError}
              onNavigationStateChange={handleNavChange}
              javaScriptEnabled
              domStorageEnabled
              scalesPageToFit
              originWhitelist={['*']}
              allowUniversalAccessFromFileURLs
              allowFileAccessFromFileURLs
              mixedContentMode="always"
              userAgent={
                strategy?.type === 'google_docs'
                  ? 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36'
                  : undefined
              }
            />
            {isLoading && (
              <View style={styles.webviewOverlay}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.centerText}>Rendering…</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: insets.bottom }} />
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:    { flex: 1, backgroundColor: COLORS.background },
  topBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.backgroundCard, gap: 8 },
  topBtn:    { width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.backgroundElevated, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topCenter: { flex: 1, alignItems: 'center', gap: 3 },
  mimeChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  mimeLabel: { color: COLORS.primary, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  topName:   { color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600', maxWidth: SCREEN_W - 140, textAlign: 'center' },
  topActions:{ flexDirection: 'row', gap: 4 },
  webview:   { flex: 1, backgroundColor: COLORS.background },
  webviewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  centerText:{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm },
  errorScreen:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xl, gap: 16 },
  errorIcon:      { width: 88, height: 88, borderRadius: 26, backgroundColor: `${COLORS.textMuted}12`, alignItems: 'center', justifyContent: 'center' },
  errorTitle:     { color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' },
  errorDesc:      { color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  downloadBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.xl, paddingVertical: 13, marginTop: SPACING.sm },
  downloadBtnText:{ color: '#FFF', fontSize: FONTS.sizes.base, fontWeight: '700' },

  // ── Trigger chip ──────────────────────────────────────────────────────────
  trigger: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    backgroundColor:  COLORS.backgroundCard,
    borderRadius:     RADIUS.lg,
    paddingVertical:  10,
    paddingHorizontal: 10,
    borderWidth:      1,
    borderColor:      COLORS.border,
    // Part 48e: constrain width so it never stretches bubble
    maxWidth:         '100%',
    overflow:         'hidden',
  },
  triggerOwn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderColor:     'rgba(255,255,255,0.2)',
  },
  triggerIcon: {
    width:           34,
    height:          34,
    borderRadius:    10,
    backgroundColor: `${COLORS.primary}15`,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  triggerIconOwn:  { backgroundColor: 'rgba(255,255,255,0.15)' },
  triggerMeta: {
    flex:       1,
    minWidth:   0,
    flexShrink: 1,
  },
  triggerName: {
    color:      COLORS.textPrimary,
    fontSize:   FONTS.sizes.xs,
    fontWeight: '700',
    // Part 48e: single line — truncation handled by formatDisplayName
  },
  triggerNameOwn:  { color: '#FFF' },
  triggerSub: {
    color:     COLORS.textMuted,
    fontSize:  10,
    marginTop: 2,
  },
  triggerSubOwn: { color: 'rgba(255,255,255,0.55)' },
});