// src/types/collections.ts
// Part 35 — Collections: Type Definitions

// ─── Collection ───────────────────────────────────────────────────────────────

export type CollectionItemType = 'report' | 'podcast' | 'debate';

export interface Collection {
  id:          string;
  userId:      string;
  name:        string;
  description: string | null;
  color:       string;
  icon:        string;
  itemCount:   number;
  createdAt:   string;
  updatedAt:   string;
}

// ─── Collection Item ─────────────────────────────────────────────────────────

export interface CollectionItem {
  itemId:      string;
  contentType: CollectionItemType;
  contentId:   string;
  title:       string;
  subtitle:    string;
  depth?:      string;
  status?:     string;
  createdAt:   string;
  addedAt:     string;
}

// ─── State ────────────────────────────────────────────────────────────────────

export interface CollectionsState {
  collections:  Collection[];
  isLoading:    boolean;
  isCreating:   boolean;
  error:        string | null;
}

export interface CollectionDetailState {
  collection: Collection | null;
  items:      CollectionItem[];
  isLoading:  boolean;
  error:      string | null;
}

// ─── Create / Edit Input ─────────────────────────────────────────────────────

export interface CollectionInput {
  name:        string;
  description?: string;
  color:       string;
  icon:        string;
}

// ─── Preset colors & icons ────────────────────────────────────────────────────

export const COLLECTION_COLORS = [
  '#6C63FF', // purple (default)
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#8B5CF6', // violet
  '#F97316', // orange
  '#84CC16', // lime
] as const;

export const COLLECTION_ICONS = [
  { id: 'folder',           label: 'Folder'       },
  { id: 'bookmark',         label: 'Bookmark'     },
  { id: 'briefcase',        label: 'Work'         },
  { id: 'school',           label: 'Study'        },
  { id: 'flask',            label: 'Research'     },
  { id: 'trending-up',      label: 'Market'       },
  { id: 'bulb',             label: 'Ideas'        },
  { id: 'star',             label: 'Starred'      },
  { id: 'heart',            label: 'Favorites'    },
  { id: 'globe',            label: 'World'        },
  { id: 'code-slash',       label: 'Tech'         },
  { id: 'business',         label: 'Business'     },
  { id: 'medical',          label: 'Health'       },
  { id: 'newspaper',        label: 'News'         },
  { id: 'planet',           label: 'Science'      },
] as const;