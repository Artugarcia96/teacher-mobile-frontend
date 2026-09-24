import { useEffect, useState } from 'react';
import { useUpdateNote } from '../../api/notes';
import type { Note, NoteKind } from '../../api/types';
import { ApiError } from '../../lib/api';
import { NOTE_KIND_LABEL } from '../../lib/format';
import { Button, Chip, DateField, Sheet, TextArea, useFeedback } from '../../ui';

const KINDS: NoteKind[] = ['observation', 'incident', 'positive', 'family'];

/** Edit an observation (kind, date, text). */
export default function EditNoteSheet({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const update = useUpdateNote();
  const [kind, setKind] = useState<NoteKind>('observation');
  const [date, setDate] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    setKind(note.kind); setDate(note.date); setText(note.text); setError(null);
  }, [note]);

  const save = async () => {
    if (!note) return;
    try {
      await update.mutateAsync({ id: note.id, kind, date, text: text.trim() });
      toast('Observación guardada');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
    }
  };

  return (
    <Sheet open={!!note} onClose={onClose} title="Editar observación"
      footer={<Button full onClick={save} loading={update.isPending} disabled={!text.trim()}>{text.trim() ? 'Guardar' : 'Escribe la observación'}</Button>}>
      <div className="form">
        <TextArea label="Texto" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="chip-row" role="group" aria-label="Tipo">
          {KINDS.map((k) => <Chip key={k} selected={kind === k} onClick={() => setKind(k)}>{NOTE_KIND_LABEL[k]}</Chip>)}
        </div>
        <DateField label="Fecha" value={date} onChange={(v) => v && setDate(v)} />
        {error && <div className="field__error" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
