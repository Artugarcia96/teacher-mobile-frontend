import { Plus } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useCourses, useSavePeriods } from '../../api/core';
import type { CourseSummary, Period, Slot } from '../../api/types';
import { useAuth } from '../../lib/auth';
import { courseLabel, plural } from '../../lib/format';
import { Button, TimeField, useFeedback } from '../../ui';
import './course-forms.css';

const DAYS = ['L', 'M', 'X', 'J', 'V'];
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

const same = (s: Slot, d: number, a: string, b: string) => s.weekday === d && s.start === a && s.end === b;
const overlaps = (a: string, b: string, c: string, d: string) => a < d && c < b;
/** "2º ESO B" → "2 B", "1º Bach B" → "1 Bach B": fits a timetable cell. */
const groupShort = (name: string) => name.replace(/[º°ª.]/g, '').replace(/\bESO\b/i, '').replace(/\s+/g, ' ').trim();
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmm = (m: number) => `${String(Math.min(Math.floor(m / 60), 23)).padStart(2, '0')}:${String(m >= 24 * 60 ? 59 : m % 60).padStart(2, '0')}`;

/** A new period starts where the last row ends and lasts what most of hers last (55 min in most schools). */
function nextPeriod(rows: Period[]): Period {
  const lengths = new Map<number, number>();
  for (const [a, b] of rows) lengths.set(minutes(b) - minutes(a), (lengths.get(minutes(b) - minutes(a)) ?? 0) + 1);
  const usual = [...lengths].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 55;
  const start = rows.at(-1)?.[1] ?? '08:30';
  return [start, hhmm(minutes(start) + usual)];
}

/** Weekly timetable as a grid (days × periods): tap the cells where you teach this class. The rows are the school's
 *  periods, stored once for all her classes («Otra hora» adds one there and replaces any it overlaps), plus the slots
 *  her classes use; the cells taken by another class are shown with its group and cannot be chosen. */
export default function ScheduleEditor({ value, onChange, courseId }: { value: Slot[]; onChange: (v: Slot[]) => void; courseId?: string }) {
  const courses = useCourses();
  const { me } = useAuth();
  const savePeriods = useSavePeriods();
  const { toast } = useFeedback();
  const others = useMemo(() => (courses.data ?? []).filter((c) => c.id !== courseId), [courses.data, courseId]);
  const periods = useMemo(() => me?.school_year.periods ?? [], [me]);
  const [adding, setAdding] = useState<Period | null>(null);

  const rows = useMemo(() => {
    const used = [...others.flatMap((c) => c.schedule), ...value].map((s) => [s.start, s.end] as Period);
    const all = new Map<string, Period>();
    for (const t of [...periods, ...used]) all.set(t.join('-'), t);
    return [...all.values()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  }, [periods, others, value]);

  const takenBy = (d: number, a: string, b: string): CourseSummary | undefined =>
    others.find((c) => c.schedule.some((s) => s.weekday === d && overlaps(a, b, s.start, s.end)));

  const toggle = (d: number, a: string, b: string) => {
    const on = value.some((s) => same(s, d, a, b));
    onChange(on ? value.filter((s) => !same(s, d, a, b))
      : [...value, { weekday: d, start: a, end: b }].sort((x, y) => x.weekday - y.weekday || x.start.localeCompare(y.start)));
  };

  const addPeriod = async () => {
    if (!adding) return;
    const [a, b] = adding;
    try {
      await savePeriods.mutateAsync([...periods.filter(([c, d]) => !overlaps(a, b, c, d)), [a, b]]);
      setAdding(null);
      toast(`Hora ${a}–${b} añadida a tus clases`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };
  const blocker = adding && (!adding[0] || !adding[1] ? 'Pon las dos horas' : adding[1] <= adding[0] ? 'Termina antes de empezar' : null);

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
        <Button type="button" size="sm" variant="plain" icon={adding ? undefined : <Plus size={16} />}
          onClick={() => setAdding(adding ? null : nextPeriod(rows))}>{adding ? 'Cancelar' : 'Otra hora'}</Button>
      </div>
      {adding && (
        <div className="sched__add">
          <TimeField label="Empieza" value={adding[0]} onChange={(v) => setAdding([v, adding[1]])} />
          <TimeField label="Termina" value={adding[1]} onChange={(v) => setAdding([adding[0], v])} />
          <Button type="button" variant="tinted" onClick={addPeriod} loading={savePeriods.isPending} disabled={!!blocker}>
            {blocker ?? 'Añadir hora'}
          </Button>
        </div>
      )}
    </div>
  );
}

/** "L, X 08:30 · J 10:20" — compact schedule summary. */
export function scheduleSummary(slots: Slot[]): string {
  return slots.map((s) => `${DAYS[s.weekday]} ${s.start}`).join(' · ');
}
