import { memo, useMemo } from 'react';
import { RichText } from '../../ui';
import './Figure.css';

/** Width / height of a server SVG (from its size in points); 1 when unknown. */
export function svgAspect(svg: string | undefined): number {
  const w = svg?.match(/<svg[^>]*\swidth="([\d.]+)pt"/), h = svg?.match(/<svg[^>]*\sheight="([\d.]+)pt"/);
  return w && h && Number(h[1]) > 0 ? Number(w[1]) / Number(h[1]) : 1;
}

/** A figure of a material as the server draws it (the same drawing as the PDF and the .pptx), shown as an image:
 *  nothing in it runs. In dark mode the drawing is inverted by a token (`--figure-filter`). */
export const Figure = memo(function Figure({ svg, caption, fill, label }: {
  svg: string | undefined; caption?: string; fill?: boolean; label?: string;
}) {
  const src = useMemo(() => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : ''), [svg]);
  const width = useMemo(() => {
    const m = svg?.match(/<svg[^>]*\swidth="([\d.]+)pt"/);
    return m ? Math.round(Number(m[1]) * (4 / 3)) : undefined; // pt → px: never drawn larger than its natural size
  }, [svg]);
  if (!svg) return null;
  return (
    <figure className={`fig${fill ? ' fig--fill' : ''}`}>
      <img className="fig__img" src={src} alt={label ?? caption ?? 'Figura'} style={fill ? undefined : { maxWidth: width }} draggable={false} />
      {caption && <figcaption className="fig__caption"><RichText text={caption} /></figcaption>}
    </figure>
  );
});
