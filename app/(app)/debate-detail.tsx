// app/(app)/debate-detail.tsx
// Part 9 — Full debate session detail screen.
//
// UPDATE: Added export action bar (PDF / Copy / Share) with busy-state feedback.
//
// Tabs:
//   Overview      — question, stats, agent stance grid, moderator verdict
//   Perspectives  — DebatePerspectiveView (tabbed agent cards, no truncation)
//   Moderator     — ModeratorSummary (full synthesis)

import React, {
  useState,
  useEffect,
  useCallback,
}                              from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
}                              from 'react-native';
import { LinearGradient }      from 'expo-linear-gradient';
import { Ionicons }            from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInDown,
}                              from 'react-native-reanimated';
import { SafeAreaView }        from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase }            from '../../src/lib/supabase';

import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../src/constants/theme';
import { DebatePerspectiveView }                   from '../../src/components/debate/DebatePerspectiveView';
import { ModeratorSummary }                        from '../../src/components/debate/ModeratorSummary';
import {
  exportDebateAsPDF,
  copyDebateSummary,
  shareDebateText,
}                                                  from '../../src/services/debateExport';
import type { DebateSession }                      from '../../src/types';

// ─── Tab config ───────────────────────────────────────────────────────────────

type DebateTab = 'overview' | 'perspectives' | 'moderator';

const TABS: { id: DebateTab; label: string; icon: string }[] = [
  { id: 'overview',     label: 'Overview',     icon: 'grid-outline'   },
  { id: 'perspectives', label: 'Perspectives', icon: 'people-outline' },
  { id: 'moderator',    label: 'Moderator',    icon: 'ribbon-outline' },
];

// ─── DB row mapper ────────────────────────────────────────────────────────────

function mapDbRow(row: Record<string, unknown>): DebateSession {
  return {
    id:                 row.id                   as string,
    userId:             row.user_id              as string,
    topic:              row.topic                as string,
    question:           row.question             as string,
    perspectives:       (row.perspectives        as DebateSession['perspectives']) ?? [],
    moderator:          (row.moderator           as DebateSession['moderator'])    ?? null,
    status:             row.status               as DebateSession['status'],
    agentRoles:         (row.agent_roles         as DebateSession['agentRoles'])   ?? [],
    searchResultsCount: (row.search_results_count as number)                       ?? 0,
    errorMessage:       row.error_message        as string | undefined,
    createdAt:          row.created_at           as string,
    completedAt:        row.completed_at         as string | undefined,
  };
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
  color,
}: {
  icon:   string;
  label:  string;
  value:  string;
  color?: string;
}) {
  return (
    <View style={{
      flex:            1,
      backgroundColor: COLORS.backgroundElevated,
      borderRadius:    RADIUS.lg,
      padding:         SPACING.md,
      alignItems:      'center',
      borderWidth:     1,
      borderColor:     COLORS.border,
    }}>
      <Ionicons
        name={icon as any}
        size={18}
        color={color ?? COLORS.primary}
        style={{ marginBottom: 5 }}
      />
      <Text style={{
        color:        COLORS.textPrimary,
        fontSize:     FONTS.sizes.base,
        fontWeight:   '800',
        marginBottom: 2,
      }}>
        {value}
      </Text>
      <Text style={{
        color:     COLORS.textMuted,
        fontSize:  FONTS.sizes.xs,
        textAlign: 'center',
      }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Export action bar ────────────────────────────────────────────────────────

type ExportBusy = 'pdf' | 'copy' | 'share' | null;

function ExportBar({
  session,
}: {
  session: DebateSession;
}) {
  const [busy,   setBusy]   = useState<ExportBusy>(null);
  const [copied, setCopied] = useState(false);

  const handlePDF = async () => {
    if (busy) return;
    setBusy('pdf');
    try {
      await exportDebateAsPDF(session);
    } catch (err) {
      Alert.alert(
        'Export Failed',
        err instanceof Error ? err.message : 'Could not generate PDF. Try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (busy) return;
    setBusy('copy');
    try {
      await copyDebateSummary(session);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      Alert.alert('Error', 'Could not copy to clipboard.');
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (busy) return;
    setBusy('share');
    try {
      await shareDebateText(session);
    } catch {
      // User cancelled share sheet — not an error
    } finally {
      setBusy(null);
    }
  };

  type ExportOption = {
    id:      ExportBusy;
    icon:    string;
    label:   string;
    color:   string;
    onPress: () => void;
  };

  const options: ExportOption[] = [
    {
      id:      'pdf',
      icon:    'document-text-outline',
      label:   'PDF',
      color:   COLORS.primary,
      onPress: handlePDF,
    },
    {
      id:      'copy',
      icon:    copied ? 'checkmark-circle-outline' : 'copy-outline',
      label:   copied ? 'Copied!' : 'Copy',
      color:   copied ? COLORS.accent : COLORS.info,
      onPress: handleCopy,
    },
    {
      id:      'share',
      icon:    'share-outline',
      label:   'Share',
      color:   COLORS.secondary,
      onPress: handleShare,
    },
  ];

  return (
    <View style={{
      flexDirection:    'row',
      gap:              SPACING.sm,
      paddingHorizontal: SPACING.xl,
      paddingVertical:   SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.border,
      backgroundColor:   COLORS.background,
    }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.id}
          onPress={opt.onPress}
          activeOpacity={busy ? 1 : 0.8}
          style={{
            flex:            1,
            flexDirection:   'row',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             6,
            paddingVertical: 10,
            backgroundColor: `${opt.color}14`,
            borderRadius:    RADIUS.lg,
            borderWidth:     1,
            borderColor:     `${opt.color}28`,
            opacity:         busy && busy !== opt.id ? 0.45 : 1,
          }}
        >
          {busy === opt.id ? (
            <ActivityIndicator size="small" color={opt.color} />
          ) : (
            <Ionicons name={opt.icon as any} size={16} color={opt.color} />
          )}
          <Text style={{
            color:      opt.color,
            fontSize:   FONTS.sizes.xs,
            fontWeight: '700',
          }}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ session }: { session: DebateSession }) {
  const forCount     = session.perspectives.filter(
    p => p.stanceType === 'for' || p.stanceType === 'strongly_for').length;
  const againstCount = session.perspectives.filter(
    p => p.stanceType === 'against' || p.stanceType === 'strongly_against').length;

  const completedDate = session.completedAt
    ? new Date(session.completedAt).toLocaleDateString('en-US', {
        year:   'numeric',
        month:  'long',
        day:    'numeric',
        hour:   '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Animated.View entering={FadeInDown.duration(350)}>

      {/* Stats row */}
      <View style={{
        flexDirection: 'row',
        gap:           SPACING.sm,
        marginBottom:  SPACING.lg,
      }}>
        <StatPill icon="people-outline"         label="Agents"   value={String(session.perspectives.length)}  color={COLORS.primary}   />
        <StatPill icon="globe-outline"           label="Sources"  value={String(session.searchResultsCount)}   color={COLORS.info}      />
        <StatPill icon="arrow-up-circle-outline" label="For"      value={String(forCount)}                     color={COLORS.success}   />
        <StatPill icon="arrow-down-circle-outline" label="Against" value={String(againstCount)}               color={COLORS.secondary} />
      </View>

      {/* Central question */}
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.lg,
        marginBottom:    SPACING.md,
        borderWidth:     1,
        borderColor:     `${COLORS.primary}30`,
        borderLeftWidth: 4,
        borderLeftColor: COLORS.primary,
        ...SHADOWS.small,
      }}>
        <Text style={{
          color:         COLORS.primary,
          fontSize:      FONTS.sizes.xs,
          fontWeight:    '700',
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          marginBottom:  SPACING.sm,
        }}>
          Central Question
        </Text>
        <Text style={{
          color:      COLORS.textPrimary,
          fontSize:   FONTS.sizes.lg,
          fontWeight: '700',
          lineHeight: 28,
        }}>
          {session.question}
        </Text>
      </View>

      {/* Moderator verdict preview */}
      {session.moderator?.balancedVerdict && (
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderRadius:    RADIUS.xl,
          padding:         SPACING.lg,
          marginBottom:    SPACING.md,
          borderWidth:     1,
          borderColor:     COLORS.border,
          ...SHADOWS.small,
        }}>
          <View style={{
            flexDirection: 'row',
            alignItems:    'center',
            gap:           8,
            marginBottom:  SPACING.sm,
          }}>
            <Ionicons name="ribbon-outline" size={16} color={COLORS.primary} />
            <Text style={{
              color:         COLORS.textMuted,
              fontSize:      FONTS.sizes.xs,
              fontWeight:    '700',
              letterSpacing: 0.7,
              textTransform: 'uppercase',
            }}>
              Moderator's Verdict
            </Text>
          </View>
          <Text style={{
            color:      COLORS.textSecondary,
            fontSize:   FONTS.sizes.base,
            lineHeight: 24,
            fontStyle:  'italic',
          }}>
            "{session.moderator.balancedVerdict}"
          </Text>
        </View>
      )}

      {/* Agent stance grid */}
      <View style={{
        backgroundColor: COLORS.backgroundCard,
        borderRadius:    RADIUS.xl,
        padding:         SPACING.lg,
        marginBottom:    SPACING.md,
        borderWidth:     1,
        borderColor:     COLORS.border,
        ...SHADOWS.small,
      }}>
        <Text style={{
          color:         COLORS.textMuted,
          fontSize:      FONTS.sizes.xs,
          fontWeight:    '700',
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          marginBottom:  SPACING.md,
        }}>
          Agent Stances
        </Text>

        {session.perspectives.map((p, i) => (
          <View
            key={p.agentRole}
            style={{
              flexDirection: 'row',
              alignItems:    'center',
              gap:           10,
              marginBottom:  i < session.perspectives.length - 1 ? SPACING.sm : 0,
            }}
          >
            <View style={{
              width:           32,
              height:          32,
              borderRadius:    10,
              backgroundColor: `${p.color}18`,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     `${p.color}30`,
            }}>
              <Ionicons name={p.icon as any} size={14} color={p.color} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '600',
              }}>
                {p.agentName}
              </Text>
              <Text
                style={{ color: p.color, fontSize: FONTS.sizes.xs, marginTop: 1 }}
                numberOfLines={1}
              >
                {p.stanceLabel}
              </Text>
            </View>

            {/* Confidence mini bar */}
            <View style={{
              width:           50,
              height:          4,
              borderRadius:    2,
              backgroundColor: `${p.color}20`,
            }}>
              <View style={{
                width:           `${(p.confidence / 10) * 100}%` as any,
                height:          '100%',
                borderRadius:    2,
                backgroundColor: p.color,
              }} />
            </View>
            <Text style={{
              color:      p.color,
              fontSize:   FONTS.sizes.xs,
              fontWeight: '700',
              width:      26,
              textAlign:  'right',
            }}>
              {p.confidence}/10
            </Text>
          </View>
        ))}
      </View>

      {/* Timestamp */}
      {completedDate && (
        <View style={{
          flexDirection:  'row',
          alignItems:     'center',
          gap:            6,
          justifyContent: 'center',
          marginTop:      SPACING.sm,
        }}>
          <Ionicons name="time-outline" size={13} color={COLORS.textMuted} />
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
            Completed {completedDate}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DebateDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [session,   setSession]   = useState<DebateSession | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DebateTab>('overview');

  // ── Load session ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('debate_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Debate session not found.');

        setSession(mapDbRow(data as Record<string, unknown>));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load debate.');
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ color: COLORS.textMuted, marginTop: SPACING.md, fontSize: FONTS.sizes.sm }}>
            Loading debate...
          </Text>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error || !session) {
    return (
      <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl }}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={{
            color:      COLORS.textPrimary,
            fontSize:   FONTS.sizes.lg,
            fontWeight: '700',
            marginTop:  SPACING.md,
            textAlign:  'center',
          }}>
            {error ?? 'Session not found'}
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: SPACING.lg }}>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>
              Go Back
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Navigation header ───────────────────────────────────────── */}
        <View style={{
          flexDirection:    'row',
          alignItems:       'center',
          paddingHorizontal: SPACING.xl,
          paddingVertical:   SPACING.md,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          gap:              12,
        }}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.base,
                fontWeight: '800',
                lineHeight: 22,
              }}
              numberOfLines={1}
            >
              {session.topic}
            </Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 1 }}>
              {session.perspectives.length} perspectives · {session.searchResultsCount} sources
            </Text>
          </View>
        </View>

        {/* ── Export action bar ────────────────────────────────────────── */}
        <ExportBar session={session} />

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <View style={{
          flexDirection:    'row',
          paddingHorizontal: SPACING.xl,
          paddingVertical:   SPACING.sm,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
          backgroundColor:   COLORS.background,
        }}>
          {TABS.map(tab => {
            const isActive   = activeTab === tab.id;
            const isDisabled = tab.id === 'moderator' && !session.moderator;

            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => !isDisabled && setActiveTab(tab.id)}
                activeOpacity={0.8}
                style={{
                  flex:             1,
                  alignItems:       'center',
                  paddingVertical:  SPACING.sm,
                  gap:              4,
                  opacity:          isDisabled ? 0.35 : 1,
                  borderBottomWidth: isActive ? 2 : 0,
                  borderBottomColor: COLORS.primary,
                  marginBottom:     isActive ? -1 : 0,
                }}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={17}
                  color={isActive ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={{
                  color:      isActive ? COLORS.primary : COLORS.textMuted,
                  fontSize:   FONTS.sizes.xs,
                  fontWeight: isActive ? '700' : '500',
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Tab content ─────────────────────────────────────────────── */}
        <ScrollView
          contentContainerStyle={{
            padding:       SPACING.xl,
            paddingBottom: 60,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'overview' && (
            <OverviewTab session={session} />
          )}

          {activeTab === 'perspectives' && (
            <Animated.View entering={FadeIn.duration(300)}>
              <DebatePerspectiveView perspectives={session.perspectives} />
            </Animated.View>
          )}

          {activeTab === 'moderator' && session.moderator && (
            <Animated.View entering={FadeIn.duration(300)}>
              <ModeratorSummary moderator={session.moderator} />
            </Animated.View>
          )}
        </ScrollView>

      </SafeAreaView>
    </LinearGradient>
  );
}