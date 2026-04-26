/* Typewriter coordinado.
 *
 * Resuelve los problemas del v1:
 *  - Cada `<TypedText>` se sincroniza con el reloj de la slide (un único
 *    timer compartido vía contexto), así dos elementos con `delay` distinto
 *    no compiten entre sí ni se pisan los timers.
 *  - Respeta `prefers-reduced-motion` automáticamente — ahí pasa a
 *    pass-through.
 *  - Click en cualquier sitio de la slide salta al final.
 *  - Usa `requestAnimationFrame` para alinear con el repaint, no setTimeout
 *    recursivo (el navegador los recorta cuando la pestaña pierde foco).
 *
 * Uso:
 *  <TypewriterScope active={typewriter}>
 *     <TypedText value="..." delay={120} />
 *  </TypewriterScope>
 *
 *  Click en la slide → skipToEnd().
 */

import {
  createContext, useContext, useEffect, useRef, useState, useCallback,
} from 'react';

const CHARS_PER_SECOND = 60;          // ~17ms / char en velocidad normal
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface Ctx {
  active: boolean;
  /** Tiempo (ms) transcurrido desde que el scope se activó. */
  elapsed: number;
  /** Si true, se ha "skipped" — todo el texto debe verse al instante. */
  skipped: boolean;
  skipToEnd: () => void;
}

const TypewriterContext = createContext<Ctx>({
  active: false, elapsed: 0, skipped: false, skipToEnd: () => {},
});

export const TypewriterScope: React.FC<{
  active: boolean;
  children: React.ReactNode;
  /** Reset tick: cuando cambie el valor, reinicia el reloj.
   *  Útil para volver a animar cuando se cambia de slide. */
  resetKey?: string | number;
  /** Si el caller quiere ofrecer click-to-skip, debe envolver un handler
   *  alrededor del scope o pasar `clickToSkip` y dejar que el scope cree
   *  un wrapper transparente. */
  clickToSkip?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ active, children, resetKey, clickToSkip, className, style }) => {
  const reduce = usePrefersReducedMotion();
  const effectiveActive = active && !reduce;
  const [elapsed, setElapsed] = useState(0);
  const [skipped, setSkipped] = useState(!effectiveActive);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Reset cuando cambia la slide o el modo
  useEffect(() => {
    setElapsed(0);
    setSkipped(!effectiveActive);
    startRef.current = effectiveActive ? performance.now() : null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (!effectiveActive) return;

    const tick = (now: number) => {
      if (startRef.current == null) return;
      setElapsed(now - startRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [effectiveActive, resetKey]);

  const skipToEnd = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setSkipped(true);
  }, []);

  const handleClick = clickToSkip
    ? () => {
        if (effectiveActive && !skipped) skipToEnd();
      }
    : undefined;

  return (
    <TypewriterContext.Provider value={{ active: effectiveActive, elapsed, skipped, skipToEnd }}>
      <div onClick={handleClick} className={className} style={style}>
        {children}
      </div>
    </TypewriterContext.Provider>
  );
};

interface TypedProps {
  value: string;
  /** Delay en ms desde el inicio del scope. */
  delay?: number;
  className?: string;
  /** Velocidad relativa: 1 = normal (~60 cps), 2 = doble. */
  speed?: number;
}

export const TypedText: React.FC<TypedProps> = ({ value, delay = 0, className, speed = 1 }) => {
  const { active, elapsed, skipped } = useContext(TypewriterContext);
  if (!active || skipped) {
    return <span className={className}>{value}</span>;
  }
  const charsPerMs = (CHARS_PER_SECOND * speed) / 1000;
  const localElapsed = Math.max(0, elapsed - delay);
  const shown = Math.min(value.length, Math.floor(localElapsed * charsPerMs));
  const isWriting = shown < value.length;
  return (
    <span className={className}>
      {value.slice(0, shown)}
      {isWriting && <span className="slide-typewriter-cursor" aria-hidden>▍</span>}
    </span>
  );
};

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const listener = (ev: MediaQueryListEvent) => setReduce(ev.matches);
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);
  return reduce;
}
