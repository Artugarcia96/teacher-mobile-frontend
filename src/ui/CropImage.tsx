import { useState, type CSSProperties } from 'react';

interface Props {
  src: string;
  alt: string;
  /** The region, as fractions of the image (0 = left/top, 1 = right/bottom). */
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  onClick?: () => void;
}

/** A region of an image, full width (a question's answer on a scanned page). The image's aspect ratio is read when
 *  it loads (A4 until then). Tappable when `onClick` is given (open the whole page). */
export function CropImage({ src, alt, x0 = 0, y0 = 0, x1 = 1, y1 = 1, onClick }: Props) {
  const [ratio, setRatio] = useState(1.414); // height / width of the whole image
  const w = Math.max(0.01, x1 - x0);
  const h = Math.max(0.01, y1 - y0);
  const box: CSSProperties = { aspectRatio: `${w} / ${h * ratio}` };
  const img: CSSProperties = { width: `${100 / w}%`, left: `${(-x0 / w) * 100}%`, top: `${(-y0 / h) * 100}%` };
  const image = (
    <img src={src} alt={alt} loading="lazy" style={img}
      onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setRatio(i.naturalHeight / i.naturalWidth); }} />
  );
  return onClick
    ? <button type="button" className="crop crop--button" style={box} onClick={onClick} aria-label={alt}>{image}</button>
    : <div className="crop" style={box}>{image}</div>;
}
