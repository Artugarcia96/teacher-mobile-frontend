// Schema común para todos los diagramas. El LLM produce objetos con este shape;
// DiagramRenderer los despacha al componente correspondiente. Mantener cada
// schema plano y editable (arrays de items) para que una UI pueda hacer
// "añadir/quitar paso" sin refactor.

export type DiagramKind =
  | 'process'
  | 'processVertical'
  | 'cycle'
  | 'timeline'
  | 'pyramid'
  | 'funnel'
  | 'orgChart'
  | 'quadrant'
  | 'swot'
  | 'comparison'
  | 'venn2'
  | 'venn3'
  | 'fishbone'
  | 'mindMap'
  | 'barChart'
  | 'statsGrid'
  | 'progress'
  | 'roadmap'
  | 'stack'
  | 'radialCluster'
  | 'axes'
  | 'numberLine'
  | 'geometry';

interface BaseDiagram {
  kind: DiagramKind;
  title?: string;
  subtitle?: string;
}

/* Paso / item con etiqueta corta + descripción opcional. Unidad reutilizable. */
export interface DiagramItem {
  label: string;
  description?: string;
  /** Nombre de icono lucide opcional (ej: "sun", "cog"). El renderer lo resuelve. */
  icon?: string;
  /** Color tonal opcional (accent | primary | muted | success | warning | danger). */
  tone?: 'accent' | 'primary' | 'muted' | 'success' | 'warning' | 'danger';
}

/* --- 1/2. Proceso (horizontal / vertical) ---------------------------------- */
export interface ProcessDiagram extends BaseDiagram {
  kind: 'process' | 'processVertical';
  steps: DiagramItem[];
}

/* --- 3. Ciclo -------------------------------------------------------------- */
export interface CycleDiagram extends BaseDiagram {
  kind: 'cycle';
  steps: DiagramItem[];
}

/* --- 4. Timeline ----------------------------------------------------------- */
export interface TimelineDiagram extends BaseDiagram {
  kind: 'timeline';
  items: Array<DiagramItem & { date?: string }>;
  orientation?: 'horizontal' | 'vertical';
}

/* --- 5. Pirámide ----------------------------------------------------------- */
export interface PyramidDiagram extends BaseDiagram {
  kind: 'pyramid';
  /** De la cúspide (top) a la base. */
  levels: DiagramItem[];
  inverted?: boolean;
}

/* --- 6. Embudo ------------------------------------------------------------- */
export interface FunnelDiagram extends BaseDiagram {
  kind: 'funnel';
  stages: Array<DiagramItem & { value?: number }>;
}

/* --- 7. Organigrama -------------------------------------------------------- */
export interface OrgNode {
  label: string;
  subtitle?: string;
  tone?: DiagramItem['tone'];
  children?: OrgNode[];
}
export interface OrgChartDiagram extends BaseDiagram {
  kind: 'orgChart';
  root: OrgNode;
}

/* --- 8. Cuadrante 2x2 ------------------------------------------------------ */
export interface QuadrantDiagram extends BaseDiagram {
  kind: 'quadrant';
  xLabel: string;
  yLabel: string;
  xLow?: string;
  xHigh?: string;
  yLow?: string;
  yHigh?: string;
  /** Ítems posicionados en proporciones 0..1 de cada eje. */
  items: Array<DiagramItem & { x: number; y: number }>;
}

/* --- 9. DAFO / SWOT -------------------------------------------------------- */
export interface SwotDiagram extends BaseDiagram {
  kind: 'swot';
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

/* --- 10. Comparativa columnas --------------------------------------------- */
export interface ComparisonColumn {
  title: string;
  subtitle?: string;
  tone?: DiagramItem['tone'];
  rows: string[];
}
export interface ComparisonDiagram extends BaseDiagram {
  kind: 'comparison';
  columns: ComparisonColumn[];
  rowLabels?: string[];
}

/* --- 11/12. Venn ----------------------------------------------------------- */
export interface Venn2Diagram extends BaseDiagram {
  kind: 'venn2';
  setA: { label: string; items?: string[] };
  setB: { label: string; items?: string[] };
  intersection?: string[];
}
export interface Venn3Diagram extends BaseDiagram {
  kind: 'venn3';
  setA: { label: string; items?: string[] };
  setB: { label: string; items?: string[] };
  setC: { label: string; items?: string[] };
  abIntersection?: string[];
  bcIntersection?: string[];
  acIntersection?: string[];
  center?: string[];
}

/* --- 13. Fishbone (Ishikawa) ---------------------------------------------- */
export interface FishboneDiagram extends BaseDiagram {
  kind: 'fishbone';
  effect: string;
  causes: Array<{ label: string; subcauses?: string[] }>;
}

/* --- 14. Mind map (radial) ------------------------------------------------ */
export interface MindMapDiagram extends BaseDiagram {
  kind: 'mindMap';
  center: string;
  branches: Array<{ label: string; items?: string[]; tone?: DiagramItem['tone'] }>;
}

/* --- 15. Bar chart -------------------------------------------------------- */
export interface BarChartDiagram extends BaseDiagram {
  kind: 'barChart';
  bars: Array<{ label: string; value: number; tone?: DiagramItem['tone'] }>;
  unit?: string;
  orientation?: 'horizontal' | 'vertical';
  maxValue?: number;
}

/* --- 16. Stats grid (KPIs) ----------------------------------------------- */
export interface StatsGridDiagram extends BaseDiagram {
  kind: 'statsGrid';
  stats: Array<{
    value: string;
    label: string;
    trend?: 'up' | 'down' | 'flat';
    tone?: DiagramItem['tone'];
    icon?: string;
  }>;
}

/* --- 17. Progress (pasos con porcentaje) --------------------------------- */
export interface ProgressDiagram extends BaseDiagram {
  kind: 'progress';
  steps: Array<DiagramItem & { percent?: number; state?: 'done' | 'current' | 'todo' }>;
}

/* --- 18. Roadmap (timeline con swimlanes) -------------------------------- */
export interface RoadmapLane {
  label: string;
  tone?: DiagramItem['tone'];
  items: Array<{ label: string; start: number; end: number; subtitle?: string }>;
}
export interface RoadmapDiagram extends BaseDiagram {
  kind: 'roadmap';
  /** Etiquetas de las columnas (por ej. ['Q1','Q2','Q3','Q4']). */
  periods: string[];
  lanes: RoadmapLane[];
}

/* --- 19. Stack (capas apiladas) ------------------------------------------ */
export interface StackDiagram extends BaseDiagram {
  kind: 'stack';
  /** De arriba hacia abajo. */
  layers: DiagramItem[];
}

/* --- 20. Radial cluster (nodo central + satélites) ----------------------- */
export interface RadialClusterDiagram extends BaseDiagram {
  kind: 'radialCluster';
  center: string;
  /** Dirección de las flechas. */
  direction?: 'in' | 'out' | 'none';
  nodes: DiagramItem[];
}

/* --- 21. Axes (gráfica de funciones / ejes cartesianos) ------------------ */
export interface AxesFunction {
  /** Expresión matemática plana: "x^2", "sin(x)", "2*x+1", "exp(x)". */
  expression: string;
  label?: string;
  color?: 'primary' | 'accent' | 'success' | 'warning' | 'danger';
}
export interface AxesPoint {
  x: number;
  y: number;
  label?: string;
  tone?: DiagramItem['tone'];
}
export interface AxesDiagram extends BaseDiagram {
  kind: 'axes';
  xLabel?: string;
  yLabel?: string;
  xRange?: [number, number];   // por defecto [-5, 5]
  yRange?: [number, number];
  functions?: AxesFunction[];
  points?: AxesPoint[];
}

/* --- 22. Recta numérica -------------------------------------------------- */
export interface NumberLinePoint {
  value: number;
  label?: string;
  tone?: DiagramItem['tone'];
  /** open=círculo vacío (no incluido), closed=relleno (incluido). */
  closed?: boolean;
}
export interface NumberLineInterval {
  from: number;
  to: number;
  label?: string;
  tone?: DiagramItem['tone'];
  /** Si true, el extremo izquierdo es cerrado (incluido). */
  fromClosed?: boolean;
  toClosed?: boolean;
}
export interface NumberLineDiagram extends BaseDiagram {
  kind: 'numberLine';
  min: number;
  max: number;
  step?: number;
  points?: NumberLinePoint[];
  intervals?: NumberLineInterval[];
}

/* --- 23. Geometría plana etiquetada -------------------------------------- */
export type GeometryShape =
  | { type: 'triangle';  points: [[number, number], [number, number], [number, number]]; label?: string; tone?: DiagramItem['tone'] }
  | { type: 'circle';    center: [number, number]; radius: number; label?: string; tone?: DiagramItem['tone'] }
  | { type: 'rectangle'; corner: [number, number]; width: number; height: number; label?: string; tone?: DiagramItem['tone'] }
  | { type: 'polygon';   points: Array<[number, number]>; label?: string; tone?: DiagramItem['tone'] }
  | { type: 'segment';   from: [number, number]; to: [number, number]; label?: string; tone?: DiagramItem['tone'] };

export interface GeometryLabel {
  x: number;
  y: number;
  text: string;
}

export interface GeometryDiagram extends BaseDiagram {
  kind: 'geometry';
  shapes: GeometryShape[];
  labels?: GeometryLabel[];
  /** Rango visible (-5..5 por defecto). */
  range?: [number, number];
}

export type AnyDiagram =
  | ProcessDiagram
  | CycleDiagram
  | TimelineDiagram
  | PyramidDiagram
  | FunnelDiagram
  | OrgChartDiagram
  | QuadrantDiagram
  | SwotDiagram
  | ComparisonDiagram
  | Venn2Diagram
  | Venn3Diagram
  | FishboneDiagram
  | MindMapDiagram
  | BarChartDiagram
  | StatsGridDiagram
  | ProgressDiagram
  | RoadmapDiagram
  | StackDiagram
  | RadialClusterDiagram
  | AxesDiagram
  | NumberLineDiagram
  | GeometryDiagram;
