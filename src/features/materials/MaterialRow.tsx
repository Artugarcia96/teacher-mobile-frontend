import {
  ArrowDown, ArrowSquareOut, ArrowUp, ArrowsLeftRight, ArrowsClockwise, CopySimple, DotsThree, Lock, PencilSimple, ShareNetwork,
  Student, Trash, WarningCircle,
} from '@phosphor-icons/react';
import { useDeleteMaterial, useReadMaterial, useRetryMaterial, useUnshareMaterial, useUpdateMaterial, type Material } from '../../api/units';
import { shortDate } from '../../lib/format';
import { AIBadge, Button, IconButton, Menu, Row, RowIcon, Spinner, useFeedback, type MenuItem } from '../../ui';
import { failedText, isDraft, isGenerated, kindLabel, MaterialIcon, readyText, shortTitle, withArticle } from '../units/kinds';
import { useOpenMaterial } from './open';
import type { PlaceMode } from './PlaceMaterialSheet';
import { GenerationLine } from './progress';
import { watchJob } from './watch';
import './materials.css';

export interface MaterialActions {
  onEdit: (m: Material) => void;
  onPlace: (m: Material, mode: PlaceMode) => void;
  onShare: (m: Material) => void;
}

const FILE_TYPE: Record<string, string> = {
  pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', txt: 'Texto', md: 'Texto', jpg: 'Foto', jpeg: 'Foto', png: 'Imagen', webp: 'Imagen',
};

/** Type for the meta line, without repeating the title: "PDF", "Fotos · 6 páginas", "Vídeo de YouTube",
 *  "10 ejercicios" (title "Ficha de refuerzo · …"), "" for "Apuntes · Fracciones". */
export function typeLabel(m: Material): string {
  if (m.kind === 'upload') {
    const pages = Number(m.options?.pages ?? 0);
    if (pages) return pages === 1 ? 'Foto · 1 página' : `Fotos · ${pages} páginas`;
    const ext = String(m.options?.filename ?? '').split('.').pop()?.toLowerCase() ?? '';
    return FILE_TYPE[ext] ?? 'Archivo';
  }
  const label = kindLabel(m);
  const named = m.title.startsWith(label);
  const items = m.kind === 'worksheet' && m.options?.n_items ? `${m.options.n_items} ejercicios` : '';
  return [named ? '' : label, items].filter(Boolean).join(' · ');
}

/** One material of a unit: opens on tap, actions in its menu (grouped "Para alumnos" / "Solo para ti"). The title
 *  leaves out the unit (it is the page's). */
export function MaterialRow({ m, courseId, unitTitle, group, all, today, actions }: {
  m: Material; courseId: string; unitTitle: string; group: Material[]; all: Material[]; today: string; actions: MaterialActions;
}) {
  const open = useOpenMaterial();
  const update = useUpdateMaterial();
  const unshare = useUnshareMaterial();
  const del = useDeleteMaterial(m.unit_id ?? undefined);
  const read = useReadMaterial();
  const retry = useRetryMaterial();
  const { toast, confirm } = useFeedback();
  const title = shortTitle(m.title, unitTitle);
  const fail = (e: unknown) => toast((e as Error).message, { tone: 'error' });
  const lead = (
    <RowIcon tone={isGenerated(m.kind) ? 'accent' : undefined}>
      <MaterialIcon kind={m.kind} filename={String(m.options?.filename ?? '')} linkKind={m.link_kind} />
    </RowIcon>
  );

  if (m.status === 'generating') {
    return <Row lead={lead} title={title} sub={<GenerationLine m={m} />} wrapSub trail={<Spinner />} onClick={() => open(m, courseId)} chevron={false} />;
  }
  if (m.status === 'failed') {
    const again = () => retry.mutate(m.id, {
      onSuccess: ({ material, job }) => {
        watchJob({
          job: job.id, kind: 'material', done: readyText(material, unitTitle),
          failed: failedText(material, unitTitle),
          path: `/clases/${courseId}/unidades/${material.unit_id}/materiales/${material.id}`,
        });
        toast(`Creando ${withArticle(material)} otra vez`);
      },
      onError: fail,
    });
    const remove = async () => {
      if (!(await confirm({ title: `¿Quitar «${title}»?`, text: 'No se pudo crear; se quita de la unidad.', confirm: 'Quitar', danger: true }))) return;
      del.mutate(m.id, { onSuccess: () => toast('Material quitado'), onError: fail });
    };
    return (
      <div className="mrow mrow--failed">
        <Row lead={<RowIcon tone="warn"><WarningCircle size={20} /></RowIcon>} title={title} wrapSub
          sub={<span className="mrow__error mrow__error--wrap">{m.error || 'No se ha podido crear.'}</span>}
          trail={<span className="mrow__failed-actions">
            <Button size="sm" variant="tinted" loading={retry.isPending} onClick={again}>Volver a intentar</Button>
            <span className="mrow__gap" />
          </span>} />
        <div className="mrow__menu">
          <Menu trigger={(o) => <IconButton label={`Opciones de ${title}`} onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
            items={[{ label: 'Quitar', icon: <Trash size={18} />, danger: true, onSelect: remove }]} />
        </div>
      </div>
    );
  }

  const i = group.findIndex((x) => x.id === m.id);
  const prev = group[i - 1];
  const next = group[i + 1];
  const moveNextTo = (other: Material, dir: 'up' | 'down') =>
    update.mutate({ id: m.id, position: all.findIndex((x) => x.id === other.id) }, {
      onSuccess: () => toast(dir === 'up' ? 'Material subido' : 'Material bajado'), onError: fail,
    });

  const setAudience = async (audience: Material['audience']) => {
    if (audience === 'profesor' && m.shared) {
      const ok = await confirm({
        title: 'Cambiar a «solo para mí»', text: 'Se deja de compartir: el enlace y el código QR dejarán de funcionar.', confirm: 'Cambiar', danger: true,
      });
      if (!ok) return;
      try { await unshare.mutateAsync(m.id); } catch (e) { fail(e); return; }
    }
    update.mutate({ id: m.id, audience }, {
      onSuccess: () => toast(audience === 'alumnos' ? 'Ahora está en «Para alumnos»' : 'Ahora está en «Solo para ti»'), onError: fail,
    });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `¿Eliminar «${title}»?`,
      text: m.shared ? 'El enlace para alumnos dejará de funcionar. No se puede deshacer.' : 'No se puede deshacer.',
      confirm: 'Eliminar', danger: true,
    });
    if (!ok) return;
    del.mutate(m.id, { onSuccess: () => toast('Material eliminado'), onError: fail });
  };

  const items: MenuItem[] = [
    { label: 'Abrir', icon: <ArrowSquareOut size={18} />, onSelect: () => open(m, courseId) },
    { label: 'Renombrar', icon: <PencilSimple size={18} />, onSelect: () => actions.onEdit(m) },
    { label: 'Mover a…', icon: <ArrowsLeftRight size={18} />, onSelect: () => actions.onPlace(m, 'move') },
    { label: 'Usar en otra clase…', icon: <CopySimple size={18} />, onSelect: () => actions.onPlace(m, 'copy') },
    { label: 'Compartir con alumnos', icon: <ShareNetwork size={18} />, onSelect: () => actions.onShare(m), separatorBefore: true },
    m.audience === 'alumnos'
      ? { label: 'Cambiar a «solo para mí»', icon: <Lock size={18} />, onSelect: () => void setAudience('profesor') }
      : { label: 'Cambiar a «para alumnos»', icon: <Student size={18} />, onSelect: () => void setAudience('alumnos') },
    ...(prev ? [{ label: 'Subir', icon: <ArrowUp size={18} />, onSelect: () => moveNextTo(prev, 'up'), separatorBefore: true }] : []),
    ...(next ? [{ label: 'Bajar', icon: <ArrowDown size={18} />, onSelect: () => moveNextTo(next, 'down'), separatorBefore: !prev }] : []),
    ...(m.text_status === 'failed' || (m.text_status === 'reading' && !m.job_id) ? [{
      label: 'Volver a leer', icon: <ArrowsClockwise size={18} />, separatorBefore: true,
      onSelect: () => read.mutate(m.id, { onSuccess: () => toast('Leyendo de nuevo…'), onError: fail }),
    }] : []),
    { label: 'Eliminar', icon: <Trash size={18} />, danger: true, separatorBefore: true, onSelect: remove },
  ];

  const date = m.created_at.slice(0, 10);
  const parts = [typeLabel(m), date === today ? 'Hoy' : shortDate(date)].filter(Boolean);
  if (m.notes) parts.push(m.notes);
  const sub = (
    <span className="mrow__sub">
      <span className="mrow__meta">{parts.join(' · ')}</span>
      <ReadingStatus m={m} />
      {m.shared && (
        <span className="mrow__shared" title="Compartido con alumnos">
          <ShareNetwork size={13} weight="bold" aria-label="Compartido con alumnos" /><span className="mrow__shared-label">Compartido</span>
        </span>
      )}
      {isDraft(m) && <AIBadge />}
    </span>
  );

  return (
    <div className="mrow">
      <Row lead={lead} title={title} sub={sub} onClick={() => open(m, courseId)} chevron={false}
        trail={<span className="mrow__gap" />} />
      <div className="mrow__menu">
        <Menu trigger={(o) => <IconButton label={`Opciones de ${title}`} onClick={o}><DotsThree size={20} weight="bold" /></IconButton>} items={items} />
      </div>
    </div>
  );
}

/** AI reading of photos / scans: "Leyendo…", "No se ha podido leer", or "Leídas 30 de 84 páginas" when a long
 *  scan was only read in part. Shared by the unit list and the library. */
export function readingStatus(m: Pick<Material, 'text_status' | 'job_id' | 'options'>): { className: string; text: string } | null {
  if (m.text_status === 'reading' && m.job_id) return { className: 'mrow__reading', text: 'Leyendo…' };
  if (m.text_status === 'failed' || m.text_status === 'reading') return { className: 'mrow__error', text: 'No se ha podido leer' };
  const read = Number(m.options?.pages_read ?? 0);
  const total = Number(m.options?.pages_total ?? 0);
  if (m.text_status === 'done' && read && total > read) return { className: 'mrow__partial', text: `Leídas ${read} de ${total} páginas` };
  return null;
}

function ReadingStatus({ m }: { m: Material }) {
  const st = readingStatus(m);
  return st ? <span className={st.className}>{st.text}</span> : null;
}
