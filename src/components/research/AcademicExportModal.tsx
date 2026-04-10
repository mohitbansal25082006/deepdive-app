// src/components/research/AcademicExportModal.tsx
// Part 41.4 — Extracted shared export modal.
//
// Previously the AcademicExportModal was defined inline inside
// app/(app)/academic-paper.tsx and not accessible to other screens.
// This file extracts it as a standalone shared component so that:
//   • workspace-shared-viewer.tsx (AcademicPaperViewer)
//   • OfflineAcademicPaperViewer.tsx
//   • academic-paper.tsx  (replaces its inline version)
// …all share identical export functionality.
//
// Features:
//   • Institution name input
//   • Author name input
//   • Font size picker (10–14 pt)
//   • Line spacing (single / double)
//   • Paper metadata chip strip
//   • Export PDF button  → academicPdfExport
//   • Export DOCX button → academicDocxExport
//   • Updates export_count in Supabase after each export
//     (skipped gracefully when paper has no DB id, e.g. pure offline)

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons }       from '@expo/vector-icons';

import { supabase }                   from '../../lib/supabase';
import { exportAcademicPaperAsPDF }   from '../../services/academicPdfExport';
import { exportAcademicPaperAsDocx }  from '../../services/academicDocxExport';
import type { PaperExportConfig }     from '../../types/paperEditor';
import { DEFAULT_EXPORT_CONFIG }      from '../../constants/paperEditor';
import { COLORS, FONTS, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import type { AcademicPaper }         from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AcademicExportModalProps {
  visible:  boolean;
  paper:    AcademicPaper | null;
  onClose:  () => void;
  /** When true the Supabase export_count update is skipped (offline mode) */
  skipDbUpdate?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AcademicExportModal({
  visible,
  paper,
  onClose,
  skipDbUpdate = false,
}: AcademicExportModalProps) {
  const [config,    setConfig]    = useState<PaperExportConfig>(DEFAULT_EXPORT_CONFIG);
  const [exporting, setExporting] = useState<'pdf' | 'docx' | null>(null);

  if (!paper) return null;

  const fontSizes = [10, 11, 12, 13, 14] as const;

  const bumpExportCount = async () => {
    if (skipDbUpdate || !paper.id) return;
    try {
      await supabase
        .from('academic_papers')
        .update({ export_count: (paper.exportCount ?? 0) + 1 })
        .eq('id', paper.id);
    } catch {
      // non-fatal
    }
  };

  const handleExportPDF = async () => {
    setExporting('pdf');
    try {
      const enriched: AcademicPaper = {
        ...paper,
        institution: config.institution || paper.institution,
      };
      await exportAcademicPaperAsPDF(enriched);
      await bumpExportCount();
    } catch (err) {
      Alert.alert('Export Error', 'Could not generate PDF. Please try again.');
      console.error('[AcademicExportModal] PDF error:', err);
    } finally {
      setExporting(null);
    }
  };

  const handleExportDocx = async () => {
    setExporting('docx');
    try {
      await exportAcademicPaperAsDocx(paper, config);
      await bumpExportCount();
    } catch (err) {
      Alert.alert('Export Error', 'Could not generate Word document. Please try again.');
      console.error('[AcademicExportModal] DOCX error:', err);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor:    COLORS.backgroundCard,
            borderTopLeftRadius:  24,
            borderTopRightRadius: 24,
            padding:     SPACING.lg,
            paddingBottom: SPACING.xl,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            gap: SPACING.md,
          }}
        >
          {/* Handle */}
          <View style={{
            width: 40, height: 4, borderRadius: 2,
            backgroundColor: COLORS.border,
            alignSelf: 'center',
            marginBottom: SPACING.sm,
          }} />

          <Text style={{
            color: COLORS.textPrimary,
            fontSize: FONTS.sizes.base,
            fontWeight: '800',
          }}>
            Export Academic Paper
          </Text>

          {/* ── Institution ── */}
          <View>
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
              fontWeight: '600', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 6,
            }}>
              Institution (optional)
            </Text>
            <View style={{
              backgroundColor: COLORS.backgroundElevated,
              borderRadius: RADIUS.lg,
              borderWidth: 1, borderColor: COLORS.border,
              paddingHorizontal: SPACING.md,
            }}>
              <TextInput
                value={config.institution ?? ''}
                onChangeText={(v: string) =>
                  setConfig(prev => ({ ...prev, institution: v }))
                }
                placeholder="University / Organization name"
                placeholderTextColor={COLORS.textMuted}
                style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.sm,
                  height: 44,
                }}
              />
            </View>
          </View>

          {/* ── Author Name ── */}
          <View>
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
              fontWeight: '600', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 6,
            }}>
              Author Name (optional)
            </Text>
            <View style={{
              backgroundColor: COLORS.backgroundElevated,
              borderRadius: RADIUS.lg,
              borderWidth: 1, borderColor: COLORS.border,
              paddingHorizontal: SPACING.md,
            }}>
              <TextInput
                value={config.authorName ?? ''}
                onChangeText={(v: string) =>
                  setConfig(prev => ({ ...prev, authorName: v }))
                }
                placeholder="Your full name"
                placeholderTextColor={COLORS.textMuted}
                style={{
                  color: COLORS.textPrimary,
                  fontSize: FONTS.sizes.sm,
                  height: 44,
                }}
              />
            </View>
          </View>

          {/* ── Font Size ── */}
          <View>
            <Text style={{
              color: COLORS.textMuted, fontSize: FONTS.sizes.xs,
              fontWeight: '600', textTransform: 'uppercase',
              letterSpacing: 1, marginBottom: 8,
            }}>
              Font Size
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {fontSizes.map(size => (
                <Pressable
                  key={size}
                  onPress={() =>
                    setConfig(prev => ({ ...prev, fontSizePt: size }))
                  }
                  style={{
                    flex: 1, paddingVertical: 10,
                    borderRadius: RADIUS.lg, alignItems: 'center',
                    backgroundColor:
                      config.fontSizePt === size
                        ? `${COLORS.primary}18`
                        : COLORS.backgroundElevated,
                    borderWidth: 1.5,
                    borderColor:
                      config.fontSizePt === size
                        ? COLORS.primary
                        : COLORS.border,
                  }}
                >
                  <Text style={{
                    color:
                      config.fontSizePt === size
                        ? COLORS.primary
                        : COLORS.textSecondary,
                    fontSize: FONTS.sizes.sm,
                    fontWeight: '700',
                  }}>
                    {size}pt
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── Line Spacing ── */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['single', 'double'] as const).map(spacing => (
              <Pressable
                key={spacing}
                onPress={() =>
                  setConfig(prev => ({ ...prev, lineSpacing: spacing }))
                }
                style={{
                  flex: 1, paddingVertical: 10,
                  borderRadius: RADIUS.lg, alignItems: 'center',
                  backgroundColor:
                    config.lineSpacing === spacing
                      ? `${COLORS.primary}18`
                      : COLORS.backgroundElevated,
                  borderWidth: 1.5,
                  borderColor:
                    config.lineSpacing === spacing
                      ? COLORS.primary
                      : COLORS.border,
                }}
              >
                <Text style={{
                  color:
                    config.lineSpacing === spacing
                      ? COLORS.primary
                      : COLORS.textSecondary,
                  fontSize: FONTS.sizes.sm,
                  fontWeight: '700',
                }}>
                  {spacing === 'single' ? 'Single Spaced' : 'Double Spaced'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Paper metadata chips ── */}
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap', gap: 6,
            backgroundColor: `${COLORS.primary}08`,
            borderRadius: RADIUS.lg, padding: SPACING.sm,
            borderWidth: 1, borderColor: `${COLORS.primary}18`,
          }}>
            {[
              `${paper.citationStyle.toUpperCase()} format`,
              `~${paper.wordCount.toLocaleString()} words`,
              `~${paper.pageEstimate} pages`,
              `${paper.sections.length} sections`,
              `${paper.citations.length} citations`,
            ].map(tag => (
              <View
                key={tag}
                style={{
                  backgroundColor: `${COLORS.primary}12`,
                  borderRadius: RADIUS.full,
                  paddingHorizontal: 8, paddingVertical: 3,
                  borderWidth: 1, borderColor: `${COLORS.primary}25`,
                }}
              >
                <Text style={{
                  color: COLORS.primary,
                  fontSize: 10, fontWeight: '600',
                }}>
                  {tag}
                </Text>
              </View>
            ))}
          </View>

          {/* ── Export buttons ── */}
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
            {/* PDF */}
            <TouchableOpacity
              onPress={handleExportPDF}
              disabled={!!exporting}
              activeOpacity={0.85}
              style={{ flex: 1, opacity: exporting ? 0.6 : 1 }}
            >
              <LinearGradient
                colors={[COLORS.primary, '#8B5CF6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  borderRadius: RADIUS.full, paddingVertical: 14,
                  flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 7,
                  ...SHADOWS.medium,
                }}
              >
                {exporting === 'pdf'
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="document-outline" size={17} color="#FFF" />
                }
                <Text style={{
                  color: '#FFF',
                  fontSize: FONTS.sizes.sm, fontWeight: '800',
                }}>
                  {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* DOCX */}
            <TouchableOpacity
              onPress={handleExportDocx}
              disabled={!!exporting}
              activeOpacity={0.85}
              style={{ flex: 1, opacity: exporting ? 0.6 : 1 }}
            >
              <LinearGradient
                colors={['#2B5BE0', '#1A3AB8']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{
                  borderRadius: RADIUS.full, paddingVertical: 14,
                  flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 7,
                  ...SHADOWS.medium,
                }}
              >
                {exporting === 'docx'
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Ionicons name="logo-windows" size={17} color="#FFF" />
                }
                <Text style={{
                  color: '#FFF',
                  fontSize: FONTS.sizes.sm, fontWeight: '800',
                }}>
                  {exporting === 'docx' ? 'Generating…' : 'Export DOCX'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <Text style={{
            color: COLORS.textMuted,
            fontSize: 10, textAlign: 'center', lineHeight: 16,
          }}>
            PDF: Publication-quality layout with running head.{'\n'}
            DOCX: Word document, double-spaced, hanging-indent references.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}