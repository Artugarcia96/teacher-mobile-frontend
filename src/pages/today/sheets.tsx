/** Small sheets used only by Hoy: one session (plan, materials and actions), month picker, «A vigilar» (all classes). */
import { ArrowCounterClockwise, BookOpen, CalendarX, FilePdf, FlagCheckered, ListChecks, NotePencil } from '@phosphor-icons/react';
import { useState } from 'react';
import { useCalendar, useCancelSession, useWatch, type TodaySession, type WatchItem } from '../../api/today';
import { addDays, isoDate, longDate, parseDate, roomLabel } from '../../lib/format';
import { MaterialChips } from '../../features/materials/MaterialChips';
import { fileUrl } from '../../lib/api';
import { Button, Callout, List, MonthGrid, Row, RowIcon, Sheet, SkeletonList, TextField, useFeedback } from '../../ui';
import { attendanceLabel, SessionActivities, SessionPlan, WatchRows } from './parts';

export function SessionSheet({ session, today, onClose, onAttendance, onNote, onHomework, onCloseClass }: {
  session: TodaySession | null; today: string; onClose: () => void;
  onAttendance: (s: TodaySession) => void; onNote: (s: TodaySession) => void;
  onHomework: (s: TodaySession) => void; onCloseClass: (s: TodaySession) => void;
}) {
  if (!session) return null;
  return <SessionBody key={`${session.course.id}|${session.date}|${session.start}`} s={session} today={today} onClose={onClose}
    onAttendance={onAttendance} onNote={onNote} onHomework={onHomework} onCloseClass={onCloseClass} />;
}

function SessionBody({ s, today, onClose, onAttendance, onNote, onHomework, onCloseClass }: {
  s: TodaySession; today: string; onClose: () => void;
  onAttendance: (s: TodaySession) => void; onNote: (s: TodaySession) => void;
  onHomework: (s: TodaySession) => void; onCloseClass: (s: TodaySession) => void;
}) {
  const { toast, confirm } = useFeedback();
  const cancel = useCancelSession();
  const [noClass, setNoClass] = useState<string | null>(null);
  const started = s.status === 'past' || s.status === 'now';
  const when = [longDate(s.date), `${s.start}–${s.end}`, s.room && roomLabel(s.room)].filter(Boolean).join(' · ');

  const run = async (restore: boolean, note?: string) => {
    try {
      await cancel.mutateAsync({ courseId: s.course.id, date: s.date, start: s.start, restore, note: note?.trim() || undefined });
      toast(s.guardia ? 'Vuelves a tener esta clase' : restore ? 'Sesión restaurada' : 'Sin clase');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };
  const restore = async () => {
    if (s.guardia && !(await confirm({
      title: 'Ya no faltas', confirm: 'Ya no falto',
      text: 'La sesión vuelve a ser una clase normal. Si ya entregaste la hoja de guardia en jefatura, avisa de que no hace falta.',
    }))) return;
    await run(true);
  };

  if (noClass !== null) {
    return (
      <Sheet open onClose={() => setNoClass(null)} title="No hay clase" subtitle={`${s.course.label} · ${when}`}
        footer={<>
          <Button variant="neutral" onClick={() => setNoClass(null)}>Volver</Button>
          <Button onClick={() => void run(false, noClass)} loading={cancel.isPending}>No hay clase</Button>
        </>}>
        <div className="form">
          <p className="muted">No contará como lista sin pasar. Se puede deshacer desde la agenda.</p>
          <TextField label="Motivo" placeholder="Excursión, huelga, actividad del centro…" value={noClass} maxLength={500}
            hint="Opcional." onChange={(e) => setNoClass(e.target.value)} />
        </div>
      </Sheet>
    );
  }

  const go = (fn: (s: TodaySession) => void) => () => { onClose(); fn(s); };
  return (
    <Sheet open onClose={onClose} title={s.course.label} subtitle={when}>
      <div className="form">
        {s.guardia ? <Callout tone="accent"><b>Ausente · tarea:</b> {s.cancel_note}</Callout>
          : s.cancelled ? <Callout tone="warn">Sin clase{s.cancel_note ? ` · ${s.cancel_note}` : ''}</Callout>
            : (
              <>
                <SessionActivities session={s} />
                <MaterialChips session={s} />
                <SessionPlan s={s} canCheck={s.date <= today} onHomework={go(onHomework)} />
              </>
            )}
        <List inset={64}>
          {(!s.cancelled || s.guardia) && s.date <= today && (
            <Row lead={<RowIcon tone="accent"><ListChecks size={20} /></RowIcon>} title={s.attendance.taken ? 'Editar lista' : 'Pasar lista'}
              sub={s.attendance.taken ? attendanceLabel(s.attendance) : s.guardia ? 'Con la hoja de la guardia' : 'Todos presentes por defecto'}
              onClick={go(onAttendance)} />
          )}
          {!s.cancelled && started && (
            <Row lead={<RowIcon tone="accent"><FlagCheckered size={20} /></RowIcon>} title={s.log ? 'Clase cerrada' : 'Cerrar clase'}
              sub={s.log ? s.log.next ? `Para la próxima: ${s.log.next}` : s.log.done : 'Qué habéis hecho, qué toca y deberes'} onClick={go(onCloseClass)} />
          )}
          {s.guardia_pdf && (
            <Row lead={<RowIcon tone="accent"><FilePdf size={20} /></RowIcon>} title="Hoja de guardia (PDF)" sub="Para jefatura de estudios"
              onClick={() => window.open(fileUrl(s.guardia_pdf), '_blank', 'noopener')} />
          )}
          <Row lead={<RowIcon tone="accent"><NotePencil size={20} /></RowIcon>} title="Anotar" onClick={go(onNote)} />
          <Row lead={<RowIcon><BookOpen size={20} /></RowIcon>} title="Abrir clase" to={`/clases/${s.course.id}`} />
        </List>
        {s.cancelled
          ? <Button variant="neutral" full icon={<ArrowCounterClockwise size={18} />} onClick={restore} loading={cancel.isPending}>
            {s.guardia ? 'Ya no falto' : 'Restaurar sesión'}
          </Button>
          // With its list taken the class did happen: its absences count.
          : !s.attendance.taken && <Button variant="neutral" full icon={<CalendarX size={18} />} onClick={() => setNoClass('')}>No hay clase</Button>}
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
