import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { invalidateCorrection, type ActivityHead } from '../../api/papers';
import { api } from '../../lib/api';
import { parseGradeInput } from '../../lib/format';
import { Button, DateField, Sheet, TextField, useFeedback } from '../../ui';

/** "Editar datos": title, date and maximum score (PATCH /activities/{id}). */
export default function ActivityDataSheet({ open, onClose, activity }: { open: boolean; onClose: () => void; activity: ActivityHead }) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [title, setTitle] = useState(activity.title);
  const [date, setDate] = useState(activity.date);
  const [max, setMax] = useState(String(activity.max_score).replace('.', ','));

  useEffect(() => {
    if (!open) return;
    setTitle(activity.title);
    setDate(activity.date);
    setMax(String(activity.max_score).replace('.', ','));
  }, [open, activity]);

  const save = useMutation({
    mutationFn: (body: { title: string; date: string; max_score: number }) => api.patch(`/activities/${activity.id}`, body),
    onSuccess: () => { invalidateCorrection(qc, activity.id, activity.course.id); toast('Datos guardados'); onClose(); },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const maxValue = parseGradeInput(max);
  const validMax = typeof maxValue === 'number' && maxValue > 0 && maxValue <= 100;
  const reason = !title.trim() ? 'Escribe un título' : !date ? 'Elige la fecha' : !validMax ? 'Revisa la nota máxima' : null;

  return (
    <Sheet open={open} onClose={onClose} title="Editar datos"
      footer={<Button disabled={!!reason} loading={save.isPending}
        onClick={() => save.mutate({ title: title.trim(), date, max_score: maxValue as number })}>{reason ?? 'Guardar'}</Button>}>
      <div className="form">
        <TextField label="Título" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <div className="form-row">
          <DateField label="Fecha" value={date} onChange={(v) => v && setDate(v)} hint="La evaluación se deduce de la fecha." />
          <TextField label="Nota máxima" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
      </div>
    </Sheet>
  );
}
