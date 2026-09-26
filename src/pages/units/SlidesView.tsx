import type { ContentDoc, Element } from '../../api/content';
import { WarningCircle } from '@phosphor-icons/react';
import { Callout, RichText } from '../../ui';
import { ElementMenu, Rewriting, type ElementAction } from './ElementMenu';
import { CoverSlide, SlideFace, slideKey } from './SlideFace';

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

/** The presentation as 16:9 cards, numbered like the PDF (the cover is 1). */
export default function SlidesView({ doc, kicker, figures, showNotes, editing, busy, onAction, noAI }: Props) {
  return (
    <div className="slides">
      <figure className="slide-card"><CoverSlide title={doc.title} kicker={kicker} n={1} /></figure>
      {doc.slides.map((s, i) => {
        const isBusy = busy.has(s.id);
        const key = slideKey(s);
        return (
          <figure key={s.id} data-element={s.id} className={`slide-card element${editing ? ' element--editing' : ''}${isBusy ? ' element--busy' : ''}`}>
            <SlideFace slide={s} figure={figures[s.id]} n={i + 2} />
            {s.figure && !figures[s.id] && (
              <Callout tone="warn" icon={<WarningCircle size={20} />}>
                La figura de esta diapositiva no se ha podido dibujar y no sale al proyectar. Edítala o reescríbela con IA.
              </Callout>
            )}
            {editing && !isBusy && <div className="element__menu"><ElementMenu el={s} doc={doc} onAction={onAction} noAI={noAI} /></div>}
            {isBusy && <Rewriting />}
            {showNotes && (s.notes || key.length > 0) && (
              <figcaption className="slide-card__notes">
                {s.notes && <RichText as="p" text={s.notes} />}
                {key.map((k, j) => <RichText key={j} as="p" className="slide-card__key" text={k} />)}
              </figcaption>
            )}
          </figure>
        );
      })}
    </div>
  );
}
