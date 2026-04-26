import type { AnyDiagram } from '../components/diagrams/types';

export type SlideLayout = 'cover' | 'section' | 'content' | 'closing';

export type CalloutVariant = 'info' | 'tip' | 'example' | 'warning' | 'key' | 'note';

export type Block =
  | { kind: 'heading';   text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets';   items: string[] }
  | { kind: 'quote';     text: string; author?: string }
  | { kind: 'stat';      value: string; label: string; tone?: 'accent' | 'primary' | 'success' | 'warning' | 'danger' }
  | { kind: 'callout';   variant: CalloutVariant; title?: string; text: string }
  | { kind: 'cards';     items: Array<{ title: string; text: string; tone?: 'accent' | 'primary' | 'success' | 'warning' | 'danger' | 'muted' }> }
  | { kind: 'diagram';   diagram: AnyDiagram }
  // Bloques nuevos para enseñanza profunda:
  | { kind: 'equation';  latex: string; display?: boolean; caption?: string }
  | { kind: 'codeBlock'; language: string; code: string; caption?: string }
  | { kind: 'table';     columns: string[]; rows: string[][]; highlightedRow?: number; caption?: string }
  | { kind: 'mermaid';   code: string; caption?: string };

export type BlockKind = Block['kind'];

/** Variante visual concreta dentro del layout 'content'. La emite el backend
 *  como metadata y la usa el frontend para elegir un patrón visual distinto
 *  (split text+visual, stat hero, quote hero, etc.). Si está ausente se
 *  renderiza el patrón genérico (vertical stack). */
export type LayoutTemplate =
  | 'hero_centered'
  | 'section_divider'
  | 'closing_reflection'
  | 'title_stack'
  | 'split_text_visual'
  | 'full_bleed_diagram'
  | 'stat_spotlight'
  | 'quote_spotlight'
  | 'cards_row'
  | 'comparison_duo'
  | 'numbered_list'
  | 'equation_spotlight'
  | 'theorem_proof'
  | 'code_walkthrough'
  | 'data_table';

export interface Slide {
  id: string;
  layout: SlideLayout;
  layout_template?: LayoutTemplate;
  title?: string;
  subtitle?: string;
  blocks: Block[];
}

export type ThemeId = 'minimal' | 'academic' | 'playful';

export interface PresentationTheme {
  id: ThemeId;
}

export interface Presentation {
  id: string;
  title: string;
  subject_name?: string;
  education_level?: string;
  class_id?: string;
  class_ids: string[];
  subject_id?: string;
  theme: PresentationTheme;
  slides: Slide[];
  status: 'generating' | 'ready' | 'failed';
  refinement_prompt?: string;
  created_at: string;
  updated_at: string;
}

export interface PresentationListItem {
  id: string;
  title: string;
  subject_name?: string;
  class_id?: string;
  class_ids: string[];
  class_name?: string;
  slide_count: number;
  theme_id?: string;
  status: string;
  updated_at: string;
}

export interface MaterialListItem {
  type: 'presentation' | 'textbook';
  id: string;
  title: string;
  subject_id?: string;
  subject_name?: string;
  class_ids: string[];
  class_names: string[];
  status: string;
  updated_at: string;
  slide_count?: number;
  theme_id?: string;
  target_pages?: number;
  has_pdf?: boolean;
}
