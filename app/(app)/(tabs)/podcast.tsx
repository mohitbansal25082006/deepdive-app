// app/(app)/(tabs)/podcast.tsx
// Part 39 FIXES applied to podcast tab:
//
// FIX 3 (series shows 0 episodes):
//   - useFocusEffect now also calls refreshSeries() so series episode counts
//     are re-fetched from DB every time the tab is focused.
//
// FIX 5 (save creation-screen suggestions):
//   - After createSeries() succeeds, if suggestions were generated in the
//     SeriesCreatorModal, generate() is called with the new seriesId to
//     save those suggestions to the global cache. The series screen picks
//     them up instantly without a second API call.
//
// FIX 6 (redirect to series after creation):
//   - After createSeries() returns the new series, router.push navigates to
//     the podcast-series screen for the new series immediately.
//
// SCROLL FIX: When Generate is tapped, ScrollView scrolls to top so the
//   PodcastGenerationProgress card is immediately visible.

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
}                                           from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, KeyboardAvoidingView, Platform, Alert,
  Modal, ActivityIndicator, FlatList,
}                                           from 'react-native';
import { LinearGradient }                   from 'expo-linear-gradient';
import { Ionicons }                         from '@expo/vector-icons';
import { BlurView }                         from 'expo-blur';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, cancelAnimation,
}                                           from 'react-native-reanimated';
import { SafeAreaView }                     from 'react-native-safe-area-context';
import { router, useFocusEffect }           from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS }   from '../../../src/constants/theme';
import { usePodcast }                       from '../../../src/hooks/usePodcast';
import { usePodcastHistory }               from '../../../src/hooks/usePodcastHistory';
import { usePodcastSeries }                from '../../../src/hooks/usePodcastSeries';
import { useSeriesTopicSuggestions }        from '../../../src/hooks/usePodcastSeries';
import { PodcastGenerationProgress }        from '../../../src/components/podcast/PodcastGenerationProgress';
import { PodcastCard }                      from '../../../src/components/podcast/PodcastCard';
import { WaveformVisualizer }               from '../../../src/components/podcast/WaveformVisualizer';
import { VoiceStyleSelector }               from '../../../src/components/podcast/VoiceStyleSelector';
import { ReportImportSheet }                from '../../../src/components/podcast/ReportImportSheet';
import { SeriesCard }                       from '../../../src/components/podcast/SeriesCard';
import { SeriesCreatorModal }               from '../../../src/components/podcast/SeriesCreatorModal';
import { EpisodeArtwork }                  from '../../../src/components/podcast/EpisodeArtwork';
import { AddToCollectionSheet }             from '../../../src/components/collections/AddToCollectionSheet';
import { CreditBalance }                    from '../../../src/components/credits/CreditBalance';
import { InsufficientCreditsModal }         from '../../../src/components/credits/InsufficientCreditsModal';
import { useCreditGate }                    from '../../../src/hooks/useCreditGate';
import {
  podcastDurationToFeature,
  podcastTotalCost,
  FEATURE_COSTS,
}                                           from '../../../src/constants/credits';
import {
  exportPodcastAsMP3, exportPodcastAsPDF, copyPodcastScriptToClipboard,
}                                           from '../../../src/services/podcastExport';
import {
  startRecording, stopRecording,
  transcribeAudio, requestMicrophonePermission, formatDuration as formatRecDuration,
}                                           from '../../../src/services/voiceResearch';
import { PODCAST_VOICE_PRESETS_V2 }         from '../../../src/constants/podcastV2';
import { AUDIO_QUALITY_OPTIONS }            from '../../../src/constants/podcastV2';
import type { Podcast, ResearchReport }     from '../../../src/types';
import type {
  PodcastVoicePresetV2Def,
  AudioQuality,
  CreateSeriesInput,
}                                           from '../../../src/types/podcast_v2';

// ─── Duration options ──────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: '5 min',  sublabel: '~625 words',   value: 5  },
  { label: '10 min', sublabel: '~1,375 words', value: 10 },
  { label: '15 min', sublabel: '~2,000 words', value: 15 },
  { label: '20 min', sublabel: '~2,750 words', value: 20 },
];

// ─── Share Sheet ───────────────────────────────────────────────────────────────

function ShareSheet({
  podcast, visible, onClose,
}: { podcast: Podcast | null; visible: boolean; onClose: () => void }) {
  const [busy, setBusy]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (visible) { setBusy(null); setCopied(false); } }, [visible, podcast?.id]);

  const handleMP3 = async () => {
    if (!podcast || busy) return; setBusy('mp3');
    try { await exportPodcastAsMP3(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export.'); }
    finally { setBusy(null); }
  };
  const handlePDF = async () => {
    if (!podcast || busy) return; setBusy('pdf');
    try { await exportPodcastAsPDF(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export.'); }
    finally { setBusy(null); }
  };
  const handleCopy = async () => {
    if (!podcast || busy) return; setBusy('copy');
    try { await copyPodcastScriptToClipboard(podcast); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { Alert.alert('Error', 'Could not copy.'); }
    finally { setBusy(null); }
  };

  if (!podcast) return null;

  const options = [
    { id: 'mp3',  icon: 'musical-notes-outline', label: 'Share as MP3',      color: COLORS.primary,   onPress: handleMP3,  disabled: !(podcast.audioSegmentPaths?.filter(Boolean).length) },
    { id: 'pdf',  icon: 'document-text-outline', label: 'Export PDF Script', color: COLORS.secondary, onPress: handlePDF,  disabled: false },
    { id: 'copy', icon: copied ? 'checkmark-circle-outline' : 'copy-outline', label: copied ? 'Copied!' : 'Copy Script', color: COLORS.accent, onPress: handleCopy, disabled: false },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.65)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: SPACING.xl + 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', marginBottom: SPACING.lg }}>Share Episode</Text>
          {options.map(opt => (
            <TouchableOpacity key={opt.id} onPress={opt.disabled ? undefined : opt.onPress} activeOpacity={opt.disabled ? 1 : 0.75}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, opacity: opt.disabled ? 0.4 : 1 }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${opt.color}18`, alignItems: 'center', justifyContent: 'center' }}>
                {busy === opt.id ? <ActivityIndicator size="small" color={opt.color} /> : <Ionicons name={opt.icon as any} size={20} color={opt.color} />}
              </View>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600', flex: 1 }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.base, fontWeight: '600' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );
}

// ─── Voice Input Button ────────────────────────────────────────────────────────

function VoiceInputButton({
  onTranscribed, disabled,
}: { onTranscribed: (text: string) => void; disabled?: boolean }) {
  const [recState, setRecState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [durationMs, setDur]    = useState(0);
  const pulse                   = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(pulse);
    if (recState === 'recording') {
      pulse.value = withRepeat(withSequence(withTiming(1.15, { duration: 700 }), withTiming(1.0, { duration: 700 })), -1, false);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [recState]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const handlePress = useCallback(async () => {
    if (disabled) return;
    if (recState === 'idle') {
      const granted = await requestMicrophonePermission();
      if (!granted) { Alert.alert('Microphone Permission', 'Please enable microphone access.'); return; }
      setDur(0);
      const started = await startRecording(ms => setDur(ms));
      if (started) setRecState('recording');
      else Alert.alert('Error', 'Could not start recording.');
    } else if (recState === 'recording') {
      setRecState('transcribing');
      const uri = await stopRecording();
      if (!uri) { setRecState('idle'); Alert.alert('Error', 'Recording failed.'); return; }
      try {
        const text = await transcribeAudio(uri);
        if (text.trim()) onTranscribed(text.trim());
        else Alert.alert('No Speech Detected', 'Please try again.');
      } catch (err) {
        Alert.alert('Transcription Failed', err instanceof Error ? err.message : 'Could not transcribe.');
      } finally { setRecState('idle'); setDur(0); }
    }
  }, [recState, disabled, onTranscribed]);

  return (
    <Animated.View style={[pulseStyle, { alignSelf: 'center' }]}>
      <TouchableOpacity onPress={handlePress} disabled={disabled || recState === 'transcribing'} activeOpacity={0.8}
        style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: recState === 'recording' ? `${COLORS.error}22` : `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: recState === 'recording' ? `${COLORS.error}50` : `${COLORS.primary}35`, opacity: disabled ? 0.4 : 1 }}>
        {recState === 'transcribing'
          ? <ActivityIndicator size="small" color={COLORS.primary} />
          : <Ionicons name={recState === 'recording' ? 'stop-circle' : 'mic-outline'} size={20} color={recState === 'recording' ? COLORS.error : COLORS.primary} />}
      </TouchableOpacity>
      {recState === 'recording' && (
        <Text style={{ color: COLORS.error, fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 3 }}>{formatRecDuration(durationMs)}</Text>
      )}
    </Animated.View>
  );
}

// ─── Imported Report Chip ─────────────────────────────────────────────────────

function ImportedReportChip({ report, onRemove }: { report: ResearchReport; onRemove: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <LinearGradient colors={[`${COLORS.primary}18`, `${COLORS.accent}10`]} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.sm + 2, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.primary}35`, marginBottom: SPACING.md }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="document-text" size={16} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 1 }}>📎 REPORT IMPORTED</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16 }} numberOfLines={1}>{report.title}</Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ stats, totalMinutes, completedCount }: { stats: any; totalMinutes: number; completedCount: number }) {
  const items = [
    { label: 'Episodes', value: String(completedCount), icon: 'radio-outline', color: COLORS.primary },
    { label: 'Listened', value: totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` : `${totalMinutes}m`, icon: 'headset-outline', color: COLORS.secondary },
    ...(stats?.mostUsedStyle ? [{ label: 'Fav Style', value: stats.mostUsedStyle.replace('_', ' ').split(' ').map((w: string) => w[0].toUpperCase() + w.slice(1)).join(' '), icon: 'mic-outline', color: COLORS.accent }] : []),
    ...(stats?.currentStreakDays > 0 ? [{ label: 'Streak', value: `${stats.currentStreakDays}d 🔥`, icon: 'flame-outline', color: '#F59E0B' }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACING.lg }}>
      {items.map(item => (
        <View key={item.label} style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm + 2, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Text style={{ color: item.color, fontSize: FONTS.sizes.sm, fontWeight: '800', marginBottom: 2 }}>{item.value}</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600' }}>{item.label.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Continue Listening Row ────────────────────────────────────────────────────

function ContinueListeningRow({ items }: { items: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={{ marginBottom: SPACING.lg }}>
      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
        Continue Listening
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACING.sm, paddingRight: SPACING.md }}>
        {items.map(item => (
          <TouchableOpacity key={item.podcastId}
            onPress={() => router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId: item.podcastId } })}
            style={{ width: 160, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
            <EpisodeArtwork title={item.title ?? ''} size={160} borderRadius={0} accentColor={item.accentColor} />
            <View style={{ padding: SPACING.sm }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 4 }} numberOfLines={2}>{item.title}</Text>
              <View style={{ height: 3, backgroundColor: COLORS.backgroundElevated, borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                <View style={{ width: `${Math.round((item.progressPercent ?? 0) * 100)}%` as any, height: '100%', backgroundColor: item.accentColor ?? COLORS.primary, borderRadius: 2 }} />
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>{Math.round((item.progressPercent ?? 0) * 100)}% complete</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Episode Ready Banner ─────────────────────────────────────────────────────

function EpisodeReadyBanner({ title, duration, hostName, guestName, podcastId, onShare, onDismiss }: {
  title: string; duration: number; hostName: string; guestName: string;
  podcastId: string; onShare: () => void; onDismiss: () => void;
}) {
  const mins = duration > 0 ? Math.round(duration / 60) : null;
  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <LinearGradient colors={[`${COLORS.primary}22`, `${COLORS.accent}18`]} style={{ borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}40` }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: SPACING.sm }}>
          <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 1 }}>🎉 EPISODE READY</Text>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>{title}</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <Ionicons name="close-circle-outline" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, marginBottom: SPACING.md }}>
          {hostName} & {guestName}{mins ? ` · ${mins} min` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId } })}
            style={{ flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Ionicons name="play-circle" size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Listen</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} style={{ width: 42, height: 42, borderRadius: RADIUS.lg, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
            <Ionicons name="share-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PodcastScreen() {
  const {
    state: genState, isGenerating, progressPhase,
    generateFromPresetV2, generateFromReport, generateFromTopic, reset: resetGeneration,
  } = usePodcast();

  const {
    podcasts, completedPodcasts, totalMinutes, loading, refreshing,
    refresh, deletePodcast, upsertPodcast,
    podcastsBySeries, continueListening, recentlyPlayed, statsV2,
  } = usePodcastHistory();

  const {
    series, loading: seriesLoading, create: createSeries, saving: serieSaving,
    refresh: refreshSeries,
  } = usePodcastSeries();

  // FIX 5: Access the suggestion hook to save suggestions after series creation
  const { suggestions: pendingSuggestions, generate: saveSuggestionsToCache } = useSeriesTopicSuggestions();

  // SCROLL FIX: ref for the main ScrollView so we can scroll to top on generate
  const scrollViewRef = useRef<ScrollView>(null);

  // FIX 3: Refresh both episodes and series when tab is focused
  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshSeries(); // FIX 3: ensures series episode counts are up-to-date
    }, [])
  );

  // Form state
  const [topic,              setTopic]              = useState('');
  const [selectedPresetId,   setSelectedPresetId]   = useState('casual');
  const [selectedDuration,   setSelectedDuration]   = useState(10);
  const [audioQuality,       setAudioQuality]       = useState<AudioQuality>('standard');
  const [importedReport,     setImportedReport]     = useState<ResearchReport | null>(null);
  const [showImportSheet,    setShowImportSheet]     = useState(false);
  const [shareTarget,        setShareTarget]         = useState<Podcast | null>(null);
  const [shareSheetOpen,     setShareSheetOpen]      = useState(false);
  const [collectionTarget,   setCollectionTarget]    = useState<Podcast | null>(null);
  const [showSeriesCreator,  setShowSeriesCreator]   = useState(false);
  const [selectedSeriesId,   setSelectedSeriesId]    = useState<string | null>(null);
  const [showSeriesPicker,   setShowSeriesPicker]    = useState(false);

  const { balance, guardedConsumeTotal, insufficientInfo, clearInsufficient, isConsuming } = useCreditGate();

  const hasSerpKey = !!(process.env.EXPO_PUBLIC_SERPAPI_KEY?.trim() && process.env.EXPO_PUBLIC_SERPAPI_KEY !== 'your_serpapi_key_here');

  const openShareSheet  = useCallback((podcast: Podcast) => { setShareTarget(podcast); setShareSheetOpen(true); }, []);
  const closeShareSheet = useCallback(() => { setShareSheetOpen(false); setTimeout(() => setShareTarget(null), 400); }, []);

  useEffect(() => {
    if (progressPhase === 'done' && genState.podcast) {
      upsertPodcast(genState.podcast);
      refresh();
      refreshSeries(); // FIX 3: update episode counts after generation
    }
  }, [progressPhase]);

  const selectedPreset = useMemo(
    () => PODCAST_VOICE_PRESETS_V2.find(p => p.id === selectedPresetId) ?? PODCAST_VOICE_PRESETS_V2[0],
    [selectedPresetId]
  );

  const totalCreditCost = useMemo(
    () => podcastTotalCost(selectedDuration, audioQuality),
    [selectedDuration, audioQuality]
  );

  const baseCreditCost   = FEATURE_COSTS[podcastDurationToFeature(selectedDuration)];
  const qualityAddOnCost = totalCreditCost - baseCreditCost;

  const handleGenerate = useCallback(async () => {
    const effectiveTopic = topic.trim() || importedReport?.query || '';
    if (!effectiveTopic) {
      Alert.alert('Topic Required', 'Enter a topic or import a research report.');
      return;
    }

    const qualityLabel =
      audioQuality === 'high'     ? ' · High Quality'     :
      audioQuality === 'lossless' ? ' · Lossless Quality' : '';
    const combinedLabel = `Podcast (${selectedDuration} min${qualityLabel})`;

    const ok = await guardedConsumeTotal(
      podcastDurationToFeature(selectedDuration),
      totalCreditCost,
      combinedLabel,
    );
    if (!ok) return;

    // SCROLL FIX: scroll to top so the progress card is visible immediately
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });

    const config = {
      hostVoice:             selectedPreset.hostVoice,
      guestVoice:            selectedPreset.guestVoice,
      hostName:              selectedPreset.hostName,
      guestName:             selectedPreset.guestName,
      targetDurationMinutes: selectedDuration,
    };

    const v2Options = {
      speakers:      selectedPreset.speakers,
      speakerCount:  selectedPreset.speakerCount,
      presetStyleV2: selectedPreset.presetStyleV2,
      audioQuality,
      seriesId:      selectedSeriesId ?? undefined,
      episodeNumber: selectedSeriesId ? (series.find(s => s.id === selectedSeriesId)?.episodeCount ?? 0) + 1 : undefined,
    };

    if (importedReport) {
      generateFromReport(importedReport, config, selectedPreset.presetStyleV2 as any, v2Options);
    } else {
      generateFromTopic(effectiveTopic, config, selectedPreset.presetStyleV2 as any, v2Options);
    }
  }, [
    topic, importedReport, selectedPreset, selectedDuration, audioQuality,
    totalCreditCost, selectedSeriesId, series,
    guardedConsumeTotal, generateFromReport, generateFromTopic,
  ]);

  const handleCancel = useCallback(() => {
    Alert.alert('Cancel Generation', 'Stop generating this podcast?', [
      { text: 'Keep Going', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: resetGeneration },
    ]);
  }, [resetGeneration]);

  const showForm     = !isGenerating;
  const showProgress = progressPhase === 'script' || progressPhase === 'audio';
  const showBanner   = progressPhase === 'done' && genState.podcast !== null;
  const hasLibrary   = completedPodcasts.length > 0 || series.length > 0;

  // ─── Series Picker Modal ────────────────────────────────────────────────────

  const SeriesPickerModal = () => (
    <Modal visible={showSeriesPicker} animationType="slide" transparent onRequestClose={() => setShowSeriesPicker(false)}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.7)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowSeriesPicker(false)} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, maxHeight: '70%', paddingBottom: SPACING.xl + 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg }} />
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', marginBottom: SPACING.md }}>Add to Series</Text>
          <TouchableOpacity onPress={() => { setSelectedSeriesId(null); setShowSeriesPicker(false); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, backgroundColor: !selectedSeriesId ? `${COLORS.primary}12` : COLORS.backgroundElevated, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: !selectedSeriesId ? COLORS.primary : COLORS.border }}>
            <Ionicons name="close-circle-outline" size={20} color={!selectedSeriesId ? COLORS.primary : COLORS.textMuted} />
            <Text style={{ color: !selectedSeriesId ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>No Series (standalone)</Text>
          </TouchableOpacity>
          {series.map(s => (
            <TouchableOpacity key={s.id} onPress={() => { setSelectedSeriesId(s.id); setShowSeriesPicker(false); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md, backgroundColor: selectedSeriesId === s.id ? `${s.accentColor}12` : COLORS.backgroundElevated, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: selectedSeriesId === s.id ? s.accentColor : COLORS.border }}>
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: `${s.accentColor}20`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={s.iconName as any ?? 'radio-outline'} size={18} color={s.accentColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: selectedSeriesId === s.id ? s.accentColor : COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>{s.name}</Text>
                {/* FIX 3: shows live episodeCount from DB */}
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>{s.episodeCount} episodes</Text>
              </View>
              {selectedSeriesId === s.id && <Ionicons name="checkmark-circle" size={20} color={s.accentColor} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => { setShowSeriesPicker(false); setShowSeriesCreator(true); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACING.md, backgroundColor: `${COLORS.primary}10`, borderRadius: RADIUS.lg, marginTop: SPACING.sm, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.sm, fontWeight: '600' }}>Create New Series</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    </Modal>
  );

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* SCROLL FIX: ref attached here */}
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 140 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { refresh(); refreshSeries(); }} tintColor={COLORS.primary} />}
          >

            {/* Header */}
            <Animated.View entering={FadeIn.duration(600)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl }}>
              <View>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>Podcast Studio</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                    {completedPodcasts.length > 0
                      ? `${completedPodcasts.length} episode${completedPodcasts.length !== 1 ? 's' : ''} · ${totalMinutes} min total`
                      : 'Turn research into audio episodes'}
                  </Text>
                  {hasSerpKey && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${COLORS.success}12`, borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: `${COLORS.success}25` }}>
                      <Ionicons name="globe-outline" size={10} color={COLORS.success} />
                      <Text style={{ color: COLORS.success, fontSize: 9, fontWeight: '700' }}>WEB</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <TouchableOpacity onPress={() => router.push('/(app)/global-search' as any)} style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
                  <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
                </TouchableOpacity>
                <CreditBalance balance={balance} size="sm" />
              </View>
            </Animated.View>

            {/* Episode Ready Banner */}
            {showBanner && genState.podcast && (
              <EpisodeReadyBanner
                title={genState.podcast.title} duration={genState.podcast.durationSeconds}
                hostName={genState.podcast.config.hostName} guestName={genState.podcast.config.guestName}
                podcastId={genState.podcast.id}
                onShare={() => openShareSheet(genState.podcast!)} onDismiss={resetGeneration}
              />
            )}

            {/* Generation Progress */}
            {showProgress && (
              <PodcastGenerationProgress
                isGeneratingScript={genState.isGeneratingScript} isGeneratingAudio={genState.isGeneratingAudio}
                scriptGenerated={genState.scriptGenerated} audioProgress={genState.audioProgress}
                progressMessage={genState.progressMessage} targetDurationMins={selectedDuration}
                webSearchActive={hasSerpKey && !importedReport} onCancel={handleCancel}
              />
            )}

            {/* Error */}
            {progressPhase === 'error' && genState.error && (
              <Animated.View entering={FadeIn.duration(400)} style={{ backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`, flexDirection: 'row', gap: 10 }}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: 4 }}>Generation Failed</Text>
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, lineHeight: 18, opacity: 0.8 }}>{genState.error}</Text>
                </View>
              </Animated.View>
            )}

            {/* Library Section */}
            {hasLibrary && (
              <Animated.View entering={FadeInDown.duration(400)}>
                {(statsV2 || totalMinutes > 0) && (
                  <StatsStrip stats={statsV2} totalMinutes={totalMinutes} completedCount={completedPodcasts.length} />
                )}
                <ContinueListeningRow items={continueListening as any} />
                {series.length > 0 && (
                  <View style={{ marginBottom: SPACING.lg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                      <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>Series</Text>
                      <TouchableOpacity onPress={() => setShowSeriesCreator(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="add" size={14} color={COLORS.primary} />
                        <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>New Series</Text>
                      </TouchableOpacity>
                    </View>
                    {/* FIX 3: SeriesCard shows live episodeCount from series state */}
                    {series.map((s, i) => (
                      <SeriesCard key={s.id} series={s} index={i}
                        onPress={() => router.push({ pathname: '/(app)/podcast-series' as any, params: { seriesId: s.id } })}
                        onNewEpisode={() => { setSelectedSeriesId(s.id); setTopic(''); }}
                      />
                    ))}
                  </View>
                )}
              </Animated.View>
            )}

            {/* Create Form */}
            {showForm && (
              <Animated.View entering={FadeInDown.duration(400).delay(hasLibrary ? 100 : 0)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm }}>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>New Episode</Text>
                  {series.length === 0 && (
                    <TouchableOpacity onPress={() => setShowSeriesCreator(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="albums-outline" size={13} color={COLORS.textMuted} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Create Series</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {importedReport && <ImportedReportChip report={importedReport} onRemove={() => setImportedReport(null)} />}

                {selectedSeriesId && series.find(s => s.id === selectedSeriesId) && (() => {
                  const s = series.find(s => s.id === selectedSeriesId)!;
                  return (
                    <TouchableOpacity onPress={() => setShowSeriesPicker(true)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: SPACING.sm, backgroundColor: `${s.accentColor}12`, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: `${s.accentColor}30` }}>
                      <Ionicons name="albums-outline" size={14} color={s.accentColor} />
                      <Text style={{ color: s.accentColor, fontSize: FONTS.sizes.xs, fontWeight: '600', flex: 1 }}>Adding to: {s.name} · Ep {s.episodeCount + 1}</Text>
                      <TouchableOpacity onPress={() => setSelectedSeriesId(null)}>
                        <Ionicons name="close-circle" size={16} color={s.accentColor} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })()}

                {/* Topic input */}
                <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: SPACING.md, gap: 10 }}>
                    <Ionicons name="mic-outline" size={20} color={COLORS.primary} style={{ marginTop: 2 }} />
                    <TextInput
                      value={topic}
                      onChangeText={text => { setTopic(text); if (importedReport && text !== importedReport.query) setImportedReport(null); }}
                      placeholder={importedReport ? `Topic: ${importedReport.query}` : 'E.g. Future of quantum computing...'}
                      placeholderTextColor={COLORS.textMuted}
                      multiline numberOfLines={3}
                      style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 22, minHeight: 70, textAlignVertical: 'top' }}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, paddingTop: 4, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <VoiceInputButton onTranscribed={(text) => { setTopic(text); setImportedReport(null); }} disabled={isGenerating} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Speak topic</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {series.length > 0 && !selectedSeriesId && (
                        <TouchableOpacity onPress={() => setShowSeriesPicker(true)} disabled={isGenerating}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border, opacity: isGenerating ? 0.5 : 1 }}>
                          <Ionicons name="albums-outline" size={13} color={COLORS.textMuted} />
                          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>Series</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => setShowImportSheet(true)} disabled={isGenerating}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: importedReport ? `${COLORS.primary}18` : COLORS.backgroundElevated, borderRadius: RADIUS.lg, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: importedReport ? `${COLORS.primary}40` : COLORS.border, opacity: isGenerating ? 0.5 : 1 }}>
                        <Ionicons name="document-text-outline" size={13} color={importedReport ? COLORS.primary : COLORS.textMuted} />
                        <Text style={{ color: importedReport ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                          {importedReport ? 'Change' : 'Import'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* Voice Style */}
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>Voice Style</Text>
                <View style={{ marginBottom: SPACING.md }}>
                  <VoiceStyleSelector selectedPresetId={selectedPresetId} onSelectPreset={(p: PodcastVoicePresetV2Def) => setSelectedPresetId(p.id)} variant="grid" />
                </View>

                {selectedPreset.isNew && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: `${COLORS.accent}12`, borderRadius: RADIUS.lg, padding: SPACING.sm, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.accent}25` }}>
                    <Ionicons name="sparkles" size={14} color={COLORS.accent} />
                    <Text style={{ color: COLORS.accent, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                      {selectedPreset.speakerCount === 3 ? '3-speaker episode with distinct guest personas' : 'New celebrity-style voice preset'}
                    </Text>
                  </View>
                )}

                {/* Duration */}
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>Episode Length</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACING.md }}>
                  {DURATION_OPTIONS.map(opt => {
                    const isActive  = selectedDuration === opt.value;
                    const totalCost = podcastTotalCost(opt.value, audioQuality);
                    return (
                      <TouchableOpacity key={opt.value} onPress={() => setSelectedDuration(opt.value)}
                        style={{ flex: 1, backgroundColor: isActive ? COLORS.primary : COLORS.backgroundCard, borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: isActive ? COLORS.primary : COLORS.border }}>
                        <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: isActive ? '700' : '500', marginBottom: 2 }}>{opt.label}</Text>
                        <Text style={{ color: isActive ? 'rgba(255,255,255,0.65)' : COLORS.textMuted, fontSize: 9, marginBottom: 2 }}>{opt.sublabel}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : `${COLORS.primary}12`, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 2 }}>
                          <Ionicons name="flash" size={8} color={isActive ? '#FFF' : COLORS.primary} />
                          <Text style={{ color: isActive ? '#FFF' : COLORS.primary, fontSize: 8, fontWeight: '800' }}>{totalCost}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Audio Quality */}
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>Audio Quality</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACING.xl }}>
                  {AUDIO_QUALITY_OPTIONS.map(opt => {
                    const isActive = audioQuality === opt.value;
                    return (
                      <TouchableOpacity key={opt.value} onPress={() => setAudioQuality(opt.value)}
                        style={{ flex: 1, backgroundColor: isActive ? `${COLORS.primary}15` : COLORS.backgroundCard, borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', borderWidth: 1.5, borderColor: isActive ? COLORS.primary : COLORS.border }}>
                        <Ionicons name={opt.icon as any} size={16} color={isActive ? COLORS.primary : COLORS.textMuted} style={{ marginBottom: 4 }} />
                        <Text style={{ color: isActive ? COLORS.primary : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: isActive ? '700' : '500' }}>{opt.label}</Text>
                        <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 2, textAlign: 'center' }}>{opt.description}</Text>
                        {opt.creditBonus > 0 && (
                          <View style={{ marginTop: 4, backgroundColor: isActive ? `${COLORS.primary}20` : `${COLORS.warning}15`, borderRadius: RADIUS.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: isActive ? `${COLORS.primary}40` : `${COLORS.warning}30` }}>
                            <Text style={{ color: isActive ? COLORS.primary : COLORS.warning, fontSize: 8, fontWeight: '700' }}>+{opt.creditBonus} cr</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {audioQuality !== 'standard' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${COLORS.primary}08`, borderRadius: RADIUS.lg, padding: SPACING.sm, marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.primary}20` }}>
                    <Ionicons name="flash-outline" size={14} color={COLORS.primary} />
                    <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, flex: 1 }}>
                      {baseCreditCost} cr (episode) + {qualityAddOnCost} cr ({audioQuality === 'lossless' ? 'Lossless' : 'High'} quality) = <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{totalCreditCost} cr total</Text>
                    </Text>
                  </View>
                )}

                {/* Generate Button */}
                <TouchableOpacity onPress={handleGenerate} disabled={isConsuming} activeOpacity={0.85}>
                  <LinearGradient colors={importedReport ? [COLORS.primary, '#4A42CC'] : COLORS.gradientPrimary}
                    style={{ borderRadius: RADIUS.lg, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    {isConsuming
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <WaveformVisualizer isPlaying={false} color="#FFFFFF" barWidth={3} barGap={2} maxHeight={18} />}
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '700' }}>
                      {isConsuming ? 'Checking credits...' : importedReport ? 'Generate from Report' : selectedPreset.speakerCount === 3 ? 'Generate 3-Person Episode' : 'Generate Podcast'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Ionicons name="flash" size={10} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{totalCreditCost} cr</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* Past Episodes */}
            {(podcasts.length > 0 || loading) && (
              <View style={{ marginTop: SPACING.xl }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm }}>All Episodes</Text>
                {loading && podcasts.length === 0 && [0, 1, 2].map(i => (
                  <View key={i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, height: 100, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, opacity: 1 - i * 0.3 }} />
                ))}
                {podcasts.map((podcast, i) => (
                  <PodcastCard key={podcast.id} podcast={podcast} index={i}
                    onPlay={() => router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId: podcast.id } })}
                    onShare={() => openShareSheet(podcast)}
                    onDelete={() => deletePodcast(podcast.id)}
                    onLongPress={podcast.status === 'completed' ? () => setCollectionTarget(podcast) : undefined}
                  />
                ))}
              </View>
            )}

            {!loading && podcasts.length === 0 && progressPhase === 'idle' && (
              <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center', paddingTop: SPACING.xl }}>
                <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }}>
                  <Ionicons name="radio-outline" size={32} color={COLORS.border} />
                </View>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.base, fontWeight: '600', textAlign: 'center' }}>No episodes yet</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20 }}>Enter a topic above and tap Generate Podcast</Text>
              </Animated.View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ShareSheet podcast={shareTarget} visible={shareSheetOpen} onClose={closeShareSheet} />

      <ReportImportSheet
        visible={showImportSheet} onClose={() => setShowImportSheet(false)}
        onSelectReport={(report) => { setImportedReport(report); if (!topic.trim()) setTopic(report.query); }}
        selectedReportId={importedReport?.id}
      />

      <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />

      {/* FIX 5 + FIX 6: onCreate saves suggestions to cache and redirects to series */}
      <SeriesCreatorModal
        visible={showSeriesCreator}
        onClose={() => setShowSeriesCreator(false)}
        isSaving={serieSaving}
        onCreate={async (input: CreateSeriesInput) => {
          const newSeries = await createSeries(input);
          if (newSeries) {
            setSelectedSeriesId(newSeries.id);
            setShowSeriesCreator(false);

            // FIX 5: Save any suggestions from the creation screen to the global
            // cache so the series screen displays them instantly without re-calling API
            if (input.name.trim()) {
              saveSuggestionsToCache(input.name, input.description, newSeries.id);
            }

            // FIX 6: Navigate to the new series immediately
            router.push({
              pathname: '/(app)/podcast-series' as any,
              params:   { seriesId: newSeries.id },
            });
          } else {
            setShowSeriesCreator(false);
          }
        }}
      />

      <SeriesPickerModal />

      {collectionTarget && (
        <AddToCollectionSheet
          visible={!!collectionTarget} contentType="podcast"
          contentId={collectionTarget.id} contentTitle={collectionTarget.title}
          onClose={() => setCollectionTarget(null)}
        />
      )}
    </LinearGradient>
  );
}