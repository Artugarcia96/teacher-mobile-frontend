import { CalendarBlank, DotsThree, Exam, FolderOpen, PencilSimple, Plus, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateActivity } from '../../api/activities';
import { useDeleteMaterial, useDeleteUnit, usePatchUnit, useUnit, useUploadMaterial, type Material, type UnitStatus } from '../../api/units';
import CreateMaterialSheet from '../../features/units/CreateMaterialSheet';
import { kindLabel, MaterialIcon } from '../../features/units/kinds';
import UnitFormSheet from '../../features/units/UnitFormSheet';
import { fileUrl } from '../../lib/api';
import { useToday } from '../../lib/auth';
import { addDays, ordinals, shortDate, TERM_LABEL } from '../../lib/format';
import {
  AIBadge, Button, Chip, Dot, EmptyState, IconButton, List, Menu, Page, Row, RowIcon, Section, SkeletonList, Spinner, useFeedback,
} from '../../ui';
import './UnitPage.css';

const STATUS: Record<UnitStatus, { label: string; tone?: 'accent' | 'ok' }> = {
  pending: { label: 'Pendiente' },
  current: { label: 'En curso', tone: 'accent' },
  done: { label: 'Impartida' },
};
const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.heic';

/** Unidad: its materials, "Crear con IA", uploads and the shortcut to an exam of the unit. */
export default function UnitPage() {
  const { courseId = '', unitId = '' } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const { toast, confirm } = useFeedback();
  const { data, isLoading, error } = useUnit(unitId);
  const patch = usePatchUnit(courseId);
  const delUnit = useDeleteUnit(courseId);
  const upload = useUploadMaterial(unitId);
  const createActivity = useCreateActivity(courseId);
  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const planPath = `/clases/${courseId}/programacion`;

  if (error) {
    return (
      <Page title="Unidad" back={planPath} backLabel="Temario">
        <EmptyState icon={<WarningCircle size={24} />} title="No se ha encontrado la unidad" text={(error as Error).message}
          action={<Button variant="neutral" to={planPath}>Volver al temario</Button>} />
      </Page>
    );
  }
  if (isLoading || !data) {
    return <Page title="" back={planPath} backLabel="Temario"><SkeletonList rows={5} /></Page>;
  }

  const { unit, course, materials } = data;
  const status = STATUS[unit.status];
  const notes = materials.find((m) => m.kind === 'notes' && m.status === 'ready');

  const pickFile = () => fileInput.current?.click();

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast('Archivo subido');
    } catch (err) {
      toast((err as Error).message, { tone: 'error' });
    }
  };

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
      text: materials.length ? `Se borrarán también sus ${materials.length} materiales. No se puede deshacer.` : 'No se puede deshacer.',
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
      <div className="unit-body">
      {materials.length > 0 && (
        <div className="unit-actions">
          <Button icon={<Plus size={18} weight="bold" />} onClick={() => setSheet('create')}>Crear con IA</Button>
          <Button variant="neutral" icon={<UploadSimple size={18} />} loading={upload.isPending} onClick={pickFile}>Subir archivo</Button>
        </div>
      )}
      <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={onFile} />

      <Section title="Materiales" footer={materials.length ? 'Los archivos que subas se usan como base al crear con IA.' : undefined}>
        {materials.length ? (
          <List inset={64}>
            {materials.map((m) => <MaterialRow key={m.id} m={m} courseId={courseId} unitId={unitId} today={today} />)}
          </List>
        ) : (
          <div className="paper">
            <EmptyState icon={<FolderOpen size={24} />} title="Aún no hay materiales en esta unidad"
              text="Sube tus apuntes o el tema del libro, o crea apuntes, una presentación o una ficha con IA."
              action={<div className="unit-actions unit-actions--center">
                <Button icon={<Plus size={18} weight="bold" />} onClick={() => setSheet('create')}>Crear con IA</Button>
                <Button variant="neutral" icon={<UploadSimple size={18} />} loading={upload.isPending} onClick={pickFile}>Subir archivo</Button>
              </div>} />
          </div>
        )}
      </Section>

      <Section title="Evaluar">
        <List inset={64}>
          <Row lead={<RowIcon><Exam size={20} /></RowIcon>} title="Crear un examen de esta unidad"
            sub="Con preguntas a partir de los materiales" onClick={createExam}
            trail={createActivity.isPending ? <Spinner /> : undefined} />
        </List>
      </Section>
      </div>

      <CreateMaterialSheet open={sheet === 'create'} onClose={() => setSheet(null)} unitId={unit.id} notesId={notes?.id} />
      <UnitFormSheet open={sheet === 'edit'} onClose={() => setSheet(null)} courseId={courseId} unit={unit} />
    </Page>
  );
}

function MaterialRow({ m, courseId, unitId, today }: { m: Material; courseId: string; unitId: string; today: string }) {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const del = useDeleteMaterial(unitId);
  const filename = String(m.options?.filename ?? '');
  const date = m.created_at.slice(0, 10);
  const when = date === today ? 'Hoy' : shortDate(date);
  const lead = <RowIcon tone={m.kind === 'upload' ? undefined : 'accent'}><MaterialIcon kind={m.kind} filename={filename} /></RowIcon>;

  if (m.status === 'generating') {
    return <Row lead={lead} title={m.title} sub={`Creando ${kindLabel(m).toLowerCase()}…`} trail={<Spinner />} />;
  }
  if (m.status === 'failed') {
    const remove = async () => {
      if (!(await confirm({ title: 'Quitar este material', text: m.error ?? undefined, confirm: 'Quitar', danger: true }))) return;
      del.mutate(m.id, { onSuccess: () => toast('Material quitado'), onError: (e) => toast((e as Error).message, { tone: 'error' }) });
    };
    return (
      <Row lead={<RowIcon tone="warn"><WarningCircle size={20} /></RowIcon>} title={m.title}
        sub={<span className="material-error">{m.error || 'No se ha podido crear.'}</span>}
        trail={<Button size="sm" variant="plain" onClick={remove}>Quitar</Button>} />
    );
  }
  const open = () => {
    if (m.kind === 'upload') window.open(fileUrl(m.file_url), '_blank', 'noopener');
    else navigate(`/clases/${courseId}/unidades/${unitId}/materiales/${m.id}`);
  };
  return (
    <Row lead={lead} title={m.title} onClick={open}
      sub={<span className="material-sub">{subParts(m).concat(when).join(' · ')}{m.kind !== 'upload' && <AIBadge />}</span>} />
  );
}

/** "6 ejercicios", or the kind when the title does not say it. */
function subParts(m: Material): string[] {
  if (m.kind === 'worksheet' && m.options?.n_items) return [`${m.options.n_items} ejercicios`];
  if (m.kind === 'notes' && m.options?.length === 'breve') return ['Breve'];
  return m.title.startsWith(kindLabel(m)) ? [] : [kindLabel(m)];
}
