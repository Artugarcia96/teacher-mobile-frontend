/** Hoy: qué clase tengo ahora, pasar lista, deberes, anotar, cerrar la clase, agenda, pendiente y a vigilar. Determinista. */
import { CalendarBlank, CalendarPlus, CalendarX, DotsThree, GearSix, Sun, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCourses } from '../../api/core';
import { useCalendar, useDay, type PendingItem, type TodayEvent, type TodaySession, type WatchItem } from '../../api/today';
import TakeAttendanceSheet from '../../features/attendance/TakeAttendanceSheet';
import EventSheet from '../../features/events/EventSheet';
import FamilyMessageSheet from '../../features/notes/FamilyMessageSheet';
import QuickNoteSheet from '../../features/notes/QuickNoteSheet';
import AbsenceSheet from '../../features/session/AbsenceSheet';
import CloseSessionSheet from '../../features/session/CloseSessionSheet';
import HomeworkCheckSheet from '../../features/session/HomeworkCheckSheet';
import { useToday } from '../../lib/auth';
import { addDays, dayNumber, longDate, mondayOf, parseDate } from '../../lib/format';
import { Button, EmptyState, IconButton, Menu, Page, Section, Skeleton, SkeletonList, WeekStrip } from '../../ui';
import { Agenda, dayNeedsAttention, NowCard, PendingList, pickFocus, WatchRows } from './parts';
import { MonthSheet, nextMonday, SessionSheet, WatchItemSheet, WatchSheet } from './sheets';
import './today.css';

const WEEKDAY = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const PENDING_VISIBLE = 5;
const WATCH_VISIBLE = 4;

function dayTitle(date: string, today: string): string {
  const diff = Math.round((parseDate(date).getTime() - parseDate(today).getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  return `${WEEKDAY[parseDate(date).getDay()]} ${dayNumber(date)}`;
}

/** One session, as the session sheets need it. */
type Target = { courseId: string; date: string; start: string; label: string; room?: string | null };
const target = (s: TodaySession): Target => ({ courseId: s.course.id, date: s.date, start: s.start, label: s.course.label, room: s.room });

export default function TodayPage() {
  const today = useToday();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const date = params.get('dia') || today;
  const monday = mondayOf(date);
  const day = useDay(date);
  const week = useCalendar(monday, addDays(monday, 4));
  const courses = useCourses();

  const [attendance, setAttendance] = useState<Target | null>(null);
  const [homework, setHomework] = useState<Target | null>(null);
  const [closing, setClosing] = useState<Target | null>(null);
  const [note, setNote] = useState<{ courseId?: string } | null>(null);
  const [session, setSession] = useState<TodaySession | null>(null);
  const [event, setEvent] = useState<{ event?: TodayEvent } | null>(null);
  const [month, setMonth] = useState(false);
  const [absence, setAbsence] = useState(false);
  const [watchAll, setWatchAll] = useState(false);
  const [watchItem, setWatchItem] = useState<WatchItem | null>(null);
  const [family, setFamily] = useState<WatchItem | null>(null);
  const [pendingAll, setPendingAll] = useState(false);

  const go = (iso: string) => setParams(iso === today ? {} : { dia: iso }, { replace: true });
  const shiftWeek = (delta: -1 | 1) => {
    const m = addDays(monday, delta * 7);
    go(mondayOf(today) === m ? today : m);
  };

  const marked = new Set(week.data?.days.filter(dayNeedsAttention).map((d) => d.date));
  const openAttendance = (s: TodaySession) => setAttendance(target(s));
  const openPending = (p: PendingItem) => {
    if (p.kind === 'review' && p.activity_id) navigate(`/clases/${p.course_id}/actividades/${p.activity_id}`);
    else if (p.kind === 'grades') navigate(`/clases/${p.course_id}/cuaderno`);
    else if (p.kind === 'comments') navigate(p.course_id ? `/clases/${p.course_id}/evaluacion/${p.term ?? 1}` : '/evaluar');
    else if (p.kind === 'attendance' && p.course_id && p.date && p.start) {
      const c = courses.data?.find((x) => x.id === p.course_id);
      setAttendance({ courseId: p.course_id, date: p.date, start: p.start, label: c?.label ?? p.title, room: c?.room });
    }
  };

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
          { label: 'Voy a faltar', icon: <CalendarX size={18} />, onSelect: () => setAbsence(true) },
          { label: 'Ajustes', icon: <GearSix size={18} />, onSelect: () => navigate('/ajustes'), separatorBefore: true },
        ]}
      />
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
          action={date !== today ? <Button variant="tinted" onClick={() => go(today)}>Volver a hoy</Button> : undefined} />;
      }
    }
    left = (
      <div className="today-col">
        {focus && <NowCard focus={focus} today={today} onAttendance={openAttendance} onNote={(s) => setNote({ courseId: s.course.id })}
          onHomework={(s) => setHomework(target(s))} onClose={(s) => setClosing(target(s))} />}
        {empty && <div className="card">{empty}</div>}
        {(d.sessions.length > 0 || d.events.length > 0) && (
          <Section title="Agenda">
            <Agenda day={d} onSession={setSession} onEvent={(e) => setEvent({ event: e })} />
          </Section>
        )}
      </div>
    );
  }

  const pending = d?.pending ?? [];
  const watch = d?.watchlist ?? [];
  const watchTotal = d?.watch_total ?? 0;
  const watchMore = watchTotal > Math.min(watch.length, WATCH_VISIBLE);
  const teaching = d?.sessions.filter((s) => !s.cancelled) ?? [];
  const others = watchTotal > 0 ? `Hay ${watchTotal} en otras clases.` : undefined;
  const watchEmpty = !d?.sessions.length ? { title: 'Este día no tienes clases', sub: watchTotal > 0 ? `Hay ${watchTotal} en tus clases.` : undefined }
    : !teaching.length ? { title: d.sessions.some((s) => s.guardia) ? 'Este día tienes guardias' : 'Este día no tienes clases', sub: others }
      : others ? { title: 'Nadie en las clases de este día', sub: others }
        : { title: 'Nadie a vigilar', sub: 'Nada reciente en tus clases.' };
  const right = day.isLoading ? (
    <div className="today-col"><SkeletonList rows={3} /><SkeletonList rows={4} /></div>
  ) : d ? (
    <div className="today-col">
      <Section title={d.is_today ? 'Pendiente' : 'Pendiente de hoy'}
        action={pending.length > PENDING_VISIBLE && (
          <button type="button" className="section__action" onClick={() => setPendingAll((v) => !v)}>
            {pendingAll ? 'Ver menos' : `Ver todo (${pending.length})`}
          </button>
        )}>
        <PendingList items={pendingAll ? pending : pending.slice(0, PENDING_VISIBLE)} onOpen={openPending} />
      </Section>
      <Section title="A vigilar"
        action={watchMore && <button type="button" className="section__action" onClick={() => setWatchAll(true)}>Ver todos ({d.watch_total})</button>}>
        <WatchRows items={watch.slice(0, WATCH_VISIBLE)} onOpen={setWatchItem} empty={watchEmpty} />
      </Section>
    </div>
  ) : null;

  return (
    <Page title={title} subtitle={subtitle} actions={actions} toolbar={toolbar}>
      <div className="today-grid">
        {left}
        {right}
      </div>

      <SessionSheet session={session} today={today} onClose={() => setSession(null)} onAttendance={openAttendance}
        onNote={(s) => setNote({ courseId: s.course.id })} onHomework={(s) => setHomework(target(s))} onCloseClass={(s) => setClosing(target(s))} />
      {attendance && <TakeAttendanceSheet open onClose={() => setAttendance(null)} {...attendance} />}
      {homework && <HomeworkCheckSheet open onClose={() => setHomework(null)} {...homework} />}
      {closing && <CloseSessionSheet open onClose={() => setClosing(null)} {...closing} />}
      <QuickNoteSheet open={!!note} onClose={() => setNote(null)} courseId={note?.courseId} />
      <EventSheet open={!!event} onClose={() => setEvent(null)} date={d?.date ?? date} event={event?.event} />
      {month && <MonthSheet open selected={date} today={today} onClose={() => setMonth(false)} onPick={go} />}
      <AbsenceSheet open={absence} onClose={() => setAbsence(false)} date={date} />
      <WatchSheet open={watchAll} onClose={() => setWatchAll(false)} onOpen={setWatchItem} />
      <WatchItemSheet item={watchItem} onClose={() => setWatchItem(null)} onFamily={setFamily} />
      {family && <FamilyMessageSheet open onClose={() => setFamily(null)} student={family.student} course={family.course} />}
    </Page>
  );
}
