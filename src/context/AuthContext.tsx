// src/context/AuthContext.tsx
// Part 32 UPDATE (v3) — Fixed account deletion detection.
//
// PROBLEM WITH v2:
//   Subscribing to postgres_changes DELETE events on profiles is unreliable.
//   When auth.admin.deleteUser() is called server-side, Supabase invalidates
//   the user's JWT immediately. By the time the cascade DELETE reaches the
//   profiles table, Realtime has already dropped the user's connection because
//   their token is invalid. The DELETE event is never delivered.
//
// FIX in v3:
//   The admin DELETE API now sets account_status = 'deleted' FIRST (UPDATE),
//   THEN deletes the auth user after 800ms. The UPDATE event is delivered
//   reliably because the JWT is still valid at that point.
//
//   AuthContext now handles account_status === 'deleted' in the UPDATE handler:
//   - Sets accountDeleted = true and accountDeletedRef = true
//   - Clears profile state
//   - Signs out from Supabase (triggers SIGNED_OUT)
//   - SIGNED_OUT handler skips onboarding redirect (accountDeletedRef = true)
//   - app/(app)/_layout.tsx shows <AccountDeletedScreen /> overlay
//
//   The DELETE postgres_changes subscription has been REMOVED — it is
//   unreliable and no longer needed with this approach.
//
// All Part 1–31 logic preserved unchanged.

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus }    from 'react-native';
import { Session, User }               from '@supabase/supabase-js';
import { router }                      from 'expo-router';
import { supabase }                    from '../lib/supabase';
import type { Profile }                from '../types';

interface AuthContextType {
  session:           Session | null;
  user:              User | null;
  profile:           Profile | null;
  loading:           boolean;
  profileLoading:    boolean;
  accountDeleted:    boolean;          // true when admin set account_status='deleted'
  refreshProfile:    () => Promise<void>;
  signOut:           () => Promise<void>;
  clearDeletedState: () => void;       // called by AccountDeletedScreen CTA
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

  // accountDeleted: set to true when the server-side UPDATE event fires with
  // account_status = 'deleted'. In-memory only — no persistence needed because
  // once deleted, sign-in fails at the Supabase level.
  const [accountDeleted, setAccountDeleted] = useState(false);

  // Ref so the synchronous SIGNED_OUT handler can read the latest value
  // without stale closure issues (useState setter updates are async).
  const accountDeletedRef = useRef(false);

  // One Realtime channel for profile UPDATE events (suspension + deletion).
  // DELETE event subscription removed — see header comment for why.
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
    // Only route to onboarding for voluntary sign-outs.
    // Deletion: accountDeletedRef is already true → skip routing.
    if (!accountDeletedRef.current) {
      router.replace('/(auth)/onboarding');
    }
  };

  // ── clearDeletedState — called by AccountDeletedScreen "Go to Sign In" ─────

  const clearDeletedState = () => {
    accountDeletedRef.current = false;
    setAccountDeleted(false);
    router.replace('/(auth)/onboarding');
  };

  // ── Realtime profile subscription ─────────────────────────────────────────
  // Handles UPDATE events only:
  //   • account_status = 'suspended' → isSuspended overlay in _layout
  //   • account_status = 'deleted'   → accountDeleted overlay in _layout
  //   • any other profile change     → reflects in local profile state

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

          // ── Account deleted by admin ──────────────────────────────────────
          // The admin DELETE route sets account_status='deleted' before
          // deleting the auth user. We catch it here as a reliable UPDATE event.
          // Cast to string first so TypeScript doesn't complain if the type
          // union doesn't yet include 'deleted' in a stale build cache.
          if ((updated.account_status as string) === 'deleted') {
            // Set ref synchronously so SIGNED_OUT handler sees it immediately
            accountDeletedRef.current = true;
            setAccountDeleted(true);
            setProfile(null);

            // Sign out from Supabase client to clear the local session.
            // SIGNED_OUT event will fire — accountDeletedRef=true prevents
            // the handler from redirecting to onboarding.
            supabase.auth.signOut().catch(() => {});
            return;
          }

          // ── Normal profile update (suspension, flag, name change, etc.) ───
          setProfile((prev) =>
            prev ? { ...prev, ...updated } : updated,
          );
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

        // If accountDeletedRef is true, the sign-out was triggered by our own
        // supabase.auth.signOut() call inside the DELETE Realtime handler.
        // The AccountDeletedScreen overlay is already showing — do NOT redirect.
        if (!accountDeletedRef.current) {
          router.replace('/(auth)/onboarding');
        }
        return;
      }

      if (event === 'INITIAL_SESSION') {
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Set profileLoading=true synchronously (Part 31 race condition fix)
          setProfileLoading(true);
          const uid = newSession.user.id;
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