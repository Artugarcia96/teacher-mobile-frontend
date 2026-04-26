import { ChevronRight, ChevronDown } from 'lucide-react';
import type {
  ProcessDiagram, CycleDiagram, TimelineDiagram,
} from '../types';
import { useDiagramTheme, resolveTone, revealStyle } from '../theme';
import { ItemCard, wrapSvgLabel, WrappedText } from './_shared';

/* ───── Process (horizontal y vertical) ───────────────────────────────── */

export const Process: React.FC<{ data: ProcessDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const vertical = data.kind === 'processVertical';
  const Arrow = vertical ? ChevronDown : ChevronRight;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div
        className={vertical
          ? 'flex flex-col items-stretch gap-3'
          : 'flex flex-wrap items-stretch gap-3'}
      >
        {data.steps.map((step, i) => (
          <div key={i} className={vertical ? '' : 'flex items-center gap-2 flex-1 min-w-[180px]'}>
            <div className={vertical ? 'flex items-start gap-3' : 'flex-1'}>
              {vertical && (
                <div className="flex flex-col items-center">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm diag-grow"
                    style={{ ...revealStyle(i, theme), background: resolveTone(theme, step.tone, i).fill, color: resolveTone(theme, step.tone, i).onFill }}
                  >
                    {i + 1}
                  </div>
                  {i < data.steps.length - 1 && (
                    <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 20 }} />
                  )}
                </div>
              )}
              <div className="diag-reveal flex-1" style={revealStyle(i, theme)}>
                <ItemCard item={step} index={i} number={!vertical ? i + 1 : undefined} />
              </div>
            </div>
            {!vertical && i < data.steps.length - 1 && (
              <Arrow size={22} className="text-muted-foreground shrink-0 diag-reveal-in" style={revealStyle(i, theme)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ───── Cycle ─────────────────────────────────────────────────────────── */

export const Cycle: React.FC<{ data: CycleDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const n = data.steps.length;
  const radius = 150;
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const stepCircle = 76;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} aria-hidden>
          {/* Flechas curvas entre pasos */}
          {data.steps.map((_, i) => {
            const a1 = (i / n) * 2 * Math.PI - Math.PI / 2;
            const a2 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
            const pad = 0.22;
            const x1 = cx + Math.cos(a1 + pad) * radius;
            const y1 = cy + Math.sin(a1 + pad) * radius;
            const x2 = cx + Math.cos(a2 - pad) * radius;
            const y2 = cy + Math.sin(a2 - pad) * radius;
            const swatch = resolveTone(theme, data.steps[i].tone, i);
            const arcR = radius * 1.05;
            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 0 1 ${x2} ${y2}`}
                  stroke={swatch.stroke} strokeWidth="2" fill="none"
                  markerEnd={`url(#cycle-arrow-${i})`}
                  className="diag-draw"
                  style={{ animationDelay: `${(i + 1) * theme.stepDelayMs}ms` }}
                />
                <defs>
                  <marker id={`cycle-arrow-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={swatch.stroke} />
                  </marker>
                </defs>
              </g>
            );
          })}
          {data.steps.map((step, i) => {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2;
            const x = cx + Math.cos(a) * radius;
            const y = cy + Math.sin(a) * radius;
            const swatch = resolveTone(theme, step.tone, i);
            const lines = wrapSvgLabel(step.label, 11, 2);
            return (
              <g key={i} className="diag-grow" style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}>
                <circle cx={x} cy={y} r={stepCircle / 2} fill={swatch.fill} />
                <text x={x} y={y - 14} textAnchor="middle" fontSize="13" fontWeight="700" fill={swatch.onFill}>
                  {i + 1}
                </text>
                <WrappedText
                  x={x} y={y + 6}
                  lines={lines}
                  fontSize={9.5}
                  fontWeight={600}
                  fill={swatch.onFill}
                  lineHeight={1.1}
                />
              </g>
            );
          })}
        </svg>
        <ol className="flex-1 space-y-2 w-full">
          {data.steps.map((step, i) => (
            <li key={i} className="diag-reveal" style={revealStyle(i, theme)}>
              <ItemCard item={step} index={i} number={i + 1} compact />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

/* ───── Timeline (horizontal / vertical) ──────────────────────────────── */

export const Timeline: React.FC<{ data: TimelineDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const vertical = data.orientation === 'vertical';
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      {vertical ? (
        <ol className="relative space-y-4 ml-4 before:content-[''] before:absolute before:left-[-12px] before:top-1 before:bottom-1 before:w-[2px] before:bg-border">
          {data.items.map((item, i) => (
            <li key={i} className="relative diag-reveal" style={revealStyle(i, theme)}>
              <span
                className="absolute left-[-18px] top-2 w-3.5 h-3.5 rounded-full border-2 border-background"
                style={{ background: resolveTone(theme, item.tone, i).fill }}
              />
              {item.date && (
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.date}</span>
              )}
              <div className="diag-label">{item.label}</div>
              {item.description && <div className="diag-desc">{item.description}</div>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="relative py-6 overflow-x-auto">
          <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-border -translate-y-1/2" />
          <div className="flex items-stretch gap-4 relative">
            {data.items.map((item, i) => (
              <div key={i} className="flex-1 min-w-[140px] flex flex-col items-center diag-reveal" style={revealStyle(i, theme)}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.date || ''}</span>
                <span
                  className="w-4 h-4 rounded-full my-2 z-10 border-2 border-background"
                  style={{ background: resolveTone(theme, item.tone, i).fill }}
                />
                <div className="text-center">
                  <div className="diag-label text-sm">{item.label}</div>
                  {item.description && <div className="diag-desc">{item.description}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
