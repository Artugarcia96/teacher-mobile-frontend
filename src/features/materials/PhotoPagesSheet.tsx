import { Camera, Images, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { MAX_PAGES, useUploadMaterials } from '../../api/units';
import { plural } from '../../lib/format';
import { Button, IconButton, Progress, Sheet, TextField, useFeedback } from '../../ui';
import { useCoarsePointer } from './pointer';

type Page = { file: File; url: string };

const LONG_SIDE = 2000; // px: legible small print, ~300-500 KB per page instead of the camera's 3-8 MB

/** Camera photo → upright JPEG with the longest side ≤ LONG_SIDE (the original if the browser cannot do it). */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, LONG_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

const isHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type);

/** Fotografiar páginas del libro: one photo per page (the camera takes one at a time), saved as ONE PDF material
 *  that the AI reads so apuntes, fichas and exams of the unit follow the teacher's book. Photos are reduced on the
 *  phone before uploading; at most MAX_PAGES pages (what the AI reads). */
export default function PhotoPagesSheet({ open, onClose, unitId }: { open: boolean; onClose: () => void; unitId: string }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [title, setTitle] = useState('Páginas del libro');
  const [progress, setProgress] = useState<{ step: 'shrink' | 'upload'; value: number } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const upload = useUploadMaterials(unitId);
  const { toast } = useFeedback();
  const coarse = useCoarsePointer();
  const urls = useRef<string[]>([]);
  const full = pages.length >= MAX_PAGES;

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name));
    const heic = picked.filter(isHeic);
    if (heic.length) {
      toast(`${heic.length === 1 ? 'Esa foto es HEIC' : `${heic.length} fotos son HEIC`} y no se puede leer. Hazla con «Hacer foto» o elige una JPG.`, { tone: 'error' });
    }
    const room = MAX_PAGES - pages.length;
    const files = picked.filter((f) => !isHeic(f));
    if (files.length > room) toast(`Máximo ${MAX_PAGES} páginas por material. Se han añadido ${plural(Math.max(room, 0), 'página', 'páginas')}.`, { tone: 'error' });
    const next = files.slice(0, Math.max(room, 0)).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { file, url };
    });
    setPages((p) => [...p, ...next]);
  };
  const remove = (i: number) => setPages((p) => p.filter((_, j) => j !== i));
  const close = () => { setPages([]); setTitle('Páginas del libro'); setProgress(null); onClose(); };
  // While saving the sheet can be closed: the upload goes on and a notice says when it is done.
  const dismiss = () => (progress ? onClose() : close());

  const save = async () => {
    try {
      const files: File[] = [];
      for (const [i, p] of pages.entries()) {
        setProgress({ step: 'shrink', value: i / pages.length });
        files.push(await shrink(p.file));
      }
      setProgress({ step: 'upload', value: 0 });
      await upload.mutateAsync({
        files, asPages: true, title: title.trim() || undefined, onProgress: (value) => setProgress({ step: 'upload', value }),
      });
      toast(`${plural(pages.length, 'página guardada', 'páginas guardadas')}. La IA ${pages.length === 1 ? 'la' : 'las'} está leyendo.`);
      close();
    } catch (e) {
      setProgress(null);
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const busy = progress !== null;
  let label = pages.length ? `Guardar ${plural(pages.length, 'página', 'páginas')}` : 'Añade al menos una foto';
  if (progress?.step === 'shrink') label = 'Preparando las fotos…';
  else if (progress?.step === 'upload') label = progress.value < 1 ? `Subiendo… ${Math.round(progress.value * 100)} %` : 'Guardando…';

  return (
    <Sheet open={open} onClose={dismiss} title={coarse ? 'Fotografiar páginas del libro' : 'Añadir fotos de páginas'}
      size={pages.length ? 'large' : 'auto'}
      footer={<div className="pages__footer">
        {busy && <Progress value={progress.step === 'upload' ? 0.1 + progress.value * 0.9 : progress.value * 0.1} total={1} />}
        <Button full disabled={!pages.length || busy} onClick={save}>{label}</Button>
      </div>}>
      <div className="form">
        <p className="muted pages__hint">
          {coarse ? 'Una foto por página, con buena luz y la página entera.' : 'Una foto por página, en orden.'} Se guardan juntas como un
          PDF y la IA las lee para basar en ellas los apuntes, fichas y exámenes de esta unidad. Hasta {MAX_PAGES} páginas.
        </p>
        <div className="pages__add">
          {coarse && (
            <Button data-autofocus icon={<Camera size={18} />} disabled={full || busy} onClick={() => camera.current?.click()}>
              {full ? `Máximo ${MAX_PAGES} páginas por material` : pages.length ? 'Otra página' : 'Hacer foto'}
            </Button>
          )}
          <Button variant={coarse ? 'neutral' : 'primary'} data-autofocus={coarse ? undefined : true} icon={<Images size={18} />}
            disabled={full || busy} onClick={() => gallery.current?.click()}>
            {!coarse && full ? `Máximo ${MAX_PAGES} páginas por material` : 'Elegir fotos'}
          </Button>
        </div>
        {pages.length > 0 && (
          <ol className="pages__grid">
            {pages.map((p, i) => (
              <li key={p.url} className="pages__item">
                <img src={p.url} alt={`Página ${i + 1}`} />
                <span className="pages__n num">{i + 1}</span>
                {!busy && (
                  <IconButton className="pages__remove" size="sm" glass label={`Quitar la página ${i + 1}`} onClick={() => remove(i)}>
                    <X size={14} />
                  </IconButton>
                )}
              </li>
            ))}
          </ol>
        )}
        <TextField label="Nombre" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy}
          placeholder="Por ejemplo: Libro, págs. 84-89" />
      </div>
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <input ref={gallery} type="file" hidden accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
    </Sheet>
  );
}
