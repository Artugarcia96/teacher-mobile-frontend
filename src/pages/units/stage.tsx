import { useEffect, useRef, type MouseEvent, type TouchEvent } from 'react';
import type { ContentDoc } from '../../api/content';
import type { MaterialDetail } from '../../api/units';
import { clock, onScreen } from '../../features/materials/deck';
import { keyAction, type Deck, type PresenterAction, type PresenterState } from '../../features/materials/presenter';
import { SlideImage } from '../../ui';

/** The slide on screen at its build frame, blanked by B / W, with the classroom timer on task slides: the same in the
 *  presenter, the teacher view and the projector window. */
export function StageSlide({ m, doc, deck, s, now, onTimer, className }: {
  m: MaterialDetail; doc: ContentDoc; deck: Deck; s: PresenterState; now: number;
  /** Tap on the timer: start or stop it (never starts by itself). */
  onTimer?: () => void;
  className?: string;
}) {
  const { slide, src, alt } = onScreen(m, doc, deck, s);
  const running = slide && s.timer?.slideId === slide.id ? s.timer : null;
  const timer = slide && slide.timer > 0 ? (
    <button type="button" className="slide-img__timer num" onClick={(e) => { e.stopPropagation(); onTimer?.(); }}
      aria-label={running ? 'Parar el temporizador (T)' : 'Empezar el temporizador (T)'} tabIndex={onTimer ? 0 : -1}>
      {clock(running ? running.endsAt - now : slide.timer * 60_000)}
    </button>
  ) : null;
  return (
    <SlideImage className={className} src={src} alt={alt} blank={s.blank} fade={slide?.id} overlay={timer}
      placeholder={slide && m.frames_failed.includes(slide.id) ? 'Esta diapositiva no se ha podido maquetar.' : undefined} />
  );
}

/** PowerPoint's keys on the whole window while projecting. T starts or stops the timer; `extra` handles the keys of
 *  the screen itself (P: teacher view). Keys typed in a field or on a focused button are left alone. */
export function useStageKeys(dispatch: (a: PresenterAction) => void, extra?: (key: string) => boolean) {
  const ref = useRef({ dispatch, extra });
  ref.current = { dispatch, extra };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"], .sheet')) return;
      if ((e.key === 'Enter' || e.key === ' ') && t?.closest('button, a, [role="button"]')) return;
      if (ref.current.extra?.(e.key)) { e.preventDefault(); return; }
      if (e.key === 't' || e.key === 'T') {
        ref.current.dispatch({ type: 'timer', now: Date.now() });
        e.preventDefault();
        return;
      }
      const a = keyAction(e.key);
      if (!a) return;
      ref.current.dispatch(a);
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** Swipe, or tap the right 70 % / left 30 % of the slide. */
export function useTap(dispatch: (a: PresenterAction) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; },
    onTouchEnd: (e: TouchEvent) => {
      const t = start.current;
      start.current = null;
      if (!t) return;
      const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        dispatch({ type: dx < 0 ? 'next' : 'prev' });
        e.preventDefault();
      }
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      dispatch({ type: e.clientX - r.left < r.width * 0.3 ? 'prev' : 'next' });
    },
  };
}
