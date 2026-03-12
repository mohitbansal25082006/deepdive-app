// src/components/debate/DebateAgentCard.tsx
// Part 9 — Card component for a single debate agent's perspective.
//
// FIX 1: Summary no longer truncates in expanded mode (removed numberOfLines cap)
// FIX 2: Source URLs are now tappable — opens in device browser via Linking

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient }    from 'expo-linear-gradient';
import { Ionicons }          from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
}                            from 'react-native-reanimated';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import {
  DebatePerspective,
  DebateArgument,
  DebateStanceType,
} from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openUrl(url: string) {
  if (!url) return;
  try {
    // Ensure the URL has a scheme
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const supported = await Linking.canOpenURL(fullUrl);
    if (supported) {
      await Linking.openURL(fullUrl);
    } else {
      Alert.alert('Cannot Open Link', `Unable to open: ${fullUrl}`);
    }
  } catch {
    Alert.alert('Error', 'Could not open this link.');
  }
}

function formatDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    // Show hostname + first path segment only
    const pathPart = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    return pathPart
      ? `${parsed.hostname}/${pathPart}`
      : parsed.hostname;
  } catch {
    return url.slice(0, 50);
  }
}

// ─── Stance badge ─────────────────────────────────────────────────────────────

interface StanceConfig {
  label: string;
  color: string;
  icon: string;
}

const STANCE_CONFIG: Record<DebateStanceType, StanceConfig> = {
  strongly_for: { 
    label: 'Strongly For',    
    color: '#43E97B', 
    icon: 'arrow-up-circle'    
  },
  for: { 
    label: 'For',              
    color: '#7EC8E3', 
    icon: 'chevron-up-circle'  
  },
  neutral: { 
    label: 'Neutral',          
    color: '#A0A0C0', 
    icon: 'remove-circle'      
  },
  against: { 
    label: 'Against',          
    color: '#FFA726', 
    icon: 'chevron-down-circle'
  },
  strongly_against: { 
    label: 'Strongly Against', 
    color: '#FF6584', 
    icon: 'arrow-down-circle'  
  },
};

function StanceBadge({ stanceType }: { stanceType: DebateStanceType }) {
  const cfg = STANCE_CONFIG[stanceType] ?? STANCE_CONFIG.neutral;
  return (
    <View style={{
      flexDirection:     'row',
      alignItems:        'center',
      gap:               5,
      backgroundColor:   `${cfg.color}18`,
      borderRadius:      RADIUS.full,
      paddingHorizontal: 10,
      paddingVertical:   4,
      borderWidth:       1,
      borderColor:       `${cfg.color}30`,
    }}>
      <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
      <Text style={{
        color:         cfg.color,
        fontSize:      FONTS.sizes.xs,
        fontWeight:    '700',
        letterSpacing: 0.3,
      }}>
        {cfg.label.toUpperCase()}
      </Text>
    </View>
  );
}

// ─── Strength dot ─────────────────────────────────────────────────────────────

function StrengthDot({ strength }: { strength: DebateArgument['strength'] }) {
  const color =
    strength === 'strong'   ? COLORS.success :
    strength === 'moderate' ? COLORS.warning  :
    COLORS.textMuted;

  return (
    <View style={{
      width:           8,
      height:          8,
      borderRadius:    4,
      backgroundColor: color,
      marginTop:       6,
      flexShrink:      0,
    }} />
  );
}

// ─── Argument row ─────────────────────────────────────────────────────────────

function ArgumentRow({
  argument,
  agentColor,
}: {
  argument:   DebateArgument;
  agentColor: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
      style={{
        backgroundColor: `${agentColor}08`,
        borderRadius:    RADIUS.md,
        padding:         SPACING.sm + 4,
        marginBottom:    SPACING.xs,
        borderWidth:     1,
        borderColor:     `${agentColor}20`,
      }}
    >
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <StrengthDot strength={argument.strength} />
        <View style={{ flex: 1 }}>
          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.sm,
            fontWeight: '600',
            lineHeight: 20,
          }}>
            {argument.point}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={COLORS.textMuted}
          style={{ marginTop: 2 }}
        />
      </View>

      {/* Evidence + source link (shown when expanded) */}
      {expanded && (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={{ marginTop: SPACING.sm }}
        >
          {/* FIX: evidence text has no numberOfLines limit */}
          <Text style={{
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.xs,
            lineHeight: 18,
            paddingLeft: 18,
          }}>
            {argument.evidence}
          </Text>

          {/* FIX: source URL is now a tappable link */}
          {argument.sourceUrl ? (
            <TouchableOpacity
              onPress={() => openUrl(argument.sourceUrl!)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems:    'center',
                gap:           5,
                marginTop:     8,
                paddingLeft:   18,
                paddingVertical: 4,
              }}
            >
              <Ionicons
                name="open-outline"
                size={11}
                color={agentColor}
              />
              <Text
                style={{
                  color:              agentColor,
                  fontSize:           FONTS.sizes.xs,
                  textDecorationLine: 'underline',
                  fontWeight:         '500',
                  flexShrink:         1,
                }}
                numberOfLines={1}
              >
                {formatDisplayUrl(argument.sourceUrl)}
              </Text>
              <Text style={{
                color:    COLORS.textMuted,
                fontSize: FONTS.sizes.xs,
              }}>
                ↗
              </Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      )}
    </TouchableOpacity>
  );
}

// ─── Confidence meter ─────────────────────────────────────────────────────────

function ConfidenceMeter({
  confidence,
  color,
}: {
  confidence: number;
  color:      string;
}) {
  const pct = Math.min(100, Math.max(0, (confidence / 10) * 100));

  // Derive a label so the user understands what the number means
  const confidenceLabel =
    confidence <= 2 ? 'Very Low' :
    confidence <= 4 ? 'Low'      :
    confidence <= 6 ? 'Mixed'    :
    confidence <= 8 ? 'Strong'   :
    'Very Strong';

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{
          color:      COLORS.textMuted,
          fontSize:   FONTS.sizes.xs,
          fontWeight: '600',
          width:      70,
        }}>
          Confidence
        </Text>
        <View style={{
          flex:            1,
          height:          5,
          borderRadius:    3,
          backgroundColor: `${color}20`,
        }}>
          <View style={{
            width:           `${pct}%`,
            height:          '100%',
            borderRadius:    3,
            backgroundColor: color,
          }} />
        </View>
        <Text style={{
          color:      color,
          fontSize:   FONTS.sizes.xs,
          fontWeight: '800',
          width:      28,
          textAlign:  'right',
        }}>
          {confidence}/10
        </Text>
      </View>
      <Text style={{
        color:      COLORS.textMuted,
        fontSize:   9,
        paddingLeft: 78,
        fontStyle:  'italic',
      }}>
        Evidence quality: {confidenceLabel}
      </Text>
    </View>
  );
}

// ─── Sources list ─────────────────────────────────────────────────────────────
// FIX: Source URLs in the sources section are also tappable links

function SourcesList({
  sources,
  color,
}: {
  sources: DebatePerspective['sourcesUsed'];
  color:   string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sources : sources.slice(0, 3);

  if (sources.length === 0) return null;

  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Text style={{
        color:         COLORS.textMuted,
        fontSize:      FONTS.sizes.xs,
        fontWeight:    '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom:  SPACING.xs,
      }}>
        Sources Researched
      </Text>

      {visible.map((src, i) => (
        <TouchableOpacity
          key={src.id ?? i}
          onPress={() => src.url ? openUrl(src.url) : undefined}
          activeOpacity={src.url ? 0.7 : 1}
          style={{
            flexDirection: 'row',
            alignItems:    'flex-start',
            gap:           7,
            paddingVertical: 5,
            borderBottomWidth: i < visible.length - 1 ? 1 : 0,
            borderBottomColor: `${COLORS.border}60`,
          }}
        >
          <Ionicons
            name={src.url ? 'globe-outline' : 'document-outline'}
            size={12}
            color={src.url ? color : COLORS.textMuted}
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color:              src.url ? color : COLORS.textSecondary,
                fontSize:           FONTS.sizes.xs,
                fontWeight:         '600',
                textDecorationLine: src.url ? 'underline' : 'none',
              }}
              numberOfLines={1}
            >
              {src.title || formatDisplayUrl(src.url || '')}
            </Text>
            {src.snippet ? (
              <Text
                style={{
                  color:    COLORS.textMuted,
                  fontSize: 10,
                  marginTop: 1,
                  lineHeight: 14,
                }}
                numberOfLines={2}
              >
                {src.snippet}
              </Text>
            ) : null}
            {src.date ? (
              <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 2 }}>
                {src.date}
              </Text>
            ) : null}
          </View>
          {src.url ? (
            <Text style={{ color: color, fontSize: FONTS.sizes.xs }}>↗</Text>
          ) : null}
        </TouchableOpacity>
      ))}

      {sources.length > 3 && (
        <TouchableOpacity
          onPress={() => setShowAll(s => !s)}
          style={{ marginTop: SPACING.xs }}
        >
          <Text style={{
            color:      color,
            fontSize:   FONTS.sizes.xs,
            fontWeight: '600',
          }}>
            {showAll
              ? 'Show fewer sources'
              : `+ ${sources.length - 3} more source${sources.length - 3 !== 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DebateAgentCardProps {
  perspective: DebatePerspective;
  index:       number;
  mode?:       'compact' | 'expanded';
  onPress?:    () => void;
}

export function DebateAgentCard({
  perspective,
  index,
  mode    = 'expanded',
  onPress,
}: DebateAgentCardProps) {
  const { color, icon } = perspective;
  const isCompact = mode === 'compact';

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(index * 80)}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={onPress ? 0.85 : 1}
        disabled={!onPress}
      >
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          borderWidth:     1,
          borderColor:     `${color}30`,
          overflow:        'hidden',
          marginBottom:    SPACING.md,
          ...SHADOWS.medium,
        }}>
          {/* Top accent strip */}
          <LinearGradient
            colors={[color, `${color}00`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 3 }}
          />

          <View style={{ padding: SPACING.md }}>

            {/* ── Header ──────────────────────────────────────────────── */}
            <View style={{
              flexDirection: 'row',
              alignItems:    'center',
              gap:           12,
              marginBottom:  SPACING.sm,
            }}>
              <LinearGradient
                colors={[`${color}30`, `${color}15`]}
                style={{
                  width:          48,
                  height:         48,
                  borderRadius:   15,
                  alignItems:     'center',
                  justifyContent: 'center',
                  borderWidth:    1,
                  borderColor:    `${color}40`,
                }}
              >
                <Ionicons name={icon as any} size={22} color={color} />
              </LinearGradient>

              <View style={{ flex: 1 }}>
                <Text style={{
                  color:         color,
                  fontSize:      FONTS.sizes.xs,
                  fontWeight:    '700',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  marginBottom:  2,
                }}>
                  {perspective.tagline}
                </Text>
                <Text style={{
                  color:      COLORS.textPrimary,
                  fontSize:   FONTS.sizes.base,
                  fontWeight: '800',
                }}>
                  {perspective.agentName}
                </Text>
              </View>

              <StanceBadge stanceType={perspective.stanceType} />
            </View>

            {/* ── Stance label ─────────────────────────────────────────── */}
            <View style={{
              backgroundColor: `${color}10`,
              borderRadius:    RADIUS.md,
              padding:         SPACING.sm + 2,
              marginBottom:    SPACING.sm,
              borderLeftWidth: 3,
              borderLeftColor: color,
            }}>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
                lineHeight: 20,
                fontStyle:  'italic',
              }}>
                "{perspective.stanceLabel}"
              </Text>
            </View>

            {/* ── Summary ──────────────────────────────────────────────── */}
            {/* FIX: No numberOfLines in expanded mode — full text always visible */}
            <Text
              style={{
                color:        COLORS.textSecondary,
                fontSize:     FONTS.sizes.sm,
                lineHeight:   22,
                marginBottom: SPACING.md,
              }}
              numberOfLines={isCompact ? 3 : undefined}
            >
              {perspective.summary}
            </Text>

            {/* ── Arguments ────────────────────────────────────────────── */}
            {!isCompact && perspective.arguments.length > 0 && (
              <View style={{ marginBottom: SPACING.md }}>
                <Text style={{
                  color:         COLORS.textMuted,
                  fontSize:      FONTS.sizes.xs,
                  fontWeight:    '700',
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                  marginBottom:  SPACING.sm,
                }}>
                  Key Arguments
                </Text>
                {perspective.arguments.map((arg) => (
                  <ArgumentRow
                    key={arg.id}
                    argument={arg}
                    agentColor={color}
                  />
                ))}
              </View>
            )}

            {/* ── Key quote ────────────────────────────────────────────── */}
            {!isCompact && perspective.keyQuote && (
              <View style={{
                backgroundColor: `${color}08`,
                borderRadius:    RADIUS.md,
                padding:         SPACING.md,
                marginBottom:    SPACING.md,
                borderWidth:     1,
                borderColor:     `${color}15`,
              }}>
                <View style={{
                  flexDirection: 'row',
                  gap:           8,
                  alignItems:    'flex-start',
                }}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={14}
                    color={color}
                    style={{ marginTop: 3 }}
                  />
                  {/* FIX: key quote also has no line limit */}
                  <Text style={{
                    flex:       1,
                    color:      COLORS.textSecondary,
                    fontSize:   FONTS.sizes.sm,
                    lineHeight: 20,
                    fontStyle:  'italic',
                  }}>
                    {perspective.keyQuote}
                  </Text>
                </View>
              </View>
            )}

            {/* ── Confidence meter ─────────────────────────────────────── */}
            <ConfidenceMeter
              confidence={perspective.confidence}
              color={color}
            />

            {/* ── Sources (expanded only) ───────────────────────────────── */}
            {!isCompact && perspective.sourcesUsed.length > 0 && (
              <View style={{
                marginTop:       SPACING.md,
                paddingTop:      SPACING.md,
                borderTopWidth:  1,
                borderTopColor:  COLORS.border,
              }}>
                <SourcesList sources={perspective.sourcesUsed} color={color} />
              </View>
            )}

            {/* Compact mode — source count + tap hint */}
            {isCompact && (
              <View style={{ marginTop: SPACING.sm }}>
                {perspective.sourcesUsed.length > 0 && (
                  <View style={{
                    flexDirection: 'row',
                    alignItems:    'center',
                    gap:           5,
                    marginBottom:  4,
                  }}>
                    <Ionicons name="globe-outline" size={12} color={COLORS.textMuted} />
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      {perspective.sourcesUsed.length} source
                      {perspective.sourcesUsed.length !== 1 ? 's' : ''} researched
                    </Text>
                  </View>
                )}
                {onPress && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
                      Tap to read full perspective
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color={COLORS.textMuted} />
                  </View>
                )}
              </View>
            )}

          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}