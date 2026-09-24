import type { AssessmentDoc } from '../../api/units';
import { formatNumber } from '../../lib/format';
import { RichText } from '../../ui';

const LETTERS = 'abcdefgh';
const pts = (p: number) => `${formatNumber(p, 2)} ${p === 1 ? 'pt' : 'pts'}`;

/** Ficha: numbered items with points; optional solutions (answer + steps). */
export default function WorksheetView({ doc, solutions }: { doc: AssessmentDoc; solutions: boolean }) {
  const many = doc.sections.length > 1;
  return (
    <article className="reading">
      {doc.instructions && <p className="reading__subtitle">{doc.instructions}</p>}
      {doc.sections.map((sec, si) => (
        <section key={si} className="reading__section">
          {many && <h2>{sec.title}</h2>}
          <ol className="ws-items">
            {sec.items.map((it) => (
              <li key={it.id} className="ws-item">
                <span className="nblock__num num">{it.label || it.id}</span>
                <div className="ws-item__body">
                  <div className="ws-item__head">
                    <RichText as="div" text={it.text} />
                    <span className="ws-item__pts num">{pts(it.points)}</span>
                  </div>
                  {it.options.length > 0 && (
                    <ul className="ws-item__options">
                      {it.options.map((o, i) => <li key={i}>{LETTERS[i]}) <RichText text={o} /></li>)}
                    </ul>
                  )}
                  {solutions && (
                    <div className="nblock__solution">
                      <div><b>Solución:</b> <RichText text={it.answer} /></div>
                      {it.steps.length > 0 && <ol className="ws-steps">{it.steps.map((s, i) => <li key={i}><RichText text={s} /></li>)}</ol>}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
