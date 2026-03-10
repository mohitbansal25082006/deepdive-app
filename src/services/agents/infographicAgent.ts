// src/services/agents/infographicAgent.ts
// Converts research statistics and trends into chart-ready data structures.

import { chatCompletionJSON } from '../openaiClient';
import {
  ResearchReport,
  InfographicData,
  InfographicChart,
  InfographicStat,
} from '../../types';

interface RawInfographicOutput {
  charts: Array<{
    id: string;
    type: 'bar' | 'line' | 'pie' | 'stat' | 'timeline';
    title: string;
    subtitle?: string;
    labels?: string[];
    datasets?: Array<{ label: string; data: number[]; color?: string }>;
    unit?: string;
    insight?: string;
  }>;
  stats: Array<{
    id: string;
    label: string;
    value: string;
    change?: string;
    changeType?: 'positive' | 'negative' | 'neutral';
    icon?: string;
    color?: string;
  }>;
}

export async function runInfographicAgent(
  report: ResearchReport
): Promise<InfographicData> {
  const systemPrompt = `You are a data visualization specialist. Convert research findings into structured chart data.

Chart type selection rules:
- Use "line" for trends over time (2+ time points)
- Use "bar" for comparing multiple entities/categories
- Use "pie" ONLY if you have 3–6 categories with percentage breakdown
- Use "stat" for a single large number with context
- Use "timeline" for sequential events

All numeric values must be actual numbers (not strings). Labels must be short (max 20 chars). Maximum 6 data points per chart for readability.`;

  const statisticsContext = report.statistics.slice(0, 15).map(
    s => `${s.value}: ${s.context} (${s.source})`
  ).join('\n');

  const findingsContext = report.keyFindings.slice(0, 5).join('\n');

  const sectionsContext = report.sections.slice(0, 3).map(
    s => `${s.title}: ${s.bullets?.slice(0, 2).join(', ') ?? ''}`
  ).join('\n');

  const userPrompt = `Generate infographic data for this research report: "${report.title}"

KEY STATISTICS:
${statisticsContext || 'No specific statistics extracted'}

KEY FINDINGS:
${findingsContext}

SECTION THEMES:
${sectionsContext}

Create 2–4 charts and 4–6 stat cards. Return ONLY valid JSON:
{
  "charts": [
    {
      "id": "chart1",
      "type": "bar",
      "title": "Market Growth by Year",
      "subtitle": "Revenue in USD Billions",
      "labels": ["2021", "2022", "2023", "2024"],
      "datasets": [
        { "label": "Revenue", "data": [45, 67, 89, 142], "color": "#6C63FF" }
      ],
      "unit": "B USD",
      "insight": "Revenue grew 215% over 4 years."
    }
  ],
  "stats": [
    {
      "id": "stat1",
      "label": "Global Market Size",
      "value": "$142B",
      "change": "+23%",
      "changeType": "positive",
      "icon": "trending-up",
      "color": "#43E97B"
    }
  ]
}

IMPORTANT: All dataset data arrays must contain only numbers. Labels must be concise. Generate meaningful, data-backed visualizations specific to this topic.`;

  const raw = await chatCompletionJSON<RawInfographicOutput>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.3, maxTokens: 2000 }
  );

  const charts: InfographicChart[] = (raw.charts ?? []).map(c => ({
    id: c.id,
    type: c.type,
    title: c.title,
    subtitle: c.subtitle,
    labels: c.labels,
    datasets: c.datasets?.map(d => ({
      label: d.label,
      data: d.data.map(v => (typeof v === 'number' ? v : parseFloat(String(v)) || 0)),
      color: d.color,
    })),
    unit: c.unit,
    insight: c.insight,
  })).filter(c => c.type && c.title);

  const stats: InfographicStat[] = (raw.stats ?? []).map(s => ({
    id: s.id,
    label: s.label,
    value: s.value,
    change: s.change,
    changeType: s.changeType ?? 'neutral',
    icon: s.icon ?? 'stats-chart',
    color: s.color ?? '#6C63FF',
  }));

  return {
    charts,
    stats,
    generatedAt: new Date().toISOString(),
  };
}