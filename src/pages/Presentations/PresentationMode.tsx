import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Slide } from '../../types/presentations';
import type { SlideThemeTokens } from '../../components/slides/themes';
import SlideRenderer from '../../components/slides/SlideRenderer';
import ErrorBoundary from '../../components/shared/ErrorBoundary';

interface Props {
  slides: Slide[];
  theme: SlideThemeTokens;
  initialIndex?: number;
  logoUrl?: string | null;
  onClose: () => void;
}

/** Fullscreen 16:9 presentation mode. Navegación con flechas, espacio o clic.
 *  Se escapa con Esc. No hay chrome de app mientras está activo. */
const PresentationMode: React.FC<Props> = ({ slides, theme, initialIndex = 0, logoUrl, onClose }) => {
  const [idx, setIdx] = useState(initialIndex);

  const go = useCallback((delta: number) => {
    setIdx((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));
  }, [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'Home') { setIdx(0); }
      else if (e.key === 'End') { setIdx(slides.length - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose, slides.length]);

  const slide = useMemo(() => slides[idx], [slides, idx]);
  if (!slide) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center select-none"
      onClick={(e) => {
        // clic en la mitad izquierda = atrás, mitad derecha = adelante
        const r = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < r.width / 2) go(-1); else go(1);
      }}
    >
      <div
        className="presentation-mode-frame"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Las 'slide-frame' usan aspect-ratio 16:9. Reaprovecho SlideRenderer. */}
        <ErrorBoundary label={`present:${idx}`}>
          <SlideRenderer slide={slide} theme={theme} animate index={idx} total={slides.length} logoUrl={logoUrl} />
        </ErrorBoundary>
      </div>

      {/* Chrome superpuesto (clicks paran la propagación) */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-10 h-10 flex items-center justify-center"
        aria-label="Salir del modo presentación"
      >
        <X size={18} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); go(-1); }}
        disabled={idx === 0}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-11 h-11 flex items-center justify-center disabled:opacity-30"
        aria-label="Anterior"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); go(1); }}
        disabled={idx === slides.length - 1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full w-11 h-11 flex items-center justify-center disabled:opacity-30"
        aria-label="Siguiente"
      >
        <ChevronRight size={22} />
      </button>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/70 text-xs font-semibold bg-black/40 px-3 py-1 rounded-full">
        {idx + 1} / {slides.length}
      </div>
    </div>
  );
};

export default PresentationMode;
