/** Wording for scanned pages and the flags the backend puts on papers (app/services/papers.py). */
import type { LoosePage, PaperFlag, ScanPage } from '../../api/papers';

/** Flags that need the teacher to look; the others ("orden") are only informative. */
const ATTENTION = new Set(['falta_pagina', 'pagina_duplicada', 'extra_sin_nombre', 'pagina_dudosa', 'nombre_distinto']);

export const needsLook = (flags: PaperFlag[]) => flags.some((f) => ATTENTION.has(f.code));
export const isAttention = (f: PaperFlag) => ATTENTION.has(f.code);

/** Short tag on a thumbnail: "1", "2", "extra" ("" for blank backs and other documents). */
export function pageTag(p: ScanPage): string {
  if (p.kind === 'extra_sheet') return 'extra';
  if (p.kind !== 'exam_page') return '';
  return p.page_number ? String(p.page_number) : '?';
}

export function pageCaption(p: ScanPage): string {
  if (p.kind === 'extra_sheet') return p.questions.length ? `Hoja extra · ej. ${p.questions.join(', ')}` : 'Hoja extra';
  if (p.kind === 'blank') return 'Reverso en blanco';
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
    case 'nombre_distinto': return 'Otro nombre en una página';
    case 'orden': return 'Reordenada';
    default: return 'Revisar';
  }
}

export const extrasLabel = (n: number) => (n === 1 ? '+1 hoja extra' : `+${n} hojas extra`);

/** Why a page is in "Páginas por colocar". */
export function looseTitle(p: LoosePage): string {
  switch (p.reason) {
    case 'otro_examen': return p.exam_code ? `De otro examen (${p.exam_code})` : 'De otro examen';
    case 'otro': return 'Otro documento';
    case 'sin_examen': return p.page_number ? `Pág. ${p.page_number} sin el resto del examen` : 'Página sin el resto del examen';
    case 'extra_sin_examen': return p.written_name ? `Hoja extra de «${p.written_name}»` : 'Hoja extra sin nombre';
    case 'sin_leer': return 'No se ha podido leer';
    default: return pageCaption(p);
  }
}

export const shortName = (s: { first_name: string; last_name: string }) => `${s.first_name} ${s.last_name.split(' ')[0]}`.trim();
