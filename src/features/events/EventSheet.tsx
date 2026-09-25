/** Evento puntual (reunión, tutoría, sesión de evaluación, salida…). Crear o editar. */
import { useState } from 'react';
import { useCourses } from '../../api/core';
import { EVENT_KIND_LABEL, useCreateEvent, useDeleteEvent, useUpdateEvent, type EventKind, type TodayEvent } from '../../api/today';
import { Button, DateField, Select, Sheet, TextField, TimeField, useFeedback } from '../../ui';

export interface EventSheetProps {
  open: boolean;
  onClose: () => void;
  /** Default date for a new event. */
  date: string;
  /** Edit this event instead of creating one. */
  event?: TodayEvent | null;
}

export default function EventSheet(props: EventSheetProps) {
  if (!props.open) return null;
  return <EventSheetBody key={props.event?.id ?? `new-${props.date}`} {...props} />;
}

function EventSheetBody({ onClose, date, event }: EventSheetProps) {
  const { toast, confirm } = useFeedback();
  const courses = useCourses();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();
  const [f, setF] = useState({
    title: event?.title ?? '', date: event?.date ?? date, start: event?.start ?? '', end: event?.end ?? '',
    kind: (event?.kind ?? 'meeting') as EventKind, course_id: event?.course?.id ?? '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const timeError = f.start && f.end && f.end <= f.start ? 'La hora de fin debe ser posterior a la de inicio' : null;
  const reason = !f.title.trim() ? 'Escribe un título' : !f.date ? 'Elige una fecha' : timeError;

  const submit = async () => {
    const body = { title: f.title.trim(), date: f.date, start: f.start || null, end: f.end || null, kind: f.kind, course_id: f.course_id || null };
    try {
      if (event) await update.mutateAsync({ id: event.id, ...body });
      else await create.mutateAsync(body);
      toast(event ? 'Evento actualizado' : 'Evento añadido');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const del = async () => {
    if (!event) return;
    if (!(await confirm({ title: 'Eliminar evento', text: `«${event.title}» desaparecerá de tu agenda.`, confirm: 'Eliminar', danger: true }))) return;
    try {
      await remove.mutateAsync(event.id);
      toast('Evento eliminado');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  return (
    <Sheet open onClose={onClose} title={event ? 'Editar evento' : 'Añadir evento'}
      footer={<>
        {event && <Button variant="danger" onClick={del} loading={remove.isPending}>Eliminar</Button>}
        <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!!reason}>
          {reason ?? (event ? 'Guardar' : 'Añadir')}
        </Button>
      </>}>
      <div className="form">
        <TextField label="Título" placeholder="Reunión de departamento" value={f.title} maxLength={200} onChange={(e) => set('title', e.target.value)} />
        <DateField label="Fecha" value={f.date} onChange={(v) => set('date', v)} />
        <div className="form-row">
          <TimeField label="Inicio" clearable value={f.start} onChange={(v) => set('start', v)} />
          <TimeField label="Fin" clearable value={f.end} onChange={(v) => set('end', v)} error={timeError} />
        </div>
        <div className="form-row">
          <Select label="Tipo" value={f.kind} onChange={(e) => set('kind', e.target.value as EventKind)}>
            {(Object.keys(EVENT_KIND_LABEL) as EventKind[]).map((k) => <option key={k} value={k}>{EVENT_KIND_LABEL[k]}</option>)}
          </Select>
          <Select label="Clase" value={f.course_id} onChange={(e) => set('course_id', e.target.value)}>
            <option value="">Ninguna</option>
            {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </div>
      </div>
    </Sheet>
  );
}
