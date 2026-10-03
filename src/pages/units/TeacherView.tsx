import { ArrowSquareOut, CaretDown, Monitor, MoonStars, UserList, X } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ContentDoc } from '../../api/content';
import { useDay } from '../../api/today';
import type { MaterialDetail } from '../../api/units';
import TakeAttendanceSheet from '../../features/attendance/TakeAttendanceSheet';
import { clock, deckOf, frameUrl, onScreen, slideOf, useNow, usePrefetch, usePresenterState, useReportPresented } from '../../features/materials/deck';
import { currentSlide, initialState, keyAction, peek, position, type PresenterAction } from '../../features/materials/presenter';
import { channelName, nextSeq, receive, startPeer, type ProjectorMessage, type SharedState, type Unsent } from '../../features/materials/projector';
import { useToday } from '../../lib/auth';
import { courseShortLabel } from '../../lib/format';
import { Button, Fullscreen, IconButton, Menu, Segmented, SlideImage } from '../../ui';
import { Notes } from './SlidesView';
import { StageSlide, useStageKeys } from './stage';
import './Presenter.css';

interface Props {
  m: MaterialDetail;
  doc: ContentDoc;
  lesson: number;
  slide?: number;
  onClose: () => void;
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** «Vista del profesor» (desktop): the slide on screen and the next one, the clocks, the notes and the classroom
 *  controls. It owns the projection: a projector window opened from here («Abrir ventana del proyector») shows only
 *  the slide state it broadcasts, so «Pasar lista» and the notes never reach the panel. */
export default function TeacherView({ m, doc, lesson, slide, onClose }: Props) {
  const deck = useMemo(() => deckOf(m, doc), [m, doc]);
  const [s, dispatch] = usePresenterState(deck, initialState(lesson, slide));
  const now = useNow();
  const started = useRef(Date.now());
  const [attendance, setAttendance] = useState(false);
  usePrefetch(m, deck, s);
  useReportPresented(m.id, s);

  // The projector window follows this state; keys pressed there come back here.
  const channel = useRef<BroadcastChannel | null>(null);
  const peer = useRef(startPeer('teacher'));
  const seq = useRef(0);
  const shared = useRef<SharedState | null>(null);
  const apply = useRef<(key: string) => void>(() => undefined);
  const act = (a: PresenterAction) => dispatch(a);
  apply.current = (key: string) => {
    if (key === 't' || key === 'T') act({ type: 'timer', now: Date.now() });
    else { const a = keyAction(key); if (a) act(a); }
  };
  const send = (msg: Unsent) => {
    seq.current = nextSeq(seq.current, Date.now());
    channel.current?.postMessage({ ...msg, seq: seq.current });
  };
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(channelName(m.id));
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<ProjectorMessage>) => {
      const r = receive(peer.current, e.data);
      peer.current = r.peer;
      if (r.key) apply.current(r.key);
      if (r.reply && shared.current) send({ type: 'state', ...shared.current });
    };
    return () => {
      send({ type: 'bye' });
      ch.close();
      channel.current = null;
    };
  }, [m.id]);
  const on = currentSlide(deck, s);
  useEffect(() => {
    if (!on) return;
    shared.current = { lesson: s.lesson, slide: on.id, frame: s.frame, blank: s.blank, timer: s.timer };
    send({ type: 'state', ...shared.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.lesson, on?.id, s.frame, s.blank, s.timer]);

  useStageKeys(dispatch);

  const { content } = onScreen(m, doc, deck, s);
  const { n, total } = position(deck, s);
  const next = peek(deck, s);
  const lessonDeck = deck.find((l) => l.n === s.lesson);
  const backups = lessonDeck?.hidden ?? [];
  const ownBackup = on && !s.detour ? backups.find((b) => b.backupFor === on.id) : undefined;

  // «min 14 · plan 12-17 · +2 min»: time since the first slide against the planned minutes of the slides so far.
  const planned = (lessonDeck?.seq ?? []).map((x) => slideOf(doc, x.id)?.minutes ?? 0);
  const from = planned.slice(0, s.pos).reduce((a, b) => a + b, 0);
  const to = from + (planned[s.pos] ?? 0);
  const elapsed = Math.floor((now - started.current) / 60_000);
  const drift = elapsed > to ? `+${elapsed - to} min` : elapsed < from ? `−${from - elapsed} min` : '';
  const timer = on && s.timer?.slideId === on.id ? clock(s.timer.endsAt - now) : null;

  const today = useToday();
  const day = useDay(today);
  const session = day.data?.sessions.find((x) => x.course.id === m.course.id && x.status === 'now' && !x.cancelled);

  const openProjector = () => {
    window.open(`/proyectar/${m.id}?sesion=${s.lesson}`, `sepia-proyector-${m.id}`, 'popup,width=1280,height=720');
  };

  const lessons = deck.map((l) => ({ value: l.n, label: String(l.n) }));
  const frames = on?.frames ?? 1;

  return (
    <Fullscreen variant="stage" full={false} label="Vista del profesor" onClose={onClose}
      bar={<>
        <span className="presenter__count">Vista del profesor · {doc.title}</span>
        <IconButton label="Salir (Esc)" onClick={onClose}><X size={22} /></IconButton>
      </>}>
      <div className="teacher">
        <div className="teacher__main">
          <StageSlide m={m} doc={doc} deck={deck} s={s} now={now} onTimer={() => act({ type: 'timer', now: Date.now() })} />
          <div className="teacher__status num">
            {frames > 1 && <span>Clic <b>{s.frame}</b> de {frames - 1}</span>}
            <span>{n ? <>Diapositiva <b>{n}</b> de {total}</> : 'Diapositiva de reserva'}</span>
          </div>
          {lessons.length > 1 && (
            <Segmented label="Sesión" value={s.lesson} onChange={(v) => act({ type: 'lesson', lesson: v })} options={lessons} />
          )}
          <div className="teacher__actions">
            <Button size="sm" variant="glass" icon={<Monitor size={16} />} onClick={openProjector}>Abrir ventana del proyector</Button>
            <Button size="sm" variant="glass" icon={<MoonStars size={16} />} onClick={() => act({ type: 'blank', blank: 'black' })}>
              {s.blank === 'black' ? 'Mostrar la diapositiva' : 'Oscurecer la pantalla'}
            </Button>
            <Button size="sm" variant="glass" icon={<UserList size={16} />} onClick={() => setAttendance(true)}
              disabled={!session}>{session ? 'Pasar lista' : 'Pasar lista: no hay clase de este grupo ahora'}</Button>
            {content?.archetype === 'enlace' && content.link_url && (
              <Button size="sm" variant="glass" icon={<ArrowSquareOut size={16} />} onClick={() => window.open(content.link_url, '_blank', 'noopener,noreferrer')}>Abrir enlace</Button>
            )}
            {backups.length > 0 && (
              <Menu trigger={(open) => <Button size="sm" variant="glass" icon={<CaretDown size={16} />} onClick={open}>Diapositivas de reserva</Button>}
                items={backups.map((b, i) => ({ label: `Reserva ${i + 1}${slideOf(doc, b.id)?.headline ? ` · ${slideOf(doc, b.id)!.headline}` : ''}`, onSelect: () => act({ type: 'show', id: b.id }) }))} />
            )}
          </div>
        </div>
        <div className="teacher__side">
          <div>
            <div className="teacher__label">Siguiente</div>
            {next
              ? <SlideImage src={frameUrl(m, next.slide.id, next.frame)} alt={m.slide_images[next.slide.id]?.alt ?? ''} />
              : <div className="teacher__end">Fin de la sesión</div>}
          </div>
          <div className="teacher__clocks num">
            <span className="teacher__clock">{hhmm(now)}</span>
            {timer && <span className="teacher__clock">{timer}</span>}
            {!s.detour && <span>min {elapsed} · plan {from}-{to}{drift && ` · ${drift}`}</span>}
          </div>
          {content && <Notes lines={m.slide_notes[content.id] ?? []} className="teacher__notes" />}
          {ownBackup && (
            <div className="teacher__backups">
              <Button size="sm" variant="glass" onClick={() => act({ type: 'show', id: ownBackup.id })}>Mostrar reserva</Button>
            </div>
          )}
        </div>
      </div>
      {attendance && session && (
        <TakeAttendanceSheet open onClose={() => setAttendance(false)} courseId={m.course.id} date={session.date} start={session.start}
          label={courseShortLabel(session.course)} room={session.room} />
      )}
    </Fullscreen>
  );
}
