// src/components/offline/OfflineAcademicPaperViewer.tsx
// Part 23 — Full offline academic paper viewer.
//
// Renders the complete academic paper experience from cache — identical to the
// online academic-paper.tsx screen with section navigator, subsections,
// abstract box, stats row, PDF export and markdown share working fully offline.

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type { AcademicPaper, AcademicSection } from '../../types';
import type { CacheEntry } from '../../types/cache';

// ─── Section type config ──────────────────────────────────────────────────────

const SECTION_CONFIG: Record<string, { icon: string; color: string }> = {
  abstract:          { icon: 'document-text-outline',  color: '#6C63FF' },
  introduction:      { icon: 'book-outline',            color: '#29B6F6' },
  literature_review: { icon: 'library-outline',         color: '#43E97B' },
  methodology:       { icon: 'flask-outline',           color: '#FFA726' },
  findings:          { icon: 'bar-chart-outline',       color: '#FF6584' },
  conclusion:        { icon: 'flag-outline',            color: '#8B5CF6' },
  references:        { icon: 'link-outline',            color: '#AAAACC' },
};

function getSectionConfig(type: string) {
  return SECTION_CONFIG[type] ?? { icon: 'document-outline', color: COLORS.primary };
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ section, isActive }: { section: AcademicSection; isActive: boolean }) {
  const [expanded, setExpanded] = useState(isActive);
  const cfg = getSectionConfig(section.type);

  const isAbstract    = section.type === 'abstract';
  const isReferences  = section.type === 'references';

  return (
    <View style={{
      backgroundColor: isActive ? `${cfg.color}08` : COLORS.backgroundCard,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: isActive ? `${cfg.color}35` : COLORS.border,
      marginBottom: SPACING.sm,
      overflow: 'hidden',
    }}>
      {/* Section header */}
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${cfg.color}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1, borderColor: `${cfg.color}30` }}>
          <Ionicons name={cfg.icon as any} size={16} color={cfg.color} />
        </View>
        <Text style={{ flex: 1, color: COLORS.textPrimary, fontSize: FONTS.sizes.base, fontWeight: '700' }}>
          {section.title}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingHorizontal: SPACING.md, paddingBottom: SPACING.md }}>
          {isAbstract && (
            <View style={{ backgroundColor: `${cfg.color}08`, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: `${cfg.color}20`, marginBottom: SPACING.sm }}>
              <Text style={{ color: cfg.color, fontSize: FONTS.sizes.xs, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Abstract</Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22, fontStyle: 'italic' }}>{section.content}</Text>
            </View>
          )}

          {!isAbstract && !isReferences && section.content ? (
            <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22, marginBottom: section.subsections?.length ? SPACING.md : 0 }}>
              {section.content}
            </Text>
          ) : null}

          {isReferences && section.content ? (
            <View>
              {section.content.split('\n').filter(Boolean).map((ref, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 8, paddingLeft: 4 }}>
                  <Text style={{ color: cfg.color, fontSize: FONTS.sizes.xs, fontWeight: '700', flexShrink: 0, minWidth: 28 }}>[{i + 1}]</Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.xs, lineHeight: 18, flex: 1 }}>{ref}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {section.subsections?.map((sub, si) => (
            <View key={sub.id ?? si} style={{ marginBottom: SPACING.sm }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700', marginBottom: 6, paddingTop: si === 0 ? 0 : SPACING.sm }}>
                {sub.title}
              </Text>
              <Text style={{ color: COLORS.textSecondary, fontSize: FONTS.sizes.sm, lineHeight: 22 }}>
                {sub.content}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({ paper }: { paper: AcademicPaper }) {
  return (
    <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg }}>
      {[
        { icon: 'text-outline',     label: 'Words',    value: `~${paper.wordCount.toLocaleString()}`, color: COLORS.primary   },
        { icon: 'document-outline', label: 'Pages',    value: `~${paper.pageEstimate}`,               color: COLORS.info      },
        { icon: 'list-outline',     label: 'Sections', value: String(paper.sections.length),           color: COLORS.accent    },
        { icon: 'link-outline',     label: 'Citations',value: String(paper.citations.length),          color: COLORS.secondary },
      ].map(stat => (
        <View key={stat.label} style={{ flex: 1, backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.lg, padding: SPACING.sm, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Ionicons name={stat.icon as any} size={14} color={stat.color} />
          <Text style={{ color: stat.color, fontSize: FONTS.sizes.sm, fontWeight: '800', marginTop: 3 }}>{stat.value}</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 9, marginTop: 1 }}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Horizontal section navigator ────────────────────────────────────────────

function SectionNavigator({ paper, activeSectionId, onSelect }: {
  paper: AcademicPaper;
  activeSectionId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8, paddingVertical: SPACING.sm }}
      data={paper.sections}
      keyExtractor={s => s.id}
      renderItem={({ item: section }) => {
        const isActive = activeSectionId === section.id;
        const cfg      = getSectionConfig(section.type);
        return (
          <TouchableOpacity onPress={() => onSelect(section.id)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full,
              backgroundColor: isActive ? cfg.color : COLORS.backgroundCard,
              borderWidth: 1, borderColor: isActive ? cfg.color : COLORS.border,
            }}>
            <Ionicons name={cfg.icon as any} size={11} color={isActive ? '#FFF' : cfg.color} />
            <Text style={{ color: isActive ? '#FFF' : COLORS.textSecondary, fontSize: FONTS.sizes.xs, fontWeight: '600' }}>
              {section.title.length > 18 ? section.title.slice(0, 18) + '…' : section.title}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

// ─── Markdown builder ─────────────────────────────────────────────────────────

function buildMarkdown(paper: AcademicPaper): string {
  const lines = [`# ${paper.title}`, '', `**Keywords:** ${paper.keywords.join(', ')}`, `**Word Count:** ~${paper.wordCount} · ~${paper.pageEstimate} pages`, '', '---', ''];
  for (const section of paper.sections) {
    if (section.type === 'abstract') continue;
    if (section.type === 'references') continue;
    lines.push(`## ${section.title}`, '', section.content || '', '');
    for (const sub of section.subsections ?? []) {
      lines.push(`### ${sub.title}`, '', sub.content, '');
    }
  }
  const refSection = paper.sections.find(s => s.type === 'references');
  if (refSection) lines.push(`## ${refSection.title}`, '', refSection.content, '');
  return lines.join('\n');
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface OfflineAcademicPaperViewerProps {
  paper:     AcademicPaper;
  entry:     CacheEntry;
  onClose:   () => void;
  onExport:  () => void;
  exporting: boolean;
}

export function OfflineAcademicPaperViewer({ paper, entry, onClose, onExport, exporting }: OfflineAcademicPaperViewerProps) {
  const insets          = useSafeAreaInsets();
  const scrollRef       = useRef<ScrollView>(null);
  const sectionRefs     = useRef<Record<string, number>>({});
  const [activeSectionId, setActiveSectionId] = useState<string | null>(paper.sections[0]?.id ?? null);
  const [sharing, setSharing] = useState(false);

  const handleSelectSection = useCallback((id: string) => {
    setActiveSectionId(id);
    const y = sectionRefs.current[id];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: y - 80, animated: true });
    }
  }, []);

  const handleShareMarkdown = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const md = buildMarkdown(paper);
      await Share.share({ title: paper.title, message: md });
    } catch { /* user cancelled */ }
    finally { setSharing(false); }
  }, [paper, sharing]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity onPress={onClose}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border }}>
          <Ionicons name="arrow-back" size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${'#43E97B'}18`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ionicons name="school-outline" size={15} color="#43E97B" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.sm, fontWeight: '700' }} numberOfLines={1}>{paper.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View style={{ backgroundColor: `${COLORS.info}20`, borderRadius: RADIUS.sm, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ color: COLORS.info, fontSize: 9, fontWeight: '700' }}>OFFLINE</Text>
            </View>
            <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs }}>
              {paper.citationStyle.toUpperCase()} · ~{paper.wordCount.toLocaleString()} words
            </Text>
          </View>
        </View>

        {/* Share markdown */}
        <TouchableOpacity onPress={handleShareMarkdown} disabled={sharing}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${'#43E97B'}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${'#43E97B'}25` }}>
          {sharing ? <ActivityIndicator size="small" color="#43E97B" /> : <Ionicons name="share-outline" size={16} color="#43E97B" />}
        </TouchableOpacity>

        {/* PDF export */}
        <TouchableOpacity onPress={onExport} disabled={exporting}
          style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: `${COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
          {exporting ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="download-outline" size={16} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      {/* Section navigator */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
        <SectionNavigator paper={paper} activeSectionId={activeSectionId} onSelect={handleSelectSection} />
      </View>

      {/* Main content */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        {/* Title block */}
        <LinearGradient colors={['#1A1A35', '#12122A']} style={{ borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
          <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.lg, fontWeight: '800', textAlign: 'center', marginBottom: SPACING.sm, lineHeight: 28 }}>
            {paper.title}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.xs, textAlign: 'center', marginBottom: SPACING.md }}>
            {paper.citationStyle.toUpperCase()} · Generated {new Date(paper.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>

          {/* Keywords */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {paper.keywords.map((kw, i) => (
              <View key={i} style={{ backgroundColor: `${COLORS.primary}15`, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: `${COLORS.primary}25` }}>
                <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '600' }}>{kw}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* Stats */}
        <StatsRow paper={paper} />

        {/* Sections */}
        {paper.sections.map(section => (
          <View
            key={section.id}
            onLayout={e => { sectionRefs.current[section.id] = e.nativeEvent.layout.y; }}
          >
            <SectionCard
              section={section}
              isActive={activeSectionId === section.id}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}