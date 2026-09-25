import { DotsThree, Exam, FileX, Key, PencilSimple, Rows, Trash, UserMinus, Warning } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { useActivity } from '../../api/activities';
import { useCourse } from '../../api/core';
import { useActivityJob, useCorrection, useDocumentUrl, type Correction } from '../../api/papers';
import type { Job } from '../../api/types';
import ExamAbsencesSheet, { conflictsText } from '../../features/activities/ExamAbsencesSheet';
import ActivityDataSheet from '../../features/papers/ActivityDataSheet';
import { CollectStep } from '../../features/papers/CollectStep';
import { ExamSteps } from '../../features/papers/ExamSteps';
import GenerateExamSheet from '../../features/papers/GenerateExamSheet';
import { ManualGrades } from '../../features/papers/ManualGrades';
import { missingStudents, repeatCovered } from '../../features/papers/MissingPapers';
import { openSigned } from '../../features/papers/openDoc';
import { needsLook } from '../../features/papers/pageLabels';
import { PrepareStep } from '../../features/papers/PrepareStep';
import { ReviewMenu, ReviewStep } from '../../features/papers/ReviewStep';
import { FROM_ACTIVITY } from '../../features/papers/reviewLink';
import '../../features/papers/papers.css';
import { api } from '../../lib/api';
import { formatGrade, KIND_LABEL, longDate, plural, TERM_LABEL } from '../../lib/format';
import { Button, Callout, Dot, EmptyState, IconButton, Menu, Page, SkeletonList, useFeedback, type MenuItem } from '../../ui';
import './activity.css';

const STEP_INDEX = { prepare: 1, collect: 2, review: 3, done: 3 } as const;
const PREPARE_JOBS = ['extract_rubric', 'generate_exam'];
const COLLECT_JOBS = ['ingest_papers', 'reclassify_pages'];
const FINAL = ['confirmed', 'absent', 'exempt'];

/** Where each activity page was scrolled to: coming back from the focus review lands on the same row. */
const scrollMemory = new Map<string, number>();

interface Attached { student_id: string; name: string; kind: string }

/** What a batch of scanned pages did: new papers, pages added to papers already there, loose pages, blank backs. */
function pagesToast(j: Job): string {
  const r = j.result ?? {};
  const papers = Number(r.papers) || 0;
  const attached = (r.attached ?? []) as Attached[];
  const graded = (r.graded ?? []) as { name: string }[];
  const parts: string[] = [];
  if (papers > 0) parts.push(`${r.matched ?? 0} de ${papers} hojas emparejadas`);
  if (attached.length === 1 && !papers) {
    parts.push(`${attached[0].kind === 'extra_sheet' ? 'Hoja extra añadida' : 'Página añadida'} a la de ${attached[0].name}`);
  } else if (attached.length) {
    parts.push(plural(attached.length, 'página añadida a su hoja', 'páginas añadidas a sus hojas'));
  }
  if (Number(r.unplaced)) parts.push(plural(Number(r.unplaced), 'página por colocar', 'páginas por colocar'));
  if (Number(r.discarded)) parts.push(plural(Number(r.discarded), 'reverso en blanco descartado', 'reversos en blanco descartados'));
  if (!parts.length) parts.push('No había páginas nuevas');
  const text = parts.join(' · ');
  return graded.length ? `${text}. ${graded.map((g) => g.name).join(' y ')} ya ${graded.length > 1 ? 'tenían' : 'tenía'} nota confirmada: revísala.` : text;
}

const DONE_TOAST: Record<string, (job: Job) => string> = {
  extract_rubric: () => 'Preguntas leídas. Revisa puntos y soluciones antes de imprimir.',
  generate_exam: () => 'Examen generado. Revisa las preguntas antes de imprimir.',
  ingest_papers: pagesToast,
  reclassify_pages: pagesToast,
  suggest_grades: (j) => {
    const done = Number(j.result?.suggested) || 0;
    const held = Number(j.result?.skipped) || 0;
    const base = done ? 'Sugerencias de la IA listas' : 'La IA no ha sugerido ninguna nota nueva';
    return held ? `${base} · ${plural(held, 'hoja queda', 'hojas quedan')} sin sugerencia hasta que revises sus páginas` : base;
  },
};

/** Step 1, collapsed: "Preparado · 6 preguntas". */
function prepareSummary(c: Correction, manual: boolean) {
  if (c.rubric) return `Preparado · ${plural(c.rubric.items.length, 'pregunta', 'preguntas')}`;
  if (c.document_url) return 'Examen subido, sin preguntas';
  return manual || c.step !== 'prepare' ? 'Sin documento (solo nota)' : 'Subir, generar o solo nota';
}

/** Step 2, collapsed: "Recogido · 24 de 26 hojas", or what needs the teacher first. */
function collectSummary(c: Correction) {
  if (!c.stats.papers && !c.unplaced.length) return c.rubric || c.document_url ? 'Aún no has subido las hojas' : 'Primero prepara el examen';
  const received = c.students.filter((s) => s.paper_id).length;
  const hojas = `${received} de ${c.students.length} hojas`;
  const flagged = c.students.filter((s) => needsLook(s.flags)).length;
  const todo = [
    c.unmatched.length && `${c.unmatched.length} sin identificar`,
    c.unplaced.length && plural(c.unplaced.length, 'página por colocar', 'páginas por colocar'),
    flagged && `${flagged} por ordenar`,
  ].filter(Boolean);
  return todo.length ? `${hojas} · ${todo.join(' · ')}` : `Recogido · ${hojas}`;
}

/** Step 3, collapsed: "18 por revisar · 6 revisados". */
function reviewSummary(c: Correction) {
  const done = c.students.filter((s) => s.grade && FINAL.includes(s.grade.status)).length;
  if (c.stats.suggested) return `${c.stats.suggested} por revisar · ${plural(done, 'revisado', 'revisados')}`;
  if (done) return done === c.students.length ? `Revisado · ${done} de ${c.students.length}` : `${done} de ${c.students.length} con nota`;
  return 'Sin notas todavía';
}

export default function ActivityPage() {
  const { courseId, activityId } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { data: c, isLoading, error } = useCorrection(activityId);
  const detail = useActivity(activityId).data; // attendance of the exam day, units of the exam
  const course = useCourse(courseId).data;
  const docUrl = useDocumentUrl(activityId!);
  const [absences, setAbsences] = useState(false);
  const absent = useMemo(() => new Set(detail?.sheet.filter((r) => r.pending_absent).map((r) => r.student.id)), [detail]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(() => (params.get('paso') === 'recoger' ? 2 : null)); // "Ordenar páginas"
  const pinned = useRef<number | null>(null);
  const lastStep = useRef<string | undefined>(undefined);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const generateOpen = params.get('generar') === '1';

  const activeJobId = jobId ?? c?.job?.id ?? null;
  const job = useActivityJob(activityId!, activeJobId, {
    onDone: (j) => {
      toast(DONE_TOAST[j.kind]?.(j) ?? 'Hecho');
      setJobId((j.result?.suggest_job as string | undefined) ?? null); // grading goes on in its own job
      if (j.kind === 'suggest_grades') return; // never move the teacher away from what they are doing
      // After preparing, keep step 1 open so the teacher reviews the questions before printing; after a scan with
      // something to fix, keep "Recoger" open.
      pinned.current = PREPARE_JOBS.includes(j.kind) ? 1 : COLLECT_JOBS.includes(j.kind) && Number(j.result?.attention) > 0 ? 2 : null;
      setOpen(pinned.current);
    },
    onFail: (j) => { toast(j.error || 'No se ha podido completar. Inténtalo de nuevo.', { tone: 'error' }); setJobId(null); },
  });
  const running = !!activeJobId && (!job || job.status === 'queued' || job.status === 'running');
  const runningKind = running ? job?.kind ?? c?.job?.kind ?? null : null;

  useEffect(() => { // when the step changes (not on first load), open the new one unless a step was pinned
    if (!c?.step) return;
    if (lastStep.current !== undefined && lastStep.current !== c.step) {
      setOpen(pinned.current);
      pinned.current = null;
    }
    lastStep.current = c.step;
  }, [c?.step]);

  // Back from the focus review (history back, or a link that asks for it): the same scroll position; the position is
  // kept while the page is open.
  const restore = navigationType === 'POP' || !!(location.state as { restoreScroll?: boolean } | null)?.restoreScroll;
  const loaded = !!c;
  useEffect(() => {
    if (!loaded || !activityId) return;
    const y = scrollMemory.get(activityId);
    if (restore && y) requestAnimationFrame(() => window.scrollTo(0, y));
    const onScroll = () => scrollMemory.set(activityId, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loaded, activityId, restore]);

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
  const openDoc = (variant: 'print' | 'key' | 'extra-sheet') =>
    openSigned(() => docUrl.mutateAsync(variant), (m) => toast(m, { tone: 'error' }), (m) => toast(m));

  const missed = detail?.absent_students.length ?? 0;
  const missing = missingStudents(c); // the sheet shows them all, those with a repeat exam included
  const covered = repeatCovered(detail);
  const received = c.students.filter((s) => s.paper_id).length;
  const pending = c.stats.pending;

  const deleteActivity = async () => {
    if (await confirm({ title: 'Eliminar la actividad', text: 'Se borran sus notas del cuaderno y las hojas escaneadas.', confirm: 'Eliminar', danger: true })) {
      remove.mutate();
    }
  };

  const menu: MenuItem[] = [];
  if (c.document_url || (c.generated && c.rubric)) { // a repeat of a generated exam is laid out on first print
    menu.push({ label: 'Examen para imprimir', icon: <Exam size={18} />, onSelect: () => openDoc('print') });
    menu.push({ label: 'Hoja extra', icon: <Rows size={18} />, onSelect: () => openDoc('extra-sheet') });
  }
  if (c.rubric) menu.push({ label: 'Soluciones', icon: <Key size={18} />, onSelect: () => openDoc('key') });
  menu.push({ label: 'Editar datos', icon: <PencilSimple size={18} />, onSelect: () => setEditing(true), separatorBefore: menu.length > 0 });
  menu.push({ label: 'Eliminar actividad', icon: <Trash size={18} />, danger: true, separatorBefore: true, onSelect: deleteActivity });

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
      actions={<>
        {!!missed && !c.stats.papers && (
          <Button size="sm" variant="plain" icon={<UserMinus size={16} />} onClick={() => setAbsences(true)}
            aria-label={`${missed === 1 ? 'Faltó 1 alumno' : `Faltaron ${missed} alumnos`}: programar repesca o poner NP`}>
            {missed === 1 ? 'Faltó 1' : `Faltaron ${missed}`}
          </Button>
        )}
        <Menu trigger={(o) => <IconButton label="Más opciones" glass onClick={o}><DotsThree size={22} weight="bold" /></IconButton>} items={menu} />
      </>}
    >
      {isExam ? (
        <div className="exam-steps">
          {c.stats.papers > 0 && pending > 0 && (
            <Button to={`/clases/${courseId}/actividades/${activityId}/revisar`} state={FROM_ACTIVITY} className="review-main">
              Revisar alumno a alumno · faltan {pending}
            </Button>
          )}
          {!!detail?.attendance_conflicts.length && (
            <Callout tone="warn" icon={<Warning size={18} />}>
              <b>¿Hoja mal asignada o lista mal pasada?</b> {conflictsText(detail.attendance_conflicts)}{' '}
              <button type="button" className="link-btn" onClick={() => setAbsences(true)}>Revisar</button>
            </Callout>
          )}
          <ExamSteps open={current} onOpen={setOpen} steps={[
            {
              id: 1, n: 1, title: 'Preparar', summary: prepareSummary(c, manual),
              content: (
                <PrepareStep correction={c} job={job} running={!!runningKind && PREPARE_JOBS.includes(runningKind)} onJob={onJob}
                  onGenerate={() => setParams((p) => { p.set('generar', '1'); return p; }, { replace: true })}
                  onManual={() => { setManual(true); setOpen(3); }} />
              ),
            },
            ...(noDocument ? [] : [{
              id: 2, n: 2, title: 'Recoger', summary: collectSummary(c),
              content: (
                <CollectStep correction={c} job={job} running={!!runningKind && COLLECT_JOBS.includes(runningKind)}
                  grading={runningKind === 'suggest_grades'} onJob={onJob} onOpenMissing={() => setAbsences(true)} covered={covered} />
              ),
            }]),
            {
              id: 3, n: noDocument ? 2 : 3, title: noDocument ? 'Poner notas' : 'Revisar', summary: reviewSummary(c),
              action: noDocument ? undefined : <ReviewMenu correction={c} />,
              content: noDocument
                ? <ManualGrades correction={c} absent={absent} />
                : <ReviewStep correction={c} job={job} running={runningKind === 'suggest_grades'} onOpenCollect={() => setOpen(2)}
                  onOpenMissing={() => setAbsences(true)} absent={absent} unitIds={detail?.unit_ids ?? []} covered={covered} />,
            },
          ]} />
        </div>
      ) : (
        <ManualGrades correction={c} absent={absent} />
      )}
      <GenerateExamSheet open={generateOpen} onClose={closeGenerate} activityId={a.id} courseId={a.course.id}
        initialUnitId={params.get('unidad')} activityTitle={a.title} activityUnitIds={detail?.unit_ids ?? []} onJob={onJob} />
      <ActivityDataSheet open={editing} onClose={() => setEditing(false)} activity={a} />
      {course && (
        <ExamAbsencesSheet activityId={absences ? a.id : null} onClose={() => setAbsences(false)} course={course}
          missing={c.stats.papers ? missing : []} received={c.stats.papers ? received : null} />
      )}
    </Page>
  );
}
