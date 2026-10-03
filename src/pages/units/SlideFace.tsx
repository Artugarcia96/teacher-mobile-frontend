import type { CSSProperties } from 'react';
import type { Archetype, Slide, SlideNotes } from '../../api/content';
import { Figure, svgAspect } from '../../features/materials/Figure';
import { RichText } from '../../ui';
import './Slides.css';

const LETTERS = 'ABCDEFGH';
/** Task slides carry no headline of their own: their label. */
const TASK: Partial<Record<Archetype, string>> = {
  para_empezar: 'Para empezar', tu_turno: 'Ahora tú', piensa_comparte: 'Piensa y comparte', clasifica: 'Clasifica',
  practica: 'Práctica', correccion: 'Corrección', ticket_salida: 'Ticket de salida',
};
const PROBLEM: Archetype[] = ['ejemplo_resuelto', 'tu_turno', 'error_comun'];

/** Text beyond what a slide holds at full size shrinks it (never below 60 %). */
function fit(s: Slide, room: number): number {
  const chars = [s.text, s.aside, s.yes, s.no, ...s.items.map((i) => `${i.term} ${i.text}`),
    ...s.columns.flatMap((c) => [c.heading, ...c.cells]), ...s.steps.map((st) => `${st.show} ${st.say}`), ...s.options]
    .join(' ').replace(/\$[^$]*\$/g, 'xxxx').length;
  return Math.max(0.6, Math.min(1, Math.sqrt(room / Math.max(1, chars))));
}

/** One slide of a ContentDoc drawn from its slots, at any size (sizes in container units), as the class sees it at its
 *  last click (answers stay in the notes). `kicker`: the class, on the cover. */
export function SlideFace({ slide: s, figure, n, kicker }: { slide: Slide; figure?: string; n?: number; kicker?: string }) {
  if (s.archetype === 'portada') {
    return (
      <div className="slide slide--cover">
        {kicker && <div className="slide__kicker">{kicker}</div>}
        <div className="slide__big"><RichText text={s.headline} /></div>
        <i className="slide__rule" />
        {n != null && <span className="slide__n num">{n}</span>}
      </div>
    );
  }
  const items = s.items.filter((i) => i.text || i.term);
  const text = !!(s.text || s.aside || s.number || s.term || items.length || s.columns.length || s.steps.length || s.options.length);
  // A wide drawing (a timeline, a long table) goes under the text at full width; a compact one beside it.
  const layout = !figure || !text ? '' : svgAspect(figure) > 1.9 ? ' slide__body--stack' : ' slide__body--split';
  const style = { '--fit': fit(s, layout ? 240 : 420) } as CSSProperties;
  return (
    <div className={`slide slide--${s.archetype}`} style={style}>
      <div className="slide__title"><RichText text={s.headline || TASK[s.archetype] || ''} /></div>
      <i className="slide__rule" />
      <div className={`slide__body${layout}`}>
        {text && <div className="slide__main">
          {s.number && <div className="slide__big"><RichText text={s.number} /></div>}
          {s.term && <div className="slide__heading"><RichText text={s.term} /></div>}
          {s.text && (PROBLEM.includes(s.archetype)
            ? <div className="slide__statement"><RichText text={s.text} /></div>
            : <div className="slide__subtitle"><RichText text={s.text} /></div>)}
          {items.length > 0 && (s.archetype === 'practica'
            ? <ol type="a" className="slide__items">{items.map((it, i) => <li key={i}><RichText text={it.text} /></li>)}</ol>
            : <ul className="slide__bullets">
              {items.map((it, i) => <li key={i}>{it.term && <b><RichText text={it.term} />: </b>}<RichText text={it.text} /></li>)}
            </ul>)}
          {s.columns.length > 0 && (
            <div className="slide__columns">
              {s.columns.map((c, i) => (
                <div key={i}>
                  <div className="slide__heading"><RichText text={c.heading} /></div>
                  {c.cells.length > 0 && <ul className="slide__bullets">{c.cells.map((x, j) => <li key={j}><RichText text={x} /></li>)}</ul>}
                </div>
              ))}
            </div>
          )}
          {s.steps.length > 0 && (
            <ol className="slide__numbered">
              {s.steps.map((st, i) => <li key={i}><RichText text={st.show || st.say} />{st.show && st.say && <> · <RichText text={st.say} /></>}</li>)}
            </ol>
          )}
          {s.options.length > 0 && (
            <div className="slide__options">
              {s.options.map((o, i) => <div key={i} className="slide__option"><b>{LETTERS[i]}</b><RichText text={o} /></div>)}
            </div>
          )}
          {s.yes && <div className="slide__subtitle">✓ Sí: <RichText text={s.yes} /></div>}
          {s.no && <div className="slide__subtitle">✗ No: <RichText text={s.no} /></div>}
          {s.aside && <div className="slide__subtitle"><RichText text={s.aside} /></div>}
        </div>}
        {figure && <div className="slide__figure"><Figure svg={figure} fill /></div>}
      </div>
      {n != null && <span className="slide__n num">{n}</span>}
    </div>
  );
}

const NOTES: [Exclude<keyof SlideNotes, 'clicks'>, string][] = [
  ['say', 'Di'], ['ask', 'Pregunta'], ['expected', 'Respuesta esperada'], ['misconception', 'Error frecuente'],
];
const NOTES_AFTER: [Exclude<keyof SlideNotes, 'clicks'>, string][] = [
  ['if_not', 'Si no lo entienden'], ['manage', 'Gestión'], ['source_note', 'Dato para ti'],
];

/** The teacher's notes of a slide, answers first: one line per field, in the order the PDF prints them. */
export function slideNotes(s: Slide): string[] {
  const out: string[] = [];
  if (s.answer) out.push(`Respuesta: ${s.answer}${s.explanation ? `. ${s.explanation}` : ''}`);
  const answers = s.items.flatMap((it, i) => (it.answer ? [`${'abcdefgh'[i]}) ${it.answer}`] : []));
  if (answers.length) out.push(`Respuestas: ${answers.join(' · ')}`);
  for (const [k, label] of NOTES) if (s.notes[k]) out.push(`${label}: ${s.notes[k]}`);
  s.notes.clicks.forEach((c, i) => out.push(`Clic ${i + 1}: ${c}`));
  for (const [k, label] of NOTES_AFTER) if (s.notes[k]) out.push(`${label}: ${s.notes[k]}`);
  return out;
}
