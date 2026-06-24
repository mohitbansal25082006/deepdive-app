// src/components/research/RichText.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Editorial rich-text renderer — FULL THEME COMPATIBILITY
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { View, Text, Platform, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONTS, SPACING, RADIUS } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const MD_RE = /(\*\*.+?\*\*|__.+?__|`[^`]+?`|\*[^*\n]+?\*|_[^_\n]+?_)/g;
const STAT_RE = /(\$\s?\d[\d,]*(?:\.\d+)?\s?(?:billion|million|trillion|bn|mn|k)?|\d[\d,]*(?:\.\d+)?\s?%|\d[\d,]*(?:\.\d+)?\s?(?:billion|million|trillion)\b|\d+(?:\.\d+)?x\b)/gi;

interface Seg { text: string; bold?: boolean; italic?: boolean; code?: boolean; stat?: boolean; }

function parseInline(text: string, highlightStats: boolean): Seg[] {
  const out: Seg[] = [];
  const parts = text.split(MD_RE);

  for (const part of parts) {
    if (!part) continue;

    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      out.push({ text: part.slice(2, -2), bold: true });
    } else if (part.startsWith('`') && part.endsWith('`')) {
      out.push({ text: part.slice(1, -1), code: true });
    } else if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      out.push({ text: part.slice(1, -1), italic: true });
    } else if (highlightStats) {
      const sub = part.split(STAT_RE);
      for (let i = 0; i < sub.length; i++) {
        const s = sub[i];
        if (!s) continue;
        out.push(i % 2 === 1 ? { text: s, stat: true } : { text: s });
      }
    } else {
      out.push({ text: part });
    }
  }
  return out;
}

function spanStyle(seg: Seg, accent: string, isLight: boolean): TextStyle {
  const s: TextStyle = {};
  if (seg.bold) { s.fontWeight = '800'; s.color = COLORS.textPrimary; }
  if (seg.italic) s.fontStyle = 'italic';
  if (seg.stat) { s.color = accent; s.fontWeight = '800'; }
  if (seg.code) {
    s.fontFamily = MONO;
    s.color = accent;
    s.backgroundColor = isLight ? `${accent}15` : `${accent}1F`;
    s.fontSize = (FONTS.sizes.sm);
    s.paddingHorizontal = 4;
    s.paddingVertical = 1;
    s.borderRadius = 4;
  }
  return s;
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: number; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

function parseBlocks(content: string): Block[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => { if (para.length) { blocks.push({ kind: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { blocks.push({ kind: 'list', ordered: list.ordered, items: list.items }); list = null; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flushPara(); flushList(); blocks.push({ kind: 'h', level: h[1].length, text: h[2] }); continue; }

    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushPara(); flushList(); blocks.push({ kind: 'quote', text: q[1] }); continue; }

    const ul = line.match(/^[-*•]\s+(.*)$/);
    if (ul) { flushPara(); if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(ul[1]); continue; }

    const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ol) { flushPara(); if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(ol[2]); continue; }

    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

function renderSpans(segs: Seg[], accent: string, keyBase: string, isLight: boolean) {
  return segs.map((seg, i) => (
    <Text key={`${keyBase}-${i}`} style={spanStyle(seg, accent, isLight)}>{seg.text}</Text>
  ));
}

interface RichTextProps {
  content: string;
  inline?: boolean;
  size?: number;
  color?: string;
  lineHeight?: number;
  weight?: TextStyle['fontWeight'];
  accent?: string;
  highlightStats?: boolean;
  lead?: boolean;
  dropCap?: boolean;
  paragraphSpacing?: number;
  style?: ViewStyle;
}

export function RichText({
  content,
  inline = false,
  size = FONTS.sizes.base,
  color = COLORS.textSecondary,
  lineHeight,
  weight = '400',
  accent = COLORS.primary,
  highlightStats = false,
  lead = false,
  dropCap = false,
  paragraphSpacing = SPACING.md,
  style,
}: RichTextProps) {
  const { isLight } = useTheme();
  const text = (content ?? '').trim();

  const inlineSegs = useMemo(() => parseInline(text, highlightStats), [text, highlightStats]);
  const blocks = useMemo(() => parseBlocks(text), [text]);

  // Theme-aware quote background
  const quoteBg = isLight ? `${accent}08` : `${accent}0F`;
  const listNumberBg = isLight ? `${accent}15` : `${accent}1F`;

  if (inline) {
    return (
      <Text style={[{ color, fontSize: size, lineHeight: lineHeight ?? size * 1.5, fontWeight: weight }, style as TextStyle]}>
        {renderSpans(inlineSegs, accent, 'inl', isLight)}
      </Text>
    );
  }

  const lh = lineHeight ?? size * 1.62;
  let firstParaSeen = false;

  return (
    <View style={style}>
      {blocks.map((block, bi) => {
        if (block.kind === 'h') {
          const hSize = block.level === 1 ? size + 5 : block.level === 2 ? size + 2 : size + 1;
          return (
            <View key={bi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: bi === 0 ? 0 : SPACING.md, marginBottom: SPACING.sm }}>
              <LinearGradient colors={[accent, `${accent}66`]} style={{ width: 4, height: hSize + 2, borderRadius: 2 }} />
              <Text style={{ color: COLORS.textPrimary, fontSize: hSize, fontWeight: '900', letterSpacing: -0.3, flex: 1 }}>
                {block.text}
              </Text>
            </View>
          );
        }

        if (block.kind === 'quote') {
          const segs = parseInline(block.text, highlightStats);
          return (
            <View key={bi} style={{ flexDirection: 'row', marginBottom: paragraphSpacing, borderRadius: RADIUS.md, overflow: 'hidden' }}>
              <LinearGradient colors={[accent, `${accent}55`]} style={{ width: 3 }} />
              <View style={{ flex: 1, backgroundColor: quoteBg, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md }}>
                <Text style={{ color: COLORS.textSecondary, fontSize: size, lineHeight: lh, fontStyle: 'italic' }}>
                  {renderSpans(segs, accent, `q${bi}`, isLight)}
                </Text>
              </View>
            </View>
          );
        }

        if (block.kind === 'list') {
          return (
            <View key={bi} style={{ marginBottom: paragraphSpacing, gap: 9 }}>
              {block.items.map((item, ii) => {
                const segs = parseInline(item, highlightStats);
                return (
                  <View key={ii} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    {block.ordered ? (
                      <View style={{
                        minWidth: 22, height: 22, borderRadius: 7, paddingHorizontal: 5,
                        backgroundColor: listNumberBg,
                        alignItems: 'center', justifyContent: 'center',
                        marginRight: 10, marginTop: 1, flexShrink: 0,
                      }}>
                        <Text style={{ color: accent, fontSize: 11, fontWeight: '900' }}>{ii + 1}</Text>
                      </View>
                    ) : (
                      <LinearGradient colors={[accent, `${accent}88`]} style={{ width: 7, height: 7, borderRadius: 4, marginTop: lh * 0.32, marginRight: 11, flexShrink: 0 }} />
                    )}
                    <Text style={{ color, fontSize: size, lineHeight: lh, flex: 1 }}>
                      {renderSpans(segs, accent, `li${bi}-${ii}`, isLight)}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }

        const isFirst = !firstParaSeen;
        firstParaSeen = true;
        const segs = parseInline(block.text, highlightStats);
        const useLead = isFirst && lead;
        const pColor = useLead ? COLORS.textSecondary : color;
        const pSize = useLead ? size + 1 : size;
        const pLh = useLead ? (size + 1) * 1.6 : lh;
        const pWeight: TextStyle['fontWeight'] = useLead ? '500' : weight;

        const children: React.ReactNode[] = [];
        segs.forEach((seg, si) => {
          if (si === 0 && isFirst && dropCap && seg.text.length > 0 && !seg.code) {
            const first = seg.text[0];
            const rest = seg.text.slice(1);
            children.push(
              <Text key={`dc-${si}`} style={{ color: accent, fontSize: pSize * 2.3, fontWeight: '900', lineHeight: pSize * 2.3 }}>{first}</Text>
            );
            if (rest) children.push(<Text key={`dcr-${si}`} style={spanStyle(seg, accent, isLight)}>{rest}</Text>);
          } else {
            children.push(<Text key={`s-${si}`} style={spanStyle(seg, accent, isLight)}>{seg.text}</Text>);
          }
        });

        return (
          <Text
            key={bi}
            style={{ color: pColor, fontSize: pSize, lineHeight: pLh, fontWeight: pWeight, marginBottom: bi === blocks.length - 1 ? 0 : paragraphSpacing }}
          >
            {children}
          </Text>
        );
      })}
    </View>
  );
}