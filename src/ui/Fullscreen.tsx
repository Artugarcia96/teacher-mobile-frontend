import { X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import './Fullscreen.css';

interface Props {
  onClose: () => void;
  label: string;
  children: ReactNode;
  /** `paper` (default): something shown to the class on a light page (the share QR). `stage`: the dark projection
   *  surface of the presenter, the teacher view and the projector window; its `bar` and `footer` fade out after a
   *  few seconds without the pointer moving, so the projector shows only the slide. */
  variant?: 'paper' | 'stage';
  /** Stage: the controls above and below the slide (the paper variant has its own «Cerrar»). */
  bar?: ReactNode;
  footer?: ReactNode;
  /** Ask the browser for full screen on open (default true). The teacher view stays a window. */
  full?: boolean;
}

/** Full-screen stage to show something to the class on the projector (Esc or "Cerrar" to leave). Uses the browser's
 *  fullscreen where available, so the toolbar does not show on the projector; leaving it closes too. */
export function Fullscreen({ onClose, label, children, variant = 'paper', bar, footer, full = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The stage takes the whole document to full screen, so a sheet opened over it (the notes on a phone, «Pasar
    // lista» in the teacher view) still shows; the paper variant takes only itself.
    const target = variant === 'stage' ? document.documentElement : ref.current;
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === target) entered = true;
      else if (entered) close.current(); // the browser's own Esc / gesture left fullscreen
    };
    document.addEventListener('fullscreenchange', onChange);
    if (full) target?.requestFullscreen?.().catch(() => undefined); // not on iPhone, or refused: the overlay still works
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, [full, variant]);

  // The stage's controls hide while the pointer rests (a projected slide carries nothing else).
  useEffect(() => {
    if (variant !== 'stage') return undefined;
    let timer = window.setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, [variant]);

  if (variant === 'stage') {
    return createPortal(
      <div ref={ref} className={`fullscreen fullscreen--stage${idle ? ' fullscreen--idle' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {bar && <div className="fullscreen__bar">{bar}</div>}
        <div className="fullscreen__stage">{children}</div>
        {footer && <div className="fullscreen__footer">{footer}</div>}
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div ref={ref} className="fullscreen" role="dialog" aria-modal="true" aria-label={label}>
      <Button className="fullscreen__close" variant="glass" size="sm" icon={<X size={16} />} onClick={onClose}>Cerrar</Button>
      <div className="fullscreen__stage">{children}</div>
    </div>,
    document.body,
  );
}

/** A 16:9 slide image as the server rendered it (never inverted in dark mode). `blank` covers it black or white
 *  (B and W while projecting); `overlay` draws on top at the slide's scale (the classroom timer); `fade` crossfades
 *  when its value changes (a new slide; build frames of one slide swap without a fade). Without `src`, `placeholder`
 *  says why (being rendered, could not be rendered). */
export function SlideImage({ src, alt, blank = 'none', overlay, fade, placeholder, className }: {
  src?: string; alt: string; blank?: 'none' | 'black' | 'white'; overlay?: ReactNode; fade?: string; placeholder?: ReactNode;
  className?: string;
}) {
  return (
    <div className={['slide-img', className].filter(Boolean).join(' ')}>
      {src
        ? <img key={fade} className={`slide-img__img${fade ? ' slide-img__img--fade' : ''}`} src={src} alt={alt} draggable={false} decoding="async" />
        : <div className="slide-img__placeholder">{placeholder}</div>}
      {overlay}
      {blank !== 'none' && <div className={`slide-img__blank slide-img__blank--${blank}`} aria-label={blank === 'black' ? 'Pantalla oscurecida' : 'Pantalla en blanco'} />}
    </div>
  );
}
