/** Wording for scanned pages and the flags the backend puts on papers (app/services/papers.py). */
import type { LoosePage, PaperFlag, ScanPage } from '../../api/papers';

/** Flags that need the teacher to look; the others (orden, reverso_escrito, pagina_deducida…) only explain. */
const ATTENTION = new Set(['falta_pagina', 'pagina_duplicada', 'extra_sin_nombre', 'pagina_dudosa', 'nombre_distinto', 'nombre_repetido']);
/** Possibly incomplete or mixed: the AI does not suggest a grade until the teacher fixes it or marks it OK. */
const NO_AUTO_GRADE = new Set(['falta_pagina', 'pagina_duplicada', 'pagina_dudosa', 'nombre_distinto', 'nombre_repetido']);

export const needsLook = (flags: PaperFlag[]) => flags.some((f) => ATTENTION.has(f.code));
export const isAttention = (f: PaperFlag) => ATTENTION.has(f.code);
export const heldFromAI = (flags: PaperFlag[]) => flags.some((f) => NO_AUTO_GRADE.has(f.code));

/** Short tag on a thumbnail: "1", "2", "1 rev.", "extra" ("" for blank backs and other documents). */
export function pageTag(p: ScanPage): string {
  if (p.back) return p.page_number ? `${p.page_number} rev.` : 'rev.';
  if (p.kind === 'extra_sheet') return 'extra';
  if (p.kind !== 'exam_page') return '';
  return p.page_number ? String(p.page_number) : '?';
}

export function pageCaption(p: ScanPage): string {
  if (p.back) return 'Reverso escrito';
  if (p.kind === 'extra_sheet') return p.questions.length ? `Hoja extra · ej. ${p.questions.join(', ')}` : 'Hoja extra';
  if (p.kind === 'blank') return p.maybe_written ? 'Reverso casi en blanco' : 'Reverso en blanco';
  if (p.kind === 'other') return 'Otro documento';
  if (p.page_number) return p.total_pages ? `Pág. ${p.page_number} de ${p.total_pages}` : `Pág. ${p.page_number}`;
  return 'Página';
}

const pagesText = (ps: number[]) =>
  ps.length > 1 ? `págs. ${ps.slice(0, -1).join(', ')} y ${ps[ps.length - 1]}` : `pág. ${ps[0]}`;

export function flagLabel(f: PaperFlag): string {
  const one = f.pages.length <= 1;
  switch (f.code) {
    case 'falta_pagina': return `${one ? 'Falta' : 'Faltan'} ${pagesText(f.pages)}`;
    case 'pagina_duplicada': return `${one ? 'Pág.' : 'Págs.'} ${f.pages.join(', ')} ${one ? 'repetida' : 'repetidas'}`;
    case 'extra_sin_nombre': return 'Hoja extra sin nombre';
    case 'pagina_dudosa': return f.pages.length ? `Revisa la ${pagesText(f.pages)}` : 'Revisa las páginas';
    case 'nombre_distinto': return f.pages.length ? `Otro nombre en la ${pagesText(f.pages)}` : 'El nombre no coincide';
    case 'nombre_repetido': return 'Mismo nombre en otra hoja';
    case 'orden': return 'Reordenada';
    case 'reverso_escrito': return 'Reverso escrito';
    case 'pagina_deducida': return f.pages.length ? `Nº de ${pagesText(f.pages)} deducido` : 'Nº de página deducido';
    case 'pagina_nueva_tras_nota': return 'Páginas nuevas tras la nota';
    default: return 'Revisar';
  }
}

export const extrasLabel = (n: number) => (n === 1 ? '+1 hoja extra' : `+${n} hojas extra`);

/** Why a page is in "Páginas por colocar". */
export function looseTitle(p: LoosePage): string {
  switch (p.reason) {
    case 'otro_examen': return p.other_exam ? `Del examen «${p.other_exam.title}» · ${p.other_exam.course}` : 'De otro examen';
    case 'otro': return 'Otro documento';
    case 'sin_examen': return p.page_number ? `Pág. ${p.page_number} sin el resto del examen` : 'Página sin el resto del examen';
    case 'extra_sin_examen':
      if (p.back) return 'Reverso escrito sin su página';
      return p.written_name ? `Hoja extra de «${p.written_name}»` : 'Hoja extra sin nombre';
    case 'sin_leer': return 'No se ha podido leer';
    default: return pageCaption(p);
  }
}

export const shortName = (s: { first_name: string; last_name: string }) => `${s.first_name} ${s.last_name.split(' ')[0]}`.trim();
