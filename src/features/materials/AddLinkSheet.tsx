import { useState } from 'react';
import { useAddLink } from '../../api/units';
import { Button, Sheet, TextField, useFeedback } from '../../ui';

/** Añadir enlace: a video, a Genially, a Drive folder… Nothing is downloaded; the link opens in a new tab. */
export default function AddLinkSheet({ open, onClose, unitId }: { open: boolean; onClose: () => void; unitId: string }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const add = useAddLink(unitId);
  const { toast } = useFeedback();
  const clean = url.trim();

  const close = () => { setUrl(''); setTitle(''); onClose(); };
  const save = async () => {
    if (!clean) return;
    try {
      await add.mutateAsync({ url: clean, title: title.trim() || undefined });
      toast('Enlace añadido');
      close();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Añadir enlace"
      footer={<Button full disabled={!clean} loading={add.isPending} onClick={save}>{clean ? 'Añadir enlace' : 'Pega un enlace'}</Button>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <TextField label="Enlace" type="url" inputMode="url" autoComplete="off" placeholder="https://" value={url}
          onChange={(e) => setUrl(e.target.value)} hint="YouTube, Google Drive, Genially, Canva, Wordwall o cualquier página web." />
        <TextField label="Nombre (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
          placeholder="Si lo dejas vacío, se usa el nombre de la web" />
      </form>
    </Sheet>
  );
}
