// src/context/AuthContext.tsx
//
// FIX: Profile setup screen showing every time app is opened.
//
// ROOT CAUSE — race condition:
//   onAuthStateChange fires INITIAL_SESSION → setLoading(false) runs
//   synchronously → index.tsx useEffect triggers immediately.
//   At that exact moment profile=null and profileLoading=false because
//   fetchProfile is deferred in setTimeout and hasn't started yet.
//   index.tsx sees (session=true, profile=null, profileLoading=false)
//   and incorrectly routes to profile-setup every single time.
//
// FIX:
//   Set profileLoading=true SYNCHRONOUSLY inside onAuthStateChange
//   BEFORE the setTimeout. This way index.tsx sees profileLoading=true
//   and waits (returns early) until fetchProfile finishes and sets
//   the real profile data, then routes correctly based on profile_completed.

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // fetchProfile is always called outside onAuthStateChange (via setTimeout)
  // to avoid the Supabase internal lock deadlock.
  const fetchProfile = async (userId: string) => {
    // Note: we do NOT set profileLoading=true here because it is already
    // set synchronously in onAuthStateChange before this is called.
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

  const signOut = async () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let mounted = true;

    // CRITICAL: This callback must stay SYNCHRONOUS.
    // Never use async here or await any Supabase method inside —
    // doing so deadlocks the auth lock and breaks signIn/updateUser.
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
        return;
      }

      if (event === 'INITIAL_SESSION') {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // ── KEY FIX ──────────────────────────────────────────────────────
          // Set profileLoading=true HERE, synchronously, before setTimeout.
          // index.tsx checks (session && profileLoading) and returns early,
          // so it waits for the real profile data before making any routing
          // decision. Without this, index.tsx sees profile=null immediately
          // and wrongly redirects to profile-setup on every app open.
          setProfileLoading(true);
          const uid = newSession.user.id;
          setTimeout(() => {
            if (mounted) fetchProfile(uid);
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
        // Same fix for all other events — set loading true before setTimeout
        setProfileLoading(true);
        const uid = newSession.user.id;
        setTimeout(() => {
          if (mounted) fetchProfile(uid);
        }, 0);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    // Triggers the INITIAL_SESSION event above
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
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, profileLoading, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);