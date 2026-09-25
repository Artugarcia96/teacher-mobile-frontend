import { Plus } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useCourses } from '../../api/core';
import type { CourseSummary, Slot } from '../../api/types';
import { courseLabel, plural } from '../../lib/format';
import { Button } from '../../ui';
import './course-forms.css';

/** Usual 55-minute periods in Spanish secondary schools (recreo 11:15–11:45). */
export const TRAMOS: [string, string][] = [
  ['08:30', '09:25'], ['09:25', '10:20'], ['10:20', '11:15'], ['11:45', '12:40'], ['12:40', '13:35'], ['13:35', '14:30'],
];
const DAYS = ['L', 'M', 'X', 'J', 'V'];
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

const same = (s: Slot, d: number, a: string, b: string) => s.weekday === d && s.start === a && s.end === b;
const overlaps = (a: string, b: string, c: string, d: string) => a < d && c < b;
/** "2º ESO B" → "2 B", "1º Bach B" → "1 Bach B": fits a timetable cell. */
const groupShort = (name: string) => name.replace(/[º°ª.]/g, '').replace(/\bESO\b/i, '').replace(/\s+/g, ' ').trim();

/** Weekly timetable as a grid (days × periods): tap the cells where you teach this class. The rows are the periods
 *  the teacher already uses in her other classes (the usual 55-minute ones only where they do not clash with hers);
 *  the cells taken by another class are shown with its group and cannot be chosen. */
export default function ScheduleEditor({ value, onChange, courseId }: { value: Slot[]; onChange: (v: Slot[]) => void; courseId?: string }) {
  const courses = useCourses();
  const others = useMemo(() => (courses.data ?? []).filter((c) => c.id !== courseId), [courses.data, courseId]);
  const [extra, setExtra] = useState<[string, string][]>([]);
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState('15:30');
  const [end, setEnd] = useState('16:25');

  const rows = useMemo(() => {
    const used = [...others.flatMap((c) => c.schedule), ...value].map((s) => [s.start, s.end] as [string, string]);
    const defaults = TRAMOS.filter(([a, b]) => !used.some(([c, d]) => overlaps(a, b, c, d)));
    const all = new Map<string, [string, string]>();
    for (const t of [...used, ...defaults, ...extra]) all.set(t.join('-'), t);
    return [...all.values()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  }, [others, value, extra]);

  const takenBy = (d: number, a: string, b: string): CourseSummary | undefined =>
    others.find((c) => c.schedule.some((s) => s.weekday === d && overlaps(a, b, s.start, s.end)));

  const toggle = (d: number, a: string, b: string) => {
    const on = value.some((s) => same(s, d, a, b));
    onChange(on ? value.filter((s) => !same(s, d, a, b))
      : [...value, { weekday: d, start: a, end: b }].sort((x, y) => x.weekday - y.weekday || x.start.localeCompare(y.start)));
  };

  const addRow = () => {
    if (!start || !end || end <= start) return;
    setExtra((x) => [...x, [start, end]]);
    setAdding(false);
  };

  return (
    <div className="sched">
      <div className="sched__grid" role="grid" aria-label="Horario semanal">
        <span />
        {DAYS.map((d) => <span key={d} className="sched__day">{d}</span>)}
        {rows.map(([a, b]) => (
          <div key={`${a}-${b}`} className="sched__row" role="row">
            <span className="sched__time num">{a}<small>{b}</small></span>
            {DAYS.map((d, i) => {
              const on = value.some((s) => same(s, i, a, b));
              const other = on ? undefined : takenBy(i, a, b);
              if (other) {
                return (
                  <span key={d} role="gridcell" className="sched__cell sched__cell--taken" aria-disabled title={courseLabel(other)}
                    aria-label={`${DAY_NAMES[i]} de ${a} a ${b}: ${courseLabel(other)}`}>{groupShort(other.group.name)}</span>
                );
              }
              return (
                <button key={d} type="button" role="gridcell" className="sched__cell" aria-pressed={on}
                  aria-label={`${DAY_NAMES[i]} de ${a} a ${b}`} onClick={() => toggle(i, a, b)} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="sched__foot">
        <span className="muted">{value.length ? `${plural(value.length, 'sesión', 'sesiones')} a la semana` : 'Toca las horas en las que das esta clase.'}</span>
        {!adding && <Button type="button" size="sm" variant="plain" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Otra hora</Button>}
      </div>
      {adding && (
        <div className="sched__add">
          <input className="input" type="time" aria-label="Empieza" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className="input" type="time" aria-label="Termina" value={end} onChange={(e) => setEnd(e.target.value)} />
          <Button type="button" size="sm" variant="tinted" onClick={addRow} disabled={!start || !end || end <= start}>Añadir fila</Button>
        </div>
      )}
    </div>
  );
}

/** "L, X 08:30 · J 10:20" — compact schedule summary. */
export function scheduleSummary(slots: Slot[]): string {
  return slots.map((s) => `${DAYS[s.weekday]} ${s.start}`).join(' · ');
}
