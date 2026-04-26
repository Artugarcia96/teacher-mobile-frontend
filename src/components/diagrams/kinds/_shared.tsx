import type { DiagramItem } from '../types';
import { useDiagramTheme, resolveTone } from '../theme';

/** Card básica que renderiza un DiagramItem con icono opcional.
 *  La usan varios diagramas para mantener la estética coherente. */
export const ItemCard: React.FC<{
  item: DiagramItem;
  index?: number;
  number?: number;
  compact?: boolean;
}> = ({ item, index = 0, number, compact }) => {
  const theme = useDiagramTheme();
  const swatch = resolveTone(theme, item.tone, index);
  return (
    <div
      className="diag-card flex items-start gap-3 h-full"
      style={{ borderColor: swatch.stroke, background: compact ? undefined : swatch.fillSoft }}
    >
      {typeof number === 'number' && (
        <div
          className="shrink-0 w-7 h-7 rounded-full font-bold text-sm flex items-center justify-center"
          style={{ background: swatch.fill, color: swatch.onFill }}
        >
          {number}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="diag-label" style={{ color: swatch.text }}>{item.label}</div>
        {item.description && <div className="diag-desc">{item.description}</div>}
      </div>
    </div>
  );
};

/** Divide un label en líneas para SVG. Respeta palabras (no parte por la
 *  mitad), cabe en `maxCharsPerLine`, máximo `maxLines` líneas. Si excede,
 *  añade … en la última. Mucho mejor que truncar duro a N caracteres
 *  porque preserva más información y se ve natural. */
export function wrapSvgLabel(label: string, maxCharsPerLine: number, maxLines: number = 2): string[] {
  const text = (label || '').trim();
  if (!text) return [''];
  if (text.length <= maxCharsPerLine) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }
    // No cabe — cierra línea y empieza otra
    if (current) {
      lines.push(current);
      current = w;
    } else {
      // Una sola palabra que ya excede el límite — partir
      lines.push(w.slice(0, maxCharsPerLine));
      current = w.slice(maxCharsPerLine);
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  // Si quedaron palabras fuera, marcar la última con …
  const usedWords = lines.join(' ').split(/\s+/).length;
  if (usedWords < words.length) {
    const last = lines[lines.length - 1];
    const trimmed = last.length >= maxCharsPerLine - 1
      ? last.slice(0, maxCharsPerLine - 1) + '…'
      : last + '…';
    lines[lines.length - 1] = trimmed;
  }
  return lines;
}

/** Renderiza texto multi-línea dentro de un <text> SVG usando tspans.
 *  Pensado para labels en círculos/cards de diagramas: respeta el centro
 *  vertical aproximado al desplazar la primera línea hacia arriba. */
export const WrappedText: React.FC<{
  x: number;
  y: number;
  lines: string[];
  fontSize: number;
  fontWeight?: number | string;
  fill: string;
  lineHeight?: number;   // múltiplo del fontSize, por defecto 1.15
  textAnchor?: 'start' | 'middle' | 'end';
}> = ({ x, y, lines, fontSize, fontWeight = 600, fill, lineHeight = 1.15, textAnchor = 'middle' }) => {
  const lh = fontSize * lineHeight;
  // Centramos el bloque vertical en y: para 1 línea queda exacto,
  // para N líneas desplazamos arriba (N-1) * lh / 2.
  const startDy = -((lines.length - 1) * lh) / 2 + fontSize / 3;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={fontSize} fontWeight={fontWeight} fill={fill}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : lh}>{line}</tspan>
      ))}
    </text>
  );
};
