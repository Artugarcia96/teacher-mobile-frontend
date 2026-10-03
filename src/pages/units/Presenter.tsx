import { ArrowSquareOut, CaretLeft, CaretRight, Notepad, X } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import type { ContentDoc } from '../../api/content';
import type { MaterialDetail } from '../../api/units';
import { deckOf, onScreen, useNow, usePrefetch, usePresenterState, useReportPresented } from '../../features/materials/deck';
import { initialState, position } from '../../features/materials/presenter';
import { Button, DESKTOP, Fullscreen, IconButton, Sheet, useMediaQuery } from '../../ui';
import { Notes } from './SlidesView';
import { StageSlide, useStageKeys, useTap } from './stage';
import './Presenter.css';

interface Props {
  m: MaterialDetail;
  doc: ContentDoc;
  lesson: number;
  /** Slide to start at (1-based among the projected ones): «Seguir en la diapositiva 12». */
  slide?: number;
  onClose: () => void;
  /** P (desktop): the teacher view takes over at the same place. */
  onTeacherView?: (lesson: number, slide: number) => void;
}

/** «Proyectar sesión k»: the browser's full screen, the lesson's slides as the server rendered them, frame by frame
 *  (PowerPoint's keys, §1.3). Nothing but the slide and the classroom timer is on screen; the notes stay on the phone
 *  («Notas») or in the teacher view. Backup slides are skipped unless H shows them; the credits slide is not projected. */
export default function Presenter({ m, doc, lesson, slide, onClose, onTeacherView }: Props) {
  const deck = useMemo(() => deckOf(m, doc), [m, doc]);
  const [s, dispatch] = usePresenterState(deck, initialState(lesson, slide));
  const desktop = useMediaQuery(DESKTOP);
  const [notes, setNotes] = useState(false);
  const now = useNow(!!s.timer);
  usePrefetch(m, deck, s);
  useReportPresented(m.id, s);
  useStageKeys(dispatch, (key) => {
    if ((key === 'p' || key === 'P') && desktop && onTeacherView) { onTeacherView(s.lesson, s.pos + 1); return true; }
    return false;
  });
  const tap = useTap(dispatch);
  const { content } = onScreen(m, doc, deck, s);
  const { n, total } = position(deck, s);
  const link = content?.archetype === 'enlace' ? content.link_url : '';

  return (
    <Fullscreen variant="stage" label={`Proyectar sesión ${s.lesson}`} onClose={onClose}
      bar={<>
        <span className="presenter__count num" aria-live="polite">{n ? `Diapositiva ${n} de ${total}` : 'Diapositiva de reserva'}</span>
        <span className="presenter__tools">
          {link && <Button size="sm" variant="glass" icon={<ArrowSquareOut size={16} />} onClick={() => window.open(link, '_blank', 'noopener,noreferrer')}>Abrir enlace</Button>}
          {!desktop && <IconButton label="Notas" onClick={() => setNotes(true)}><Notepad size={22} /></IconButton>}
          <IconButton label="Salir (Esc)" onClick={onClose}><X size={22} /></IconButton>
        </span>
      </>}
      footer={<>
        <IconButton label="Anterior" onClick={() => dispatch({ type: 'prev' })} disabled={s.pos === 0 && s.frame === 0 && !s.detour}>
          <CaretLeft size={26} weight="bold" />
        </IconButton>
        <IconButton label="Siguiente" onClick={() => dispatch({ type: 'next' })}><CaretRight size={26} weight="bold" /></IconButton>
      </>}>
      <div className="presenter__frame" {...tap}>
        <StageSlide m={m} doc={doc} deck={deck} s={s} now={now} onTimer={() => dispatch({ type: 'timer', now: Date.now() })} />
      </div>
      <p className="presenter__hint">Gira el móvil para ver la diapositiva más grande.</p>
      {notes && (
        <Sheet open onClose={() => setNotes(false)} title={n ? `Notas · diapositiva ${n}` : 'Notas · reserva'}>
          {content && (m.slide_notes[content.id]?.length
            ? <Notes lines={m.slide_notes[content.id]} className="presenter__notes" />
            : <p className="muted">Esta diapositiva no tiene notas.</p>)}
        </Sheet>
      )}
    </Fullscreen>
  );
}
