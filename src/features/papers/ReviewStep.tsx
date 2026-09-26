import { CaretDown, CaretUp, DotsThree, ListChecks, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAcceptAll, type Correction, type CorrectionStudent, type FrequentError } from '../../api/papers';
import { useUnits } from '../../api/units';
import type { Job, StudentRef } from '../../api/types';
import { formatNumber, formatPercent, formatScore, listed, plural, shortDate } from '../../lib/format';
import { AIBadge, Button, Callout, Chip, Grade, GradePill, IconButton, List, Menu, RichText, Row, Section, Stats, useFeedback } from '../../ui';
import { unitFor } from '../units/unitFor';
import { JobLine } from './JobLine';
import { MissingPapersRow } from './MissingPapers';
import { needsLook } from './pageLabels';
import { FROM_ACTIVITY } from './reviewLink';

interface Props {
  correction: Correction;
  job: Job | undefined;
  running: boolean;
  onOpenCollect: () => void;
  /** Who is missing from the pile: NP or a repeat exam (ExamAbsencesSheet). */
  onOpenMissing: () => void;
  /** Units the exam is linked to: «Crear ficha de refuerzo» creates it in the first (else the one its title names). */
  unitIds: string[];
}

const toConfirm = (s: CorrectionStudent) => !!s.paper_id && s.match_status === 'suggested';

const isFinal = (s: CorrectionStudent) => ['confirmed', 'absent', 'exempt'].includes(s.grade?.status ?? '');

/** Questions nobody has scored yet («Sin corregir»), by their label: "P2", "P1 y P3". */
const unscoredOf = (s: CorrectionStudent, label: (id: string) => string) => listed((s.grade?.unscored ?? []).map((id) => `P${label(id)}`));

/** Confirmed with a question at 0 that nobody scored: to look at again. */
const toRecheck = (s: CorrectionStudent) => s.grade?.status === 'confirmed' && s.grade.unscored.length > 0;

/** What is left for this student, in words (nothing once the grade is final, unless a question counted 0 without
 * anyone scoring it). A student who missed the exam: their repeat exam, or «Faltó» (NP or a repeat, in the sheet).
 * While the AI is grading, a paper without its suggestion yet says nothing. */
function statusLine(s: CorrectionStudent, grading: boolean, label: (id: string) => string) {
  const g = s.grade?.status;
  if (toRecheck(s)) return <Chip tone="warn">{unscoredOf(s, label)} contó 0 sin corregir</Chip>;
  if (isFinal(s)) return g === 'exempt' ? 'Exento' : undefined;
  if (s.missed?.repeat_id) return s.missed.repeat_grade ? 'Nota de la repesca' : `Repesca el ${shortDate(s.missed.repeat_date!)}`;
  if (s.missed) return <Chip tone="warn">Faltó</Chip>;
  if (toConfirm(s)) return <Chip tone="warn">Nombre por confirmar</Chip>;
  if (needsLook(s.flags)) return <Chip tone="warn">Revisa las páginas</Chip>;
  if (g === 'suggested') return s.grade!.unscored.length ? <Chip tone="warn">{unscoredOf(s, label)} sin corregir</Chip> : undefined;
  if (s.paper_id) return grading ? undefined : 'Sin sugerencia de la IA';
  return 'Sin hoja';
}

/** Validated grades as a pill (a repeat exam's too); the AI's unreviewed suggestion in grey. */
function Score({ s, max }: { s: CorrectionStudent; max: number }) {
  const g = s.grade ?? (s.missed?.repeat_grade || null);
  if (g?.status === 'confirmed') return <GradePill value={g.score} max={max} />;
  if (g?.status === 'absent') return <span className="muted">NP</span>;
  if (g?.status === 'suggested') return <span className="faint num draft-score">{formatScore(g.ai_score ?? g.score)}</span>;
  return <span className="faint">—</span>;
}

/** Papers left out of the per-question table: other questions (adapted versions) or a Modelo B that no longer
 * matches Modelo A. */
function excludedNote(stats: Correction['stats']): string | null {
  const parts = [
    stats.excluded_adapted && `${stats.excluded_adapted === 1 ? '1 examen adaptado no cuenta' : `${stats.excluded_adapted} exámenes adaptados no cuentan`} en esta tabla: sus preguntas son otras.`,
    stats.excluded_modelo && `${stats.excluded_modelo === 1 ? '1 examen del modelo B no cuenta' : `${stats.excluded_modelo} exámenes del modelo B no cuentan`}: sus preguntas ya no coinciden con las del modelo A.`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** "P5 · Operaciones combinadas" */
const questionName = (e: FrequentError) => `P${e.label} · ${e.title}`;
const labels = (errors: FrequentError[]) => {
  const ps = errors.map((e) => `P${e.label}`);
  return ps.length > 1 ? `${ps.slice(0, -1).join(', ')} y ${ps[ps.length - 1]}` : ps[0];
};

const NAME_TO_CONFIRM = 'con el nombre por confirmar';
const TO_SCORE = 'con preguntas sin corregir';

/** Secondary actions of the review step (section header ⋯). Suggestions whose paper's name is still to confirm, or
 * with a question the AI did not score, stay out. */
export function ReviewMenu({ correction }: { correction: Correction }) {
  const { activity, students } = correction;
  const acceptAll = useAcceptAll(activity.id, activity.course.id);
  const { toast, confirm } = useFeedback();
  const drafts = students.filter((s) => s.grade?.status === 'suggested');
  const held = drafts.filter(toConfirm).length;
  const unscored = drafts.filter((s) => !toConfirm(s) && s.grade!.unscored.length > 0).length;
  const ready = drafts.length - held - unscored;
  if (!drafts.length) return null;
  const out = [held && `${plural(held, 'hoja', 'hojas')} ${NAME_TO_CONFIRM}`, unscored && `${plural(unscored, 'hoja', 'hojas')} ${TO_SCORE}`]
    .filter((x): x is string => !!x);
  const left = (n: number, why: string) => `${n === 1 ? 'queda 1 hoja' : `quedan ${n} hojas`} ${why}`;

  const onAcceptAll = async () => {
    if (!ready) {
      toast(held ? `Confirma antes ${plural(held, 'nombre', 'nombres')}: son hojas ${NAME_TO_CONFIRM}.`
        : 'Puntúa antes las preguntas sin corregir, alumno a alumno.', { tone: 'error' });
      return;
    }
    if (!(await confirm({
      title: `Aceptar ${plural(ready, 'sugerencia', 'sugerencias')}`,
      text: `Las notas de la IA pasan al cuaderno tal cual. Podrás cambiarlas después alumno a alumno.${out.length ? ` Quedan fuera ${listed(out)}.` : ''}`,
      confirm: 'Aceptar todas',
    }))) return;
    acceptAll.mutate(undefined, {
      onSuccess: ({ count, skipped, unscored: open }) => {
        const rest = [skipped && left(skipped, NAME_TO_CONFIRM), open && left(open, TO_SCORE)].filter(Boolean);
        toast([`${plural(count, 'nota pasada', 'notas pasadas')} al cuaderno`, ...rest].join(' · '));
      },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  return (
    <Menu trigger={(o) => <IconButton label="Más acciones" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
      items={[{ label: 'Aceptar todas las sugerencias', icon: <ListChecks size={18} />, onSelect: onAcceptAll }]} />
  );
}

/** Step 3 — figures, frequent errors and the class list (AI drafts vs validated grades); each row opens the focus review. */
export function ReviewStep({ correction, job, running, onOpenCollect, onOpenMissing, unitIds }: Props) {
  const { activity, stats, students, unmatched } = correction;
  const units = useUnits(activity.course.id).data;
  const [shownError, setShownError] = useState<string | null>(null);
  const drafts = students.filter((s) => s.grade?.status === 'suggested').length;
  const byId = new Map(students.map((s) => [s.student.id, s.student]));
  const short = (s: StudentRef) => `${s.first_name} ${s.last_name.split(' ')[0]}`.trim();
  const who = (ids: string[]) => ids.map((id) => byId.get(id)).filter((s) => !!s).map((s) => short(s!)).join(', ');
  const base = `/clases/${activity.course.id}/actividades/${activity.id}`;
  const itemLabels = new Map((correction.rubric?.items ?? []).map((it) => [it.id, it.label || it.id]));
  const label = (id: string) => itemLabels.get(id) ?? id;
  const recheck = students.filter(toRecheck);
  const errors = stats.frequent_errors;
  const excluded = excludedNote(stats);
  const unitId = units ? unitFor(units, activity.title, unitIds) : unitIds[0] ?? null;
  const worksheet = errors.length
    ? (unitId
      ? `/clases/${activity.course.id}/unidades/${unitId}?crear=ficha&indicaciones=${encodeURIComponent(
        `Refuerzo de lo que peor salió en «${activity.title}»: ${errors.map((e) => e.title).join('; ')}.`)}`
      : `/clases/${activity.course.id}/programacion`)
    : null;

  return (
    <>
      {running && <JobLine job={job} fallback="Corrigiendo…" />}
      <MissingPapersRow correction={correction} onOpen={onOpenMissing} />
      {recheck.length > 0 && (
        <Callout tone="warn" icon={<Warning size={18} />}>
          <span>
            {recheck.length === 1 ? 'Una nota ya aceptada contó 0 en una pregunta' : `${recheck.length} notas ya aceptadas contaron 0 en preguntas`}{' '}
            que la IA no corrigió. Revisa:{' '}
            {recheck.map((s, i) => (
              <span key={s.student.id}>{i > 0 && (i === recheck.length - 1 ? ' y ' : ', ')}
                <Link className="link-btn" to={`${base}/revisar?alumno=${s.student.id}`} state={FROM_ACTIVITY}>{short(s.student)} ({unscoredOf(s, label)})</Link>
              </span>
            ))}
          </span>
        </Callout>
      )}
      {unmatched.length > 0 && (
        <Callout tone="warn" icon={<Warning size={18} />}>
          <span>{unmatched.length === 1 ? 'Hay 1 hoja sin identificar.' : `Hay ${unmatched.length} hojas sin identificar.`} </span>
          <button type="button" className="link-btn" onClick={onOpenCollect}>Emparejar</button>
        </Callout>
      )}

      {stats.average != null && (
        <div className="review-stats">
          <Stats items={[
            { label: 'Media', value: <Grade value={stats.average} max={activity.max_score} average /> },
            { label: 'Aprobados', value: formatPercent(stats.pass_rate) },
            { label: 'Revisados', value: <span className="num">{stats.confirmed}<small className="stat-of"> / {stats.matched || students.length}</small></span> },
          ]} />
          {stats.provisional > 0 && (
            <p className="review-stats__note">Provisional: incluye {plural(stats.provisional, 'nota sin revisar', 'notas sin revisar')}</p>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <Section title="Errores frecuentes"
          footer={worksheet && <Button variant="tinted" size="sm" to={worksheet}>Crear ficha de refuerzo con {labels(errors)}</Button>}>
          <List>
            {errors.map((e) => {
              const open = shownError === e.item_id;
              const base = `${formatNumber(e.avg_points, 1)} de ${formatNumber(e.points, 2)} de media · ${e.below_half} por debajo de la mitad`;
              return (
                <Row key={e.item_id} title={<RichText className="error-text" text={questionName(e)} />} wrapSub
                  sub={open && e.below_half_ids.length ? <>{base}<span className="error-who">{who(e.below_half_ids)}</span></> : base}
                  onClick={e.below_half ? () => setShownError(open ? null : e.item_id) : undefined} aria-expanded={open}
                  chevron={false} trail={e.below_half ? (open ? <CaretUp size={16} /> : <CaretDown size={16} />) : undefined} />
              );
            })}
          </List>
          {excluded && <p className="review-stats__note">{excluded}</p>}
        </Section>
      )}

      <Section title={`Clase · ${students.length}`}>
        {drafts > 0 && (
          <p className="drafts-line"><AIBadge label={plural(drafts, 'borrador de la IA', 'borradores de la IA')} />
            <span>en gris, hasta que los revises</span></p>
        )}
        <List>
          {students.map((s) => {
            const repeat = !isFinal(s) && s.missed?.repeat_id; // their grade is in the repeat exam
            const missed = !isFinal(s) && s.missed && !repeat; // NP or a repeat: the sheet
            return (
              <Row key={s.student.id} title={s.student.sort_name} wrapSub sub={statusLine(s, running, label)}
                to={repeat ? `/clases/${activity.course.id}/actividades/${repeat}` : missed ? undefined : `${base}/revisar?alumno=${s.student.id}`}
                state={repeat ? undefined : FROM_ACTIVITY} onClick={missed ? onOpenMissing : undefined}
                trail={<Score s={s} max={activity.max_score} />} />
            );
          })}
        </List>
      </Section>
    </>
  );
}
