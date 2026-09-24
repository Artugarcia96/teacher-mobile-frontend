/** Hoy: qué clase tengo ahora, pasar lista, anotar, agenda, pendiente y a vigilar. Determinista; la IA solo bajo demanda. */
import { CalendarBlank, CalendarPlus, DotsThree, NotePencil, Sun, TextAlignLeft, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCourses } from '../../api/core';
import { useCalendar, useDay, useDayBrief, type PendingItem, type TodayEvent, type TodaySession } from '../../api/today';
import TakeAttendanceSheet from '../../features/attendance/TakeAttendanceSheet';
import EventSheet from '../../features/events/EventSheet';
import QuickNoteSheet from '../../features/notes/QuickNoteSheet';
import { useAuth, useToday } from '../../lib/auth';
import { addDays, dayNumber, longDate, mondayOf, parseDate, relativeDay } from '../../lib/format';
import {
  AIBadge, Avatar, Button, EmptyState, IconButton, List, Menu, Page, Row, RowIcon, Section, Skeleton, SkeletonList, WeekStrip,
} from '../../ui';
import { Agenda, NowCard, PendingList, pickFocus, sortPending, WatchRows } from './parts';
import { BriefSheet, MonthSheet, nextMonday, SessionSheet, WatchSheet } from './sheets';
import './today.css';

const WEEKDAY = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const PENDING_VISIBLE = 5;
const WATCH_VISIBLE = 5;

function dayTitle(date: string, today: string): string {
  const diff = Math.round((parseDate(date).getTime() - parseDate(today).getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return `${WEEKDAY[parseDate(date).getDay()]} ${dayNumber(date)}`;
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

type AttendanceTarget = { courseId: string; date: string; start: string; label: string };

export default function TodayPage() {
  const today = useToday();
  const { me } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const date = params.get('dia') || today;
  const monday = mondayOf(date);
  const day = useDay(date);
  const week = useCalendar(monday, addDays(monday, 4));
  const courses = useCourses();
  const brief = useDayBrief();

  const [attendance, setAttendance] = useState<AttendanceTarget | null>(null);
  const [note, setNote] = useState<{ courseId?: string } | null>(null);
  const [session, setSession] = useState<TodaySession | null>(null);
  const [event, setEvent] = useState<{ event?: TodayEvent } | null>(null);
  const [month, setMonth] = useState(false);
  const [watchAll, setWatchAll] = useState(false);
  const [pendingAll, setPendingAll] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  const go = (iso: string) => setParams(iso === today ? {} : { dia: iso }, { replace: true });
  const shiftWeek = (delta: -1 | 1) => {
    const m = addDays(monday, delta * 7);
    go(mondayOf(today) === m ? today : m);
  };

  const marked = new Set(week.data?.days.filter((d) => d.sessions.some((s) => !s.cancelled)).map((d) => d.date));
  const openAttendance = (s: TodaySession) =>
    setAttendance({ courseId: s.course.id, date: s.date, start: s.start, label: s.course.label });
  const openPending = (p: PendingItem) => {
    if (p.kind === 'review' && p.activity_id) navigate(`/clases/${p.course_id}/actividades/${p.activity_id}`);
    else if (p.kind === 'grades') navigate(`/clases/${p.course_id}/cuaderno`);
    else if (p.kind === 'comments') navigate(`/clases/${p.course_id}/evaluacion/${p.term ?? 1}`);
    else if (p.kind === 'attendance' && p.date && p.start) {
      const c = courses.data?.find((x) => x.id === p.course_id);
      setAttendance({ courseId: p.course_id, date: p.date, start: p.start, label: c?.label ?? p.title });
    }
  };
  const runBrief = () => { setBriefOpen(true); brief.mutate(date); };

  const d = day.data;
  const title = dayTitle(date, today);
  const subtitle = d
    ? [longDate(date), d.lective ? `${d.term_label}${d.week ? `, semana ${d.week}` : ''}` : d.holiday].filter(Boolean).join(' · ')
    : longDate(date);

  const actions = (
    <>
      <IconButton label="Ir a una fecha" glass onClick={() => setMonth(true)}><CalendarBlank size={20} /></IconButton>
      <Menu
        trigger={(open) => <IconButton label="Más acciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>}
        items={[
          { label: 'Añadir evento', icon: <CalendarPlus size={18} />, onSelect: () => setEvent({}) },
          { label: 'Anotar', icon: <NotePencil size={18} />, onSelect: () => setNote({}) },
        ]}
      />
      <button type="button" className="today-me" aria-label="Ajustes" onClick={() => navigate('/ajustes')}>
        <Avatar initials={initials(me?.teacher.name ?? '')} size="sm" />
      </button>
    </>
  );

  const toolbar = (
    <div className="today-week">
      <WeekStrip monday={monday} selected={date} today={today} marked={marked} onSelect={go} onWeek={shiftWeek} />
    </div>
  );

  let left;
  if (day.isLoading) {
    left = <div className="today-col"><div className="card today-skel"><Skeleton h={12} w="40%" /><Skeleton h={24} w="70%" /><Skeleton h={14} w="55%" /><Skeleton h={46} /></div><SkeletonList rows={4} /></div>;
  } else if (day.error || !d) {
    left = (
      <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido cargar el día" text={(day.error as Error | null)?.message}
        action={<Button variant="tinted" onClick={() => day.refetch()}>Reintentar</Button>} />
    );
  } else {
    const weekend = parseDate(date).getDay() % 6 === 0;
    const focus = pickFocus(d, today);
    const hasCourses = (courses.data?.length ?? 1) > 0;
    let empty = null;
    if (!d.sessions.length) {
      if (weekend) {
        const mon = nextMonday(date);
        empty = <EmptyState icon={<Sun size={24} />} title="Fin de semana" text="No hay clases."
          action={<Button variant="tinted" onClick={() => go(mon)}>Ver el lunes {dayNumber(mon)}</Button>} />;
      } else if (!d.lective) {
        empty = <EmptyState icon={<Sun size={24} />} title={`Sin clases · ${d.holiday ?? 'día no lectivo'}`} text="Día no lectivo en tu calendario escolar."
          action={<Button variant="tinted" onClick={() => go(today)}>Volver a hoy</Button>} />;
      } else if (!hasCourses) {
        empty = <EmptyState icon={<CalendarBlank size={24} />} title="Aún no tienes clases" text="Crea tu primera clase con su horario y aparecerá aquí."
          action={<Button onClick={() => navigate('/clases')}>Crear clase</Button>} />;
      } else {
        empty = <EmptyState icon={<CalendarBlank size={24} />} title="Sin clases este día"
          action={<Button variant="tinted" onClick={() => setEvent({})}>Añadir evento</Button>} />;
      }
    }
    left = (
      <div className="today-col">
        {focus && <NowCard focus={focus} today={today} onAttendance={openAttendance} onNote={(s) => setNote({ courseId: s.course.id })} />}
        {empty && <div className="card">{empty}</div>}
        {(d.sessions.length > 0 || d.events.length > 0) && (
          <Section title="Agenda" action={<button type="button" className="section__action" onClick={() => setEvent({})}>Añadir evento</button>}>
            <Agenda day={d} onSession={setSession} onEvent={(e) => setEvent({ event: e })} />
          </Section>
        )}
      </div>
    );
  }

  const pending = sortPending(d?.pending ?? []);
  const watch = d?.watchlist ?? [];
  const right = day.isLoading ? (
    <div className="today-col"><SkeletonList rows={3} /><SkeletonList rows={4} /></div>
  ) : d ? (
    <div className="today-col">
      <Section title="Pendiente"
        action={pending.length > PENDING_VISIBLE && (
          <button type="button" className="section__action" onClick={() => setPendingAll((v) => !v)}>
            {pendingAll ? 'Ver menos' : `Ver todo (${pending.length})`}
          </button>
        )}>
        <PendingList items={pendingAll ? pending : pending.slice(0, PENDING_VISIBLE)} onOpen={openPending} />
      </Section>
      <Section title="A vigilar"
        action={watch.length > WATCH_VISIBLE && <button type="button" className="section__action" onClick={() => setWatchAll(true)}>Ver todos ({watch.length})</button>}>
        <WatchRows items={watch.slice(0, WATCH_VISIBLE)} />
      </Section>
      <List>
        <Row lead={<RowIcon><TextAlignLeft size={20} /></RowIcon>} title="Resumen del día" sub={`Tres puntos para ${relativeDay(date, today) === 'hoy' ? 'hoy' : longDate(date)}`}
          trail={<AIBadge label="IA" />} onClick={runBrief} />
      </List>
    </div>
  ) : null;

  return (
    <Page title={title} subtitle={subtitle} actions={actions} toolbar={toolbar}>
      <div className="today-grid">
        {left}
        {right}
      </div>

      <SessionSheet session={session} today={today} onClose={() => setSession(null)} onAttendance={openAttendance}
        onNote={(s) => setNote({ courseId: s.course.id })} />
      {attendance && <TakeAttendanceSheet open onClose={() => setAttendance(null)} {...attendance} />}
      <QuickNoteSheet open={!!note} onClose={() => setNote(null)} courseId={note?.courseId} />
      <EventSheet open={!!event} onClose={() => setEvent(null)} date={d?.date ?? date} event={event?.event} />
      {month && <MonthSheet open selected={date} today={today} onClose={() => setMonth(false)} onPick={go} />}
      <WatchSheet open={watchAll} items={watch} onClose={() => setWatchAll(false)} />
      <BriefSheet open={briefOpen} date={date} loading={brief.isPending} bullets={brief.data?.bullets}
        error={brief.error ? (brief.error as Error).message : null} onClose={() => setBriefOpen(false)} onRetry={() => brief.mutate(date)} />
    </Page>
  );
}
