import { useEffect, useState } from 'react';
import { usePatchStudent } from '../../api/core';
import type { Measure, StudentRef, Support } from '../../api/types';
import { ApiError } from '../../lib/api';
import { Button, List, Row, Sheet, Switch, TextArea, TextField, useFeedback } from '../../ui';
import { MEASURES } from './support';
import './students.css';

const EMPTY: Support = { neae: false, acnee: false, kind: null, measures: [], acs_level: null, notes: null };

/** "Editar datos y apoyos": name, NEAE/ACNEE marks, adaptation measures (toggles), their details and private notes. */
export default function EditStudentSheet({ open, onClose, student, notesText }: {
  open: boolean; onClose: () => void; student: StudentRef; notesText?: string | null;
}) {
  const { toast } = useFeedback();
  const patch = usePatchStudent(student.id);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [sup, setSup] = useState<Support>(EMPTY);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirst(student.first_name); setLast(student.last_name); setSup({ ...EMPTY, ...student.support });
    setNotes(notesText ?? ''); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<Support>) => setSup((s) => ({ ...s, ...patch }));
  const toggle = (m: Measure, on: boolean) => set({ measures: on ? [...sup.measures, m] : sup.measures.filter((x) => x !== m) });
  const marked = sup.neae || sup.acnee;

  const save = async () => {
    setError(null);
    try {
      await patch.mutateAsync({
        first_name: first.trim(), last_name: last.trim(), notes: notes.trim() || null,
        support: { ...sup, neae: marked, kind: marked ? sup.kind?.trim() || null : null, notes: sup.notes?.trim() || null },
      });
      toast('Datos guardados');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se ha podido guardar. Inténtalo de nuevo.');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Editar datos y apoyos" subtitle={student.name} size="large" side
      footer={<Button full onClick={save} loading={patch.isPending} disabled={!first.trim()}>{first.trim() ? 'Guardar' : 'Escribe el nombre'}</Button>}>
      <div className="form">
        <div className="form-row">
          <TextField label="Nombre" value={first} onChange={(e) => setFirst(e.target.value)} />
          <TextField label="Apellidos" value={last} onChange={(e) => setLast(e.target.value)} />
        </div>

        <div className="edit-st__group">
          <span className="field__label">Necesidades de apoyo</span>
          <List>
            <Row title="NEAE" sub="Necesidad específica de apoyo educativo" trail={<Switch label="NEAE" checked={marked} onChange={(v) => set({ neae: v, acnee: v && sup.acnee })} />} />
            <Row title="ACNEE" sub="Necesidades educativas especiales" trail={<Switch label="ACNEE" checked={sup.acnee} onChange={(v) => set({ acnee: v })} />} />
          </List>
          {marked && <TextField label="Tipo" placeholder="TDAH, dislexia, altas capacidades…" value={sup.kind ?? ''} onChange={(e) => set({ kind: e.target.value })} />}
        </div>

        <div className="edit-st__group">
          <span className="field__label">Medidas</span>
          <List>
            {MEASURES.map((m) => (
              <Row key={m.key} title={<span className="edit-st__measure">{m.label}</span>} chevron={false}
                trail={<Switch label={m.label} checked={sup.measures.includes(m.key)} onChange={(v) => toggle(m.key, v)} />} />
            ))}
          </List>
          {sup.measures.includes('acs') && (
            <TextField label="Nivel de la ACS" placeholder="5.º Primaria" maxLength={40} value={sup.acs_level ?? ''}
              onChange={(e) => set({ acs_level: e.target.value })} hint="El curso al que se refiere su adaptación curricular." />
          )}
          <span className="field__hint">Las medidas se ven en la lista de la clase y sirven para preparar versiones adaptadas de los exámenes.</span>
        </div>

        <TextArea label="Detalles de la adaptación" rows={2} maxLength={400} value={sup.notes ?? ''}
          placeholder="Se sienta cerca de la pizarra. Puede usar calculadora." onChange={(e) => set({ notes: e.target.value })} />
        <TextArea label="Notas privadas" hint="Solo las ves tú. No se usan para la IA." rows={3} value={notes}
          placeholder="Hermana en 4.º ESO A." onChange={(e) => setNotes(e.target.value)} />
        {error && <div className="field__error" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
