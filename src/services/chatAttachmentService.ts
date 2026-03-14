// src/services/chatAttachmentService.ts
// Part 17 — Chat Attachment Service
//
// ── Open / Download strategy (confirmed from Expo docs + community) ──────────
//
// You CANNOT just call Linking.openURL(remoteHttpsUrl) for files stored in
// Supabase Storage — the URL requires authentication headers and Linking
// cannot attach them. Even public bucket URLs sometimes get blocked by
// corporate firewalls or iOS's URL-scheme allowlist.
//
// CORRECT approach (platform-specific):
//
//   iOS:
//     1. FileSystem.downloadAsync(remoteUrl, cacheDir + filename)
//     2. Sharing.shareAsync(localUri, { mimeType, UTI })
//        → opens iOS "Open In / Share" sheet — user can open in Files,
//          preview in QuickLook, AirDrop, etc.
//        → For images: show in in-app lightbox first; offer share separately
//
//   Android:
//     1. FileSystem.downloadAsync(remoteUrl, cacheDir + filename)
//     2. FileSystem.getContentUriAsync(localUri)
//        → converts file:// to content:// so external apps can read it
//     3. IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
//          data: contentUri, flags: 1, type: mimeType
//        })
//        → opens Android app-chooser (PDF → Drive/Acrobat, image → Photos, etc.)
//
// NOTE: `expo-intent-launcher` ships with Expo — no separate install needed.
//       `expo-file-system` and `expo-sharing` already installed in Part 1/3.

import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
// SDK 52+: legacy API is now at 'expo-file-system/legacy'
// (cacheDirectory, downloadAsync, getContentUriAsync live here)
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { Alert, Linking, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { ChatAttachment } from '../types/chat';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StagedAttachment {
  localId:    string;
  localUri:   string;
  name:       string;
  mimeType:   string;
  size?:      number;
  isImage:    boolean;
  width?:     number;
  height?:    number;
  status:     'pending' | 'uploading' | 'done' | 'error';
  progress:   number;
  remoteUrl?: string;
  errorMsg?:  string;
}

export interface UploadResult {
  attachment: ChatAttachment | null;
  error:      string | null;
}

// ─── Storage path helpers ────────────────────────────────────────────────────
//
// We store the STORAGE PATH (e.g. "workspaceId/userId/ts_file.pdf") in the DB
// rather than a signed URL (which expires) or a public URL (which requires the
// bucket to be public and returns 400 for private buckets).
// At display/download time we call createSignedUrl() for a fresh 1-hour URL.

/** Extract the storage path from either:
 *  • A raw path     "workspaceId/userId/..."
 *  • A signed URL   "https://...supabase.co/storage/v1/object/sign/chat-attachments/PATH?..."
 *  • A public URL   "https://...supabase.co/storage/v1/object/public/chat-attachments/PATH"
 *  • An auth URL    "https://...supabase.co/storage/v1/object/authenticated/chat-attachments/PATH"
 */
export function extractStoragePath(urlOrPath: string): string | null {
  if (!urlOrPath) return null;

  // Already a raw path (no scheme)
  if (!urlOrPath.startsWith('http')) return urlOrPath;

  // Signed URL pattern: /object/sign/bucket/PATH
  const signMatch = urlOrPath.match(/\/object\/sign\/chat-attachments\/([^?]+)/);
  if (signMatch) return decodeURIComponent(signMatch[1]);

  // Public/authenticated URL: /object/(public|authenticated)/bucket/PATH
  const pubMatch = urlOrPath.match(/\/object\/(?:public|authenticated)\/chat-attachments\/([^?]+)/);
  if (pubMatch) return decodeURIComponent(pubMatch[1]);

  return null;
}

/** Create a fresh 1-hour signed URL for any stored attachment.
 *  Use this whenever you need to display an image or download a file.
 */
export async function getSignedUrl(
  urlOrPath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const path = extractStoragePath(urlOrPath);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from('chat-attachments')
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error('[getSignedUrl] error:', error);
    return null;
  }
  return data.signedUrl;
}

// ─── Open / download attachment ───────────────────────────────────────────────
//
// Call this when user taps a file chip or a download button.
// Returns { error } — null means success / user dismissed share sheet.

export async function openOrDownloadAttachment(
  attachment: ChatAttachment,
  onProgress?: (pct: number) => void,
): Promise<{ error: string | null }> {
  try {
    onProgress?.(5);

    // ── Step 1: Get a signed download URL ─────────────────────────────────
    // The bucket is PRIVATE. getPublicUrl() returns a URL that returns 400
    // because no auth header is sent. createSignedUrl() generates a
    // time-limited URL (1 hour) that works without any auth headers,
    // so FileSystem.downloadAsync can fetch it cleanly.
    const storagePath = extractStoragePath(attachment.url);
    let downloadUrl   = attachment.url; // fallback to stored URL

    if (storagePath) {
      const { data: signedData, error: signErr } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(storagePath, 3600); // 1 hour

      if (signErr || !signedData?.signedUrl) {
        console.warn('[openOrDownload] createSignedUrl failed, using original URL:', signErr);
        // Don't throw — fall through with the original URL as last resort
      } else {
        downloadUrl = signedData.signedUrl;
      }
    }

    onProgress?.(15);

    // ── Step 2: Build a clean local filename ──────────────────────────────
    const rawName  = attachment.name || 'file';
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    // Add timestamp so re-downloads don't serve a stale cached version
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
    const localUri = cacheDir + `${Date.now()}_${safeName}`;

    onProgress?.(20);

    // ── Step 3: Download to local cache ───────────────────────────────────
    const downloadResult = await FileSystem.downloadAsync(downloadUrl, localUri);

    onProgress?.(70);

    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    const mimeType = attachment.type
      || downloadResult.headers?.['content-type']
      || 'application/octet-stream';

    onProgress?.(80);

    // ── Step 4: Open with platform-specific method ────────────────────────
    if (Platform.OS === 'android') {
      const contentUri = await FileSystem.getContentUriAsync(downloadResult.uri);
      onProgress?.(95);
      await IntentLauncher.startActivityAsync(
        'android.intent.action.VIEW',
        { data: contentUri, flags: 1, type: mimeType },
      );
    } else {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        await Linking.openURL(downloadUrl);
      } else {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType,
          UTI:         mimeTypeToUTI(mimeType),
          dialogTitle: `Open ${rawName}`,
        });
      }
    }

    onProgress?.(100);
    return { error: null };
  } catch (err) {
    // User cancelled the share/intent dialog — not a real error
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('cancel') ||
      msg.includes('Cancel') ||
      msg.includes('dismissed') ||
      msg.includes('user')
    ) {
      return { error: null };
    }
    console.error('[openOrDownloadAttachment]', err);
    return { error: msg };
  }
}

// ─── UTI helper for iOS sharing ───────────────────────────────────────────────

function mimeTypeToUTI(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf':       'com.adobe.pdf',
    'image/jpeg':            'public.jpeg',
    'image/png':             'public.png',
    'image/gif':             'com.compuserve.gif',
    'image/webp':            'org.webmproject.webp',
    'image/heic':            'public.heic',
    'text/plain':            'public.plain-text',
    'text/csv':              'public.comma-separated-values-text',
    'video/mp4':             'public.mpeg-4',
    'video/quicktime':       'com.apple.quicktime-movie',
    'audio/mpeg':            'public.mp3',
    'application/zip':       'public.zip-archive',
    'application/msword':    'com.microsoft.word.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'org.openxmlformats.wordprocessingml.document',
    'application/vnd.ms-excel': 'com.microsoft.excel.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'org.openxmlformats.spreadsheetml.sheet',
  };
  return map[mime] ?? 'public.item';
}

// ─── Permission helpers ───────────────────────────────────────────────────────

function openAppSettings() {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    Linking.openSettings();
  }
}

async function requestMediaLibraryPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status === 'granted') return true;
    Alert.alert('Photo Library Access', 'Please allow access to your photo library in Settings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ]);
    return false;
  }
  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) {
    Alert.alert('Photo Library Access Denied', 'Please go to Settings and enable photo library access.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ]);
  }
  return false;
}

async function requestCameraPermission(): Promise<boolean> {
  const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
  if (status === 'granted') return true;
  if (!canAskAgain) {
    Alert.alert('Camera Access Denied', 'Please go to Settings and enable camera access.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ]);
  }
  return false;
}

// ─── MIME helpers ─────────────────────────────────────────────────────────────

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic',
  'application/pdf': 'pdf', 'text/plain': 'txt', 'text/csv': 'csv',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
};

function getExt(mimeType: string, fallbackUri: string): string {
  if (MIME_EXT[mimeType]) return MIME_EXT[mimeType];
  const uriExt = fallbackUri.split('.').pop()?.toLowerCase().split('?')[0];
  return uriExt ?? 'bin';
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/__+/g, '_').slice(0, 80);
}

function makeStagedId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Image picker ─────────────────────────────────────────────────────────────

export async function pickImage(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  const granted = await requestMediaLibraryPermission();
  if (!granted) return { item: null, error: 'Permission denied' };
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 0.85,
      exif: false,
    });
    if (result.canceled || !result.assets?.length) return { item: null, error: null };
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const ext = getExt(mimeType, asset.uri);
    return {
      item: {
        localId: makeStagedId(), localUri: asset.uri,
        name: asset.fileName ?? `photo_${Date.now()}.${ext}`,
        mimeType, size: asset.fileSize ?? undefined,
        isImage: true, width: asset.width ?? undefined, height: asset.height ?? undefined,
        status: 'pending', progress: 0,
      },
      error: null,
    };
  } catch (err) {
    return { item: null, error: err instanceof Error ? err.message : 'Failed to open photo library' };
  }
}

// ─── Camera picker ────────────────────────────────────────────────────────────

export async function pickFromCamera(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  const granted = await requestCameraPermission();
  if (!granted) return { item: null, error: 'Permission denied' };
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: false, quality: 0.85, exif: false,
    });
    if (result.canceled || !result.assets?.length) return { item: null, error: null };
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const ext = getExt(mimeType, asset.uri);
    return {
      item: {
        localId: makeStagedId(), localUri: asset.uri,
        name: asset.fileName ?? `camera_${Date.now()}.${ext}`,
        mimeType, size: asset.fileSize ?? undefined,
        isImage: true, width: asset.width ?? undefined, height: asset.height ?? undefined,
        status: 'pending', progress: 0,
      },
      error: null,
    };
  } catch (err) {
    return { item: null, error: err instanceof Error ? err.message : 'Failed to open camera' };
  }
}

// ─── Document picker ──────────────────────────────────────────────────────────

export async function pickDocument(): Promise<{ item: StagedAttachment | null; error: string | null }> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*', copyToCacheDirectory: true, multiple: false,
    });
    if (result.canceled || !result.assets?.length) return { item: null, error: null };
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'application/octet-stream';
    return {
      item: {
        localId: makeStagedId(), localUri: asset.uri,
        name: asset.name ?? `file_${Date.now()}`,
        mimeType, size: asset.size ?? undefined,
        isImage: mimeType.startsWith('image/'),
        status: 'pending', progress: 0,
      },
      error: null,
    };
  } catch (err) {
    return { item: null, error: err instanceof Error ? err.message : 'Failed to open file picker' };
  }
}

// ─── Upload a single attachment ───────────────────────────────────────────────

export async function uploadAttachment(
  staged:      StagedAttachment,
  workspaceId: string,
  userId:      string,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> {
  try {
    onProgress?.(5);
    const response = await fetch(staged.localUri);
    if (!response.ok) throw new Error(`Could not read file (HTTP ${response.status})`);
    onProgress?.(25);
    const arrayBuffer = await response.arrayBuffer();
    onProgress?.(50);

    const ext      = getExt(staged.mimeType, staged.localUri);
    const safeName = sanitizeFilename(staged.name.includes('.') ? staged.name : `${staged.name}.${ext}`);
    const storagePath = `${workspaceId}/${userId}/${Date.now()}_${safeName}`;

    const { data, error } = await supabase.storage
      .from('chat-attachments')
      .upload(storagePath, arrayBuffer, {
        contentType: staged.mimeType, cacheControl: '3600', upsert: false,
      });
    if (error) throw error;
    onProgress?.(90);

    // Store the confirmed storage PATH returned by Supabase (not a signed/public
    // URL) — paths never expire, signed URLs do. We resolve a fresh signed URL
    // at display/download time via getSignedUrl().
    // data.path is the same as storagePath but use data.path as the authoritative
    // server-confirmed value (it may differ if upsert renamed the file).
    const confirmedPath = data.path;
    onProgress?.(100);
    return {
      attachment: {
        url:  confirmedPath,  // storage path stored in DB — NOT a URL
        name: staged.name,
        type: staged.mimeType,
        size: staged.size,
      },
      error: null,
    };
  } catch (err) {
    console.error('[uploadAttachment]', err);
    return { attachment: null, error: err instanceof Error ? err.message : 'Upload failed' };
  }
}

export async function uploadAllAttachments(
  staged: StagedAttachment[], workspaceId: string, userId: string,
  onItemProgress?: (localId: string, pct: number) => void,
): Promise<ChatAttachment[]> {
  const results = await Promise.all(
    staged.map(s => uploadAttachment(s, workspaceId, userId, pct => onItemProgress?.(s.localId, pct))),
  );
  return results.filter(r => r.attachment !== null).map(r => r.attachment!);
}

export async function deleteAttachment(publicUrl: string): Promise<void> {
  try {
    const match = publicUrl.match(/chat-attachments\/(.+)$/);
    if (!match) return;
    await supabase.storage.from('chat-attachments').remove([match[1]]);
  } catch {}
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function isImageMime(mime: string): boolean { return mime.startsWith('image/'); }
export function isVideoMime(mime: string): boolean { return mime.startsWith('video/'); }

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
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