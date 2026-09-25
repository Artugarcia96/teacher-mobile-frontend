import {
  CalendarBlank, Camera, DotsThree, Exam, FolderOpen, LinkSimple, PencilSimple, Plus, Trash, UploadSimple, WarningCircle,
} from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCreateActivity } from '../../api/activities';
import { useDeleteUnit, usePatchUnit, useUnit, useUploadMaterials, type Material, type UnitStatus } from '../../api/units';
import AddLinkSheet from '../../features/materials/AddLinkSheet';
import EditMaterialSheet from '../../features/materials/EditMaterialSheet';
import { MaterialRow, type MaterialActions } from '../../features/materials/MaterialRow';
import PhotoPagesSheet from '../../features/materials/PhotoPagesSheet';
import PlaceMaterialSheet, { type PlaceMode } from '../../features/materials/PlaceMaterialSheet';
import { useCoarsePointer } from '../../features/materials/pointer';
import ShareSheet from '../../features/materials/ShareSheet';
import CreateMaterialSheet from '../../features/units/CreateMaterialSheet';
import UnitFormSheet from '../../features/units/UnitFormSheet';
import { ApiError } from '../../lib/api';
import { useToday } from '../../lib/auth';
import { addDays, ordinals, plural, TERM_LABEL } from '../../lib/format';
import {
  Button, Callout, Chip, Dot, DropTarget, EmptyState, IconButton, List, Menu, Page, Progress, Row, RowIcon, Section, SkeletonList,
  Spinner, useFeedback,
} from '../../ui';
import './UnitPage.css';

const STATUS: Record<UnitStatus, { label: string; tone?: 'accent' | 'ok' }> = {
  pending: { label: 'Pendiente' },
  current: { label: 'En curso', tone: 'accent' },
  done: { label: 'Impartida' },
};
const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp';
const IMAGE = /\.(png|jpe?g|webp)$/i;

type Sheet = 'create' | 'edit' | 'link' | 'photos' | null;
type Target = { m: Material; kind: 'edit' | 'share' } | { m: Material; kind: 'place'; mode: PlaceMode } | null;

/** Unidad: its materials ("Para alumnos" / "Solo para ti"), uploads (also dropped anywhere on the page on a
 *  computer), photos of the book, links, "Crear con IA" and the shortcut to an exam of the unit. */
export default function UnitPage() {
  const { courseId = '', unitId = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const { toast, confirm } = useFeedback();
  const { data, isLoading, error, refetch } = useUnit(unitId);
  const patch = usePatchUnit(courseId);
  const delUnit = useDeleteUnit(courseId);
  const upload = useUploadMaterials(unitId);
  const createActivity = useCreateActivity(courseId);
  // «Crear ficha de refuerzo» from an exam: the worksheet form opens with what the class got wrong.
  const [sheet, setSheet] = useState<Sheet>(() => (params.get('crear') === 'ficha' ? 'create' : null));
  const [target, setTarget] = useState<Target>(null);
  const [sent, setSent] = useState<number | null>(null); // upload progress 0-1
  const coarse = useCoarsePointer();
  const photosLabel = coarse ? 'Fotografiar páginas del libro' : 'Añadir fotos de páginas';
  const fileInput = useRef<HTMLInputElement>(null);
  const planPath = `/clases/${courseId}/programacion`;

  if (error) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <Page title="Unidad" back={planPath} backLabel="Temario">
        <EmptyState icon={<WarningCircle size={24} />} title={missing ? 'No se ha encontrado la unidad' : 'No se ha podido cargar la unidad'}
          text={(error as Error).message}
          action={missing
            ? <Button variant="neutral" to={planPath}>Volver al temario</Button>
            : <Button variant="tinted" onClick={() => refetch()}>Reintentar</Button>} />
      </Page>
    );
  }
  if (isLoading || !data) {
    return <Page title="" back={planPath} backLabel="Temario"><SkeletonList rows={5} /></Page>;
  }

  const { unit, course, materials } = data;
  const status = STATUS[unit.status];
  const forStudents = materials.filter((m) => m.audience === 'alumnos');
  const forMe = materials.filter((m) => m.audience !== 'alumnos');

  const onFiles = async (files: File[]) => {
    setSent(0);
    try {
      const out = await upload.mutateAsync({ files, onProgress: setSent });
      const reading = out.filter((m) => m.text_status === 'reading');
      const scans = reading.some((m) => !IMAGE.test(String(m.options?.filename ?? '')));
      const what = !reading.length ? '' : scans ? '. La IA está leyendo los archivos escaneados.' : `. La IA está leyendo ${reading.length === 1 ? 'la foto' : 'las fotos'}.`;
      toast(`${files.length === 1 ? 'Archivo subido' : `${files.length} archivos subidos`}${what}`);
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    } finally {
      setSent(null);
    }
  };
  const uploading = sent === null ? null : sent < 1 ? `Subiendo… ${Math.round(sent * 100)} %` : 'Guardando…';

  const setStatus = async (s: UnitStatus) => {
    try {
      await patch.mutateAsync({ id: unit.id, status: s });
      toast(s === 'current' ? 'Unidad en curso' : s === 'done' ? 'Unidad impartida' : 'Unidad pendiente');
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  const removeUnit = async () => {
    const ok = await confirm({
      title: `¿Eliminar «${unit.title}»?`,
      text: materials.length ? `Se borrarán también sus ${plural(materials.length, 'material', 'materiales')}. No se puede deshacer.` : 'No se puede deshacer.',
      confirm: 'Eliminar', danger: true,
    });
    if (!ok) return;
    try {
      await delUnit.mutateAsync(unit.id);
      toast('Unidad eliminada');
      navigate(planPath, { replace: true });
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  const createExam = async () => {
    try {
      const a = await createActivity.mutateAsync({ title: `Examen · ${unit.title}`, kind: 'exam', date: addDays(today, 7), unit_ids: [unit.id] });
      navigate(`/clases/${courseId}/actividades/${a.id}?generar=1&unidad=${unit.id}`);
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

  const actions: MaterialActions = {
    onEdit: (m) => setTarget({ m, kind: 'edit' }),
    onShare: (m) => setTarget({ m, kind: 'share' }),
    onPlace: (m, mode) => setTarget({ m, kind: 'place', mode }),
  };
  const group = (list: Material[]) => (
    <List inset={64}>
      {list.map((m) => (
        <MaterialRow key={m.id} m={m} courseId={courseId} unitTitle={unit.title} group={list} all={materials} today={today} actions={actions} />
      ))}
    </List>
  );

  return (
    <Page
      title={unit.title}
      back={planPath}
      backLabel={ordinals(course.group.name)}
      eyebrow={<><Dot color={course.color} large /><span className="eyebrow unit-eyebrow">{course.label}</span></>}
      subtitle={<>
        <span>{unit.term ? TERM_LABEL[unit.term] : 'Sin evaluación'}</span>
        <Chip tone={status.tone}>{status.label}</Chip>
      </>}
      actions={
        <Menu
          trigger={(open) => <IconButton label="Más opciones" glass onClick={open}><DotsThree size={22} weight="bold" /></IconButton>}
          items={[
            ...(unit.status !== 'current' ? [{ label: 'Marcar en curso', onSelect: () => setStatus('current') }] : []),
            ...(unit.status !== 'done' ? [{ label: 'Marcar como impartida', onSelect: () => setStatus('done') }] : []),
            { label: 'Renombrar', icon: <PencilSimple size={18} />, onSelect: () => setSheet('edit'), separatorBefore: true },
            { label: 'Cambiar evaluación', icon: <CalendarBlank size={18} />, onSelect: () => setSheet('edit') },
            { label: 'Eliminar unidad', icon: <Trash size={18} />, danger: true, separatorBefore: true, onSelect: removeUnit },
          ]}
        />
      }
    >
      <DropTarget className="unit-body" onFiles={onFiles} disabled={upload.isPending} label="Suelta los archivos para subirlos a la unidad">
        <div className="unit-actions">
          <Button icon={<Plus size={18} weight="bold" />} onClick={() => setSheet('create')}>Crear con IA</Button>
          <Button className="unit-actions__wide" variant="neutral" icon={<UploadSimple size={18} />} loading={upload.isPending}
            onClick={() => fileInput.current?.click()}>Subir archivos</Button>
          <Button className="unit-actions__wide" variant="neutral" icon={<Camera size={18} />} onClick={() => setSheet('photos')}>
            {photosLabel}
          </Button>
          <Button className="unit-actions__wide" variant="neutral" icon={<LinkSimple size={18} />} onClick={() => setSheet('link')}>Añadir enlace</Button>
          <div className="unit-actions__narrow">
            <Menu
              trigger={(open) => <Button variant="neutral" icon={<UploadSimple size={18} />} loading={upload.isPending} onClick={open}>Añadir material</Button>}
              items={[
                { label: 'Subir archivos', icon: <UploadSimple size={18} />, onSelect: () => fileInput.current?.click() },
                { label: photosLabel, icon: <Camera size={18} />, onSelect: () => setSheet('photos') },
                { label: 'Añadir enlace', icon: <LinkSimple size={18} />, onSelect: () => setSheet('link') },
              ]}
            />
          </div>
          <input ref={fileInput} type="file" hidden multiple accept={ACCEPT}
            onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void onFiles(files); }} />
        </div>

        {uploading && (
          <Callout tone="accent"><div className="unit-upload"><span>{uploading}</span><Progress value={sent ?? 0} total={1} /></div></Callout>
        )}
        {materials.length === 0 ? (
          <div className="paper">
            <EmptyState icon={<FolderOpen size={24} />} title="Aún no hay materiales en esta unidad"
              text="Sube lo que ya usas en clase (el tema del libro, tus apuntes, fotos de las páginas) o crea apuntes, fichas y presentaciones con IA a partir de ello." />
          </div>
        ) : (
          <>
            {forStudents.length > 0 && (
              <Section title="Para alumnos" footer="Compártelos con un enlace o un código QR desde el menú de cada uno.">{group(forStudents)}</Section>
            )}
            {forMe.length > 0 && (
              <Section title="Solo para ti" footer="Tus alumnos no los ven. Pásalos a «para alumnos» desde el menú de cada uno.">{group(forMe)}</Section>
            )}
          </>
        )}

        <Section title="Evaluar">
          <List inset={64}>
            <Row lead={<RowIcon><Exam size={20} /></RowIcon>} title="Crear un examen de esta unidad"
              sub="Con preguntas a partir de los materiales" onClick={createExam}
              trail={createActivity.isPending ? <Spinner /> : undefined} />
          </List>
        </Section>
      </DropTarget>

      <CreateMaterialSheet open={sheet === 'create'} unit={unit} materials={materials} courseId={courseId}
        initial={params.get('crear') === 'ficha' ? { kind: 'worksheet', level: 'refuerzo', instructions: params.get('indicaciones') ?? '' } : undefined}
        onClose={() => { setSheet(null); if (params.has('crear')) setParams({}, { replace: true }); }} />
      <UnitFormSheet open={sheet === 'edit'} onClose={() => setSheet(null)} courseId={courseId} unit={unit} />
      <AddLinkSheet open={sheet === 'link'} onClose={() => setSheet(null)} unitId={unit.id} />
      <PhotoPagesSheet open={sheet === 'photos'} onClose={() => setSheet(null)} unitId={unit.id} />
      {target?.kind === 'edit' && <EditMaterialSheet material={target.m} onClose={() => setTarget(null)} />}
      {target?.kind === 'share' && <ShareSheet material={target.m} onClose={() => setTarget(null)} />}
      {target?.kind === 'place' && (
        <PlaceMaterialSheet material={target.m} mode={target.mode} courseId={courseId} unitTitle={unit.title} onClose={() => setTarget(null)} />
      )}
    </Page>
  );
}
