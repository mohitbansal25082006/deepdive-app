// src/services/chatAttachmentService.ts
// Part 17 — Chat Attachment Service
// Part 18B — Added pickAudio(), pickVideo(); upsert:true on upload
// Part 18C — PPT/PPTX MIME support; isPreviewableMime(); getMimeLabel()

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { Alert, Linking, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { ChatAttachment } from '../types/chat';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StagedAttachment {
  localId:    string; localUri: string; name: string; mimeType: string;
  size?:      number; isImage: boolean; width?: number; height?: number;
  status:     'pending' | 'uploading' | 'done' | 'error';
  progress:   number; remoteUrl?: string; errorMsg?: string;
}

export interface UploadResult { attachment: ChatAttachment | null; error: string | null; }

// ─── Previewable MIME guard ───────────────────────────────────────────────────

/** Returns true if the MIME type can be previewed inline in the chat bubble. */
export function isPreviewableMime(mime: string): boolean {
  if (!mime) return false;
  if (isImageMime(mime) || isVideoMime(mime) || isAudioMime(mime)) return true;
  return [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
  ].includes(mime);
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function extractStoragePath(urlOrPath: string): string | null {
  if (!urlOrPath) return null;
  if (!urlOrPath.startsWith('http')) return urlOrPath;
  const signMatch = urlOrPath.match(/\/object\/sign\/chat-attachments\/([^?]+)/);
  if (signMatch) return decodeURIComponent(signMatch[1]);
  const pubMatch = urlOrPath.match(/\/object\/(?:public|authenticated)\/chat-attachments\/([^?]+)/);
  if (pubMatch) return decodeURIComponent(pubMatch[1]);
  return null;
}

export async function getSignedUrl(urlOrPath: string, expiresInSeconds = 3600): Promise<string | null> {
  const path = extractStoragePath(urlOrPath);
  if (!path) return null;
  const { data, error } = await supabase.storage.from('chat-attachments').createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) { console.error('[getSignedUrl]', error); return null; }
  return data.signedUrl;
}

// ─── Open / download ──────────────────────────────────────────────────────────

export async function openOrDownloadAttachment(
  attachment: ChatAttachment, onProgress?: (pct: number) => void,
): Promise<{ error: string | null }> {
  try {
    onProgress?.(5);
    const storagePath = extractStoragePath(attachment.url);
    let downloadUrl = attachment.url;
    if (storagePath) {
      const { data: sd, error: se } = await supabase.storage.from('chat-attachments').createSignedUrl(storagePath, 3600);
      if (!se && sd?.signedUrl) downloadUrl = sd.signedUrl;
    }
    onProgress?.(15);
    const rawName  = attachment.name || 'file';
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    const localUri = cacheDir + `${Date.now()}_${safeName}`;
    onProgress?.(20);
    const dlr = await FileSystem.downloadAsync(downloadUrl, localUri);
    onProgress?.(70);
    if (dlr.status !== 200) throw new Error(`Download failed (${dlr.status})`);
    const mimeType = attachment.type || dlr.headers?.['content-type'] || 'application/octet-stream';
    onProgress?.(80);
    if (Platform.OS === 'android') {
      const contentUri = await FileSystem.getContentUriAsync(dlr.uri);
      onProgress?.(95);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: contentUri, flags: 1, type: mimeType });
    } else {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dlr.uri, { mimeType, UTI: mimeTypeToUTI(mimeType), dialogTitle: `Open ${rawName}` });
      } else {
        await Linking.openURL(downloadUrl);
      }
    }
    onProgress?.(100);
    return { error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|dismiss|user/i.test(msg)) return { error: null };
    return { error: msg };
  }
}

function mimeTypeToUTI(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'com.adobe.pdf', 'image/jpeg': 'public.jpeg', 'image/png': 'public.png',
    'image/gif': 'com.compuserve.gif', 'image/webp': 'org.webmproject.webp', 'image/heic': 'public.heic',
    'text/plain': 'public.plain-text', 'text/csv': 'public.comma-separated-values-text',
    'video/mp4': 'public.mpeg-4', 'video/quicktime': 'com.apple.quicktime-movie', 'video/mov': 'com.apple.quicktime-movie',
    'audio/mpeg': 'public.mp3', 'audio/mp4': 'public.mpeg-4-audio', 'audio/aac': 'public.aac-audio',
    'application/zip': 'public.zip-archive',
    'application/msword': 'com.microsoft.word.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'org.openxmlformats.wordprocessingml.document',
    'application/vnd.ms-excel': 'com.microsoft.excel.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'org.openxmlformats.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint': 'com.microsoft.powerpoint.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'org.openxmlformats.presentationml.presentation',
  };
  return map[mime] ?? 'public.item';
}

// ─── Permissions ──────────────────────────────────────────────────────────────

function openAppSettings() {
  if (Platform.OS === 'ios') Linking.openURL('app-settings:'); else Linking.openSettings();
}

async function requestMediaLibraryPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status === 'granted') return true;
    Alert.alert('Permission needed', 'Allow photo/video access in Settings.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Settings', onPress: openAppSettings }]);
    return false;
  }
  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) Alert.alert('Permission denied', 'Enable in Settings.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Settings', onPress: openAppSettings }]);
  return false;
}

async function requestCameraPermission(): Promise<boolean> {
  const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) Alert.alert('Camera denied', 'Enable in Settings.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Settings', onPress: openAppSettings }]);
  return false;
}

// ─── MIME helpers ─────────────────────────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf',
  'text/plain': 'txt', 'text/csv': 'csv',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/mov': 'mov',
  'video/mpeg': 'mpeg', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
  'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

function getExt(mime: string, uri: string): string {
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  const e = uri.split('.').pop()?.toLowerCase().split('?')[0];
  return e ?? 'bin';
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/__+/g, '_').slice(0, 80);
}

function makeId(): string { return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ─── Pickers ──────────────────────────────────────────────────────────────────

export async function pickImage(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  if (!await requestMediaLibraryPermission()) return { item: null, error: 'Permission denied' };
  try {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as ImagePicker.MediaType[], allowsEditing: false, quality: 0.85, exif: false });
    if (r.canceled || !r.assets?.length) return { item: null, error: null };
    const a = r.assets[0]; const mime = a.mimeType ?? 'image/jpeg'; const ext = getExt(mime, a.uri);
    return { item: { localId: makeId(), localUri: a.uri, name: a.fileName ?? `photo_${Date.now()}.${ext}`, mimeType: mime, size: a.fileSize ?? undefined, isImage: true, width: a.width, height: a.height, status: 'pending', progress: 0 }, error: null };
  } catch (err) { return { item: null, error: err instanceof Error ? err.message : 'Failed' }; }
}

export async function pickFromCamera(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  if (!await requestCameraPermission()) return { item: null, error: 'Permission denied' };
  try {
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] as ImagePicker.MediaType[], allowsEditing: false, quality: 0.85, exif: false });
    if (r.canceled || !r.assets?.length) return { item: null, error: null };
    const a = r.assets[0]; const mime = a.mimeType ?? 'image/jpeg'; const ext = getExt(mime, a.uri);
    return { item: { localId: makeId(), localUri: a.uri, name: a.fileName ?? `camera_${Date.now()}.${ext}`, mimeType: mime, size: a.fileSize ?? undefined, isImage: true, width: a.width, height: a.height, status: 'pending', progress: 0 }, error: null };
  } catch (err) { return { item: null, error: err instanceof Error ? err.message : 'Failed' }; }
}

export async function pickVideo(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  if (!await requestMediaLibraryPermission()) return { item: null, error: 'Permission denied' };
  try {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] as ImagePicker.MediaType[], allowsEditing: false });
    if (r.canceled || !r.assets?.length) return { item: null, error: null };
    const a = r.assets[0]; const mime = a.mimeType ?? 'video/mp4'; const ext = getExt(mime, a.uri);
    return { item: { localId: makeId(), localUri: a.uri, name: a.fileName ?? `video_${Date.now()}.${ext}`, mimeType: mime, size: a.fileSize ?? undefined, isImage: false, status: 'pending', progress: 0 }, error: null };
  } catch (err) { return { item: null, error: err instanceof Error ? err.message : 'Failed' }; }
}

/** Part 18C: Audio picker using DocumentPicker (ImagePicker doesn't support audio). */
export async function pickAudio(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  try {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['audio/*'], copyToCacheDirectory: true, multiple: false,
    });
    if (r.canceled || !r.assets?.length) return { item: null, error: null };
    const a = r.assets[0]; const mime = a.mimeType ?? 'audio/mpeg';
    return { item: { localId: makeId(), localUri: a.uri, name: a.name ?? `audio_${Date.now()}.mp3`, mimeType: mime, size: a.size ?? undefined, isImage: false, status: 'pending', progress: 0 }, error: null };
  } catch (err) { return { item: null, error: err instanceof Error ? err.message : 'Failed to pick audio' }; }
}

/** Part 18C: Document picker — PDF, Word, Excel, PPT only. Shows error for unsupported types. */
export async function pickDocument(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  try {
    const r = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
      ],
      copyToCacheDirectory: true, multiple: false,
    });
    if (r.canceled || !r.assets?.length) return { item: null, error: null };
    const a = r.assets[0]; const mime = a.mimeType ?? 'application/octet-stream';

    // Guard against unsupported formats
    if (!isPreviewableMime(mime)) {
      return {
        item: null,
        error: `File format not supported.\nSupported: PDF, Word, Excel, PowerPoint, TXT, CSV.\nYou selected: ${getMimeLabel(mime)}`,
      };
    }

    return { item: { localId: makeId(), localUri: a.uri, name: a.name ?? `file_${Date.now()}`, mimeType: mime, size: a.size ?? undefined, isImage: false, status: 'pending', progress: 0 }, error: null };
  } catch (err) { return { item: null, error: err instanceof Error ? err.message : 'Failed to open file picker' }; }
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadAttachment(
  staged: StagedAttachment, workspaceId: string, userId: string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  try {
    onProgress?.(5);
    const response = await fetch(staged.localUri);
    if (!response.ok) throw new Error(`Could not read file (HTTP ${response.status})`);
    onProgress?.(25);
    const ab = await response.arrayBuffer();
    onProgress?.(50);
    const ext      = getExt(staged.mimeType, staged.localUri);
    const safeName = sanitize(staged.name.includes('.') ? staged.name : `${staged.name}.${ext}`);
    const path     = `${workspaceId}/${userId}/${Date.now()}_${safeName}`;
    const { data, error } = await supabase.storage.from('chat-attachments').upload(path, ab, {
      contentType: staged.mimeType, cacheControl: '3600', upsert: true,
    });
    if (error) throw error;
    onProgress?.(100);
    return { attachment: { url: data.path, name: staged.name, type: staged.mimeType, size: staged.size }, error: null };
  } catch (err) {
    console.error('[uploadAttachment]', err);
    return { attachment: null, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

export async function uploadAllAttachments(
  staged: StagedAttachment[], workspaceId: string, userId: string,
  onItemProgress?: (localId: string, pct: number) => void,
): Promise<ChatAttachment[]> {
  const results = await Promise.all(staged.map(s => uploadAttachment(s, workspaceId, userId, p => onItemProgress?.(s.localId, p))));
  return results.filter(r => r.attachment).map(r => r.attachment!);
}

export async function deleteAttachment(publicUrl: string): Promise<void> {
  try {
    const match = publicUrl.match(/chat-attachments\/(.+)$/);
    if (!match) return;
    await supabase.storage.from('chat-attachments').remove([match[1]]);
  } catch {}
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function isImageMime(mime: string): boolean  { return mime.startsWith('image/'); }
export function isVideoMime(mime: string): boolean  { return mime.startsWith('video/'); }
export function isAudioMime(mime: string): boolean  { return mime.startsWith('audio/'); }
export function isDocumentMime(mime: string): boolean {
  return !isImageMime(mime) && !isVideoMime(mime) && !isAudioMime(mime);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/'))    return 'image-outline';
  if (mimeType.startsWith('video/'))    return 'videocam-outline';
  if (mimeType.startsWith('audio/'))    return 'musical-notes-outline';
  if (mimeType === 'application/pdf')   return 'document-text-outline';
  if (mimeType.includes('word'))        return 'document-outline';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'grid-outline';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'easel-outline';
  if (mimeType === 'text/plain')        return 'reader-outline';
  if (mimeType === 'text/csv')          return 'list-outline';
  if (mimeType.includes('zip'))         return 'archive-outline';
  return 'attach-outline';
}

export function getMimeLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word'))      return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint';
  if (mimeType === 'text/plain')      return 'Text';
  if (mimeType === 'text/csv')        return 'CSV';
  if (mimeType.startsWith('image/'))  return 'Image';
  if (mimeType.startsWith('video/'))  return 'Video';
  if (mimeType.startsWith('audio/'))  return 'Audio';
  return (mimeType.split('/').pop() ?? 'File').toUpperCase();
}