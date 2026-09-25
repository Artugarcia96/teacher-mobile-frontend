import { CheckCircle, Circle, CheckSquare, Square, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useJob } from '../../api/core';
import type { CourseDetail, Job } from '../../api/types';
import { usePrepareMaterials, useUnitDetails, type GenKind, type Unit } from '../../api/units';
import { useAuth } from '../../lib/auth';
import { plural, TERM_LABEL } from '../../lib/format';
import { Button, List, Progress, Row, RowIcon, Section, Segmented, Sheet, Spinner, TextArea, useFeedback } from '../../ui';
import { useWatched, watchJob, type Watched } from '../materials/watch';
import { KINDS } from './CreateMaterialSheet';
import { kindLabel, MaterialIcon, shortTitle } from './kinds';
import './units.css';

type Batch = Extract<Watched, { kind: 'batch' }>;
const DEFAULT_KINDS: GenKind[] = ['notes', 'worksheet', 'slides'];
const ORDER: string[] = KINDS.map((k) => k.kind);

/** «3 de 8 materiales» (from the job's progress, so one material reads «0 de 1 material»). */
export function batchText(job: Job): string {
  return `${job.progress} de ${plural(job.total, 'material', 'materiales')}`;
}

/** «Preparar el trimestre»: the chosen kinds for the chosen units of one evaluación in one job (apuntes first in each
 *  unit). The sheet then shows the progress of every material; it can be closed and the work goes on. */
export default function PrepareTermSheet({ open, onClose, course, units }: {
  open: boolean; onClose: () => void; course: CourseDetail; units: Unit[];
}) {
  const running = useWatched().find((w): w is Batch => w.kind === 'batch' && w.courseId === course.id);
  // The batch on screen stays after it ends (its result), until the sheet is closed.
  const [shown, setShown] = useState<Batch | null>(null);
  useEffect(() => { if (open && running) setShown(running); }, [open, running]);
  if (!open) return null;
  const batch = shown ?? running;
  return batch
    ? <PrepareProgress batch={batch} units={units} courseId={course.id} onClose={() => { setShown(null); onClose(); }} />
    : <PrepareChoose course={course} units={units} onClose={onClose} onStarted={setShown} />;
}

function PrepareChoose({ course, units, onClose, onStarted }: {
  course: CourseDetail; units: Unit[]; onClose: () => void; onStarted: (b: Batch) => void;
}) {
  const { me } = useAuth();
  const { toast } = useFeedback();
  const prepare = usePrepareMaterials(course.id);
  const terms = [1, 2, 3].filter((t) => units.some((u) => u.term === t));
  const current = me?.school_year.current_term ?? 1;
  const [term, setTerm] = useState(terms.includes(current) ? current : terms[0] ?? 1);
  const inTerm = units.filter((u) => u.term === term);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(inTerm.filter((u) => u.status !== 'done').map((u) => u.id)));
  const [kinds, setKinds] = useState<Set<GenKind>>(new Set(DEFAULT_KINDS));
  const [instructions, setInstructions] = useState('');
  const chosen = inTerm.filter((u) => picked.has(u.id));
  const total = chosen.length * kinds.size;

  const pickTerm = (t: number) => {
    setTerm(t);
    setPicked(new Set(units.filter((u) => u.term === t && u.status !== 'done').map((u) => u.id)));
  };
  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };

  const submit = async () => {
    if (prepare.isPending || !total) return;
    try {
      const order = KINDS.map((k) => k.kind).filter((k) => kinds.has(k));
      const { materials, job } = await prepare.mutateAsync({ unit_ids: chosen.map((u) => u.id), kinds: order, instructions: instructions.trim() });
      const batch: Batch = { job: job.id, kind: 'batch', courseId: course.id, materials: materials.map((m) => ({ id: m.id, unit_id: m.unit_id, kind: m.kind })) };
      watchJob(batch);
      onStarted(batch);
      toast(`Preparando ${plural(materials.length, 'material', 'materiales')}. Puedes seguir trabajando.`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const reason = !chosen.length ? 'Elige al menos una unidad' : !kinds.size ? 'Elige al menos un tipo de material' : '';
  return (
    <Sheet open onClose={onClose} title="Preparar el trimestre" size="large" dirty={!!instructions.trim()}
      subtitle="Crea con IA los materiales de varias unidades a la vez, a partir de lo que has subido a cada una. Tarda varios minutos y puedes seguir trabajando."
      footer={<Button full onClick={submit} loading={prepare.isPending} disabled={!!reason}>
        {reason || `Crear ${plural(total, 'material', 'materiales')}`}
      </Button>}>
      <div className="form">
        {terms.length > 1 && (
          <Segmented full label="Evaluación" value={term} onChange={pickTerm}
            options={terms.map((t) => ({ value: t, label: TERM_LABEL[t] }))} />
        )}
        <Section title="Unidades">
          <List inset={56}>
            {inTerm.map((u) => {
              const on = picked.has(u.id);
              return (
                <Row key={u.id} title={u.title} chevron={false} onClick={() => setPicked(toggle(picked, u.id))} aria-label={u.title}
                  sub={u.status === 'done' ? 'Impartida' : u.status === 'current' ? 'En curso' : plural(u.material_count, 'material', 'materiales')}
                  lead={on ? <CheckSquare size={24} weight="fill" className="kind-row__check" /> : <Square size={24} className="kind-row__radio" />} />
              );
            })}
          </List>
        </Section>
        <Section title="Para cada unidad">
          <List inset={64}>
            {KINDS.map((k) => {
              const on = kinds.has(k.kind);
              return (
                <Row key={k.kind} className={on ? 'kind-row kind-row--on' : 'kind-row'} title={k.title} sub={k.sub} wrapSub chevron={false}
                  lead={<RowIcon tone={on ? 'accent' : undefined}><MaterialIcon kind={k.kind} /></RowIcon>}
                  trail={on ? <CheckCircle size={22} weight="fill" className="kind-row__check" /> : <Circle size={22} className="kind-row__radio" />}
                  onClick={() => setKinds(toggle(kinds, k.kind))} aria-label={k.title} />
              );
            })}
          </List>
        </Section>
        <TextArea label="Indicaciones para todas (opcional)" value={instructions} onChange={(e) => setInstructions(e.target.value)}
          maxLength={1500} rows={2} placeholder="Por ejemplo: grupo con nivel bajo, ejemplos de la vida diaria" />
      </div>
    </Sheet>
  );
}

function PrepareProgress({ batch, units, courseId, onClose }: { batch: Batch; units: Unit[]; courseId: string; onClose: () => void }) {
  const job = useJob(batch.job);
  const finished = job?.status === 'done' || job?.status === 'failed';
  const unitIds = [...new Set(batch.materials.map((m) => m.unit_id).filter((id): id is string => !!id))];
  const details = useUnitDetails(unitIds, !finished);
  const byId = new Map(details.flatMap((q) => q.data?.materials ?? []).map((m) => [m.id, m]));
  const title = (id: string) => units.find((u) => u.id === id)?.title ?? '';
  const ready = batch.materials.filter((m) => byId.get(m.id)?.status === 'ready').length;

  return (
    <Sheet open onClose={onClose} title={finished ? 'Materiales preparados' : 'Preparando el trimestre'} size="large"
      subtitle={finished ? `${plural(ready, 'material listo', 'materiales listos')} de ${batch.materials.length}.`
        : 'Puedes cerrar esta hoja y seguir trabajando: al terminar aparece un aviso.'}
      footer={<Button full variant="neutral" onClick={onClose}>Cerrar</Button>}>
      <div className="form">
        {!finished && (
          <div className="prepare-progress">
            <span>{job ? batchText(job) : 'En cola…'}</span>
            <Progress value={job?.progress ?? 0} total={job?.total || batch.materials.length} />
          </div>
        )}
        {unitIds.map((uid) => (
          <Section key={uid} title={title(uid)}>
            <List inset={64}>
              {batch.materials.filter((b) => b.unit_id === uid).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).map((b) => {
                const m = byId.get(b.id);
                const label = m ? shortTitle(m.title, title(uid)) : kindLabel({ kind: b.kind as GenKind, options: {} });
                const lead = <RowIcon tone={m?.status === 'failed' ? 'warn' : 'accent'}>
                  {m?.status === 'failed' ? <WarningCircle size={20} /> : <MaterialIcon kind={b.kind as GenKind} />}
                </RowIcon>;
                if (m?.status === 'ready') {
                  return <Row key={b.id} lead={lead} title={label} sub="Listo" to={`/clases/${courseId}/unidades/${uid}/materiales/${b.id}`} />;
                }
                if (m?.status === 'failed') {
                  return <Row key={b.id} lead={lead} title={label} wrapSub sub={<span className="mrow__error">{m.error || 'No se ha podido crear'}</span>}
                    to={`/clases/${courseId}/unidades/${uid}`} />;
                }
                return <Row key={b.id} lead={lead} title={label} sub={finished ? '' : 'Creando…'} trail={finished ? undefined : <Spinner />} />;
              })}
            </List>
          </Section>
        ))}
      </div>
    </Sheet>
  );
}
