import { ArrowDown, ArrowUp, CheckCircle, Circle, Copy, DotsThree, ListBullets, Plus, ShareNetwork, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { CourseDetail } from '../../api/types';
import { useDeleteUnit, useOrderUnits, usePatchUnit, useUnits, type Unit, type UnitStatus } from '../../api/units';
import { useCourseMenu } from '../../features/course/CourseMenu';
import CopyUnitsSheet from '../../features/units/CopyUnitsSheet';
import ImportUnitsSheet from '../../features/units/ImportUnitsSheet';
import UnitFormSheet from '../../features/units/UnitFormSheet';
import { plural, TERM_LABEL } from '../../lib/format';
import { Button, Chip, EmptyState, IconButton, List, Menu, Row, Section, SkeletonList, useFeedback, type MenuItem } from '../../ui';
import './PlanTab.css';

type SheetName = 'new' | 'import' | 'copy' | null;

/** Temario (URL slug "programacion"): units grouped by evaluación, with status (pendiente / en curso / impartida).
 *  Import and copy live in the class "···" menu (features/course/CourseMenu). */
export default function PlanTab({ course }: { course: CourseDetail }) {
  const { data: units, isLoading, error } = useUnits(course.id);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [newTerm, setNewTerm] = useState<number | undefined>();
  const close = () => setSheet(null);
  useCourseMenu([
    { label: 'Importar temario', icon: <UploadSimple size={18} />, onSelect: () => setSheet('import') },
    { label: 'Copiar de otra clase', icon: <Copy size={18} />, onSelect: () => setSheet('copy') },
  ]);

  const sheets = (
    <>
      <UnitFormSheet open={sheet === 'new'} onClose={close} courseId={course.id} term={newTerm} />
      <ImportUnitsSheet open={sheet === 'import'} onClose={close} courseId={course.id} />
      <CopyUnitsSheet open={sheet === 'copy'} onClose={close} courseId={course.id} />
    </>
  );

  if (isLoading) return <SkeletonList rows={6} />;
  if (error) {
    return <EmptyState icon={<WarningCircle size={24} />} title="No se ha podido cargar el temario" text={(error as Error).message} />;
  }
  const list = units ?? [];
  const addUnit = (term?: number) => { setNewTerm(term); setSheet('new'); };

  if (!list.length) {
    return (
      <div className="plan">
        <div className="paper">
          <EmptyState icon={<ListBullets size={24} />} title="Organiza el curso por unidades"
            text="Pega el índice del libro y Sepia propone las unidades de cada evaluación. Después podrás crear apuntes, presentaciones y fichas de cada una."
            action={<div className="plan-empty__actions">
              <Button icon={<UploadSimple size={18} />} onClick={() => setSheet('import')}>Importar temario</Button>
              <Button variant="neutral" icon={<Plus size={18} />} onClick={() => addUnit()}>Añadir unidad</Button>
            </div>} />
        </div>
        {sheets}
      </div>
    );
  }

  const groups = [1, 2, 3].map((t) => ({ term: t as number | null, label: TERM_LABEL[t], units: list.filter((u) => u.term === t) }));
  const loose = list.filter((u) => !u.term);
  if (loose.length) groups.push({ term: null, label: 'Sin evaluación', units: loose });
  const done = list.filter((u) => u.status === 'done').length;
  const current = list.find((u) => u.status === 'current');

  return (
    <div className="plan">
      <div className="plan-bar">
        <span className="plan-bar__meta">
          {done ? `${done} de ${plural(list.length, 'unidad impartida', 'unidades impartidas')}` : plural(list.length, 'unidad', 'unidades')}
          {current && <> · En curso: <b>{current.title}</b></>}
        </span>
        <div className="plan-bar__actions">
          <Button size="sm" variant="tinted" icon={<Plus size={16} weight="bold" />} onClick={() => addUnit()}>Unidad</Button>
        </div>
      </div>

      <div className="plan-terms">
        {groups.map((g) => (
          <Section key={g.label} title={g.label}
            action={g.units.length ? <span className="plan-term__count">{plural(g.units.length, 'unidad', 'unidades')}</span> : undefined}>
            {g.units.length ? (
              <List inset={56}>
                {g.units.map((u, i) => (
                  <UnitRow key={u.id} unit={u} courseId={course.id} all={list} first={i === 0} last={i === g.units.length - 1} />
                ))}
              </List>
            ) : (
              <List>
                <Row title={<span className="plan-term__empty">Sin unidades</span>} chevron={false}
                  trail={<Button size="sm" variant="plain" onClick={() => addUnit(g.term ?? undefined)}>Añadir</Button>} />
              </List>
            )}
          </Section>
        ))}
      </div>
      {sheets}
    </div>
  );
}

function StatusMark({ status }: { status: UnitStatus }) {
  if (status === 'done') return <CheckCircle size={22} weight="fill" className="unit-mark unit-mark--done" aria-label="Impartida" />;
  return <span className={`unit-mark unit-mark--${status}`} aria-label={status === 'current' ? 'En curso' : 'Pendiente'} />;
}

function UnitRow({ unit, courseId, all, first, last }: { unit: Unit; courseId: string; all: Unit[]; first: boolean; last: boolean }) {
  const { toast, confirm } = useFeedback();
  const patch = usePatchUnit(courseId);
  const del = useDeleteUnit(courseId);
  const order = useOrderUnits(courseId);

  const setStatus = async (status: UnitStatus, msg: string) => {
    try {
      await patch.mutateAsync({ id: unit.id, status });
      toast(msg);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const move = (dir: -1 | 1) => {
    const same = all.filter((u) => u.term === unit.term);
    const i = same.findIndex((u) => u.id === unit.id);
    const other = same[i + dir];
    if (!other) return;
    const ids = all.map((u) => u.id);
    const a = ids.indexOf(unit.id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    order.mutate(ids, { onError: (e) => toast((e as Error).message, { tone: 'error' }) });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `¿Eliminar «${unit.title}»?`,
      text: unit.material_count ? `Se borrarán también sus ${plural(unit.material_count, 'material', 'materiales')}. No se puede deshacer.` : 'No se puede deshacer.',
      confirm: 'Eliminar', danger: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(unit.id);
      toast('Unidad eliminada');
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const items: MenuItem[] = [
    ...(unit.status !== 'current' ? [{ label: 'Marcar en curso', icon: <span className="unit-mark unit-mark--current unit-mark--sm" />, onSelect: () => setStatus('current', 'Unidad en curso') }] : []),
    ...(unit.status !== 'done' ? [{ label: 'Marcar como impartida', icon: <CheckCircle size={18} />, onSelect: () => setStatus('done', 'Unidad impartida') }] : []),
    ...(unit.status !== 'pending' ? [{ label: 'Marcar como pendiente', icon: <Circle size={18} />, onSelect: () => setStatus('pending', 'Unidad pendiente') }] : []),
    ...(!first ? [{ label: 'Mover arriba', icon: <ArrowUp size={18} />, onSelect: () => move(-1), separatorBefore: true }] : []),
    ...(!last ? [{ label: 'Mover abajo', icon: <ArrowDown size={18} />, onSelect: () => move(1), separatorBefore: first }] : []),
    { label: 'Eliminar', icon: <Trash size={18} />, danger: true, separatorBefore: true, onSelect: remove },
  ];

  return (
    <div className="plan-unit">
      <Row to={`/clases/${courseId}/unidades/${unit.id}`} chevron={false}
        lead={<StatusMark status={unit.status} />}
        title={<>
          <span className={unit.status === 'done' ? 'plan-unit__title--done' : undefined}>{unit.title}</span>
          {unit.status === 'current' && <Chip tone="accent">En curso</Chip>}
        </>}
        sub={unit.material_count ? (
          <span className="plan-unit__sub">
            {plural(unit.material_count, 'material', 'materiales')}
            {!!unit.shared_count && (
              <span className="plan-unit__shared" title={`${plural(unit.shared_count, 'material compartido', 'materiales compartidos')} con alumnos`}>
                <ShareNetwork size={13} weight="bold" aria-label="Compartido con alumnos" />
              </span>
            )}
          </span>
        ) : 'Sin materiales'}
        trail={<span className="plan-unit__gap" />}
      />
      <div className="plan-unit__menu">
        <Menu trigger={(open) => <IconButton label={`Opciones de ${unit.title}`} onClick={open}><DotsThree size={20} weight="bold" /></IconButton>} items={items} />
      </div>
    </div>
  );
}
