// src/components/research/SlideExportRenderer.tsx
// Part 41.6 — Off-screen renderer for screenshot-based export
//
// This component renders every slide in the presentation off-screen at
// 2× resolution (640×360) so react-native-view-shot can capture them.
//
// Usage:
//   const rendererRef = useRef<SlideExportRendererRef>(null);
//   ...
//   <SlideExportRenderer ref={rendererRef} presentation={presentation} />
//   ...
//   const images = await rendererRef.current?.captureAll();
//
// The component renders slides with position:'absolute', left:-99999 so
// they are off-screen but still measured and rendered by React Native.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useCallback,
} from 'react';
import { View, StyleSheet } from 'react-native';

import { SlideCard }          from './SlideCard';
import { getThemeTokens }     from '../../services/pptxExport';
import {
  captureViewAsBase64,
  CAPTURE_SCALE,
  CAPTURE_W,
  CAPTURE_H,
} from '../../services/slideCaptureExport';
import type { GeneratedPresentation } from '../../types';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface SlideExportRendererRef {
  /** Capture all slides and return an array of data-URI PNGs (null on failure). */
  captureAll: () => Promise<(string | null)[]>;
}

interface Props {
  presentation: GeneratedPresentation;
  onProgress?:  (done: number, total: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SlideExportRenderer = forwardRef<SlideExportRendererRef, Props>(
  function SlideExportRenderer({ presentation, onProgress }, ref) {
    const slideRefs = useRef<(View | null)[]>([]);
    const tokens    = presentation.themeTokens ?? getThemeTokens(presentation.theme);
    const ff        = (presentation as any).fontFamily as string | undefined;

    // Pre-allocate the refs array when slide count is known
    if (slideRefs.current.length !== presentation.slides.length) {
      slideRefs.current = new Array(presentation.slides.length).fill(null);
    }

    const captureAll = useCallback(async (): Promise<(string | null)[]> => {
      const results: (string | null)[] = [];
      const total = presentation.slides.length;

      for (let i = 0; i < total; i++) {
        const viewRef = { current: slideRefs.current[i] };
        const dataUrl = await captureViewAsBase64(viewRef as any);
        results.push(dataUrl);
        onProgress?.(i + 1, total);
        // Small yield to keep UI responsive
        await new Promise(r => setTimeout(r, 16));
      }

      return results;
    }, [presentation.slides.length, onProgress]);

    useImperativeHandle(ref, () => ({ captureAll }), [captureAll]);

    return (
      // Off-screen container — clips and positions outside the visible area
      <View style={styles.offscreen} pointerEvents="none">
        {presentation.slides.map((slide, i) => (
          <View
            key={slide.id ?? i}
            ref={el => { slideRefs.current[i] = el; }}
            style={styles.slideWrapper}
            collapsable={false}  // required for react-native-view-shot on Android
          >
            <SlideCard
              slide={slide}
              tokens={tokens}
              scale={CAPTURE_SCALE}
              showNotes={false}
              fontFamily={ff}
              noTruncate
            />
          </View>
        ))}
      </View>
    );
  }
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left:     -9999,
    top:      0,
    width:    CAPTURE_W,
    // Height auto — stacks all slides vertically off-screen
  },
  slideWrapper: {
    width:    CAPTURE_W,
    height:   CAPTURE_H,
    overflow: 'hidden',
  },
});