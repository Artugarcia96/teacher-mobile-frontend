/**
 * AddTopicInline — mini-formulario inline para añadir un tema sin modal.
 * Respeta el tono del resto del temario: 3 campos, Enter para confirmar.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  onSubmit: (name: string, description: string, trimester: number | null) => void;
  onCancel: () => void;
  existingTrimesters: number[];
}

const AddTopicInline: React.FC<Props> = ({ onSubmit, onCancel, existingTrimesters }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trimester, setTrimester] = useState<number | null>(
    existingTrimesters[0] ?? null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit(name, description, trimester);
  };

  return (
    <div className="ati">
      <input
        ref={inputRef}
        className="ati-name"
        placeholder="Nombre del tema (p. ej. Ecuaciones de segundo grado)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            onCancel();
          }
        }}
      />
      <input
        className="ati-desc"
        placeholder="Descripción corta (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="ati-actions">
        <div className="ati-trimesters" role="radiogroup" aria-label="Trimestre">
          {[1, 2, 3].map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={trimester === t}
              className={`ati-trim-btn ${trimester === t ? 'ati-trim-btn--active' : ''}`}
              onClick={() => setTrimester(trimester === t ? null : t)}
            >
              T{t}
            </button>
          ))}
        </div>
        <div className="ati-buttons">
          <button type="button" className="ati-cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="ati-submit"
            onClick={submit}
            disabled={!name.trim()}
          >
            Añadir tema
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTopicInline;
