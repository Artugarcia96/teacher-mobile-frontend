import type { ContentDoc, DocSection, Element } from '../../api/content';
import { LEVEL_LABEL } from '../../api/content';
import { RichText } from '../../ui';
import { BlockView } from './blocks';
import { ElementMenu, Rewriting, type ElementAction } from './ElementMenu';

interface Props {
  doc: ContentDoc;
  figures: Record<string, string>;
  solutions: boolean;
  /** Edit mode: every block has its menu (edit, figure, AI rewrite, remove). */
  editing: boolean;
  /** Blocks the AI is rewriting now. */
  busy: Set<string>;
  onAction: (action: ElementAction, el: Element) => void;
  noAI: string | null;
}

/** Apuntes, ficha, resumen or lectura fácil on paper, in the order and with the labels of the PDF. */
export default function DocView({ doc, figures, solutions, editing, busy, onAction, noAI }: Props) {
  let n = 0;
  let numbered = 0;
  let session: number | null = null;
  const teoria = doc.kind === 'teoria';
  const activities = teoria ? doc.sections.find((s) => s.id === 'actividades') : undefined;
  const main = doc.sections.filter((s) => s !== activities);

  const section = (sec: DocSection) => {
    const newSession = sec.session != null && sec.session !== session ? sec.session : null;
    if (newSession != null) session = newSession;
    const levels = new Set(sec.blocks.flatMap((b) => (b.type === 'exercise' ? [b.level] : [])));
    const number = teoria && sec !== activities ? ++numbered : 0;
    return (
      <section key={sec.id} className="doc__section">
        {newSession != null && <div className="doc__session">Sesión {newSession}</div>}
        <h2>
          {number > 0 && <span className="doc__n num">{number}</span>}
          <RichText text={sec.title || (sec.level ? LEVEL_LABEL[sec.level] : '')} />
        </h2>
        {sec.blocks.map((b) => {
          const num = b.type === 'exercise' ? ++n : 0;
          const isBusy = busy.has(b.id);
          return (
            <div key={b.id} className={`element${editing ? ' element--editing' : ''}${isBusy ? ' element--busy' : ''}`}>
              <BlockView block={b} number={num} figures={figures} solutions={solutions} levels={levels.size > 1} />
              {editing && !isBusy && <div className="element__menu"><ElementMenu el={b} doc={doc} onAction={onAction} noAI={noAI} /></div>}
              {isBusy && <Rewriting />}
            </div>
          );
        })}
      </section>
    );
  };

  return (
    <article className={`doc doc--${doc.kind}`}>
      {doc.intro && (doc.kind === 'resumen'
        ? <div className="panel panel--example"><div className="panel__label">Idea clave</div><RichText as="p" text={doc.intro} /></div>
        : <RichText as="p" className={teoria ? 'doc__intro' : undefined} text={doc.intro} />)}
      {doc.instructions && <RichText as="p" className="doc__instructions" text={doc.instructions} />}
      {teoria && doc.objectives.length > 0 && (
        <div className="doc__objectives">
          <div className="doc__label">Al terminar esta unidad…</div>
          <ul>{doc.objectives.map((o, i) => <li key={i}><RichText text={o} /></li>)}</ul>
        </div>
      )}
      {doc.sessions.length > 0 && (
        <div className="panel panel--example">
          <div className="panel__label">Plan de sesiones</div>
          <ul className="dblock__list">{doc.sessions.map((x, i) => <li key={i}><RichText text={x} /></li>)}</ul>
        </div>
      )}
      {main.map(section)}
      {doc.summary.length > 0 && (
        <section className="doc__section">
          <h2>Resumen</h2>
          <ul className="dblock__list">{doc.summary.map((x, i) => <li key={i}><RichText text={x} /></li>)}</ul>
        </section>
      )}
      {activities && activities.blocks.length > 0 && section(activities)}
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
