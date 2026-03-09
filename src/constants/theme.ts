// src/constants/theme.ts
// This is your design system — all colors, fonts, spacing, etc.
// Changing a value here updates it everywhere in the app.

export const COLORS = {
  // Primary brand colors
  primary: '#6C63FF',        // Purple — main brand color
  primaryLight: '#8B85FF',   // Lighter purple for hover states
  primaryDark: '#4A42CC',    // Darker purple for pressed states

  // Secondary accent
  secondary: '#FF6584',      // Pink accent
  accent: '#43E97B',         // Green for success states

  // Background layers
  background: '#0A0A1A',     // Deepest background (nearly black)
  backgroundCard: '#12122A', // Card background
  backgroundElevated: '#1A1A35', // Slightly elevated surfaces

  // Text colors
  textPrimary: '#FFFFFF',    // Main text
  textSecondary: '#A0A0C0',  // Subtitles, captions
  textMuted: '#5A5A7A',      // Placeholder, disabled text

  // Border colors
  border: '#2A2A4A',         // Subtle border
  borderFocus: '#6C63FF',    // Focused input border

  // Status colors
  success: '#43E97B',
  error: '#FF4757',
  warning: '#FFA726',
  info: '#29B6F6',

  // Gradients (used with LinearGradient)
  gradientPrimary: ['#6C63FF', '#8B5CF6'] as const,
  gradientSecondary: ['#FF6584', '#FF8E53'] as const,
  gradientDark: ['#0A0A1A', '#12122A'] as const,
  gradientCard: ['#1A1A35', '#12122A'] as const,
  gradientSuccess: ['#43E97B', '#38F9D7'] as const,
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 34,
    '4xl': 42,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const SHADOWS = {
  small: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  medium: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  large: {
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
  },
};