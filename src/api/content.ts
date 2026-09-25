/** The document of a generated material (mirror of the backend's app/content/schemas.py `ContentDoc`): the same JSON
 *  the app shows, the PDF prints and the .pptx projects. Every block and slide has a stable `id`: block edits,
 *  AI rewrites and figure SVGs (`MaterialDetail.figures`) address it. */

export type ContentKind = 'teoria' | 'practica' | 'presentacion' | 'resumen' | 'lectura_facil';
export type Level = 'refuerzo' | 'basico' | 'avanzado';

export type FigureType =
  | 'number_line' | 'fraction_bar' | 'fraction_circle' | 'bar_chart' | 'pie_chart' | 'function_plot' | 'right_triangle'
  | 'table' | 'punnett_square' | 'timeline' | 'pedigree' | 'diagram' | 'tree';
/** A whitelisted figure spec (backend app/content/figures.py): the server draws it (SVG here, Typst in the PDF). */
export interface FigureSpec { type: FigureType; [field: string]: unknown }

export type ItemType =
  | 'calculo' | 'problema' | 'test' | 'verdadero_falso' | 'completar' | 'relacionar' | 'ordenar' | 'clasificar'
  | 'respuesta_corta' | 'desarrollo' | 'comentario_texto' | 'tabla' | 'figura' | 'reescritura' | 'traduccion';

export interface TextBlock { id: string; type: 'text'; text: string }
export interface DefinitionBlock { id: string; type: 'definition'; term: string; text: string }
export interface ExampleBlock {
  id: string; type: 'example'; format: 'pasos' | 'analisis' | 'fuente'; title: string; statement: string; steps: string[];
  result: string; figure: FigureSpec | null;
}
export interface NoteBlock { id: string; type: 'note'; tone: 'ojo' | 'sabias' | 'consejo'; text: string }
export interface ListBlock { id: string; type: 'list'; title: string; items: string[]; ordered: boolean }
export interface TableBlock { id: string; type: 'table'; header: string[]; rows: string[][]; caption: string }
export interface FigureBlock { id: string; type: 'figure'; figure: FigureSpec; caption: string }
export interface ExerciseBlock {
  id: string; type: 'exercise'; level: Level; item_type: ItemType; statement: string; passage: string; items: string[];
  options: string[]; categories: string[]; pairs: string[][]; figure: FigureSpec | null; solution_figure: FigureSpec | null;
  steps: string[]; item_answers: string[]; answer: string; space: 'lines' | 'grid' | 'box' | 'none'; lines: number;
  /** Práctica: computed so that the sheet adds up to 10. */
  points: number | null;
  /** Printed order (relacionar: the right column; ordenar: the elements), the same in the PDF and its key. */
  shown: number[];
}
export interface CheckBlock { id: string; type: 'check'; question: string; answer: string }
export type Block =
  | TextBlock | DefinitionBlock | ExampleBlock | NoteBlock | ListBlock | TableBlock | FigureBlock | ExerciseBlock | CheckBlock;

export interface DocSection { id: string; title: string; level: Level | null; session: number | null; blocks: Block[] }

export type SlideLayout =
  | 'section' | 'bullets' | 'bullets_figure' | 'two_column' | 'example' | 'question' | 'practice' | 'summary' | 'figure';
export interface SlideColumn { heading: string; bullets: string[] }
export interface Slide {
  id: string; layout: SlideLayout; title: string; subtitle: string;
  /** In `practice`, the items (their solutions in `answers`). */
  bullets: string[]; answers: string[];
  left: SlideColumn | null; right: SlideColumn | null;
  example: { statement: string; steps: string[]; result: string } | null;
  question: { prompt: string; options: string[]; answer: string; explanation: string } | null;
  figure: FigureSpec | null; caption: string;
  /** A real picture the teacher is asked to insert (History, Science): what and what to search. */
  image: { description: string; search: string } | null;
  notes: string;
}

export interface ContentDoc {
  kind: ContentKind; title: string; subtitle: string; subject: string; level: string; unit: string;
  intro: string; objectives: string[]; instructions: string;
  sections: DocSection[]; slides: Slide[];
  /** Teoría: key ideas. Lectura fácil: `glossary`. */
  summary: string[]; glossary: { term: string; definition: string }[];
  sessions: string[];
}

/** An element the teacher edits, rewrites or removes. */
export type Element = Block | Slide;

const KINDS: ContentKind[] = ['teoria', 'practica', 'presentacion', 'resumen', 'lectura_facil'];

/** Stored content in the document format (a material whose content could not be converted is shown read-only). */
export function isContentDoc(c: unknown): c is ContentDoc {
  const d = c as Partial<ContentDoc> | null;
  return !!d && KINDS.includes(d.kind as ContentKind) && Array.isArray(d.sections) && Array.isArray(d.slides);
}

export const LEVEL_LABEL: Record<Level, string> = { refuerzo: 'Refuerzo', basico: 'Básico', avanzado: 'Avanzado' };
