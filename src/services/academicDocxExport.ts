// src/services/academicDocxExport.ts
// Part 38 — Export academic paper as .docx using the `docx` npm package.
//
// Fixes applied vs original:
//   1. HeadingLevel used as a value only (not as a type) — removed the
//      Record<HeadingLevel, number> type which caused TS2749.
//   2. expo-file-system imports changed from the default package to
//      'expo-file-system/legacy' which exports documentDirectory +
//      EncodingType + writeAsStringAsync (the legacy API that works with
//      Expo SDK 54 without the new FileSystem.StorageAccessFramework).
//
// Package: npm install docx --legacy-peer-deps
// ─────────────────────────────────────────────────────────────────────────────

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageNumber,
  Footer,
  Header,
  TabStopPosition,
  TabStopType,
  convertInchesToTwip,
  LineRuleType,
} from 'docx';

// Fix: use the legacy export that has documentDirectory + EncodingType
import {
  documentDirectory,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';

import * as Sharing from 'expo-sharing';

import type { AcademicPaper, AcademicSection } from '../types';
import type { PaperExportConfig }              from '../types/paperEditor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 60);
}

function splitIntoParagraphs(text: string): string[] {
  return (text ?? '')
    .split(/\n{2,}|\n/)
    .map(p => p.trim())
    .filter(Boolean);
}

/** 1440 twips per inch. Double spacing = 480 twips. */
const DOUBLE_SPACE  = 480;
const SINGLE_SPACE  = 240;
const INDENT_TWIPS  = convertInchesToTwip(0.5);
const HANG_TWIPS    = convertInchesToTwip(0.5);

function ptToHalfPt(pt: number): number { return pt * 2; }

// ─── Paragraph helpers ────────────────────────────────────────────────────────

function bodyParagraph(text: string, fontSizePt: number, lineSpacing: number): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Times New Roman', size: ptToHalfPt(fontSizePt) })],
    spacing: { line: lineSpacing, lineRule: LineRuleType.AUTO, after: 0 },
    indent: { firstLine: INDENT_TWIPS },
  });
}

// Fix: use HeadingLevel enum values directly rather than as a type key
function headingParagraph(
  text:        string,
  level:       typeof HeadingLevel[keyof typeof HeadingLevel],
  fontSizePt:  number,
): Paragraph {
  let fontSize: number;
  if (level === HeadingLevel.HEADING_1) {
    fontSize = ptToHalfPt(fontSizePt + 4);
  } else if (level === HeadingLevel.HEADING_2) {
    fontSize = ptToHalfPt(fontSizePt + 2);
  } else {
    fontSize = ptToHalfPt(fontSizePt + 1);
  }

  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, font: 'Times New Roman', size: fontSize })],
    spacing: { before: 240, after: 120, lineRule: LineRuleType.AUTO },
    alignment: AlignmentType.LEFT,
  });
}

function referenceParagraph(text: string, fontSizePt: number): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, font: 'Times New Roman', size: ptToHalfPt(fontSizePt) })],
    spacing: { line: SINGLE_SPACE, lineRule: LineRuleType.AUTO, after: 120 },
    indent: { left: HANG_TWIPS, hanging: HANG_TWIPS },
  });
}

function spacerParagraph(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '' })], spacing: { after: 0 } });
}

// ─── Section renderer ─────────────────────────────────────────────────────────

function renderSection(
  section:     AcademicSection,
  fontSizePt:  number,
  lineSpacing: number,
): Paragraph[] {
  const paras: Paragraph[] = [];

  paras.push(headingParagraph(section.title, HeadingLevel.HEADING_1, fontSizePt));

  if (section.type === 'abstract') {
    const abstractParas = splitIntoParagraphs(section.content);
    abstractParas.forEach(p => paras.push(bodyParagraph(p, fontSizePt, lineSpacing)));
    paras.push(spacerParagraph());
    return paras;
  }

  if (section.type === 'references') {
    const lines = (section.content ?? '')
      .split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach(line => paras.push(referenceParagraph(line, fontSizePt)));
    paras.push(spacerParagraph());
    return paras;
  }

  const contentParas = splitIntoParagraphs(section.content);
  contentParas.forEach(p => paras.push(bodyParagraph(p, fontSizePt, lineSpacing)));

  for (const sub of section.subsections ?? []) {
    paras.push(spacerParagraph());
    paras.push(headingParagraph(sub.title, HeadingLevel.HEADING_2, fontSizePt));
    const subParas = splitIntoParagraphs(sub.content);
    subParas.forEach(p => paras.push(bodyParagraph(p, fontSizePt, lineSpacing)));
  }

  paras.push(spacerParagraph());
  return paras;
}

// ─── Title page ───────────────────────────────────────────────────────────────

function buildTitlePage(
  paper:      AcademicPaper,
  config:     PaperExportConfig,
  fontSizePt: number,
): Paragraph[] {
  const paras: Paragraph[] = [];
  const centred = AlignmentType.CENTER;

  // Running head
  paras.push(new Paragraph({
    children: [
      new TextRun({ text: 'Running head: ', font: 'Times New Roman', size: ptToHalfPt(fontSizePt), allCaps: true }),
      new TextRun({ text: paper.runningHead.slice(0, 50), font: 'Times New Roman', size: ptToHalfPt(fontSizePt), allCaps: true }),
    ],
    alignment: AlignmentType.LEFT,
    spacing: { after: 0 },
  }));

  // Spacers to push title to center of page
  for (let i = 0; i < 6; i++) paras.push(spacerParagraph());

  // Title
  paras.push(new Paragraph({
    children: [new TextRun({ text: paper.title, bold: true, font: 'Times New Roman', size: ptToHalfPt(fontSizePt + 2) })],
    alignment: centred,
    spacing: { after: 240 },
  }));

  // Author
  if (config.authorName) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: config.authorName, font: 'Times New Roman', size: ptToHalfPt(fontSizePt) })],
      alignment: centred,
      spacing: { after: 120 },
    }));
  }

  // Institution
  const institution = config.institution || paper.institution;
  if (institution) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: institution, font: 'Times New Roman', size: ptToHalfPt(fontSizePt) })],
      alignment: centred,
      spacing: { after: 120 },
    }));
  }

  // Stats
  const statsText = `Words: ~${paper.wordCount.toLocaleString()} · Pages: ~${paper.pageEstimate} · Sections: ${paper.sections.length} · Citations: ${paper.citations.length}`;
  paras.push(new Paragraph({
    children: [new TextRun({ text: statsText, font: 'Times New Roman', size: ptToHalfPt(fontSizePt - 1), italics: true, color: '888888' })],
    alignment: centred,
    spacing: { after: 120 },
  }));

  // Citation style
  paras.push(new Paragraph({
    children: [new TextRun({ text: `Citation Style: ${paper.citationStyle.toUpperCase()}`, font: 'Times New Roman', size: ptToHalfPt(fontSizePt - 1), color: '888888' })],
    alignment: centred,
    spacing: { after: 0 },
  }));

  // Keywords
  if (paper.keywords?.length) {
    for (let i = 0; i < 4; i++) paras.push(spacerParagraph());
    paras.push(new Paragraph({
      children: [
        new TextRun({ text: 'Keywords: ', bold: true, italics: true, font: 'Times New Roman', size: ptToHalfPt(fontSizePt) }),
        new TextRun({ text: paper.keywords.join(', '), italics: true, font: 'Times New Roman', size: ptToHalfPt(fontSizePt) }),
      ],
      alignment: centred,
      spacing: { after: 0 },
    }));
  }

  // Page break
  paras.push(new Paragraph({ pageBreakBefore: true, children: [] }));

  return paras;
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function exportAcademicPaperAsDocx(
  paper:   AcademicPaper,
  config?: PaperExportConfig,
): Promise<void> {
  const cfg         = config ?? {};
  const fontSizePt  = cfg.fontSizePt  ?? 12;
  const lineSpacing = (cfg.lineSpacing ?? 'double') === 'double' ? DOUBLE_SPACE : SINGLE_SPACE;
  const showPages   = cfg.pageNumbers !== false;
  const showCover   = cfg.coverPage   !== false;

  // ── Build content ─────────────────────────────────────────────────────────
  const allChildren: Paragraph[] = [];

  if (showCover) {
    allChildren.push(...buildTitlePage(paper, cfg, fontSizePt));
  }

  // Abstract first
  const abstractSection = paper.sections.find(s => s.type === 'abstract');
  if (abstractSection) {
    allChildren.push(...renderSection(abstractSection, fontSizePt, lineSpacing));
  }

  // Remaining sections
  for (const section of paper.sections) {
    if (section.type === 'abstract') continue;
    allChildren.push(...renderSection(section, fontSizePt, lineSpacing));
  }

  // ── Header ────────────────────────────────────────────────────────────────
  const headerParagraph = new Paragraph({
    children: [
      new TextRun({
        text: paper.runningHead.toUpperCase().slice(0, 50),
        font: 'Times New Roman',
        size: ptToHalfPt(fontSizePt),
        allCaps: true,
      }),
      new TextRun({ text: '\t', font: 'Times New Roman', size: ptToHalfPt(fontSizePt) }),
      ...(showPages
        ? [new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: ptToHalfPt(fontSizePt) })]
        : []
      ),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    spacing: { after: 0 },
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerParagraph = new Paragraph({
    children: [
      new TextRun({
        text: `Generated by DeepDive AI · ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`,
        font: 'Times New Roman',
        size: ptToHalfPt(fontSizePt - 2),
        color: '888888',
        italics: true,
      }),
    ],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0 },
  });

  // ── Assemble document ─────────────────────────────────────────────────────
  const doc = new Document({
    creator:     'DeepDive AI',
    title:       paper.title,
    description: paper.abstract?.slice(0, 200),
    styles: {
      default: {
        document: {
          run: {
            font: 'Times New Roman',
            size: ptToHalfPt(fontSizePt),
          },
          paragraph: {
            spacing: {
              line:     lineSpacing,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        headers: {
          default: new Header({ children: [headerParagraph] }),
        },
        footers: {
          default: new Footer({ children: [footerParagraph] }),
        },
        properties: {
          page: {
            margin: {
              top:    convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left:   convertInchesToTwip(1.25),
              right:  convertInchesToTwip(1.25),
            },
          },
        },
        children: allChildren,
      },
    ],
  });

  // ── Write file + share ────────────────────────────────────────────────────
  const base64   = await Packer.toBase64String(doc);
  const fileName = `${safeFileName(paper.title)}_paper.docx`;
  const fileUri  = `${documentDirectory}${fileName}`;

  await writeAsStringAsync(fileUri, base64, {
    encoding: EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType:    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      dialogTitle: `Share: ${paper.title}`,
      UTI:         'org.openxmlformats.wordprocessingml.document',
    });
  }
}