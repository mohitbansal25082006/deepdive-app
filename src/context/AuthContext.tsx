// src/context/AuthContext.tsx
// Part 43 FINAL FIX — Fixes OAuth setSession hanging/deadlock.
// MINI PLAYER FIX — Stops both audio engines on signOut so the mini player
//   cannot persist and crash when switching accounts.
//
// CHANGE from Part 43:
//   signOut() now calls AudioEngine.stop() and VoiceDebateEngine.stop() before
//   clearing React state. This ensures:
//     1. The mini player disappears immediately on logout.
//     2. No audio continues playing after the user signs out.
//     3. The engines are in a clean state before the next user signs in,
//        preventing the crash when signing into a different account.
//
// All other Part 43 logic unchanged.

import React, {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Session, User }            from '@supabase/supabase-js';
import { router }                   from 'expo-router';
import { supabase }                 from '../lib/supabase';
import { AudioEngine }              from '../services/GlobalAudioEngine';
import { VoiceDebateEngine }        from '../services/VoiceDebateAudioEngine';
import type { Profile }             from '../types';

interface AuthContextType {
  session:           Session | null;
  user:              User | null;
  profile:           Profile | null;
  loading:           boolean;
  profileLoading:    boolean;
  accountDeleted:    boolean;
  refreshProfile:    () => Promise<void>;
  signOut:           () => Promise<void>;
  clearDeletedState: () => void;
}

const AuthContext = createContext<AuthContextType>({
  session:           null,
  user:              null,
  profile:           null,
  loading:           true,
  profileLoading:    false,
  accountDeleted:    false,
  refreshProfile:    async () => {},
  signOut:           async () => {},
  clearDeletedState: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,        setSession]        = useState<Session | null>(null);
  const [user,           setUser]           = useState<User | null>(null);
  const [profile,        setProfile]        = useState<Profile | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);

  const accountDeletedRef  = useRef(false);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── fetchProfile ───────────────────────────────────────────────────────────
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!error && data) {
        setProfile(data as Profile);
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      setProfileLoading(true);
      await fetchProfile(user.id);
    }
  };

  // ── signOut ────────────────────────────────────────────────────────────────
  // MINI PLAYER FIX: stop both audio engines before clearing state.
  // This hides the mini player immediately and prevents the crash that
  // occurred when the engines still held references to the previous user's
  // audio while a new user was signing in.
  const signOut = async () => {
    // Stop all audio first — this causes both engines to broadcast
    // isVisible=false, which makes MiniPlayer unmount immediately.
    try {
      await AudioEngine.stop();
    } catch {
      // Non-fatal — engine may already be stopped
    }
    try {
      await VoiceDebateEngine.stop();
    } catch {
      // Non-fatal
    }

    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileLoading(false);
    await supabase.auth.signOut();
    if (!accountDeletedRef.current) {
      router.replace('/(auth)/onboarding');
    }
  };

  const clearDeletedState = () => {
    accountDeletedRef.current = false;
    setAccountDeleted(false);
    router.replace('/(auth)/onboarding');
  };

  // ── Realtime profile subscription ─────────────────────────────────────────
  const setupRealtimeProfile = (userId: string) => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`profile_changes_${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (!payload.new || typeof payload.new !== 'object') return;
          const updated = payload.new as Profile & { account_status?: string };

          if ((updated.account_status as string) === 'deleted') {
            accountDeletedRef.current = true;
            setAccountDeleted(true);
            setProfile(null);
            supabase.auth.signOut().catch(() => {});
            return;
          }

          setProfile((prev) => prev ? { ...prev, ...updated } : updated);
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  };

  const teardownRealtimeProfile = () => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  };

  // ── Auth state listener ────────────────────────────────────────────────────
  // CRITICAL FIX: All async work is wrapped in setTimeout(..., 0).
  // This prevents the setSession deadlock where onAuthStateChange awaits
  // async work while setSession waits for onAuthStateChange to return.
  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        // Stop engines here too — covers the case where signOut was triggered
        // externally (e.g. token expiry, admin deletion via Realtime).
        AudioEngine.stop().catch(() => {});
        VoiceDebateEngine.stop().catch(() => {});

        setSession(null);
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
        setLoading(false);
        teardownRealtimeProfile();
        if (!accountDeletedRef.current) {
          setTimeout(() => {
            if (mounted) router.replace('/(auth)/onboarding');
          }, 0);
        }
        return;
      }

      if (event === 'INITIAL_SESSION') {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          setProfileLoading(true);
          const uid = newSession.user.id;
          // ── KEY FIX: setTimeout defers async work, prevents deadlock ──────
          setTimeout(() => {
            if (mounted) {
              fetchProfile(uid).then(() => {
                if (mounted) setupRealtimeProfile(uid);
              });
            }
          }, 0);
        } else {
          setProfileLoading(false);
        }

        setLoading(false);
        return;
      }

      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        setProfileLoading(true);
        const uid = newSession.user.id;
        // ── KEY FIX: setTimeout defers async work, prevents deadlock ──────
        setTimeout(() => {
          if (mounted) {
            fetchProfile(uid).then(() => {
              if (mounted) setupRealtimeProfile(uid);
            });
          }
        }, 0);
      } else {
        setProfile(null);
        setProfileLoading(false);
        teardownRealtimeProfile();
      }
    });

    supabase.auth.getSession().catch((err) => {
      console.error('getSession error:', err);
      if (mounted) {
        setLoading(false);
        setProfileLoading(false);
      }
    });

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      appStateSub.remove();
      teardownRealtimeProfile();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session, user, profile, loading, profileLoading,
        accountDeleted,
        refreshProfile, signOut, clearDeletedState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);