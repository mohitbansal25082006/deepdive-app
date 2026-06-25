// ─────────────────────────────────────────────────────────────────────────────
// Part 55.9 — Theme Picker Modal (Fully Mobile Optimized)
// Beautiful modal for selecting theme and appearance mode
// ─────────────────────────────────────────────────────────────────────────────

'use client';

<<<<<<< HEAD
import React, { useEffect, useRef, useState, useCallback } from 'react';
=======
import React, { useEffect, useRef, useState } from 'react';
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
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
<<<<<<< HEAD
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Swipe-to-close state — stored in refs to avoid re-render on every touch move
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const isDragging = useRef(false);
  const dragTranslateY = useRef(0);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  // The correct cross-platform approach:
  //   • Save the current window.scrollY
  //   • Set body to position:fixed with top:-scrollY (prevents iOS jump-to-top)
  //   • On unlock, restore scrollY with window.scrollTo
  //
  // Do NOT use overflow:hidden alone — it doesn't work on iOS Safari.
  // Do NOT set position:fixed without saving/restoring scrollY — page jumps.
  const savedScrollY = useRef(0);

  const lockBodyScroll = useCallback(() => {
    savedScrollY.current = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY.current}px`;
    document.body.style.width = '100%';
    // Prevent scroll chaining on non-fixed browsers
    document.documentElement.style.overscrollBehavior = 'none';
  }, []);

  const unlockBodyScroll = useCallback(() => {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.documentElement.style.overscrollBehavior = '';
    // Restore scroll position that was lost due to position:fixed
    window.scrollTo(0, savedScrollY.current);
  }, []);
=======
  const [isClosing, setIsClosing] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchCurrentY, setTouchCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f

  useEffect(() => {
<<<<<<< HEAD
    if (isOpen) {
      lockBodyScroll();

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') handleClose();
      };
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
        unlockBodyScroll();
      };
    }
  }, [isOpen]);

  // ── Close with animation ──────────────────────────────────────────────────
  const handleClose = useCallback(() => {
=======
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen]);

  // Handle close with animation
  const handleClose = () => {
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
<<<<<<< HEAD
      // Reset any dragged transform
      if (modalRef.current) {
        modalRef.current.style.transform = '';
        modalRef.current.style.opacity = '';
        modalRef.current.style.transition = '';
      }
    }, 300);
  }, [onClose]);

  // ── Backdrop click ────────────────────────────────────────────────────────
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  // ── Swipe-to-close touch handlers ─────────────────────────────────────────
  // Only activate swipe when the scroll container is scrolled to the very top,
  // so that normal inner scrolling still works correctly.
  const handleTouchStart = (e: React.TouchEvent) => {
    const scrollEl = scrollContainerRef.current;
    // Only begin swipe-dismiss if at the top of the inner scroll
    if (scrollEl && scrollEl.scrollTop > 2) return;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = true;
    dragTranslateY.current = 0;
    // Remove transition while dragging for instant feedback
    if (modalRef.current) {
      modalRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY.current;
    touchCurrentY.current = currentY;

    // Only allow downward swipe
    if (diff > 0) {
      dragTranslateY.current = diff;
      const modal = modalRef.current;
      if (modal) {
        // Resistance factor: 0.55 makes it feel natural
        const dampedDiff = diff * 0.55;
        modal.style.transform = `translateY(${dampedDiff}px)`;
        modal.style.opacity = `${Math.max(0.3, 1 - dampedDiff / 350)}`;
=======
    }, 300);
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  // ── Touch handlers for swipe-to-close ──
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
    setTouchCurrentY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStartY;
    if (diff > 0) {
      setTouchCurrentY(currentY);
      const modal = modalRef.current;
      if (modal) {
        modal.style.transform = `translateY(${diff * 0.5}px)`;
        modal.style.opacity = `${1 - (diff / 400)}`;
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
      }
    }
  };

  const handleTouchEnd = () => {
<<<<<<< HEAD
    if (!isDragging.current) return;
    isDragging.current = false;

    const diff = touchCurrentY.current - touchStartY.current;
    const modal = modalRef.current;

    if (diff > 160) {
      // Threshold met → dismiss
      if (modal) {
        modal.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
        modal.style.transform = 'translateY(100%)';
        modal.style.opacity = '0';
      }
      setTimeout(() => {
        onClose();
        setIsClosing(false);
        if (modal) {
          modal.style.transform = '';
          modal.style.opacity = '';
          modal.style.transition = '';
        }
      }, 260);
    } else {
      // Snap back
      if (modal) {
        modal.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
        modal.style.transform = 'translateY(0)';
        modal.style.opacity = '1';
        // Clean up inline transition after snap
        setTimeout(() => {
          if (modal) modal.style.transition = '';
        }, 320);
=======
    setIsDragging(false);
    const diff = touchCurrentY - touchStartY;
    if (diff > 150) {
      handleClose();
    } else {
      const modal = modalRef.current;
      if (modal) {
        modal.style.transform = '';
        modal.style.opacity = '';
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
      }
    }
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div
<<<<<<< HEAD
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
=======
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 transition-all duration-300"
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
      style={{
        background: `rgba(0,0,0,0.6)`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity: isClosing ? 0 : 1,
        transition: 'opacity 0.3s ease',
<<<<<<< HEAD
        // Let the backdrop itself be touch-action none to stop background scroll
        // without blocking the modal's internal scroll
        touchAction: 'none',
=======
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
<<<<<<< HEAD
        className="relative w-full max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl"
=======
        className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl transition-transform duration-300 ease-out"
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
        style={{
          background: COLORS.backgroundCard,
          border: `1px solid ${COLORS.border}`,
          transform: isClosing ? 'translateY(30px)' : 'translateY(0)',
<<<<<<< HEAD
          transition: isClosing
            ? 'transform 0.3s ease, opacity 0.3s ease'
            : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          opacity: isClosing ? 0 : 1,
          // On mobile: take up to 92dvh; on desktop: constrain height
          maxHeight: '92dvh',
          display: 'flex',
          flexDirection: 'column',
          // Remove bottom radius on mobile (sheet sits at bottom)
=======
          transition: 'transform 0.3s ease, opacity 0.3s ease',
          marginTop: 'auto',
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
        onClick={(e) => e.stopPropagation()}
<<<<<<< HEAD
        // Restore touch-action on the modal card itself so inner scroll works
=======
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Mobile drag handle ── */}
<<<<<<< HEAD
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
=======
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: COLORS.border,
            }}
          />
        </div>

<<<<<<< HEAD
        {/* ── Header (sticky, flex-shrink-0 so it never scrolls away) ── */}
        <div
          className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between"
=======
        {/* ── Header ── */}
        <div
          className="sticky top-0 z-10 px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between"
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
          style={{
            background: COLORS.backgroundCard,
            borderColor: COLORS.border,
          }}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${COLORS.gradientPrimary[0]}, ${COLORS.gradientPrimary[1]})`,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="4" />
                <line x1="12" y1="20" x2="12" y2="22" />
                <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg" style={{ color: COLORS.textPrimary }}>
                Choose Theme
              </h2>
              <p className="text-xs" style={{ color: COLORS.textMuted }}>
                Personalize your DeepDive experience
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 sm:p-2 rounded-xl transition-all hover:bg-white/5 active:scale-90"
            style={{ color: COLORS.textMuted }}
            aria-label="Close theme picker"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

<<<<<<< HEAD
        {/* ── Scrollable Content ──────────────────────────────────────────────
             KEY FIXES applied here:
             1. overflow-y: auto  → enables scrolling
             2. -webkit-overflow-scrolling: touch → iOS momentum scroll
             3. overscroll-behavior: contain → stops scroll chaining to body
             4. flex: 1 + min-height: 0 → flexbox children must have min-height:0
                or the browser won't constrain them and scroll won't work
             5. touch-action: pan-y → tells the browser this element scrolls
                vertically, so it doesn't hand touch events to our swipe handler
        ── */}
        <div
          ref={scrollContainerRef}
          className="p-4 sm:p-6 space-y-5 sm:space-y-6"
          style={{
            flex: 1,
            minHeight: 0,               // CRITICAL for flexbox scroll to work
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',  // iOS momentum scrolling
            overscrollBehavior: 'contain',      // Stop scroll chaining to body
            touchAction: 'pan-y',               // Let this div handle vertical touch
            // Safe-area padding so content isn't hidden behind home indicator
            paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
          }}
        >
          {/* ── Mode selector ── */}
=======
        {/* ── Content ── */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(92vh - 140px)' }}>
          {/* Mode selector */}
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 sm:mb-3" style={{ color: COLORS.textMuted }}>
              Appearance Mode
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
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
                    className="py-2.5 sm:py-3 px-2 sm:px-3 rounded-xl font-semibold text-xs sm:text-sm transition-all active:scale-95"
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${COLORS.gradientPrimary[0]}, ${COLORS.gradientPrimary[1]})`
                        : COLORS.backgroundElevated,
                      color: isActive ? '#FFFFFF' : COLORS.textSecondary,
                      border: `1.5px solid ${isActive ? 'transparent' : COLORS.border}`,
                      boxShadow: isActive ? `0 4px 16px ${COLORS.primary}44` : 'none',
                    }}
                  >
                    <span className="block text-base sm:text-lg">{labels[m].split(' ')[0]}</span>
                    <span className="text-[10px] sm:text-xs">{labels[m].split(' ')[1]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Theme grid ── */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 sm:mb-3" style={{ color: COLORS.textMuted }}>
              Color Theme
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:gap-3">
              {THEME_DEFINITIONS.map((def) => {
                const isSelected = themeId === def.id;
                const previewPalette = getPalette(def.id, resolvedMode);
                return (
                  <button
                    key={def.id}
                    onClick={() => setThemeId(def.id)}
                    className="rounded-xl overflow-hidden transition-all active:scale-[0.98] text-left w-full"
                    style={{
                      border: `2px solid ${isSelected ? def.swatch : COLORS.border}`,
                      boxShadow: isSelected ? `0 0 0 4px ${def.swatch}33` : 'none',
                    }}
                  >
                    <div className="flex items-center gap-3 p-3 sm:p-4">
<<<<<<< HEAD
                      {/* Theme preview */}
=======
                      {/* Theme preview - compact mobile version */}
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
                      <div
                        className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden"
                        style={{
                          background: previewPalette.background,
                          border: `1px solid ${previewPalette.border}`,
                        }}
                      >
                        <div className="flex flex-col h-full p-1.5 sm:p-2">
                          <div className="flex items-center gap-1">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ background: previewPalette.primary }}
                            />
                            <div
                              className="flex-1 h-1 rounded"
                              style={{ background: previewPalette.textPrimary, opacity: 0.5 }}
                            />
                          </div>
                          <div className="flex-1" />
                          <div className="flex gap-0.5">
                            <div
                              className="flex-1 h-1 rounded"
                              style={{ background: previewPalette.primary, opacity: 0.6 }}
                            />
                            <div
                              className="flex-1 h-1 rounded"
                              style={{ background: previewPalette.secondary, opacity: 0.6 }}
                            />
                            <div
                              className="flex-1 h-1 rounded"
                              style={{ background: previewPalette.accent, opacity: 0.6 }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base font-bold truncate" style={{ color: COLORS.textPrimary }}>
                            {def.icon} {def.name}
                          </span>
                        </div>
                        <p className="text-xs truncate" style={{ color: COLORS.textMuted }}>
                          {def.description}
                        </p>
                      </div>

                      {isSelected && (
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0"
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
            className="flex items-start gap-2.5 p-3 rounded-xl"
            style={{
              background: `${COLORS.info}0E`,
              border: `1px solid ${COLORS.info}22`,
            }}
          >
            <span style={{ color: COLORS.info, fontSize: '1rem' }}>✨</span>
            <p className="text-xs leading-relaxed" style={{ color: COLORS.textMuted }}>
              Your theme preference is saved automatically and remembered across sessions.
            </p>
          </div>
        </div>
      </div>

      <style>{`
<<<<<<< HEAD
        /* Reduce motion preferences */
        @media (prefers-reduced-motion: reduce) {
          * {
=======
        @media (max-width: 640px) {
          .theme-modal-content {
            padding-bottom: env(safe-area-inset-bottom);
          }
        }

        /* Prevent body scroll when modal is open */
        .modal-open {
          overflow: hidden;
          position: fixed;
          width: 100%;
        }

        /* Smooth scroll for content */
        .theme-modal-scroll {
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }

        /* Reduce motion preferences */
        @media (prefers-reduced-motion: reduce) {
          .theme-modal-content,
          .theme-modal-backdrop {
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
          }
        }
<<<<<<< HEAD
=======

        /* Touch feedback for mobile */
        @media (hover: none) {
          .theme-btn:active {
            transform: scale(0.95);
          }
        }
>>>>>>> 150cc307a8694e088cc9144fa2c37f173c4b739f
      `}</style>
    </div>
  );
}