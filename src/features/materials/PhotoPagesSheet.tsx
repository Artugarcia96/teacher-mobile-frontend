import { Camera, Images, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useUploadMaterials } from '../../api/units';
import { plural } from '../../lib/format';
import { Button, IconButton, Sheet, TextField, useFeedback } from '../../ui';

type Page = { file: File; url: string };

/** Fotografiar páginas del libro: one photo per page (the camera takes one at a time), saved as ONE PDF material
 *  that the AI reads so apuntes, fichas and exams of the unit follow the teacher's book. */
export default function PhotoPagesSheet({ open, onClose, unitId }: { open: boolean; onClose: () => void; unitId: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [title, setTitle] = useState('Páginas del libro');
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const upload = useUploadMaterials(unitId);
  const { toast } = useFeedback();
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    const next = files.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { file, url };
    });
    setPages((p) => [...p, ...next]);
  };
  const remove = (i: number) => setPages((p) => p.filter((_, j) => j !== i));
  const close = () => { setPages([]); setTitle('Páginas del libro'); onClose(); };

  const save = async () => {
    try {
      await upload.mutateAsync({ files: pages.map((p) => p.file), asPages: true, title: title.trim() || undefined });
      toast(`${plural(pages.length, 'página guardada', 'páginas guardadas')}. La IA ${pages.length === 1 ? 'la' : 'las'} está leyendo.`);
      close();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Fotografiar páginas del libro" size={pages.length ? 'large' : 'auto'}
      footer={<Button full disabled={!pages.length} loading={upload.isPending} onClick={save}>
        {pages.length ? `Guardar ${plural(pages.length, 'página', 'páginas')}` : 'Añade al menos una foto'}
      </Button>}>
      <div className="form">
        <p className="muted pages__hint">
          Una foto por página, con buena luz y la página entera. Se guardan juntas como un PDF y la IA las lee para
          basar en ellas los apuntes, fichas y exámenes de esta unidad.
        </p>
        <div className="pages__add">
          <Button className="pages__camera" data-autofocus icon={<Camera size={18} />} onClick={() => camera.current?.click()}>
            {pages.length ? 'Otra página' : 'Hacer foto'}
          </Button>
          <Button variant="neutral" icon={<Images size={18} />} onClick={() => gallery.current?.click()}>Elegir fotos</Button>
        </div>
        {pages.length > 0 && (
          <ol className="pages__grid">
            {pages.map((p, i) => (
              <li key={p.url} className="pages__item">
                <img src={p.url} alt={`Página ${i + 1}`} />
                <span className="pages__n num">{i + 1}</span>
                <IconButton className="pages__remove" size="sm" glass label={`Quitar la página ${i + 1}`} onClick={() => remove(i)}>
                  <X size={14} />
                </IconButton>
              </li>
            ))}
          </ol>
        )}
        <TextField label="Nombre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
          placeholder="Por ejemplo: Libro, págs. 84-89" />
      </div>
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <input ref={gallery} type="file" hidden accept="image/*" multiple onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
    </Sheet>
  );
}
