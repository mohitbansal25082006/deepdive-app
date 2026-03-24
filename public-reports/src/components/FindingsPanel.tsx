// src/components/FindingsPanel.tsx
// Public-Reports — Key findings, future predictions, and top statistics

import type { PublicReport } from '@/types/report';

interface FindingsPanelProps {
  report: PublicReport;
}

export default function FindingsPanel({ report }: FindingsPanelProps) {
  const hasFindings    = report.keyFindings.length > 0;
  const hasPredictions = report.futurePredictions.length > 0;
  const hasStatistics  = report.statistics.length > 0;

  if (!hasFindings && !hasPredictions && !hasStatistics) return null;

  return (
    <div className="space-y-6">
      {/* ── Key Findings ── */}
      {hasFindings && (
        <section>
          <SectionLabel
            icon={<BulbIcon />}
            label="Key Findings"
            color="#6C63FF"
          />
          <div className="space-y-2">
            {report.keyFindings.map((finding, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl animate-fade-in-up"
                style={{
                  background:      'var(--bg-card)',
                  border:          '1px solid var(--border)',
                  borderLeftWidth: '3px',
                  borderLeftColor: '#6C63FF',
                  animationDelay:  `${i * 50}ms`,
                }}
              >
                {/* Number bubble */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-extrabold"
                  style={{
                    background: 'rgba(108,99,255,0.15)',
                    color:      '#6C63FF',
                  }}
                >
                  {i + 1}
                </div>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {finding}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Future Predictions ── */}
      {hasPredictions && (
        <section>
          <SectionLabel
            icon={<TelescopeIcon />}
            label="Future Predictions"
            color="#F59E0B"
          />
          <div className="space-y-2">
            {report.futurePredictions.map((prediction, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl animate-fade-in-up"
                style={{
                  background:     'rgba(245,158,11,0.06)',
                  border:         '1px solid rgba(245,158,11,0.2)',
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <span className="text-base flex-shrink-0">🔮</span>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {prediction}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Key Statistics ── */}
      {hasStatistics && (
        <section>
          <SectionLabel
            icon={<ChartIcon />}
            label="Key Statistics"
            color="#10B981"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.statistics.slice(0, 10).map((stat, i) => (
              <div
                key={i}
                className="p-4 rounded-xl animate-fade-in-up"
                style={{
                  background:     'var(--bg-card)',
                  border:         '1px solid var(--border)',
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <p
                  className="font-extrabold text-xl leading-none mb-1"
                  style={{ color: '#10B981' }}
                >
                  {stat.value}
                </p>
                <p
                  className="text-sm leading-snug mb-2"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {stat.context}
                </p>
                <p
                  className="text-xs truncate"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Source: {stat.source}
                </p>
              </div>
            ))}
          </div>

          {report.statistics.length > 10 && (
            <p
              className="text-xs mt-2 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              + {report.statistics.length - 10} more statistics in the full report
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/* ── SectionLabel ─────────────────────────────────────────────────────────── */

interface SectionLabelProps {
  icon:  React.ReactNode;
  label: string;
  color: string;
}

function SectionLabel({ icon, label, color }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div
        className="w-6 h-6 rounded-lg flex items-center justify-center"
        style={{ background: `${color}20`, color }}
      >
        {icon}
      </div>
      <h3
        className="text-xs font-extrabold uppercase tracking-widest"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </h3>
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function BulbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18"/>
      <line x1="10" y1="22" x2="14" y2="22"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
  );
}

function TelescopeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="17" cy="7" r="3"/>
      <path d="M6 6 2 22"/>
      <path d="m6 6 12-4"/>
      <path d="M10 10 6 22"/>
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
      <line x1="2"  y1="20" x2="22" y2="20"/>
    </svg>
  );
}