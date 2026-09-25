/** "Anotar": observación rápida ligada a una clase y/o alumnos. Usada desde Hoy, Clase y Alumno. */
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useCourses, useCourseStudents } from '../../api/core';
import { useCreateNote } from '../../api/notes';
import type { NoteKind } from '../../api/types';
import { Button, Chip, Dot, List, Row, Segmented, Sheet, SkeletonList, TextArea } from '../../ui';
import { useFeedback } from '../../ui';
import './notes.css';

export interface QuickNoteSheetProps {
  open: boolean;
  onClose: () => void;
  /** Preselect a class (limits student chips to its roster). */
  courseId?: string;
  /** Preselect students. */
  studentIds?: string[];
}

const KINDS: { value: NoteKind; label: string }[] = [
  { value: 'observation', label: 'Observación' },
  { value: 'incident', label: 'Incidencia' },
  { value: 'positive', label: 'Positivo' },
  { value: 'family', label: 'Familia' },
];
const SAVED: Record<NoteKind, string> = {
  observation: 'Observación guardada', incident: 'Incidencia guardada', positive: 'Positivo guardado', family: 'Nota de familia guardada',
};
const PLACEHOLDER: Record<NoteKind, string> = {
  observation: 'Qué habéis hecho, qué queda pendiente…',
  incident: 'Qué ha pasado',
  positive: 'Qué ha hecho bien',
  family: 'Llamada, reunión, acuerdo…',
};

export default function QuickNoteSheet(props: QuickNoteSheetProps) {
  if (!props.open) return null;
  return <NoteSheetBody key={`${props.courseId ?? ''}|${(props.studentIds ?? []).join(',')}`} {...props} />;
}

function NoteSheetBody({ onClose, courseId: fixedCourse, studentIds }: QuickNoteSheetProps) {
  const { toast } = useFeedback();
  const [courseId, setCourseId] = useState<string | undefined>(fixedCourse);
  const [kind, setKind] = useState<NoteKind>('observation');
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>(studentIds ?? []);
  const [search, setSearch] = useState('');
  const courses = useCourses();
  const roster = useCourseStudents(courseId);
  const create = useCreateNote();
  const course = courses.data?.find((c) => c.id === courseId);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = roster.data ?? [];
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q) || s.sort_name.toLowerCase().includes(q) || selected.includes(s.id));
  }, [roster.data, search, selected]);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = async () => {
    try {
      await create.mutateAsync({ course_id: courseId ?? null, kind, text: text.trim(), student_ids: selected });
      toast(SAVED[kind]);
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  // Step 1 (no class given): choose the class.
  if (!courseId) {
    return (
      <Sheet open onClose={onClose} title="Anotar" subtitle="Elige la clase">
        {courses.isLoading ? <SkeletonList rows={4} /> : courses.error ? (
          <p className="muted">{(courses.error as Error).message}</p>
        ) : !courses.data?.length ? (
          <p className="muted">Aún no tienes clases.</p>
        ) : (
          <List>
            {courses.data.map((c) => (
              <Row key={c.id} lead={<Dot color={c.color} large />} title={c.label} sub={`${c.student_count} alumnos`} onClick={() => setCourseId(c.id)} />
            ))}
          </List>
        )}
      </Sheet>
    );
  }

  const disabledReason = !text.trim() ? 'Escribe la observación' : null;
  return (
    <Sheet open onClose={onClose} dirty={!!text.trim()} title="Anotar" subtitle={course && <span className="note-course"><Dot color={course.color} />{course.label}
      {!fixedCourse && <button type="button" className="section__action" onClick={() => { setCourseId(undefined); setSelected(studentIds ?? []); }}>Cambiar</button>}</span>}
      footer={<Button full onClick={submit} loading={create.isPending} disabled={!!disabledReason} title={disabledReason ?? undefined}>Guardar</Button>}>
      <div className="form">
        <div className="note-seg"><Segmented full label="Tipo" value={kind} options={KINDS} onChange={setKind} /></div>
        <TextArea aria-label="Texto" placeholder={PLACEHOLDER[kind]} value={text} rows={3} onChange={(e) => setText(e.target.value)} className="note-text"
          data-autofocus="always" />
        <div className="note-students">
          <div className="note-students__head">
            <span className="field__label">{selected.length ? `${selected.length} ${selected.length === 1 ? 'alumno' : 'alumnos'}` : 'Alumnos (opcional)'}</span>
            {selected.length > 0 && <button type="button" className="section__action" onClick={() => setSelected([])}>Quitar todos</button>}
          </div>
          {(roster.data?.length ?? 0) > 10 && (
            <label className="note-search">
              <MagnifyingGlass size={16} />
              <input className="input" placeholder="Buscar alumno" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar alumno" />
            </label>
          )}
          {roster.isLoading ? <SkeletonList rows={2} /> : roster.error ? (
            <p className="muted">{(roster.error as Error).message}</p>
          ) : (
            <div className="chip-row">
              {visible.map((s) => (
                <Chip key={s.id} selected={selected.includes(s.id)} onClick={() => toggle(s.id)}>
                  {s.first_name} {s.last_name.split(' ')[0]}
                </Chip>
              ))}
              {visible.length === 0 && <span className="muted">{roster.data?.length ? 'Ningún alumno coincide.' : 'Esta clase aún no tiene alumnos.'}</span>}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
