import { useState } from 'react';
import { useCourses } from '../../api/core';
import { useCopyUnits, useUnits } from '../../api/units';
import { plural } from '../../lib/format';
import { Button, Callout, Select, Sheet, useFeedback } from '../../ui';

/** Copy the programación (units + their materials) of another class of the teacher. */
export default function CopyUnitsSheet({ open, onClose, courseId }: { open: boolean; onClose: () => void; courseId: string }) {
  if (!open) return null;
  return <CopyUnits onClose={onClose} courseId={courseId} />;
}

function CopyUnits({ onClose, courseId }: { onClose: () => void; courseId: string }) {
  const { toast } = useFeedback();
  const courses = useCourses();
  const others = (courses.data ?? []).filter((c) => c.id !== courseId);
  const [from, setFrom] = useState('');
  const source = from || others[0]?.id || '';
  const units = useUnits(source || undefined);
  const copy = useCopyUnits(courseId);
  const n = units.data?.length ?? 0;
  const mats = (units.data ?? []).reduce((s, u) => s + u.material_count, 0);

  const submit = async () => {
    try {
      await copy.mutateAsync(source);
      toast(`Programación copiada: ${plural(n, 'unidad', 'unidades')}`);
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const reason = !others.length ? 'No tienes otras clases' : units.isLoading ? 'Cargando…' : !n ? 'Esa clase no tiene unidades' : null;
  return (
    <Sheet open onClose={onClose} title="Copiar de otra clase"
      footer={<Button full onClick={submit} loading={copy.isPending} disabled={!!reason}>
        {reason ?? `Copiar ${plural(n, 'unidad', 'unidades')}`}
      </Button>}>
      <div className="form">
        <Select label="Clase" value={source} onChange={(e) => setFrom(e.target.value)} disabled={!others.length}>
          {others.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        {n > 0 && (
          <Callout>
            Se añaden {plural(n, 'unidad', 'unidades')}{mats ? ` con ${plural(mats, 'material', 'materiales')}` : ''} al final de cada evaluación, todas como pendientes.
          </Callout>
        )}
      </div>
    </Sheet>
  );
}
