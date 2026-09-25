/** "Anotar": observación rápida ligada a una clase y/o alumnos. Usada desde Hoy, Clase y Alumno. */
import { MagnifyingGlass, Plus } from '@phosphor-icons/react';
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
  /** Only these classes to choose from (a student's, from the ficha); with one, it is chosen. */
  courseIds?: string[];
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
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'i', 'da', 'van', 'von']);

type Named = { id: string; first_name: string; last_name: string };

/** «Cano, Jorge»: first surname (with its particles: «de la Fuente») and first name, as in the class register; both
 *  surnames when two students of the class would read the same («Cano Álvarez, Jorge» · «Cano Ibáñez, Jorge»). */
function chipNames(roster: Named[]): Record<string, string> {
  const short = (s: Named) => {
    const words = s.last_name.split(/\s+/).filter(Boolean);
    const n = words.findIndex((w) => !PARTICLES.has(w.toLowerCase()));
    return `${words.slice(0, n < 0 ? words.length : n + 1).join(' ')}, ${s.first_name}`;
  };
  const seen = new Map<string, number>();
  for (const s of roster) seen.set(short(s), (seen.get(short(s)) ?? 0) + 1);
  return Object.fromEntries(roster.map((s) => [s.id, (seen.get(short(s)) ?? 0) > 1 ? `${s.last_name}, ${s.first_name}` : short(s)]));
}

const PLACEHOLDER: Record<NoteKind, string> = {
  observation: 'Qué has observado',
  incident: 'Qué ha pasado',
  positive: 'Qué ha hecho bien',
  family: 'Llamada, reunión, acuerdo…',
};

export default function QuickNoteSheet(props: QuickNoteSheetProps) {
  if (!props.open) return null;
  return <NoteSheetBody key={`${props.courseId ?? ''}|${(props.courseIds ?? []).join(',')}|${(props.studentIds ?? []).join(',')}`} {...props} />;
}

function NoteSheetBody({ onClose, courseId: fixedCourse, courseIds, studentIds }: QuickNoteSheetProps) {
  const { toast } = useFeedback();
  const onlyCourse = fixedCourse ?? (courseIds?.length === 1 ? courseIds[0] : undefined);
  const [courseId, setCourseId] = useState<string | undefined>(onlyCourse);
  const [kind, setKind] = useState<NoteKind>('observation');
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>(studentIds ?? []);
  const [search, setSearch] = useState('');
  // Opened for some students (a ficha): only they are shown until «Añadir alumnos».
  const [adding, setAdding] = useState(!studentIds?.length);
  const courses = useCourses();
  const roster = useCourseStudents(courseId);
  const create = useCreateNote();
  const course = courses.data?.find((c) => c.id === courseId);
  const choices = courseIds ? courses.data?.filter((c) => courseIds.includes(c.id)) : courses.data;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = roster.data ?? [];
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q) || s.sort_name.toLowerCase().includes(q) || selected.includes(s.id));
  }, [roster.data, search, selected]);

  const names = useMemo(() => chipNames(roster.data ?? []), [roster.data]);
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
        ) : !choices?.length ? (
          <p className="muted">{courseIds ? 'No está en ninguna de tus clases.' : 'Aún no tienes clases.'}</p>
        ) : (
          <List>
            {choices.map((c) => (
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
      {!onlyCourse && <button type="button" className="section__action" onClick={() => { setCourseId(undefined); setSelected(studentIds ?? []); }}>Cambiar</button>}</span>}
      footer={<Button full onClick={submit} loading={create.isPending} disabled={!!disabledReason}>{disabledReason ?? 'Guardar'}</Button>}>
      <div className="form">
        <div className="note-seg"><Segmented full label="Tipo" value={kind} options={KINDS} onChange={setKind} /></div>
        <TextArea aria-label="Texto" placeholder={PLACEHOLDER[kind]} value={text} rows={3} onChange={(e) => setText(e.target.value)} className="note-text"
          data-autofocus="always" />
        <div className="note-students">
          <div className="note-students__head">
            <span className="field__label">{selected.length ? `${selected.length} ${selected.length === 1 ? 'alumno' : 'alumnos'}` : 'Alumnos (opcional)'}</span>
            {adding && selected.length > 0 && <button type="button" className="section__action" onClick={() => setSelected([])}>Quitar todos</button>}
          </div>
          {adding && (roster.data?.length ?? 0) > 10 && (
            <label className="note-search">
              <MagnifyingGlass size={16} />
              <input className="input" placeholder="Buscar alumno" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar alumno" />
            </label>
          )}
          {roster.isLoading ? <SkeletonList rows={2} /> : roster.error ? (
            <p className="muted">{(roster.error as Error).message}</p>
          ) : (
            <div className="chip-row">
              {(adding ? visible : visible.filter((s) => studentIds?.includes(s.id) || selected.includes(s.id))).map((s) => (
                <Chip key={s.id} selected={selected.includes(s.id)} onClick={() => toggle(s.id)}>
                  {names[s.id]}
                </Chip>
              ))}
              {adding && visible.length === 0 && <span className="muted">{roster.data?.length ? 'Ningún alumno coincide.' : 'Esta clase aún no tiene alumnos.'}</span>}
              {!adding && <Chip tone="outline" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Añadir alumnos</Chip>}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
