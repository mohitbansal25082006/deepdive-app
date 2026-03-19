// app/(app)/(tabs)/podcast.tsx
// Part 24 — UPDATED: Credit gate added before generating any podcast.
// Cost: 5min=10cr, 10min=20cr, 15min=30cr, 20min=40cr.
// All Part 19 functionality preserved (6 voice styles, report import, voice input, SerpAPI).
//
// CHANGES FROM PART 19 (additions only, everything else preserved):
//   1. import CreditBalance, InsufficientCreditsModal, useCreditGate, podcastDurationToFeature
//   2. Added { guardedConsume, insufficientInfo, clearInsufficient, balance } from useCreditGate()
//   3. handleGenerate: calls guardedConsume(feature) BEFORE generateFrom*()
//   4. Header: CreditBalance pill added
//   5. Generate button row: credit cost badge shown on the button
//   6. <InsufficientCreditsModal> added at bottom of render
//
// NOTE: This file shows only the COMPLETE updated screen. Copy it in full.

import React, {
  useState, useEffect, useCallback, useRef,
}                                       from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, KeyboardAvoidingView, Platform, Alert,
  Modal, ActivityIndicator,
}                                       from 'react-native';
import { LinearGradient }               from 'expo-linear-gradient';
import { Ionicons }                     from '@expo/vector-icons';
import { BlurView }                     from 'expo-blur';
import Animated, {
  FadeIn, FadeInDown,
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, cancelAnimation,
}                                       from 'react-native-reanimated';
import { SafeAreaView }                 from 'react-native-safe-area-context';
import { router }                       from 'expo-router';

import { COLORS, FONTS, SPACING, RADIUS } from '../../../src/constants/theme';
import { usePodcast, PODCAST_VOICE_PRESETS } from '../../../src/hooks/usePodcast';
import { usePodcastHistory }            from '../../../src/hooks/usePodcastHistory';
import { PodcastGenerationProgress }    from '../../../src/components/podcast/PodcastGenerationProgress';
import { PodcastCard }                  from '../../../src/components/podcast/PodcastCard';
import { WaveformVisualizer }           from '../../../src/components/podcast/WaveformVisualizer';
import { VoiceStyleSelector }           from '../../../src/components/podcast/VoiceStyleSelector';
import { ReportImportSheet }            from '../../../src/components/podcast/ReportImportSheet';
import { Avatar }                       from '../../../src/components/common/Avatar';
import { useAuth }                      from '../../../src/context/AuthContext';
// ── Part 24 ─────────────────────────────────────────────────────────────────
import { CreditBalance }                from '../../../src/components/credits/CreditBalance';
import { InsufficientCreditsModal }     from '../../../src/components/credits/InsufficientCreditsModal';
import { useCreditGate }                from '../../../src/hooks/useCreditGate';
import { podcastDurationToFeature, FEATURE_COSTS } from '../../../src/constants/credits';
// ────────────────────────────────────────────────────────────────────────────
import {
  startRecording, stopRecording, cancelRecording,
  transcribeAudio, requestMicrophonePermission, formatDuration,
}                                       from '../../../src/services/voiceResearch';
import {
  exportPodcastAsMP3, exportPodcastAsPDF, copyPodcastScriptToClipboard,
}                                       from '../../../src/services/podcastExport';
import type { Podcast, ResearchReport } from '../../../src/types';
import type { PodcastVoicePresetDef }   from '../../../src/hooks/usePodcast';
import type { VoicePresetStyle }        from '../../../src/services/agents/podcastScriptAgent';

// ─── Duration options ─────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: '5 min',  sublabel: '~625 words',  value: 5  },
  { label: '10 min', sublabel: '~1,375 words', value: 10 },
  { label: '15 min', sublabel: '~2,000 words', value: 15 },
  { label: '20 min', sublabel: '~2,750 words', value: 20 },
];

// ─── Share Sheet ──────────────────────────────────────────────────────────────

function ShareSheet({ podcast, visible, onClose }: { podcast: Podcast | null; visible: boolean; onClose: () => void }) {
  const [busy, setBusy]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (visible) { setBusy(null); setCopied(false); } }, [visible, podcast?.id]);

  const handleMP3 = async () => {
    if (!podcast || busy) return;
    setBusy('mp3');
    try { await exportPodcastAsMP3(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not export MP3.'); }
    finally { setBusy(null); }
  };

  const handlePDF = async () => {
    if (!podcast || busy) return;
    setBusy('pdf');
    try { await exportPodcastAsPDF(podcast); }
    catch (err) { Alert.alert('Export Failed', err instanceof Error ? err.message : 'Could not generate PDF.'); }
    finally { setBusy(null); }
  };

  const handleCopyScript = async () => {
    if (!podcast || busy) return;
    setBusy('copy');
    try { await copyPodcastScriptToClipboard(podcast); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { Alert.alert('Error', 'Could not copy to clipboard.'); }
    finally { setBusy(null); }
  };

  if (!podcast) return null;
  const options = [
    { id: 'mp3',  icon: 'musical-notes-outline',  label: 'Share as MP3',      sublabel: 'Export full episode audio',        color: COLORS.primary,   onPress: handleMP3,        disabled: !(podcast.audioSegmentPaths?.filter(Boolean).length) },
    { id: 'pdf',  icon: 'document-text-outline',  label: 'Export PDF Script', sublabel: 'Styled transcript with all turns', color: COLORS.secondary, onPress: handlePDF,        disabled: false },
    { id: 'copy', icon: copied ? 'checkmark-circle-outline' : 'copy-outline', label: copied ? 'Copied!' : 'Copy Script', sublabel: 'Plain text transcript to clipboard', color: COLORS.accent, onPress: handleCopyScript, disabled: false },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.65)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: COLORS.backgroundCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING.xl, borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: SPACING.xl + 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.lg }} />
          <View style={{ marginBottom: SPACING.lg }}>
            <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800' }}>Share Episode</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, marginTop: 4 }} numberOfLines={1}>{podcast.title}</Text>
          </View>
          {options.map(opt => (
            <TouchableOpacity key={opt.id} onPress={opt.disabled ? undefined : opt.onPress} activeOpacity={opt.disabled ? 1 : 0.75}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: SPACING.md, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, opacity: opt.disabled ? 0.4 : 1 }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: `${opt.color}18`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${opt.color}25` }}>
                {busy === opt.id ? <ActivityIndicator size="small" color={opt.color} /> : <Ionicons name={opt.icon as any} size={20} color={opt.color} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '600' }}>{opt.label}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, marginTop: 2 }}>{opt.sublabel}</Text>
              </View>
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

// ─── Voice Input Button ───────────────────────────────────────────────────────

function VoiceInputButton({ onTranscribed, disabled }: { onTranscribed: (text: string) => void; disabled?: boolean }) {
  const [state, setState]         = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [durationMs, setDuration] = useState(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(pulse);
    if (state === 'recording') {
      pulse.value = withRepeat(withSequence(withTiming(1.15, { duration: 700 }), withTiming(1.0, { duration: 700 })), -1, false);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [state]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const handlePress = useCallback(async () => {
    if (disabled) return;
    if (state === 'idle') {
      const granted = await requestMicrophonePermission();
      if (!granted) { Alert.alert('Microphone Permission', 'Please enable microphone access in device settings.'); return; }
      setDuration(0);
      const started = await startRecording(ms => setDuration(ms));
      if (started) setState('recording');
      else Alert.alert('Error', 'Could not start recording. Please try again.');
    } else if (state === 'recording') {
      setState('transcribing');
      const uri = await stopRecording();
      if (!uri) { setState('idle'); Alert.alert('Error', 'Recording failed.'); return; }
      try {
        const text = await transcribeAudio(uri);
        if (text.trim()) onTranscribed(text.trim());
        else Alert.alert('No Speech Detected', 'Please try again.');
      } catch (err) {
        Alert.alert('Transcription Failed', err instanceof Error ? err.message : 'Could not transcribe audio.');
      } finally { setState('idle'); setDuration(0); }
    }
  }, [state, disabled, onTranscribed]);

  const isRecording    = state === 'recording';
  const isTranscribing = state === 'transcribing';
  const buttonColor    = isRecording ? COLORS.error : COLORS.primary;

  return (
    <Animated.View style={[pulseStyle, { alignSelf: 'center' }]}>
      <TouchableOpacity onPress={handlePress} disabled={disabled || isTranscribing} activeOpacity={0.8} style={{
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: isRecording ? `${COLORS.error}22` : `${COLORS.primary}15`,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: isRecording ? `${COLORS.error}50` : `${COLORS.primary}35`,
        opacity: disabled ? 0.4 : 1,
      }}>
        {isTranscribing
          ? <ActivityIndicator size="small" color={COLORS.primary} />
          : <Ionicons name={isRecording ? 'stop-circle' : 'mic-outline'} size={20} color={buttonColor} />}
      </TouchableOpacity>
      {isRecording && (
        <Text style={{ color: COLORS.error, fontSize: 9, fontWeight: '700', textAlign: 'center', marginTop: 3 }}>
          {formatDuration(durationMs)}
        </Text>
      )}
    </Animated.View>
  );
}

// ─── Imported Report Chip ─────────────────────────────────────────────────────

function ImportedReportChip({ report, onRemove }: { report: ResearchReport; onRemove: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <LinearGradient colors={[`${COLORS.primary}18`, `${COLORS.accent}10`]} style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: SPACING.sm + 2, borderRadius: RADIUS.lg,
        borderWidth: 1, borderColor: `${COLORS.primary}35`, marginBottom: SPACING.md,
      }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${COLORS.primary}20`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="document-text" size={16} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: COLORS.primary, fontSize: FONTS.sizes.xs, fontWeight: '700', marginBottom: 1 }}>📎 REPORT IMPORTED</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 16 }} numberOfLines={1}>{report.title}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 9, fontWeight: '600' }}>{report.sourcesCount} sources</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 9 }}>{report.reliabilityScore}/10 reliability</Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Episode Ready Banner ─────────────────────────────────────────────────────

function EpisodeReadyBanner({ title, duration, hostName, guestName, podcastId, onShare, onDismiss }: {
  title: string; duration: number; hostName: string; guestName: string;
  podcastId: string; onShare: () => void; onDismiss: () => void;
}) {
  const minutes = duration > 0 ? Math.round(duration / 60) : null;
  return (
    <Animated.View entering={FadeIn.duration(500)}>
      <LinearGradient colors={[`${COLORS.primary}22`, `${COLORS.accent}18`]} style={{
        borderRadius: RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.lg,
        borderWidth: 1, borderColor: `${COLORS.primary}40`,
      }}>
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
          {hostName} & {guestName}{minutes ? ` · ${minutes} min` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId } })}
            style={{ flex: 1, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Ionicons name="play-circle" size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: FONTS.sizes.sm, fontWeight: '700' }}>Listen</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare}
            style={{ width: 42, height: 42, borderRadius: RADIUS.lg, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.primary}30` }}>
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
  const { state: genState, isGenerating, progressPhase, generateFromTopic, generateFromReport, reset: resetGeneration } = usePodcast();
  const { podcasts, completedPodcasts, totalMinutes, loading, refreshing, refresh, deletePodcast } = usePodcastHistory();

  const [topic,            setTopic]            = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('casual');
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [importedReport,   setImportedReport]   = useState<ResearchReport | null>(null);
  const [showImportSheet,  setShowImportSheet]  = useState(false);
  const [shareTarget,      setShareTarget]      = useState<Podcast | null>(null);
  const [shareSheetOpen,   setShareSheetOpen]   = useState(false);

  // ── Part 24: Credit gate ──────────────────────────────────────────────────
  const {
    balance,
    guardedConsume,
    insufficientInfo,
    clearInsufficient,
    isConsuming,
  } = useCreditGate();
  // ─────────────────────────────────────────────────────────────────────────

  const hasSerpKey = !!(
    process.env.EXPO_PUBLIC_SERPAPI_KEY &&
    process.env.EXPO_PUBLIC_SERPAPI_KEY.trim() &&
    process.env.EXPO_PUBLIC_SERPAPI_KEY !== 'your_serpapi_key_here'
  );

  const openShareSheet  = useCallback((podcast: Podcast) => { setShareTarget(podcast); setShareSheetOpen(true); }, []);
  const closeShareSheet = useCallback(() => { setShareSheetOpen(false); setTimeout(() => setShareTarget(null), 400); }, []);

  useEffect(() => { if (progressPhase === 'done') refresh(); }, [progressPhase]);

  // ── Generate with credit gate ─────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    const effectiveTopic = topic.trim() || importedReport?.query || '';
    if (!effectiveTopic) {
      Alert.alert('Topic Required', importedReport ? 'The imported report has no query. Please type a topic.' : 'Enter a topic or import a research report.');
      return;
    }

    // ── Part 24: Check & deduct credits BEFORE generating ────────────────
    const feature = podcastDurationToFeature(selectedDuration);
    const ok = await guardedConsume(feature);
    if (!ok) return;
    // ─────────────────────────────────────────────────────────────────────

    const preset = PODCAST_VOICE_PRESETS.find(p => p.id === selectedPresetId) ?? PODCAST_VOICE_PRESETS[0];
    const config = {
      hostVoice: preset.hostVoice, guestVoice: preset.guestVoice,
      hostName:  preset.hostName,  guestName:  preset.guestName,
      targetDurationMinutes: selectedDuration,
    };

    if (importedReport) generateFromReport(importedReport, config, preset.presetStyle as VoicePresetStyle);
    else                generateFromTopic(effectiveTopic, config, preset.presetStyle as VoicePresetStyle);
  }, [topic, importedReport, selectedPresetId, selectedDuration, guardedConsume, generateFromReport, generateFromTopic]);

  const handleCancel = useCallback(() => {
    Alert.alert('Cancel Generation', 'Stop generating this podcast?',
      [{ text: 'Keep Going', style: 'cancel' }, { text: 'Stop', style: 'destructive', onPress: resetGeneration }]);
  }, [resetGeneration]);

  const handleVoiceTranscribed = useCallback((text: string) => { setTopic(text); setImportedReport(null); }, []);
  const handleReportSelected   = useCallback((report: ResearchReport) => { setImportedReport(report); if (!topic.trim()) setTopic(report.query); }, [topic]);
  const handleRemoveReport     = useCallback(() => setImportedReport(null), []);
  const handlePresetSelect     = useCallback((preset: PodcastVoicePresetDef) => setSelectedPresetId(preset.id), []);

  const showForm     = !isGenerating;
  const showProgress = progressPhase === 'script' || progressPhase === 'audio';
  const showBanner   = progressPhase === 'done' && genState.podcast !== null;

  // Credit cost for selected duration
  const creditFeature = podcastDurationToFeature(selectedDuration);
  const creditCost    = FEATURE_COSTS[creditFeature];

  return (
    <LinearGradient colors={[COLORS.background, COLORS.backgroundCard]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.primary} />}
          >
            {/* ── Header ──────────────────────────────────────────────── */}
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
              {/* Part 24: Balance pill */}
              <CreditBalance balance={balance} size="sm" />
            </Animated.View>

            {showBanner && genState.podcast && (
              <EpisodeReadyBanner
                title={genState.podcast.title} duration={genState.podcast.durationSeconds}
                hostName={genState.podcast.config.hostName} guestName={genState.podcast.config.guestName}
                podcastId={genState.podcast.id}
                onShare={() => openShareSheet(genState.podcast!)} onDismiss={resetGeneration}
              />
            )}

            {showProgress && (
              <PodcastGenerationProgress
                isGeneratingScript={genState.isGeneratingScript} isGeneratingAudio={genState.isGeneratingAudio}
                scriptGenerated={genState.scriptGenerated} audioProgress={genState.audioProgress}
                progressMessage={genState.progressMessage} targetDurationMins={selectedDuration}
                webSearchActive={hasSerpKey && !importedReport} onCancel={handleCancel}
              />
            )}

            {progressPhase === 'error' && genState.error && (
              <Animated.View entering={FadeIn.duration(400)} style={{
                backgroundColor: `${COLORS.error}10`, borderRadius: RADIUS.lg, padding: SPACING.md,
                marginBottom: SPACING.md, borderWidth: 1, borderColor: `${COLORS.error}30`,
                flexDirection: 'row', gap: 10,
              }}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: 4 }}>Generation Failed</Text>
                  <Text style={{ color: COLORS.error, fontSize: FONTS.sizes.xs, lineHeight: 18, opacity: 0.8 }}>{genState.error}</Text>
                </View>
              </Animated.View>
            )}

            {showForm && (
              <Animated.View entering={FadeInDown.duration(400).delay(100)}>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                  Create New Episode
                </Text>

                {importedReport && <ImportedReportChip report={importedReport} onRemove={handleRemoveReport} />}

                {/* Topic input */}
                <View style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: SPACING.md, gap: 10 }}>
                    <Ionicons name="mic-outline" size={20} color={COLORS.primary} style={{ marginTop: 2 }} />
                    <TextInput
                      value={topic}
                      onChangeText={text => { setTopic(text); if (importedReport && text !== importedReport.query) setImportedReport(null); }}
                      placeholder={importedReport ? `Topic from report: ${importedReport.query}` : 'E.g. Future of quantum computing...'}
                      placeholderTextColor={COLORS.textMuted}
                      multiline numberOfLines={3}
                      style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, lineHeight: 22, minHeight: 70, textAlignVertical: 'top' }}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, paddingTop: 4, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <VoiceInputButton onTranscribed={handleVoiceTranscribed} disabled={isGenerating} />
                      <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>Speak your topic</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowImportSheet(true)} disabled={isGenerating} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: importedReport ? `${COLORS.primary}18` : COLORS.backgroundElevated,
                      borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 7,
                      borderWidth: 1, borderColor: importedReport ? `${COLORS.primary}40` : COLORS.border,
                      opacity: isGenerating ? 0.5 : 1,
                    }}>
                      <Ionicons name="document-text-outline" size={14} color={importedReport ? COLORS.primary : COLORS.textMuted} />
                      <Text style={{ color: importedReport ? COLORS.primary : COLORS.textMuted, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
                        {importedReport ? 'Change Report' : 'Import Report'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Voice Style */}
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>Voice Style</Text>
                <View style={{ marginBottom: SPACING.md }}>
                  <VoiceStyleSelector selectedPresetId={selectedPresetId} onSelectPreset={handlePresetSelect} variant="grid" />
                </View>

                {/* Duration */}
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', marginBottom: SPACING.sm }}>Episode Length</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: SPACING.xl }}>
                  {DURATION_OPTIONS.map(opt => {
                    const isActive    = selectedDuration === opt.value;
                    const optFeature  = podcastDurationToFeature(opt.value);
                    const optCost     = FEATURE_COSTS[optFeature];
                    return (
                      <TouchableOpacity
                        key={opt.value} onPress={() => setSelectedDuration(opt.value)}
                        style={{
                          flex: 1,
                          backgroundColor: isActive ? COLORS.primary : COLORS.backgroundCard,
                          borderRadius: RADIUS.lg, paddingVertical: 10, paddingHorizontal: 4,
                          alignItems: 'center', borderWidth: 1,
                          borderColor: isActive ? COLORS.primary : COLORS.border,
                        }}
                      >
                        <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: isActive ? '700' : '500', marginBottom: 2 }}>
                          {opt.label}
                        </Text>
                        <Text style={{ color: isActive ? 'rgba(255,255,255,0.65)' : COLORS.textMuted, fontSize: 9, fontWeight: '500', marginBottom: 2 }}>
                          {opt.sublabel}
                        </Text>
                        {/* Part 24: credit cost per option */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : `${COLORS.primary}12`, borderRadius: RADIUS.full, paddingHorizontal: 5, paddingVertical: 2 }}>
                          <Ionicons name="flash" size={8} color={isActive ? '#FFF' : COLORS.primary} />
                          <Text style={{ color: isActive ? '#FFF' : COLORS.primary, fontSize: 8, fontWeight: '800' }}>{optCost}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Generate button */}
                <TouchableOpacity onPress={handleGenerate} disabled={isConsuming} activeOpacity={0.85}>
                  <LinearGradient
                    colors={importedReport ? [COLORS.primary, '#4A42CC'] : COLORS.gradientPrimary}
                    style={{ borderRadius: RADIUS.lg, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                  >
                    {isConsuming
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <WaveformVisualizer isPlaying={false} color="#FFFFFF" barWidth={3} barGap={2} maxHeight={18} />}
                    <Text style={{ color: '#FFF', fontSize: FONTS.sizes.md, fontWeight: '700' }}>
                      {isConsuming ? 'Checking credits...' : importedReport ? 'Generate from Report' : 'Generate Podcast'}
                    </Text>
                    {/* Part 24: credit cost badge on button */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Ionicons name="flash" size={10} color="#FFF" />
                      <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '800' }}>{creditCost} cr</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── History ──────────────────────────────────────────────── */}
            {(podcasts.length > 0 || loading) && (
              <View style={{ marginTop: SPACING.xl }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: SPACING.sm }}>
                  Past Episodes
                </Text>
                {loading && podcasts.length === 0 && [0, 1, 2].map(i => (
                  <View key={i} style={{ backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, height: 120, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, opacity: 1 - i * 0.25 }} />
                ))}
                {podcasts.map((podcast, i) => (
                  <PodcastCard key={podcast.id} podcast={podcast} index={i}
                    onPlay={() => router.push({ pathname: '/(app)/podcast-player' as any, params: { podcastId: podcast.id } })}
                    onShare={() => openShareSheet(podcast)} onDelete={() => deletePodcast(podcast.id)}
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
                <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20 }}>
                  Enter a topic or import a research report{'\n'}then tap "Generate Podcast"
                </Text>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ShareSheet podcast={shareTarget} visible={shareSheetOpen} onClose={closeShareSheet} />
      <ReportImportSheet visible={showImportSheet} onClose={() => setShowImportSheet(false)} onSelectReport={handleReportSelected} selectedReportId={importedReport?.id} />

      {/* Part 24: Insufficient Credits Modal */}
      <InsufficientCreditsModal visible={!!insufficientInfo} info={insufficientInfo} onClose={clearInsufficient} />
    </LinearGradient>
  );
}