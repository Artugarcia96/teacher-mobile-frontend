/** «Cerrar clase» (diario de clase): qué se ha hecho, qué toca la próxima vez y deberes. La siguiente sesión de la clase lo
 *  muestra arriba («Toca: …»). Opcional: dar la unidad por terminada y empezar la siguiente. */
import { useEffect, useState } from 'react';
import { useSaveSessionLog, useSessionLog } from '../../api/sessions';
import { useToday } from '../../lib/auth';
import { longDate } from '../../lib/format';
import { Button, List, Row, Sheet, SkeletonList, Switch, TextArea, TextField, useFeedback } from '../../ui';
import './session.css';

export interface CloseSessionSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  date: string;
  start: string;
  label?: string;
}

export default function CloseSessionSheet(props: CloseSessionSheetProps) {
  if (!props.open) return null;
  return <CloseBody key={`${props.courseId}|${props.date}|${props.start}`} {...props} />;
}

function CloseBody({ onClose, courseId, date, start, label }: CloseSessionSheetProps) {
  const today = useToday();
  const { toast, confirm } = useFeedback();
  const q = useSessionLog(courseId, date, start);
  const save = useSaveSessionLog(courseId);
  const [f, setF] = useState<{ done: string; next: string; homework: string; finish: boolean } | null>(null);

  useEffect(() => {
    if (f || !q.data) return;
    const d = q.data;
    setF({ done: d.saved ? d.done ?? '' : d.unit?.title ?? '', next: d.next ?? '', homework: d.homework ?? '', finish: false });
  }, [q.data, f]);

  const empty = !!f && !f.done.trim() && !f.next.trim() && !f.homework.trim() && !f.finish;
  const submit = async () => {
    if (!f) return;
    if (empty && !(await confirm({ title: 'Borrar el cierre de clase', text: 'La próxima clase ya no mostrará qué toca ni los deberes.',
      confirm: 'Borrar', danger: true }))) return;
    try {
      const r = await save.mutateAsync({ date, start, done: f.done, next: f.next, homework: f.homework, finish_unit: f.finish });
      toast(empty ? 'Cierre de clase borrado' : f.finish && r.unit ? `Clase cerrada · empieza «${r.unit.title}»`
        : q.data?.saved ? 'Cierre de clase actualizado' : 'Clase cerrada');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const d = q.data;
  const when = [date !== today && longDate(date), d?.end ? `${start}–${d.end}` : start].filter(Boolean).join(' · ');
  return (
    <Sheet open side onClose={onClose} title={label ? `Cerrar clase · ${label}` : 'Cerrar clase'} subtitle={when}
      footer={<Button full variant={empty && d?.saved ? 'danger' : 'primary'} onClick={submit} loading={save.isPending} disabled={!f || (empty && !d?.saved)}
        title={empty && !d?.saved ? 'Escribe qué habéis hecho o qué toca la próxima vez' : undefined}>
        {empty && d?.saved ? 'Borrar el cierre' : 'Guardar'}
      </Button>}>
      {q.error ? <p className="muted">{(q.error as Error).message}</p> : !f || !d ? <SkeletonList rows={3} /> : (
        <div className="form">
          <TextArea label="Hecho hoy" rows={2} className="close-done" value={f.done} maxLength={2000} onChange={(e) => setF({ ...f, done: e.target.value })} />
          <TextField label="Para la próxima" placeholder="Qué toca en la próxima clase" value={f.next} maxLength={2000}
            onChange={(e) => setF({ ...f, next: e.target.value })} />
          <TextField label="Deberes" hint="Opcional. En la próxima clase podrás revisarlos a toques." placeholder="Ej.: p. 40, ej. 1-4"
            value={f.homework} maxLength={1000} onChange={(e) => setF({ ...f, homework: e.target.value })} />
          {d.unit && (
            <List>
              <Row title={`Unidad terminada: ${d.unit.title}`} wrapSub
                sub={d.next_unit ? `Empezar la siguiente: ${d.next_unit.title}` : 'Es la última unidad de la programación'}
                trail={<Switch label="Unidad terminada" checked={f.finish} onChange={(v) => setF({ ...f, finish: v })} />} />
            </List>
          )}
        </div>
      )}
    </Sheet>
  );
}
