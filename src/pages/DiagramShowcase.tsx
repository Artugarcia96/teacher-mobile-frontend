import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import DiagramRenderer from '../components/diagrams/DiagramRenderer';
import { DIAGRAM_LIST } from '../components/diagrams/registry';
import type { AnyDiagram } from '../components/diagrams/types';
import { Button } from '@/components/ui/button';

// Dataset de ejemplo por tipo. Vive sólo aquí — no lo usa la generación real;
// sirve para ver cada diagrama de un vistazo mientras se itera en su diseño.
const SAMPLES: Record<string, AnyDiagram> = {
  process: {
    kind: 'process', title: 'Ciclo del agua',
    steps: [
      { label: 'Evaporación', description: 'El sol calienta el agua' },
      { label: 'Condensación', description: 'Se forman nubes', tone: 'primary' },
      { label: 'Precipitación', description: 'Lluvia, nieve o granizo', tone: 'accent' },
      { label: 'Escorrentía', description: 'El agua vuelve al mar', tone: 'success' },
    ],
  },
  processVertical: {
    kind: 'processVertical', title: 'Método científico',
    steps: [
      { label: 'Observar', description: 'Detectar un fenómeno' },
      { label: 'Formular hipótesis' },
      { label: 'Experimentar' },
      { label: 'Analizar resultados' },
      { label: 'Conclusiones' },
    ],
  },
  cycle: {
    kind: 'cycle', title: 'Ciclo PDCA',
    steps: [
      { label: 'Plan', tone: 'primary' },
      { label: 'Do', tone: 'accent' },
      { label: 'Check', tone: 'warning' },
      { label: 'Act', tone: 'success' },
    ],
  },
  timeline: {
    kind: 'timeline', title: 'Hitos del siglo XX',
    orientation: 'horizontal',
    items: [
      { date: '1914', label: 'IGM' },
      { date: '1929', label: 'Crack 29', tone: 'danger' },
      { date: '1945', label: 'Fin IIGM', tone: 'success' },
      { date: '1969', label: 'Luna', tone: 'accent' },
      { date: '1989', label: 'Caída del muro' },
    ],
  },
  pyramid: {
    kind: 'pyramid', title: 'Pirámide de Maslow',
    levels: [
      { label: 'Autorrealización', tone: 'accent' },
      { label: 'Reconocimiento', tone: 'primary' },
      { label: 'Afiliación', tone: 'success' },
      { label: 'Seguridad', tone: 'warning' },
      { label: 'Fisiológicas', tone: 'danger' },
    ],
  },
  funnel: {
    kind: 'funnel', title: 'Embudo de conversión',
    stages: [
      { label: 'Visitantes', value: 10000, tone: 'primary' },
      { label: 'Registrados', value: 2000, tone: 'accent' },
      { label: 'Compradores', value: 400, tone: 'warning' },
      { label: 'Recurrentes', value: 80, tone: 'success' },
    ],
  },
  orgChart: {
    kind: 'orgChart', title: 'Reino Animal',
    root: {
      label: 'Reino Animal', tone: 'accent',
      children: [
        { label: 'Vertebrados', tone: 'primary', children: [
          { label: 'Mamíferos' }, { label: 'Aves' }, { label: 'Peces' },
        ]},
        { label: 'Invertebrados', tone: 'success', children: [
          { label: 'Insectos' }, { label: 'Moluscos' },
        ]},
      ],
    },
  },
  quadrant: {
    kind: 'quadrant', title: 'Matriz de Eisenhower',
    xLabel: 'Urgente', yLabel: 'Importante',
    xLow: 'No urgente', xHigh: 'Urgente', yLow: 'No importante', yHigh: 'Importante',
    items: [
      { label: 'Crisis', x: 0.8, y: 0.85, tone: 'danger' },
      { label: 'Planificar', x: 0.2, y: 0.8, tone: 'success' },
      { label: 'Interrupciones', x: 0.8, y: 0.2, tone: 'warning' },
      { label: 'Distracciones', x: 0.2, y: 0.2, tone: 'muted' },
    ],
  },
  swot: {
    kind: 'swot', title: 'DAFO de una pyme',
    strengths: ['Equipo experimentado', 'Producto validado'],
    weaknesses: ['Poca financiación', 'Marca joven'],
    opportunities: ['Mercado en crecimiento', 'Regulación favorable'],
    threats: ['Competencia internacional', 'Cambios fiscales'],
  },
  comparison: {
    kind: 'comparison', title: 'SQL vs NoSQL',
    rowLabels: ['Esquema', 'Escalado', 'Consistencia'],
    columns: [
      { title: 'SQL', tone: 'primary', rows: ['Rígido', 'Vertical', 'Fuerte (ACID)'] },
      { title: 'NoSQL', tone: 'accent', rows: ['Flexible', 'Horizontal', 'Eventual'] },
    ],
  },
  venn2: {
    kind: 'venn2', title: 'Marketing ∩ Ventas',
    setA: { label: 'Marketing', items: ['Branding', 'SEO'] },
    setB: { label: 'Ventas',    items: ['Cierre', 'Upsell'] },
    intersection: ['Leads', 'CRM'],
  },
  venn3: {
    kind: 'venn3', title: 'Reinos de la biología',
    setA: { label: 'Plantas' },
    setB: { label: 'Animales' },
    setC: { label: 'Hongos' },
    center: ['Vida'],
  },
  fishbone: {
    kind: 'fishbone', title: 'Ishikawa: caída de ventas',
    effect: 'Caída de ventas',
    causes: [
      { label: 'Producto', subcauses: ['Precio', 'Calidad'] },
      { label: 'Canal',    subcauses: ['Tienda', 'Online'] },
      { label: 'Personas', subcauses: ['Formación'] },
      { label: 'Proceso',  subcauses: ['Logística'] },
      { label: 'Mercado',  subcauses: ['Competencia'] },
      { label: 'Promoción', subcauses: ['Publicidad'] },
    ],
  },
  mindMap: {
    kind: 'mindMap', title: 'Ecosistema de una célula',
    center: 'Célula',
    branches: [
      { label: 'Membrana',     items: ['Fosfolípidos', 'Proteínas'], tone: 'primary' },
      { label: 'Núcleo',       items: ['ADN', 'Nucléolo'], tone: 'accent' },
      { label: 'Citoplasma',   items: ['Orgánulos', 'Citosol'], tone: 'success' },
      { label: 'Mitocondrias', items: ['ATP', 'Respiración'], tone: 'warning' },
      { label: 'Ribosomas',    items: ['Síntesis de proteínas'], tone: 'danger' },
    ],
  },
  barChart: {
    kind: 'barChart', title: 'Notas del trimestre',
    unit: '',
    bars: [
      { label: 'Mat', value: 7.5, tone: 'primary' },
      { label: 'Len', value: 8.1, tone: 'accent' },
      { label: 'His', value: 6.2, tone: 'warning' },
      { label: 'Bio', value: 9.0, tone: 'success' },
      { label: 'EdF', value: 8.7 },
    ],
  },
  statsGrid: {
    kind: 'statsGrid', title: 'KPIs del curso',
    stats: [
      { value: '92%', label: 'Aprobados', trend: 'up', tone: 'success' },
      { value: '+15%', label: 'Asistencia', trend: 'up', tone: 'primary' },
      { value: '3.2', label: 'Repetidores', trend: 'down', tone: 'warning' },
      { value: '24', label: 'Aulas', tone: 'accent' },
    ],
  },
  progress: {
    kind: 'progress', title: 'Progreso del proyecto',
    steps: [
      { label: 'Análisis', percent: 100, state: 'done',    tone: 'success' },
      { label: 'Diseño',   percent: 100, state: 'done',    tone: 'success' },
      { label: 'Build',    percent: 60,  state: 'current', tone: 'primary' },
      { label: 'Tests',    percent: 0,   state: 'todo' },
      { label: 'Release',  percent: 0,   state: 'todo' },
    ],
  },
  roadmap: {
    kind: 'roadmap', title: 'Roadmap Q1–Q4',
    periods: ['Q1', 'Q2', 'Q3', 'Q4'],
    lanes: [
      { label: 'Producto', tone: 'primary', items: [
        { label: 'Editor v2',    start: 1, end: 2 },
        { label: 'Diagramas',    start: 2, end: 4 },
      ]},
      { label: 'Marketing', tone: 'accent', items: [
        { label: 'Landing',      start: 1, end: 1 },
        { label: 'Webinar',      start: 3, end: 4 },
      ]},
      { label: 'Operaciones', tone: 'success', items: [
        { label: 'Onboarding',   start: 2, end: 3 },
      ]},
    ],
  },
  stack: {
    kind: 'stack', title: 'Stack técnico',
    layers: [
      { label: 'Interfaz (React + Tailwind)', tone: 'accent' },
      { label: 'API (FastAPI)',               tone: 'primary' },
      { label: 'Servicios (IA, PDF, Auth)',   tone: 'success' },
      { label: 'Base de datos (Postgres)',    tone: 'warning' },
      { label: 'Infraestructura (Docker)',    tone: 'muted' },
    ],
  },
  radialCluster: {
    kind: 'radialCluster', title: 'Influencias en el aprendizaje',
    center: 'Alumno',
    direction: 'in',
    nodes: [
      { label: 'Familia',     tone: 'primary' },
      { label: 'Profesores',  tone: 'accent' },
      { label: 'Compañeros',  tone: 'success' },
      { label: 'Recursos',    tone: 'warning' },
      { label: 'Motivación',  tone: 'danger' },
      { label: 'Entorno',     tone: 'muted' },
    ],
  },
};

const DiagramShowcase: React.FC = () => {
  const [replay, setReplay] = useState(0);
  const items = useMemo(() => DIAGRAM_LIST, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
        <div>
          <h1 className="text-xl font-bold">Librería de diagramas</h1>
          <p className="text-sm text-muted-foreground">{items.length} tipos disponibles</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setReplay((k) => k + 1)}>
          <RefreshCw size={14} />
          Reproducir animaciones
        </Button>
      </header>

      <div className="p-6 space-y-10">
        {items.map((meta) => {
          const sample = SAMPLES[meta.kind];
          if (!sample) return null;
          return (
            <section key={meta.kind} className="space-y-2">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="text-lg font-bold">{meta.label}</h2>
                <code className="text-xs text-muted-foreground">{meta.kind}</code>
                <span className="text-xs text-muted-foreground">· {meta.description}</span>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <DiagramRenderer data={sample} replayKey={replay} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default DiagramShowcase;
