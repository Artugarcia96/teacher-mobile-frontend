import { CaretDown } from '@phosphor-icons/react';
import { useState } from 'react';
import { KIND_CATEGORY, type ActivityInput, type ActivityKind } from '../../api/activities';
import type { Category } from '../../api/types';
import { useUnits } from '../../api/units';
import { useAuth } from '../../lib/auth';
import { formatNumber, TERM_LABEL } from '../../lib/format';
import { Button, Chip, Select, Stepper, TextField } from '../../ui';
import { KindIcon, KINDS, termForDate } from './kinds';
import './activities.css';

export interface ActivityFormValue {
  title: string; kind: ActivityKind; date: string; max_score: number; category: string; weight: number; unit_ids: string[];
}

export function toInput(v: ActivityFormValue): ActivityInput {
  return { title: v.title.trim(), kind: v.kind, date: v.date, max_score: v.max_score, category: v.category, weight: v.weight, unit_ids: v.unit_ids };
}

/** Fields shared by NewActivitySheet and EditActivitySheet. Controlled. */
export function ActivityForm({ value, onChange, categories, courseId, moreOpen, autoFocus }: {
  value: ActivityFormValue; onChange: (v: ActivityFormValue) => void; categories: Category[]; courseId: string;
  moreOpen?: boolean; autoFocus?: boolean;
}) {
  const { me } = useAuth();
  const [more, setMore] = useState(!!moreOpen);
  const [catTouched, setCatTouched] = useState(!!moreOpen);
  const units = useUnits(courseId);
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
          hint={term ? `Cuenta para la ${TERM_LABEL[term]}` : undefined} />
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
