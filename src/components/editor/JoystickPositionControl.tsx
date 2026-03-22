// src/components/editor/JoystickPositionControl.tsx
// Part 30 — Joystick / Trackpad element positioning control
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the numeric fraction sliders from Part 29 with an intuitive
// trackpad joystick UI that lets users drag elements around the slide canvas.
//
// Features:
//   • 2D trackpad pad — drag to set xFrac / yFrac
//   • Separate width slider (horizontal strip below pad)
//   • Separate height slider (for blocks that support hFrac)
//   • Live mini slide canvas preview showing where element will land
//   • Quick preset buttons (Top, Center, Bottom, Left½, Right½, Top-Left)
//   • Inline / Overlay mode toggle at the top
//   • Numbers shown as percentage labels (not raw fractions)
//
// Uses React Native's built-in PanResponder (no extra dependencies).
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useRef, useCallback, useState, useEffect,
} from 'react';
import {
  View, Text, Pressable, PanResponder, Dimensions,
  TouchableOpacity, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';

import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import type { InlineBlockPosition }       from '../../types/editor';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAD_SIZE  = Math.min(Dimensions.get('window').width - SPACING.lg * 2 - 48, 280);
const DOT_SIZE  = 26;
const HALF_DOT  = DOT_SIZE / 2;

/** Quick preset positions */
const POSITION_PRESETS = [
  { label: 'Top',       xFrac: 0.05, yFrac: 0.06, wFrac: 0.9,  icon: 'arrow-up-outline'    },
  { label: 'Center',    xFrac: 0.05, yFrac: 0.35, wFrac: 0.9,  icon: 'contract-outline'    },
  { label: 'Bottom',    xFrac: 0.05, yFrac: 0.70, wFrac: 0.9,  icon: 'arrow-down-outline'  },
  { label: 'Left ½',    xFrac: 0.05, yFrac: 0.35, wFrac: 0.43, icon: 'arrow-back-outline'  },
  { label: 'Right ½',   xFrac: 0.52, yFrac: 0.35, wFrac: 0.43, icon: 'arrow-forward-outline'},
  { label: 'Top-Left',  xFrac: 0.05, yFrac: 0.06, wFrac: 0.45, icon: 'navigate-outline'    },
] as const;

// ─── Slider component (used for width and height) ─────────────────────────────

interface SliderProps {
  label:       string;
  value:       number;   // 0–1
  minValue?:   number;
  onChange:    (v: number) => void;
  accentColor: string;
  unit?:       string;   // "W" or "H"
}

function FractionSlider({
  label, value, minValue = 0.1, onChange, accentColor, unit = 'W',
}: SliderProps) {
  const trackRef  = useRef<View>(null);
  const trackWidthRef = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        if (trackWidthRef.current > 0) {
          const x    = evt.nativeEvent.locationX;
          const frac = Math.max(minValue, Math.min(1.0, x / trackWidthRef.current));
          onChange(Math.round(frac * 20) / 20); // snap to 0.05 steps
        }
      },
      onPanResponderMove: (evt, gs) => {
        if (trackWidthRef.current > 0) {
          const x    = evt.nativeEvent.locationX;
          const frac = Math.max(minValue, Math.min(1.0, x / trackWidthRef.current));
          onChange(Math.round(frac * 20) / 20);
        }
      },
    }),
  ).current;

  const pct  = Math.round(value * 100);
  const fill = `${Math.max(0, Math.min(100, value * 100))}%`;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${accentColor}18`, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '800' }}>{pct}%</Text>
          <Text style={{ color: `${accentColor}80`, fontSize: 9 }}>{unit}</Text>
        </View>
      </View>
      <View
        ref={trackRef}
        onLayout={e => { trackWidthRef.current = e.nativeEvent.layout.width; }}
        {...panResponder.panHandlers}
        style={{
          height:          28,
          backgroundColor: COLORS.backgroundElevated,
          borderRadius:    RADIUS.full,
          borderWidth:     1,
          borderColor:     COLORS.border,
          overflow:        'hidden',
          justifyContent:  'center',
        }}
      >
        <View style={{
          position:        'absolute',
          left:            0,
          top:             0,
          bottom:          0,
          width:           fill as ViewStyle['width'],
          backgroundColor: `${accentColor}30`,
          borderRadius:    RADIUS.full,
        } as ViewStyle} />
        <View style={{
          position:        'absolute',
          left:            `${Math.max(0, value * 100 - 2)}%` as ViewStyle['left'],
          width:           4,
          top:             4,
          bottom:          4,
          backgroundColor: accentColor,
          borderRadius:    2,
        } as ViewStyle} />
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface JoystickPositionControlProps {
  position:      InlineBlockPosition;
  onChange:      (pos: InlineBlockPosition) => void;
  /** Whether this block type supports an independent height (image, stat) */
  supportsHeight?: boolean;
  accentColor?:  string;
}

export function JoystickPositionControl({
  position,
  onChange,
  supportsHeight = false,
  accentColor    = COLORS.primary,
}: JoystickPositionControlProps) {
  const isOverlay = position.type === 'overlay';

  // Derived fractions (clamped)
  const xFrac = Math.max(0, Math.min(0.95, position.xFrac ?? 0.05));
  const yFrac = Math.max(0, Math.min(0.95, position.yFrac ?? 0.5));
  const wFrac = Math.max(0.05, Math.min(1.0, position.wFrac ?? 0.9));
  const hFrac = position.hFrac;

  // Pad layout refs
  const padRef      = useRef<View>(null);
  const padSizeRef  = useRef(PAD_SIZE);

  // Track live drag position for the dot
  const [dotX, setDotX] = useState(xFrac * PAD_SIZE);
  const [dotY, setDotY] = useState(yFrac * PAD_SIZE);

  // Sync dot when position changes externally
  useEffect(() => {
    setDotX(xFrac * PAD_SIZE);
    setDotY(yFrac * PAD_SIZE);
  }, [xFrac, yFrac]);

  // ── Joystick pan responder ──────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isOverlay,
      onMoveShouldSetPanResponder:  () => isOverlay,

      onPanResponderGrant: (evt) => {
        const x = Math.max(0, Math.min(padSizeRef.current, evt.nativeEvent.locationX));
        const y = Math.max(0, Math.min(padSizeRef.current, evt.nativeEvent.locationY));
        setDotX(x);
        setDotY(y);
        commitPosition(x, y);
      },

      onPanResponderMove: (evt, gs) => {
        const rawX = evt.nativeEvent.locationX;
        const rawY = evt.nativeEvent.locationY;
        const x = Math.max(0, Math.min(padSizeRef.current, rawX));
        const y = Math.max(0, Math.min(padSizeRef.current, rawY));
        setDotX(x);
        setDotY(y);
        commitPosition(x, y);
      },

      onPanResponderRelease: () => {
        // Already committed on every move
      },
    }),
  ).current;

  const commitPosition = useCallback(
    (x: number, y: number) => {
      const ps   = padSizeRef.current || PAD_SIZE;
      // Snap to 0.05 steps for x, 0.025 steps for y
      const newX = Math.round((x / ps) * 20) / 20;
      const newY = Math.round((y / ps) * 40) / 40;
      onChange({
        ...position,
        type:  'overlay',
        xFrac: Math.max(0, Math.min(0.95, newX)),
        yFrac: Math.max(0, Math.min(0.95, newY)),
      });
    },
    [position, onChange],
  );

  // ── Preset handler ──────────────────────────────────────────────────────────

  const applyPreset = useCallback(
    (preset: typeof POSITION_PRESETS[number]) => {
      const newPos: InlineBlockPosition = {
        type:  'overlay',
        xFrac: preset.xFrac,
        yFrac: preset.yFrac,
        wFrac: preset.wFrac,
        hFrac: position.hFrac,
      };
      onChange(newPos);
    },
    [position.hFrac, onChange],
  );

  // ── Toggle overlay / inline ─────────────────────────────────────────────────

  const toggleType = useCallback(() => {
    const newType: InlineBlockPosition['type'] = isOverlay ? 'inline' : 'overlay';
    if (newType === 'inline') {
      onChange({ type: 'inline' });
    } else {
      onChange({ type: 'overlay', xFrac: 0.05, yFrac: 0.5, wFrac: 0.9 });
    }
  }, [isOverlay, onChange]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={{ gap: SPACING.md }}>

      {/* Mode toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.xl, padding: 3, borderWidth: 1, borderColor: COLORS.border }}>
        {[
          { type: 'inline',  label: '⬇ Below Slide',   desc: 'Stacks under slide content' },
          { type: 'overlay', label: '🎯 Inside Slide',  desc: 'Placed on the slide canvas' },
        ].map(opt => (
          <Pressable
            key={opt.type}
            onPress={() => {
              if (opt.type !== position.type) toggleType();
            }}
            style={{
              flex:            1,
              alignItems:      'center',
              paddingVertical: 9,
              paddingHorizontal: SPACING.sm,
              borderRadius:    RADIUS.lg,
              backgroundColor: position.type === opt.type ? accentColor : 'transparent',
            }}
          >
            <Text style={{ color: position.type === opt.type ? '#FFF' : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '700' }}>{opt.label}</Text>
            <Text style={{ color: position.type === opt.type ? 'rgba(255,255,255,0.7)' : COLORS.textMuted, fontSize: 9, marginTop: 2 }}>{opt.desc}</Text>
          </Pressable>
        ))}
      </View>

      {/* Overlay controls */}
      {isOverlay && (
        <>
          {/* Quick presets */}
          <View>
            <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Quick Presets</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {POSITION_PRESETS.map(preset => (
                <TouchableOpacity
                  key={preset.label}
                  onPress={() => applyPreset(preset)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection:   'row',
                    alignItems:      'center',
                    gap:             5,
                    backgroundColor: `${accentColor}15`,
                    borderRadius:    RADIUS.full,
                    paddingHorizontal: 10,
                    paddingVertical:  6,
                    borderWidth:     1,
                    borderColor:     `${accentColor}30`,
                  }}
                >
                  <Ionicons name={preset.icon as any} size={12} color={accentColor} />
                  <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── JOYSTICK TRACKPAD ── */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="locate-outline" size={14} color={accentColor} />
                <Text style={{ color: accentColor, fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Position Trackpad</Text>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>
                x:{Math.round(xFrac * 100)}% y:{Math.round(yFrac * 100)}%
              </Text>
            </View>

            {/* The draggable pad */}
            <View style={{ alignItems: 'center' }}>
              <View
                ref={padRef}
                onLayout={e => { padSizeRef.current = e.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}
                style={{
                  width:           PAD_SIZE,
                  height:          Math.round(PAD_SIZE * (9 / 16)), // 16:9 ratio mirrors slide
                  backgroundColor: COLORS.backgroundElevated,
                  borderRadius:    RADIUS.xl,
                  borderWidth:     1.5,
                  borderColor:     `${accentColor}40`,
                  overflow:        'hidden',
                  position:        'relative',
                }}
              >
                {/* Grid lines */}
                <View style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, height: 1, backgroundColor: `${accentColor}15` }} />
                <View style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, height: 1, backgroundColor: `${accentColor}15` }} />
                <View style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, width: 1, backgroundColor: `${accentColor}15` }} />
                <View style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, width: 1, backgroundColor: `${accentColor}15` }} />

                {/* Corner labels */}
                <Text style={{ position: 'absolute', top: 4, left: 6, color: `${accentColor}55`, fontSize: 8 }}>TL</Text>
                <Text style={{ position: 'absolute', top: 4, right: 6, color: `${accentColor}55`, fontSize: 8 }}>TR</Text>
                <Text style={{ position: 'absolute', bottom: 4, left: 6, color: `${accentColor}55`, fontSize: 8 }}>BL</Text>
                <Text style={{ position: 'absolute', bottom: 4, right: 6, color: `${accentColor}55`, fontSize: 8 }}>BR</Text>

                {/* Center cross */}
                <View style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -10 }, { translateY: -0.5 }], width: 20, height: 1, backgroundColor: `${accentColor}25` }} />
                <View style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -0.5 }, { translateY: -10 }], width: 1, height: 20, backgroundColor: `${accentColor}25` }} />

                {/* Width indicator line */}
                <View style={{
                  position:        'absolute',
                  left:            dotX,
                  top:             dotY + HALF_DOT,
                  width:           (padSizeRef.current || PAD_SIZE) * wFrac - (dotX - (xFrac * (padSizeRef.current || PAD_SIZE))),
                  height:          2,
                  backgroundColor: `${accentColor}30`,
                }} />

                {/* Draggable DOT */}
                <LinearGradient
                  colors={[accentColor, `${accentColor}CC`]}
                  style={{
                    position:        'absolute',
                    left:            dotX - HALF_DOT,
                    top:             dotY - HALF_DOT,
                    width:           DOT_SIZE,
                    height:          DOT_SIZE,
                    borderRadius:    DOT_SIZE / 2,
                    alignItems:      'center',
                    justifyContent:  'center',
                    shadowColor:     accentColor,
                    shadowOffset:    { width: 0, height: 2 },
                    shadowOpacity:   0.5,
                    shadowRadius:    4,
                    elevation:       4,
                    borderWidth:     2,
                    borderColor:     '#FFF',
                  }}
                >
                  <Ionicons name="move-outline" size={13} color="#FFF" />
                </LinearGradient>
              </View>

              <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 6, textAlign: 'center' }}>
                Drag anywhere on the pad to position the element
              </Text>
            </View>

            {/* Width slider */}
            <FractionSlider
              label="Width"
              value={wFrac}
              minValue={0.1}
              onChange={v => onChange({ ...position, wFrac: v })}
              accentColor={accentColor}
              unit="W"
            />

            {/* Height slider — only shown for blocks that support it */}
            {supportsHeight && (
              <View>
                <FractionSlider
                  label="Height (optional)"
                  value={hFrac ?? 0.3}
                  minValue={0.05}
                  onChange={v => onChange({ ...position, hFrac: v })}
                  accentColor={accentColor}
                  unit="H"
                />
                <Pressable
                  onPress={() => onChange({ ...position, hFrac: undefined })}
                  style={{ marginTop: 4, alignSelf: 'flex-start' }}
                >
                  <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>
                    {hFrac !== undefined ? '✕ Remove height override (use auto)' : '✦ Set custom height'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Current position summary */}
          <View style={{
            backgroundColor: `${accentColor}08`,
            borderRadius:    RADIUS.lg,
            padding:         SPACING.sm,
            flexDirection:   'row',
            flexWrap:        'wrap',
            gap:             8,
          }}>
            {[
              { label: 'Left',   value: `${Math.round(xFrac * 100)}%` },
              { label: 'Top',    value: `${Math.round(yFrac * 100)}%` },
              { label: 'Width',  value: `${Math.round(wFrac * 100)}%` },
              ...(hFrac !== undefined ? [{ label: 'Height', value: `${Math.round(hFrac * 100)}%` }] : []),
            ].map(item => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>{item.label}:</Text>
                <Text style={{ color: accentColor, fontSize: 9, fontWeight: '700' }}>{item.value}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Inline mode info */}
      {!isOverlay && (
        <View style={{ backgroundColor: `${COLORS.info}10`, borderRadius: RADIUS.lg, padding: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.info} />
          <Text style={{ color: COLORS.info, fontSize: FONTS.sizes.xs, flex: 1, lineHeight: 17 }}>
            Element will be stacked below the main slide content in sequence.
            Switch to "Inside Slide" to place it at a specific position on the canvas.
          </Text>
        </View>
      )}
    </View>
  );
} 