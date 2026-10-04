import type { Block, ContentDoc, DocSection, Opener } from '../../api/content';
import { docNumbers, LEVEL_LABEL } from '../../api/content';
import type { DocImage, SourceText } from '../../api/units';
import { RichText } from '../../ui';
import { BlockView, isMargin } from './blocks';
import { ElementMenu, Rewriting, type ElementAction } from './ElementMenu';

interface Props {
  doc: ContentDoc;
  figures: Record<string, string>;
  /** Apuntes: their photos and library texts. */
  images: Record<string, DocImage>;
  sources: Record<string, SourceText>;
  solutions: boolean;
  /** Edit mode: every block has its menu (edit, figure, AI rewrite, remove). */
  editing: boolean;
  /** Blocks the AI is rewriting now. */
  busy: Set<string>;
  onAction: (action: ElementAction, el: Block) => void;
  noAI: string | null;
}

export interface OutlineEntry { id: string; label: string; exercises: number[] }

/** A level of a ficha is named by its level, as the PDF prints it; any other section by its title. */
const sectionTitle = (sec: DocSection) => (sec.level ? LEVEL_LABEL[sec.level] : sec.title);

/** The numbers of the content sections of apuntes (1, 2…), as the PDF prints them; other sections have none. */
function sectionNumbers(doc: ContentDoc): Record<string, number> {
  let n = 0;
  return Object.fromEntries(doc.sections.flatMap((s) => (doc.kind === 'teoria' && s.role === 'content' ? [[s.id, ++n]] : [])));
}

/** The sections of the document with the numbers of their tasks (the desktop outline beside the material). */
export function docOutline(doc: ContentDoc): OutlineEntry[] {
  const { tasks } = docNumbers(doc);
  const numbered = sectionNumbers(doc);
  return doc.sections.map((sec) => ({
    id: sec.id, label: numbered[sec.id] ? `${numbered[sec.id]}. ${sectionTitle(sec)}` : sectionTitle(sec),
    exercises: sec.blocks.flatMap((b) => (b.type === 'exercise' ? tasks[b.id] ?? [] : [])),
  }));
}

/** How the document names an element: «Ejercicio 4» (numbered as printed), «Diapositiva 13» (in a deck of several
 *  lessons, «Sesión 2 · diapositiva 7»), «Ejemplo»… */
export function elementLabel(doc: ContentDoc, id: string, name: string): string {
  const slide = doc.slides.find((s) => s.id === id);
  if (slide) {
    const n = doc.slides.filter((s) => s.lesson === slide.lesson).indexOf(slide) + 1;
    return doc.lessons.length > 1 ? `Sesión ${slide.lesson} · diapositiva ${n}` : `Diapositiva ${n}`;
  }
  const block = doc.sections.flatMap((s) => s.blocks).find((b) => b.id === id);
  const n = docNumbers(doc).tasks[id];
  return block?.type === 'exercise' && n ? `Ejercicio ${n[0]}` : name;
}

/** The rows of a section of apuntes, as the PDF lays them out: each block of the reading column with the margin
 *  blocks that follow it (a margin block before any other waits for the next one). */
function rows(blocks: Block[]): { main: Block | null; side: Block[] }[] {
  const out: { main: Block | null; side: Block[] }[] = [];
  let waiting: Block[] = [];
  for (const b of blocks) {
    if (isMargin(b)) {
      if (out.length) out[out.length - 1].side.push(b); else waiting.push(b);
    } else {
      out.push({ main: b, side: waiting });
      waiting = [];
    }
  }
  if (waiting.length) out.push({ main: null, side: waiting });
  return out;
}

/** Apuntes, ficha, resumen or lectura sencilla on paper, in the order and with the labels and numbers of the PDF.
 *  Apuntes keep their margin column: beside the text on a wide screen, under each paragraph on a phone. */
export default function DocView({ doc, figures, images, sources, solutions, editing, busy, onAction, noAI }: Props) {
  const { tasks, figures: figureNumbers } = docNumbers(doc);
  const numbered = sectionNumbers(doc);
  const apuntes = doc.kind === 'teoria';
  let lesson: number | null = null;

  const element = (b: Block, levels: boolean) => {
    const nums = tasks[b.id] ?? [];
    const isBusy = busy.has(b.id);
    return (
      <div key={b.id} id={b.type === 'exercise' && nums.length ? `ex-${nums[0]}` : undefined} data-element={b.id}
        className={`element${editing ? ' element--editing' : ''}${isBusy ? ' element--busy' : ''}`}>
        <BlockView block={b} numbers={nums} figure={figureNumbers[b.id]} figures={figures} images={images} sources={sources}
          solutions={solutions} levels={levels} />
        {editing && !isBusy && <div className="element__menu"><ElementMenu el={b} doc={doc} onAction={onAction} noAI={noAI} /></div>}
        {isBusy && <Rewriting />}
      </div>
    );
  };

  const section = (sec: DocSection) => {
    const newLesson = sec.lesson != null && sec.lesson !== lesson ? sec.lesson : null;
    if (newLesson != null) lesson = newLesson;
    const levels = new Set(sec.blocks.flatMap((b) => (b.type === 'exercise' ? [b.level] : []))).size > 1;
    const n = numbered[sec.id];
    return (
      <section key={sec.id} id={`sec-${sec.id}`} className={`doc__section${apuntes ? ` doc__section--${sec.role}` : ''}`}>
        {newLesson != null && doc.lessons.length > 1 && <div className="doc__session">Sesión {newLesson}</div>}
        <h2>
          {n > 0 && <span className="doc__n num">{n}</span>}
          <RichText text={sectionTitle(sec)} />
        </h2>
        {apuntes && sec.role === 'activities' && (
          <p className="doc__legend">Dificultad: ●○○ refuerzo · ●●○ básica · ●●● ampliación. Hazlas en tu cuaderno.</p>
        )}
        {apuntes && sec.role !== 'activities'
          ? rows(sec.blocks).map((r, i) => (
            <div key={r.main?.id ?? `side-${i}`} className={r.side.length ? 'doc__row doc__row--side' : 'doc__row'}>
              <div className="doc__main">{r.main && element(r.main, levels)}</div>
              {r.side.length > 0 && <div className="doc__side">{r.side.map((b) => element(b, levels))}</div>}
            </div>
          ))
          : sec.blocks.map((b) => element(b, levels))}
      </section>
    );
  };

  return (
    <article className={`doc doc--${doc.kind}`}>
      {doc.intro && (doc.kind === 'resumen'
        ? <div className="panel panel--example"><div className="panel__label">Idea clave</div><RichText as="p" text={doc.intro} /></div>
        : <RichText as="p" className={apuntes ? 'doc__intro' : undefined} text={doc.intro} />)}
      {doc.instructions && <RichText as="p" className="doc__instructions" text={doc.instructions} />}
      {doc.opener && <OpenerView opener={doc.opener} image={images[doc.opener.image_id]} />}
      {doc.sections.map(section)}
      {doc.glossary.length > 0 && (
        <section className="doc__section">
          <h2>Palabras importantes</h2>
          <dl className="doc__glossary">
            {doc.glossary.map((g, i) => <div key={i}><dt><RichText text={g.term} /></dt><dd><RichText text={g.definition} /></dd></div>)}
          </dl>
        </section>
      )}
    </article>
  );
}

/** The first page of apuntes: its photo, the case that opens the unit, its question and what it teaches. */
function OpenerView({ opener: o, image }: { opener: Opener; image?: DocImage }) {
  const lists = [
    { label: 'Contenidos', items: o.know },
    { label: 'Procedimientos', items: o.can_do },
  ].filter((l) => l.items.length > 0);
  return (
    <header className="opener">
      {image && (
        <figure className="opener__photo">
          <img src={image.url} alt={image.alt} />
          <figcaption><a href={image.page_url} target="_blank" rel="noreferrer">{image.credit}</a></figcaption>
        </figure>
      )}
      {o.hook && <RichText as="p" className="opener__hook" text={o.hook} />}
      {o.question && (
        <div className="opener__question">
          <div className="dblock__label">Pregunta de la unidad</div>
          <RichText as="p" text={o.question} />
        </div>
      )}
      {lists.length > 0 && (
        <div className="opener__lists">
          {lists.map((l) => (
            <div key={l.label}>
              <div className="dblock__label">{l.label}</div>
              <ul>{l.items.map((x, i) => <li key={i}><RichText text={x} /></li>)}</ul>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}
