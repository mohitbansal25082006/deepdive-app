// src/services/workspaceMediaService.ts
// Part 13 — Workspace logo / image upload + removal.
//
// Key design:
//   • Uses expo-image-picker (already installed) to let user pick or take photo.
//   • Uses expo-file-system to read raw file and convert to base64.
//   • Uses `base64-arraybuffer` (new install) to decode → ArrayBuffer, which
//     is the ONLY method that reliably works with Supabase Storage in RN.
//     See: https://supabase.com/docs/guides/storage (React Native note).
//   • Calls the `update_workspace_logo` SECURITY DEFINER RPC so both
//     owners AND editors can update the logo (direct table UPDATE is owner-only).
//
// Install: npm install base64-arraybuffer --legacy-peer-deps

import * as ImagePicker from 'expo-image-picker';
import * as FileSystem   from 'expo-file-system/legacy';
import { decode }         from 'base64-arraybuffer';
import { supabase }       from '../lib/supabase';

const BUCKET = 'workspace-logos';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadLogoResult {
  url:       string | null;
  error:     string | null;
  cancelled?: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens the device photo library, lets the user pick a square-cropped image,
 * uploads it to Supabase Storage, then updates the workspace's avatar_url.
 */
export async function pickAndUploadWorkspaceLogo(
  workspaceId: string,
): Promise<UploadLogoResult> {
  try {
    // Permission check
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return {
        url:   null,
        error: 'Photo library access is required. Please allow it in Settings.',
      };
    }

    // Launch picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:    ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect:        [1, 1],  // square crop for workspace logo
      quality:       0.85,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { url: null, error: null, cancelled: true };
    }

    return _uploadFromUri(workspaceId, result.assets[0].uri);
  } catch (err) {
    return {
      url:   null,
      error: err instanceof Error ? err.message : 'Failed to open photo library',
    };
  }
}

/**
 * Opens the camera, lets the user take a square-cropped photo,
 * uploads it, then updates avatar_url.
 */
export async function takeAndUploadWorkspaceLogo(
  workspaceId: string,
): Promise<UploadLogoResult> {
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      return {
        url:   null,
        error: 'Camera access is required. Please allow it in Settings.',
      };
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect:        [1, 1],
      quality:       0.85,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { url: null, error: null, cancelled: true };
    }

    return _uploadFromUri(workspaceId, result.assets[0].uri);
  } catch (err) {
    return {
      url:   null,
      error: err instanceof Error ? err.message : 'Failed to open camera',
    };
  }
}

/**
 * Removes the workspace logo by setting avatar_url to null.
 * Optionally attempts to delete the old file from storage.
 */
export async function removeWorkspaceLogo(
  workspaceId: string,
  currentUrl?: string | null,
): Promise<{ error: string | null }> {
  try {
    // Remove from workspace record
    const { error } = await supabase.rpc('update_workspace_logo', {
      p_workspace_id: workspaceId,
      p_avatar_url:   null,
    });
    if (error) throw error;

    // Best-effort delete of old storage object
    if (currentUrl) {
      _deleteStorageFile(currentUrl).catch(() => {});
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to remove logo' };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Core upload pipeline:
 *   1. Detect MIME type from URI
 *   2. Read file as base64 via expo-file-system
 *   3. Decode to ArrayBuffer via base64-arraybuffer  ← RN-safe method
 *   4. Upload ArrayBuffer to Supabase Storage
 *   5. Get public URL
 *   6. Persist URL via update_workspace_logo RPC
 */
async function _uploadFromUri(
  workspaceId: string,
  uri:         string,
): Promise<UploadLogoResult> {
  try {
    // ── Detect MIME ──────────────────────────────────────────────
    const uriLower  = uri.toLowerCase();
    let contentType = 'image/jpeg';
    let ext         = 'jpg';
    if      (uriLower.includes('.png'))  { contentType = 'image/png';  ext = 'png';  }
    else if (uriLower.includes('.webp')) { contentType = 'image/webp'; ext = 'webp'; }
    else if (uriLower.includes('.gif'))  { contentType = 'image/gif';  ext = 'gif';  }

    // Unique file name per workspace per upload
    const fileName = `${workspaceId}_${Date.now()}.${ext}`;

    // ── Read as base64 ───────────────────────────────────────────
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as any,
    });

    // ── Decode to ArrayBuffer (the only reliable RN method) ──────
    const arrayBuffer = decode(base64);

    // ── Upload ───────────────────────────────────────────────────
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, arrayBuffer, { contentType, upsert: true });

    if (uploadError) throw uploadError;

    // ── Get public URL ───────────────────────────────────────────
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // ── Persist to workspace (owner + editor via SECURITY DEFINER RPC) ──
    const { error: rpcError } = await supabase.rpc('update_workspace_logo', {
      p_workspace_id: workspaceId,
      p_avatar_url:   publicUrl,
    });

    if (rpcError) throw rpcError;

    return { url: publicUrl, error: null };
  } catch (err) {
    return {
      url:   null,
      error: err instanceof Error ? err.message : 'Upload failed',
    };
  }
}

/**
 * Attempts to delete a logo file from Supabase Storage.
 * Extracts the storage path from the full public URL.
 * Non-fatal — old files accumulate but never block the upload.
 */
async function _deleteStorageFile(publicUrl: string): Promise<void> {
  try {
    // Public URL format:
    // https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
    const marker = `/object/public/${BUCKET}/`;
    const idx    = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const filePath = publicUrl.slice(idx + marker.length);
    await supabase.storage.from(BUCKET).remove([filePath]);
  } catch {
    // Non-fatal, ignore
  }
}