// ─────────────────────────────────────────────────────────────────────────────
// components/ThemeToggle.tsx
// Part 55.9 — Theme Toggle Button (Navbar + Floating variants)
// Beautiful theme picker trigger with dual modes: navbar and floating
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import ThemePickerModal from './ThemePickerModal';
import { COLORS } from '../constants/theme';

interface ThemeToggleProps {
  /** Display as a compact navbar button instead of floating FAB */
  variant?: 'navbar' | 'floating';
  /** Size variant for navbar */
  size?: 'sm' | 'md';
  /** Additional className for styling */
  className?: string;
}

export default function ThemeToggle({ 
  variant = 'floating', 
  size = 'md',
  className = '',
}: ThemeToggleProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { themeId, resolvedMode, mode } = useTheme();

  // Get the current theme's swatch color
  const getSwatchColor = () => COLORS.primary;

  // ─── Floating FAB variant ──────────────────────────────────────────────────
  if (variant === 'floating') {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 ${className}`}
          style={{
            background: `linear-gradient(135deg, ${COLORS.gradientPrimary[0]}, ${COLORS.gradientPrimary[1]})`,
            boxShadow: `0 8px 32px ${COLORS.primary}44`,
            border: `2px solid ${COLORS.primary}66`,
          }}
          aria-label="Open theme picker"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
            <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
            <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
          </svg>
          {/* Small dot showing current theme color */}
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-lg"
            style={{ backgroundColor: getSwatchColor() }}
          />
        </button>

        <ThemePickerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </>
    );
  }

  // ─── Navbar variant ──────────────────────────────────────────────────────
  const isSmall = size === 'sm';
  const iconSize = isSmall ? 16 : 18;
  const padding = isSmall ? '6px 10px' : '8px 14px';
  const fontSize = isSmall ? '0.75rem' : '0.8125rem';
  const gap = isSmall ? 4 : 6;

  // Get mode label for display
  const getModeLabel = () => {
    if (mode === 'system') return '🌓';
    return mode === 'dark' ? '🌙' : '☀️';
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`tap-btn flex items-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95 ${className}`}
        style={{
          padding,
          minHeight: isSmall ? 32 : 38,
          gap,
          background: `linear-gradient(135deg, ${COLORS.gradientPrimary[0]}15, ${COLORS.gradientPrimary[1]}15)`,
          border: `1.5px solid ${COLORS.primary}40`,
          color: COLORS.textPrimary,
          fontSize,
          fontWeight: 600,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: `0 2px 12px ${COLORS.primary}22`,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        aria-label="Open theme picker"
      >
        {/* Theme icon */}
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
        </svg>

        {/* Mode indicator - hidden on very small screens */}
        <span 
          className="theme-toggle-mode"
          style={{ fontSize: isSmall ? '0.7rem' : '0.8rem', opacity: 0.7 }}
        >
          {getModeLabel()}
        </span>

        {/* Color swatch dot */}
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all duration-300"
          style={{ 
            backgroundColor: getSwatchColor(),
            boxShadow: `0 0 8px ${getSwatchColor()}66`,
          }}
        />

        {/* Label - hidden on smaller screens */}
        <span className="theme-toggle-label hidden sm:inline" style={{ fontWeight: 600 }}>
          Theme
        </span>
      </button>

      <ThemePickerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}