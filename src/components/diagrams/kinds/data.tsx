import { TrendingUp, TrendingDown, Minus, Check } from 'lucide-react';
import type { BarChartDiagram, StatsGridDiagram, ProgressDiagram } from '../types';
import { useDiagramTheme, resolveTone, revealStyle } from '../theme';

/* ───── Bar chart ─────────────────────────────────────────────────────── */

export const BarChart: React.FC<{ data: BarChartDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const horizontal = data.orientation === 'horizontal';
  const maxValue = data.maxValue ?? Math.max(...data.bars.map((b) => b.value), 0);
  const safeMax = maxValue > 0 ? maxValue : 1;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      {horizontal ? (
        <ol className="space-y-2">
          {data.bars.map((bar, i) => {
            const swatch = resolveTone(theme, bar.tone, i);
            const pct = (bar.value / safeMax) * 100;
            return (
              <li key={i} className="diag-reveal" style={revealStyle(i, theme)}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="font-medium">{bar.label}</span>
                  <span className="text-muted-foreground">{bar.value}{data.unit || ''}</span>
                </div>
                <div className="h-5 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${pct}%`,
                      background: swatch.fill,
                      transition: 'width 700ms cubic-bezier(0.2,0.8,0.2,1)',
                      transitionDelay: `${i * theme.stepDelayMs}ms`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="flex items-end gap-2 h-60">
          {data.bars.map((bar, i) => {
            const swatch = resolveTone(theme, bar.tone, i);
            const pct = (bar.value / safeMax) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2 diag-reveal" style={revealStyle(i, theme)}>
                <div className="text-xs text-muted-foreground">{bar.value}{data.unit || ''}</div>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${pct}%`,
                    minHeight: 6,
                    background: swatch.fill,
                    transition: 'height 700ms cubic-bezier(0.2,0.8,0.2,1)',
                    transitionDelay: `${i * theme.stepDelayMs}ms`,
                  }}
                />
                <div className="text-[11px] text-center font-medium line-clamp-2">{bar.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ───── Stats grid (KPIs) ─────────────────────────────────────────────── */

export const StatsGrid: React.FC<{ data: StatsGridDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const cols = data.stats.length <= 4 ? data.stats.length : 4;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {data.stats.map((s, i) => {
          const swatch = resolveTone(theme, s.tone, i);
          const Icon = s.trend === 'up' ? TrendingUp : s.trend === 'down' ? TrendingDown : Minus;
          return (
            <div
              key={i}
              className="diag-card diag-reveal"
              style={{ ...revealStyle(i, theme), borderColor: swatch.stroke, background: swatch.fillSoft }}
            >
              <div className="flex items-center justify-between mb-1 text-xs text-muted-foreground">
                <span className="font-medium">{s.label}</span>
                {s.trend && <Icon size={14} className={s.trend === 'up' ? 'text-emerald-600' : s.trend === 'down' ? 'text-rose-600' : ''} />}
              </div>
              <div className="text-2xl font-bold" style={{ color: swatch.text }}>{s.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ───── Progress (stepper con estados) ───────────────────────────────── */

export const Progress: React.FC<{ data: ProgressDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="relative">
        <div className="absolute top-3 left-6 right-6 h-[2px] bg-muted" />
        <div className="flex items-start justify-between gap-2 relative">
          {data.steps.map((step, i) => {
            const swatch = resolveTone(theme, step.tone, i);
            const done = step.state === 'done';
            const current = step.state === 'current';
            const bubbleBg = done || current ? swatch.fill : '#e2e8f0';
            return (
              <div key={i} className="flex-1 flex flex-col items-center text-center diag-reveal" style={revealStyle(i, theme)}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center border-2 border-background font-bold text-xs relative z-10"
                  style={{ background: bubbleBg, color: done || current ? swatch.onFill : '#64748b' }}
                >
                  {done ? <Check size={14} /> : i + 1}
                </div>
                <div className="mt-2 text-xs">
                  <div className="font-semibold">{step.label}</div>
                  {typeof step.percent === 'number' && (
                    <div className="text-muted-foreground">{step.percent}%</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
