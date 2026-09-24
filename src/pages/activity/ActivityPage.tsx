import { DotsThree, FileX, PencilSimple, Trash } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useActivityJob, useCorrection, type Correction } from '../../api/papers';
import type { Job } from '../../api/types';
import ActivityDataSheet from '../../features/papers/ActivityDataSheet';
import { CollectStep } from '../../features/papers/CollectStep';
import { ExamStep } from '../../features/papers/ExamStep';
import GenerateExamSheet from '../../features/papers/GenerateExamSheet';
import { ManualGrades } from '../../features/papers/ManualGrades';
import { needsLook } from '../../features/papers/pageLabels';
import { PrepareStep } from '../../features/papers/PrepareStep';
import { ReviewMenu, ReviewStep } from '../../features/papers/ReviewStep';
import '../../features/papers/papers.css';
import { api } from '../../lib/api';
import { formatGrade, KIND_LABEL, longDate, plural, TERM_LABEL } from '../../lib/format';
import { Button, Dot, EmptyState, IconButton, Menu, Page, SkeletonList, useFeedback } from '../../ui';
import './activity.css';

const STEP_INDEX = { prepare: 1, collect: 2, review: 3, done: 3 } as const;
const PREPARE_JOBS = ['extract_rubric', 'generate_exam'];
const COLLECT_JOBS = ['ingest_papers'];

const DONE_TOAST: Record<string, (job: Job) => string> = {
  extract_rubric: () => 'Preguntas leídas. Revisa puntos y soluciones antes de imprimir.',
  generate_exam: () => 'Examen generado. Revisa las preguntas antes de imprimir.',
  ingest_papers: (j) => {
    const r = j.result ?? {};
    const extra = Number(r.discarded) ? ` · ${r.discarded} reversos en blanco descartados` : '';
    return `${r.matched ?? 0} de ${r.papers ?? 0} hojas emparejadas${extra}`;
  },
  suggest_grades: () => 'Sugerencias de la IA listas',
};

function prepareSummary(c: Correction, manual: boolean) {
  if (c.rubric) return `${c.generated ? 'Generado con IA' : 'Examen subido'} · ${plural(c.rubric.items.length, 'pregunta', 'preguntas')}`;
  if (c.document_url) return 'Examen subido, sin rúbrica';
  return manual || c.step !== 'prepare' ? 'Sin documento (solo nota)' : 'Subir, generar o solo nota';
}

function collectSummary(c: Correction) {
  if (!c.stats.papers && !c.unplaced.length) return c.rubric ? 'Aún no has subido las hojas' : 'Primero prepara el examen';
  const hojas = plural(c.stats.papers, 'hoja', 'hojas');
  const todo = [
    c.unmatched.length && `${c.unmatched.length} sin identificar`,
    c.unplaced.length && plural(c.unplaced.length, 'página por colocar', 'páginas por colocar'),
    c.students.filter((s) => needsLook(s.flags)).length && `${c.students.filter((s) => needsLook(s.flags)).length} por revisar`,
  ].filter(Boolean);
  return todo.length ? `${hojas} · ${todo.join(' · ')}` : `${hojas} · ${c.stats.matched} de ${c.students.length} emparejados`;
}

function reviewSummary(c: Correction) {
  const done = c.students.filter((s) => s.grade && ['confirmed', 'absent'].includes(s.grade.status)).length;
  return done ? `${done} de ${c.students.length} con nota` : 'Sin notas todavía';
}

export default function ActivityPage() {
  const { courseId, activityId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { data: c, isLoading, error } = useCorrection(activityId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const pinned = useRef<number | null>(null);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const generateOpen = params.get('generar') === '1';

  const activeJobId = jobId ?? c?.job?.id ?? null;
  const job = useActivityJob(activityId!, activeJobId, {
    onDone: (j) => {
      toast(DONE_TOAST[j.kind]?.(j) ?? 'Hecho');
      setJobId(null);
      // After preparing, keep step 1 open so the teacher reviews the questions before printing.
      pinned.current = PREPARE_JOBS.includes(j.kind) ? 1 : null;
      setOpen(pinned.current);
    },
    onFail: (j) => { toast(j.error || 'No se ha podido completar. Inténtalo de nuevo.', { tone: 'error' }); setJobId(null); },
  });
  const running = !!activeJobId && (!job || job.status === 'queued' || job.status === 'running');
  const runningKind = running ? job?.kind ?? c?.job?.kind ?? null : null;

  useEffect(() => { setOpen(pinned.current); pinned.current = null; }, [c?.step]);

  const remove = useMutation({
    mutationFn: () => api.delete(`/activities/${activityId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      toast('Actividad eliminada');
      navigate(`/clases/${courseId}/cuaderno`, { replace: true });
    },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const back = `/clases/${courseId}/cuaderno`;
  if (error) {
    return (
      <Page title="Actividad" back={back} backLabel="Cuaderno">
        <EmptyState icon={<FileX size={24} />} title="No se ha podido abrir la actividad" text={error.message}
          action={<Button variant="tinted" to={back}>Volver al cuaderno</Button>} />
      </Page>
    );
  }
  if (isLoading || !c) {
    return <Page title="" back={back} backLabel="Cuaderno"><SkeletonList rows={5} /></Page>;
  }

  const a = c.activity;
  const isExam = a.kind === 'exam';
  const step = STEP_INDEX[c.step];
  const noDocument = !c.document_url && !c.rubric && !c.stats.papers && (manual || c.step === 'review');
  const current = open ?? (noDocument ? 3 : runningKind && PREPARE_JOBS.includes(runningKind) ? 1 : runningKind && COLLECT_JOBS.includes(runningKind) ? 2 : step);
  const onJob = (j: Job) => setJobId(j.id);
  const closeGenerate = () => setParams((p) => { p.delete('generar'); p.delete('unidad'); return p; }, { replace: true });

  const deleteActivity = async () => {
    if (await confirm({ title: 'Eliminar la actividad', text: 'Se borran sus notas del cuaderno y las hojas escaneadas.', confirm: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  return (
    <Page
      title={a.title}
      back={back}
      backLabel="Cuaderno"
      compactTitle={a.title.length > 22}
      eyebrow={<><Dot color={a.course.color} large /><span className="eyebrow activity-eyebrow">{a.course.label}</span></>}
      subtitle={<>
        <span>{longDate(a.date)}</span>
        <span>{TERM_LABEL[a.term]}</span>
        <span>{isExam ? '' : `${KIND_LABEL[a.kind]} · `}sobre {formatGrade(a.max_score)}</span>
      </>}
      actions={
        <Menu trigger={(o) => <IconButton label="Más opciones" glass onClick={o}><DotsThree size={22} weight="bold" /></IconButton>}
          items={[
            { label: 'Editar datos', icon: <PencilSimple size={18} />, onSelect: () => setEditing(true) },
            { label: 'Eliminar actividad', icon: <Trash size={18} />, danger: true, separatorBefore: true, onSelect: deleteActivity },
          ]} />
      }
    >
      {isExam ? (
        <div className="exam-steps">
          <ExamStep n={1} title="Preparar" summary={prepareSummary(c, manual)} open={current === 1} onOpen={() => setOpen(1)}>
            <PrepareStep correction={c} job={job} running={!!runningKind && PREPARE_JOBS.includes(runningKind)} onJob={onJob}
              onGenerate={() => setParams((p) => { p.set('generar', '1'); return p; }, { replace: true })}
              onManual={() => { setManual(true); setOpen(3); }} />
          </ExamStep>
          {!noDocument && (
            <ExamStep n={2} title="Recoger" summary={collectSummary(c)} open={current === 2} onOpen={() => setOpen(2)}>
              <CollectStep correction={c} job={job} running={!!runningKind && COLLECT_JOBS.includes(runningKind)} onJob={onJob} />
            </ExamStep>
          )}
          <ExamStep n={noDocument ? 2 : 3} title={noDocument ? 'Poner notas' : 'Revisar'} summary={reviewSummary(c)}
            open={current === 3} onOpen={() => setOpen(3)} action={noDocument ? undefined : <ReviewMenu correction={c} />}>
            {noDocument
              ? <ManualGrades correction={c} />
              : <ReviewStep correction={c} job={job} running={runningKind === 'suggest_grades'} onOpenCollect={() => setOpen(2)} />}
          </ExamStep>
        </div>
      ) : (
        <ManualGrades correction={c} />
      )}
      <GenerateExamSheet open={generateOpen} onClose={closeGenerate} activityId={a.id} courseId={a.course.id}
        initialUnitId={params.get('unidad')} onJob={onJob} />
      <ActivityDataSheet open={editing} onClose={() => setEditing(false)} activity={a} />
    </Page>
  );
}
