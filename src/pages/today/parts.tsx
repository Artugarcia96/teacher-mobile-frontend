/** Building blocks of Hoy: "Ahora" card, agenda, pendiente, a vigilar. Layout in today.css. */
import {
  CalendarBlank, ChatCenteredText, Check, Exam, ListChecks, NotePencil, Table, UsersThree,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MaterialChips } from '../../features/materials/MaterialChips';
import { EVENT_KIND_LABEL, type PendingItem, type Today, type TodayEvent, type TodaySession, type WatchItem } from '../../api/today';
import { parseDate, plural, shortDate } from '../../lib/format';
import { Avatar, Button, Callout, Chip, Dot, Grade, List, Row, RowIcon } from '../../ui';

// ── Ahora / Siguiente / Primera clase ──────────────────────────────────────
export type Focus = { session: TodaySession; eyebrow: string; live: boolean };

export function pickFocus(day: Today, today: string): Focus | null {
  const live = day.sessions.filter((s) => !s.cancelled);
  if (day.date > today) return live[0] ? { session: live[0], eyebrow: `Primera clase · ${live[0].start}`, live: false } : null;
  if (!day.is_today) return null;
  const now = live.find((s) => s.status === 'now');
  if (now) return { session: now, eyebrow: `Ahora · termina ${now.end}`, live: true };
  const next = live.find((s) => s.status === 'next');
  if (next) {
    const first = live.every((s) => s.status !== 'past');
    return { session: next, eyebrow: `${first ? 'Primera clase' : 'Siguiente'} · ${next.start}`, live: false };
  }
  return null;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "ayer", "el martes", "12 nov" — how long ago the last note was, seen from the session day. */
function sinceLabel(iso: string, from: string): string {
  const diff = Math.round((parseDate(from).getTime() - parseDate(iso).getTime()) / 86400000);
  if (diff === 1) return 'ayer';
  if (diff > 1 && diff < 7) return `el ${WEEKDAYS[parseDate(iso).getDay()]}`;
  return `el ${shortDate(iso)}`;
}

export function attendanceLabel(a: TodaySession['attendance'], short = false): string {
  if (short) return a.absent ? `Lista · ${plural(a.absent, 'falta', 'faltas')}` : 'Lista pasada';
  const parts = ['Lista pasada'];
  if (a.absent) parts.push(plural(a.absent, 'falta', 'faltas'));
  if (a.late) parts.push(plural(a.late, 'retraso', 'retrasos'));
  return parts.join(' · ');
}

export function NowCard({ focus, today, onAttendance, onNote }: {
  focus: Focus; today: string; onAttendance: (s: TodaySession) => void; onNote: (s: TodaySession) => void;
}) {
  const s = focus.session;
  const canTake = s.date <= today;
  const meta = [s.room && `Aula ${s.room}`, `${s.start}–${s.end}`, s.unit].filter(Boolean).join(' · ');
  return (
    <section className="card now-card" aria-label={focus.eyebrow}>
      <div className="now-card__eyebrow eyebrow">
        {focus.live && <span className="live-dot" aria-hidden />}
        {focus.eyebrow}
      </div>
      <Link to={`/clases/${s.course.id}`} className="now-card__title">
        <Dot color={s.course.color} large />
        <span>{s.course.label}</span>
      </Link>
      <div className="now-card__meta">{meta}</div>
      {s.activities.length > 0 && (
        <div className="chip-row">{s.activities.map((a) => <Chip key={a.id} tone={a.kind === 'exam' ? 'info' : undefined}>{a.title}</Chip>)}</div>
      )}
      <MaterialChips session={s} />
      {s.last_note && (
        <Callout><b>La última vez, {sinceLabel(s.last_note.date, s.date)}:</b> {s.last_note.text}</Callout>
      )}
      <div className="now-card__actions">
        {canTake && (s.attendance.taken
          ? <Button variant="tinted" icon={<Check size={18} weight="bold" />} onClick={() => onAttendance(s)} aria-label={`${attendanceLabel(s.attendance)}. Editar lista`}>{attendanceLabel(s.attendance, true)}</Button>
          : <Button icon={<ListChecks size={18} />} onClick={() => onAttendance(s)}>Pasar lista</Button>)}
        <Button variant="tinted" icon={<NotePencil size={18} />} onClick={() => onNote(s)}>Anotar</Button>
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

type AgendaEntry = { key: string; start: string; node: ReactNode };

export function Agenda({ day, onSession, onEvent }: { day: Today; onSession: (s: TodaySession) => void; onEvent: (e: TodayEvent) => void }) {
  const entries: AgendaEntry[] = [
    ...day.sessions.map((s) => {
      const chips: ReactNode[] = [];
      if (s.cancelled) chips.push(<Chip key="c">Cancelada</Chip>);
      else if (s.attendance.taken) chips.push(<Chip key="a" tone="ok" icon={<Check size={12} weight="bold" />}>Lista</Chip>);
      else if (s.status === 'past' || s.status === 'now') chips.push(<Chip key="a" tone="warn">Lista sin pasar</Chip>);
      if (s.activities.some((a) => a.kind === 'exam')) chips.push(<Chip key="e" tone="info">Examen</Chip>);
      const sub = [s.room && `Aula ${s.room}`, s.unit].filter(Boolean).join(' · ');
      return {
        key: `s-${s.course.id}-${s.start}`, start: s.start,
        node: (
          <Row key={`s-${s.course.id}-${s.start}`} muted={s.cancelled} onClick={() => onSession(s)} chevron={false}
            aria-label={`${s.start} ${s.course.label}`}
            lead={<TimeCol start={s.start} end={s.end} now={s.status === 'now' && !s.cancelled} />}
            title={<><Dot color={s.course.color} /><span>{s.course.label}</span></>}
            wrapSub
            sub={<span className="agenda-sub"><span className="agenda-sub__text">{sub || ' '}</span>{chips.length > 0 && <span className="agenda-sub__chips">{chips}</span>}</span>}
          />
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

// ── Pendiente ──────────────────────────────────────────────────────────────
const PENDING_ORDER: Record<PendingItem['kind'], number> = { attendance: 0, review: 1, grades: 2, comments: 3 };
const PENDING_ICON: Record<PendingItem['kind'], ReactNode> = {
  attendance: <ListChecks size={20} />, review: <Exam size={20} />, grades: <Table size={20} />, comments: <ChatCenteredText size={20} />,
};

export function sortPending(items: PendingItem[]): PendingItem[] {
  return [...items].sort((a, b) => PENDING_ORDER[a.kind] - PENDING_ORDER[b.kind]);
}

export function PendingList({ items, onOpen }: { items: PendingItem[]; onOpen: (p: PendingItem) => void }) {
  if (!items.length) return <List><Row lead={<RowIcon><Check size={20} /></RowIcon>} title="Todo al día" sub="No hay listas, correcciones ni comentarios pendientes." muted /></List>;
  return (
    <List inset={64}>
      {items.map((p) => (
        <Row key={`${p.kind}-${p.course_id}-${p.activity_id ?? ''}-${p.date ?? ''}-${p.start ?? ''}`} onClick={() => onOpen(p)}
          lead={<RowIcon tone={p.kind === 'attendance' ? 'warn' : 'accent'}>{PENDING_ICON[p.kind]}</RowIcon>} title={p.title} sub={p.sub} />
      ))}
    </List>
  );
}

// ── A vigilar ──────────────────────────────────────────────────────────────
export function WatchRows({ items }: { items: WatchItem[] }) {
  if (!items.length) return <List><Row lead={<RowIcon><UsersThree size={20} /></RowIcon>} title="Nadie a vigilar" sub="Ningún alumno cumple las reglas de alerta." muted /></List>;
  return (
    <List inset={64}>
      {items.map((w) => (
        <Row key={`${w.student.id}-${w.course.id}`} to={`/alumnos/${w.student.id}`}
          lead={<Avatar initials={w.student.initials} />} title={w.student.name}
          sub={[w.course.group.name, ...w.reasons].join(' · ')} trail={<Grade value={w.average} className="watch-avg" />} />
      ))}
    </List>
  );
}
