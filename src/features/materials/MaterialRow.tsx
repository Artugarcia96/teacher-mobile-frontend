import {
  ArrowDown, ArrowSquareOut, ArrowUp, ArrowsLeftRight, ArrowsClockwise, CopySimple, DotsThree, Lock, PencilSimple, ShareNetwork,
  Student, Trash, WarningCircle,
} from '@phosphor-icons/react';
import { useDeleteMaterial, useReadMaterial, useUnshareMaterial, useUpdateMaterial, type Material } from '../../api/units';
import { plural, shortDate } from '../../lib/format';
import { AIBadge, Button, IconButton, Menu, Row, RowIcon, Spinner, useFeedback, type MenuItem } from '../../ui';
import { isGenerated, kindLabel, MaterialIcon } from '../units/kinds';
import { useOpenMaterial } from './open';
import type { PlaceMode } from './PlaceMaterialSheet';
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
 *  "6 ejercicios" (title "Ficha de refuerzo · …"), "" for "Apuntes · Fracciones". */
export function typeLabel(m: Material): string {
  if (m.kind === 'upload') {
    const pages = Number(m.options?.pages ?? 0);
    if (pages) return `Fotos · ${plural(pages, 'página', 'páginas')}`;
    const ext = String(m.options?.filename ?? '').split('.').pop()?.toLowerCase() ?? '';
    return FILE_TYPE[ext] ?? 'Archivo';
  }
  const label = kindLabel(m);
  const named = m.title.startsWith(label);
  const items = m.kind === 'worksheet' && m.options?.n_items ? `${m.options.n_items} ejercicios` : '';
  return [named ? '' : label, items].filter(Boolean).join(' · ');
}

/** One material of a unit: opens on tap, actions in its menu (grouped "Para alumnos" / "Solo para ti"). */
export function MaterialRow({ m, courseId, group, all, today, actions }: {
  m: Material; courseId: string; group: Material[]; all: Material[]; today: string; actions: MaterialActions;
}) {
  const open = useOpenMaterial();
  const update = useUpdateMaterial();
  const unshare = useUnshareMaterial();
  const del = useDeleteMaterial(m.unit_id ?? undefined);
  const read = useReadMaterial();
  const { toast, confirm } = useFeedback();
  const fail = (e: unknown) => toast((e as Error).message, { tone: 'error' });
  const lead = (
    <RowIcon tone={isGenerated(m.kind) ? 'accent' : undefined}>
      <MaterialIcon kind={m.kind} filename={String(m.options?.filename ?? '')} linkKind={m.link_kind} />
    </RowIcon>
  );

  if (m.status === 'generating') {
    return <Row lead={lead} title={m.title} sub={`Creando ${kindLabel(m).toLowerCase()}…`} trail={<Spinner />} />;
  }
  if (m.status === 'failed') {
    const remove = async () => {
      if (!(await confirm({ title: 'Quitar este material', text: m.error ?? undefined, confirm: 'Quitar', danger: true }))) return;
      del.mutate(m.id, { onSuccess: () => toast('Material quitado'), onError: fail });
    };
    return (
      <Row lead={<RowIcon tone="warn"><WarningCircle size={20} /></RowIcon>} title={m.title}
        sub={<span className="mrow__error">{m.error || 'No se ha podido crear.'}</span>}
        trail={<Button size="sm" variant="plain" onClick={remove}>Quitar</Button>} />
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
      title: `¿Eliminar «${m.title}»?`,
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
    ...(m.text_status === 'failed' ? [{
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
      {m.text_status === 'reading' && <span className="mrow__reading">Leyendo…</span>}
      {m.text_status === 'failed' && <span className="mrow__error">No se ha podido leer</span>}
      {m.shared && (
        <span className="mrow__shared" title="Compartido con alumnos">
          <ShareNetwork size={13} weight="bold" aria-label="Compartido con alumnos" /><span className="mrow__shared-label">Compartido</span>
        </span>
      )}
      {isGenerated(m.kind) && <AIBadge />}
    </span>
  );

  return (
    <div className="mrow">
      <Row lead={lead} title={m.title} sub={sub} onClick={() => open(m, courseId)} chevron={false}
        trail={<span className="mrow__gap" />} />
      <div className="mrow__menu">
        <Menu trigger={(o) => <IconButton label={`Opciones de ${m.title}`} onClick={o}><DotsThree size={20} weight="bold" /></IconButton>} items={items} />
      </div>
    </div>
  );
}
