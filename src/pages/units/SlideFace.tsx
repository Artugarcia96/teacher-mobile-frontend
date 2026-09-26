import { ImageSquare } from '@phosphor-icons/react';
import type { CSSProperties } from 'react';
import type { Slide } from '../../api/content';
import { Figure, svgAspect } from '../../features/materials/Figure';
import { RichText } from '../../ui';
import './Slides.css';

const LETTERS = 'ABCDEFGH';

/** Text beyond what a slide holds at full size shrinks it (never below 60 %), as the PDF and the .pptx do. */
function fit(slide: Slide, room: number): number {
  const q = slide.question;
  const chars = [slide.subtitle, ...slide.bullets, slide.left?.bullets.join(' ') ?? '', slide.right?.bullets.join(' ') ?? '',
    slide.example?.statement ?? '', ...(slide.example?.steps ?? []), slide.example?.result ?? '', q?.prompt ?? '', ...(q?.options ?? [])]
    .join(' ').replace(/\$[^$]*\$/g, 'xxxx').length;
  return Math.max(0.6, Math.min(1, Math.sqrt(room / Math.max(1, chars))));
}

/** Cover of a presentation: class, title (the PDF's first slide). */
export function CoverSlide({ title, kicker, n }: { title: string; kicker: string; n?: number }) {
  return (
    <div className="slide slide--cover">
      <div className="slide__kicker">{kicker}</div>
      <div className="slide__big"><RichText text={title} /></div>
      <i className="slide__rule" />
      {n != null && <span className="slide__n num">{n}</span>}
    </div>
  );
}

/** One slide of a ContentDoc drawn from its layout, at any size (sizes in container units). `projected`: what the class
 *  sees, without the teacher's reminder of a picture to insert (it stays on the card and in the notes). */
export function SlideFace({ slide: s, figure, n, projected = false }: { slide: Slide; figure?: string; n?: number; projected?: boolean }) {
  const image = projected ? null : s.image;
  const text = s.bullets.length > 0 || !!(s.subtitle || s.left || s.example || s.question || image);
  // A wide drawing (a timeline, a long table) goes under the text at full width; a compact one beside it.
  const layout = !figure || !text ? '' : svgAspect(figure) > 1.9 ? ' slide__body--stack' : ' slide__body--split';
  const style = { '--fit': fit(s, layout ? 240 : 420) } as CSSProperties;
  if (s.layout === 'section') {
    return (
      <div className="slide slide--section">
        <div className="slide__big"><RichText text={s.title} /></div>
        <i className="slide__rule" />
        {s.subtitle && <div className="slide__subtitle"><RichText text={s.subtitle} /></div>}
        {n != null && <span className="slide__n num">{n}</span>}
      </div>
    );
  }
  const solvedHook = s.layout === 'summary' && s.bullets.length === 1;
  return (
    <div className={`slide slide--${s.layout}`} style={style}>
      <div className="slide__title"><RichText text={s.title} /></div>
      <i className="slide__rule" />
      <div className={`slide__body${layout}`}>
        {text && <div className="slide__main">
          {s.subtitle && <div className="slide__subtitle"><RichText text={s.subtitle} /></div>}
          {s.layout === 'practice' && <div className="slide__kicker">Resuelve en tu cuaderno</div>}
          {solvedHook
            ? <div className="slide__answer"><RichText text={s.bullets[0]} /></div>
            : s.bullets.length > 0 && (
              s.layout === 'practice'
                ? <ol type="a" className="slide__items">{s.bullets.map((b, i) => <li key={i}><RichText text={b} /></li>)}</ol>
                : s.layout === 'summary'
                  ? <ol className="slide__numbered">{s.bullets.map((b, i) => <li key={i}><RichText text={b} /></li>)}</ol>
                  : <ul className="slide__bullets">{s.bullets.map((b, i) => <li key={i}><RichText text={b} /></li>)}</ul>
            )}
          {s.left && s.right && (
            <div className="slide__columns">
              {[s.left, s.right].map((c, i) => (
                <div key={i}>
                  <div className="slide__heading"><RichText text={c.heading} /></div>
                  <ul className="slide__bullets">{c.bullets.map((b, j) => <li key={j}><RichText text={b} /></li>)}</ul>
                </div>
              ))}
            </div>
          )}
          {s.example && (
            <>
              <div className="slide__statement"><span className="slide__tag">Ejemplo</span><RichText text={s.example.statement} /></div>
              <ol className="slide__numbered">{s.example.steps.map((st, i) => <li key={i}><RichText text={st} /></li>)}</ol>
              {s.example.result && <div className="slide__result"><span className="slide__tag">Resultado</span><RichText text={s.example.result} /></div>}
            </>
          )}
          {s.question && (
            <>
              <div className="slide__prompt"><RichText text={s.question.prompt} /></div>
              {s.question.options.length > 0 && (
                <div className="slide__options">
                  {s.question.options.map((o, i) => <div key={i} className="slide__option"><b>{LETTERS[i]}</b><RichText text={o} /></div>)}
                </div>
              )}
            </>
          )}
          {image && (
            <div className="slide__image"><ImageSquare size={20} /><span>Imagen sugerida: {image.description}</span></div>
          )}
        </div>}
        {figure && <div className="slide__figure"><Figure svg={figure} caption={s.caption} fill /></div>}
      </div>
      {n != null && <span className="slide__n num">{n}</span>}
    </div>
  );
}

/** What the teacher says and the expected answers (speaker notes, answers of questions and practice). */
export function slideKey(s: Slide): string[] {
  const out: string[] = [];
  if (s.question?.answer) out.push(`Respuesta: ${s.question.answer}${s.question.explanation ? `. ${s.question.explanation}` : ''}`);
  if (s.answers.length) out.push(`Soluciones: ${s.answers.map((a, i) => `${'abcdefgh'[i]}) ${a}`).join(' · ')}`);
  if (s.image?.search) out.push(`Buscar la imagen: «${s.image.search}»`);
  return out;
}
