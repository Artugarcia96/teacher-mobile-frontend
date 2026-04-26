import { useEffect, useRef } from 'react';

/**
 * Canvas lógico fijo al estilo Gamma / Keynote / PowerPoint.
 *
 * El problema que resuelve: si cada slide usa unidades relativas (cqi, %)
 * con auto-fit correctivo, dos slides con densidades distintas acaban con
 * tipografías de tamaños distintos — rompe la coherencia visual.
 *
 * Solución estándar de la industria:
 *  - Todo el interior del slide se dibuja sobre un canvas lógico FIJO
 *    (1280×720 px por defecto, exacto 16:9).
 *  - Las fuentes, paddings, márgenes son en **px absolutos** dentro del canvas.
 *  - El wrapper exterior observa su ancho real y calcula un único
 *    `transform: scale(actualWidth / 1280)` que aplica al canvas interior.
 *  - Todos los slides escalan con el **mismo factor** dentro de una misma
 *    vista — consistencia garantizada.
 *  - Si el contenido interior desborda 720 px de alto, queda recortado por
 *    el `overflow: hidden` del frame (señal de que la IA debe partir el
 *    slide en dos, no un bug de render).
 *  - Bonus: el export PDF renderiza el MISMO canvas 1280×720 y sale idéntico.
 *
 * API:
 *  - `frameRef`: asignar al contenedor exterior responsive (el que fija 16:9).
 *  - El scale se expone como CSS var `--canvas-scale` en el frame; la regla
 *    en slides.css lo aplica al `.slide-canvas`.
 */
export function useLogicalCanvas<F extends HTMLElement = HTMLDivElement>(
  logicalWidth = 1280,
) {
  const frameRef = useRef<F | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const apply = () => {
      const w = frame.clientWidth;
      if (w <= 0) return;
      const scale = w / logicalWidth;
      frame.style.setProperty('--canvas-scale', String(scale));
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(frame);

    // Re-aplicar tras carga de fuentes — en algunos navegadores el primer
    // layout se hace con fallback y luego las fuentes display cargan.
    const fonts = (document as any).fonts;
    if (fonts?.ready?.then) {
      fonts.ready.then(() => apply()).catch(() => {});
    }

    return () => ro.disconnect();
  }, [logicalWidth]);

  return { frameRef };
}

/** Dimensiones del canvas lógico — expuestas para que el export PDF use las
 *  mismas y el layout quede idéntico en pantalla y en impresión. */
export const LOGICAL_CANVAS_WIDTH = 1280;
export const LOGICAL_CANVAS_HEIGHT = 720;
