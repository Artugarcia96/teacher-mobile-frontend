/** Small sheets used only by Hoy: session actions, month picker, «A vigilar» (all classes). */
import { ArrowCounterClockwise, BookOpen, FlagCheckered, ListChecks, NotePencil, Backpack } from '@phosphor-icons/react';
import { useState } from 'react';
import { useCalendar, useCancelSession, useWatch, type TodaySession, type WatchItem } from '../../api/today';
import { addDays, isoDate, longDate, parseDate } from '../../lib/format';
import { Button, Callout, List, MonthGrid, Row, RowIcon, Sheet, SkeletonList, useFeedback } from '../../ui';
import { attendanceLabel, homeworkLabel, WatchRows } from './parts';

export function SessionSheet({ session, today, onClose, onAttendance, onNote, onHomework, onCloseClass }: {
  session: TodaySession | null; today: string; onClose: () => void;
  onAttendance: (s: TodaySession) => void; onNote: (s: TodaySession) => void;
  onHomework: (s: TodaySession) => void; onCloseClass: (s: TodaySession) => void;
}) {
  const { toast, confirm } = useFeedback();
  const cancel = useCancelSession();
  if (!session) return null;
  const s = session;
  const started = s.status === 'past' || s.status === 'now';
  const toggle = async () => {
    if (!s.cancelled && !(await confirm({
      title: 'Cancelar sesión', confirm: 'Cancelar sesión', danger: true,
      text: `${s.course.label} no tendrá clase el ${longDate(s.date)} a las ${s.start}. No contará como lista sin pasar.`,
    }))) return;
    if (s.guardia && !(await confirm({
      title: 'Quitar la guardia', confirm: 'Quitar guardia', danger: true,
      text: 'La sesión vuelve a ser una clase normal. Si ya entregaste la hoja en jefatura, avisa de que no hace falta.',
    }))) return;
    try {
      await cancel.mutateAsync({ courseId: s.course.id, date: s.date, start: s.start, restore: s.cancelled });
      toast(s.guardia ? 'Guardia quitada' : s.cancelled ? 'Sesión restaurada' : 'Sesión cancelada');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };
  const go = (fn: (s: TodaySession) => void) => () => { onClose(); fn(s); };
  return (
    <Sheet open onClose={onClose} title={s.course.label}
      subtitle={[longDate(s.date), `${s.start}–${s.end}`, s.room && `Aula ${s.room}`].filter(Boolean).join(' · ')}>
      <div className="form">
        {s.guardia ? <Callout tone="accent"><b>Guardia:</b> {s.cancel_note}</Callout>
          : s.cancelled && <Callout tone="warn">Sesión cancelada{s.cancel_note ? `: ${s.cancel_note}` : '.'}</Callout>}
        <List inset={64}>
          {(!s.cancelled || s.guardia) && s.date <= today && (
            <Row lead={<RowIcon tone="accent"><ListChecks size={20} /></RowIcon>} title={s.attendance.taken ? 'Editar lista' : 'Pasar lista'}
              sub={s.attendance.taken ? attendanceLabel(s.attendance) : s.guardia ? 'Con la hoja de la guardia' : 'Todos presentes por defecto'}
              onClick={go(onAttendance)} />
          )}
          {!s.cancelled && s.date <= today && (s.homework?.text || s.homework?.checked) && (
            <Row lead={<RowIcon tone="accent"><Backpack size={20} /></RowIcon>} title={s.homework.checked ? 'Deberes revisados' : 'Revisar deberes'}
              sub={s.homework.checked ? homeworkLabel(s.homework) : s.homework.text} onClick={go(onHomework)} />
          )}
          {!s.cancelled && started && (
            <Row lead={<RowIcon tone="accent"><FlagCheckered size={20} /></RowIcon>} title={s.log ? 'Clase cerrada' : 'Cerrar clase'}
              sub={s.log ? s.log.next ? `Para la próxima: ${s.log.next}` : s.log.done : 'Qué habéis hecho, qué toca y deberes'} onClick={go(onCloseClass)} />
          )}
          <Row lead={<RowIcon tone="accent"><NotePencil size={20} /></RowIcon>} title="Anotar" sub="Observación, incidencia, positivo o familia"
            onClick={go(onNote)} />
          <Row lead={<RowIcon><BookOpen size={20} /></RowIcon>} title="Abrir clase" sub={s.unit ?? 'Cuaderno, alumnos y programación'} to={`/clases/${s.course.id}`} />
        </List>
        {s.cancelled
          ? <Button variant="neutral" full icon={<ArrowCounterClockwise size={18} />} onClick={toggle} loading={cancel.isPending}>
            {s.guardia ? 'Quitar guardia' : 'Restaurar sesión'}
          </Button>
          : <Button variant="danger" full onClick={toggle} loading={cancel.isPending}>Cancelar sesión</Button>}
      </div>
    </Sheet>
  );
}

export function MonthSheet({ open, selected, today, onClose, onPick }: {
  open: boolean; selected: string; today: string; onClose: () => void; onPick: (iso: string) => void;
}) {
  const [month, setMonth] = useState(selected);
  const first = parseDate(month);
  first.setDate(1);
  const from = isoDate(first);
  const to = isoDate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
  const cal = useCalendar(from, to, open);
  const marked = new Set(cal.data?.days.filter((d) => d.events.length > 0).map((d) => d.date));
  const muted = new Set(cal.data?.days.filter((d) => !d.lective).map((d) => d.date));
  if (!open) return null;
  const shift = (delta: -1 | 1) => setMonth(isoDate(new Date(first.getFullYear(), first.getMonth() + delta, 1)));
  return (
    <Sheet open onClose={onClose} title="Ir a una fecha"
      footer={<Button variant="neutral" full onClick={() => { onPick(today); onClose(); }}>Hoy</Button>}>
      <MonthGrid month={month} selected={selected} today={today} marked={marked} muted={muted}
        onMonth={shift} onSelect={(d) => { onPick(d); onClose(); }} />
    </Sheet>
  );
}

/** «Ver todos»: every class, most severe first. */
export function WatchSheet({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (w: WatchItem) => void }) {
  const q = useWatch(open);
  if (!open) return null;
  return (
    <Sheet open onClose={onClose} title="A vigilar" size="large"
      subtitle="Faltas, suspensos, incidencias o deberes recientes en todas tus clases.">
      {q.isLoading ? <SkeletonList rows={6} /> : q.error ? <p className="muted">{(q.error as Error).message}</p> : (
        <WatchRows items={q.data ?? []} onOpen={(w) => { onClose(); onOpen(w); }} empty={{ title: 'Nadie a vigilar', sub: 'Ningún alumno tiene faltas, suspensos o incidencias recientes.' }} />
      )}
    </Sheet>
  );
}

export function nextMonday(iso: string): string {
  const wd = (parseDate(iso).getDay() + 6) % 7;
  return addDays(iso, 7 - wd);
}
