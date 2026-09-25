import type { Block, ExampleBlock, ExerciseBlock } from '../../api/content';
import { LEVEL_LABEL } from '../../api/content';
import { Figure } from '../../features/materials/Figure';
import { formatNumber } from '../../lib/format';
import { RichText } from '../../ui';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const NOTE: Record<string, string> = { ojo: 'Ojo', sabias: '¿Sabías que…?', consejo: 'Consejo' };
const pts = (p: number) => `${formatNumber(p, 2)} ${p === 1 ? 'punto' : 'puntos'}`;

/** A stable shuffle for what the student sees in a different order (relacionar, ordenar): never the right order. */
export function scramble(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return n > 1 && order.every((v, i) => v === i) ? [...order.slice(1), order[0]] : order;
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
      return <Figure svg={figures[b.id]} caption={b.caption} />;
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
      {figure && <Figure svg={figure} />}
      {b.steps.length > 0 && (b.format === 'pasos'
        ? <ol className="dblock__steps">{b.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ol>
        : <ul className="dblock__list">{b.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ul>)}
      {b.result && <p className="panel__result"><span>Resultado</span> <RichText text={b.result} /></p>}
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
    const order = scramble(b.pairs.length, b.statement);
    body = (
      <div className="ex__match">
        <ol>{b.pairs.map((p, i) => <li key={i}><RichText text={p[0]} /></li>)}</ol>
        <ol type="a">{order.map((k) => <li key={k}><RichText text={b.pairs[k][1]} /></li>)}</ol>
      </div>
    );
    key = <ul className="dblock__list">{b.pairs.map((p, i) => <li key={i}><RichText text={p[0]} /> → <RichText text={p[1]} /></li>)}</ul>;
  } else if (t === 'ordenar' && b.items.length) {
    const order = scramble(b.items.length, b.statement);
    body = <ol type="a" className="ex__items">{order.map((k) => <li key={k}><RichText text={b.items[k]} /></li>)}</ol>;
    key = <ol className="dblock__list">{b.items.map((it, i) => <li key={i}><RichText text={it} /></li>)}</ol>;
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
  const hasKey = !!(key || b.answer || (!answers.length && b.item_answers.length) || b.steps.length || solved);
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
        {figure && <Figure svg={figure} />}
        {body}
        {solutions && hasKey && (
          <div className="solution">
            <div className="solution__label">Solución</div>
            {key}
            {b.answer && <RichText as="p" text={b.answer} />}
            {!answers.length && b.item_answers.map((a, i) => <p key={i}><b>{LETTERS[i]})</b> <RichText text={a} /></p>)}
            {b.steps.length > 0 && <ol className="dblock__steps">{b.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ol>}
            {solved && <Figure svg={solved} />}
          </div>
        )}
      </div>
    </div>
  );
}
