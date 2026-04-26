import { createRoot, type Root } from 'react-dom/client';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import type { Slide } from '../types/presentations';
import type { SlideThemeTokens } from '../components/slides/themes';
import SlideRenderer from '../components/slides/SlideRenderer';

/**
 * Export PDF — captura cada slide React renderizado real como imagen PNG y la
 * embebe en un PDF descargable. Esta es la única forma fiable de:
 *  1. Capturar los DIAGRAMAS REALES (SVG renderizado por DiagramRenderer).
 *  2. Producir un .pdf que se descarga como archivo (no depender del print
 *     dialog del navegador, que falla en muchos contextos móviles y produce
 *     archivos de 0 bytes).
 *
 * Flujo:
 *   - Crea un contenedor offscreen de exactamente 1280×720px (el canvas
 *     lógico del editor).
 *   - Para cada slide, monta SlideRenderer dentro vía createRoot.
 *   - Espera a que carguen fuentes y se pinte (rAF + delay).
 *   - Captura con html-to-image (toPng) — toPng inlinea estilos y atrapa SVG.
 *   - Embebe en jsPDF como imagen, una página por slide.
 *   - Descarga el archivo y limpia el contenedor.
 */

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
// 2× pixel ratio para buena calidad sin hacer el PDF gigante
const PIXEL_RATIO = 2;

export async function exportPresentationToPdf({
  title,
  slides,
  theme,
}: {
  title: string;
  slides: Slide[];
  theme: SlideThemeTokens;
}) {
  if (!slides.length) throw new Error('La presentación está vacía.');

  // Esperamos a que las fuentes del documento estén listas — algunas
  // tipografías display (Fraunces, Playfair) se cargan de Google Fonts.
  try {
    if ((document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
  } catch { /* best effort */ }

  // Contenedor offscreen — fuera del viewport pero EN el DOM (no display:none,
  // que rompe la captura). Usamos position:fixed con left negativo.
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  Object.assign(stage.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${LOGICAL_W}px`,
    height: `${LOGICAL_H}px`,
    pointerEvents: 'none',
    zIndex: '-1',
    background: '#ffffff',
    // CRÍTICO: el slide-frame interior usa width:100% + aspect-ratio + un
    // canvas absoluto. Necesita un padre con width fijo para calcular bien.
    overflow: 'hidden',
  });
  document.body.appendChild(stage);

  // jsPDF: tamaño A4 landscape exacto al canvas lógico (16:9). Usamos mm
  // para que la unidad sea predecible.
  const PAGE_W_MM = 297;
  const PAGE_H_MM = (PAGE_W_MM * LOGICAL_H) / LOGICAL_W; // ≈167mm
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAGE_W_MM, PAGE_H_MM] });

  let root: Root | null = null;

  try {
    root = createRoot(stage);

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      // Render del slide — sin animaciones ni typewriter para que la captura
      // pille el estado final ya pintado.
      root.render(
        createElement(SlideRenderer, {
          slide,
          theme,
          animate: false,
          typewriter: false,
          index: i,
          total: slides.length,
        }),
      );

      // Esperar a que React commit + paint + diagramas SVG se monten.
      await flush(slide.layout === 'content' ? 220 : 120);

      // Capturamos `.slide-canvas` (1280×720 fijos, sin border-radius ni
      // box-shadow). Esto produce una imagen limpia exacta del contenido,
      // sin las decoraciones del frame (esquinas redondeadas/sombra que
      // están pensadas para la vista en pantalla, no para el PDF).
      const frame = stage.querySelector('.slide-frame') as HTMLElement | null;
      const canvas = stage.querySelector('.slide-canvas') as HTMLElement | null;
      const target = canvas || frame || stage;

      if (canvas && frame) {
        // CRÍTICO: copiar el fondo del frame al canvas. El frame es quien
        // lleva el bg del tema (incluyendo gradients de cover); el canvas
        // está vacío. Sin esto, los covers con gradient salen sin fondo
        // → texto blanco invisible sobre el bg fallback blanco.
        const fStyle = getComputedStyle(frame);
        canvas.style.backgroundColor = fStyle.backgroundColor;
        canvas.style.backgroundImage = fStyle.backgroundImage;
        canvas.style.color = fStyle.color;
        // Neutralizamos el transform:scale — en stage 1280px ya está al 1:1
        canvas.style.transform = 'none';
      }

      // FIX animaciones: diag-reveal usa animation-fill-mode:backwards →
      // los elementos están en opacity:0 ANTES de empezar la animación.
      // Si capturamos durante el delay (p.ej. el 3er item con stagger),
      // sale invisible. Forzamos a estado final antes de capturar.
      stage.querySelectorAll<HTMLElement>('.diag-reveal').forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.style.animation = 'none';
      });

      let dataUrl: string;
      try {
        dataUrl = await toPng(target, {
          width: LOGICAL_W,
          height: LOGICAL_H,
          pixelRatio: PIXEL_RATIO,
          cacheBust: true,
          // backgroundColor evita transparencias raras si el tema usa gradient
          backgroundColor: theme.bg.startsWith('#') ? theme.bg : '#ffffff',
          // Algunos navegadores fallan al inlinear @font-face de Google Fonts
          // por CORS; skipFonts deja que el browser ya tenga la fuente cargada
          // (lo aseguramos con document.fonts.ready arriba).
          skipFonts: true,
        });
      } catch (err) {
        console.warn(`[exportPdf] slide ${i + 1} capture failed, retrying`, err);
        // Reintento sin skipFonts por si era ese el problema
        dataUrl = await toPng(target, {
          width: LOGICAL_W,
          height: LOGICAL_H,
          pixelRatio: PIXEL_RATIO,
          cacheBust: true,
          backgroundColor: '#ffffff',
        });
      }

      if (i > 0) pdf.addPage([PAGE_W_MM, PAGE_H_MM], 'landscape');
      pdf.addImage(dataUrl, 'PNG', 0, 0, PAGE_W_MM, PAGE_H_MM, undefined, 'FAST');
    }

    // Nombre de archivo: título del deck slugificado + .pdf
    const safeTitle = (title || 'presentacion')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'presentacion';
    pdf.save(`${safeTitle}.pdf`);
  } finally {
    // Cleanup: desmontar React y quitar el div del DOM. Damos un tick para
    // que React no suelte warnings de "unmount during render".
    setTimeout(() => {
      try { root?.unmount(); } catch { /* noop */ }
      try { document.body.removeChild(stage); } catch { /* noop */ }
    }, 0);
  }
}

// Espera a que React commit + browser paint + un margen para fuentes/diagramas.
function flush(extraMs: number): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, extraMs);
      });
    });
  });
}
