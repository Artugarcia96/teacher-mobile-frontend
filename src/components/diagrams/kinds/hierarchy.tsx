import type { PyramidDiagram, FunnelDiagram, OrgChartDiagram, OrgNode } from '../types';
import { useDiagramTheme, resolveTone, revealStyle } from '../theme';

/* ───── Pyramid ───────────────────────────────────────────────────────── */

export const Pyramid: React.FC<{ data: PyramidDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const levels = data.levels;
  const n = levels.length || 1;
  const order = data.inverted ? [...levels].reverse() : levels;
  const width = 520;
  const height = 60 + n * 54;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} aria-hidden>
          {order.map((level, i) => {
            const swatch = resolveTone(theme, level.tone, i);
            // En pirámide normal el top es el más estrecho; invertida es al revés.
            const progress = (i + 1) / n;
            const w = data.inverted ? (1 - i / n) * width * 0.9 : progress * width * 0.9;
            const y = 30 + i * 54;
            const x = (width - w) / 2;
            return (
              <g key={i} className="diag-grow" style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}>
                <rect x={x} y={y} width={w} height={46} rx="6" fill={swatch.fill} />
                <text x={width / 2} y={y + 28} textAnchor="middle" fontSize="15" fontWeight="700" fill={swatch.onFill}>
                  {level.label}
                </text>
              </g>
            );
          })}
        </svg>
        <ol className="flex-1 space-y-1.5 w-full">
          {order.map((level, i) => (
            <li key={i} className="flex items-center gap-2 diag-reveal" style={revealStyle(i, theme)}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: resolveTone(theme, level.tone, i).fill }} />
              <div>
                <div className="diag-label text-sm">{level.label}</div>
                {level.description && <div className="diag-desc">{level.description}</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

/* ───── Funnel ────────────────────────────────────────────────────────── */

export const Funnel: React.FC<{ data: FunnelDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const stages = data.stages;
  const n = stages.length || 1;
  const width = 560;
  const height = 80 + n * 64;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxWidth: width }} aria-hidden>
          {stages.map((stage, i) => {
            const swatch = resolveTone(theme, stage.tone, i);
            const topW = (1 - i / n) * width * 0.9;
            const botW = (1 - (i + 1) / n) * width * 0.9;
            const y = 30 + i * 64;
            const topX = (width - topW) / 2;
            const botX = (width - botW) / 2;
            return (
              <g key={i} className="diag-grow" style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}>
                <path
                  d={`M ${topX} ${y} L ${topX + topW} ${y} L ${botX + botW} ${y + 54} L ${botX} ${y + 54} Z`}
                  fill={swatch.fill}
                />
                <text x={width / 2} y={y + 26} textAnchor="middle" fontSize="14" fontWeight="700" fill={swatch.onFill}>
                  {stage.label}
                </text>
                {typeof stage.value === 'number' && (
                  <text x={width / 2} y={y + 44} textAnchor="middle" fontSize="11" fill={swatch.onFill} opacity=".85">
                    {stage.value}{data.stages[0].value && data.stages[0].value > 0 ? ` (${Math.round((stage.value / (data.stages[0].value || 1)) * 100)}%)` : ''}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <ol className="flex-1 space-y-1.5 w-full">
          {stages.map((stage, i) => (
            <li key={i} className="flex items-center gap-2 diag-reveal" style={revealStyle(i, theme)}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: resolveTone(theme, stage.tone, i).fill }} />
              <span className="diag-label text-sm">{stage.label}</span>
              {typeof stage.value === 'number' && <span className="text-xs text-muted-foreground">· {stage.value}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

/* ───── OrgChart ──────────────────────────────────────────────────────── */

const OrgNodeCard: React.FC<{ node: OrgNode; index: number }> = ({ node, index }) => {
  const theme = useDiagramTheme();
  const swatch = resolveTone(theme, node.tone, index);
  return (
    <div
      className="diag-card text-center min-w-[140px] diag-reveal"
      style={{ borderColor: swatch.stroke, background: swatch.fillSoft, animationDelay: `${index * theme.stepDelayMs}ms` }}
    >
      <div className="diag-label text-sm" style={{ color: swatch.text }}>{node.label}</div>
      {node.subtitle && <div className="diag-desc">{node.subtitle}</div>}
    </div>
  );
};

const OrgSubtree: React.FC<{ node: OrgNode; depth?: number }> = ({ node, depth = 0 }) => {
  return (
    <div className="flex flex-col items-center gap-3 relative">
      <OrgNodeCard node={node} index={depth} />
      {node.children && node.children.length > 0 && (
        <>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-start gap-4 relative">
            {node.children.length > 1 && (
              <div
                className="absolute top-0 left-0 right-0 h-px bg-border"
                style={{ marginLeft: 70, marginRight: 70 }}
              />
            )}
            {node.children.map((c, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <div className="w-px h-4 bg-border" />
                <OrgSubtree node={c} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const OrgChart: React.FC<{ data: OrgChartDiagram }> = ({ data }) => {
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="overflow-x-auto pb-3">
        <OrgSubtree node={data.root} />
      </div>
    </div>
  );
};
