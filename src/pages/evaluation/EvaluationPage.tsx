import { ChatCenteredText, Copy, DotsThree, FileCsv, FilePdf, Student } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCourse, useJob } from '../../api/core';
import { evaluationKeys, useDraftComments, useEvaluation, type Band, type EvalRow, type Evaluation } from '../../api/evaluation';
import type { CourseDetail } from '../../api/types';
import { download } from '../../lib/api';
import { formatGrade, formatPercent, plural, QUALITATIVE, TERM_LABEL, TERM_SHORT } from '../../lib/format';
import {
  AIBadge, Button, Callout, Chip, Dot, EmptyState, Grade, GradePill, IconButton, List, Menu, Page, Progress, Row, Section, Segmented,
  SkeletonList, StackedBar, Stats, useFeedback, type BarTone,
} from '../../ui';
import EvalStudentSheet from './EvalStudentSheet';
import './EvaluationPage.css';

const TERMS = [1, 2, 3, 4].map((t) => ({ value: t, label: TERM_SHORT[t] }));
const BANDS: { key: Band; tone: BarTone; numeric: string }[] = [
  { key: 'IN', tone: 'fail', numeric: '< 5' }, { key: 'SU', tone: 'pass', numeric: '5' }, { key: 'BI', tone: 'pass-2', numeric: '6' },
  { key: 'NT', tone: 'good', numeric: '7-8' }, { key: 'SB', tone: 'great', numeric: '9-10' },
];

/** Evaluación: notas propuestas, nota final ajustable y comentario de boletín por alumno. */
export default function EvaluationPage() {
  const { courseId, term: termParam } = useParams();
  const term = termParam === 'final' ? 4 : Math.min(4, Math.max(1, Number(termParam) || 1));
  const navigate = useNavigate();
  const course = useCourse(courseId);
  const ev = useEvaluation(courseId, term);
  const title = term === 4 ? 'Evaluación final' : TERM_LABEL[term];

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
      actions={course.data && data && <EvalMenu course={course.data} data={data} />}
      toolbar={<div className="ev-toolbar"><Segmented label="Evaluación" value={term} options={TERMS}
        onChange={(t) => navigate(`/clases/${courseId}/evaluacion/${t}`, { replace: true })} /></div>}>
      {ev.error && !data ? (
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
        <EvaluationBody course={course.data} data={data} />
      )}
    </Page>
  );
}

function EvalMenu({ course, data }: { course: CourseDetail; data: Evaluation }) {
  const { toast } = useFeedback();
  const base = `/courses/${course.id}/evaluation/${data.term}`;
  const name = `${course.subject} ${course.group.name} ${TERM_SHORT[data.term]}`;
  const fail = (e: Error) => toast(e.message, { tone: 'error' });
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
    <Menu
      trigger={(open) => <IconButton label="Más acciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>}
      items={[
        { label: 'Copiar todos los comentarios', icon: <Copy size={18} />, onSelect: copy },
        { label: 'Acta (PDF)', icon: <FilePdf size={18} />, onSelect: () => { toast('Preparando el acta…'); download(`${base}/acta.pdf`, `Acta ${name}.pdf`).catch(fail); } },
        { label: 'Exportar CSV', icon: <FileCsv size={18} />, onSelect: () => download(`${base}.csv`, `Evaluación ${name}.csv`).catch(fail) },
      ]}
    />
  );
}

function EvaluationBody({ course, data }: { course: CourseDetail; data: Evaluation }) {
  const { toast, confirm } = useFeedback();
  const qc = useQueryClient();
  const draft = useDraftComments(course.id, data.term);
  const [jobId, setJobId] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const job = useJob(jobId, {
    onDone: (j) => {
      setJobId(null);
      qc.invalidateQueries({ queryKey: evaluationKeys.one(course.id, data.term) });
      qc.invalidateQueries({ queryKey: ['inbox'] });
      const n = Number(j.result?.updated ?? 0);
      toast(n ? `${plural(n, 'comentario redactado', 'comentarios redactados')}. Revísalos antes de darlos por buenos.` : 'No había comentarios que redactar');
    },
    onFail: (j) => { setJobId(null); toast(j.error || 'No se han podido redactar los comentarios.', { tone: 'error' }); },
  });

  const { stats, rows } = data;
  // AI drafts only for students without a comment or with an untouched AI draft: never overwrite the teacher's own text.
  const targets = rows.filter((r) => !r.comment || (r.comment_source === 'ai' && r.comment_status === 'draft'));
  const missing = rows.filter((r) => !r.comment).length;
  const running = !!jobId;

  const runDraft = async () => {
    const replacing = targets.length - missing;
    const ok = await confirm({
      title: 'Redactar comentarios con IA',
      text: `Se redactará un borrador para ${plural(targets.length, 'alumno', 'alumnos')} a partir de su media, su evolución, la asistencia y tus observaciones.`
        + (replacing ? ` Se sustituirán ${plural(replacing, 'borrador', 'borradores')} anteriores de la IA.` : '')
        + ' Los comentarios que has escrito o marcado como definitivos no se tocan. La IA solo recibe el nombre de pila.',
      confirm: 'Redactar',
    });
    if (!ok) return;
    draft.mutate({ student_ids: targets.map((r) => r.student.id) }, {
      onSuccess: ({ job: j }) => setJobId(j.id),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const hasGrades = rows.some((r) => r.average != null);
  const qualitative = data.stage === 'eso' || data.stage === 'primaria';
  return (
    <>
      <Stats items={[
        { label: 'Media', value: <Grade value={stats.average} /> },
        { label: 'Aprobados', value: formatPercent(stats.pass_rate) },
        { label: 'Suspensos', value: <span className={stats.failing ? 'grade grade--fail' : undefined}>{stats.failing}</span> },
      ]} />
      {hasGrades && (
        <StackedBar label="Distribución de notas finales"
          segments={BANDS.map((b) => ({
            key: b.key, label: qualitative ? b.key : b.numeric, title: qualitative ? QUALITATIVE[b.key] : `Nota ${b.numeric}`,
            value: stats.distribution[b.key] ?? 0, tone: b.tone,
          }))} />
      )}

      {running ? (
        <Callout tone="accent" icon={<ChatCenteredText size={20} />}>
          <div className="ev-job">
            <b>{job?.message || 'Redactando comentarios'}</b>
            <Progress value={job?.progress ?? 0} total={job?.total || targets.length || 1} />
          </div>
        </Callout>
      ) : (
        <div className="ev-actions">
          <Button variant="tinted" icon={<ChatCenteredText size={18} />} onClick={runDraft} loading={draft.isPending} disabled={!targets.length}>
            {!targets.length ? 'Todos los comentarios son tuyos' : missing ? 'Redactar comentarios con IA' : 'Redactar de nuevo con IA'}
          </Button>
          <span className="ev-actions__hint">
            {missing ? `${plural(missing, 'comentario pendiente', 'comentarios pendientes')}` : 'Todos los alumnos tienen comentario'}
          </span>
        </div>
      )}

      <Section title={`${plural(rows.length, 'alumno', 'alumnos')}`}>
        <List className="ev-list">
          {rows.map((r, i) => <EvalRowItem key={r.student.id} row={r} onOpen={() => setOpen(i)} />)}
        </List>
      </Section>

      <EvalStudentSheet course={course} data={data} index={open} onIndex={setOpen} />
    </>
  );
}

function EvalRowItem({ row, onOpen }: { row: EvalRow; onOpen: () => void }) {
  const adjusted = row.final_grade != null && row.final_grade !== row.proposed;
  const aiDraft = row.comment_source === 'ai' && row.comment_status === 'draft';
  return (
    <Row onClick={onOpen} chevron={false} className="ev-row" aria-label={`${row.student.name}: editar nota final y comentario`}
      title={<>
        <span>{row.student.sort_name}</span>
        {row.comment_status === 'final' && <Chip tone="ok">Definitivo</Chip>}
        {aiDraft && <AIBadge />}
      </>}
      sub={<>
        <span className="ev-row__meta">
          Media <Grade value={row.average} />
          {adjusted && row.proposed != null && <> · propuesta {row.proposed}{row.qualitative ? ` ${row.qualitative}` : ''}</>}
          {row.absences > 0 && <> · {plural(row.absences, 'falta', 'faltas')}</>}
        </span>
        <span className={`ev-row__comment${row.comment ? '' : ' ev-row__comment--empty'}`}>{row.comment || 'Sin comentario'}</span>
      </>}
      wrapSub
      trail={<div className="ev-row__final">
        {adjusted && <Chip tone="warn">Ajustada</Chip>}
        {row.final != null ? <GradePill value={row.final} label={row.final_qualitative} proposal /> : <span className="faint">{formatGrade(null)}</span>}
      </div>}
    />
  );
}
