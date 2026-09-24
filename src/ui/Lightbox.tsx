import { CaretLeft, CaretRight, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';
import './Lightbox.css';

interface Props {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  label?: string;
}

/** Full-screen image viewer (scanned pages). Tap the image to zoom 2x; arrows and Esc work. */
export function Lightbox({ images, index, onIndex, onClose, label }: Props) {
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < images.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [index, images.length, onClose, onIndex]);

  useEffect(() => setZoom(false), [index]);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={label ?? 'Página'}>
      <div className="lightbox__bar glass">
        <span className="lightbox__count num">{index + 1} / {images.length}</span>
        <IconButton label="Anterior" size="sm" disabled={index === 0} onClick={() => onIndex(index - 1)}><CaretLeft size={18} /></IconButton>
        <IconButton label="Siguiente" size="sm" disabled={index >= images.length - 1} onClick={() => onIndex(index + 1)}><CaretRight size={18} /></IconButton>
        <IconButton label="Cerrar" size="sm" onClick={onClose}><X size={18} /></IconButton>
      </div>
      <div className={`lightbox__stage${zoom ? ' lightbox__stage--zoom' : ''}`}>
        <img src={images[index]} alt={`Página ${index + 1}`} onClick={() => setZoom((z) => !z)} />
      </div>
    </div>,
    document.body,
  );
}
