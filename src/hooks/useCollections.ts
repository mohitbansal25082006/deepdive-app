// src/hooks/useCollections.ts
// Part 35 — Collections: React hook
//
// Manages collections list, item membership, and all CRUD operations.
// Used by the Collections manager sheet, detail screen, and "add to collection" sheet.

import { useState, useCallback, useEffect } from 'react';
import { useAuth }               from '../context/AuthContext';
import {
  fetchCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  fetchCollectionItems,
  addToCollection,
  removeFromCollection,
  getItemCollectionIds,
  toggleCollectionItem,
}                                from '../services/collectionsService';
import {
  Collection,
  CollectionItem,
  CollectionInput,
  CollectionItemType,
}                                from '../types/collections';

// ─── Collections List Hook ────────────────────────────────────────────────────

export interface UseCollectionsReturn {
  collections:   Collection[];
  isLoading:     boolean;
  isCreating:    boolean;
  error:         string | null;
  refresh:       () => Promise<void>;
  create:        (input: CollectionInput) => Promise<Collection | null>;
  update:        (id: string, input: Partial<CollectionInput>) => Promise<boolean>;
  remove:        (id: string) => Promise<boolean>;
}

export function useCollections(): UseCollectionsReturn {
  const { user } = useAuth();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isCreating,  setIsCreating]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: err } = await fetchCollections(user.id);
      if (err) setError(err);
      else     setCollections(data ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (input: CollectionInput): Promise<Collection | null> => {
    if (!user) return null;
    setIsCreating(true);
    try {
      const { data, error: err } = await createCollection(user.id, input);
      if (err || !data) { setError(err ?? 'Failed to create collection'); return null; }
      setCollections(prev => [data, ...prev]);
      return data;
    } finally {
      setIsCreating(false);
    }
  }, [user]);

  const update = useCallback(async (id: string, input: Partial<CollectionInput>): Promise<boolean> => {
    if (!user) return false;
    const { error: err } = await updateCollection(id, user.id, input);
    if (err) { setError(err); return false; }
    setCollections(prev => prev.map(c =>
      c.id === id
        ? { ...c, ...input, updatedAt: new Date().toISOString() }
        : c
    ));
    return true;
  }, [user]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!user) return false;
    // Optimistic
    setCollections(prev => prev.filter(c => c.id !== id));
    const { error: err } = await deleteCollection(id, user.id);
    if (err) {
      setError(err);
      refresh(); // revert
      return false;
    }
    return true;
  }, [user, refresh]);

  return { collections, isLoading, isCreating, error, refresh, create, update, remove };
}

// ─── Collection Detail Hook ───────────────────────────────────────────────────

export interface UseCollectionDetailReturn {
  collection:   Collection | null;
  items:        CollectionItem[];
  isLoading:    boolean;
  error:        string | null;
  refresh:      () => Promise<void>;
  removeItem:   (contentType: CollectionItemType, contentId: string) => Promise<boolean>;
}

export function useCollectionDetail(collectionId: string | null): UseCollectionDetailReturn {
  const { user } = useAuth();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items,      setItems]      = useState<CollectionItem[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !collectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      // Fetch collection meta
      const { data: cols } = await fetchCollections(user.id);
      const col = (cols ?? []).find(c => c.id === collectionId) ?? null;
      setCollection(col);

      // Fetch items
      const { data: itemData, error: err } = await fetchCollectionItems(collectionId, user.id);
      if (err) setError(err);
      else     setItems(itemData ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [user, collectionId]);

  useEffect(() => { refresh(); }, [refresh]);

  const removeItem = useCallback(async (
    contentType: CollectionItemType,
    contentId:   string,
  ): Promise<boolean> => {
    if (!user || !collectionId) return false;
    // Optimistic
    setItems(prev => prev.filter(i => !(i.contentType === contentType && i.contentId === contentId)));
    setCollection(prev => prev ? { ...prev, itemCount: Math.max(0, prev.itemCount - 1) } : null);

    const { error: err } = await removeFromCollection(collectionId, user.id, contentType, contentId);
    if (err) {
      setError(err);
      refresh();
      return false;
    }
    return true;
  }, [user, collectionId, refresh]);

  return { collection, items, isLoading, error, refresh, removeItem };
}

// ─── Item Collection Membership Hook ─────────────────────────────────────────
// Used by AddToCollectionSheet to know which collections already contain an item.

export interface UseItemCollectionsReturn {
  memberIds:   string[];   // collection IDs that contain this item
  isLoading:   boolean;
  toggle:      (collectionId: string, currentlyIn: boolean) => Promise<boolean>;
  reload:      () => Promise<void>;
}

export function useItemCollections(
  contentType: CollectionItemType | null,
  contentId:   string | null,
): UseItemCollectionsReturn {
  const { user } = useAuth();

  const [memberIds,  setMemberIds]  = useState<string[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);

  const reload = useCallback(async () => {
    if (!user || !contentType || !contentId) return;
    setIsLoading(true);
    try {
      const ids = await getItemCollectionIds(user.id, contentType, contentId);
      setMemberIds(ids);
    } finally {
      setIsLoading(false);
    }
  }, [user, contentType, contentId]);

  useEffect(() => { reload(); }, [reload]);

  const toggle = useCallback(async (
    collectionId: string,
    currentlyIn:  boolean,
  ): Promise<boolean> => {
    if (!user || !contentType || !contentId) return false;

    // Optimistic update
    setMemberIds(prev =>
      currentlyIn
        ? prev.filter(id => id !== collectionId)
        : [...prev, collectionId]
    );

    const { error: err } = await toggleCollectionItem(
      collectionId, user.id, contentType, contentId, currentlyIn
    );

    if (err) {
      // Revert
      setMemberIds(prev =>
        currentlyIn
          ? [...prev, collectionId]
          : prev.filter(id => id !== collectionId)
      );
      return false;
    }
    return true;
  }, [user, contentType, contentId]);

  return { memberIds, isLoading, toggle, reload };
}