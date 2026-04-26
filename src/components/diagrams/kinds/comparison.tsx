import type { QuadrantDiagram, SwotDiagram, ComparisonDiagram } from '../types';
import { useDiagramTheme, resolveTone, revealStyle } from '../theme';

/* ───── Quadrant 2x2 ──────────────────────────────────────────────────── */

export const Quadrant: React.FC<{ data: QuadrantDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const size = 420;
  const pad = 40;
  const inner = size - pad * 2;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="flex flex-col items-center">
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} aria-hidden>
          {/* Fondo de cuadrantes */}
          {[
            { x: pad, y: pad, fill: theme.tones.primary.fillSoft },            // top-left
            { x: pad + inner / 2, y: pad, fill: theme.tones.success.fillSoft }, // top-right
            { x: pad, y: pad + inner / 2, fill: theme.tones.muted.fillSoft },  // bottom-left
            { x: pad + inner / 2, y: pad + inner / 2, fill: theme.tones.warning.fillSoft }, // bottom-right
          ].map((q, i) => (
            <rect key={i} x={q.x} y={q.y} width={inner / 2} height={inner / 2} fill={q.fill} />
          ))}
          {/* Ejes */}
          <line x1={pad} y1={pad + inner / 2} x2={pad + inner} y2={pad + inner / 2} stroke="#94a3b8" strokeWidth="1.5" />
          <line x1={pad + inner / 2} y1={pad} x2={pad + inner / 2} y2={pad + inner} stroke="#94a3b8" strokeWidth="1.5" />
          {/* Etiquetas de ejes */}
          <text x={size / 2} y={15} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">{data.yHigh || 'Alto'}</text>
          <text x={size / 2} y={size - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#334155">{data.yLow || 'Bajo'}</text>
          <text x={10} y={size / 2} textAnchor="start" fontSize="12" fontWeight="700" fill="#334155">{data.xLow || 'Bajo'}</text>
          <text x={size - 10} y={size / 2} textAnchor="end" fontSize="12" fontWeight="700" fill="#334155">{data.xHigh || 'Alto'}</text>
          {/* Items */}
          {data.items.map((item, i) => {
            const cx = pad + item.x * inner;
            const cy = pad + (1 - item.y) * inner;
            const swatch = resolveTone(theme, item.tone, i);
            return (
              <g key={i} className="diag-grow" style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}>
                <circle cx={cx} cy={cy} r="9" fill={swatch.fill} stroke="#fff" strokeWidth="2" />
                <text x={cx + 12} y={cy + 4} fontSize="11" fontWeight="600" fill="#0f172a">{item.label}</text>
              </g>
            );
          })}
        </svg>
        <div className="mt-2 flex flex-col md:flex-row gap-1 text-xs text-muted-foreground">
          <span>Eje X: <strong className="text-foreground">{data.xLabel}</strong></span>
          <span className="hidden md:inline">·</span>
          <span>Eje Y: <strong className="text-foreground">{data.yLabel}</strong></span>
        </div>
      </div>
    </div>
  );
};

/* ───── SWOT / DAFO ───────────────────────────────────────────────────── */

export const Swot: React.FC<{ data: SwotDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const cells: Array<{ title: string; items: string[]; tone: keyof typeof theme.tones }> = [
    { title: 'Fortalezas', items: data.strengths, tone: 'success' },
    { title: 'Debilidades', items: data.weaknesses, tone: 'danger' },
    { title: 'Oportunidades', items: data.opportunities, tone: 'primary' },
    { title: 'Amenazas', items: data.threats, tone: 'warning' },
  ];
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cells.map((cell, i) => {
          const swatch = theme.tones[cell.tone];
          return (
            <div
              key={cell.title}
              className="diag-card diag-reveal"
              style={{ ...revealStyle(i, theme), borderColor: swatch.stroke, background: swatch.fillSoft }}
            >
              <div className="font-bold text-sm mb-2" style={{ color: swatch.text }}>{cell.title}</div>
              <ul className="space-y-1 text-sm">
                {cell.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full" style={{ background: swatch.fill }} />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ───── Comparison (columnas) ─────────────────────────────────────────── */

export const Comparison: React.FC<{ data: ComparisonDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${data.columns.length}, minmax(0, 1fr))` }}>
        {data.columns.map((col, ci) => {
          const swatch = resolveTone(theme, col.tone, ci);
          return (
            <div
              key={ci}
              className="diag-card diag-reveal"
              style={{ ...revealStyle(ci, theme), borderColor: swatch.stroke }}
            >
              <div
                className="rounded-md -m-3 mb-3 px-3 py-2 text-center font-bold text-sm"
                style={{ background: swatch.fill, color: swatch.onFill }}
              >
                {col.title}
                {col.subtitle && <div className="text-[11px] font-medium opacity-80">{col.subtitle}</div>}
              </div>
              <ul className="space-y-2 text-sm">
                {col.rows.map((row, ri) => (
                  <li key={ri} className="flex gap-2">
                    {data.rowLabels?.[ri] && (
                      <span className="shrink-0 text-xs text-muted-foreground w-20">{data.rowLabels[ri]}</span>
                    )}
                    <span className="flex-1">{row}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};
