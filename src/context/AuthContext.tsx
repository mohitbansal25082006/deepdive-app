// src/context/AuthContext.tsx
//
// FIXED: Removed the impossible comparison inside the SIGNED_OUT block.
// (event === 'INITIAL_SESSION' can never be true when event === 'SIGNED_OUT')
//
// KEY RULE: onAuthStateChange callback must be SYNCHRONOUS.
// Any await on a Supabase call inside it deadlocks the auth lock.
// Profile fetching is deferred via setTimeout to avoid this.

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

  // Called via setTimeout — never directly inside onAuthStateChange
  const fetchProfile = async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!error && data) {
        setProfile(data as Profile);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signOut = async () => {
    setSession(null);
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let mounted = true;

    // ── SYNCHRONOUS callback — no async, no await ─────────────────────────
    // Using async here or awaiting any Supabase method inside will deadlock
    // the auth internal lock, causing signInWithPassword / updateUser to hang
    // after receiving a 200 OK from the server.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (event === 'INITIAL_SESSION') {
        // Synchronously set state from the stored session
        setSession(newSession);
        setUser(newSession?.user ?? null);
        // Mark loading done — this unblocks index.tsx routing
        setLoading(false);
        // Defer profile fetch to after this callback returns (lock released)
        if (newSession?.user) {
          const uid = newSession.user.id;
          setTimeout(() => { if (mounted) fetchProfile(uid); }, 0);
        }
        return;
      }

      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, etc.
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        const uid = newSession.user.id;
        // Defer profile fetch — must not await inside this callback
        setTimeout(() => { if (mounted) fetchProfile(uid); }, 0);
      } else {
        setProfile(null);
      }
    });

    // Trigger the INITIAL_SESSION event above
    supabase.auth.getSession().catch((err) => {
      console.error('getSession error:', err);
      if (mounted) setLoading(false);
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