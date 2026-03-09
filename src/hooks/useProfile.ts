// src/hooks/useProfile.ts
// Custom hook that handles all profile-related database operations.
//
// IMPORTANT SDK 54 FIX:
// expo-file-system was completely rewritten in SDK 54.
// The old API (readAsStringAsync, EncodingType) moved to 'expo-file-system/legacy'.
// We import from the legacy path so everything works exactly as before.

import { useState } from 'react';
import {
  readAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

export function useProfile() {
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ─────────────────────────────────────────────
  // Update profile fields in the database
  // ─────────────────────────────────────────────
  const updateProfile = async (userId: string, updates: Partial<Profile>) => {
    setUpdating(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to update profile' };
    } finally {
      setUpdating(false);
    }
  };

  // ─────────────────────────────────────────────
  // Upload avatar image to Supabase Storage
  //
  // Flow:
  //  1. Read image file as base64 string (legacy API)
  //  2. Decode base64 → Uint8Array (ArrayBuffer)
  //  3. Upload ArrayBuffer to Supabase Storage
  //  4. Return the public URL with cache-busting timestamp
  // ─────────────────────────────────────────────
  const uploadAvatar = async (userId: string, imageUri: string) => {
    setUploading(true);
    try {
      // Step 1 — Detect file extension from the image URI
      const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

      // Step 2 — Read the file as a base64 string
      // Using 'expo-file-system/legacy' because SDK 54 moved this API there
      const base64String = await readAsStringAsync(imageUri, {
        encoding: EncodingType.Base64,
      });

      // Step 3 — Convert the base64 string into a Uint8Array (binary buffer)
      // This is what Supabase Storage expects in React Native (not a Blob)
      const byteCharacters = atob(base64String);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }

      // Step 4 — Build a unique file path using userId + timestamp
      // Stored under userId/ folder to match our Supabase Storage RLS policy
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      // Step 5 — Upload to the 'avatars' bucket in Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, byteArray.buffer, {
          contentType: mimeType,
          upsert: true, // Overwrite any existing file at this path
        });

      if (uploadError) throw uploadError;

      // Step 6 — Get the permanent public URL for the uploaded image
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Append a timestamp query param to bust the image cache
      // Without this, the old avatar photo keeps showing after an update
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      return { url: publicUrl, error: null };
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      return { url: null, error: err.message || 'Failed to upload image' };
    } finally {
      setUploading(false);
    }
  };

  return { updateProfile, uploadAvatar, updating, uploading };
}