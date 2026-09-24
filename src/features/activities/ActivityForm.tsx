import { CaretDown } from '@phosphor-icons/react';
import { useState } from 'react';
import { useCourseStudents } from '../../api/core';
import { KIND_CATEGORY, type ActivityInput, type ActivityKind, type CountsFor } from '../../api/activities';
import { finalRecoveryLabel } from '../../api/evaluation';
import type { Category } from '../../api/types';
import { useUnits } from '../../api/units';
import { useAuth } from '../../lib/auth';
import { formatNumber, plural, TERM_LABEL, TERM_SHORT } from '../../lib/format';
import { Button, Chip, Select, Stepper, TextField } from '../../ui';
import { KindIcon, KINDS, termForDate } from './kinds';
import './activities.css';

export interface ActivityFormValue {
  title: string; kind: ActivityKind; date: string; max_score: number; category: string; weight: number; unit_ids: string[];
  counts_for: CountsFor; recovers_term: number | null;
  /** Only these students (null = whole class). */
  student_ids: string[] | null;
}

export function toInput(v: ActivityFormValue): ActivityInput {
  return {
    title: v.title.trim(), kind: v.kind, date: v.date, max_score: v.max_score, category: v.category, weight: v.weight, unit_ids: v.unit_ids,
    counts_for: v.counts_for, recovers_term: v.counts_for === 'recovery' ? v.recovers_term : null, student_ids: v.student_ids,
  };
}

/** "Cuenta para" options: encoded as average | none | rec-1..rec-4. The final recovery is the extraordinaria only in
 * Bachillerato (LOMLOE). */
function countsForOptions(stage: string) {
  return [
    { value: 'average', label: 'La media de la evaluación' },
    { value: 'none', label: 'No cuenta (evaluación inicial, diagnóstica)' },
    ...[1, 2, 3].map((t) => ({ value: `rec-${t}`, label: `Recuperar la ${TERM_SHORT[t]} evaluación` })),
    { value: 'rec-4', label: stage === 'bachillerato' ? 'Recuperar la final (extraordinaria)' : 'Recuperar la final' },
  ];
}

function countsValue(v: ActivityFormValue): string {
  return v.counts_for === 'recovery' ? `rec-${v.recovers_term ?? 1}` : v.counts_for;
}

function dateHint(v: ActivityFormValue, term: number | null, stage: string): string | undefined {
  if (v.counts_for === 'recovery') {
    return v.recovers_term === 4 ? `Recuperación ${finalRecoveryLabel(stage)}` : `Recupera la ${TERM_LABEL[v.recovers_term ?? 1]}`;
  }
  if (v.counts_for === 'none') return 'No cuenta para la media';
  return term ? `Cuenta para la ${TERM_LABEL[term]}` : undefined;
}

/** Fields shared by NewActivitySheet and EditActivitySheet. Controlled. `stage` of the class (labels of the final recovery). */
export function ActivityForm({ value, onChange, categories, courseId, stage, moreOpen, autoFocus }: {
  value: ActivityFormValue; onChange: (v: ActivityFormValue) => void; categories: Category[]; courseId: string; stage: string;
  moreOpen?: boolean; autoFocus?: boolean;
}) {
  const { me } = useAuth();
  const [more, setMore] = useState(!!moreOpen);
  const [catTouched, setCatTouched] = useState(!!moreOpen);
  const units = useUnits(courseId);
  const students = useCourseStudents(more ? courseId : undefined);
  // Students already chosen when the form opens (a recovery for the failing ones) are listed first.
  const [firstIds] = useState(() => new Set(value.student_ids ?? []));
  const roster = [...(students.data ?? [])].sort((a, b) => Number(firstIds.has(b.id)) - Number(firstIds.has(a.id)));
  const term = termForDate(me?.school_year, value.date);
  const set = (patch: Partial<ActivityFormValue>) => onChange({ ...value, ...patch });

  const setKind = (kind: ActivityKind) => {
    const def = KIND_CATEGORY[kind];
    const category = !catTouched && categories.some((c) => c.key === def) ? def : value.category;
    set({ kind, category });
  };

  return (
    <div className="form">
      <TextField label="Título" value={value.title} maxLength={200} placeholder="Examen U3 · Ecuaciones"
        autoFocus={autoFocus} onChange={(e) => set({ title: e.target.value })} />
      <div className="field">
        <span className="field__label">Tipo</span>
        <div className="chip-row">
          {KINDS.map((k) => (
            <Chip key={k.value} selected={value.kind === k.value} onClick={() => setKind(k.value)} icon={<KindIcon kind={k.value} />}>
              {k.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="act-form__row">
        <TextField label="Fecha" type="date" value={value.date} required onChange={(e) => e.target.value && set({ date: e.target.value })}
          hint={dateHint(value, term, stage)} />
        <div className="field">
          <span className="field__label">Nota máxima</span>
          <Stepper label="Nota máxima" value={value.max_score} min={1} max={100} onChange={(v) => set({ max_score: v })} />
        </div>
      </div>
      {!more ? (
        <Button type="button" variant="plain" size="sm" className="act-form__more" icon={<CaretDown size={14} />} onClick={() => setMore(true)}>
          Más opciones
        </Button>
      ) : (
        <>
          <div className="act-form__row">
            <Select label="Categoría" value={value.category} onChange={(e) => { setCatTouched(true); set({ category: e.target.value }); }}>
              {categories.map((c) => <option key={c.key} value={c.key}>{c.label} ({formatNumber(c.weight, 0)} %)</option>)}
            </Select>
            <div className="field">
              <span className="field__label">Peso dentro de la categoría</span>
              <Stepper label="Peso" value={value.weight} min={0.5} max={10} step={0.5} format={(v) => `×${formatNumber(v)}`}
                onChange={(v) => set({ weight: v })} />
            </div>
          </div>
          <Select label="Cuenta para" value={countsValue(value)} onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith('rec-')) set({ counts_for: 'recovery', recovers_term: Number(v.slice(4)) });
            else set({ counts_for: v as CountsFor, recovers_term: null });
          }}>
            {countsForOptions(stage).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {roster.length > 0 && (
            <div className="field">
              <span className="field__label">
                Alumnos · {value.student_ids ? `${plural(value.student_ids.length, 'alumno', 'alumnos')} de ${roster.length}` : 'toda la clase'}
              </span>
              <div className="chip-row">
                <Chip selected={!value.student_ids} onClick={() => set({ student_ids: value.student_ids ? null : [] })}>Toda la clase</Chip>
                {value.student_ids && roster.map((st) => {
                  const on = value.student_ids!.includes(st.id);
                  return (
                    <Chip key={st.id} selected={on}
                      onClick={() => set({ student_ids: on ? value.student_ids!.filter((x) => x !== st.id) : [...value.student_ids!, st.id] })}>
                      {st.first_name} {st.last_name.split(' ')[0]}
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}
          {!!units.data?.length && (
            <div className="field">
              <span className="field__label">Unidades</span>
              <div className="chip-row">
                {units.data.map((u) => {
                  const on = value.unit_ids.includes(u.id);
                  return (
                    <Chip key={u.id} selected={on}
                      onClick={() => set({ unit_ids: on ? value.unit_ids.filter((x) => x !== u.id) : [...value.unit_ids, u.id] })}>
                      {u.title}
                    </Chip>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
