import type { ContentDoc, Element } from '../../api/content';
import { WarningCircle } from '@phosphor-icons/react';
import { Callout, RichText } from '../../ui';
import { ElementMenu, Rewriting, type ElementAction } from './ElementMenu';
import { SlideFace, slideNotes } from './SlideFace';

interface Props {
  doc: ContentDoc;
  /** «Física y Química · 3.º ESO A»: the cover's kicker. */
  kicker: string;
  figures: Record<string, string>;
  /** Speaker notes and answers under each slide. */
  showNotes: boolean;
  editing: boolean;
  busy: Set<string>;
  onAction: (action: ElementAction, el: Element) => void;
  noAI: string | null;
}

/** The presentation as 16:9 cards, lesson by lesson, numbered like the PDF (backup slides carry no number). */
export default function SlidesView({ doc, kicker, figures, showNotes, editing, busy, onAction, noAI }: Props) {
  return (
    <>
      {doc.lessons.map((lesson) => {
        let n = 0;
        return (
          <section key={lesson.n} className="slides-lesson" aria-label={`Sesión ${lesson.n}`}>
            {doc.lessons.length > 1 && <h2 className="slides-lesson__title">Sesión {lesson.n} · <RichText text={lesson.title} /></h2>}
            <div className="slides">
              {doc.slides.filter((s) => s.lesson === lesson.n).map((s) => {
                const isBusy = busy.has(s.id);
                const notes = slideNotes(s);
                return (
                  <figure key={s.id} data-element={s.id} className={`slide-card element${editing ? ' element--editing' : ''}${isBusy ? ' element--busy' : ''}`}>
                    <SlideFace slide={s} figure={figures[s.id]} n={s.hidden ? undefined : ++n} kicker={kicker} />
                    {s.figure && !figures[s.id] && (
                      <Callout tone="warn" icon={<WarningCircle size={20} />}>
                        La figura de esta diapositiva no se ha podido dibujar y no sale al proyectar. Edítala o reescríbela con IA.
                      </Callout>
                    )}
                    {editing && !isBusy && <div className="element__menu"><ElementMenu el={s} doc={doc} onAction={onAction} noAI={noAI} /></div>}
                    {isBusy && <Rewriting />}
                    {showNotes && notes.length > 0 && (
                      <figcaption className="slide-card__notes">
                        {notes.map((line, j) => <RichText key={j} as="p" text={line} />)}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
