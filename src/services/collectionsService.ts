// src/services/collectionsService.ts
// Part 35 — Collections: CRUD operations via Supabase
//
// All functions are async and return { data, error } style results
// so the caller (hook) decides how to handle errors.

import { supabase }           from '../lib/supabase';
import {
  Collection,
  CollectionItem,
  CollectionInput,
  CollectionItemType,
} from '../types/collections';

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapCollection(row: Record<string, unknown>): Collection {
  return {
    id:          row.id          as string,
    userId:      row.user_id     as string,
    name:        row.name        as string,
    description: (row.description as string | null) ?? null,
    color:       (row.color      as string) ?? '#6C63FF',
    icon:        (row.icon       as string) ?? 'folder',
    itemCount:   Number(row.item_count ?? 0),
    createdAt:   row.created_at  as string,
    updatedAt:   row.updated_at  as string,
  };
}

function mapCollectionItem(row: Record<string, unknown>): CollectionItem {
  return {
    itemId:      row.item_id     as string,
    contentType: row.content_type as CollectionItemType,
    contentId:   row.content_id  as string,
    title:       (row.title      as string) ?? 'Untitled',
    subtitle:    (row.subtitle   as string) ?? '',
    depth:       row.depth       as string | undefined,
    status:      row.status      as string | undefined,
    createdAt:   row.created_at  as string,
    addedAt:     row.added_at    as string,
  };
}

// ─── Fetch All Collections ────────────────────────────────────────────────────

export async function fetchCollections(userId: string): Promise<{
  data: Collection[] | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc('get_user_collections', {
      p_user_id: userId,
    });
    if (error) return { data: null, error: error.message };
    return {
      data: (data as any[] ?? []).map(r => mapCollection(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Create Collection ────────────────────────────────────────────────────────

export async function createCollection(
  userId: string,
  input:  CollectionInput,
): Promise<{ data: Collection | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('collections')
      .insert({
        user_id:     userId,
        name:        input.name.trim(),
        description: input.description?.trim() || null,
        color:       input.color,
        icon:        input.icon,
      })
      .select()
      .single();

    if (error) return { data: null, error: error.message };
    return { data: mapCollection(data as Record<string, unknown>), error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Update Collection ────────────────────────────────────────────────────────

export async function updateCollection(
  collectionId: string,
  userId:       string,
  input:        Partial<CollectionInput>,
): Promise<{ error: string | null }> {
  try {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name        !== undefined) updates.name        = input.name.trim();
    if (input.description !== undefined) updates.description = input.description?.trim() || null;
    if (input.color       !== undefined) updates.color       = input.color;
    if (input.icon        !== undefined) updates.icon        = input.icon;

    const { error } = await supabase
      .from('collections')
      .update(updates)
      .eq('id', collectionId)
      .eq('user_id', userId);

    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Delete Collection ────────────────────────────────────────────────────────

export async function deleteCollection(
  collectionId: string,
  userId:       string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('id', collectionId)
      .eq('user_id', userId);

    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Fetch Items in a Collection ─────────────────────────────────────────────

export async function fetchCollectionItems(
  collectionId: string,
  userId:       string,
): Promise<{ data: CollectionItem[] | null; error: string | null }> {
  try {
    const { data, error } = await supabase.rpc('get_collection_items_detailed', {
      p_collection_id: collectionId,
      p_user_id:       userId,
    });
    if (error) return { data: null, error: error.message };
    return {
      data: (data as any[] ?? []).map(r => mapCollectionItem(r as Record<string, unknown>)),
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Add Item to Collection ───────────────────────────────────────────────────

export async function addToCollection(
  collectionId: string,
  userId:       string,
  contentType:  CollectionItemType,
  contentId:    string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('collection_items')
      .insert({
        collection_id: collectionId,
        user_id:       userId,
        content_type:  contentType,
        content_id:    contentId,
      });

    if (error) {
      // Unique constraint violation = already added — treat as success
      if (error.code === '23505') return { error: null };
      return { error: error.message };
    }
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Remove Item from Collection ─────────────────────────────────────────────

export async function removeFromCollection(
  collectionId: string,
  userId:       string,
  contentType:  CollectionItemType,
  contentId:    string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('collection_items')
      .delete()
      .eq('collection_id', collectionId)
      .eq('user_id',        userId)
      .eq('content_type',   contentType)
      .eq('content_id',     contentId);

    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Remove Item from All Collections ────────────────────────────────────────

export async function removeFromAllCollections(
  userId:      string,
  contentType: CollectionItemType,
  contentId:   string,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('collection_items')
      .delete()
      .eq('user_id',      userId)
      .eq('content_type', contentType)
      .eq('content_id',   contentId);

    return { error: error?.message ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Get Collections Containing an Item ──────────────────────────────────────

export async function getItemCollectionIds(
  userId:      string,
  contentType: CollectionItemType,
  contentId:   string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('get_item_collection_ids', {
      p_user_id:      userId,
      p_content_type: contentType,
      p_content_id:   contentId,
    });
    if (error || !data) return [];
    return (data as any[]).map(r => r.collection_id as string);
  } catch {
    return [];
  }
}

// ─── Toggle: Add or Remove based on current state ────────────────────────────

export async function toggleCollectionItem(
  collectionId: string,
  userId:       string,
  contentType:  CollectionItemType,
  contentId:    string,
  currentlyIn:  boolean,
): Promise<{ error: string | null }> {
  if (currentlyIn) {
    return removeFromCollection(collectionId, userId, contentType, contentId);
  }
  return addToCollection(collectionId, userId, contentType, contentId);
}