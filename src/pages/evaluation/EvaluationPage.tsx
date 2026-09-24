import { ArrowCounterClockwise, CalendarBlank, ChatCenteredText, Copy, DotsThree, FileCsv, FilePdf, ListChecks, Scales, Student, Table, Warning } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCourse, useJob } from '../../api/core';
import {
  distributionParts, evaluationKeys, finalRecoveryLabel, RECOVERY_RULES, useDraftComments, useEvaluation, useRunningCommentsJob,
  useSaveEvalRow, useSetRecoveryRule, type EvalRow, type Evaluation,
} from '../../api/evaluation';
import type { CourseDetail } from '../../api/types';
import NewActivitySheet from '../../features/activities/NewActivitySheet';
import { download } from '../../lib/api';
import { useAuth, useToday } from '../../lib/auth';
import { exportCsvLabel, formatAverage, formatPercent, formatProposal, longDate, plural, TERM_LABEL, TERM_SHORT } from '../../lib/format';
import {
  AIBadge, Button, Callout, Chip, Dot, EmptyState, Grade, GradePill, IconButton, List, Menu, Page, Progress, Row, Section, Segmented,
  Sheet, SkeletonList, useFeedback,
} from '../../ui';
import DepartmentReportSheet from '../inbox/DepartmentReportSheet';
import EvalStudentSheet from './EvalStudentSheet';
import './EvaluationPage.css';

/** Page titles in words: the display serif draws the ordinal "ª" as a large raised letter ("1. a"). */
const TITLE: Record<number, string> = { 1: 'Primera evaluación', 2: 'Segunda evaluación', 3: 'Tercera evaluación', 4: 'Evaluación final' };

/** When a term opens: its start date; the final opens with the 3rd term. Null = already open. */
function opensOn(terms: { n: number; start: string }[] | undefined, t: number, today: string): string | null {
  const start = terms?.find((x) => x.n === (t === 4 ? 3 : t))?.start;
  return start && start > today ? start : null;
}

/** Evaluación: notas propuestas, nota final ajustable, recuperaciones y comentario de boletín por alumno. */
export default function EvaluationPage() {
  const { courseId, term: termParam } = useParams();
  const term = termParam === 'final' ? 4 : Math.min(4, Math.max(1, Number(termParam) || 1));
  const navigate = useNavigate();
  const { me } = useAuth();
  const today = useToday();
  const course = useCourse(courseId);
  const closed = opensOn(me?.school_year.terms, term, today);
  // The comments job belongs to one term: its page (and only that one) follows it.
  const [job, setJob] = useState<{ id: string; term: number } | null>(null);
  const jobId = job?.term === term ? job.id : null;
  const setJobId = (id: string | null) => setJob(id ? { id, term } : null);
  const ev = useEvaluation(courseId, term, { live: !!jobId, enabled: !closed });
  const running = useRunningCommentsJob(courseId, term);
  useEffect(() => { if (running.data) setJob({ id: running.data.id, term }); }, [running.data, term]);
  const title = TITLE[term];

  // Terms that have not started are shown dimmed; tapping one says when it opens.
  const options = [1, 2, 3, 4].map((t) => {
    const opens = opensOn(me?.school_year.terms, t, today);
    return {
      value: t, label: TERM_SHORT[t], disabled: !!opens,
      reason: opens ? (t === 4 ? `La evaluación final se abre con la 3.ª evaluación, el ${longDate(opens)}` : `La ${TERM_LABEL[t]} empieza el ${longDate(opens)}`) : undefined,
    };
  });
  const pickTerm = (t: number) => navigate(`/clases/${courseId}/evaluacion/${t}`, { replace: true });

  const eyebrow = course.data && (
    <><Dot color={course.data.color} large /><span className="eyebrow">{course.data.label}</span></>
  );

  if (course.error) {
    return (
      <Page title={title} back="/clases" backLabel="Clases">
        <EmptyState icon={<Student size={24} />} title="No se ha encontrado la clase" action={<Button to="/clases">Ver clases</Button>} />
      </Page>
    );
  }

  const data = ev.data?.term === term ? ev.data : undefined;
  return (
    <Page title={title} eyebrow={eyebrow} back={`/clases/${courseId}/cuaderno?term=${term}`} backLabel="Cuaderno"
      actions={course.data && data && !closed && <EvalMenu course={course.data} data={data} />}
      toolbar={<div className="ev-toolbar"><Segmented label="Evaluación" value={term} options={options} onChange={pickTerm} /></div>}>
      {closed ? (
        <EmptyState icon={<CalendarBlank size={24} />}
          title={term === 4 ? 'La evaluación final aún no se ha abierto' : `La ${TERM_LABEL[term]} aún no ha empezado`}
          text={term === 4 ? `Se abre con la 3.ª evaluación, el ${longDate(closed)}.` : `Empieza el ${longDate(closed)}.`}
          action={<Button variant="tinted" to={`/clases/${courseId}/evaluacion/${me?.school_year.current_term ?? 1}`}>Ir a la evaluación actual</Button>} />
      ) : ev.error && !data ? (
        <Callout tone="warn">
          <b>No se ha podido cargar la evaluación.</b> {ev.error.message}{' '}
          <Button size="sm" variant="plain" onClick={() => ev.refetch()}>Reintentar</Button>
        </Callout>
      ) : !data || !course.data ? (
        <SkeletonList rows={8} />
      ) : !data.rows.length ? (
        <EmptyState icon={<Student size={24} />} title="Esta clase aún no tiene alumnos"
          action={<Button to={`/clases/${courseId}/alumnos`}>Añadir alumnos</Button>} />
      ) : (
        <EvaluationBody course={course.data} data={data} jobId={jobId} setJobId={setJobId} />
      )}
    </Page>
  );
}

function EvalMenu({ course, data }: { course: CourseDetail; data: Evaluation }) {
  const { toast } = useFeedback();
  const [rule, setRule] = useState(false);
  const [report, setReport] = useState(false);
  const copy = async () => {
    const withText = data.rows.filter((r) => r.comment);
    if (!withText.length) { toast('Todavía no hay comentarios que copiar', { tone: 'error' }); return; }
    try {
      await navigator.clipboard.writeText(withText.map((r) => `${r.student.sort_name}\n${r.comment}`).join('\n\n'));
      toast(`${plural(withText.length, 'comentario copiado', 'comentarios copiados')}`);
    } catch {
      toast('No se ha podido copiar. Exporta el CSV.', { tone: 'error' });
    }
  };
  return (
    <>
      <Menu
        trigger={(open) => <IconButton label="Más acciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>}
        items={[
          { label: 'Copiar todos los comentarios', icon: <Copy size={18} />, onSelect: copy },
          { label: 'Regla de las recuperaciones', icon: <Scales size={18} />, onSelect: () => setRule(true) },
          { label: 'Informe del departamento', icon: <Table size={18} />, onSelect: () => setReport(true) },
        ]}
      />
      <RecoveryRuleSheet open={rule} onClose={() => setRule(false)} course={course} value={data.recovery_rule} />
      <DepartmentReportSheet open={report} onClose={() => setReport(false)} initialTerm={data.term} />
    </>
  );
}

function RecoveryRuleSheet({ open, onClose, course, value }: { open: boolean; onClose: () => void; course: CourseDetail; value: Evaluation['recovery_rule'] }) {
  const { toast } = useFeedback();
  const save = useSetRecoveryRule(course.id);
  const pick = (v: Evaluation['recovery_rule']) => save.mutate(v, {
    onSuccess: () => { toast(`Regla guardada: ${RECOVERY_RULES.find((r) => r.value === v)?.label.toLowerCase()}`); onClose(); },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });
  return (
    <Sheet open={open} onClose={onClose} title="Regla de las recuperaciones" subtitle={`${course.label} · la acuerda el departamento`}>
      <div className="form">
        <List>
          {RECOVERY_RULES.map((r) => (
            <Row key={r.value} title={r.label} sub={r.hint} onClick={() => pick(r.value)} chevron={false}
              trail={r.value === value ? <Chip tone="accent">Actual</Chip> : undefined} />
          ))}
        </List>
        <p className="muted">La recuperación nunca baja la nota. Se aplica a todas las recuperaciones de la clase.</p>
      </div>
    </Sheet>
  );
}

function EvaluationBody({ course, data, jobId, setJobId }: {
  course: CourseDetail; data: Evaluation; jobId: string | null; setJobId: (id: string | null) => void;
}) {
  const { toast, confirm } = useFeedback();
  const { me } = useAuth();
  const qc = useQueryClient();
  const draft = useDraftComments(course.id, data.term);
  const [open, setOpen] = useState<number | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null);
  const job = useJob(jobId, {
    onDone: (j) => {
      setJobId(null);
      qc.invalidateQueries({ queryKey: evaluationKeys.one(course.id, data.term) });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      const n = Number(j.result?.updated ?? 0);
      const skipped = Number(j.result?.skipped ?? 0);
      const kept = skipped ? ` ${skipped === 1 ? '1 no se ha tocado porque lo editaste' : `${skipped} no se han tocado porque los editaste`} mientras tanto.` : '';
      toast(n ? `${plural(n, 'comentario redactado', 'comentarios redactados')}. Revísalos antes de darlos por buenos.${kept}`
        : `No se ha redactado ningún comentario.${kept}`);
    },
    onFail: (j) => { setJobId(null); toast(j.error || 'No se han podido redactar los comentarios.', { tone: 'error' }); },
  });

  const { stats, rows } = data;
  const missing = rows.filter((r) => !r.comment);
  const aiDrafts = rows.filter((r) => r.comment_source === 'ai' && r.comment_status === 'draft');
  const stale = rows.filter((r) => r.stale_adjustment);
  // A stale adjustment is not a fail: its recovery is already there, the teacher only has to use it.
  const failing = rows.filter((r) => r.final != null && r.final < 5 && !r.stale_adjustment);
  const running = !!jobId;
  const finalRec = finalRecoveryLabel(course.group.stage);
  const base = `/courses/${course.id}/evaluation/${data.term}`;
  const fileLabel = `${course.subject} ${course.group.name} ${data.term_label}`;

  const run = (targets: EvalRow[], replacing: boolean) => async () => {
    const ok = await confirm({
      title: replacing ? 'Redactar de nuevo los borradores' : `Redactar ${plural(targets.length, 'comentario', 'comentarios')} con IA`,
      text: `La IA redacta un borrador para ${plural(targets.length, 'alumno', 'alumnos')} con la nota que irá al boletín, las actividades de la evaluación, `
        + 'lo que peor les ha salido, la asistencia y tus observaciones. Solo recibe el nombre de pila.'
        + (replacing ? ' Se sustituirán los borradores anteriores de la IA; los que has escrito o marcado como definitivos no se tocan.' : ''),
      confirm: 'Redactar',
    });
    if (!ok) return;
    draft.mutate({ student_ids: targets.map((r) => r.student.id) }, {
      onSuccess: ({ job: j }) => setJobId(j.id),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const get = (kind: 'pdf' | 'csv') => {
    setDownloading(kind);
    const p = kind === 'pdf' ? download(`${base}/acta.pdf`, `Acta ${fileLabel}.pdf`) : download(`${base}.csv`, `Evaluacion ${fileLabel}.csv`);
    p.then(() => toast(kind === 'pdf' ? 'Acta descargada' : 'CSV descargado'))
      .catch((e: Error) => toast(e.message, { tone: 'error' }))
      .finally(() => setDownloading(null));
  };

  const kpis = stats.average == null ? ['Aún no hay notas en esta evaluación'] : [
    `Media ${formatAverage(stats.average)}`,
    `${formatPercent(stats.pass_rate)} aprobados`,
    ...distributionParts(stats.distribution, data.stage),
  ];

  return (
    <>
      <p className="ev-kpis num" aria-label="Resumen de la evaluación">
        {kpis.map((k, i) => <span key={i}>{i > 0 && ' · '}<span>{k}</span></span>)}
      </p>

      {data.to_review.length > 0 && (
        <Callout tone="accent">
          <b>Las propuestas aún no cuentan {plural(data.to_review.reduce((a, x) => a + x.count, 0), 'nota', 'notas')} de la IA sin revisar.</b>{' '}
          {data.to_review.map((x, i) => (
            <span key={x.activity_id}>{i > 0 && ' · '}
              <Button size="sm" variant="plain" to={`/clases/${course.id}/actividades/${x.activity_id}`}>Revisar {x.title} ({x.count})</Button>
            </span>
          ))}
        </Callout>
      )}

      {stale.length > 0 && <StaleAdjustments course={course} term={data.term} rows={stale} />}

      {running ? (
        <Callout tone="accent" icon={<ChatCenteredText size={20} />}>
          <div className="ev-job">
            <b>Redactando comentarios · {job?.progress ?? 0} de {job?.total ?? '…'}</b>
            <Progress value={job?.progress ?? 0} total={job?.total || 1} />
            <span className="ev-job__hint">Van apareciendo en la lista según se terminan. Puedes seguir trabajando.</span>
          </div>
        </Callout>
      ) : missing.length > 0 ? (
        <Button full icon={<ChatCenteredText size={18} />} onClick={run(missing, false)} loading={draft.isPending}>
          Redactar {plural(missing.length, 'comentario', 'comentarios')} con IA
        </Button>
      ) : null}

      <div className="ev-actions">
        {failing.length > 0 && (
          <Button size="sm" variant="tinted" icon={<ListChecks size={16} />} onClick={() => setRecovery(true)}>
            Crear recuperación ({failing.length})
          </Button>
        )}
        <Button size="sm" variant="neutral" icon={<FilePdf size={16} />} loading={downloading === 'pdf'} onClick={() => get('pdf')}>Acta (PDF)</Button>
        <Button size="sm" variant="neutral" icon={<FileCsv size={16} />} loading={downloading === 'csv'} onClick={() => get('csv')}>{exportCsvLabel(me?.region)}</Button>
        {!running && !missing.length && aiDrafts.length > 0 && (
          <Button size="sm" variant="plain" icon={<ArrowCounterClockwise size={16} />} onClick={run(aiDrafts, true)}>
            Redactar de nuevo {plural(aiDrafts.length, 'borrador', 'borradores')}
          </Button>
        )}
      </div>

      <Section title={plural(rows.length, 'alumno', 'alumnos')}
        action={<span className="ev-count">{commentsLine(data)}</span>}>
        <div className="ev-cols" aria-hidden><span>Alumno</span><span>Comentario de boletín</span><span>Nota</span></div>
        <List className="ev-list">
          {rows.map((r, i) => <EvalRowItem key={r.student.id} row={r} onOpen={() => setOpen(i)} />)}
        </List>
      </Section>

      <EvalStudentSheet course={course} data={data} index={open} onIndex={setOpen} />
      <NewActivitySheet open={recovery} onClose={() => setRecovery(false)} course={course}
        title={data.term === 4 ? `Crear recuperación ${finalRec}` : `Crear recuperación de la ${TERM_SHORT[data.term]}`}
        subtitle={`Para ${plural(failing.length, 'alumno', 'alumnos')} con la evaluación suspensa · ${RECOVERY_RULES.find((r) => r.value === data.recovery_rule)?.label.toLowerCase()}`}
        initial={{
          title: data.term === 4 ? `Recuperación ${finalRec}` : `Recuperación de la ${TERM_LABEL[data.term]}`, kind: 'exam',
          counts_for: 'recovery', recovers_term: data.term, student_ids: failing.map((r) => r.student.id),
        }} />
    </>
  );
}

/** Adjusted grades set before a recovery that now proposes more: the recovery doesn't reach the acta until the
 * adjustment goes ("Usar 8" = back to the proposal). */
function StaleAdjustments({ course, term, rows }: { course: CourseDetail; term: number; rows: EvalRow[] }) {
  const { toast } = useFeedback();
  const save = useSaveEvalRow(course.id, term);
  const apply = (r: EvalRow) => save.mutate({ studentId: r.student.id, final_grade: null }, {
    onSuccess: () => toast(`${r.student.first_name}: cuenta la recuperación (${formatProposal(r.proposed)})`),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });
  return (
    <Callout tone="warn" icon={<Warning size={20} />}>
      <b>{rows.length === 1 ? 'Una nota ajustada no incluye la recuperación.' : `${rows.length} notas ajustadas no incluyen la recuperación.`}</b>{' '}
      {rows.map((r, i) => (
        <span key={r.student.id}>{i > 0 && ' · '}
          {r.student.sort_name}: ajustada {formatProposal(r.final_grade)}, con la recuperación {formatProposal(r.proposed)}{' '}
          <Button size="sm" variant="plain" disabled={save.isPending} onClick={() => apply(r)}>Usar {formatProposal(r.proposed)}</Button>
        </span>
      ))}
    </Callout>
  );
}

function commentsLine(data: Evaluation): string {
  const final = data.rows.length - data.comments_missing - data.comments_draft;
  if (final === data.rows.length) return 'Comentarios definitivos';
  const parts = [];
  if (data.comments_draft) parts.push(`${data.comments_draft} en borrador`);
  if (data.comments_missing) parts.push(`${data.comments_missing} sin comentario`);
  if (final) parts.push(plural(final, 'definitivo', 'definitivos'));
  return parts.join(' · ');
}

function EvalRowItem({ row, onOpen }: { row: EvalRow; onOpen: () => void }) {
  const adjusted = row.final_grade != null && row.final_grade !== row.proposed;
  const aiDraft = row.comment_source === 'ai' && row.comment_status === 'draft';
  const rec = row.recovery && row.recovery.before_proposed !== row.proposed ? row.recovery : null;
  return (
    <Row onClick={onOpen} chevron={false} className="ev-row" aria-label={`${row.student.name}: editar nota final y comentario`}
      title={<>
        <span>{row.student.sort_name}</span>
        {row.adapted && <Chip tone="info">ACS</Chip>}
        {row.comment_status === 'final' && <Chip tone="ok">Definitivo</Chip>}
        {aiDraft && <AIBadge />}
      </>}
      sub={<>
        <span className="ev-row__meta">
          Media <Grade value={row.average} />
          {rec && <> · <span className="ev-row__rec">{formatProposal(rec.before_proposed)} → {formatProposal(row.proposed)} (rec.)</span></>}
          {row.absences > 0 && <> · {plural(row.absences, 'falta', 'faltas')}</>}
          {row.pending_exams.length > 0 && <> · <span className="ev-row__pending">Pendiente: {row.pending_exams.map((p) => p.title).join(', ')}</span></>}
        </span>
        {row.stale_adjustment && (
          <span className="ev-row__stale">La nota ajustada ({formatProposal(row.final_grade)}) no incluye la recuperación ({formatProposal(row.proposed)})</span>
        )}
        {row.comment && <span className="ev-row__comment">{row.comment}</span>}
      </>}
      wrapSub
      trail={<div className="ev-row__final">
        {row.final != null ? <GradePill value={row.final} label={row.final_qualitative} proposal /> : <span className="faint">—</span>}
        <span className={`ev-row__kind${adjusted ? ' ev-row__kind--adjusted' : ''}`}>{adjusted ? `Ajustada (prop. ${formatProposal(row.proposed)})` : 'Propuesta'}</span>
      </div>}
    />
  );
}
