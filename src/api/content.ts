/** The document of a generated material (mirror of the backend's app/content/schemas.py `ContentDoc`): the same JSON
 *  the app shows, the PDF prints and the .pptx projects. A presentation holds one lesson per class session, its slides
 *  in one flat list (`Slide.lesson`); apuntes, fichas, resúmenes and lecturas sencillas hold sections of blocks. Every
 *  block and slide has a stable `id` that edits, AI rewrites, figure SVGs and slide frames address. */

export type ContentKind = 'teoria' | 'practica' | 'presentacion' | 'resumen' | 'lectura_facil';
export type Level = 'refuerzo' | 'basico' | 'avanzado';

export type FigureType =
  | 'number_line' | 'fraction_bar' | 'fraction_circle' | 'bar_chart' | 'pie_chart' | 'function_plot' | 'right_triangle'
  | 'table' | 'punnett_square' | 'timeline' | 'pedigree' | 'diagram' | 'tree' | 'scheme' | 'sintaxis' | 'climograma'
  | 'forces' | 'piramide_poblacion' | 'bar_model' | 'area_model' | 'tense_timeline' | 'plan' | 'map';
/** A whitelisted figure spec (backend app/content/figures.py): the server draws it (SVG here, Typst in the PDF). */
export interface FigureSpec { type: FigureType; [field: string]: unknown }

export type ItemType =
  | 'calculo' | 'problema' | 'test' | 'verdadero_falso' | 'completar' | 'relacionar' | 'ordenar' | 'clasificar'
  | 'respuesta_corta' | 'desarrollo' | 'comentario_texto' | 'tabla' | 'figura' | 'reescritura' | 'traduccion';

// ── Lessons ──────────────────────────────────────────────────────────────────
/** «Tipo de sesión»: each kind has its own arc of slides. */
export type LessonKind = 'nueva' | 'problemas' | 'fuentes' | 'laboratorio' | 'repaso';
/** One class session («Sesión 3 · La conquista (711-718)») of a presentation, apuntes or práctica. */
export interface Lesson {
  /** 1-based. */
  n: number; title: string; kind: LessonKind;
  /** Presentación: the lesson question (the `enigma` headline) and its 2-3 success criteria («Sé…», «Puedo…»). */
  question: string; criteria: string[];
  /** The class's slot length; content is planned to `minutes − 5`. */
  minutes: number;
  /** Pre-fills «Deberes» at «Cerrar clase». */
  homework: string;
  /** Key content ids (c1, c2…); teoría: the ids of the sections this lesson covers. */
  contents: string[]; sections: string[];
  /** Set by the server while the job writes the lesson; `error` is the Spanish message when it failed. */
  status: 'ready' | 'generating' | 'failed'; error: string;
}

/** The first page of apuntes (teoría). */
export interface Opener {
  /** A concrete case (lengua and idiomas: the framing paragraph of `source_id`). */
  hook: string; source_id: string;
  /** «Pregunta de la unidad», «Contenidos» and «Procedimientos». */
  question: string; know: string[]; can_do: string[];
  /** An image of role `portada`. */
  image_id: string;
  /** Historia: the unit's milestones as a full-width timeline. */
  timeline: boolean;
}

// ── Slides ───────────────────────────────────────────────────────────────────
export type Archetype =
  | 'portada' | 'para_empezar' | 'imagen' | 'enigma' | 'afirmacion' | 'dato' | 'cita' | 'texto' | 'comparacion' | 'proceso'
  | 'cronologia' | 'mapa' | 'diagrama' | 'definicion' | 'ejemplo_resuelto' | 'tu_turno' | 'error_comun'
  | 'verdadero_falso' | 'bisagra' | 'piensa_comparte' | 'clasifica' | 'practica' | 'correccion' | 'esquema'
  | 'ticket_salida' | 'cierre' | 'lista' | 'enlace' | 'creditos';

/** A question, statement, chip, step or gloss of a slide (also the questions of apuntes blocks). */
export interface Item {
  text: string;
  /** Short answer (never on a student page). */
  answer: string;
  /** `lista`: the bold term on the left. */
  term: string;
  /** `practica`: 1-3. */
  level: number;
  /** `practica`: the answer is written prose. */
  prose: boolean;
}
/** One line of worked work (`show`) and its why (`say`); física y química apuntes name its phase («Datos»…). */
export interface Step { show: string; say: string; phase: string }
export interface Column {
  heading: string;
  /** `comparacion`: the cells (`clasifica`: none, the heading is the category). */
  cells: string[];
  image_id: string;
}
/** A label on an image or figure: `anchor` is "mark:<n>", "fig:<anchor>" or "" (a side label). */
export interface Callout { label: string; anchor: string }
/** The teacher's script of a slide, field by field («Di», «Pregunta», «Respuesta esperada»…). The app shows the lines
 *  the server composes from them (`MaterialDetail.slide_notes`). */
export interface SlideNotes {
  say: string; ask: string; expected: string; misconception: string; clicks: string[]; if_not: string; manage: string;
  source_note: string;
}
/** One slide: an archetype and its typed slots (`GET /content/archetypes` says which slots each archetype uses). */
export interface Slide {
  /** "d<lesson>-<n>" when created, opaque afterwards. */
  id: string; lesson: number; archetype: Archetype;
  /** Empty on task slides: the server composes their label, instruction and minutes. */
  headline: string; text: string; aside: string; term: string;
  /** `dato`: the number and its on-screen source. */
  number: string; attribution: string;
  items: Item[]; columns: Column[]; row_labels: string[];
  /** `bisagra`: the options; `answer` is the correct option's text (V/F: «Verdadero» | «Falso»; worked slides: the
   *  result line). */
  options: string[]; answer: string; explanation: string; distractor_misconceptions: string[];
  steps: Step[];
  /** `error_comun`: 1-based index of the wrong step. */
  wrong_step: number;
  /** `definicion`: «Sí es…» and «No es…» examples. */
  yes: string; no: string;
  /** `cita`, `texto`: a source library id and the words marked in it. */
  source_id: string; highlight: string;
  figure: FigureSpec | null; image_id: string;
  /** A migrated image hint waiting for «Buscar imagen». */
  image_need: ImageNeed | null;
  /** `enlace`: one of the unit's link materials. */
  link_id: string;
  callouts: Callout[];
  /** Build order (one click per ref). */
  reveal: string[];
  /** Planned minutes. */
  minutes: number;
  /** A backup slide: not projected unless shown; `backup_for` is the slide it supports. */
  hidden: boolean; backup_for: string;
  notes: SlideNotes;
}

// ── Blocks (apuntes, ficha, resumen, lectura sencilla) ───────────────────────
export type Place = 'text' | 'wide' | 'margin';
export interface TextBlock { id: string; type: 'text'; text: string }
/** A key box in the text, or a gloss in the margin. */
export interface DefinitionBlock { id: string; type: 'definition'; term: string; text: string; place: 'text' | 'margin' }
/** error: «Error frecuente» (with `wrong`, `right` and `check`); remember: «Recuerda»; fact: «Dato» (with its
 *  `source`); how: «¿Cómo lo sabemos?». `title` overrides the label («Se escribe así»). */
export type NoteTone = 'error' | 'remember' | 'fact' | 'how';
export interface NoteBlock {
  id: string; type: 'note'; tone: NoteTone; title: string; text: string; wrong: string; right: string; check: string;
  source: string; place: 'margin' | 'text';
}
export interface ListBlock { id: string; type: 'list'; title: string; items: string[]; ordered: boolean }
/** `ref`: the slug prose cites as `[[ref]]` («tabla 1»); `symbols`: the «Magnitud · Símbolo · Unidad» table. */
export interface TableBlock {
  id: string; type: 'table'; header: string[]; rows: string[][]; caption: string; ref: string; symbols: boolean;
}
export interface FigureBlock { id: string; type: 'figure'; figure: FigureSpec; caption: string; ref: string; place: Place }
export interface ImageBlock {
  id: string; type: 'image'; image_id: string; caption: string; ref: string; place: Place; callouts: Callout[];
}
/** «Ejemplo resuelto»: the why (`say`) beside the work (`show`); the last `fade` shows are left for «Termina tú». */
export interface WorkedBlock {
  id: string; type: 'worked'; title: string; statement: string; steps: Step[]; close: string; fade: number;
  figure: FigureSpec | null; ref: string;
}
/** «Caso»: an invented scene with 0-3 questions. */
export interface CaseBlock { id: string; type: 'case'; title: string; text: string; questions: Item[] }
/** «Doc. N»: a text of the source library (its text, author, work and date come from the library) with graded
 *  questions. */
export interface SourceBlock { id: string; type: 'source'; source_id: string; questions: Item[]; ref: string }
/** «Ahora tú». */
export interface YourTurnBlock { id: string; type: 'your_turn'; items: Item[] }
/** «Para repasar». */
export interface ReviewBlock { id: string; type: 'review'; items: Item[] }
export interface HowStep { name: string; text: string }
/** «Técnica: …»: how it is done, an example on a real material of the unit and «Entrena». */
export interface TechniqueBlock { id: string; type: 'technique'; title: string; how: HowStep[]; example: WorkedBlock; train: string }
export interface EssentialRow { concept: string; explanation: string; example: string }
/** «Lo esencial». */
export interface EssentialsBlock { id: string; type: 'essentials'; rows: EssentialRow[] }
/** «Respuesta a la pregunta de la unidad» (matemáticas, física y química: the opener's problem solved). */
export interface AnswerBlock { id: string; type: 'answer'; text: string; solved: WorkedBlock | null }
export interface QuizItem { text: string; options: string[]; answer: string; distractor_misconceptions: string[] }
export interface CanDo { objective: string; section_id: string }
/** «Autoevaluación» and «Sé hacerlo» (annex). */
export interface SelfCheckBlock { id: string; type: 'self_check'; items: QuizItem[]; can_do: CanDo[] }
export interface PriorItem { reminder: string; example: string; exercises: Item[] }
/** «Lo que ya sabes». */
export interface PriorBlock { id: string; type: 'prior'; items: PriorItem[] }
export interface SituationStep { text: string; section_id: string }
export interface RubricRow { criterion: string; levels: string[] }
/** «Situación de aprendizaje» (annex). */
export interface SituationBlock {
  id: string; type: 'situation'; context: string; challenge: string; product: string; steps: SituationStep[];
  rubric: RubricRow[];
}
export interface ExerciseBlock {
  id: string; type: 'exercise'; level: Level; item_type: ItemType; statement: string; passage: string; items: string[];
  options: string[]; categories: string[]; pairs: string[][]; figure: FigureSpec | null; solution_figure: FigureSpec | null;
  steps: string[]; item_answers: string[]; answer: string; space: 'lines' | 'grid' | 'box' | 'none'; lines: number;
  /** Práctica: computed so that the sheet adds up to 10. */
  points: number | null;
  /** The skill it trains and the key content ids it covers. */
  skill: string; contents: string[];
  /** Printed order (relacionar: the right column; ordenar: the elements), the same in the PDF and its key. */
  shown: number[];
  /** The programación's criterion codes, printed in the solucionario only. */
  criteria: string[];
}
export type Block =
  | TextBlock | DefinitionBlock | NoteBlock | ListBlock | TableBlock | FigureBlock | ImageBlock | WorkedBlock | CaseBlock
  | SourceBlock | YourTurnBlock | ReviewBlock | TechniqueBlock | EssentialsBlock | AnswerBlock | SelfCheckBlock | PriorBlock
  | SituationBlock | ExerciseBlock;

export type SectionRole = 'prior' | 'content' | 'technique' | 'closing' | 'activities' | 'situacion' | 'annex';
export interface DocSection {
  id: string; title: string; role: SectionRole; level: Level | null;
  /** The lesson it belongs to (apuntes split in sessions). */
  lesson: number | null;
  blocks: Block[];
}

// ── Images ───────────────────────────────────────────────────────────────────
export type ImageKind =
  | 'lugar' | 'objeto' | 'obra' | 'retrato' | 'fuente_primaria' | 'mapa_historico' | 'esquema' | 'especie' | 'fenomeno';
export type ImageRole = 'portada' | 'evidencia' | 'evidencia_ancha' | 'retrato' | 'mapa' | 'esquema';
/** What an image must show to prove a claim (written by the brief; a migrated slide keeps one for «Buscar imagen»). */
export interface ImageNeed {
  id: string; content: string; use: 'presentacion' | 'apuntes' | 'ambos'; kind: ImageKind; subject: string;
  must_show: string[]; must_not: string[]; claim: string; queries: string[]; entity: string; entity_class: string;
  role: ImageRole; when_where: string;
}
/** Where a `must_show` item is in the image: x, y, w, h in 0-1. */
export interface Mark { label: string; box: number[] }
export interface Credit {
  title: string; author: string;
  /** «Wikimedia Commons» | «Imagen del profesor». */
  source: string; page_url: string; license: string; license_url: string;
  /** «recortada», «rótulos traducidos»… */
  changes: string[];
}
/** An image the document uses (`ContentDoc.images`; slides and blocks point at it by `id`). */
export interface ImageRef {
  id: string; need_id: string; need: ImageNeed | null; need_hash: string; asset_id: string; kind: string; role: string;
  width: number; height: number;
  /** The area that must survive a crop (4 values). */
  focus: number[] | null;
  marks: Mark[];
  /** What it really shows: the alt text's base. */
  depicts: string;
  /** Wikidata facts for the caption. */
  facts: string;
  /** Never cropped. */
  contain: boolean;
  credit: Credit;
}

// ── Source library (texts) ───────────────────────────────────────────────────
/** One verse or line of dialogue or theatre; an empty `text` is a stanza break. */
export interface Line { text: string; speaker: string }
/** A verified text of the source library (backend app/content/texts/): quoted only as stored. */
export interface SourceEntry {
  id: string; form: 'prosa' | 'verso' | 'dialogo' | 'teatro'; text: string; lines: Line[];
  /** ≤ 40 words for a `cita` slide. */
  excerpt: string; title: string; author: string; work: string; date: string; edition: string; translator: string;
  translator_died: number | null; adapted: boolean;
  /** cita: a protected author (LPI art. 32.1 limits). */
  status: 'pd' | 'cita';
  language: string; subjects: string[]; levels: string[]; keywords: string[]; url: string;
  verified: 'edicion' | 'wikisource' | 'profesor'; checked_by: string;
}

// ── The document ─────────────────────────────────────────────────────────────
export interface Term { term: string; definition: string }
export interface ContentDoc {
  kind: ContentKind; title: string; subtitle: string; subject: string; level: string; unit: string;
  /** Ficha, resumen, lectura sencilla. */
  intro: string; objectives: string[]; instructions: string;
  /** Teoría. */
  opener: Opener | null;
  sections: DocSection[];
  /** Presentación: every lesson's slides, ordered by lesson. */
  slides: Slide[];
  /** Presentación, teoría and práctica. */
  lessons: Lesson[];
  /** Every image the document uses. */
  images: ImageRef[];
  /** Teoría: key ideas. Lectura sencilla: `glossary`. */
  summary: string[]; glossary: Term[];
  /** Subject family (matematicas, sociales…): colours and labels. */
  family: string;
  /** Content language («es» except Idiomas). */
  language: string;
  meta: Record<string, unknown>;
}

/** An element the teacher edits, rewrites or removes. */
export type Element = Block | Slide;

export const isSlide = (el: Element): el is Slide => 'archetype' in el;

// ── Slot table (GET /content/archetypes) ─────────────────────────────────────
export type ArchetypeGroup = 'empezar' | 'explicar' | 'comprobar' | 'practicar' | 'cerrar';
/** How «Editar texto» shows a slot: one line per element for lists, with the line syntax of its kind. */
export type SlotKind = 'text' | 'lines' | 'choice' | 'items' | 'steps' | 'columns' | 'number';
export interface SlotField {
  slot: string; label: string; kind: SlotKind; required?: boolean;
  /** Word and character caps (over them: a warning, not a refusal). */
  words?: number; chars?: number;
  /** List bounds the renderer needs (outside them: a refusal). */
  min?: number; max?: number;
  /** `choice`: the slot whose values it picks from. */
  from?: string;
}
export interface ArchetypeInfo {
  label: string; group: ArchetypeGroup;
  /** False for slides the writer never makes (correccion, creditos, enlace); «Añadir diapositiva» offers enlace only as
   *  «Enlace de la unidad». */
  writer: boolean;
  fields: SlotField[];
}
/** How the class answers at once («Ajustes de la clase»): the task slides' instruction follows it. */
export type ResponseMode = 'cuaderno' | 'mini_pizarra' | 'tarjetas' | 'mano_alzada';
export interface Archetypes {
  archetypes: Record<Archetype, ArchetypeInfo>;
  lesson_kinds: {
    labels: Record<LessonKind, string>;
    /** Labels a family names differently (lengua: «Comentario de texto» for fuentes). */
    labels_by_family: Record<string, Partial<Record<LessonKind, string>>>;
    /** family → stage → number of lessons → kinds. */
    defaults: Record<string, Record<string, Record<string, LessonKind[]>>>;
  };
  response_modes: Record<ResponseMode, string>;
  /** The labels of the notes fields in «Editar texto» («Di», «Pregunta»…). */
  notes_fields: Record<keyof SlideNotes, string>;
}

const KINDS: ContentKind[] = ['teoria', 'practica', 'presentacion', 'resumen', 'lectura_facil'];

/** Stored content in the document format (a material whose content could not be converted is shown read-only). */
export function isContentDoc(c: unknown): c is ContentDoc {
  const d = c as Partial<ContentDoc> | null;
  return !!d && KINDS.includes(d.kind as ContentKind) && Array.isArray(d.sections) && Array.isArray(d.slides)
    && Array.isArray(d.lessons);
}

/** One name for each level, the same in the app, the PDF, the solucionario and the rubric. */
export const LEVEL_LABEL: Record<Level, string> = { refuerzo: 'Refuerzo', basico: 'Básica', avanzado: 'Ampliación' };
