// src/constants/podcastV2.ts
// Part 39 — Advanced Podcast Preset Definitions
//
// Expands the 6 original presets to 11 presets (5 new celebrity-style ones).
// Also defines guest persona configs, ambient moods, and speaker chemistry rules.

import type {
  VoicePresetStyleV2,
  GuestPersona,
  SpeakerConfig,
  AudioQuality,
} from '../types/podcast_v2';
import type { PodcastVoice } from '../types';

// ─── Full 11-Preset Definitions ───────────────────────────────────────────────

export interface PodcastVoicePresetV2Def {
  id:              string;
  name:            string;
  description:     string;
  speakerCount:    2 | 3;
  speakers:        SpeakerConfig[];
  /** Legacy compat */
  hostVoice:       PodcastVoice;
  guestVoice:      PodcastVoice;
  hostName:        string;
  guestName:       string;
  icon:            string;
  accentColor:     string;
  presetStyleV2:   VoicePresetStyleV2;
  bestFor:         string;
  isNew?:          boolean;
}

export const PODCAST_VOICE_PRESETS_V2: PodcastVoicePresetV2Def[] = [
  // ── Original 6 (preserved) ─────────────────────────────────────────────────
  {
    id:           'casual',
    name:         'Casual Chat',
    description:  'Two friends having a relaxed, engaging conversation',
    speakerCount: 2,
    speakers: [
      { name: 'Alex', voice: 'alloy', role: 'host',   style: 'warm, curious' },
      { name: 'Sam',  voice: 'nova',  role: 'guest1', style: 'knowledgeable friend' },
    ],
    hostVoice: 'alloy', guestVoice: 'nova',
    hostName: 'Alex', guestName: 'Sam',
    icon: 'chatbubbles-outline', accentColor: '#6C63FF',
    presetStyleV2: 'casual', bestFor: 'General topics, science, culture',
  },
  {
    id:           'expert',
    name:         'Expert Interview',
    description:  'Professional deep-dive with an authority figure',
    speakerCount: 2,
    speakers: [
      { name: 'Marcus',   voice: 'onyx',    role: 'host',   style: 'sharp journalist' },
      { name: 'Dr. Chen', voice: 'shimmer', role: 'guest1', persona: 'academic', style: 'leading authority' },
    ],
    hostVoice: 'onyx', guestVoice: 'shimmer',
    hostName: 'Marcus', guestName: 'Dr. Chen',
    icon: 'mic-outline', accentColor: '#FF6584',
    presetStyleV2: 'expert', bestFor: 'Research, academia, professional topics',
  },
  {
    id:           'tech',
    name:         'Tech Podcast',
    description:  'Technical analysis and commentary on technology',
    speakerCount: 2,
    speakers: [
      { name: 'Jordan',    voice: 'echo',  role: 'host',   style: 'tech journalist' },
      { name: 'Dr. Riley', voice: 'fable', role: 'guest1', persona: 'practitioner', style: 'senior engineer' },
    ],
    hostVoice: 'echo', guestVoice: 'fable',
    hostName: 'Jordan', guestName: 'Dr. Riley',
    icon: 'hardware-chip-outline', accentColor: '#43E97B',
    presetStyleV2: 'tech', bestFor: 'AI, software, engineering, startups',
  },
  {
    id:           'narrative',
    name:         'Story Mode',
    description:  'Documentary-style storytelling with an insider perspective',
    speakerCount: 2,
    speakers: [
      { name: 'Maya',  voice: 'nova',  role: 'host',   style: 'narrator' },
      { name: 'James', voice: 'alloy', role: 'guest1', persona: 'industry_insider', style: 'eyewitness insider' },
    ],
    hostVoice: 'nova', guestVoice: 'alloy',
    hostName: 'Maya', guestName: 'James',
    icon: 'book-outline', accentColor: '#FFA726',
    presetStyleV2: 'narrative', bestFor: 'History, case studies, investigative topics',
  },
  {
    id:           'debate',
    name:         'Debate Format',
    description:  'Structured exploration of multiple sides of a complex issue',
    speakerCount: 2,
    speakers: [
      { name: 'Taylor', voice: 'shimmer', role: 'host',   style: 'neutral moderator' },
      { name: 'Morgan', voice: 'onyx',    role: 'guest1', persona: 'skeptic', style: 'passionate advocate' },
    ],
    hostVoice: 'shimmer', guestVoice: 'onyx',
    hostName: 'Taylor', guestName: 'Morgan',
    icon: 'git-branch-outline', accentColor: '#29B6F6',
    presetStyleV2: 'debate', bestFor: 'Policy, ethics, controversial topics',
  },
  {
    id:           'news',
    name:         'News Analysis',
    description:  'Breaking down current events with expert commentary',
    speakerCount: 2,
    speakers: [
      { name: 'Dana',          voice: 'alloy', role: 'host',   style: 'news anchor' },
      { name: 'Prof. Williams', voice: 'echo', role: 'guest1', persona: 'academic', style: 'expert analyst' },
    ],
    hostVoice: 'alloy', guestVoice: 'echo',
    hostName: 'Dana', guestName: 'Prof. Williams',
    icon: 'newspaper-outline', accentColor: '#EC4899',
    presetStyleV2: 'news', bestFor: 'Current events, market news, global affairs',
  },

  // ── New 5 Celebrity-Style Presets (Part 39) ─────────────────────────────────
  {
    id:           'formal_broadcaster',
    name:         'Formal Broadcaster',
    description:  'Polished broadcast-quality journalism with three voices',
    speakerCount: 3,
    speakers: [
      { name: 'Catherine', voice: 'shimmer', role: 'host',   style: 'authoritative anchor' },
      { name: 'Dr. Hassan', voice: 'onyx',   role: 'guest1', persona: 'academic',           style: 'senior correspondent' },
      { name: 'Priya',      voice: 'nova',   role: 'guest2', persona: 'industry_insider',   style: 'field reporter' },
    ],
    hostVoice: 'shimmer', guestVoice: 'onyx',
    hostName: 'Catherine', guestName: 'Dr. Hassan',
    icon: 'globe-outline', accentColor: '#0EA5E9',
    presetStyleV2: 'formal_broadcaster', bestFor: 'International affairs, policy, finance',
    isNew: true,
  },
  {
    id:           'casual_youtuber',
    name:         'Casual YouTuber',
    description:  'Gen-Z energy, tangents welcome, brutally honest takes',
    speakerCount: 3,
    speakers: [
      { name: 'Kyle',   voice: 'echo',  role: 'host',   style: 'energetic host', catchphrases: ['no cap', 'lowkey', 'for real though'] },
      { name: 'Zoe',    voice: 'nova',  role: 'guest1', persona: 'enthusiast',   style: 'hyped co-host',  catchphrases: ['that is wild', 'wait wait wait'] },
      { name: 'Marcus', voice: 'fable', role: 'guest2', persona: 'skeptic',      style: 'devil\'s advocate' },
    ],
    hostVoice: 'echo', guestVoice: 'nova',
    hostName: 'Kyle', guestName: 'Zoe',
    icon: 'videocam-outline', accentColor: '#FF0066',
    presetStyleV2: 'casual_youtuber', bestFor: 'Pop culture, tech reviews, internet trends',
    isNew: true,
  },
  {
    id:           'npr_journalist',
    name:         'NPR Journalist',
    description:  'Thoughtful, nuanced storytelling with personal impact focus',
    speakerCount: 2,
    speakers: [
      { name: 'Robin',   voice: 'nova',    role: 'host',   style: 'empathetic storyteller' },
      { name: 'Dr. Park', voice: 'shimmer', role: 'guest1', persona: 'practitioner', style: 'human-centered expert' },
    ],
    hostVoice: 'nova', guestVoice: 'shimmer',
    hostName: 'Robin', guestName: 'Dr. Park',
    icon: 'radio-outline', accentColor: '#7C5CBF',
    presetStyleV2: 'npr_journalist', bestFor: 'Human interest, social issues, science journalism',
    isNew: true,
  },
  {
    id:           'joe_rogan',
    name:         'Long-Form Deep Dive',
    description:  'Unfiltered three-hour-vibe long-form with two opinionated guests',
    speakerCount: 3,
    speakers: [
      { name: 'Jake',  voice: 'onyx',    role: 'host',   style: 'curious host who challenges everything', catchphrases: ['have you ever tried', 'that\'s insane dude', '100%'] },
      { name: 'Brian', voice: 'echo',    role: 'guest1', persona: 'practitioner',    style: 'experienced practitioner', speedMultiplier: 0.95 },
      { name: 'Chris', voice: 'fable',   role: 'guest2', persona: 'industry_insider', style: 'conspiracy-adjacent thinker' },
    ],
    hostVoice: 'onyx', guestVoice: 'echo',
    hostName: 'Jake', guestName: 'Brian',
    icon: 'fitness-outline', accentColor: '#F59E0B',
    presetStyleV2: 'joe_rogan', bestFor: 'Science, MMA, business, big ideas',
    isNew: true,
  },
  {
    id:           'bbc_documentary',
    name:         'BBC Documentary',
    description:  'Authoritative narrator + expert panel, cinematic gravitas',
    speakerCount: 3,
    speakers: [
      { name: 'Elizabeth', voice: 'shimmer', role: 'host',   style: 'eloquent narrator', speedMultiplier: 0.9 },
      { name: 'Professor Hughes', voice: 'onyx', role: 'guest1', persona: 'academic', style: 'world-renowned expert', speedMultiplier: 0.88 },
      { name: 'Dr. Okafor',       voice: 'nova', role: 'guest2', persona: 'practitioner', style: 'field researcher' },
    ],
    hostVoice: 'shimmer', guestVoice: 'onyx',
    hostName: 'Elizabeth', guestName: 'Professor Hughes',
    icon: 'film-outline', accentColor: '#1E40AF',
    presetStyleV2: 'bbc_documentary', bestFor: 'Nature, history, science, culture',
    isNew: true,
  },
];

// ─── Guest Persona Descriptions ───────────────────────────────────────────────

export const GUEST_PERSONA_CONFIG: Record<GuestPersona, {
  label:       string;
  description: string;
  icon:        string;
  color:       string;
  styleGuide:  string;
}> = {
  skeptic: {
    label: 'Skeptic', description: 'Challenges every claim, demands evidence',
    icon: 'help-circle-outline', color: '#EF4444',
    styleGuide: 'Always ask "but what\'s the evidence?" Push back firmly on unsupported claims. Concede only when data is overwhelming.',
  },
  enthusiast: {
    label: 'Enthusiast', description: 'Passionate advocate, sees potential everywhere',
    icon: 'star-outline', color: '#F59E0B',
    styleGuide: 'Genuinely excited about the topic. Uses phrases like "this is revolutionary" but backs up enthusiasm with specific examples.',
  },
  practitioner: {
    label: 'Practitioner', description: 'Real-world operator who values what works',
    icon: 'construct-outline', color: '#10B981',
    styleGuide: 'Brings real-world implementation stories. Corrects theoretical assumptions with practical realities. Uses "in my experience..."',
  },
  academic: {
    label: 'Academic', description: 'Research-focused, cites studies, hedges claims',
    icon: 'school-outline', color: '#6C63FF',
    styleGuide: 'References actual studies and data. Uses precise language. Qualifies statements with "the research suggests..." and flags methodological limitations.',
  },
  industry_insider: {
    label: 'Industry Insider', description: 'Behind-the-scenes knowledge, knows the real story',
    icon: 'business-outline', color: '#8B5CF6',
    styleGuide: 'Shares behind-the-scenes perspectives that aren\'t public knowledge. Knows "how things really work." Diplomatically drops insider context.',
  },
  newcomer: {
    label: 'Newcomer', description: 'Asks the obvious questions nobody else dares to',
    icon: 'person-add-outline', color: '#3B82F6',
    styleGuide: 'Asks obvious questions that expose assumptions. Represents the audience\'s confusion. Says "wait, I don\'t understand why..." a lot.',
  },
};

// ─── Ambient Mood Config ──────────────────────────────────────────────────────

export const AMBIENT_MOOD_CONFIG = {
  none:         { label: 'None',        description: 'Clean studio sound',       icon: 'volume-mute-outline' },
  studio:       { label: 'Studio',      description: 'Subtle room tone',          icon: 'mic-outline' },
  coffee_shop:  { label: 'Coffee Shop', description: 'Light background ambiance', icon: 'cafe-outline' },
} as const;

// ─── Audio Quality Options ─────────────────────────────────────────────────────

export const AUDIO_QUALITY_OPTIONS: {
  value:       AudioQuality;
  label:       string;
  description: string;
  icon:        string;
  creditBonus: number;
}[] = [
  { value: 'standard', label: 'Standard', description: 'Fast, smaller file',       icon: 'flash-outline',   creditBonus: 0  },
  { value: 'high',     label: 'High',     description: 'Richer voice quality',     icon: 'headset-outline', creditBonus: 5  },
  { value: 'lossless', label: 'Lossless', description: 'Studio WAV quality',       icon: 'diamond-outline', creditBonus: 10 },
];

// ─── Series Accent Colors ─────────────────────────────────────────────────────

export const SERIES_ACCENT_COLORS = [
  '#6C63FF', '#FF6584', '#43E97B', '#FFA726',
  '#29B6F6', '#EC4899', '#10B981', '#F59E0B',
  '#8B5CF6', '#EF4444', '#3B82F6', '#14B8A6',
];

// ─── Series Icons ─────────────────────────────────────────────────────────────

export const SERIES_ICONS = [
  'radio-outline', 'mic-outline', 'headset-outline', 'film-outline',
  'book-outline', 'newspaper-outline', 'globe-outline', 'flask-outline',
  'trending-up-outline', 'bulb-outline', 'rocket-outline', 'school-outline',
];

// ─── Guest Chemistry Matrix ────────────────────────────────────────────────────
// Defines natural tension/agreement between persona combinations.
// Higher tension → more natural debate. Lower tension → more collaborative.

export const GUEST_CHEMISTRY: Partial<Record<string, number>> = {
  'skeptic+enthusiast':       0.8,   // high natural tension
  'skeptic+academic':         0.4,   // moderate — both evidence-focused
  'skeptic+practitioner':     0.6,   // practitioner's experience challenges skeptic
  'enthusiast+newcomer':      0.2,   // both curious, low tension
  'academic+industry_insider': 0.7,  // theory vs practice tension
  'practitioner+newcomer':    0.3,   // practitioner educates newcomer
  'industry_insider+skeptic': 0.9,   // highest tension — insider secrets vs scrutiny
};