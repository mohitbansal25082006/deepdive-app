// src/context/AuthContext.tsx
// Part 43 FINAL FIX — Fixes OAuth setSession hanging/deadlock.
//
// ROOT CAUSE OF "WHITE SCREEN + NEED RESTART":
//   Supabase explicitly warns: do NOT use await inside onAuthStateChange.
//   Our AuthContext called `await fetchProfile(uid)` directly inside the
//   onAuthStateChange callback. When OAuth called setSession(), Supabase
//   internally tried to fire onAuthStateChange and waited for it to complete
//   before resolving the setSession promise. But setSession itself is what
//   triggers onAuthStateChange — causing a DEADLOCK.
//   Result: setSession hangs forever → white screen → no navigation.
//   On restart: session already in AsyncStorage → getSession() reads it
//   without needing setSession → no deadlock → works.
//
// THE FIX:
//   Wrap ALL async work inside onAuthStateChange in setTimeout(..., 0).
//   This defers the async work to the next event loop tick, after
//   onAuthStateChange returns. setSession can then resolve immediately.
//   Navigation in signin.tsx then fires correctly without restart.
//
// All Part 32 suspension/deletion logic preserved exactly.
// All Part 31 credit balance realtime update preserved exactly.

import React, {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Session, User }            from '@supabase/supabase-js';
import { router }                   from 'expo-router';
import { supabase }                 from '../lib/supabase';
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
  const signOut = async () => {
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
        setSession(null);
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
        setLoading(false);
        teardownRealtimeProfile();
        if (!accountDeletedRef.current) {
          // Use setTimeout to defer navigation — prevents issues during
          // rapid state transitions (e.g. OAuth setSession then signOut)
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