import { useState } from 'react';
import { useUpdateMaterial, type Material } from '../../api/units';
import { Button, Sheet, TextArea, TextField, useFeedback } from '../../ui';

/** Renombrar + a private note ("usar después del ejemplo 3"). Mount with a material to open. */
export default function EditMaterialSheet({ material, onClose }: { material: Material; onClose: () => void }) {
  const [title, setTitle] = useState(material.title);
  const [notes, setNotes] = useState(material.notes ?? '');
  const update = useUpdateMaterial();
  const { toast } = useFeedback();
  const clean = title.trim();

  const save = async () => {
    if (!clean) return;
    try {
      await update.mutateAsync({ id: material.id, title: clean, notes: notes.trim() || null });
      toast('Cambios guardados');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  return (
    <Sheet open onClose={onClose} title="Renombrar"
      footer={<Button full disabled={!clean} loading={update.isPending} onClick={save}>{clean ? 'Guardar' : 'Escribe un nombre'}</Button>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Nombre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <TextArea label="Nota para ti (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={600}
          rows={3} placeholder="Por ejemplo: usar después del ejemplo 3" hint="Solo la ves tú, en la lista de materiales." />
      </form>
    </Sheet>
  );
}
