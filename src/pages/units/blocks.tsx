import { WarningCircle } from '@phosphor-icons/react';
import type { Block, ExampleBlock, ExerciseBlock, FigureBlock, FigureSpec } from '../../api/content';
import { LEVEL_LABEL } from '../../api/content';
import { Figure } from '../../features/materials/Figure';
import { formatNumber } from '../../lib/format';
import { Callout, RichText } from '../../ui';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const NOTE: Record<string, string> = { ojo: 'Ojo', sabias: '¿Sabías que…?', consejo: 'Consejo' };
const pts = (p: number) => `${formatNumber(p, 2)} ${p === 1 ? 'punto' : 'puntos'}`;

/** The printed order of a matching's right column or of the elements to order (stored in the document by the
 *  server, so the app, the PDF and the solucionario give the same letters). */
function shownOrder(b: ExerciseBlock, n: number): number[] {
  const s = b.shown ?? [];
  return s.length === n && [...s].sort((x, y) => x - y).every((v, i) => v === i) ? s : Array.from({ length: n }, (_, i) => i);
}

/** The letter each element has on paper (index in the stored order → its printed letter). */
function letters(order: number[]): string[] {
  const out: string[] = [];
  order.forEach((orig, pos) => { out[orig] = LETTERS[pos]; });
  return out;
}

export interface BlockViewProps {
  block: Block;
  /** Number of an exercise in the document (1, 2…). */
  number?: number;
  figures: Record<string, string>;
  solutions: boolean;
  /** Show the level of each exercise (apuntes: activities of mixed levels). */
  levels?: boolean;
}

/** A figure of the document: its drawing, or a warning when the server could not draw it (the PDF leaves it out). */
export function DocFigure({ spec, svg, caption }: { spec: FigureSpec | null | undefined; svg: string | undefined; caption?: string }) {
  if (!spec) return null;
  if (!svg) {
    return (
      <Callout tone="warn" icon={<WarningCircle size={20} />}>
        Esta figura no se ha podido dibujar y no sale en el PDF. Edítala o reescríbela con IA.
      </Callout>
    );
  }
  return <Figure svg={svg} caption={caption} />;
}

/** The caption of a figure block as the PDF prints it: its own, else the one or the title of its figure. */
export function figureCaption(b: FigureBlock): string {
  const f = b.figure as { caption?: unknown; title?: unknown };
  return b.caption || (typeof f.caption === 'string' ? f.caption : '') || (typeof f.title === 'string' ? f.title : '');
}

/** One block of a ContentDoc on paper, as the PDF prints it (in the app, solutions only on request). */
export function BlockView({ block: b, number = 0, figures, solutions, levels }: BlockViewProps) {
  switch (b.type) {
    case 'text':
      return <div className="dblock__text">{b.text.split(/\n{2,}/).map((p, i) => <RichText key={i} as="p" text={p} />)}</div>;
    case 'definition':
      return <div className="panel panel--definition"><div className="panel__label">Definición</div><p><strong><RichText text={b.term} />.</strong> <RichText text={b.text} /></p></div>;
    case 'example':
      return <Example b={b} figure={figures[b.id]} />;
    case 'note':
      return <div className={`panel panel--${b.tone}`}><div className="panel__label">{NOTE[b.tone] ?? 'Nota'}</div><RichText as="p" text={b.text} /></div>;
    case 'list': {
      const Tag = b.ordered ? 'ol' : 'ul';
      return (
        <div>
          {b.title && <div className="dblock__title"><RichText text={b.title} /></div>}
          <Tag className="dblock__list">{b.items.map((it, i) => <li key={i}><RichText text={it} /></li>)}</Tag>
        </div>
      );
    }
    case 'table':
      return (
        <figure className="dtable">
          <div className="dtable__scroll">
            <table>
              <thead><tr>{b.header.map((h, i) => <th key={i}><RichText text={h} /></th>)}</tr></thead>
              <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><RichText text={c} /></td>)}</tr>)}</tbody>
            </table>
          </div>
          {b.caption && <figcaption className="fig__caption"><RichText text={b.caption} /></figcaption>}
        </figure>
      );
    case 'figure':
      return <DocFigure spec={b.figure} svg={figures[b.id]} caption={figureCaption(b)} />;
    case 'check':
      return (
        <div className="panel panel--check">
          <div className="panel__label">Comprueba</div>
          <RichText as="p" text={b.question} />
          {solutions && <div className="solution"><RichText text={b.answer} /></div>}
        </div>
      );
    case 'exercise':
      return <Exercise b={b} number={number} figure={figures[b.id]} solved={figures[`${b.id}:solucion`]} solutions={solutions} levels={levels} />;
  }
}

function Example({ b, figure }: { b: ExampleBlock; figure?: string }) {
  const title = b.title.replace(/^ejemplo\s*\d*\s*[:.·-]?\s*/i, '');
  return (
    <div className="panel panel--example">
      <div className="panel__label">Ejemplo</div>
      {title && <div className="dblock__title"><RichText text={title} /></div>}
      <RichText as="p" text={b.statement} />
      <DocFigure spec={b.figure} svg={figure} />
      {b.steps.length > 0 && (b.format === 'pasos'
        ? <ol className="dblock__steps">{b.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ol>
        : <ul className="dblock__list">{b.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ul>)}
      {b.result && <p className="panel__result"><span className="panel__result-label">Resultado</span> <RichText text={b.result} /></p>}
    </div>
  );
}

function Exercise({ b, number, figure, solved, solutions, levels }: {
  b: ExerciseBlock; number: number; figure?: string; solved?: string; solutions: boolean; levels?: boolean;
}) {
  const t = b.item_type;
  const answers = b.item_answers.length === b.items.length ? b.item_answers : [];
  let body = null;
  let key = null;
  if (t === 'relacionar' && b.pairs.length) {
    const order = shownOrder(b, b.pairs.length);
    const at = letters(order);
    body = (
      <div className="ex__match">
        <ol>{b.pairs.map((p, i) => <li key={i}><RichText text={p[0]} /></li>)}</ol>
        <ol type="a">{order.map((k) => <li key={k}><RichText text={b.pairs[k][1]} /></li>)}</ol>
      </div>
    );
    key = <p><b>{b.pairs.map((_, i) => `${i + 1}-${at[i]}`).join(', ')}</b></p>;
  } else if (t === 'ordenar' && b.items.length) {
    const order = shownOrder(b, b.items.length);
    const at = letters(order);
    body = <ol type="a" className="ex__items">{order.map((k) => <li key={k}><RichText text={b.items[k]} /></li>)}</ol>;
    key = <p><b>{b.items.map((_, i) => at[i]).join(' → ')}</b></p>;
  } else if (b.items.length) {
    body = (
      <>
        {t === 'clasificar' && b.categories.length > 0 && <p className="ex__meta">Categorías: {b.categories.join(' · ')}</p>}
        <ol type="a" className="ex__items">
          {b.items.map((it, i) => (
            <li key={i}>
              <RichText text={it} />
              {t === 'verdadero_falso' && <span className="ex__vf" aria-hidden> V · F</span>}
              {solutions && answers[i] && <div className="solution solution--inline"><RichText text={answers[i]} /></div>}
            </li>
          ))}
        </ol>
        {b.options.length > 0 && <p className="ex__meta">Opciones: {b.options.join(' · ')}</p>}
      </>
    );
  } else if (b.options.length) {
    body = <ol type="a" className="ex__options">{b.options.map((o, i) => <li key={i}><RichText text={o} /></li>)}</ol>;
  }
  const hasKey = !!(key || b.answer || (!answers.length && b.item_answers.length) || b.steps.length || b.solution_figure);
  return (
    <div className="ex">
      <span className="ex__num num">{number}</span>
      <div className="ex__body">
        {(levels || b.points != null) && (
          <div className="ex__head">
            {levels && <span className="ex__level">{LEVEL_LABEL[b.level]}</span>}
            {b.points != null && <span className="ex__pts num">{pts(b.points)}</span>}
          </div>
        )}
        <RichText as="p" text={b.statement} />
        {b.passage && <blockquote className="ex__passage"><RichText text={b.passage} /></blockquote>}
        <DocFigure spec={b.figure} svg={figure} />
        {body}
        {solutions && hasKey && (
          <div className="solution">
            <div className="solution__label">Solución</div>
            {key}
            {b.answer && <RichText as="p" text={b.answer} />}
            {!answers.length && b.item_answers.map((a, i) => <p key={i}><b>{LETTERS[i]})</b> <RichText text={a} /></p>)}
            {b.steps.length > 0 && <ol className="dblock__steps">{b.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ol>}
            <DocFigure spec={b.solution_figure} svg={solved} />
          </div>
        )}
      </div>
    </div>
  );
}
