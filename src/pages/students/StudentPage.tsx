import { CaretDown, ChatCircleText, Copy, DotsThree, NotePencil, PencilSimple, Trash, UserMinus, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMe, useStudentFile, useUnenroll } from '../../api/core';
import { useDeleteNote } from '../../api/notes';
import type { GradeLine, GroupRef, Note, StudentCourse, TermCell } from '../../api/types';
import QuickNoteSheet from '../../features/notes/QuickNoteSheet';
import BriefSheet from '../../features/students/BriefSheet';
import EditNoteSheet from '../../features/students/EditNoteSheet';
import EditStudentSheet from '../../features/students/EditStudentSheet';
import { measureChips, supportLabel } from '../../features/students/support';
import { studentSummary } from '../../features/students/summary';
import { ApiError } from '../../lib/api';
import { courseLabel, formatAverage, formatScore, NOTE_KIND_LABEL, ordinals, plural, shortDate, TERM_SHORT } from '../../lib/format';
import {
  Button, Callout, Chip, DESKTOP, Dot, EmptyState, Grade, GradePill, IconButton, List, Menu, Page, Row, Section, SkeletonList,
  useFeedback, useMediaQuery, type MenuItem,
} from '../../ui';
import './student.css';

const KIND_TONE: Record<string, 'danger' | 'ok' | 'info' | undefined> = { incident: 'danger', positive: 'ok', family: 'info' };

/** The grade that counts (the teacher's adjustment, else the proposal), as in Cuaderno and Evaluación. The final one stays
 *  "—" until the 3rd term has an average (or the teacher sets it): before that it would only repeat the terms already shown. */
function termValue(t: TermCell, terms: TermCell[]): number | null {
  if (t.term === 4 && t.final == null && terms.find((x) => x.term === 3)?.average == null) return null;
  return t.final ?? t.proposed ?? null;
}

function GradeRow({ g }: { g: GradeLine }) {
  const score = g.status === 'absent' ? <span className="faint">NP</span> : g.status === 'exempt' ? <span className="faint">Exento</span>
    : g.status === 'suggested' ? <span className="faint num" title="Borrador de la IA sin revisar">{formatScore(g.score)}</span>
      : <span className="num"><Grade value={g.score} max={g.max_score} />{g.max_score !== 10 && <span className="faint">/{formatScore(g.max_score)}</span>}</span>;
  return (
    <Row title={g.title} wrapSub trail={score}
      sub={<>
        <span>{shortDate(g.date)} · {g.category_label}</span>
        {g.adapted && <span className="st-adapted"><Chip tone={g.adapted.acs ? 'warn' : undefined}>{g.adapted.label}</Chip></span>}
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
            <GradePill value={termValue(t, sc.terms)} proposal />
            {termValue(t, sc.terms) != null && t.average != null && <span className="st-term__avg num">media {formatAverage(t.average)}</span>}
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

function attendanceText(sc: StudentCourse): string {
  const total = sc.absences + sc.justified;
  const parts = [
    total && `${plural(total, 'falta', 'faltas')}${sc.justified ? ` (${plural(sc.justified, 'justificada', 'justificadas')})` : ''}`,
    sc.lates && plural(sc.lates, 'retraso', 'retrasos'),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Sin faltas ni retrasos';
}

function homeworkText(sc: StudentCourse): string | null {
  const h = sc.homework;
  if (!h) return null;
  return `Deberes: no hizo ${h.not_done} de ${h.checks}${h.partial ? ` · ${plural(h.partial, 'incompleto', 'incompletos')}` : ''}`;
}

/** /alumnos/:id — ficha del alumno: notas por clase (mismos números que el cuaderno), asistencia y observaciones. */
export default function StudentPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const { data: f, isLoading, error, refetch } = useStudentFile(studentId);
  const me = useMe();
  const desktop = useMediaQuery(DESKTOP);
  const unenroll = useUnenroll();
  const [noting, setNoting] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);

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
      await navigator.clipboard.writeText(studentSummary(f, me.data?.school_year.current_term ?? 1));
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
      {f.watch.length > 0 && (
        <Callout tone="warn" icon={<Warning size={18} />}><b>A vigilar:</b> {f.watch.join(' · ')}</Callout>
      )}
      <div className="st-grid">
        <div className="st-col">
          <Section title="Notas">
            {f.courses.length === 0 ? (
              <div className="list"><EmptyState icon={<Warning size={24} />} title="No está en ninguna clase" text="Añádelo desde la pestaña Alumnos de una clase." /></div>
            ) : f.courses.map((sc) => <CourseGrades key={sc.course.id} sc={sc} single={single} expanded={desktop} />)}
          </Section>
          {f.courses.length > 0 && (
            <Section title="Asistencia">
              <List>
                {f.courses.map((sc) => single
                  ? <Row key={sc.course.id} title={attendanceText(sc)} sub={homeworkText(sc)} to={`/clases/${sc.course.id}/asistencia`} />
                  : <Row key={sc.course.id} lead={<Dot color={sc.course.color} large />} title={courseLabel(sc.course)} wrapSub
                      sub={<span className="st-att"><span>{attendanceText(sc)}</span>{homeworkText(sc) && <span>{homeworkText(sc)}</span>}</span>}
                      to={`/clases/${sc.course.id}/asistencia`} />)}
              </List>
            </Section>
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
    </Page>
  );
}
