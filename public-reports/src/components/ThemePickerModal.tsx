// ─────────────────────────────────────────────────────────────────────────────
// Part 55.9 — Theme Picker Modal
// Beautiful modal for selecting theme and appearance mode
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import React, { useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  THEME_DEFINITIONS,
  getPalette,
  type ThemeDefinition,
  type ThemeMode,
} from '../constants/themes';
import type { ThemeModePreference } from '../context/ThemeContext';
import { COLORS } from '../constants/theme';

interface ThemePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ThemePickerModal({ isOpen, onClose }: ThemePickerModalProps) {
  const { themeId, mode, resolvedMode, setThemeId, setMode } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: `rgba(0,0,0,0.7)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl"
        style={{
          background: COLORS.backgroundCard,
          border: `1px solid ${COLORS.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-6 py-4 border-b flex items-center justify-between"
          style={{
            background: COLORS.backgroundCard,
            borderColor: COLORS.border,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${COLORS.gradientPrimary[0]}, ${COLORS.gradientPrimary[1]})`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="4" />
                <line x1="12" y1="20" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <div>
              <h2 className="font-extrabold text-lg" style={{ color: COLORS.textPrimary }}>
                Choose Theme
              </h2>
              <p className="text-xs" style={{ color: COLORS.textMuted }}>
                Personalize your DeepDive experience
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-opacity-10"
            style={{ color: COLORS.textMuted }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Mode selector */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: COLORS.textMuted }}>
              Appearance Mode
            </p>
            <div className="flex gap-2">
              {(['light', 'dark', 'system'] as ThemeModePreference[]).map((m) => {
                const isActive = mode === m;
                const labels: Record<ThemeModePreference, string> = {
                  light: '☀️ Light',
                  dark: '🌙 Dark',
                  system: '💻 System',
                };
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="flex-1 py-2.5 px-3 rounded-xl font-semibold text-sm transition-all"
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${COLORS.gradientPrimary[0]}, ${COLORS.gradientPrimary[1]})`
                        : COLORS.backgroundElevated,
                      color: isActive ? '#FFFFFF' : COLORS.textSecondary,
                      border: `1px solid ${isActive ? 'transparent' : COLORS.border}`,
                      boxShadow: isActive ? `0 4px 16px ${COLORS.primary}44` : 'none',
                    }}
                  >
                    {labels[m]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Theme grid */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: COLORS.textMuted }}>
              Color Theme
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {THEME_DEFINITIONS.map((def) => {
                const isSelected = themeId === def.id;
                const previewPalette = getPalette(def.id, resolvedMode);
                return (
                  <button
                    key={def.id}
                    onClick={() => setThemeId(def.id)}
                    className="rounded-xl overflow-hidden transition-all hover:scale-[1.02] active:scale-[0.98] text-left"
                    style={{
                      border: `2px solid ${isSelected ? def.swatch : COLORS.border}`,
                      boxShadow: isSelected ? `0 0 0 4px ${def.swatch}33` : 'none',
                    }}
                  >
                    {/* Mini preview */}
                    <div
                      className="p-3 space-y-2"
                      style={{ background: previewPalette.background }}
                    >
                      {/* Faux header */}
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
                          style={{
                            background: `linear-gradient(135deg, ${previewPalette.gradientPrimary[0]}, ${previewPalette.gradientPrimary[1]})`,
                          }}
                        >
                          {def.icon}
                        </div>
                        <div className="flex-1">
                          <div
                            className="h-1.5 w-2/3 rounded"
                            style={{ background: previewPalette.textPrimary, opacity: 0.85 }}
                          />
                          <div
                            className="h-1 w-1/3 rounded mt-1"
                            style={{ background: previewPalette.textMuted }}
                          />
                        </div>
                      </div>
                      {/* Faux card */}
                      <div
                        className="p-2 rounded-md space-y-1.5"
                        style={{
                          background: previewPalette.backgroundCard,
                          border: `1px solid ${previewPalette.border}`,
                        }}
                      >
                        <div
                          className="h-1.5 w-4/5 rounded"
                          style={{ background: previewPalette.textSecondary, opacity: 0.7 }}
                        />
                        <div
                          className="h-1.5 w-1/2 rounded"
                          style={{ background: previewPalette.textMuted, opacity: 0.6 }}
                        />
                        <div className="flex gap-1.5 mt-1">
                          <div className="w-3 h-1.5 rounded-full" style={{ background: previewPalette.primary }} />
                          <div className="w-2.5 h-1.5 rounded-full" style={{ background: previewPalette.secondary }} />
                          <div className="w-2 h-1.5 rounded-full" style={{ background: previewPalette.accent }} />
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div
                      className="px-3 py-2.5 flex items-center gap-2"
                      style={{
                        background: isSelected ? `${def.swatch}15` : COLORS.backgroundCard,
                        borderTop: `1px solid ${isSelected ? def.swatch : COLORS.border}`,
                      }}
                    >
                      <div className="flex-1">
                        <p className="font-bold text-xs" style={{ color: COLORS.textPrimary }}>
                          {def.name}
                        </p>
                        <p className="text-xs" style={{ color: COLORS.textMuted }}>
                          {def.description}
                        </p>
                      </div>
                      {isSelected && (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs"
                          style={{ background: def.swatch }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer hint */}
          <div
            className="flex items-start gap-3 p-3 rounded-xl"
            style={{
              background: `${COLORS.info}0E`,
              border: `1px solid ${COLORS.info}22`,
            }}
          >
            <span style={{ color: COLORS.info }}>✨</span>
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              Your theme preference is saved automatically and remembered across sessions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}