import { useEffect, useRef, useState } from 'react';

/** Texto editable con click-to-edit. Por defecto se renderiza como un elemento
 *  visual (h1/h2/p/span…); al hacer click entra en modo edición con <textarea>
 *  auto-dimensionado; al perder foco o pulsar Esc sale y guarda.
 *
 *  Pensado para que el profe edite los títulos y textos directamente sobre el
 *  slide, sin paneles aparte. */
interface Props {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  as?: keyof JSX.IntrinsicElements;
  multiline?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Si true, no muestra el placeholder cuando está vacío (útil para campos opcionales). */
  suppressEmpty?: boolean;
}

const InlineText: React.FC<Props> = ({
  value,
  placeholder,
  onChange,
  as = 'span',
  multiline = false,
  className,
  style,
  suppressEmpty,
}) => {
  const [editing, setEditing] = useState(false);
  const [buffer, setBuffer] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => { if (!editing) setBuffer(value); }, [value, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if ('setSelectionRange' in ref.current) {
        const len = ref.current.value.length;
        try { ref.current.setSelectionRange(len, len); } catch {}
      }
      if (ref.current instanceof HTMLTextAreaElement) autoresize(ref.current);
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (buffer !== value) onChange(buffer);
  };
  const cancel = () => {
    setBuffer(value);
    setEditing(false);
  };

  const Tag = as as any;

  if (editing) {
    const commonStyle: React.CSSProperties = {
      ...style,
      background: 'transparent',
      border: '1px dashed currentColor',
      outline: 'none',
      width: '100%',
      padding: '2px 4px',
      margin: '-3px -5px',
      borderRadius: 4,
      fontFamily: 'inherit',
      fontSize: 'inherit',
      fontWeight: 'inherit',
      lineHeight: 'inherit',
      color: 'inherit',
    };
    if (multiline) {
      return (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={buffer}
          onChange={(e) => { setBuffer(e.target.value); autoresize(e.target); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            // Cmd/Ctrl+Enter confirma (Enter normal permite salto de línea)
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); commit(); }
          }}
          className={className}
          style={{ ...commonStyle, resize: 'none', overflow: 'hidden' }}
        />
      );
    }
    return (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        value={buffer}
        onChange={(e) => setBuffer(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
        }}
        className={className}
        style={commonStyle}
      />
    );
  }

  const empty = !value || !value.trim();
  if (empty && suppressEmpty) {
    return (
      <Tag
        className={className}
        style={{ ...style, cursor: 'text', minHeight: '1em' }}
        onClick={() => setEditing(true)}
        title="Click para editar"
      >
        {'\u00A0'}
      </Tag>
    );
  }

  return (
    <Tag
      className={`inline-editable ${className || ''}`.trim()}
      style={{ ...style, cursor: 'text' }}
      onClick={() => setEditing(true)}
      title="Click para editar"
    >
      {empty ? <span style={{ opacity: 0.45 }}>{placeholder || 'Escribir…'}</span> : value}
    </Tag>
  );
};

function autoresize(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export default InlineText;
