/** Small sheets used only by Hoy: session actions, month picker, all watchlist, AI day brief. */
import { ArrowCounterClockwise, BookOpen, ListChecks, NotePencil } from '@phosphor-icons/react';
import { useState } from 'react';
import { useCalendar, useCancelSession, type TodaySession, type WatchItem } from '../../api/today';
import { addDays, isoDate, longDate, parseDate } from '../../lib/format';
import { AIBadge, Button, Callout, List, MonthGrid, Row, RowIcon, Sheet, SkeletonList, useFeedback } from '../../ui';
import { attendanceLabel, WatchRows } from './parts';

export function SessionSheet({ session, today, onClose, onAttendance, onNote }: {
  session: TodaySession | null; today: string; onClose: () => void;
  onAttendance: (s: TodaySession) => void; onNote: (s: TodaySession) => void;
}) {
  const { toast, confirm } = useFeedback();
  const cancel = useCancelSession();
  if (!session) return null;
  const s = session;
  const toggle = async () => {
    if (!s.cancelled && !(await confirm({
      title: 'Cancelar sesión', confirm: 'Cancelar sesión', danger: true,
      text: `${s.course.label} no tendrá clase el ${longDate(s.date)} a las ${s.start}. No contará como lista sin pasar.`,
    }))) return;
    try {
      await cancel.mutateAsync({ courseId: s.course.id, date: s.date, start: s.start, restore: s.cancelled });
      toast(s.cancelled ? 'Sesión restaurada' : 'Sesión cancelada');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };
  return (
    <Sheet open onClose={onClose} title={s.course.label}
      subtitle={[longDate(s.date), `${s.start}–${s.end}`, s.room && `Aula ${s.room}`].filter(Boolean).join(' · ')}>
      <div className="form">
        {s.cancelled && <Callout tone="warn">Sesión cancelada{s.cancel_note ? `: ${s.cancel_note}` : '.'}</Callout>}
        <List inset={64}>
          {!s.cancelled && s.date <= today && (
            <Row lead={<RowIcon tone="accent"><ListChecks size={20} /></RowIcon>} title={s.attendance.taken ? 'Editar lista' : 'Pasar lista'}
              sub={s.attendance.taken ? attendanceLabel(s.attendance) : 'Todos presentes por defecto'} onClick={() => { onClose(); onAttendance(s); }} />
          )}
          <Row lead={<RowIcon tone="accent"><NotePencil size={20} /></RowIcon>} title="Anotar" sub="Observación, incidencia, positivo o familia"
            onClick={() => { onClose(); onNote(s); }} />
          <Row lead={<RowIcon><BookOpen size={20} /></RowIcon>} title="Abrir clase" sub={s.unit ?? 'Cuaderno, alumnos y programación'} to={`/clases/${s.course.id}`} />
        </List>
        {s.cancelled
          ? <Button variant="neutral" full icon={<ArrowCounterClockwise size={18} />} onClick={toggle} loading={cancel.isPending}>Restaurar sesión</Button>
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

export function WatchSheet({ open, items, onClose }: { open: boolean; items: WatchItem[]; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="A vigilar" subtitle={`${items.length} alumnos · media < 5, faltas, bajadas o incidencias`} size="large">
      <WatchRows items={items} />
    </Sheet>
  );
}

export function BriefSheet({ open, date, loading, bullets, error, onClose, onRetry }: {
  open: boolean; date: string; loading: boolean; bullets?: string[]; error?: string | null; onClose: () => void; onRetry: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={<span className="brief-title">Resumen del día <AIBadge label="IA" /></span>} subtitle={longDate(date)}>
      {loading ? <SkeletonList rows={3} /> : error ? (
        <div className="form"><p className="muted">{error}</p><Button variant="tinted" onClick={onRetry}>Reintentar</Button></div>
      ) : (
        <ul className="brief-list">{bullets?.map((b) => <li key={b}>{b}</li>)}</ul>
      )}
    </Sheet>
  );
}

export function nextMonday(iso: string): string {
  const wd = (parseDate(iso).getDay() + 6) % 7;
  return addDays(iso, 7 - wd);
}
