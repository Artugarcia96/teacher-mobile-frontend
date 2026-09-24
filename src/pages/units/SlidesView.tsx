import type { SlideDeck } from '../../api/units';
import { RichText } from '../../ui';

/** 16:9 slide cards (same content as the .pptx) with optional speaker notes under each one. */
export default function SlidesView({ deck, label, showNotes }: { deck: SlideDeck; label: string; showNotes: boolean }) {
  const subtitle = deck.subtitle && !label.toLowerCase().startsWith(deck.subtitle.split(' · ')[0].toLowerCase()) ? deck.subtitle : '';
  return (
    <div className="slides">
      <figure className="slide-fig">
        <div className="slide slide--title">
          <div className="slide__kicker">{label}</div>
          <div className="slide__big"><RichText text={deck.title} /></div>
          <i className="slide__rule" />
          {subtitle && <div className="slide__subtitle">{subtitle}</div>}
        </div>
      </figure>
      {deck.slides.map((s, i) => {
        const chars = s.bullets.join(' ').length + s.example.length;
        return (
          <figure key={i} className="slide-fig">
            <div className={`slide${chars > 220 ? ' slide--dense' : ''}`}>
              <div className="slide__title"><RichText text={s.title} /></div>
              <i className="slide__rule" />
              {s.bullets.length > 0 && (
                <ul className="slide__bullets">{s.bullets.map((b, j) => <li key={j}><RichText text={b} /></li>)}</ul>
              )}
              {s.example && <div className="slide__example"><b>Resolución</b> <RichText text={s.example} /></div>}
              <span className="slide__n num">{i + 1}</span>
            </div>
            {showNotes && s.notes && <figcaption className="slide-notes">{s.notes}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}
