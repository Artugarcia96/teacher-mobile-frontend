import { CaretDown, ChatCircleText, DotsThree, NotePencil, PencilSimple, Trash, UserMinus, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStudentFile, useUnenroll } from '../../api/core';
import { useDeleteNote } from '../../api/notes';
import type { GroupRef, Note, StudentCourse } from '../../api/types';
import QuickNoteSheet from '../../features/notes/QuickNoteSheet';
import BriefSheet from '../../features/students/BriefSheet';
import EditNoteSheet from '../../features/students/EditNoteSheet';
import EditStudentSheet from '../../features/students/EditStudentSheet';
import { ApiError } from '../../lib/api';
import { formatGrade, NOTE_KIND_LABEL, plural, shortDate, TERM_SHORT } from '../../lib/format';
import {
  Button, Callout, Chip, Dot, EmptyState, Grade, GradePill, IconButton, List, Menu, Page, Row, Section, SkeletonList, useFeedback,
  type MenuItem,
} from '../../ui';
import './student.css';

const KIND_TONE: Record<string, 'danger' | 'ok' | 'info' | undefined> = { incident: 'danger', positive: 'ok', family: 'info' };

function CourseGrades({ sc }: { sc: StudentCourse }) {
  const [open, setOpen] = useState(false);
  const shown = sc.grades.slice(0, open ? 30 : 0);
  return (
    <List inset={16}>
      <Row to={`/clases/${sc.course.id}/cuaderno`} lead={<Dot color={sc.course.color} large />} title={sc.course.label} />
      <div className="row st-terms">
        {sc.terms.map((t) => (
          <div key={t.term} className="st-term">
            <span className="st-term__label">{TERM_SHORT[t.term]}</span>
            <GradePill value={t.final ?? t.average} />
          </div>
        ))}
      </div>
      {sc.grades.length > 0 && (
        <button type="button" className="row st-more" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>{open ? 'Ocultar notas' : `Ver ${plural(sc.grades.length, 'nota', 'notas')}`}</span>
          <CaretDown size={14} className={open ? 'st-more__caret st-more__caret--up' : 'st-more__caret'} />
        </button>
      )}
      {shown.map((g) => (
        <Row key={g.activity_id} title={g.title} sub={`${shortDate(g.date)} · ${g.category_label}`}
          trail={g.status === 'absent' ? <span className="faint">NP</span> : g.status === 'exempt' ? <span className="faint">Exento</span>
            : <span className="num"><Grade value={g.score} max={g.max_score} /><span className="faint">/{formatGrade(g.max_score)}</span></span>} />
      ))}
    </List>
  );
}

function NoteRow({ note, onEdit }: { note: Note; onEdit: (n: Note) => void }) {
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
          <span className="muted">{shortDate(note.date)}{note.course ? ` · ${note.course.label}` : ''}{others}</span>
        </div>
        <p className="st-note__text">{note.text}</p>
      </div>
      <Menu trigger={(open) => <IconButton size="sm" label="Opciones de la observación" onClick={open}><DotsThree size={20} weight="bold" /></IconButton>} items={items} />
    </div>
  );
}

function attendanceText(sc: StudentCourse): string {
  const parts = [
    sc.absences && plural(sc.absences, 'falta', 'faltas'), sc.justified && plural(sc.justified, 'justificada', 'justificadas'),
    sc.lates && plural(sc.lates, 'retraso', 'retrasos'),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Sin faltas ni retrasos';
}

function homeworkText(sc: StudentCourse): string | null {
  const h = sc.homework;
  if (!h) return null;
  return `Deberes: no hizo ${h.not_done} de ${h.checks}${h.partial ? ` · ${plural(h.partial, 'incompleto', 'incompletos')}` : ''}`;
}

/** /alumnos/:id — ficha del alumno: notas por clase, asistencia y observaciones. */
export default function StudentPage() {
  const { studentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const { data: f, isLoading, error, refetch } = useStudentFile(studentId);
  const unenroll = useUnenroll();
  const [noting, setNoting] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState<Note | null>(null);

  const back = location.key !== 'default' ? true : f?.courses[0] ? `/clases/${f.courses[0].course.id}/alumnos` : '/clases';

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Page title="Alumno" back={back}>
        <EmptyState icon={<Warning size={26} />} title={notFound ? 'No se ha encontrado el alumno' : 'No se ha podido cargar la ficha'}
          text={notFound ? undefined : error.message} action={notFound ? <Button variant="tinted" to="/clases">Ir a Clases</Button> : <Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />
      </Page>
    );
  }
  if (isLoading || !f) return <Page title="" back={back}><SkeletonList rows={6} /></Page>;

  const s = f.student;
  const sup = s.support;

  const removeFrom = async (g: GroupRef) => {
    if (!(await confirm({ title: `Quitar a ${s.first_name} de ${g.name}`, text: 'Se quita del grupo. Sus notas se conservan.', confirm: 'Quitar', danger: true }))) return;
    try {
      await unenroll.mutateAsync({ groupId: g.id, studentId: s.id });
      toast(`Quitado de ${g.name}`);
      const course = f.courses.find((c) => c.course.group.id === g.id);
      if (course) navigate(`/clases/${course.course.id}/alumnos`, { replace: true });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se ha podido quitar.', { tone: 'error' });
    }
  };

  const menu: MenuItem[] = [
    { label: 'Editar datos', icon: <PencilSimple size={18} />, onSelect: () => setEditing(true) },
    ...f.groups.map((g, i) => ({ label: `Quitar de ${g.name}`, icon: <UserMinus size={18} />, danger: true, separatorBefore: i === 0, onSelect: () => removeFrom(g) })),
  ];

  return (
    <Page
      title={s.name}
      back={back}
      eyebrow={f.groups.length ? <span className="eyebrow">{f.groups.map((g) => g.name).join(' · ')}</span> : undefined}
      subtitle={(sup?.neae || sup?.acnee || sup?.kind || sup?.adaptation) ? (
        <span className="chip-row">
          {sup?.acnee ? <Chip tone="info">ACNEE</Chip> : sup?.neae ? <Chip tone="info">NEAE</Chip> : null}
          {sup?.kind && <Chip tone="info">{sup.kind}</Chip>}
          {sup?.adaptation && <Chip tone="outline">{sup.adaptation.replace(/\.$/, '')}</Chip>}
        </span>
      ) : undefined}
      actions={<Menu trigger={(open) => <IconButton label="Más opciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>} items={menu} />}
      toolbar={
        <div className="st-actions">
          <Button variant="tinted" icon={<NotePencil size={18} />} onClick={() => setNoting(true)}>Anotar</Button>
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
            ) : f.courses.map((sc) => <CourseGrades key={sc.course.id} sc={sc} />)}
          </Section>
          {f.courses.length > 0 && (
            <Section title="Asistencia">
              <List>
                {f.courses.map((sc) => (
                  <Row key={sc.course.id} lead={<Dot color={sc.course.color} large />} title={sc.course.label} wrapSub
                    sub={<span className="st-att"><span>{attendanceText(sc)}</span>{homeworkText(sc) && <span>{homeworkText(sc)}</span>}</span>}
                    to={`/clases/${sc.course.id}/asistencia`} />
                ))}
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
          <Section title="Observaciones" action={f.notes.length > 0 ? <button type="button" className="section__action" onClick={() => setNoting(true)}>Anotar</button> : undefined}>
            {f.notes.length === 0 ? (
              <div className="list">
                <EmptyState icon={<NotePencil size={24} />} title="Sin observaciones"
                  text="Apunta lo que veas en clase: te servirá en la evaluación y en las tutorías."
                  action={<Button variant="tinted" onClick={() => setNoting(true)}>Anotar</Button>} />
              </div>
            ) : (
              <List>{f.notes.map((n) => <NoteRow key={n.id} note={n} onEdit={setEditNote} />)}</List>
            )}
          </Section>
        </div>
      </div>

      <QuickNoteSheet open={noting} onClose={() => setNoting(false)} studentIds={[s.id]}
        courseId={f.courses.length === 1 ? f.courses[0].course.id : undefined} />
      <BriefSheet open={briefing} onClose={() => setBriefing(false)} studentId={s.id} name={s.name} />
      <EditStudentSheet open={editing} onClose={() => setEditing(false)} student={s} notesText={f.notes_text} />
      <EditNoteSheet note={editNote} onClose={() => setEditNote(null)} />
    </Page>
  );
}
