import { useState, type FormEvent } from 'react';
import { useCreateUnit, usePatchUnit, type Unit } from '../../api/units';
import { useAuth } from '../../lib/auth';
import { Button, Segmented, Sheet, TextField, useFeedback } from '../../ui';

export const TERM_OPTIONS = [
  { value: 1, label: '1.ª' },
  { value: 2, label: '2.ª' },
  { value: 3, label: '3.ª' },
];

export interface UnitFormSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  /** Edit this unit; without it the sheet creates a new one. */
  unit?: Unit | null;
  /** Evaluación preselected when creating. */
  term?: number;
}

/** New unit, or rename / move to another evaluación. */
export default function UnitFormSheet(props: UnitFormSheetProps) {
  if (!props.open) return null;
  return <UnitForm key={props.unit?.id ?? 'new'} {...props} />;
}

function UnitForm({ open, onClose, courseId, unit, term }: UnitFormSheetProps) {
  const { me } = useAuth();
  const { toast } = useFeedback();
  const create = useCreateUnit(courseId);
  const patch = usePatchUnit(courseId);
  const [title, setTitle] = useState(unit?.title ?? '');
  const [t, setT] = useState<number>(unit?.term ?? term ?? me?.school_year.current_term ?? 1);
  const busy = create.isPending || patch.isPending;
  const clean = title.trim();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!clean || busy) return;
    try {
      if (unit) {
        await patch.mutateAsync({ id: unit.id, title: clean, term: t });
        toast('Unidad actualizada');
      } else {
        await create.mutateAsync({ title: clean, term: t });
        toast('Unidad añadida');
      }
      onClose();
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={unit ? 'Editar unidad' : 'Nueva unidad'}
      footer={<Button full onClick={() => submit()} loading={busy} disabled={!clean}>{!clean ? 'Escribe el título' : unit ? 'Guardar' : 'Añadir unidad'}</Button>}>
      <form className="form" onSubmit={submit}>
        <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Por ejemplo: Fracciones" maxLength={200} />
        <div className="field">
          <span className="field__label">Evaluación</span>
          <Segmented full label="Evaluación" value={t} options={TERM_OPTIONS} onChange={setT} />
        </div>
      </form>
    </Sheet>
  );
}
