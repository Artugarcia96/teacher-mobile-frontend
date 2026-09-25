import { ClipboardText, DotsThree, DownloadSimple, PencilSimple, ShareNetwork, Trash, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  downloadMaterial, useDeleteMaterial, useGenerateMaterial, useMaterial, useMaterialToActivity, usePatchMaterial, useRewriteBlock,
  type AssessmentDoc, type Block, type GenerateInput, type GenKind, type MaterialDetail, type NotesDoc, type SlideDeck,
} from '../../api/units';
import EditMaterialSheet from '../../features/materials/EditMaterialSheet';
import ShareSheet from '../../features/materials/ShareSheet';
import { kindLabel } from '../../features/units/kinds';
import { fileUrl } from '../../lib/api';
import { useToday } from '../../lib/auth';
import { longDate, plural } from '../../lib/format';
import {
  AIBadge, Button, EmptyState, IconButton, Menu, Page, Segmented, SkeletonList, Spinner, Switch, useFeedback, type MenuItem,
} from '../../ui';
import NotesView from './NotesView';
import SlidesView from './SlidesView';
import WorksheetView from './WorksheetView';
import './MaterialPage.css';

/** Material de una unidad: lectura (apuntes/resumen/lectura fácil), diapositivas o ficha, con descargas. */
export default function MaterialPage() {
  const { courseId = '', unitId = '', materialId = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { toast, confirm } = useFeedback();
  const { data: m, isLoading, error } = useMaterial(materialId);
  const patch = usePatchMaterial(materialId);
  const rewrite = useRewriteBlock(materialId);
  const del = useDeleteMaterial(unitId);
  const regenerate = useGenerateMaterial(unitId);
  const toActivity = useMaterialToActivity(materialId);
  const [busyBlock, setBusyBlock] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [solutions, setSolutions] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const unitPath = `/clases/${courseId}/unidades/${unitId}`;

  if (error) {
    return (
      <Page title="Material" back={unitPath} backLabel="Unidad">
        <EmptyState icon={<WarningCircle size={24} />} title="No se ha encontrado el material" text={(error as Error).message}
          action={<Button variant="neutral" to={unitPath}>Volver a la unidad</Button>} />
      </Page>
    );
  }
  if (isLoading || !m) return <Page title="" back={unitPath} backLabel="Unidad"><SkeletonList rows={6} /></Page>;

  const back = { back: unitPath, backLabel: m.unit_title ?? 'Unidad' };
  const eyebrow = <><span className="eyebrow">{kindLabel(m)}</span>{m.kind !== 'upload' && <AIBadge />}</>;

  const remove = async () => {
    const ok = await confirm({
      title: `¿Eliminar «${m.title}»?`,
      text: `Se borrarán también sus archivos.${m.shared ? ' El enlace para alumnos y su código QR dejarán de funcionar.' : ''} No se puede deshacer.`,
      confirm: 'Eliminar', danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(m.id);
      toast('Material eliminado');
      navigate(unitPath, { replace: true });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  if (m.status === 'generating') {
    return (
      <Page title={m.title} eyebrow={eyebrow} {...back}>
        <div className="paper material-wait">
          <Spinner />
          <div className="material-wait__title">Creando {kindLabel(m).toLowerCase()}…</div>
          <p className="muted">Suele tardar menos de un minuto. Puedes salir: seguirá en la unidad.</p>
        </div>
      </Page>
    );
  }

  if (m.status === 'failed') {
    const retry = async () => {
      try {
        const { material } = await regenerate.mutateAsync({ kind: m.kind as GenKind, ...(m.options as Omit<GenerateInput, 'kind'>) });
        await del.mutateAsync(m.id);
        navigate(`${unitPath}/materiales/${material.id}`, { replace: true });
      } catch (e) {
        toast((e as Error).message, { tone: 'error' });
      }
    };
    return (
      <Page title={m.title} eyebrow={eyebrow} {...back}>
        <div className="paper">
          <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido crear" text={m.error ?? 'Inténtalo de nuevo.'}
            action={<div className="material-actions">
              <Button onClick={retry} loading={regenerate.isPending}>Volver a intentarlo</Button>
              <Button variant="danger" onClick={remove}>Eliminar</Button>
            </div>} />
        </div>
      </Page>
    );
  }

  const download = async (variant: 'pdf' | 'pptx' | 'key') => {
    setDownloading(variant);
    try {
      await downloadMaterial(m.id, variant);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    } finally {
      setDownloading(null);
    }
  };

  const evaluate = async () => {
    const ok = await confirm({
      title: 'Evaluar esta ficha',
      text: `Se añade una columna «${m.title}» al cuaderno con fecha de hoy (${longDate(today)}) y la rúbrica de la ficha. Podrás cambiar la fecha y la nota máxima.`,
      confirm: 'Añadir al cuaderno',
    });
    if (!ok) return;
    try {
      const { activity_id } = await toActivity.mutateAsync({ date: today, max_score: 10 });
      toast('Ficha añadida al cuaderno');
      navigate(`/clases/${courseId}/actividades/${activity_id}`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const saveBlock = async (block: Block) => {
    const doc = structuredClone(m.content) as NotesDoc;
    for (const s of doc.sections) s.blocks = s.blocks.map((b) => (b.id === block.id ? block : b));
    try {
      await patch.mutateAsync({ content: doc });
      toast('Cambios guardados');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
      throw e;
    }
  };

  const doRewrite = (blockId: string, instruction: string) => {
    setBusyBlock(blockId);
    rewrite.mutate({ block_id: blockId, instruction }, {
      onSuccess: () => toast('Apartado reescrito'),
      onError: (e) => toast((e as Error).message, { tone: 'error' }),
      onSettled: () => setBusyBlock(null),
    });
  };

  const menu: MenuItem[] = [
    { label: 'Renombrar', icon: <PencilSimple size={18} />, onSelect: () => setRenaming(true) },
    { label: 'Compartir con alumnos', icon: <ShareNetwork size={18} />, onSelect: () => setSharing(true) },
    ...(m.kind === 'worksheet' ? [{ label: 'Evaluar esta ficha', icon: <ClipboardText size={18} />, onSelect: evaluate }] : []),
    { label: 'Eliminar', icon: <Trash size={18} />, danger: true, separatorBefore: true, onSelect: remove },
  ];

  const dl = (variant: 'pdf' | 'pptx' | 'key', label: string, primary = false) => (
    <Button key={variant} size="sm" variant={primary ? 'primary' : 'neutral'} icon={<DownloadSimple size={16} />}
      loading={downloading === variant} onClick={() => download(variant)}>{label}</Button>
  );

  const content = m.content;
  const toolbar = (
    <div className={`material-bar${m.kind === 'slides' ? '' : ' material-bar--reading'}`}>
      <div className="material-actions">
        {m.kind === 'upload' && <Button size="sm" onClick={() => window.open(fileUrl(m.file_url), '_blank', 'noopener')}>Abrir archivo</Button>}
        {m.kind === 'slides' && <>{dl('pptx', 'Descargar .pptx', true)}{dl('pdf', 'PDF')}</>}
        {m.kind === 'worksheet' && <>{dl('pdf', 'Descargar PDF', true)}{dl('key', 'Solucionario')}</>}
        {['notes', 'summary', 'adapted'].includes(m.kind) && dl('pdf', 'Descargar PDF', true)}
      </div>
      {m.kind === 'slides' && (
        <label className="material-switch">
          <span>Notas del orador</span>
          <Switch checked={showNotes} onChange={setShowNotes} label="Mostrar notas del orador" />
        </label>
      )}
      {m.kind === 'worksheet' && (
        <Segmented label="Vista de la ficha" value={solutions ? 'sol' : 'enun'} onChange={(v) => setSolutions(v === 'sol')}
          options={[{ value: 'enun', label: 'Enunciados' }, { value: 'sol', label: 'Con soluciones' }]} />
      )}
    </div>
  );

  return (
    <Page
      title={m.title}
      eyebrow={eyebrow}
      subtitle={<Subtitle m={m} />}
      {...back}
      wide={m.kind === 'slides'}
      actions={<Menu trigger={(open) => <IconButton label="Más opciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>} items={menu} />}
      toolbar={toolbar}
    >
      {content && ['notes', 'summary', 'adapted'].includes(m.kind) && (
        <NotesView doc={content as NotesDoc} busyId={busyBlock} saving={patch.isPending} onSaveBlock={saveBlock} onRewrite={doRewrite} />
      )}
      {content && m.kind === 'slides' && <SlidesView deck={content as SlideDeck} label={m.course.label} showNotes={showNotes} />}
      {content && m.kind === 'worksheet' && <WorksheetView doc={content as AssessmentDoc} solutions={solutions} />}
      {m.kind === 'upload' && (
        <p className="muted">Este archivo se usa como base cuando creas materiales con IA en esta unidad.</p>
      )}
      {renaming && <EditMaterialSheet material={m} onClose={() => setRenaming(false)} />}
      {sharing && <ShareSheet material={m} onClose={() => setSharing(false)} />}
    </Page>
  );
}

function Subtitle({ m }: { m: MaterialDetail }) {
  const c = m.content;
  if (m.kind === 'slides' && c) return <span>{plural((c as SlideDeck).slides.length + 1, 'diapositiva', 'diapositivas')}</span>;
  if (m.kind === 'worksheet' && c) {
    const items = (c as AssessmentDoc).sections.flatMap((s) => s.items);
    return <span>{plural(items.length, 'ejercicio', 'ejercicios')} · con solucionario</span>;
  }
  return <span>{m.course.label}</span>;
}
