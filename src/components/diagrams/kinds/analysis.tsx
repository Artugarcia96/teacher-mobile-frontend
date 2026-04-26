import type { FishboneDiagram, MindMapDiagram } from '../types';
import { useDiagramTheme, resolveTone, revealStyle } from '../theme';
import { wrapSvgLabel, WrappedText } from './_shared';

/* ───── Fishbone / Ishikawa ───────────────────────────────────────────── */

export const Fishbone: React.FC<{ data: FishboneDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const w = 920, h = 460;
  const spineY = h / 2;
  const spineX1 = 70;
  const spineX2 = w - 200;
  const headW = 180;
  const causes = data.causes;
  const n = Math.max(causes.length, 1);
  // Limitamos subcausas a 2 (antes 3) para evitar overflow vertical contra
  // el contenido siguiente del slide.
  const SUBCAUSE_CAP = 2;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} aria-hidden>
        {/* Espina central */}
        <line x1={spineX1} y1={spineY} x2={spineX2} y2={spineY} stroke="#64748b" strokeWidth="3" className="diag-draw" />
        <polygon
          points={`${spineX2},${spineY - 10} ${spineX2 + 14},${spineY} ${spineX2},${spineY + 10}`}
          fill="#64748b"
        />
        {/* Cabeza (efecto) */}
        <g className="diag-grow">
          <rect x={spineX2 + 14} y={spineY - 36} width={headW} height="72" rx="10" fill={theme.tones.danger.fill} />
          <WrappedText
            x={spineX2 + 14 + headW / 2}
            y={spineY}
            lines={wrapSvgLabel(data.effect, 22, 2)}
            fontSize={13}
            fontWeight={700}
            fill={theme.tones.danger.onFill}
            lineHeight={1.15}
          />
        </g>
        {/* Costillas (causas). Las subcausas se anclan SIEMPRE en el lado
            externo de la cabeza de causa (arriba si la costilla es top,
            abajo si es bottom) para no solapar con la espina ni con
            contenido de otras costillas. */}
        {causes.map((cause, i) => {
          const isTop = i % 2 === 0;
          const progress = (Math.floor(i / 2) + 1) / Math.ceil(n / 2 + 1);
          const xBase = spineX1 + progress * (spineX2 - spineX1 - 40);
          const xTip = xBase - 130;
          const yTip = isTop ? spineY - 140 : spineY + 140;
          const swatch = resolveTone(theme, undefined, i);
          const labelLines = wrapSvgLabel(cause.label, 18, 2);
          const rectH = labelLines.length > 1 ? 42 : 32;
          return (
            <g key={i} style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}>
              <line x1={xBase} y1={spineY} x2={xTip} y2={yTip} stroke={swatch.stroke} strokeWidth="2" className="diag-draw" />
              <rect x={xTip - 75} y={yTip - rectH / 2} width="150" height={rectH} rx="6" fill={swatch.fillSoft} stroke={swatch.stroke} className="diag-grow" />
              <WrappedText
                x={xTip} y={yTip}
                lines={labelLines}
                fontSize={11.5}
                fontWeight={700}
                fill={swatch.text}
                lineHeight={1.15}
              />
              {/* Subcausas: van más allá del rect, alejándose de la espina */}
              {(cause.subcauses || []).slice(0, SUBCAUSE_CAP).map((sc, j) => {
                const y = isTop
                  ? yTip - rectH / 2 - 12 - j * 14
                  : yTip + rectH / 2 + 14 + j * 14;
                const truncated = sc.length > 28 ? sc.slice(0, 27) + '…' : sc;
                return (
                  <text key={j} x={xTip} y={y} textAnchor="middle" fontSize="9.5" fill="#64748b" opacity="0.85">
                    · {truncated}
                  </text>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* ───── Mind Map (radial) ─────────────────────────────────────────────── */

export const MindMap: React.FC<{ data: MindMapDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const n = data.branches.length;
  const w = 720, h = 520;
  const cx = w / 2, cy = h / 2;
  const cr = 70;
  const branchDist = 210;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} aria-hidden>
        {/* Líneas */}
        {data.branches.map((_, i) => {
          const a = (i / n) * 2 * Math.PI;
          const x = cx + Math.cos(a) * branchDist;
          const y = cy + Math.sin(a) * branchDist;
          const swatch = resolveTone(theme, data.branches[i].tone, i);
          return (
            <path
              key={i}
              d={`M ${cx + Math.cos(a) * cr} ${cy + Math.sin(a) * cr} Q ${cx + Math.cos(a) * (branchDist * 0.6) + 20} ${cy + Math.sin(a) * (branchDist * 0.6)} ${x} ${y}`}
              stroke={swatch.stroke} strokeWidth="2.5" fill="none"
              className="diag-draw"
              style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}
            />
          );
        })}
        {/* Centro */}
        <g className="diag-grow">
          <circle cx={cx} cy={cy} r={cr} fill={theme.tones.accent.fill} />
          <WrappedText
            x={cx} y={cy}
            lines={wrapSvgLabel(data.center, 13, 2)}
            fontSize={15}
            fontWeight={700}
            fill={theme.tones.accent.onFill}
            lineHeight={1.15}
          />
        </g>
        {/* Ramas */}
        {data.branches.map((b, i) => {
          const a = (i / n) * 2 * Math.PI;
          const x = cx + Math.cos(a) * branchDist;
          const y = cy + Math.sin(a) * branchDist;
          const swatch = resolveTone(theme, b.tone, i);
          const lines = wrapSvgLabel(b.label, 18, 2);
          const rectH = lines.length > 1 ? 52 : 42;
          return (
            <g key={i} className="diag-grow" style={{ animationDelay: `${i * theme.stepDelayMs}ms` }}>
              <rect x={x - 80} y={y - rectH / 2} width="160" height={rectH} rx="8" fill={swatch.fillSoft} stroke={swatch.stroke} strokeWidth="1.5" />
              <WrappedText
                x={x} y={y}
                lines={lines}
                fontSize={12.5}
                fontWeight={700}
                fill={swatch.text}
                lineHeight={1.15}
              />
            </g>
          );
        })}
      </svg>
      {/* Items detallados debajo */}
      {data.branches.some((b) => b.items && b.items.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
          {data.branches.map((b, i) => {
            const swatch = resolveTone(theme, b.tone, i);
            return (
              <div key={i} className="diag-reveal" style={revealStyle(i, theme)}>
                <div className="text-xs font-bold mb-0.5" style={{ color: swatch.text }}>{b.label}</div>
                <ul className="text-[11px] text-muted-foreground space-y-0.5">
                  {(b.items || []).map((it, j) => <li key={j}>• {it}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
