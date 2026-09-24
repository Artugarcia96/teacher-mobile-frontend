/** Building blocks of Hoy: "Ahora" card, agenda, pendiente, a vigilar. Layout in today.css. */
import {
  CalendarBlank, ChatCenteredText, Check, Exam, FlagCheckered, ListChecks, NotePencil, Table, UsersThree,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EVENT_KIND_LABEL, type PendingItem, type Today, type TodayEvent, type TodaySession, type WatchItem } from '../../api/today';
import { ordinals, parseDate, plural, shortDate } from '../../lib/format';
import { Button, Callout, Chip, Dot, List, Row, RowIcon } from '../../ui';

// ── Ahora / Acaba de terminar / Siguiente / Primera clase ──────────────────
/** `closable`: the card offers «Cerrar clase» (the class is running or has just ended). */
export type Focus = { session: TodaySession; eyebrow: string; closable: boolean };

/** Minutes after the bell during which the class that just ended keeps the card (walking out of the room). */
const JUST_ENDED_MIN = 15;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function remaining(now: string, end: string): string {
  const m = Math.max(0, minutes(end) - minutes(now));
  return m >= 60 ? `quedan ${Math.floor(m / 60)} h ${m % 60} min` : `quedan ${m} min`;
}

export function pickFocus(day: Today, today: string): Focus | null {
  const live = day.sessions.filter((s) => !s.cancelled);
  if (day.date > today) return live[0] ? { session: live[0], eyebrow: `Primera clase · ${live[0].start}`, closable: false } : null;
  if (!day.is_today) return null;
  const now = live.find((s) => s.status === 'now');
  if (now) return { session: now, eyebrow: `Ahora · ${remaining(day.now ?? now.start, now.end)}`, closable: true };
  const next = live.find((s) => s.status === 'next');
  // The class that just ended (break, free period) or the last one of the day: time to close it.
  const ended = [...live].reverse().find((s) => s.status === 'past');
  if (ended) {
    const since = minutes(day.now ?? ended.end) - minutes(ended.end);
    if (since <= JUST_ENDED_MIN) return { session: ended, eyebrow: 'Acaba de terminar', closable: true };
    if (!next) return { session: ended, eyebrow: `Última clase · terminó a las ${ended.end}`, closable: true };
  }
  if (next) {
    const first = live.every((s) => s.status !== 'past');
    return { session: next, eyebrow: `${first ? 'Primera clase' : 'Siguiente'} · ${next.start}`, closable: false };
  }
  return null;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "A las 08:30" (same day), "Ayer", "El martes", "El 12 nov" — when the previous class was, seen from the session day. */
function whenLabel(log: { date: string; start: string }, from: string): string {
  const diff = Math.round((parseDate(from).getTime() - parseDate(log.date).getTime()) / 86400000);
  if (diff === 0) return `A las ${log.start}`;
  if (diff === 1) return 'Ayer';
  if (diff > 1 && diff < 7) return `El ${WEEKDAYS[parseDate(log.date).getDay()]}`;
  return `El ${shortDate(log.date)}`;
}

export function attendanceLabel(a: TodaySession['attendance']): string {
  return ['Lista pasada', a.absent > 0 && plural(a.absent, 'falta', 'faltas'), a.late > 0 && plural(a.late, 'retraso', 'retrasos')]
    .filter(Boolean).join(' · ');
}

export function homeworkLabel(h: NonNullable<TodaySession['homework']>): string {
  if (!h.not_done && !h.partial) return 'Todos hechos';
  return [h.not_done > 0 && `${h.not_done} sin hacer`, h.partial > 0 && plural(h.partial, 'incompleto', 'incompletos')]
    .filter(Boolean).join(' · ');
}

/** «Toca: …» (bold), «Deberes: …» with the check, and «El martes: …» (secondary), from the class log. */
function SessionPlan({ s, canCheck, onHomework }: { s: TodaySession; canCheck: boolean; onHomework: (s: TodaySession) => void }) {
  const prev = s.previous;
  const hw = s.homework;
  if (!prev?.next && !hw?.text && !hw?.checked && !prev?.done) return null;
  return (
    <Callout>
      <div className="now-plan">
        {prev?.next && <b className="now-plan__next">Toca: {prev.next}</b>}
        {(hw?.text || hw?.checked) && (
          <div className="now-plan__hw">
            <span>Deberes{hw.text ? `: ${hw.text}` : ''}</span>
            {canCheck && (hw.checked
              ? <button type="button" className="section__action" onClick={() => onHomework(s)}>{homeworkLabel(hw)}</button>
              : <Button size="sm" variant="tinted" onClick={() => onHomework(s)}>Revisar</Button>)}
          </div>
        )}
        {prev?.done && <span className="now-plan__done">{whenLabel(prev, s.date)}: {prev.done}</span>}
      </div>
    </Callout>
  );
}

export function NowCard({ focus, today, onAttendance, onNote, onHomework, onClose }: {
  focus: Focus; today: string; onAttendance: (s: TodaySession) => void; onNote: (s: TodaySession) => void;
  onHomework: (s: TodaySession) => void; onClose: (s: TodaySession) => void;
}) {
  const s = focus.session;
  const canTake = s.date <= today;
  const meta = [s.room && `Aula ${s.room}`, `${s.start}–${s.end}`, s.unit].filter(Boolean).join(' · ');
  return (
    <section className="card now-card" aria-label={focus.eyebrow}>
      <div className="now-card__eyebrow eyebrow">{focus.eyebrow}</div>
      <Link to={`/clases/${s.course.id}`} className="now-card__title">
        <Dot color={s.course.color} large />
        <span>{s.course.label}</span>
      </Link>
      <div className="now-card__meta">{meta}</div>
      {s.activities.length > 0 && (
        <div className="chip-row">{s.activities.map((a) => <Chip key={a.id} tone={a.kind === 'exam' ? 'info' : undefined}>{a.title}</Chip>)}</div>
      )}
      <SessionPlan s={s} canCheck={canTake} onHomework={onHomework} />
      <div className="now-card__actions">
        {canTake && (s.attendance.taken
          ? <Button variant="tinted" icon={<Check size={18} weight="bold" />} onClick={() => onAttendance(s)} aria-label={`${attendanceLabel(s.attendance)}. Editar lista`}>{attendanceLabel(s.attendance)}</Button>
          : <Button icon={<ListChecks size={18} />} onClick={() => onAttendance(s)}>Pasar lista</Button>)}
        <Button variant="tinted" icon={<NotePencil size={18} />} onClick={() => onNote(s)}>Anotar</Button>
        {focus.closable && (
          <Button variant="neutral" icon={s.log ? <Check size={18} weight="bold" /> : <FlagCheckered size={18} />} onClick={() => onClose(s)}>
            {s.log ? 'Clase cerrada' : 'Cerrar clase'}
          </Button>
        )}
      </div>
    </section>
  );
}

// ── Agenda ─────────────────────────────────────────────────────────────────
function TimeCol({ start, end, now }: { start?: string | null; end?: string | null; now?: boolean }) {
  if (!start) return <span className="agenda-time"><b className="faint">Día</b></span>;
  return (
    <span className={`agenda-time num${now ? ' agenda-time--now' : ''}`}>
      <b>{start}</b>
      {end && <span className="faint">{end}</span>}
    </span>
  );
}

function sessionChips(s: TodaySession, onAttendance: (s: TodaySession) => void): ReactNode[] {
  const chips: ReactNode[] = [];
  if (s.guardia) chips.push(<Chip key="c" tone="info">Guardia</Chip>);
  else if (s.cancelled) chips.push(<Chip key="c">Cancelada</Chip>);
  else if (s.attendance.taken) chips.push(<Chip key="a" tone="ok" icon={<Check size={12} weight="bold" />}>Lista pasada</Chip>);
  else if (s.status === 'past' || s.status === 'now') chips.push(<Chip key="a" tone="warn" onClick={() => onAttendance(s)}>Lista sin pasar</Chip>);
  if (!s.cancelled && s.activities.some((a) => a.kind === 'exam')) chips.push(<Chip key="e" tone="info">Examen</Chip>);
  return chips;
}

export function Agenda({ day, onSession, onEvent, onAttendance }: {
  day: Today; onSession: (s: TodaySession) => void; onEvent: (e: TodayEvent) => void; onAttendance: (s: TodaySession) => void;
}) {
  const entries = [
    ...day.sessions.map((s) => {
      const sub = [s.room && `Aula ${s.room}`, s.unit].filter(Boolean).join(' · ');
      const chips = sessionChips(s, onAttendance);
      return {
        key: `s-${s.course.id}-${s.start}`, start: s.start,
        node: (
          // Stretched button: the whole row opens the session; the «Lista sin pasar» chip is its own button on top.
          <div key={`s-${s.course.id}-${s.start}`} className={`row agenda-row${s.cancelled ? ' row--muted' : ''}`}>
            <button type="button" className="agenda-row__hit" onClick={() => onSession(s)} aria-label={`${s.start} ${s.course.label}`} />
            <div className="row__lead"><TimeCol start={s.start} end={s.end} now={s.status === 'now' && !s.cancelled} /></div>
            <div className="row__main">
              <div className="row__title"><Dot color={s.course.color} /><span>{s.course.label}</span></div>
              <div className="row__sub agenda-sub">
                <span className="agenda-sub__text">{sub}</span>
                {chips.length > 0 && <span className="agenda-sub__chips">{chips}</span>}
              </div>
            </div>
          </div>
        ),
      };
    }),
    ...day.events.map((e) => ({
      key: `e-${e.id}`, start: e.start ?? '00:00',
      node: (
        <Row key={`e-${e.id}`} onClick={() => onEvent(e)} chevron={false}
          lead={<TimeCol start={e.start} end={e.end} />}
          title={<><CalendarBlank size={16} className="agenda-evicon" /><span>{e.title}</span></>}
          sub={[EVENT_KIND_LABEL[e.kind], e.course?.label].filter(Boolean).join(' · ')}
        />
      ),
    })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  return <List inset={72}>{entries.map((e) => e.node)}</List>;
}

/** Days that deserve a dot in the week strip: an event, or a list still due (same rule as Pendiente, from the server). */
export function dayNeedsAttention(d: { sessions: TodaySession[]; events: TodayEvent[] }): boolean {
  return d.events.length > 0 || d.sessions.some((s) => s.pending);
}

// ── Pendiente ──────────────────────────────────────────────────────────────
const PENDING_ICON: Record<PendingItem['kind'], ReactNode> = {
  attendance: <ListChecks size={20} />, review: <Exam size={20} />, grades: <Table size={20} />, comments: <ChatCenteredText size={20} />,
};

/** Already sorted by urgency by the server. */
export function PendingList({ items, onOpen }: { items: PendingItem[]; onOpen: (p: PendingItem) => void }) {
  if (!items.length) return <List><Row lead={<RowIcon><Check size={20} /></RowIcon>} title="Todo al día" sub="No hay listas, correcciones ni comentarios pendientes." muted /></List>;
  return (
    <List inset={64}>
      {items.map((p) => (
        <Row key={`${p.kind}-${p.course_id ?? ''}-${p.activity_id ?? ''}-${p.date ?? ''}-${p.start ?? ''}`} onClick={() => onOpen(p)}
          lead={<RowIcon tone={p.kind === 'attendance' ? 'warn' : 'accent'}>{PENDING_ICON[p.kind]}</RowIcon>} title={p.title} sub={p.sub} />
      ))}
    </List>
  );
}

// ── A vigilar ──────────────────────────────────────────────────────────────
export function WatchRows({ items, onOpen, empty }: {
  items: WatchItem[]; onOpen: (w: WatchItem) => void; empty: { title: string; sub?: string };
}) {
  if (!items.length) return <List><Row lead={<RowIcon><UsersThree size={20} /></RowIcon>} title={empty.title} sub={empty.sub} muted /></List>;
  return (
    <List>
      {items.map((w) => (
        <Row key={`${w.student.id}-${w.course.id}`} onClick={() => onOpen(w)} title={w.student.name} wrapSub
          sub={<span className="watch-sub">{ordinals(w.course.group.name)} · {w.reason}
            {w.reasons.length > 1 && <span className="faint"> · y {w.reasons.length - 1} más</span>}</span>} />
      ))}
    </List>
  );
}
