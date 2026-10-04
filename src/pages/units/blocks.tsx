import { WarningCircle } from '@phosphor-icons/react';
import type { Block, ExerciseBlock, FigureBlock, FigureSpec, Item, NoteBlock, NoteTone, SourceBlock, WorkedBlock } from '../../api/content';
import { LEVEL_LABEL } from '../../api/content';
import type { DocImage, SourceText } from '../../api/units';
import { Figure } from '../../features/materials/Figure';
import { formatNumber } from '../../lib/format';
import { Aside, Callout, RichText } from '../../ui';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const NOTE: Record<NoteTone, string> = { error: 'Error frecuente', remember: 'Recuerda', fact: 'Dato', how: '¿Cómo lo sabemos?' };
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
  /** The task numbers it prints (an exercise: one; apuntes: each question of «Ahora tú», a case or a document). */
  numbers?: number[];
  /** «Fig. N» of a figure or photo of apuntes. */
  figure?: number;
  figures: Record<string, string>;
  /** Apuntes: their photos and library texts. */
  images?: Record<string, DocImage>;
  sources?: Record<string, SourceText>;
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

/** A margin block of apuntes (a gloss, a note, a small figure or photo): beside its paragraph on a wide screen, under
 *  it on a phone (`Aside`). */
export const isMargin = (b: Block) => 'place' in b && b.place === 'margin';

/** One block of a ContentDoc on paper, as the PDF prints it (in the app, solutions only on request). */
export function BlockView(props: BlockViewProps) {
  const { block: b, numbers = [], figure = 0, figures, images = {}, sources = {}, solutions, levels } = props;
  switch (b.type) {
    case 'text':
      return <div className="dblock__text">{b.text.split(/\n{2,}/).map((p, i) => <RichText key={i} as="p" text={p} />)}</div>;
    case 'definition':
      if (b.place === 'margin') return <Aside><p><b className="dblock__term"><RichText text={b.term} />.</b> <RichText text={b.text} /></p></Aside>;
      return <div className="panel panel--definition"><p><strong><RichText text={b.term} />.</strong> <RichText text={b.text} /></p></div>;
    case 'worked':
      return <Worked b={b} figure={figures[b.id]} />;
    case 'note':
      return b.place === 'margin' ? <Aside><Note b={b} /></Aside> : <div className={`panel panel--${b.tone}`}><Note b={b} /></div>;
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
    case 'figure': {
      if (b.figure.type === 'scheme') {
        return <div className="dblock__scheme"><div className="dblock__label">Esquema</div><DocFigure spec={b.figure} svg={figures[b.id]} /></div>;
      }
      const drawn = <DocFigure spec={b.figure} svg={figures[b.id]} caption={figure ? `Fig. ${figure}. ${figureCaption(b)}` : figureCaption(b)} />;
      return b.place === 'margin' ? <Aside>{drawn}</Aside> : drawn;
    }
    case 'image': {
      const img = images[b.image_id];
      if (!img) return null;
      const photo = (
        <figure className="dimage">
          <img src={img.url} alt={img.alt} loading="lazy" />
          <figcaption className="fig__caption">
            <span>{figure > 0 && <b className="dimage__n">Fig. {figure}. </b>}<RichText text={b.caption} /></span>
            <a className="dimage__credit" href={img.page_url} target="_blank" rel="noreferrer">{img.credit}</a>
          </figcaption>
        </figure>
      );
      return b.place === 'margin' ? <Aside>{photo}</Aside> : photo;
    }
    case 'your_turn':
      return (
        <div className="dblock__turn">
          <div className="dblock__label">Ahora tú</div>
          <Questions items={b.items} numbers={numbers} solutions={solutions} />
        </div>
      );
    case 'case':
      return (
        <div className="dblock__case">
          <div className="dblock__label">Caso{b.title && <> · <RichText text={b.title} /></>}</div>
          <RichText as="p" text={b.text} />
          <Questions items={b.questions} numbers={numbers} solutions={solutions} />
        </div>
      );
    case 'source':
      return <Source b={b} text={sources[b.source_id]} numbers={numbers} solutions={solutions} />;
    case 'essentials':
      return (
        <div className="dblock__essentials">
          <div className="dblock__label">Lo esencial</div>
          <ul className="dblock__list">{b.items.map((x, i) => <li key={i}><RichText text={x} /></li>)}</ul>
        </div>
      );
    case 'exercise':
      return <Exercise b={b} number={numbers[0] ?? 0} figure={figures[b.id]} solved={figures[`${b.id}:solucion`]} solutions={solutions} levels={levels} />;
    default:
      return null;
  }
}

/** A note with its run-in label; an error shows the wrong and the right form. */
function Note({ b }: { b: NoteBlock }) {
  const label = b.title || NOTE[b.tone];
  return (
    <>
      <p><b className={`note__label note__label--${b.tone}`}>{/[.?!]$/.test(label) ? label : `${label}.`}</b> <RichText text={b.text} /></p>
      {(b.wrong || b.right) && (
        <p className="note__fix">{b.wrong && <><s><RichText text={b.wrong} /></s>{' → '}</>}{b.right && <RichText text={b.right} />}</p>
      )}
      {b.check && <RichText as="p" text={b.check} />}
      {b.source && <p className="note__source"><RichText text={b.source} /></p>}
    </>
  );
}

/** «Doc. N»: a text of the library as it is stored (verse never reflowed) with its reference and its questions. */
function Source({ b, text, numbers, solutions }: {
  b: SourceBlock; text: SourceText | undefined; numbers: number[]; solutions: boolean;
}) {
  return (
    <div className="dblock__source">
      <div className="dblock__label">Documento</div>
      {text && (
        <blockquote className="source">
          {text.form === 'prosa'
            ? text.text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)
            : <div className="source__verse">{text.lines.map((l, i) => (l.text
              ? <div key={i}>{l.speaker && <span className="source__speaker">{l.speaker}: </span>}{l.text}</div>
              : <div key={i} className="source__break" aria-hidden />))}</div>}
          <footer className="source__ref">{text.reference}</footer>
        </blockquote>
      )}
      <Questions items={b.questions} numbers={numbers} solutions={solutions} />
    </div>
  );
}

/** Questions with their short answers (shown only with the solutions); numbered in the task series when they have
 *  numbers, lettered otherwise. */
function Questions({ items, numbers, solutions }: { items: Item[]; numbers: number[]; solutions: boolean }) {
  if (!items.length) return null;
  const numbered = numbers.length === items.length;
  return (
    <ol type="a" className={numbered ? 'dblock__tasks' : 'ex__items'}>
      {items.map((it, i) => (
        <li key={i} value={numbered ? numbers[i] : undefined}>
          {numbered && <span className="dblock__task num">{numbers[i]}</span>}
          <div>
            <RichText text={it.text} />
            {solutions && it.answer && <div className="solution solution--inline"><RichText text={it.answer} /></div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Worked({ b, figure }: { b: WorkedBlock; figure?: string }) {
  const title = b.title.replace(/^ejemplo\s*\d*\s*[:.·-]?\s*/i, '');
  const columns = b.steps.some((s) => s.show.trim());
  const cut = b.steps.length - b.fade;
  return (
    <div className="dblock__worked">
      <div className="dblock__label">Ejemplo resuelto{title && <span className="dblock__worked-title"> · <RichText text={title} /></span>}</div>
      <RichText as="p" text={b.statement} />
      <DocFigure spec={b.figure} svg={figure} />
      {b.steps.length > 0 && (
        <ol className={columns ? 'worked__steps worked__steps--columns' : 'worked__steps'}>
          {b.steps.map((s, i) => (
            <li key={i}>
              <span className="worked__n num">{i + 1}</span>
              {s.say && <RichText as="div" className="worked__say" text={s.say} />}
              {columns && (i < cut ? <RichText as="div" className="worked__show" text={s.show} /> : <div className="worked__show worked__blank" aria-label="Termina tú" />)}
            </li>
          ))}
        </ol>
      )}
      {b.fade > 0 && <div className="dblock__label">Termina tú</div>}
      {b.close && <p className="panel__result"><span className="panel__result-label">Resultado</span> <RichText text={b.close} /></p>}
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
