import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { isContentDoc, type ContentDoc } from '../../api/content';
import { useMaterial, type MaterialDetail } from '../../api/units';
import { deckOf, useNow, usePrefetch, usePresenterState, useReportPresented } from '../../features/materials/deck';
import { initialState, reduce, type Deck, type PresenterState } from '../../features/materials/presenter';
import { channelName, nextSeq, receive, startPeer, type ProjectorMessage, type SharedState, type Unsent } from '../../features/materials/projector';
import { Spinner } from '../../ui';
import { StageSlide, useStageKeys, useTap } from './stage';
import './Presenter.css';

/** The state a teacher view broadcast, as this window's presenter state. */
function follow(deck: Deck, s: PresenterState, shared: SharedState): PresenterState {
  const moved = reduce(deck, s, { type: 'jump', lesson: shared.lesson, slideId: shared.slide, frame: shared.frame });
  return { ...moved, blank: shared.blank, timer: shared.timer };
}

/** «Ventana del proyector» (/proyectar/:materialId?sesion=k): only the slide, for the panel. Opened from the teacher
 *  view it follows that view (and sends its key presses there); opened on its own it is a presenter of its own. F puts
 *  it in full screen. */
export default function ProjectorPage() {
  const { materialId = '' } = useParams();
  const [params] = useSearchParams();
  const { data: m } = useMaterial(materialId);
  const doc = m && isContentDoc(m.content) ? m.content : null;
  if (!m || !doc) return <div className="projector"><Spinner /></div>;
  return <Projector key={m.id} m={m} doc={doc} lesson={Number(params.get('sesion')) || 1} />;
}

function Projector({ m, doc, lesson }: { m: MaterialDetail; doc: ContentDoc; lesson: number }) {
  const deck = useMemo(() => deckOf(m, doc), [m, doc]);
  const [s, dispatch] = usePresenterState(deck, initialState(lesson));
  const [owner, setOwner] = useState(true);
  const now = useNow(!!s.timer);
  usePrefetch(m, deck, s);
  useReportPresented(m.id, s, owner);

  const channel = useRef<BroadcastChannel | null>(null);
  const peer = useRef(startPeer('projector'));
  const seq = useRef(0);
  const latest = useRef({ deck, s });
  latest.current = { deck, s };
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
      setOwner(r.peer.owner);
      if (r.show) dispatch({ type: 'set', state: follow(latest.current.deck, latest.current.s, r.show) });
    };
    send({ type: 'hello' });
    return () => { ch.close(); channel.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  // Following a teacher view, a key press here goes there; on its own, this window applies it.
  const forward = (key: string) => {
    if (key === 'f' || key === 'F') {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
      return true;
    }
    if (peer.current.owner) return false;
    send({ type: 'key', key });
    return true;
  };
  useStageKeys(dispatch, forward);
  const tap = useTap((a) => {
    if (peer.current.owner) dispatch(a);
    else send({ type: 'key', key: a.type === 'prev' ? 'ArrowLeft' : 'ArrowRight' });
  });

  return (
    <div className="projector" aria-label={`Proyector: ${doc.title}`}>
      <div className="presenter__frame" {...tap} onDoubleClick={() => forward('f')}>
        <StageSlide m={m} doc={doc} deck={deck} s={s} now={now}
          onTimer={() => (owner ? dispatch({ type: 'timer', now: Date.now() }) : send({ type: 'key', key: 't' }))} />
      </div>
    </div>
  );
}
