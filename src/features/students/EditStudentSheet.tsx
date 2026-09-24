import { useEffect, useState } from 'react';
import { usePatchStudent } from '../../api/core';
import type { StudentRef } from '../../api/types';
import { ApiError } from '../../lib/api';
import { Button, List, Row, Sheet, Switch, TextArea, TextField, useFeedback } from '../../ui';

/** "Editar datos": name, support flags (NEAE/ACNEE), adaptation and private notes. */
export default function EditStudentSheet({ open, onClose, student, notesText }: {
  open: boolean; onClose: () => void; student: StudentRef; notesText?: string | null;
}) {
  const { toast } = useFeedback();
  const patch = usePatchStudent(student.id);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [neae, setNeae] = useState(false);
  const [acnee, setAcnee] = useState(false);
  const [kind, setKind] = useState('');
  const [adaptation, setAdaptation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const s = student.support ?? {};
    setFirst(student.first_name); setLast(student.last_name); setNeae(!!s.neae); setAcnee(!!s.acnee);
    setKind(s.kind ?? ''); setAdaptation(s.adaptation ?? ''); setNotes(notesText ?? ''); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setError(null);
    try {
      await patch.mutateAsync({
        first_name: first.trim(), last_name: last.trim(), notes: notes.trim() || null,
        support: { neae: neae || acnee, acnee, kind: kind.trim() || null, adaptation: adaptation.trim() || null },
      });
      toast('Datos guardados');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Editar datos"
      footer={<Button full onClick={save} loading={patch.isPending} disabled={!first.trim()}>{first.trim() ? 'Guardar' : 'Escribe el nombre'}</Button>}>
      <div className="form">
        <div className="form-row">
          <TextField label="Nombre" value={first} onChange={(e) => setFirst(e.target.value)} />
          <TextField label="Apellidos" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>
        <List>
          <Row title="NEAE" sub="Necesidad específica de apoyo educativo" trail={<Switch label="NEAE" checked={neae || acnee} onChange={setNeae} />} />
          <Row title="ACNEE" sub="Necesidades educativas especiales" trail={<Switch label="ACNEE" checked={acnee} onChange={setAcnee} />} />
        </List>
        {(neae || acnee) && (
          <div className="form-row">
            <TextField label="Tipo" placeholder="TDAH, dislexia…" value={kind} onChange={(e) => setKind(e.target.value)} />
            <TextField label="Adaptación" placeholder="No significativa" value={adaptation} onChange={(e) => setAdaptation(e.target.value)} />
          </div>
        )}
        <TextArea label="Notas privadas" hint="Solo las ves tú. No se usan para la IA." rows={4} value={notes}
          placeholder="Se sienta delante. Hermana en 4º ESO A." onChange={(e) => setNotes(e.target.value)} />
        {error && <div className="field__error" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
