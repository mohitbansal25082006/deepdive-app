// ─────────────────────────────────────────────────────────────────────────────
// Part 55.9 — Theme Toggle Button
// Floating action button to open the theme picker modal
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import ThemePickerModal from './ThemePickerModal';
import { COLORS } from '../constants/theme';

export default function ThemeToggle() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { themeId, resolvedMode } = useTheme();

  // Get the current theme's swatch color
  const getSwatchColor = () => {
    // Use the actual active theme's primary color from COLORS
    return COLORS.primary;
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95"
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