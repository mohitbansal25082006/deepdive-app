// app/(app)/(tabs)/podcast.tsx
// Part 8 — AI Podcast Generator tab.
//
// FIX 1: Create form is now always visible when not actively generating.
//         After a podcast is done the "Episode Ready" card sits at the top
//         and the form remains below so the user can queue another episode
//         immediately without needing a reset button.
//
// FIX 2: History cards now have a "share" icon that opens a compact share
//         sheet (MP3 / PDF / Copy Script) for any completed episode.

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
}                                   from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
}                                   from 'react-native';
import { LinearGradient }           from 'expo-linear-gradient';
import { Ionicons }                 from '@expo/vector-icons';
import { BlurView }                 from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
}                                   from 'react-native-reanimated';
import { SafeAreaView }             from 'react-native-safe-area-context';
import { router }                   from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS }    from '../../../src/constants/theme';
import {
  usePodcast,
  PODCAST_VOICE_PRESETS,
}                                            from '../../../src/hooks/usePodcast';
import { usePodcastHistory }                 from '../../../src/hooks/usePodcastHistory';
import { PodcastGenerationProgress }         from '../../../src/components/podcast/PodcastGenerationProgress';
import { PodcastCard }                       from '../../../src/components/podcast/PodcastCard';
import { WaveformVisualizer }                from '../../../src/components/podcast/WaveformVisualizer';
import { Avatar }                            from '../../../src/components/common/Avatar';
import { useAuth }                           from '../../../src/context/AuthContext';
import {
  exportPodcastAsMP3,
  exportPodcastAsPDF,
  copyPodcastScriptToClipboard,
}                                            from '../../../src/services/podcastExport';
import type { Podcast }                      from '../../../src/types';
import type { PodcastVoicePresetDef }        from '../../../src/hooks/usePodcast';

// ─── Duration options ─────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: '5 min',  value: 5  },
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
];

// ─── Share Sheet ──────────────────────────────────────────────────────────────
// Reusable bottom-sheet for exporting a podcast (MP3 / PDF / Copy Script).

interface ShareSheetProps {
  podcast:   Podcast | null;
  visible:   boolean;
  onClose:   () => void;
}

function ShareSheet({ podcast, visible, onClose }: ShareSheetProps) {
  const [busy,    setBusy]    = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);

  // Reset state when sheet reopens for a different podcast
  useEffect(() => {
    if (visible) {
      setBusy(null);
      setCopied(false);
    }
  }, [visible, podcast?.id]);

  const handleMP3 = async () => {
    if (!podcast || busy) return;
    setBusy('mp3');
    try {
      await exportPodcastAsMP3(podcast);
    } catch (err) {
      Alert.alert(
        'Export Failed',
        err instanceof Error ? err.message : 'Could not export MP3. Please try again.',
      );
    } finally {
      setBusy(null);
    }
  };

  const handlePDF = async () => {
    if (!podcast || busy) return;
    setBusy('pdf');
    try {
      await exportPodcastAsPDF(podcast);
    } catch (err) {
      Alert.alert(
        'Export Failed',
        err instanceof Error ? err.message : 'Could not generate PDF.',
      );
    } finally {
      setBusy(null);
    }
  };

  const handleCopyScript = async () => {
    if (!podcast || busy) return;
    setBusy('copy');
    try {
      await copyPodcastScriptToClipboard(podcast);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      Alert.alert('Error', 'Could not copy to clipboard.');
    } finally {
      setBusy(null);
    }
  };

  type ShareOption = {
    id:          string;
    icon:        string;
    label:       string;
    sublabel:    string;
    color:       string;
    onPress:     () => void;
    disabled:    boolean;
  };

  const options: ShareOption[] = [
    {
      id:       'mp3',
      icon:     'musical-notes-outline',
      label:    'Share as MP3',
      sublabel: 'Export full episode audio',
      color:    COLORS.primary,
      onPress:  handleMP3,
      disabled: !(podcast?.audioSegmentPaths?.filter(Boolean).length),
    },
    {
      id:       'pdf',
      icon:     'document-text-outline',
      label:    'Export PDF Script',
      sublabel: 'Styled transcript with all turns',
      color:    COLORS.secondary,
      onPress:  handlePDF,
      disabled: false,
    },
    {
      id:       'copy',
      icon:     copied ? 'checkmark-circle-outline' : 'copy-outline',
      label:    copied ? 'Copied!' : 'Copy Script',
      sublabel: 'Plain text transcript to clipboard',
      color:    COLORS.accent,
      onPress:  handleCopyScript,
      disabled: false,
    },
  ];

  if (!podcast) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <BlurView
        intensity={20}
        style={{
          flex:            1,
          backgroundColor: 'rgba(10,10,26,0.65)',
          justifyContent:  'flex-end',
        }}
      >
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={{
          backgroundColor:  COLORS.backgroundCard,
          borderTopLeftRadius:  28,
          borderTopRightRadius: 28,
          padding:          SPACING.xl,
          borderTopWidth:   1,
          borderTopColor:   COLORS.border,
          paddingBottom:    SPACING.xl + 8,
        }}>
          {/* Handle */}
          <View style={{
            width:           40,
            height:          4,
            borderRadius:    2,
            backgroundColor: COLORS.border,
            alignSelf:       'center',
            marginBottom:    SPACING.lg,
          }} />

          {/* Header */}
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={{
              color:      COLORS.textPrimary,
              fontSize:   FONTS.sizes.lg,
              fontWeight: '800',
            }}>
              Share Episode
            </Text>
            <Text
              style={{
                color:    COLORS.textMuted,
                fontSize: FONTS.sizes.sm,
                marginTop: 4,
              }}
              numberOfLines={1}
            >
              {podcast.title}
            </Text>
          </View>

          {/* Options */}
          {options.map(opt => (
            <TouchableOpacity
              key={opt.id}
              onPress={opt.disabled ? undefined : opt.onPress}
              activeOpacity={opt.disabled ? 1 : 0.75}
              style={{
                flexDirection:   'row',
                alignItems:      'center',
                gap:             14,
                padding:         SPACING.md,
                backgroundColor: opt.disabled
                  ? `${COLORS.backgroundElevated}80`
                  : COLORS.backgroundElevated,
                borderRadius:    RADIUS.lg,
                marginBottom:    SPACING.sm,
                borderWidth:     1,
                borderColor:     COLORS.border,
                opacity:         opt.disabled ? 0.4 : 1,
              }}
            >
              {/* Icon */}
              <View style={{
                width:           44,
                height:          44,
                borderRadius:    13,
                backgroundColor: `${opt.color}18`,
                alignItems:      'center',
                justifyContent:  'center',
                borderWidth:     1,
                borderColor:     `${opt.color}25`,
              }}>
                {busy === opt.id ? (
                  <ActivityIndicator size="small" color={opt.color} />
                ) : (
                  <Ionicons
                    name={opt.icon as any}
                    size={20}
                    color={opt.color}
                  />
                )}
              </View>

              {/* Labels */}
              <View style={{ flex: 1 }}>
                <Text style={{
                  color:      opt.id === 'copy' && copied
                    ? COLORS.accent
                    : COLORS.textPrimary,
                  fontSize:   FONTS.sizes.base,
                  fontWeight: '600',
                }}>
                  {opt.label}
                </Text>
                <Text style={{
                  color:    COLORS.textMuted,
                  fontSize: FONTS.sizes.xs,
                  marginTop: 2,
                }}>
                  {opt.sublabel}
                </Text>
              </View>

              {!busy && !opt.disabled && (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={COLORS.textMuted}
                />
              )}
            </TouchableOpacity>
          ))}

          {/* Cancel */}
          <TouchableOpacity
            onPress={onClose}
            style={{
              alignItems:      'center',
              paddingVertical: 14,
              marginTop:       4,
            }}
          >
            <Text style={{
              color:      COLORS.textMuted,
              fontSize:   FONTS.sizes.base,
              fontWeight: '600',
            }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

// ─── Voice Preset Card ────────────────────────────────────────────────────────

function VoicePresetCard({
  preset,
  isSelected,
  onPress,
}: {
  preset:     PodcastVoicePresetDef;
  isSelected: boolean;
  onPress:    () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        width:           140,
        backgroundColor: isSelected
          ? `${preset.accentColor}18`
          : COLORS.backgroundCard,
        borderRadius:    RADIUS.lg,
        padding:         SPACING.sm + 4,
        borderWidth:     1.5,
        borderColor:     isSelected ? preset.accentColor : COLORS.border,
        marginRight:     SPACING.sm,
      }}
    >
      <View style={{
        width:           36,
        height:          36,
        borderRadius:    10,
        backgroundColor: `${preset.accentColor}20`,
        alignItems:      'center',
        justifyContent:  'center',
        marginBottom:    8,
      }}>
        <Ionicons
          name={preset.icon as any}
          size={18}
          color={preset.accentColor}
        />
      </View>

      <Text style={{
        color:        isSelected ? preset.accentColor : COLORS.textPrimary,
        fontSize:     FONTS.sizes.sm,
        fontWeight:   '700',
        marginBottom: 3,
      }}>
        {preset.name}
      </Text>

      <Text style={{
        color:      COLORS.textMuted,
        fontSize:   FONTS.sizes.xs,
        lineHeight: 16,
      }}>
        {preset.hostName} & {preset.guestName}
      </Text>

      {isSelected && (
        <View style={{
          position:        'absolute',
          top:             8,
          right:           8,
          width:           18,
          height:          18,
          borderRadius:    9,
          backgroundColor: preset.accentColor,
          alignItems:      'center',
          justifyContent:  'center',
        }}>
          <Ionicons name="checkmark" size={10} color="#FFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Episode Ready Banner ─────────────────────────────────────────────────────
// Compact banner shown at the top — does NOT replace the create form.

function EpisodeReadyBanner({
  title,
  duration,
  hostName,
  guestName,
  podcastId,
  onShare,
  onDismiss,
}: {
  title:     string;
  duration:  number;
  hostName:  string;
  guestName: string;
  podcastId: string;
  onShare:   () => void;
  onDismiss: () => void;
}) {
  const minutes = duration > 0 ? Math.round(duration / 60) : null;

  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <LinearGradient
        colors={[`${COLORS.primary}22`, `${COLORS.accent}18`]}
        style={{
          borderRadius: RADIUS.xl,
          padding:      SPACING.md,
          marginBottom: SPACING.lg,
          borderWidth:  1,
          borderColor:  `${COLORS.primary}40`,
        }}
      >
        {/* Top row */}
        <View style={{
          flexDirection:   'row',
          alignItems:      'center',
          gap:             10,
          marginBottom:    SPACING.sm,
        }}>
          <View style={{
            width:           36,
            height:          36,
            borderRadius:    11,
            backgroundColor: `${COLORS.primary}20`,
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{
              color:      COLORS.primary,
              fontSize:   FONTS.sizes.xs,
              fontWeight: '700',
              marginBottom: 1,
            }}>
              🎉 EPISODE READY
            </Text>
            <Text
              style={{
                color:      COLORS.textPrimary,
                fontSize:   FONTS.sizes.sm,
                fontWeight: '700',
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>

          {/* Dismiss */}
          <TouchableOpacity
            onPress={onDismiss}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="close-circle-outline" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={{
          color:         COLORS.textSecondary,
          fontSize:      FONTS.sizes.xs,
          marginBottom:  SPACING.md,
        }}>
          {hostName} & {guestName}
          {minutes ? ` · ~${minutes} min` : ''}
        </Text>

        {/* Actions */}
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <TouchableOpacity
            onPress={() => {
              router.push({
                pathname: '/(app)/podcast-player' as any,
                params:   { podcastId },
              });
            }}
            style={{
              flex:            1,
              backgroundColor: COLORS.primary,
              borderRadius:    RADIUS.lg,
              paddingVertical: 10,
              flexDirection:   'row',
              alignItems:      'center',
              justifyContent:  'center',
              gap:             6,
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="play-circle" size={18} color="#FFF" />
            <Text style={{
              color:      '#FFF',
              fontSize:   FONTS.sizes.sm,
              fontWeight: '700',
            }}>
              Listen
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onShare}
            style={{
              width:           42,
              height:          42,
              borderRadius:    RADIUS.lg,
              backgroundColor: `${COLORS.primary}15`,
              alignItems:      'center',
              justifyContent:  'center',
              borderWidth:     1,
              borderColor:     `${COLORS.primary}30`,
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="share-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PodcastScreen() {
  const { profile } = useAuth();

  const {
    state: genState,
    isGenerating,
    progressPhase,
    generateFromTopic,
    reset: resetGeneration,
  } = usePodcast();

  const {
    podcasts,
    completedPodcasts,
    totalMinutes,
    loading,
    refreshing,
    refresh,
    deletePodcast,
  } = usePodcastHistory();

  // ── Create form state ─────────────────────────────────────────────────────

  const [topic,             setTopic]             = useState('');
  const [selectedPresetId,  setSelectedPresetId]  = useState('casual');
  const [selectedDuration,  setSelectedDuration]  = useState(10);

  // ── Share sheet state ─────────────────────────────────────────────────────

  const [shareTarget,    setShareTarget]    = useState<Podcast | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  const openShareSheet = useCallback((podcast: Podcast) => {
    setShareTarget(podcast);
    setShareSheetOpen(true);
  }, []);

  const closeShareSheet = useCallback(() => {
    setShareSheetOpen(false);
    // Delay clearing target so the sheet can animate out cleanly
    setTimeout(() => setShareTarget(null), 400);
  }, []);

  // ── Ready banner dismiss / new episode ───────────────────────────────────

  // FIX: We show the banner AND the form at the same time.
  // User can dismiss the banner independently; calling resetGeneration()
  // only clears the banner, it does not clear the form topic input.
  const handleDismissBanner = useCallback(() => {
    resetGeneration();
  }, [resetGeneration]);

  // ── Auto-refresh history after generation ────────────────────────────────

  useEffect(() => {
    if (progressPhase === 'done') {
      refresh();
    }
  }, [progressPhase]);

  // ── Generate handler ──────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    const trimmed = topic.trim();
    if (!trimmed) {
      Alert.alert('Topic Required', 'Enter a topic to generate a podcast about.');
      return;
    }

    const preset =
      PODCAST_VOICE_PRESETS.find(p => p.id === selectedPresetId) ??
      PODCAST_VOICE_PRESETS[0];

    generateFromTopic(trimmed, {
      hostVoice:             preset.hostVoice,
      guestVoice:            preset.guestVoice,
      hostName:              preset.hostName,
      guestName:             preset.guestName,
      targetDurationMinutes: selectedDuration,
    });
  }, [topic, selectedPresetId, selectedDuration, generateFromTopic]);

  // ── Cancel handler ────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    Alert.alert(
      'Cancel Generation',
      'Stop generating this podcast? Audio already generated will be lost.',
      [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Stop',       style: 'destructive', onPress: resetGeneration },
      ]
    );
  }, [resetGeneration]);

  // ── Derived ───────────────────────────────────────────────────────────────

  // FIX: The form is shown whenever the pipeline is NOT actively running.
  // "Done" and "Error" both still show the form so the user can create
  // another episode without any extra taps.
  const showForm      = !isGenerating;
  const showProgress  = progressPhase === 'script' || progressPhase === 'audio';
  const showBanner    = progressPhase === 'done' && genState.podcast !== null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LinearGradient
      colors={[COLORS.background, COLORS.backgroundCard]}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{
              padding:       SPACING.xl,
              paddingBottom: 120,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={COLORS.primary}
              />
            }
          >

            {/* ── Header ──────────────────────────────────────────────── */}
            <Animated.View
              entering={FadeIn.duration(600)}
              style={{
                flexDirection:   'row',
                justifyContent:  'space-between',
                alignItems:      'center',
                marginBottom:    SPACING.xl,
              }}
            >
              <View>
                <Text style={{
                  color:      COLORS.textPrimary,
                  fontSize:   FONTS.sizes.xl,
                  fontWeight: '800',
                }}>
                  Podcast Studio
                </Text>
                <Text style={{
                  color:     COLORS.textMuted,
                  fontSize:  FONTS.sizes.sm,
                  marginTop: 2,
                }}>
                  {completedPodcasts.length > 0
                    ? `${completedPodcasts.length} episode${completedPodcasts.length !== 1 ? 's' : ''} · ${totalMinutes} min total`
                    : 'Turn research into audio episodes'}
                </Text>
              </View>
              <Avatar
                url={profile?.avatar_url}
                name={profile?.full_name}
                size={44}
              />
            </Animated.View>

            {/* ── Episode ready banner ────────────────────────────────── */}
            {showBanner && genState.podcast && (
              <EpisodeReadyBanner
                title={genState.podcast.title}
                duration={genState.podcast.durationSeconds}
                hostName={genState.podcast.config.hostName}
                guestName={genState.podcast.config.guestName}
                podcastId={genState.podcast.id}
                onShare={() => openShareSheet(genState.podcast!)}
                onDismiss={handleDismissBanner}
              />
            )}

            {/* ── Generation progress ─────────────────────────────────── */}
            {showProgress && (
              <PodcastGenerationProgress
                isGeneratingScript={genState.isGeneratingScript}
                isGeneratingAudio={genState.isGeneratingAudio}
                scriptGenerated={genState.scriptGenerated}
                audioProgress={genState.audioProgress}
                progressMessage={genState.progressMessage}
                onCancel={handleCancel}
              />
            )}

            {/* ── Error message ────────────────────────────────────────── */}
            {progressPhase === 'error' && genState.error && (
              <Animated.View
                entering={FadeIn.duration(400)}
                style={{
                  backgroundColor: `${COLORS.error}10`,
                  borderRadius:    RADIUS.lg,
                  padding:         SPACING.md,
                  marginBottom:    SPACING.md,
                  borderWidth:     1,
                  borderColor:     `${COLORS.error}30`,
                  flexDirection:   'row',
                  gap:             10,
                }}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={18}
                  color={COLORS.error}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{
                    color:      COLORS.error,
                    fontSize:   FONTS.sizes.sm,
                    fontWeight: '600',
                    marginBottom: 4,
                  }}>
                    Generation Failed
                  </Text>
                  <Text style={{
                    color:      COLORS.error,
                    fontSize:   FONTS.sizes.xs,
                    lineHeight: 18,
                    opacity:    0.8,
                  }}>
                    {genState.error}
                  </Text>
                </View>
              </Animated.View>
            )}

            {/* ── Create form ─────────────────────────────────────────── */}
            {/* FIX: Always visible when not actively generating */}
            {showForm && (
              <Animated.View entering={FadeInDown.duration(400).delay(100)}>

                {/* Section header */}
                <Text style={{
                  color:          COLORS.textSecondary,
                  fontSize:       FONTS.sizes.sm,
                  fontWeight:     '600',
                  letterSpacing:  0.8,
                  textTransform:  'uppercase',
                  marginBottom:   SPACING.sm,
                }}>
                  Create New Episode
                </Text>

                {/* Topic input */}
                <View style={{
                  backgroundColor: COLORS.backgroundCard,
                  borderRadius:    RADIUS.lg,
                  borderWidth:     1,
                  borderColor:     COLORS.border,
                  marginBottom:    SPACING.md,
                  overflow:        'hidden',
                }}>
                  <View style={{
                    flexDirection: 'row',
                    alignItems:    'flex-start',
                    padding:       SPACING.md,
                    gap:           10,
                  }}>
                    <Ionicons
                      name="mic-outline"
                      size={20}
                      color={COLORS.primary}
                      style={{ marginTop: 2 }}
                    />
                    <TextInput
                      value={topic}
                      onChangeText={setTopic}
                      placeholder="E.g. Future of quantum computing, How AI is changing healthcare..."
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      numberOfLines={3}
                      style={{
                        flex:              1,
                        color:             COLORS.textPrimary,
                        fontSize:          FONTS.sizes.base,
                        lineHeight:        22,
                        minHeight:         70,
                        textAlignVertical: 'top',
                      }}
                    />
                  </View>
                </View>

                {/* Voice preset selector */}
                <Text style={{
                  color:         COLORS.textSecondary,
                  fontSize:      FONTS.sizes.sm,
                  fontWeight:    '600',
                  marginBottom:  SPACING.sm,
                }}>
                  Voice Style
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: SPACING.md }}
                  contentContainerStyle={{ paddingRight: SPACING.md }}
                >
                  {PODCAST_VOICE_PRESETS.map(preset => (
                    <VoicePresetCard
                      key={preset.id}
                      preset={preset}
                      isSelected={selectedPresetId === preset.id}
                      onPress={() => setSelectedPresetId(preset.id)}
                    />
                  ))}
                </ScrollView>

                {/* Duration selector */}
                <Text style={{
                  color:         COLORS.textSecondary,
                  fontSize:      FONTS.sizes.sm,
                  fontWeight:    '600',
                  marginBottom:  SPACING.sm,
                }}>
                  Episode Length
                </Text>

                <View style={{
                  flexDirection: 'row',
                  gap:           8,
                  marginBottom:  SPACING.xl,
                }}>
                  {DURATION_OPTIONS.map(opt => {
                    const isActive = selectedDuration === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setSelectedDuration(opt.value)}
                        style={{
                          flex:            1,
                          backgroundColor: isActive
                            ? COLORS.primary
                            : COLORS.backgroundCard,
                          borderRadius:    RADIUS.lg,
                          paddingVertical: 10,
                          alignItems:      'center',
                          borderWidth:     1,
                          borderColor:     isActive
                            ? COLORS.primary
                            : COLORS.border,
                        }}
                      >
                        <Text style={{
                          color:      isActive ? '#FFF' : COLORS.textSecondary,
                          fontSize:   FONTS.sizes.sm,
                          fontWeight: isActive ? '700' : '400',
                        }}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Generate button */}
                <TouchableOpacity
                  onPress={handleGenerate}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={COLORS.gradientPrimary}
                    style={{
                      borderRadius:    RADIUS.lg,
                      paddingVertical: 16,
                      flexDirection:   'row',
                      alignItems:      'center',
                      justifyContent:  'center',
                      gap:             10,
                    }}
                  >
                    <WaveformVisualizer
                      isPlaying={false}
                      color="#FFFFFF"
                      barWidth={3}
                      barGap={2}
                      maxHeight={18}
                    />
                    <Text style={{
                      color:      '#FFF',
                      fontSize:   FONTS.sizes.md,
                      fontWeight: '700',
                    }}>
                      Generate Podcast
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

              </Animated.View>
            )}

            {/* ── History section ─────────────────────────────────────── */}
            {(podcasts.length > 0 || loading) && (
              <View style={{ marginTop: SPACING.xl }}>
                <Text style={{
                  color:          COLORS.textSecondary,
                  fontSize:       FONTS.sizes.sm,
                  fontWeight:     '600',
                  letterSpacing:  0.8,
                  textTransform:  'uppercase',
                  marginBottom:   SPACING.sm,
                }}>
                  Past Episodes
                </Text>

                {/* Loading skeletons */}
                {loading && podcasts.length === 0 &&
                  [0, 1, 2].map(i => (
                    <View
                      key={i}
                      style={{
                        backgroundColor: COLORS.backgroundCard,
                        borderRadius:    RADIUS.xl,
                        height:          120,
                        marginBottom:    SPACING.sm,
                        borderWidth:     1,
                        borderColor:     COLORS.border,
                        opacity:         1 - i * 0.25,
                      }}
                    />
                  ))
                }

                {/* Cards */}
                {podcasts.map((podcast, i) => (
                  <PodcastCard
                    key={podcast.id}
                    podcast={podcast}
                    index={i}
                    onPlay={() =>
                      router.push({
                        pathname: '/(app)/podcast-player' as any,
                        params:   { podcastId: podcast.id },
                      })
                    }
                    onShare={() => openShareSheet(podcast)}
                    onDelete={() => deletePodcast(podcast.id)}
                  />
                ))}
              </View>
            )}

            {/* ── Empty state ─────────────────────────────────────────── */}
            {!loading && podcasts.length === 0 && progressPhase === 'idle' && (
              <Animated.View
                entering={FadeIn.duration(600)}
                style={{ alignItems: 'center', paddingTop: SPACING.xl }}
              >
                <View style={{
                  width:           72,
                  height:          72,
                  borderRadius:    22,
                  backgroundColor: COLORS.backgroundElevated,
                  alignItems:      'center',
                  justifyContent:  'center',
                  marginBottom:    SPACING.md,
                }}>
                  <Ionicons
                    name="radio-outline"
                    size={32}
                    color={COLORS.border}
                  />
                </View>
                <Text style={{
                  color:      COLORS.textSecondary,
                  fontSize:   FONTS.sizes.base,
                  fontWeight: '600',
                  textAlign:  'center',
                }}>
                  No episodes yet
                </Text>
                <Text style={{
                  color:      COLORS.textMuted,
                  fontSize:   FONTS.sizes.sm,
                  textAlign:  'center',
                  marginTop:  SPACING.sm,
                  lineHeight: 20,
                }}>
                  Enter a topic above and tap{'\n'}"Generate Podcast"
                </Text>
              </Animated.View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Share Sheet ─────────────────────────────────────────────────── */}
      <ShareSheet
        podcast={shareTarget}
        visible={shareSheetOpen}
        onClose={closeShareSheet}
      />
    </LinearGradient>
  );
}