import { CaretDown, ChatCircleText, Copy, DotsThree, NotePencil, PencilSimple, Trash, UserMinus, Warning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSetMark } from '../../api/attendance';
import { useStudentFile, useUnenroll } from '../../api/core';
import { useDeleteNote } from '../../api/notes';
import type { WatchItem } from '../../api/today';
import type { AttendanceEntry, GradeLine, GroupRef, Note, StudentCourse, TermCell } from '../../api/types';
import QuickNoteSheet from '../../features/notes/QuickNoteSheet';
import BriefSheet from '../../features/students/BriefSheet';
import EditNoteSheet from '../../features/students/EditNoteSheet';
import EditStudentSheet from '../../features/students/EditStudentSheet';
import FamilyMessageSheet from '../../features/students/FamilyMessageSheet';
import WatchItemSheet from '../../features/students/WatchItemSheet';
import { measureChips, supportLabel } from '../../features/students/support';
import { attendanceText, homeworkText, studentSummary } from '../../features/students/summary';
import { ApiError } from '../../lib/api';
import { courseLabel, formatScore, NOTE_KIND_LABEL, ordinals, plural, shortDate, TERM_LABEL, TERM_SHORT, weekdayShort } from '../../lib/format';
import {
  AIBadge, Button, Callout, Chip, DESKTOP, Dot, EmptyState, Grade, GradePill, IconButton, List, Menu, Page, Row, Section, SkeletonList,
  useFeedback, useMediaQuery, type MenuItem,
} from '../../ui';
import './student.css';

const KIND_TONE: Record<string, 'danger' | 'ok' | 'info' | undefined> = { incident: 'danger', positive: 'ok', family: 'info' };

/** Terms 1-3 show the teacher's final grade if set, else the average. The final one stays "—" until the 3rd term has
 *  an average (or the teacher sets it): before that it would only repeat the terms already shown. */
function termValue(t: TermCell, terms: TermCell[]): number | null {
  if (t.term === 4 && t.final == null && terms.find((x) => x.term === 3)?.average == null) return null;
  return t.final ?? t.average;
}

function GradeRow({ g }: { g: GradeLine }) {
  const suggested = g.status === 'suggested';
  const score = g.status === 'absent' ? <span className="faint">NP</span> : g.status === 'exempt' ? <span className="faint">Exento</span>
    : suggested ? <span className="faint num">{formatScore(g.score)}{g.max_score !== 10 && `/${formatScore(g.max_score)}`}</span>
      : <span className="num"><Grade value={g.score} max={g.max_score} />{g.max_score !== 10 && <span className="faint">/{formatScore(g.max_score)}</span>}</span>;
  const aiDraft = suggested && g.kind !== 'homework';
  const chips = aiDraft || g.adapted || g.counts_for === 'none';
  return (
    <Row title={g.title} wrapSub trail={score}
      sub={<>
        <span>{shortDate(g.date)} · {g.category_label}</span>
        {chips && (
          <span className="st-adapted chip-row">
            {aiDraft && <AIBadge />}
            {g.counts_for === 'none' && <Chip>No cuenta</Chip>}
            {g.adapted && <Chip tone={g.adapted.acs ? 'warn' : undefined}>{g.adapted.label}</Chip>}
          </span>
        )}
        {g.comment && <span className="st-comment">«{g.comment}»</span>}
      </>} />
  );
}

function CourseGrades({ sc, single, expanded }: { sc: StudentCourse; single: boolean; expanded: boolean }) {
  const [open, setOpen] = useState(expanded);
  const pending = sc.pending_exams ?? [];
  return (
    <List>
      {!single && <Row to={`/clases/${sc.course.id}/cuaderno`} lead={<Dot color={sc.course.color} large />} title={courseLabel(sc.course)} />}
      <div className="row st-terms">
        {sc.terms.map((t) => (
          <div key={t.term} className="st-term">
            <span className="st-term__label">{TERM_SHORT[t.term]}</span>
            <GradePill value={termValue(t, sc.terms)} proposal={t.final != null} />
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <Row title="Exámenes pendientes" wrapSub chevron={false}
          sub={pending.map((p) => `${p.title} (${shortDate(p.date)}${p.status === 'absent' ? ', NP' : ''})`).join(' · ')} />
      )}
      {sc.grades.length > 0 && !expanded && (
        <button type="button" className="row st-more" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{open ? 'Ocultar notas' : `Ver ${plural(sc.grades.length, 'nota', 'notas')}`}</span>
          <CaretDown size={14} className={open ? 'st-more__caret st-more__caret--up' : 'st-more__caret'} />
        </button>
      )}
      {(open || expanded) && sc.grades.map((g) => <GradeRow key={g.activity_id} g={g} />)}
    </List>
  );
}

function NoteRow({ note, onEdit, showCourse }: { note: Note; onEdit: (n: Note) => void; showCourse: boolean }) {
  const { confirm, toast } = useFeedback();
  const del = useDeleteNote();
  const others = note.students.length > 1 ? ` · con ${plural(note.students.length - 1, 'alumno más', 'alumnos más')}` : '';
  const items: MenuItem[] = [
    { label: 'Editar', icon: <PencilSimple size={18} />, onSelect: () => onEdit(note) },
    {
      label: 'Eliminar', icon: <Trash size={18} />, danger: true, onSelect: async () => {
        if (!(await confirm({ title: 'Eliminar observación', text: note.students.length > 1 ? 'Se elimina para todos los alumnos a los que se refiere.' : undefined, confirm: 'Eliminar', danger: true }))) return;
        try { await del.mutateAsync(note.id); toast('Observación eliminada'); } catch (e) { toast(e instanceof ApiError ? e.message : 'No se ha podido eliminar.', { tone: 'error' }); }
      },
    },
  ];
  return (
    <div className="row st-note">
      <div className="row__main">
        <div className="st-note__meta">
          <Chip tone={KIND_TONE[note.kind]}>{NOTE_KIND_LABEL[note.kind]}</Chip>
          <span className="muted">{shortDate(note.date)}{showCourse && note.course ? ` · ${courseLabel(note.course)}` : ''}{others}</span>
        </div>
        <p className="st-note__text">{note.text}</p>
      </div>
      <Menu trigger={(open) => <IconButton size="sm" label="Opciones de la observación" onClick={open}><DotsThree size={20} weight="bold" /></IconButton>} items={items} />
    </div>
  );
}

const MARK_TEXT: Record<AttendanceEntry['status'], string> = { absent: 'Falta sin justificar', justified: 'Falta justificada', late: 'Retraso' };

/** One absence of the term: tapping it justifies it or takes the justification away (the list keeps its note). */
function MarkRow({ sc, m, studentId }: { sc: StudentCourse; m: AttendanceEntry; studentId: string }) {
  const { toast } = useFeedback();
  const set = useSetMark();
  const title = `${weekdayShort(m.date).toLowerCase()} ${shortDate(m.date)} · ${m.start}`;
  const sub = [MARK_TEXT[m.status], m.note].filter(Boolean).join(' · ');
  if (m.status === 'late') return <Row title={title} sub={sub} />;
  const current: 'absent' | 'justified' = m.status;
  const next = current === 'absent' ? 'justified' : 'absent';
  const save = (status: typeof next, done: string, undo?: typeof next) => set.mutate(
    { courseId: sc.course.id, date: m.date, start: m.start, studentId, status, note: m.note },
    {
      onSuccess: () => toast(done, undo ? { action: { label: 'Deshacer', run: () => save(undo, 'Deshecho') } } : undefined),
      onError: (e) => toast(e.message, { tone: 'error' }),
    },
  );
  return (
    <Row title={title} sub={sub} chevron={false} aria-label={`${title}, ${sub}: ${current === 'absent' ? 'justificar' : 'quitar justificación'}`}
      trail={<span className="st-mark__action">{current === 'absent' ? 'Justificar' : 'Quitar justificación'}</span>}
      onClick={() => { if (!set.isPending) save(next, next === 'justified' ? 'Falta justificada' : 'Justificación quitada', current); }} />
  );
}

/** Asistencia of one class in the current term: the counts, and tapping them opens the dated list. */
function CourseAttendance({ sc, single, term, studentId, open, onToggle }: {
  sc: StudentCourse; single: boolean; term: number; studentId: string; open: boolean; onToggle: () => void;
}) {
  const marks = sc.attendance ?? [];
  const hw = homeworkText(sc.homework);
  const summary = `${attendanceText(sc)} en la ${TERM_LABEL[term]}`;
  return (
    <List>
      <Row lead={single ? undefined : <Dot color={sc.course.color} large />} title={single ? summary : courseLabel(sc.course)} wrapSub
        sub={single ? hw : <span className="st-att"><span>{summary}</span>{hw && <span>{hw}</span>}</span>}
        onClick={marks.length ? onToggle : undefined} aria-expanded={marks.length ? open : undefined}
        trail={marks.length ? <CaretDown size={14} className={open ? 'st-more__caret st-more__caret--up' : 'st-more__caret'} /> : undefined}
        chevron={false} />
      {open && marks.map((m) => <MarkRow key={`${m.date}|${m.start}`} sc={sc} m={m} studentId={studentId} />)}
    </List>
  );
}

/** /alumnos/:id — ficha del alumno: notas por clase (mismos números que el cuaderno), asistencia y observaciones. */
export default function StudentPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const { data: f, isLoading, error, refetch } = useStudentFile(studentId);
  const desktop = useMediaQuery(DESKTOP);
  const unenroll = useUnenroll();
  const [noting, setNoting] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [watchItem, setWatchItem] = useState<WatchItem | null>(null);
  const [family, setFamily] = useState<WatchItem | null>(null);
  const { hash } = useLocation();
  const [openAtt, setOpenAtt] = useState<Set<string>>(new Set());
  const fromFaltas = hash === '#asistencia';
  useEffect(() => {
    if (!fromFaltas || !f) return;
    setOpenAtt(new Set(f.courses.map((c) => c.course.id)));
    requestAnimationFrame(() => document.getElementById('asistencia')?.scrollIntoView({ block: 'start' }));
  }, [fromFaltas, f]);

  const home = f?.courses.length === 1
    ? { back: `/clases/${f.courses[0].course.id}/alumnos`, backLabel: ordinals(f.courses[0].course.group.name) }
    : { back: '/clases', backLabel: 'Clases' };

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Page title="Alumno" {...home} backToOrigin>
        <EmptyState icon={<Warning size={26} />} title={notFound ? 'No se ha encontrado el alumno' : 'No se ha podido cargar la ficha'}
          text={notFound ? undefined : error.message} action={notFound ? <Button variant="tinted" to="/clases">Ir a Clases</Button> : <Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />
      </Page>
    );
  }
  if (isLoading || !f) return <Page title="" {...home} backToOrigin><SkeletonList rows={6} /></Page>;

  const s = f.student;
  const sup = s.support;
  const single = f.courses.length === 1;
  const flag = supportLabel(sup);
  const measures = measureChips(sup);

  const removeFrom = async (g: GroupRef) => {
    if (!(await confirm({ title: `Quitar a ${s.first_name} de ${ordinals(g.name)}`, text: 'Se quita del grupo. Sus notas se conservan.', confirm: 'Quitar', danger: true }))) return;
    try {
      await unenroll.mutateAsync({ groupId: g.id, studentId: s.id });
      toast(`Quitado de ${ordinals(g.name)}`);
      const course = f.courses.find((c) => c.course.group.id === g.id);
      if (course) navigate(`/clases/${course.course.id}/alumnos`, { replace: true });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se ha podido quitar.', { tone: 'error' });
    }
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(studentSummary(f));
      toast('Resumen copiado');
    } catch {
      toast('No se ha podido copiar. Tu navegador no deja usar el portapapeles.', { tone: 'error' });
    }
  };

  const menu: MenuItem[] = [
    { label: 'Editar datos y apoyos', icon: <PencilSimple size={18} />, onSelect: () => setEditing(true) },
    ...f.groups.map((g, i) => ({ label: `Quitar de ${ordinals(g.name)}`, icon: <UserMinus size={18} />, danger: true, separatorBefore: i === 0, onSelect: () => removeFrom(g) })),
  ];

  return (
    <Page
      title={s.name}
      {...home}
      backToOrigin
      eyebrow={f.groups.length ? <span className="eyebrow">{f.groups.map((g) => ordinals(g.name)).join(' · ')}</span> : undefined}
      subtitle={(flag || measures.length || sup?.notes) ? (
        <div className="st-support">
          <span className="chip-row">
            {flag && <Chip tone="info">{flag}</Chip>}
            {measures.map((m) => <Chip key={m} tone="outline">{m}</Chip>)}
          </span>
          {sup?.notes && <span className="st-support__notes">{sup.notes}</span>}
        </div>
      ) : undefined}
      actions={<Menu trigger={(open) => <IconButton label="Más opciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>} items={menu} />}
      toolbar={
        <div className="st-actions">
          <Button variant="tinted" icon={<NotePencil size={18} />} onClick={() => setNoting(true)}>Anotar</Button>
          <Button variant="neutral" icon={<Copy size={18} />} onClick={copySummary}>Copiar resumen</Button>
          <Button variant="neutral" icon={<ChatCircleText size={18} />} onClick={() => setBriefing(true)}>Preparar tutoría</Button>
        </div>
      }
    >
      {f.watch.map((w) => (
        <Callout key={w.course.id} tone="warn" icon={<Warning size={18} />} onClick={() => setWatchItem(w)} label={`A vigilar: ${w.reasons.join(', ')}`}>
          <b>A vigilar{single ? '' : ` en ${w.course.subject}`}:</b> {w.reasons.join(' · ')}
        </Callout>
      ))}
      <div className="st-grid">
        <div className="st-col">
          <Section title="Notas">
            {f.courses.length === 0 ? (
              <div className="list"><EmptyState icon={<Warning size={24} />} title="No está en ninguna clase" text="Añádelo desde la pestaña Alumnos de una clase." /></div>
            ) : f.courses.map((sc) => <CourseGrades key={sc.course.id} sc={sc} single={single} expanded={desktop} />)}
          </Section>
          {f.courses.length > 0 && (
            <div id="asistencia" className="st-anchor"><Section title="Asistencia">
              <div className="st-col">
                {f.courses.map((sc) => (
                  <CourseAttendance key={sc.course.id} sc={sc} single={single} term={f.term} studentId={s.id} open={openAtt.has(sc.course.id)}
                    onToggle={() => setOpenAtt((prev) => {
                      const next = new Set(prev);
                      if (next.has(sc.course.id)) next.delete(sc.course.id); else next.add(sc.course.id);
                      return next;
                    })} />
                ))}
              </div>
            </Section></div>
          )}
          {f.notes_text && (
            <Section title="Notas privadas" action={<button type="button" className="section__action" onClick={() => setEditing(true)}>Editar</button>}>
              <div className="card card--pad st-private">{f.notes_text}</div>
            </Section>
          )}
        </div>
        <div className="st-col">
          <Section title="Observaciones">
            {f.notes.length === 0 ? (
              <div className="list">
                <EmptyState icon={<NotePencil size={24} />} title="Sin observaciones"
                  text="Apunta lo que veas en clase con «Anotar»: te servirá en la evaluación y en las tutorías." />
              </div>
            ) : (
              <List>{f.notes.map((n) => <NoteRow key={n.id} note={n} onEdit={setEditNote} showCourse={!single} />)}</List>
            )}
          </Section>
        </div>
      </div>

      <QuickNoteSheet open={noting} onClose={() => setNoting(false)} studentIds={[s.id]}
        courseId={single ? f.courses[0].course.id : undefined} />
      <BriefSheet open={briefing} onClose={() => setBriefing(false)} studentId={s.id} name={s.name} />
      <EditStudentSheet open={editing} onClose={() => setEditing(false)} student={s} notesText={f.notes_text}
        acsAllowed={!f.groups.length || f.groups.some((g) => g.stage === 'primaria' || g.stage === 'eso')} />
      <EditNoteSheet note={editNote} onClose={() => setEditNote(null)} />
      <WatchItemSheet item={watchItem} onClose={() => setWatchItem(null)} onFamily={setFamily} fromFile />
      {family && <FamilyMessageSheet open onClose={() => setFamily(null)} student={family.student} course={family.course} />}
    </Page>
  );
}
