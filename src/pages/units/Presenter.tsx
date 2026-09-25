import { CaretLeft, CaretRight, CornersIn, CornersOut, Notepad, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContentDoc } from '../../api/content';
import { IconButton, RichText } from '../../ui';
import { CoverSlide, SlideFace, slideKey } from './SlideFace';
import './Presenter.css';

interface Props {
  doc: ContentDoc;
  kicker: string;
  figures: Record<string, string>;
  onClose: () => void;
}

/** «Proyectar»: the browser's full screen, one slide at a time. Keys: → / Espacio / AvPág next, ← / RePág back,
 *  Inicio / Fin, N speaker notes, F full screen, Esc leaves. Swipe or tap the sides on touch screens. */
export default function Presenter({ doc, kicker, figures, onClose }: Props) {
  const total = doc.slides.length + 1;
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState(false);
  const [full, setFull] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const go = useCallback((d: number) => setI((v) => Math.min(total - 1, Math.max(0, v + d))), [total]);

  const toggleFull = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen?.();
    } catch {
      /* not allowed (iPhone): the overlay already covers the screen */
    }
  }, []);

  const close = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const t = e.target as HTMLElement | null;
      // Enter / Espacio on a focused control (Salir, Notas…) activate it; they do not change the slide.
      if ((k === 'Enter' || k === ' ') && t?.closest('button, a, input, textarea, select, [role="button"]')) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) go(1);
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) go(-1);
      else if (k === 'Home') setI(0);
      else if (k === 'End') setI(total - 1);
      else if (k === 'n' || k === 'N') setNotes((v) => !v);
      else if (k === 'f' || k === 'F') void toggleFull();
      else if (k === 'Escape') void close();
      else return;
      e.preventDefault();
    };
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      document.body.style.overflow = prev;
    };
  }, [go, total, toggleFull, close]);

  // Full screen on open (it needs the tap that opened it; ignored where not allowed).
  useEffect(() => {
    if (!document.fullscreenElement) root.current?.requestFullscreen?.().catch(() => undefined);
  }, []);

  const slide = i > 0 ? doc.slides[i - 1] : null;
  const said = slide ? [slide.notes, ...slideKey(slide)].filter(Boolean) : [];

  return createPortal(
    <div ref={root} className="presenter" role="dialog" aria-modal="true" aria-label={`Proyectar: ${doc.title}`}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}>
      <div className="presenter__bar">
        <span className="presenter__count num" aria-live="polite">{i + 1} / {total}</span>
        <div className="presenter__tools">
          <IconButton label={notes ? 'Ocultar notas del orador (N)' : 'Ver notas del orador (N)'} onClick={() => setNotes((v) => !v)}
            className={notes ? 'presenter__on' : undefined}><Notepad size={22} /></IconButton>
          <IconButton label={full ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'} onClick={() => void toggleFull()}>
            {full ? <CornersIn size={22} /> : <CornersOut size={22} />}
          </IconButton>
          <IconButton label="Salir (Esc)" onClick={() => void close()}><X size={22} /></IconButton>
        </div>
      </div>

      <div className="presenter__stage">
        <div className="presenter__frame" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          go(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
        }}>
          {slide ? <SlideFace slide={slide} figure={figures[slide.id]} /> : <CoverSlide title={doc.title} kicker={kicker} />}
        </div>
        <p className="presenter__hint">Gira el móvil para ver la diapositiva más grande.</p>
      </div>

      {notes && (
        <div className="presenter__notes">
          {said.length ? said.map((t, k) => <RichText key={k} as="p" text={t} />) : <p>{i === 0 ? 'Portada.' : 'Esta diapositiva no tiene notas.'}</p>}
        </div>
      )}

      <div className="presenter__nav">
        <IconButton label="Diapositiva anterior" onClick={() => go(-1)} disabled={i === 0}><CaretLeft size={26} weight="bold" /></IconButton>
        <div className="presenter__dots" aria-hidden>
          {Array.from({ length: total }, (_, k) => <i key={k} className={k === i ? 'on' : undefined} />)}
        </div>
        <IconButton label="Diapositiva siguiente" onClick={() => go(1)} disabled={i === total - 1}><CaretRight size={26} weight="bold" /></IconButton>
      </div>
    </div>,
    document.body,
  );
}
