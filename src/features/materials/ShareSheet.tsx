import { Copy, ProjectorScreen, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useShareMaterial, useUnshareMaterial, type Material } from '../../api/units';
import { longDate } from '../../lib/format';
import { Button, EmptyState, Fullscreen, Sheet, Spinner, useFeedback } from '../../ui';
import { publicOrigin, shortUrl } from './open';

/** Compartir con alumnos: public read-only link + QR (60 days), "Proyectar" for the class, "Dejar de compartir". */
export default function ShareSheet({ material, onClose }: { material: Pick<Material, 'id' | 'title'>; onClose: () => void }) {
  const share = useShareMaterial();
  const unshare = useUnshareMaterial();
  const { toast, confirm } = useFeedback();
  const [projecting, setProjecting] = useState(false);
  const { mutate } = share;

  useEffect(() => { mutate({ id: material.id, origin: publicOrigin() }); }, [material.id, mutate]);

  const s = share.data;
  const copy = async () => {
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s.url);
      toast('Enlace copiado');
    } catch {
      toast('No se ha podido copiar. Mantén pulsado el enlace para copiarlo.', { tone: 'error' });
    }
  };
  const stop = async () => {
    const ok = await confirm({
      title: 'Dejar de compartir', text: 'El enlace y el código QR dejarán de funcionar para tus alumnos.', confirm: 'Dejar de compartir', danger: true,
    });
    if (!ok) return;
    try {
      await unshare.mutateAsync(material.id);
      toast('Ya no se comparte');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  let body;
  if (share.isError) {
    body = <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido crear el enlace" text={(share.error as Error).message}
      action={<Button variant="tinted" onClick={() => mutate({ id: material.id, origin: publicOrigin() })}>Reintentar</Button>} />;
  } else if (!s) {
    body = <div className="share-wait"><Spinner /><span>Preparando el enlace…</span></div>;
  } else {
    body = (
      <div className="share">
        {s.qr_png && <img className="share__qr" src={s.qr_png} alt={`Código QR de ${material.title}`} />}
        <a className="share__url" href={s.url} target="_blank" rel="noopener noreferrer">{shortUrl(s.url)}</a>
        <p className="muted share__text">
          Tus alumnos lo abren sin iniciar sesión, con el código o con el enlace. Funciona hasta el {longDate(s.expires_on)}.
        </p>
        <div className="share__actions">
          <Button icon={<Copy size={18} />} onClick={copy}>Copiar enlace</Button>
          <Button variant="tinted" icon={<ProjectorScreen size={18} />} onClick={() => setProjecting(true)}>Proyectar</Button>
        </div>
        <Button variant="plain" className="share__stop" loading={unshare.isPending} onClick={stop}>Dejar de compartir</Button>
      </div>
    );
  }

  return (
    <>
      <Sheet open onClose={onClose} title="Compartir con alumnos" subtitle={material.title}>{body}</Sheet>
      {projecting && s && (
        <Fullscreen label={`Proyectar ${material.title}`} onClose={() => setProjecting(false)}>
          <div className="project">
            <div className="project__title">{material.title}</div>
            {s.qr_png && <img className="project__qr" src={s.qr_png} alt="Código QR" />}
            <div className="project__url">{shortUrl(s.url)}</div>
            <div className="project__hint">Escanea el código con la cámara del móvil</div>
          </div>
        </Fullscreen>
      )}
    </>
  );
}
