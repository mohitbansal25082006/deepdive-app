// src/lib/presentationAssetCache.ts
// Part 41.7 — Downloads and caches all remote image/SVG assets for a
// presentation so that offline PPTX/PDF/HTML export works without any network.
//
// WHAT THIS SOLVES:
//   In offline mode, SlideExportRenderer renders SlideCard components that
//   reference remote URLs (onlineUrl from SerpAPI image search, Iconify SVG
//   URLs). Those fetch calls fail offline, producing blank/broken captures.
//   The vector fallback (pptxExport.ts) also fetches those URLs and silently
//   skips them. Result: exported files are missing all images and icons.
//
// HOW THIS FIXES IT:
//   When a presentation is auto-cached (online), this module:
//     1. Walks every slide's editorData.additionalBlocks looking for
//        image blocks (onlineUrl / uri) and icon blocks (iconifyId).
//     2. Downloads each remote resource to documentDirectory.
//     3. Stores a JSON manifest (url → localPath) next to the cache file.
//
//   When offline export runs, resolveLocalAssets() reads the manifest and
//   patches every slide's blocks to replace remote URLs with local file paths.
//   SlideCard then renders local images — no network needed.
//
// MANIFEST FILE:
//   Stored at: deepdive_cache/presentations/<id>_assets.json
//   Format:    { [remoteUrl: string]: localFilePath: string }
//
// ─────────────────────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system/legacy';
import type { GeneratedPresentation, PresentationSlide } from '../types';
import type { AdditionalBlock, SlideEditorData } from '../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_DIR   = `${FileSystem.documentDirectory}deepdive_cache/presentations/`;
const ASSET_DIR   = `${FileSystem.documentDirectory}deepdive_cache/pres_assets/`;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Maps remote URL / Iconify ID → local file:// path */
export type AssetManifest = Record<string, string>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);
}

function manifestPath(presentationId: string): string {
  return `${CACHE_DIR}${safeId(presentationId)}_assets.json`;
}

async function ensureDirs(): Promise<void> {
  for (const dir of [CACHE_DIR, ASSET_DIR]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

function extFromUrl(url: string): string {
  const clean = url.split('?')[0];
  const parts = clean.split('.');
  const ext   = parts[parts.length - 1]?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return ext;
  return 'jpg';
}

// ─── Asset collection ─────────────────────────────────────────────────────────

interface AssetItem {
  url:  string;   // remote URL to fetch
  type: 'image' | 'svg';
}

/** Walk all slides and collect every remote asset URL that needs caching. */
function collectAssets(presentation: GeneratedPresentation): AssetItem[] {
  const seen  = new Set<string>();
  const items: AssetItem[] = [];

  for (const slide of presentation.slides) {
    const ed = (slide as any).editorData as SlideEditorData | undefined;
    const blocks: AdditionalBlock[] = ed?.additionalBlocks ?? [];

    for (const block of blocks) {
      if (block.type === 'image') {
        // onlineUrl takes priority (SerpAPI images); uri may be local already
        const url = (block as any).onlineUrl as string | undefined;
        if (url && url.startsWith('http') && !seen.has(url)) {
          seen.add(url);
          items.push({ url, type: 'image' });
        }
        // Also handle uri if it's remote
        const uri = block.uri;
        if (uri && uri.startsWith('http') && !seen.has(uri)) {
          seen.add(uri);
          items.push({ url: uri, type: 'image' });
        }
      }

      if (block.type === 'icon') {
        // svgData is already embedded XML — no download needed
        // But if iconifyId exists and svgData is missing, fetch from Iconify API
        const iconifyId = (block as any).iconifyId as string | undefined;
        const svgData   = (block as any).svgData   as string | undefined;
        if (iconifyId && !svgData) {
          const [prefix, name] = iconifyId.split(':');
          if (prefix && name) {
            const url = `https://api.iconify.design/${prefix}/${name}.svg`;
            if (!seen.has(url)) {
              seen.add(url);
              items.push({ url, type: 'svg' });
            }
          }
        }
      }
    }
  }

  return items;
}

// ─── Download one asset ───────────────────────────────────────────────────────

async function downloadAsset(
  url:      string,
  type:     'image' | 'svg',
  manifest: AssetManifest,
): Promise<void> {
  try {
    const hash  = url.replace(/[^a-zA-Z0-9]/g, '_').slice(-60);
    const ext   = type === 'svg' ? 'svg' : extFromUrl(url);
    const local = `${ASSET_DIR}${hash}.${ext}`;

    // Skip if already downloaded
    const info = await FileSystem.getInfoAsync(local);
    if (info.exists) {
      manifest[url] = local;
      return;
    }

    if (type === 'svg') {
      // Fetch SVG text and write as UTF-8 (so we can embed inline later)
      const resp = await fetch(url, { headers: { Accept: 'image/svg+xml' } });
      if (!resp.ok) return;
      const text = await resp.text();
      await FileSystem.writeAsStringAsync(local, text, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } else {
      // Download binary image via expo-file-system
      const result = await FileSystem.downloadAsync(url, local);
      if (result.status !== 200) {
        try { await FileSystem.deleteAsync(local, { idempotent: true }); } catch {}
        return;
      }
    }

    manifest[url] = local;
    console.log(`[PresentationAssetCache] ✅ cached: ${url.slice(-50)}`);
  } catch (err) {
    console.warn(`[PresentationAssetCache] ⚠️ failed: ${url.slice(-50)}`, err);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Download all remote images and SVGs referenced by this presentation and
 * save a manifest file alongside the cached JSON.
 *
 * Called from autoCachePresentation() after the main JSON is stored.
 * Fire-and-forget safe — failures are silently logged.
 */
export async function cachePresentationAssets(
  presentation: GeneratedPresentation,
): Promise<void> {
  if (!presentation.id) return;

  try {
    await ensureDirs();

    const assets = collectAssets(presentation);
    if (assets.length === 0) return;

    console.log(
      `[PresentationAssetCache] 📦 caching ${assets.length} assets for presentation ${presentation.id}`,
    );

    // Load existing manifest (if any) so we don't re-download on re-cache
    const existing = await loadAssetManifest(presentation.id);
    const manifest: AssetManifest = { ...existing };

    // Download concurrently (max 3 at a time to avoid overwhelming network)
    const BATCH = 3;
    for (let i = 0; i < assets.length; i += BATCH) {
      const batch = assets.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(a => downloadAsset(a.url, a.type, manifest)),
      );
    }

    // Save manifest
    await saveAssetManifest(presentation.id, manifest);
    console.log(
      `[PresentationAssetCache] 🏁 done — ${Object.keys(manifest).length} assets cached`,
    );
  } catch (err) {
    console.warn('[PresentationAssetCache] cachePresentationAssets error:', err);
  }
}

/**
 * Load the asset manifest for a presentation.
 * Returns empty object if none exists.
 */
export async function loadAssetManifest(
  presentationId: string,
): Promise<AssetManifest> {
  try {
    const path = manifestPath(presentationId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return {};
    const raw = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as AssetManifest;
  } catch {
    return {};
  }
}

/**
 * Save the asset manifest for a presentation.
 */
export async function saveAssetManifest(
  presentationId: string,
  manifest:       AssetManifest,
): Promise<void> {
  try {
    await ensureDirs();
    const path = manifestPath(presentationId);
    await FileSystem.writeAsStringAsync(path, JSON.stringify(manifest), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('[PresentationAssetCache] saveAssetManifest error:', err);
  }
}

/**
 * Delete the asset manifest and all downloaded files for a presentation.
 * Called when the presentation is evicted from cache.
 */
export async function evictPresentationAssets(
  presentationId: string,
): Promise<void> {
  try {
    const manifest = await loadAssetManifest(presentationId);
    for (const localPath of Object.values(manifest)) {
      try {
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      } catch {}
    }
    const mp = manifestPath(presentationId);
    try { await FileSystem.deleteAsync(mp, { idempotent: true }); } catch {}
  } catch (err) {
    console.warn('[PresentationAssetCache] evictPresentationAssets error:', err);
  }
}

/**
 * Patch a presentation's slide blocks so that every remote URL is replaced
 * with its local file:// counterpart (from the manifest).
 *
 * Also patches svgData on icon blocks where the SVG was downloaded as a file
 * (reads the SVG text and inlines it so SlideCard's SvgXml gets the XML).
 *
 * Returns a new GeneratedPresentation object with patched slides.
 * The original is not mutated.
 */
export async function resolveLocalAssets(
  presentation: GeneratedPresentation,
): Promise<GeneratedPresentation> {
  if (!presentation.id) return presentation;

  const manifest = await loadAssetManifest(presentation.id);
  if (Object.keys(manifest).length === 0) return presentation;

  // Deep-clone slides (we only need to patch editorData.additionalBlocks)
  const patchedSlides = await Promise.all(
    presentation.slides.map(async slide => {
      const ed = (slide as any).editorData as SlideEditorData | undefined;
      if (!ed?.additionalBlocks?.length) return slide;

      const patchedBlocks = await Promise.all(
        ed.additionalBlocks.map(async (block): Promise<AdditionalBlock> => {

          if (block.type === 'image') {
            const onlineUrl = (block as any).onlineUrl as string | undefined;
            const uri       = block.uri;

            // Replace onlineUrl with local path
            const localOnline = onlineUrl ? manifest[onlineUrl] : undefined;
            // Replace uri with local path if it was a remote URL
            const localUri    = uri && uri.startsWith('http') ? manifest[uri] : undefined;

            if (localOnline || localUri) {
              return {
                ...block,
                uri:       localUri    ?? (localOnline ?? uri),
                onlineUrl: localOnline ?? onlineUrl,
              } as any;
            }
            return block;
          }

          if (block.type === 'icon') {
            // If svgData already present (embedded XML), nothing to do
            const svgData = (block as any).svgData as string | undefined;
            if (svgData) return block;

            // If we downloaded the SVG file, read and inline it
            const iconifyId = (block as any).iconifyId as string | undefined;
            if (iconifyId) {
              const [prefix, name] = iconifyId.split(':');
              if (prefix && name) {
                const url       = `https://api.iconify.design/${prefix}/${name}.svg`;
                const localPath = manifest[url];
                if (localPath) {
                  try {
                    const svgText = await FileSystem.readAsStringAsync(localPath, {
                      encoding: FileSystem.EncodingType.UTF8,
                    });
                    return { ...block, svgData: svgText } as any;
                  } catch {}
                }
              }
            }
            return block;
          }

          return block;
        }),
      );

      const patchedEd: SlideEditorData = {
        ...ed,
        additionalBlocks: patchedBlocks,
      };

      return {
        ...slide,
        editorData: patchedEd,
      } as PresentationSlide;
    }),
  );

  return {
    ...presentation,
    slides: patchedSlides,
  };
}