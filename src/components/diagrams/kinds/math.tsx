/* Diagramas matemáticos: Axes (gráfica de funciones), NumberLine, Geometry.
 *
 * Renderizan en SVG nativo, sin dependencias externas. La evaluación de
 * expresiones de Axes es deliberadamente conservadora: solo soporta
 * sintaxis matemática plana (`x^2`, `sin(x)`, `2*x+1`, `exp(x)`, `sqrt(x)`).
 * Si la expresión no es parseable o lanza, la curva no se dibuja en lugar
 * de petar el render.
 */

import { useMemo } from 'react';
import type { AxesDiagram, NumberLineDiagram, GeometryDiagram, GeometryShape } from '../types';
import { useDiagramTheme, resolveTone } from '../theme';

const AXES_VIEWBOX = { w: 600, h: 380 };

/* ───── Axes (gráfica) ─────────────────────────────────────────────── */

function safeEvalExpression(expr: string): ((x: number) => number) | null {
  // Whitelist estricta. Todo símbolo no reconocido aborta.
  // Reemplazos: ^ → **, símbolos de funciones permitidas.
  const PERMITTED = /^[\sx0-9+\-*/().,^a-zA-Z]+$/;
  if (!PERMITTED.test(expr)) return null;
  const FNS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'log10', 'exp', 'sqrt', 'abs', 'pow'];
  const tokens = expr.replace(/\^/g, '**');
  // Comprobamos identifiers: solo `x`, `e`, `pi` y nombres en FNS
  const identifierRe = /[a-zA-Z][a-zA-Z0-9]*/g;
  let m: RegExpExecArray | null;
  const allowed = new Set(['x', 'e', 'pi', 'PI', 'E', ...FNS, 'Math']);
  while ((m = identifierRe.exec(tokens)) !== null) {
    if (!allowed.has(m[0])) return null;
  }
  try {
    // Construye un evaluador con scope limitado.
    const body = tokens
      .replace(/\bpi\b|\bPI\b/g, 'Math.PI')
      .replace(/\be\b|\bE\b/g, 'Math.E')
      .replace(/\b(sin|cos|tan|asin|acos|atan|log|exp|sqrt|abs|pow)\b/g, 'Math.$1')
      .replace(/\blog10\b/g, 'Math.log10');
    // eslint-disable-next-line no-new-func
    const fn = new Function('x', `"use strict"; try { return (${body}); } catch (e) { return NaN; }`);
    return (x: number) => {
      const v = (fn as any)(x);
      return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
    };
  } catch {
    return null;
  }
}

export const Axes: React.FC<{ data: AxesDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const xRange = data.xRange ?? [-5, 5];
  const yRange = data.yRange ?? [-5, 5];
  const padding = 36;
  const W = AXES_VIEWBOX.w;
  const H = AXES_VIEWBOX.h;

  const xTo = (x: number) => padding + ((x - xRange[0]) / (xRange[1] - xRange[0])) * (W - 2 * padding);
  const yTo = (y: number) => H - padding - ((y - yRange[0]) / (yRange[1] - yRange[0])) * (H - 2 * padding);

  const ticksX = useMemo(() => buildTicks(xRange[0], xRange[1]), [xRange[0], xRange[1]]);
  const ticksY = useMemo(() => buildTicks(yRange[0], yRange[1]), [yRange[0], yRange[1]]);

  const curves = (data.functions || []).map((fn, i) => {
    const evaluator = safeEvalExpression(fn.expression);
    if (!evaluator) {
      return { fn, points: '', color: theme.tones.primary.fill, label: fn.label || fn.expression };
    }
    const samples = 240;
    const dx = (xRange[1] - xRange[0]) / samples;
    const segments: string[] = [];
    let path = '';
    let pen = false;
    for (let s = 0; s <= samples; s += 1) {
      const x = xRange[0] + s * dx;
      const y = evaluator(x);
      if (!Number.isFinite(y) || y < yRange[0] - 1 || y > yRange[1] + 1) {
        if (pen) segments.push(path);
        path = '';
        pen = false;
        continue;
      }
      const sx = xTo(x);
      const sy = yTo(y);
      path += pen ? ` L ${sx.toFixed(2)} ${sy.toFixed(2)}` : `M ${sx.toFixed(2)} ${sy.toFixed(2)}`;
      pen = true;
    }
    if (pen) segments.push(path);
    const swatch = resolveTone(theme, fn.color, i);
    return {
      fn,
      points: segments.join(' '),
      color: swatch.fill,
      label: fn.label || fn.expression,
    };
  });

  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 360 }}>
        {/* Grid */}
        <g stroke="rgba(15, 23, 42, 0.06)" strokeWidth={1}>
          {ticksX.map((t) => (
            <line key={`gx${t}`} x1={xTo(t)} x2={xTo(t)} y1={padding} y2={H - padding} />
          ))}
          {ticksY.map((t) => (
            <line key={`gy${t}`} y1={yTo(t)} y2={yTo(t)} x1={padding} x2={W - padding} />
          ))}
        </g>
        {/* Ejes */}
        <line x1={xTo(0)} x2={xTo(0)} y1={padding} y2={H - padding} stroke="#475569" strokeWidth={1.5} />
        <line y1={yTo(0)} y2={yTo(0)} x1={padding} x2={W - padding} stroke="#475569" strokeWidth={1.5} />
        {/* Tick labels */}
        <g fontSize={11} fill="#475569">
          {ticksX.filter((t) => t !== 0).map((t) => (
            <text key={`tx${t}`} x={xTo(t)} y={yTo(0) + 14} textAnchor="middle">{formatTick(t)}</text>
          ))}
          {ticksY.filter((t) => t !== 0).map((t) => (
            <text key={`ty${t}`} x={xTo(0) - 6} y={yTo(t) + 4} textAnchor="end">{formatTick(t)}</text>
          ))}
        </g>
        {/* Axis labels */}
        {data.xLabel && (
          <text x={W - padding} y={yTo(0) - 6} textAnchor="end" fontSize={12} fontWeight={600} fill="#0f172a">{data.xLabel}</text>
        )}
        {data.yLabel && (
          <text x={xTo(0) + 6} y={padding + 4} fontSize={12} fontWeight={600} fill="#0f172a">{data.yLabel}</text>
        )}
        {/* Curvas */}
        {curves.map((c, i) => (
          <g key={i} className="diag-reveal" style={{ animationDelay: `${i * 80}ms` }}>
            <path d={c.points} stroke={c.color} strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {/* Puntos destacados */}
        {(data.points || []).map((p, i) => {
          const swatch = resolveTone(theme, p.tone, i);
          return (
            <g key={`p${i}`} className="diag-reveal" style={{ animationDelay: `${(curves.length + i) * 80}ms` }}>
              <circle cx={xTo(p.x)} cy={yTo(p.y)} r={5} fill={swatch.fill} stroke="#fff" strokeWidth={2} />
              {p.label && (
                <text x={xTo(p.x) + 8} y={yTo(p.y) - 8} fontSize={11} fontWeight={600} fill={swatch.text}>{p.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Leyenda */}
      {curves.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {curves.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="inline-block w-4 h-[2px] rounded" style={{ background: c.color }} />
              <span className="font-medium">{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function buildTicks(min: number, max: number): number[] {
  const span = max - min;
  if (span <= 0) return [];
  const step = span <= 4 ? 0.5 : span <= 12 ? 1 : span <= 30 ? 5 : Math.pow(10, Math.floor(Math.log10(span)));
  const out: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + 1e-9; v += step) {
    out.push(Number(v.toFixed(6)));
  }
  return out;
}

function formatTick(v: number): string {
  if (Math.abs(v) < 1e-9) return '0';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

/* ───── NumberLine ─────────────────────────────────────────────────── */

export const NumberLine: React.FC<{ data: NumberLineDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const min = data.min;
  const max = data.max;
  const W = 600;
  const H = 130;
  const padding = 40;
  const xTo = (v: number) => padding + ((v - min) / (max - min)) * (W - 2 * padding);

  const step = data.step ?? 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  const yLine = H / 2;

  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
        {/* Eje */}
        <line x1={padding} x2={W - padding} y1={yLine} y2={yLine} stroke="#0f172a" strokeWidth={1.5} />
        {/* Flechas extremos */}
        <polygon points={`${padding - 8},${yLine} ${padding + 4},${yLine - 5} ${padding + 4},${yLine + 5}`} fill="#0f172a" />
        <polygon points={`${W - padding + 8},${yLine} ${W - padding - 4},${yLine - 5} ${W - padding - 4},${yLine + 5}`} fill="#0f172a" />
        {/* Ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xTo(t)} x2={xTo(t)} y1={yLine - 5} y2={yLine + 5} stroke="#0f172a" strokeWidth={1} />
            <text x={xTo(t)} y={yLine + 22} textAnchor="middle" fontSize={11} fill="#475569">{formatTick(t)}</text>
          </g>
        ))}
        {/* Intervalos */}
        {(data.intervals || []).map((iv, i) => {
          const swatch = resolveTone(theme, iv.tone, i);
          const x1 = xTo(iv.from);
          const x2 = xTo(iv.to);
          const yI = yLine - 12;
          return (
            <g key={`iv${i}`} className="diag-reveal" style={{ animationDelay: `${i * 80}ms` }}>
              <line x1={x1} x2={x2} y1={yI} y2={yI} stroke={swatch.fill} strokeWidth={4} strokeLinecap="round" />
              <circle cx={x1} cy={yI} r={5} fill={iv.fromClosed === false ? '#fff' : swatch.fill} stroke={swatch.fill} strokeWidth={2} />
              <circle cx={x2} cy={yI} r={5} fill={iv.toClosed === false ? '#fff' : swatch.fill} stroke={swatch.fill} strokeWidth={2} />
              {iv.label && (
                <text x={(x1 + x2) / 2} y={yI - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill={swatch.text}>{iv.label}</text>
              )}
            </g>
          );
        })}
        {/* Puntos */}
        {(data.points || []).map((p, i) => {
          const swatch = resolveTone(theme, p.tone, i);
          const baseDelay = ((data.intervals?.length || 0) + i) * 80;
          return (
            <g key={`pt${i}`} className="diag-reveal" style={{ animationDelay: `${baseDelay}ms` }}>
              <circle cx={xTo(p.value)} cy={yLine} r={6} fill={p.closed === false ? '#fff' : swatch.fill} stroke={swatch.fill} strokeWidth={2} />
              {p.label && (
                <text x={xTo(p.value)} y={yLine - 14} textAnchor="middle" fontSize={11} fontWeight={700} fill={swatch.text}>{p.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

/* ───── Geometry ───────────────────────────────────────────────────── */

export const Geometry: React.FC<{ data: GeometryDiagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const range = data.range ?? [-5, 5];
  const W = 480;
  const H = 360;
  const padding = 24;
  const xTo = (x: number) => padding + ((x - range[0]) / (range[1] - range[0])) * (W - 2 * padding);
  const yTo = (y: number) => H - padding - ((y - range[0]) / (range[1] - range[0])) * (H - 2 * padding);

  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 380 }}>
        {/* Grid sutil */}
        <g stroke="rgba(15, 23, 42, 0.05)" strokeWidth={1}>
          {Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i).map((t) => (
            <g key={t}>
              <line x1={xTo(t)} x2={xTo(t)} y1={padding} y2={H - padding} />
              <line y1={yTo(t)} y2={yTo(t)} x1={padding} x2={W - padding} />
            </g>
          ))}
        </g>
        {/* Shapes */}
        {(data.shapes || []).map((shape, i) => (
          <ShapeNode key={i} shape={shape} index={i} xTo={xTo} yTo={yTo} theme={theme} />
        ))}
        {/* Labels libres */}
        {(data.labels || []).map((lbl, i) => (
          <text
            key={`lbl${i}`}
            x={xTo(lbl.x)}
            y={yTo(lbl.y)}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="#0f172a"
          >
            {lbl.text}
          </text>
        ))}
      </svg>
    </div>
  );
};

const ShapeNode: React.FC<{
  shape: GeometryShape;
  index: number;
  xTo: (x: number) => number;
  yTo: (y: number) => number;
  theme: ReturnType<typeof useDiagramTheme>;
}> = ({ shape, index, xTo, yTo, theme }) => {
  const swatch = resolveTone(theme, shape.tone, index);
  const stroke = swatch.fill;
  const fillSoft = `${swatch.fill}1A`;   // 10% alpha
  switch (shape.type) {
    case 'triangle':
    case 'polygon': {
      const points = (shape.type === 'triangle' ? shape.points : shape.points)
        .map(([x, y]) => `${xTo(x)},${yTo(y)}`).join(' ');
      const cx = (shape.type === 'triangle' ? shape.points : shape.points)
        .reduce((a, [x]) => a + x, 0) / (shape.points.length);
      const cy = (shape.type === 'triangle' ? shape.points : shape.points)
        .reduce((a, [, y]) => a + y, 0) / (shape.points.length);
      return (
        <g className="diag-reveal" style={{ animationDelay: `${index * 80}ms` }}>
          <polygon points={points} fill={fillSoft} stroke={stroke} strokeWidth={2} />
          {shape.label && (
            <text x={xTo(cx)} y={yTo(cy)} textAnchor="middle" fontSize={13} fontWeight={700} fill={swatch.text}>{shape.label}</text>
          )}
        </g>
      );
    }
    case 'circle': {
      const cx = xTo(shape.center[0]);
      const cy = yTo(shape.center[1]);
      const rPx = Math.abs(xTo(shape.radius) - xTo(0));
      return (
        <g className="diag-reveal" style={{ animationDelay: `${index * 80}ms` }}>
          <circle cx={cx} cy={cy} r={rPx} fill={fillSoft} stroke={stroke} strokeWidth={2} />
          {shape.label && (
            <text x={cx} y={cy} textAnchor="middle" fontSize={13} fontWeight={700} fill={swatch.text}>{shape.label}</text>
          )}
        </g>
      );
    }
    case 'rectangle': {
      const x1 = xTo(shape.corner[0]);
      const y1 = yTo(shape.corner[1] + shape.height);
      const wPx = xTo(shape.corner[0] + shape.width) - x1;
      const hPx = yTo(shape.corner[1]) - y1;
      return (
        <g className="diag-reveal" style={{ animationDelay: `${index * 80}ms` }}>
          <rect x={x1} y={y1} width={wPx} height={hPx} fill={fillSoft} stroke={stroke} strokeWidth={2} />
          {shape.label && (
            <text x={x1 + wPx / 2} y={y1 + hPx / 2} textAnchor="middle" fontSize={13} fontWeight={700} fill={swatch.text}>{shape.label}</text>
          )}
        </g>
      );
    }
    case 'segment': {
      const x1 = xTo(shape.from[0]);
      const y1 = yTo(shape.from[1]);
      const x2 = xTo(shape.to[0]);
      const y2 = yTo(shape.to[1]);
      return (
        <g className="diag-reveal" style={{ animationDelay: `${index * 80}ms` }}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={x1} cy={y1} r={3.5} fill={stroke} />
          <circle cx={x2} cy={y2} r={3.5} fill={stroke} />
          {shape.label && (
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill={swatch.text}>{shape.label}</text>
          )}
        </g>
      );
    }
    default:
      return null;
  }
};
