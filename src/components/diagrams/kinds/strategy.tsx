import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { RoadmapDiagram, StackDiagram, RadialClusterDiagram } from '../types';
import { useDiagramTheme, resolveTone, revealStyle } from '../theme';
import { wrapSvgLabel, WrappedText } from './_shared';

/* ───── Roadmap ───────────────────────────────────────────────────────── */

export const Roadmap: React.FC<{ data: RoadmapDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const colCount = Math.max(data.periods.length, 1);
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          {/* Header periodos */}
          <div className="grid" style={{ gridTemplateColumns: `140px repeat(${colCount}, 1fr)` }}>
            <div />
            {data.periods.map((p, i) => (
              <div key={i} className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border">
                {p}
              </div>
            ))}
          </div>
          {/* Lanes */}
          {data.lanes.map((lane, li) => {
            const swatch = resolveTone(theme, lane.tone, li);
            return (
              <div key={li} className="grid items-center border-b border-border" style={{ gridTemplateColumns: `140px repeat(${colCount}, 1fr)` }}>
                <div className="py-3 pr-3 text-sm font-semibold" style={{ color: swatch.text }}>{lane.label}</div>
                <div className="col-span-full relative h-14" style={{ gridColumnStart: 2, gridColumnEnd: `span ${colCount}` }}>
                  {lane.items.map((item, ii) => {
                    const start = Math.max(0, item.start - 1);
                    const end = Math.max(start + 1, item.end);
                    const span = Math.min(colCount, end) - start;
                    const left = (start / colCount) * 100;
                    const widthPct = (span / colCount) * 100;
                    return (
                      <div
                        key={ii}
                        className="absolute top-2 h-10 rounded-md px-3 py-1.5 text-xs font-semibold flex flex-col justify-center diag-grow"
                        style={{
                          left: `calc(${left}% + 4px)`,
                          width: `calc(${widthPct}% - 8px)`,
                          background: swatch.fill,
                          color: swatch.onFill,
                          animationDelay: `${(li * 100 + ii * theme.stepDelayMs)}ms`,
                        }}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.subtitle && <span className="truncate opacity-80 text-[10px]">{item.subtitle}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ───── Stack (capas apiladas) ────────────────────────────────────────── */

export const Stack: React.FC<{ data: StackDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="max-w-md mx-auto space-y-1">
        {data.layers.map((layer, i) => {
          const swatch = resolveTone(theme, layer.tone, i);
          return (
            <div
              key={i}
              className="rounded-md px-4 py-3 diag-reveal"
              style={{
                ...revealStyle(i, theme),
                background: swatch.fill,
                color: swatch.onFill,
                borderLeft: `4px solid ${swatch.stroke}`,
              }}
            >
              <div className="font-bold text-sm">{layer.label}</div>
              {layer.description && <div className="text-xs opacity-85 mt-0.5">{layer.description}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ───── Radial cluster (centro + satélites) ──────────────────────────── */

export const RadialCluster: React.FC<{ data: RadialClusterDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const n = data.nodes.length || 1;
  const w = 720, h = 500;
  const cx = w / 2, cy = h / 2;
  const cr = 88;
  const orbit = 190;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} aria-hidden>
          {data.nodes.map((_, i) => {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2;
            const x = cx + Math.cos(a) * orbit;
            const y = cy + Math.sin(a) * orbit;
            const swatch = resolveTone(theme, data.nodes[i].tone, i);
            const x1 = cx + Math.cos(a) * cr;
            const y1 = cy + Math.sin(a) * cr;
            const x2 = x - Math.cos(a) * 40;
            const y2 = y - Math.sin(a) * 40;
            return (
              <g key={i}>
                <line
                  x1={data.direction === 'in' ? x2 : x1}
                  y1={data.direction === 'in' ? y2 : y1}
                  x2={data.direction === 'in' ? x1 : x2}
                  y2={data.direction === 'in' ? y1 : y2}
                  stroke={swatch.stroke} strokeWidth="2"
                  markerEnd={data.direction !== 'none' ? `url(#rc-arrow-${i})` : undefined}
                  className="diag-draw"
                  style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}
                />
                {data.direction !== 'none' && (
                  <defs>
                    <marker id={`rc-arrow-${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={swatch.stroke} />
                    </marker>
                  </defs>
                )}
              </g>
            );
          })}
          {/* Centro */}
          <g className="diag-grow">
            <circle cx={cx} cy={cy} r={cr} fill={theme.tones.accent.fill} />
            <WrappedText
              x={cx} y={cy}
              lines={wrapSvgLabel(data.center, 14, 2)}
              fontSize={14}
              fontWeight={700}
              fill={theme.tones.accent.onFill}
              lineHeight={1.15}
            />
          </g>
          {/* Satélites */}
          {data.nodes.map((node, i) => {
            const a = (i / n) * 2 * Math.PI - Math.PI / 2;
            const x = cx + Math.cos(a) * orbit;
            const y = cy + Math.sin(a) * orbit;
            const swatch = resolveTone(theme, node.tone, i);
            const lines = wrapSvgLabel(node.label, 18, 2);
            const rectH = lines.length > 1 ? 50 : 40;
            return (
              <g key={i} className="diag-grow" style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}>
                <rect x={x - 80} y={y - rectH / 2} width="160" height={rectH} rx="7" fill={swatch.fillSoft} stroke={swatch.stroke} strokeWidth="1.5" />
                <WrappedText
                  x={x} y={y}
                  lines={lines}
                  fontSize={12}
                  fontWeight={700}
                  fill={swatch.text}
                  lineHeight={1.15}
                />
              </g>
            );
          })}
        </svg>
        {data.direction && data.direction !== 'none' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {data.direction === 'in' ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
            <span>Dirección: {data.direction === 'in' ? 'hacia el centro' : 'desde el centro'}</span>
          </div>
        )}
      </div>
    </div>
  );
};
