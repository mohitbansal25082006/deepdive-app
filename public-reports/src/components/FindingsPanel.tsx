// src/components/FindingsPanel.tsx
// Public-Reports — Part 55.9 Fully Themed Key Findings, Future Predictions, and Top Statistics

import type { PublicReport } from '@/types/report';

interface FindingsPanelProps {
  report: PublicReport;
}

export default function FindingsPanel({ report }: FindingsPanelProps) {
  const hasFindings = report.keyFindings.length > 0;
  const hasPredictions = report.futurePredictions.length > 0;
  const hasStatistics = report.statistics.length > 0;

  if (!hasFindings && !hasPredictions && !hasStatistics) return null;

  return (
    <div className="space-y-8">
      {/* ── Key Findings ── */}
      {hasFindings && (
        <section className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
          <SectionLabel
            icon={<BulbIcon />}
            label="Key Findings"
            color="var(--theme-primary)"
          />
          <div className="space-y-2.5">
            {report.keyFindings.map((finding, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-[1.01]"
                style={{
                  background: 'var(--theme-background-card)',
                  border: '1px solid var(--theme-border)',
                  borderLeftWidth: '4px',
                  borderLeftColor: 'var(--theme-primary)',
                  animationDelay: `${i * 50}ms`,
                }}
              >
                {/* Number bubble */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-extrabold transition-all duration-300"
                  style={{
                    background: 'var(--theme-primary)',
                    color: '#FFFFFF',
                    boxShadow: '0 2px 8px var(--theme-primary)',
                  }}
                >
                  {i + 1}
                </div>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--theme-text-primary)' }}
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
        <section className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <SectionLabel
            icon={<TelescopeIcon />}
            label="Future Predictions"
            color="var(--theme-warning)"
          />
          <div className="space-y-2.5">
            {report.futurePredictions.map((prediction, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-[1.01]"
                style={{
                  background: 'var(--theme-warning)',
                  border: '2px solid var(--theme-warning)',
                  animationDelay: `${i * 50}ms`,
                }}
              >
                <span className="text-base flex-shrink-0">🔮</span>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: '#FFFFFF' }}
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
        <section className="animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <SectionLabel
            icon={<ChartIcon />}
            label="Key Statistics"
            color="var(--theme-success)"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.statistics.slice(0, 10).map((stat, i) => (
              <div
                key={i}
                className="p-4 rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                style={{
                  background: 'var(--theme-background-card)',
                  border: '1px solid var(--theme-border)',
                  borderTopWidth: '3px',
                  borderTopColor: 'var(--theme-success)',
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <p
                  className="font-extrabold text-2xl leading-none mb-1.5"
                  style={{ color: 'var(--theme-success)' }}
                >
                  {stat.value}
                </p>
                <p
                  className="text-sm leading-snug mb-2"
                  style={{ color: 'var(--theme-text-primary)' }}
                >
                  {stat.context}
                </p>
                <p
                  className="text-xs truncate flex items-center gap-1"
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  Source: {stat.source}
                </p>
              </div>
            ))}
          </div>

          {report.statistics.length > 10 && (
            <p
              className="text-xs mt-3 text-center"
              style={{ color: 'var(--theme-text-muted)' }}
            >
              + {report.statistics.length - 10} more statistics in the full report
            </p>
          )}
        </section>
      )}

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ── SectionLabel ─────────────────────────────────────────────────────────── */

interface SectionLabelProps {
  icon: React.ReactNode;
  label: string;
  color: string;
}

function SectionLabel({ icon, label, color }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-110"
        style={{ 
          background: color,
          color: '#FFFFFF',
          boxShadow: `0 2px 12px ${color}`,
        }}
      >
        {icon}
      </div>
      <h3
        className="text-xs font-extrabold uppercase tracking-widest"
        style={{ color: 'var(--theme-text-muted)' }}
      >
        {label}
      </h3>
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────────── */

function BulbIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="18" x2="15" y2="18"/>
      <line x1="10" y1="22" x2="14" y2="22"/>
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/>
    </svg>
  );
}

function TelescopeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="17" cy="7" r="3"/>
      <path d="M6 6 2 22"/>
      <path d="m6 6 12-4"/>
      <path d="M10 10 6 22"/>
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  );
}