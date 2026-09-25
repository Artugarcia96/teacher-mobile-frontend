import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCourses, useCreateCourse, useGroups } from '../../api/core';
import type { GroupRef, Slot } from '../../api/types';
import { ApiError } from '../../lib/api';
import { ordinals } from '../../lib/format';
import { Button, Chip, Select, Sheet, TextField, useFeedback } from '../../ui';
import ColorSwatches, { COURSE_COLORS } from './ColorSwatches';
import ScheduleEditor from './ScheduleEditor';
import './course-forms.css';

/** [chip, subject, short name for the sidebar and compact lists]. */
const SUBJECTS: [string, string, string][] = [
  ['Matemáticas', 'Matemáticas', 'Mates'], ['Lengua', 'Lengua Castellana y Literatura', 'Lengua'], ['Inglés', 'Inglés', 'Inglés'],
  ['Geografía e Historia', 'Geografía e Historia', 'Geo. e Historia'], ['Biología', 'Biología y Geología', 'Biología'],
  ['Física y Química', 'Física y Química', 'FyQ'], ['Tecnología', 'Tecnología', 'Tecnología'], ['Ed. Física', 'Educación Física', 'Ed. Física'],
];
export const STAGES: { value: GroupRef['stage']; label: string }[] = [
  { value: 'eso', label: 'ESO' }, { value: 'bachillerato', label: 'Bachillerato' }, { value: 'primaria', label: 'Primaria' },
  { value: 'fp', label: 'FP' }, { value: 'otro', label: 'Otra' },
];

/** "2.º ESO B" → {stage: 'eso', level: 2}. */
export function guessGroup(name: string): { stage?: GroupRef['stage']; level?: number } {
  const n = name.toLowerCase();
  const stage = /bach/.test(n) ? 'bachillerato' : /eso/.test(n) ? 'eso' : /prim/.test(n) ? 'primaria'
    : /\bfp\b|ciclo|grado|cfgm|cfgs/.test(n) ? 'fp' : undefined;
  const m = n.match(/([1-6])\s*[º°ªo.]?/);
  return { stage, level: m ? Number(m[1]) : undefined };
}

const NEW = '__new__';

/** "Nueva clase": materia + grupo + horario + aula + color. Then goes to the roster to add students. */
export default function NewCourseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const groups = useGroups();
  const courses = useCourses();
  const create = useCreateCourse();

  const [subject, setSubject] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [stage, setStage] = useState<GroupRef['stage']>('eso');
  const [level, setLevel] = useState<number | ''>('');
  const [touched, setTouched] = useState(false);
  const [schedule, setSchedule] = useState<Slot[]>([]);
  const [room, setRoom] = useState('');
  const [picked, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasGroups = !!groups.data?.length;
  const used = new Set(courses.data?.map((c) => c.color));
  const color = picked ?? COURSE_COLORS.find((c) => !used.has(c)) ?? 'teal';

  useEffect(() => {
    if (!open) return;
    setSubject(''); setGroupId(null); setGroupName(''); setStage('eso'); setLevel(''); setTouched(false);
    setSchedule([]); setRoom(''); setError(null); setColor(null);
  }, [open]);

  const onGroupName = (v: string) => {
    setGroupName(v);
    if (touched) return;
    const g = guessGroup(v);
    if (g.stage) setStage(g.stage);
    setLevel(g.level ?? '');
  };

  const isNew = groupId === NEW || (!hasGroups && groupId === null);
  const groupOk = isNew ? groupName.trim().length > 0 : !!groupId;
  const blocker = !subject.trim() ? 'Escribe la materia' : !groupOk ? (isNew ? 'Escribe el nombre del grupo' : 'Elige un grupo') : null;

  const submit = async () => {
    setError(null);
    try {
      const short = SUBJECTS.find(([, full]) => full === subject.trim())?.[2] ?? null;
      const c = await create.mutateAsync({
        subject: subject.trim(), short, color, room: room.trim() || null, schedule,
        ...(isNew ? { new_group: { name: groupName.trim(), stage, level: level === '' ? null : level } } : { group_id: groupId! }),
      });
      toast('Clase creada');
      onClose();
      navigate(`/clases/${c.id}/alumnos${c.student_count ? '' : '?anadir=1'}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se ha podido crear la clase. Inténtalo de nuevo.');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nueva clase" size="large"
      footer={<Button full onClick={submit} loading={create.isPending} disabled={!!blocker}>{blocker ?? 'Crear clase'}</Button>}>
      <div className="form">
        <div className="chips-field">
          <TextField label="Materia" placeholder="Matemáticas" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <div className="chip-row">
            {SUBJECTS.map(([label, full]) => (
              <Chip key={full} selected={subject === full} onClick={() => setSubject(full)}>{label}</Chip>
            ))}
          </div>
        </div>

        <div className="chips-field">
          <span className="field__label">Grupo</span>
          {hasGroups && (
            <div className="chip-row">
              {groups.data!.map((g) => (
                <Chip key={g.id} selected={groupId === g.id} onClick={() => setGroupId(g.id)}>{ordinals(g.name)}</Chip>
              ))}
              <Chip tone="outline" selected={groupId === NEW} onClick={() => setGroupId(NEW)}>Nuevo grupo</Chip>
            </div>
          )}
          {isNew && (
            <div className="new-group">
              <TextField aria-label="Nombre del grupo" placeholder="2.º ESO B" value={groupName}
                onChange={(e) => onGroupName(e.target.value)} />
              <Select aria-label="Etapa" value={stage} onChange={(e) => { setStage(e.target.value as GroupRef['stage']); setTouched(true); }}>
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
              <Select aria-label="Curso" value={level} onChange={(e) => { setLevel(e.target.value ? Number(e.target.value) : ''); setTouched(true); }}>
                <option value="">Curso</option>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}.º</option>)}
              </Select>
            </div>
          )}
          {!isNew && groupId && (
            <span className="field__hint">
              {(() => {
                const g = groups.data?.find((x) => x.id === groupId);
                return g?.student_count
                  ? `Ya tiene ${g.student_count} alumnos: se usarán en esta clase. ¿Solo algunos? Elige «Nuevo grupo» y añádelos desde ${ordinals(g.name)}.`
                  : 'Aún no tiene alumnos.';
              })()}
            </span>
          )}
        </div>

        <div className="chips-field">
          <span className="field__label">Horario</span>
          <ScheduleEditor value={schedule} onChange={setSchedule} />
        </div>

        <TextField label="Aula" placeholder="204" value={room} onChange={(e) => setRoom(e.target.value)} />

        <div className="chips-field">
          <span className="field__label">Color</span>
          <ColorSwatches value={color} onChange={setColor} />
        </div>
        {error && <div className="field__error" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
