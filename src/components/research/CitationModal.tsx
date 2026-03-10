// src/components/research/CitationModal.tsx
// Modal for generating and copying formatted citations (APA / MLA / Chicago).

import React, { useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity,
  ScrollView, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import { Citation, CitationFormat } from '../../types';
import { formatAllCitations, buildCitationBlock } from '../../services/citationGenerator';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';

interface Props {
  visible: boolean;
  citations: Citation[];
  onClose: () => void;
}

const FORMATS: { key: CitationFormat; label: string; desc: string }[] = [
  { key: 'apa', label: 'APA 7th', desc: 'Psychology, Social Sciences' },
  { key: 'mla', label: 'MLA 9th', desc: 'Humanities, Literature' },
  { key: 'chicago', label: 'Chicago 17th', desc: 'History, Arts' },
];

export function CitationModal({ visible, citations, onClose }: Props) {
  const [selectedFormat, setSelectedFormat] = useState<CitationFormat>('apa');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatted = formatAllCitations(citations, selectedFormat);

  const copyOne = async (id: string, text: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAll = async () => {
    const block = buildCitationBlock(citations, selectedFormat);
    await Clipboard.setStringAsync(block);
    Alert.alert('Copied!', `All ${citations.length} citations copied in ${selectedFormat.toUpperCase()} format.`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <BlurView intensity={20} style={{ flex: 1, backgroundColor: 'rgba(10,10,26,0.85)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: COLORS.backgroundCard,
          borderTopLeftRadius: 30, borderTopRightRadius: 30,
          maxHeight: '90%',
          borderTopWidth: 1, borderTopColor: COLORS.border,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            padding: SPACING.xl, paddingBottom: SPACING.md,
          }}>
            <View>
              <Text style={{ color: COLORS.textPrimary, fontSize: FONTS.sizes.xl, fontWeight: '800' }}>
                Citation Generator
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: FONTS.sizes.sm }}>
                {citations.length} sources
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Format selector */}
          <View style={{ flexDirection: 'row', paddingHorizontal: SPACING.xl, gap: SPACING.sm, marginBottom: SPACING.md }}>
            {FORMATS.map((f) => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setSelectedFormat(f.key)}
                style={{
                  flex: 1,
                  backgroundColor: selectedFormat === f.key ? `${COLORS.primary}20` : COLORS.backgroundElevated,
                  borderRadius: RADIUS.lg, padding: SPACING.sm,
                  borderWidth: 1.5,
                  borderColor: selectedFormat === f.key ? COLORS.primary : COLORS.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  color: selectedFormat === f.key ? COLORS.primary : COLORS.textSecondary,
                  fontSize: FONTS.sizes.sm, fontWeight: '700',
                }}>
                  {f.label}
                </Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2, textAlign: 'center' }}>
                  {f.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Copy all button */}
          <View style={{ paddingHorizontal: SPACING.xl, marginBottom: SPACING.md }}>
            <TouchableOpacity onPress={copyAll} activeOpacity={0.8}>
              <LinearGradient
                colors={COLORS.gradientPrimary}
                style={{
                  borderRadius: RADIUS.lg, paddingVertical: 12,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Ionicons name="copy-outline" size={18} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: '700', fontSize: FONTS.sizes.base }}>
                  Copy All Citations
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Citation list */}
          <ScrollView
            contentContainerStyle={{ padding: SPACING.xl, paddingTop: 0, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {formatted.map((fc, i) => (
              <View key={fc.id} style={{
                backgroundColor: COLORS.backgroundElevated,
                borderRadius: RADIUS.lg, padding: SPACING.md,
                marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 6,
                    backgroundColor: `${COLORS.primary}25`,
                    alignItems: 'center', justifyContent: 'center',
                    marginRight: SPACING.sm, flexShrink: 0,
                  }}>
                    <Text style={{ color: COLORS.primary, fontSize: 10, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={{
                    color: COLORS.textSecondary, fontSize: FONTS.sizes.xs,
                    lineHeight: 18, flex: 1,
                  }}>
                    {fc.formatted}
                  </Text>
                  <TouchableOpacity
                    onPress={() => copyOne(fc.id, fc.formatted)}
                    style={{
                      backgroundColor: copiedId === fc.id ? `${COLORS.success}20` : `${COLORS.primary}15`,
                      borderRadius: RADIUS.sm, padding: 8, marginLeft: SPACING.sm,
                    }}
                  >
                    <Ionicons
                      name={copiedId === fc.id ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={copiedId === fc.id ? COLORS.success : COLORS.primary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </Modal>
  );
}