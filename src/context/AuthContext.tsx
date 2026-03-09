// src/context/AuthContext.tsx
// A React Context is like a global state that any component can access.
// This AuthContext tells every screen whether the user is logged in or not.

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';

// Define what data the context provides
interface AuthContextType {
  session: Session | null;          // The auth session (contains tokens)
  user: User | null;                // The logged-in user object
  profile: Profile | null;          // The user's profile from our database
  loading: boolean;                 // True while checking auth status
  profileLoading: boolean;          // True while loading profile
  refreshProfile: () => Promise<void>; // Call this to reload profile data
  signOut: () => Promise<void>;     // Call this to sign out
}

// Create the context with default values
const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  profileLoading: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

// AuthProvider wraps the whole app and provides auth data to all screens
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Fetch the user's profile from the database
  const fetchProfile = async (userId: string) => {
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
      } else {
        setProfile(data as Profile);
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  // refreshProfile is called after user updates their profile
  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  // Sign out the user
  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  // This runs once when the app starts
  // It checks if the user is already logged in (has a saved session)
  useEffect(() => {
    // Get the current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    // Cleanup listener when component unmounts
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, profileLoading, refreshProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook — makes it easy to use auth in any component
// Instead of: const auth = useContext(AuthContext)
// You write: const { user } = useAuth()
export const useAuth = () => useContext(AuthContext);