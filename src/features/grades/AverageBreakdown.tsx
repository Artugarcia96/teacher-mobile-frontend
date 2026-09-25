import type { Gradebook, GradebookActivity, GradebookRow, GradeCell } from '../../api/gradebook';
import { useToday } from '../../lib/auth';
import { formatAverage, formatNumber } from '../../lib/format';
import { Grade, List, Row } from '../../ui';
import './average-breakdown.css';

const RULE_TEXT: Record<Gradebook['recovery_rule'], string> = {
  replace_if_higher: 'la recuperación sustituye si es mayor',
  cap_5: 'la recuperación deja como máximo un 5',
  average: 'media de la evaluación y la recuperación',
};

/** Why a grade of the term does not count, in the teacher's words; null = it counts (or it is not there yet). */
function leftOut(a: GradebookActivity, cell: GradeCell | undefined, today: string): string | null {
  if (a.counts_for === 'recovery') return null; // explained in its own line
  if (cell?.status === 'suggested') return 'borrador IA';
  if (cell?.status === 'pending_absent') return 'faltó, pendiente';
  if (cell?.status === 'absent') return 'NP';
  if (cell?.status === 'exempt') return 'exento';
  if (a.counts_for === 'none') return cell?.status === 'confirmed' ? 'no cuenta' : null;
  if ((!cell || cell.status === 'empty') && a.date < today) return 'sin nota';
  return null;
}

/** How a student's average is built (Cuaderno › media, Evaluación › «Cómo se calcula»): category averages with the
 *  backend's two decimals, a formula that adds up to the average shown, and the grades left out by name.
 *  Only formats what the gradebook sends: nothing is recalculated here. */
export default function AverageBreakdown({ row, data }: { row: GradebookRow; data: Gradebook }) {
  const today = useToday();
  const final = data.term === 4;
  const { categories } = data;
  const used = categories.filter((c) => row.categories[c.key] != null && (final || c.weight > 0));
  const totalW = used.reduce((a, c) => a + c.weight, 0);
  const base = row.recovery ? row.recovery.before : row.average;
  // the backend's two decimals, always shown ("4,50"), so the formula reads as a calculation
  const two = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2).replace('.', ','));
  const formula = final
    ? `(${used.map((c) => two(row.categories[c.key])).join(' + ')}) / ${used.length}`
    : `(${used.map((c) => `${two(row.categories[c.key])} × ${formatNumber(c.weight, 0)}`).join(' + ')}) / ${formatNumber(totalW, 0)}`;
  const out = data.activities
    .map((a) => ({ a, why: leftOut(a, row.grades[a.id], today) }))
    .filter((x): x is { a: GradebookActivity; why: string } => !!x.why)
    .reverse(); // oldest first, like the notebook on paper

  return (
    <div className="avg-breakdown">
      <List>
        {categories.map((c) => (
          <Row key={c.key} title={c.label} sub={final ? undefined : `Pesa un ${formatNumber(c.weight, 0)} %`}
            muted={row.categories[c.key] == null}
            trail={row.categories[c.key] == null ? <span className="faint">Sin notas</span> : <span className="num">{two(row.categories[c.key])}</span>} />
        ))}
      </List>
      {used.length > 0 ? (
        <p className="avg-breakdown__note">
          <span className="num">{formula} = {two(base)} → <Grade value={base} /></span>
          {!final && used.length < categories.length && <> · Las categorías sin notas no cuentan: su peso se reparte entre las demás.</>}
          {final && <> · Media de las evaluaciones con nota.</>}
        </p>
      ) : <p className="muted">Todavía no hay notas que cuenten.</p>}
      {row.recovery && (
        <p className="avg-breakdown__note">
          Recuperación: {formatAverage(row.recovery.score)} → la media pasa de {formatAverage(row.recovery.before)} a {formatAverage(row.average)} ({RULE_TEXT[data.recovery_rule]}).
        </p>
      )}
      {out.length > 0 && (
        <div className="avg-breakdown__note">
          <b>No cuentan</b>
          <ul className="avg-breakdown__out">
            {out.map(({ a, why }) => <li key={a.id}>{a.title}: {why}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
