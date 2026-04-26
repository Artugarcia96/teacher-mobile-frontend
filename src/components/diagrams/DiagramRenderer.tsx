import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { AnyDiagram, DiagramKind } from './types';
import { DIAGRAMS } from './registry';
import { DiagramThemeContext, DEFAULT_THEME, type DiagramTheme } from './theme';
import ErrorBoundary from '../shared/ErrorBoundary';
import './styles.css';

/** Alias tolerantes: el LLM a veces genera variantes ("processHorizontal"
 *  en vez de "process", "bar_chart" en vez de "barChart", etc.). Los
 *  mapeamos al kind canónico en vez de mostrar un error al profesor. */
const KIND_ALIASES: Record<string, DiagramKind> = {
  // Process
  processhorizontal: 'process',
  process_horizontal: 'process',
  horizontalprocess: 'process',
  flowchart: 'process',
  flowchart_horizontal: 'process',
  steps: 'process',
  proceso: 'process',
  // Process vertical
  processvertical: 'processVertical',
  process_vertical: 'processVertical',
  verticalprocess: 'processVertical',
  flowchart_vertical: 'processVertical',
  // Bar chart
  bar_chart: 'barChart',
  barchart: 'barChart',
  bars: 'barChart',
  barras: 'barChart',
  horizontal_bar_chart: 'barChart',
  vertical_bar_chart: 'barChart',
  chart_bar: 'barChart',
  // Org chart
  org_chart: 'orgChart',
  orgchart: 'orgChart',
  organigram: 'orgChart',
  organigrama: 'orgChart',
  hierarchy: 'orgChart',
  tree: 'orgChart',
  // Radial
  radial_cluster: 'radialCluster',
  radialcluster: 'radialCluster',
  hub_and_spoke: 'radialCluster',
  hubspoke: 'radialCluster',
  starburst: 'radialCluster',
  // Mind map
  mind_map: 'mindMap',
  mindmap: 'mindMap',
  mapa_mental: 'mindMap',
  mapamental: 'mindMap',
  // KPIs
  stats_grid: 'statsGrid',
  statsgrid: 'statsGrid',
  kpi: 'statsGrid',
  kpis: 'statsGrid',
  metrics: 'statsGrid',
  dashboard: 'statsGrid',
  // Timeline
  timeline_horizontal: 'timeline',
  timeline_vertical: 'timeline',
  time_line: 'timeline',
  linea_temporal: 'timeline',
  chronology: 'timeline',
  // SWOT
  dafo: 'swot',
  foda: 'swot',
  matriz_dafo: 'swot',
  // Pyramid
  pyramid_chart: 'pyramid',
  piramide: 'pyramid',
  hierarchy_pyramid: 'pyramid',
  // Funnel
  funnel_chart: 'funnel',
  embudo: 'funnel',
  conversion_funnel: 'funnel',
  sales_funnel: 'funnel',
  // Cycle
  cycle_diagram: 'cycle',
  ciclo: 'cycle',
  circular: 'cycle',
  loop: 'cycle',
  // Venn
  venn: 'venn2',
  venn_diagram: 'venn2',
  venn_2: 'venn2',
  venn_3: 'venn3',
  // Fishbone
  ishikawa: 'fishbone',
  fish_bone: 'fishbone',
  cause_effect: 'fishbone',
  // Progress
  stepper: 'progress',
  progress_bar: 'progress',
  checklist: 'progress',
  // Stack
  layers: 'stack',
  capas: 'stack',
  // Comparison
  comparison_table: 'comparison',
  compare: 'comparison',
  columns_comparison: 'comparison',
  // Quadrant
  matrix: 'quadrant',
  quadrant_2x2: 'quadrant',
  eisenhower: 'quadrant',
  bcg_matrix: 'quadrant',
  // Roadmap
  gantt: 'roadmap',
  timeline_gantt: 'roadmap',
  plan: 'roadmap',
  // Math
  graph: 'axes',
  function_graph: 'axes',
  cartesian: 'axes',
  axis: 'axes',
  plot: 'axes',
  number_line: 'numberLine',
  numberline: 'numberLine',
  recta_numerica: 'numberLine',
  geometric: 'geometry',
  geo: 'geometry',
  shapes: 'geometry',
  figura: 'geometry',
};

function resolveKind(raw: string): DiagramKind | undefined {
  const key = String(raw || '').trim();
  if (key in DIAGRAMS) return key as DiagramKind;
  // Normalizamos: lowercase + quitamos espacios, guiones y guiones bajos
  const normalized = key.toLowerCase().replace(/[\s_-]/g, '');
  if (normalized in DIAGRAMS) return normalized as DiagramKind;
  // Probamos también con la versión con guiones bajos para alias como "bar_chart"
  const withUnderscore = key.toLowerCase().replace(/[\s-]/g, '_');
  if (KIND_ALIASES[withUnderscore]) return KIND_ALIASES[withUnderscore];
  if (KIND_ALIASES[normalized]) return KIND_ALIASES[normalized];
  // Log para debug (futuros alias)
  if (key) console.warn('[DiagramRenderer] kind desconocido:', key);
  return undefined;
}

interface Props {
  data: AnyDiagram;
  theme?: Partial<DiagramTheme>;
  /** Si true, el diagrama re-ejecuta la animación de entrada al montar.
   *  Útil para streaming simulado — cuando cambia de slide, se reanima. */
  replayKey?: string | number;
}

const DiagramRenderer: React.FC<Props> = ({ data, theme, replayKey }) => {
  const resolvedKind = resolveKind(data.kind as string);
  const meta = resolvedKind ? DIAGRAMS[resolvedKind] : undefined;
  const normalisedData = resolvedKind && resolvedKind !== data.kind
    ? ({ ...data, kind: resolvedKind } as AnyDiagram)
    : data;
  const mergedTheme = { ...DEFAULT_THEME, ...theme, tones: { ...DEFAULT_THEME.tones, ...(theme?.tones || {}) } };
  // Fuerza remount para reanimar cuando cambia replayKey
  const [mountKey, setMountKey] = useState(0);
  useEffect(() => { setMountKey((k) => k + 1); }, [replayKey]);

  if (!meta) {
    // Fallback elegante en vez de error rojo: mostramos el texto que venga
    // (title, label, items…) como bullets para no romper la slide cuando el
    // LLM invente un kind que todavía no soportamos.
    return <DiagramFallback data={data as any} />;
  }

  const Component = meta.Component as React.ComponentType<{ data: AnyDiagram }>;
  return (
    <DiagramThemeContext.Provider value={mergedTheme}>
      <div key={mountKey}>
        {/* Si los datos que devolvió la IA no cumplen el shape esperado por
            este kind (p. ej. un `steps` con un elemento undefined, un
            `levels` sin `label`, etc.), el componente específico peta con un
            TypeError. En lugar de tumbar el slide entero, lo capturamos y
            caemos al fallback visual de tarjetas. */}
        <ErrorBoundary
          label={`diagram:${resolvedKind}`}
          fallback={() => <DiagramFallback data={normalisedData as any} />}
        >
          <Component data={normalisedData} />
        </ErrorBoundary>
      </div>
    </DiagramThemeContext.Provider>
  );
};

/** Render visual cuando el kind no existe: extrae elementos relevantes del
 *  objeto y los muestra como tarjetas de colores suaves. Así el slide no se
 *  queda con un texto raro; se ve como un grupo de cards profesional. */
const FALLBACK_TONES = [
  { bg: '#e0f2fe', border: '#bae6fd', text: '#075985' },
  { bg: '#ede9fe', border: '#ddd6fe', text: '#5b21b6' },
  { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46' },
  { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
  { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' },
  { bg: '#f1f5f9', border: '#e2e8f0', text: '#334155' },
];

const DiagramFallback: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  const title = (data.title as string | undefined) || (data.center as string | undefined) || (data.effect as string | undefined);
  const items: Array<{ label: string; description?: string }> = [];

  const pushItems = (arr: any[] | undefined) => {
    if (!Array.isArray(arr)) return;
    for (const x of arr) {
      if (typeof x === 'string') {
        items.push({ label: x });
      } else if (x && typeof x === 'object') {
        const label = x.label || x.text || x.title || x.name;
        if (label) items.push({ label: String(label), description: x.description || x.subtitle || undefined });
      }
    }
  };
  pushItems(data.items);
  pushItems(data.steps);
  pushItems(data.stages);
  pushItems(data.levels);
  pushItems(data.nodes);
  pushItems(data.layers);
  pushItems(data.bars);
  pushItems(data.stats);
  pushItems(data.branches);
  pushItems(data.causes);
  pushItems(data.columns);

  // Si no encontramos nada, pintamos una sola caja con el título.
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: '24px',
          background: FALLBACK_TONES[0].bg,
          border: `1px solid ${FALLBACK_TONES[0].border}`,
          borderRadius: '16px',
          color: FALLBACK_TONES[0].text,
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        {title || 'Diagrama'}
      </div>
    );
  }

  const cols = items.length >= 4 ? 2 : items.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {title && (
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'inherit' }}>
          {title}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: '12px',
        }}
      >
        {items.slice(0, 8).map((it, i) => {
          const tone = FALLBACK_TONES[i % FALLBACK_TONES.length];
          return (
            <div
              key={i}
              style={{
                background: tone.bg,
                border: `1px solid ${tone.border}`,
                color: tone.text,
                padding: '16px 20px',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    background: tone.text,
                    color: '#fff',
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: '16px', fontWeight: 600 }}>
                  {it.label}
                </span>
              </div>
              {it.description && (
                <div style={{ fontSize: '13px', lineHeight: 1.4, opacity: 0.85 }}>
                  {it.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiagramRenderer;
