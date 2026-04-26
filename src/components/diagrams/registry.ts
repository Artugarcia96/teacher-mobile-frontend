import type { ComponentType } from 'react';
import type { AnyDiagram, DiagramKind } from './types';
import { Process, Cycle, Timeline } from './kinds/process';
import { Pyramid, Funnel, OrgChart } from './kinds/hierarchy';
import { Quadrant, Swot, Comparison } from './kinds/comparison';
import { Venn2, Venn3 } from './kinds/sets';
import { Fishbone, MindMap } from './kinds/analysis';
import { BarChart, StatsGrid, Progress } from './kinds/data';
import { Roadmap, Stack, RadialCluster } from './kinds/strategy';
import { Axes, NumberLine, Geometry } from './kinds/math';

export interface DiagramMeta {
  kind: DiagramKind;
  label: string;
  description: string;
  category: 'flow' | 'hierarchy' | 'comparison' | 'sets' | 'analysis' | 'data' | 'strategy' | 'math';
  Component: ComponentType<{ data: any }>;
}

export const DIAGRAMS: Record<DiagramKind, DiagramMeta> = {
  // Flujo
  process:         { kind: 'process',         label: 'Proceso',           description: 'Pasos horizontales con flechas',          category: 'flow',       Component: Process },
  processVertical: { kind: 'processVertical', label: 'Proceso vertical',  description: 'Pasos verticales numerados',              category: 'flow',       Component: Process },
  cycle:           { kind: 'cycle',           label: 'Ciclo',             description: 'N pasos circulares con flechas curvas',    category: 'flow',       Component: Cycle },
  timeline:        { kind: 'timeline',        label: 'Línea temporal',    description: 'Hitos con fechas',                         category: 'flow',       Component: Timeline },
  // Jerarquía
  pyramid:         { kind: 'pyramid',         label: 'Pirámide',          description: 'Niveles jerárquicos (Maslow, tróficos…)',  category: 'hierarchy',  Component: Pyramid },
  funnel:          { kind: 'funnel',          label: 'Embudo',            description: 'Conversión por etapas',                    category: 'hierarchy',  Component: Funnel },
  orgChart:        { kind: 'orgChart',        label: 'Organigrama',       description: 'Árbol jerárquico',                         category: 'hierarchy',  Component: OrgChart },
  // Comparativa
  quadrant:        { kind: 'quadrant',        label: 'Cuadrante 2×2',     description: 'Matriz (Eisenhower, BCG…)',               category: 'comparison', Component: Quadrant },
  swot:            { kind: 'swot',            label: 'DAFO / SWOT',       description: 'Fortalezas / Debilidades / Opor. / Amen.', category: 'comparison', Component: Swot },
  comparison:      { kind: 'comparison',      label: 'Comparativa',       description: 'Columnas con filas comparables',           category: 'comparison', Component: Comparison },
  // Conjuntos
  venn2:           { kind: 'venn2',           label: 'Venn 2',            description: 'Dos conjuntos con intersección',           category: 'sets',       Component: Venn2 },
  venn3:           { kind: 'venn3',           label: 'Venn 3',            description: 'Tres conjuntos',                           category: 'sets',       Component: Venn3 },
  // Análisis
  fishbone:        { kind: 'fishbone',        label: 'Ishikawa',          description: 'Diagrama de causa-efecto',                 category: 'analysis',   Component: Fishbone },
  mindMap:         { kind: 'mindMap',         label: 'Mapa mental',       description: 'Nodo central con ramas',                   category: 'analysis',   Component: MindMap },
  // Datos
  barChart:        { kind: 'barChart',        label: 'Barras',            description: 'Gráfico de barras',                        category: 'data',       Component: BarChart },
  statsGrid:       { kind: 'statsGrid',       label: 'KPIs',              description: 'Grid de cifras destacadas',                category: 'data',       Component: StatsGrid },
  progress:        { kind: 'progress',        label: 'Progreso',          description: 'Stepper con estados',                      category: 'data',       Component: Progress },
  // Estrategia
  roadmap:         { kind: 'roadmap',         label: 'Roadmap',           description: 'Timeline con swimlanes',                   category: 'strategy',   Component: Roadmap },
  stack:           { kind: 'stack',           label: 'Stack',             description: 'Capas apiladas',                           category: 'strategy',   Component: Stack },
  radialCluster:   { kind: 'radialCluster',   label: 'Cluster radial',    description: 'Centro + satélites',                       category: 'strategy',   Component: RadialCluster },
  // Matemáticos / científicos
  axes:            { kind: 'axes',            label: 'Ejes / función',    description: 'Plano cartesiano con curvas y puntos',     category: 'math',       Component: Axes },
  numberLine:      { kind: 'numberLine',      label: 'Recta numérica',    description: 'Eje 1D con puntos e intervalos',           category: 'math',       Component: NumberLine },
  geometry:        { kind: 'geometry',        label: 'Geometría',         description: 'Triángulos, círculos, polígonos etiquetados', category: 'math',    Component: Geometry },
};

export const DIAGRAM_LIST = Object.values(DIAGRAMS);

export function getDiagramMeta(kind: DiagramKind): DiagramMeta | undefined {
  return DIAGRAMS[kind];
}

// Re-export para consumidores ergonómicos
export type { AnyDiagram, DiagramKind };
