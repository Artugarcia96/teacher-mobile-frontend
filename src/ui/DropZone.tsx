import { Camera, UploadSimple } from '@phosphor-icons/react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import './DropZone.css';

interface Props {
  onFiles: (files: File[]) => void;
  title: ReactNode;
  hint?: ReactNode;
  accept?: string;
  multiple?: boolean;
  buttonLabel: string;
  /** Extra button that opens the camera directly (shown only on touch devices). */
  cameraLabel?: string;
  disabled?: boolean;
}

/** Drag-and-drop area with a file button (and a camera button on phones). */
export function DropZone({ onFiles, title, hint, accept, multiple, buttonLabel, cameraLabel, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length && !disabled) onFiles(files);
  };

  return (
    <div
      className={`dropzone${over ? ' dropzone--over' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
    >
      <div className="dropzone__text">
        <div className="dropzone__title">{title}</div>
        {hint && <div className="dropzone__hint">{hint}</div>}
      </div>
      <div className="dropzone__actions">
        <Button icon={<UploadSimple size={18} />} disabled={disabled} onClick={() => input.current?.click()}>{buttonLabel}</Button>
        {cameraLabel && (
          <Button className="dropzone__camera" variant="tinted" icon={<Camera size={18} />} disabled={disabled} onClick={() => camera.current?.click()}>
            {cameraLabel}
          </Button>
        )}
      </div>
      <input ref={input} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {cameraLabel && (
        <input ref={camera} type="file" hidden accept="image/*" capture="environment" multiple={multiple}
          onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      )}
    </div>
  );
}
