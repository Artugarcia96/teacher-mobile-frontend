import { Copy, ProjectorScreen, ShareNetwork, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useShareMaterial, useUnshareMaterial, useUpdateMaterial, type Material } from '../../api/units';
import { isDraft } from '../units/kinds';
import { longDate } from '../../lib/format';
import { Button, Callout, EmptyState, Fullscreen, Sheet, Spinner, useFeedback } from '../../ui';
import { publicOrigin, shortUrl } from './open';

type Shareable = Pick<Material, 'id' | 'title' | 'kind' | 'shared' | 'audience' | 'reviewed' | 'status' | 'extra_url'>;

/** Compartir con alumnos: public read-only link + QR, "Proyectar" for the class, "Dejar de compartir".
 *  Creating the link is a deliberate step (it publishes the file and moves it to "Para alumnos"); a material that
 *  is already shared shows its link at once (and the backend extends it 60 more days, same QR). */
export default function ShareSheet({ material, onClose }: { material: Shareable; onClose: () => void }) {
  const share = useShareMaterial();
  const unshare = useUnshareMaterial();
  const update = useUpdateMaterial();
  const { toast, confirm } = useFeedback();
  const [projecting, setProjecting] = useState(false);
  const { mutate } = share;
  const [alreadyShared] = useState(material.shared);

  useEffect(() => { if (alreadyShared) mutate({ id: material.id, origin: publicOrigin() }); }, [alreadyShared, material.id, mutate]);

  const create = async () => {
    if (isDraft(material)) {  // handing a draft to the students is a decision: it is marked as reviewed first
      const ok = await confirm({
        title: 'Aún es un borrador de la IA',
        text: '¿Lo has revisado? Al compartirlo se marcará como revisado.',
        confirm: 'Compartir y marcar',
      });
      if (!ok) return;
      try {
        await update.mutateAsync({ id: material.id, reviewed: true });
      } catch (e) {
        toast((e as Error).message, { tone: 'error' });
        return;
      }
    }
    mutate({ id: material.id, origin: publicOrigin() }, {
      onSuccess: () => toast(material.audience === 'alumnos' ? 'Enlace creado' : 'Enlace creado. Ahora está en «Para alumnos».'),
    });
  };

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
  let footer;
  if (share.isError) {
    body = <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido crear el enlace" text={(share.error as Error).message}
      action={<Button variant="tinted" onClick={() => mutate({ id: material.id, origin: publicOrigin() })}>Reintentar</Button>} />;
  } else if (!s && !alreadyShared && !share.isPending) {
    body = (
      <div className="form share-intro">
        <p>
          Se creará un enlace de solo lectura que tus alumnos abren sin iniciar sesión, con el enlace o con un código QR.
          Funciona 60 días y se alarga cada vez que lo vuelves a abrir aquí.
        </p>
        {material.extra_url && <Callout>Se comparte sin las soluciones: el solucionario es solo para ti.</Callout>}
        {material.audience !== 'alumnos' && <Callout tone="warn">El material pasará a «Para alumnos».</Callout>}
      </div>
    );
    footer = <Button full icon={<ShareNetwork size={18} />} onClick={create} data-autofocus>Crear enlace</Button>;
  } else if (!s) {
    body = <div className="share-wait"><Spinner /><span>Preparando el enlace…</span></div>;
  } else {
    body = (
      <div className="share">
        {s.qr_png && <img className="share__qr" src={s.qr_png} alt={`Código QR de ${material.title}`} />}
        <a className="share__url" href={s.url} target="_blank" rel="noopener noreferrer">{shortUrl(s.url)}</a>
        <p className="muted share__text">
          Tus alumnos lo abren sin iniciar sesión, con el código o con el enlace. Funciona hasta el {longDate(s.expires_on)};
          cada vez que lo abres aquí se alarga 60 días con el mismo código.
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
      <Sheet open onClose={onClose} title="Compartir con alumnos" subtitle={material.title} footer={footer}>{body}</Sheet>
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
