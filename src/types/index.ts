// src/types/index.ts
// TypeScript types ensure data has the right shape everywhere in the app

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  occupation: string | null;
  interests: string[] | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  created_at: string;
}

export interface OnboardingSlide {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;       // Ionicon name
  gradientColors: readonly [string, string];
}