import type { Venn2Diagram, Venn3Diagram } from '../types';
import { useDiagramTheme } from '../theme';

/* ───── Venn 2 ────────────────────────────────────────────────────────── */

// Defensa: la IA a veces omite setA/setB o los da como string. Normalizamos a
// un shape { label, items } siempre, y si ni el label existe ponemos un
// placeholder en vez de dejar que `.label` crashee.
const normalizeSet = (raw: any, fallbackLabel: string): { label: string; items: string[] } => {
  if (!raw) return { label: fallbackLabel, items: [] };
  if (typeof raw === 'string') return { label: raw, items: [] };
  return {
    label: String(raw.label ?? raw.name ?? raw.title ?? fallbackLabel),
    items: Array.isArray(raw.items) ? raw.items.map(String) : [],
  };
};

export const Venn2: React.FC<{ data: Venn2Diagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const setA = normalizeSet((data as any).setA, 'Conjunto A');
  const setB = normalizeSet((data as any).setB, 'Conjunto B');
  const intersection: string[] = Array.isArray((data as any).intersection)
    ? (data as any).intersection.map(String)
    : [];
  const w = 520, h = 320, r = 110;
  const cxA = w / 2 - 70;
  const cxB = w / 2 + 70;
  const cy = h / 2;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} aria-hidden>
          <circle cx={cxA} cy={cy} r={r} fill={theme.tones.accent.fill} fillOpacity=".55" className="diag-grow" />
          <circle cx={cxB} cy={cy} r={r} fill={theme.tones.primary.fill} fillOpacity=".55" className="diag-grow" style={{ animationDelay: `${theme.stepDelayMs}ms` }} />
          <text x={cxA - r + 20} y={cy - r + 24} fontSize="14" fontWeight="700" fill={theme.tones.accent.text}>{setA.label}</text>
          <text x={cxB + r - 20} y={cy - r + 24} textAnchor="end" fontSize="14" fontWeight="700" fill={theme.tones.primary.text}>{setB.label}</text>
        </svg>
        <div className="flex-1 grid grid-cols-3 gap-3 text-sm w-full">
          <div>
            <div className="font-semibold mb-1" style={{ color: theme.tones.accent.text }}>{setA.label}</div>
            <ul className="space-y-0.5 text-xs">{setA.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div>
            <div className="font-semibold mb-1">Intersección</div>
            <ul className="space-y-0.5 text-xs">{intersection.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div>
            <div className="font-semibold mb-1" style={{ color: theme.tones.primary.text }}>{setB.label}</div>
            <ul className="space-y-0.5 text-xs">{setB.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ───── Venn 3 ────────────────────────────────────────────────────────── */

export const Venn3: React.FC<{ data: Venn3Diagram }> = ({ data }) => {
  const theme = useDiagramTheme();
  const setA = normalizeSet((data as any).setA, 'Conjunto A');
  const setB = normalizeSet((data as any).setB, 'Conjunto B');
  const setC = normalizeSet((data as any).setC, 'Conjunto C');
  const center: string[] = Array.isArray((data as any).center)
    ? (data as any).center.map(String)
    : [];
  const w = 560, h = 420, r = 130;
  const cxA = w / 2 - 85;
  const cyA = h / 2 - 45;
  const cxB = w / 2 + 85;
  const cyB = h / 2 - 45;
  const cxC = w / 2;
  const cyC = h / 2 + 85;
  return (
    <div className="diag-root">
      {data.title && <h3 className="diag-title">{data.title}</h3>}
      {data.subtitle && <p className="diag-subtitle">{data.subtitle}</p>}
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} aria-hidden>
        <circle cx={cxA} cy={cyA} r={r} fill={theme.tones.accent.fill}  fillOpacity=".5" className="diag-grow" />
        <circle cx={cxB} cy={cyB} r={r} fill={theme.tones.primary.fill} fillOpacity=".5" className="diag-grow" style={{ animationDelay: `${theme.stepDelayMs}ms` }} />
        <circle cx={cxC} cy={cyC} r={r} fill={theme.tones.success.fill} fillOpacity=".5" className="diag-grow" style={{ animationDelay: `${theme.stepDelayMs * 2}ms` }} />
        <text x={cxA - r + 20} y={cyA - r + 40} fontSize="14" fontWeight="700" fill={theme.tones.accent.text}>{setA.label}</text>
        <text x={cxB + r - 20} y={cyB - r + 40} textAnchor="end" fontSize="14" fontWeight="700" fill={theme.tones.primary.text}>{setB.label}</text>
        <text x={cxC} y={cyC + r + 2} textAnchor="middle" fontSize="14" fontWeight="700" fill={theme.tones.success.text}>{setC.label}</text>
        {center.length > 0 && (
          <text x={w / 2} y={h / 2 + 15} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">{center.join(', ')}</text>
        )}
      </svg>
    </div>
  );
};
