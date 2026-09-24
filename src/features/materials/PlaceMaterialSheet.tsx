import { useState } from 'react';
import { useCourses } from '../../api/core';
import { useCopyMaterial, useUnits, useUpdateMaterial, type Material, type Unit } from '../../api/units';
import { TERM_SHORT } from '../../lib/format';
import { Button, Select, Sheet, Spinner, useFeedback } from '../../ui';

export type PlaceMode = 'move' | 'copy';

/** Default target unit: same title in the other class (the usual case: two groups of the same level), else the current one. */
function pickUnit(units: Unit[], title: string, exclude?: string): string {
  const free = units.filter((u) => u.id !== exclude);
  const same = free.find((u) => u.title.trim().toLowerCase() === title.trim().toLowerCase());
  return (same ?? free.find((u) => u.status === 'current') ?? free[0])?.id ?? '';
}

/** "Mover a…" (another unit, maybe another class) or "Usar en otra clase…" (a copy that shares the files). */
export default function PlaceMaterialSheet({ material, mode, courseId, unitTitle, onClose }: {
  material: Material; mode: PlaceMode; courseId: string; unitTitle: string; onClose: () => void;
}) {
  const courses = useCourses();
  const others = (courses.data ?? []).filter((c) => c.id !== courseId);
  // Chosen class, or the default once the classes have loaded: another class to copy, this one to move.
  const [chosen, setChosen] = useState<string | null>(null);
  const target = chosen ?? (mode === 'copy' ? others[0]?.id ?? courseId : courseId);
  const units = useUnits(target);
  const exclude = target === courseId ? material.unit_id ?? undefined : undefined;
  const [picked, setPicked] = useState<{ course: string; unit: string } | null>(null);
  const unitId = picked?.course === target ? picked.unit : pickUnit(units.data ?? [], unitTitle, exclude);
  const update = useUpdateMaterial();
  const copy = useCopyMaterial();
  const { toast } = useFeedback();
  const busy = update.isPending || copy.isPending;

  const course = courses.data?.find((c) => c.id === target);
  const unit = units.data?.find((u) => u.id === unitId);
  const options = (units.data ?? []).filter((u) => u.id !== exclude);
  const terms = [1, 2, 3, null].map((t) => ({ t, units: options.filter((u) => u.term === t) })).filter((g) => g.units.length);

  const save = async () => {
    if (!unit || !course) return;
    try {
      if (mode === 'move') {
        await update.mutateAsync({ id: material.id, unit_id: unit.id });
        toast(`Movido a «${unit.title}»${course.id !== courseId ? ` · ${course.group.name}` : ''}`);
      } else {
        await copy.mutateAsync({ id: material.id, unitId: unit.id });
        toast(`Copiado en ${course.label}`);
      }
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  let reason = '';
  if (units.isLoading) reason = 'Cargando unidades…';
  else if (!units.data?.length) reason = 'Esa clase aún no tiene unidades';
  else if (!options.length) reason = 'Esa clase no tiene otras unidades';
  const label = mode === 'move' ? 'Mover aquí' : 'Copiar aquí';

  return (
    <Sheet open onClose={onClose} title={mode === 'move' ? 'Mover a…' : 'Usar en otra clase'}
      subtitle={mode === 'copy' ? 'Se copia a la otra unidad; los cambios en una copia no afectan a la otra.' : undefined}
      footer={<Button full disabled={!!reason || !unit} loading={busy} onClick={save}>{reason || label}</Button>}>
      <div className="form">
        <div className="place-what">{material.title}</div>
        {courses.isLoading ? <Spinner /> : (
          <Select label="Clase" value={target} onChange={(e) => { setChosen(e.target.value); setPicked(null); }}>
            {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        )}
        {options.length > 0 && (
          <Select label="Unidad" value={unitId} onChange={(e) => setPicked({ course: target, unit: e.target.value })}>
            {terms.map((g) => (
              <optgroup key={g.t ?? 'none'} label={g.t ? `${TERM_SHORT[g.t]} evaluación` : 'Sin evaluación'}>
                {g.units.map((u) => <option key={u.id} value={u.id}>{u.title}{u.status === 'current' ? ' (en curso)' : ''}</option>)}
              </optgroup>
            ))}
          </Select>
        )}
        {!units.isLoading && !options.length && (
          <p className="muted place-hint">Crea antes la unidad en la Programación de {course?.group.name ?? 'esa clase'}.</p>
        )}
      </div>
    </Sheet>
  );
}
