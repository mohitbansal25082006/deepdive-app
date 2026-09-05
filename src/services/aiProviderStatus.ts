// src/services/aiProviderStatus.ts
// Part 59 — NEW. "Is Pexels configured?" without ever learning the key.
//
// A few screens need to distinguish "the stock photo search found nothing" from
// "stock photo search is switched off". Before Part 59 they answered that by
// reading process.env directly. Now the keys aren't in the app, so the answer
// comes from get_ai_provider_status(), an RPC that returns booleans and nothing
// else — no key, no hint, no length, no ciphertext.
//
// Cached in memory for the session and persisted to AsyncStorage so an offline
// cold start still renders the right empty states.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const CACHE_KEY = '@deepdive/provider_status_v1';
const TTL_MS    = 10 * 60 * 1000;

export interface ProviderStatus {
  openai: boolean;
  tavily: boolean;
  pexels: boolean;
  giphy:  boolean;
}

/**
 * Optimistic default. If the status lookup fails we assume providers ARE
 * configured and let the actual call surface the real error — showing
 * "unavailable" because a status ping failed would be a worse lie than
 * attempting the call.
 */
const OPTIMISTIC: ProviderStatus = {
  openai: true,
  tavily: true,
  pexels: true,
  giphy:  true,
};

let memoryCache: { value: ProviderStatus; at: number } | null = null;
let inFlight: Promise<ProviderStatus> | null = null;

function normalise(raw: unknown): ProviderStatus {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    openai: obj.openai === true,
    tavily: obj.tavily === true,
    pexels: obj.pexels === true,
    giphy:  obj.giphy  === true,
  };
}

async function readPersisted(): Promise<ProviderStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: ProviderStatus; at: number };
    if (Date.now() - parsed.at > TTL_MS) return null;
    return normalise(parsed.value);
  } catch {
    return null;
  }
}

async function writePersisted(value: ProviderStatus): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ value, at: Date.now() }));
  } catch { /* cache write failures are never fatal */ }
}

/**
 * Fetch provider availability. Safe to call on every render — concurrent calls
 * share one request and results are cached for 10 minutes.
 */
export async function getProviderStatus(force = false): Promise<ProviderStatus> {
  const now = Date.now();

  if (!force && memoryCache && now - memoryCache.at < TTL_MS) {
    return memoryCache.value;
  }
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    if (!force) {
      const persisted = await readPersisted();
      if (persisted) {
        memoryCache = { value: persisted, at: now };
        return persisted;
      }
    }

    try {
      const { data, error } = await supabase.rpc('get_ai_provider_status');
      if (error) throw new Error(error.message);

      const value = normalise(data);
      memoryCache = { value, at: Date.now() };
      writePersisted(value).catch(() => {});
      return value;
    } catch (err) {
      console.warn('[aiProviderStatus] lookup failed, assuming configured:', err);
      // Do NOT cache the optimistic fallback — retry on the next call.
      return OPTIMISTIC;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Convenience for a single provider. */
export async function isProviderConfigured(
  provider: keyof ProviderStatus,
): Promise<boolean> {
  const status = await getProviderStatus();
  return status[provider];
}

/** Call after an admin changes keys, or on pull-to-refresh. */
export function clearProviderStatusCache(): void {
  memoryCache = null;
  inFlight    = null;
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}