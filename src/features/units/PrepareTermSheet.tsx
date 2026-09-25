import { CheckCircle, Circle, CheckSquare, Square, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useJob } from '../../api/core';
import type { CourseDetail, Job } from '../../api/types';
import { PREPARE_MAX, usePrepareMaterials, useUnitDetails, type GenKind, type Material, type Unit } from '../../api/units';
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
  const [term, setTerm] = useState(() => defaultTerm(units, terms, me?.school_year.current_term ?? 1));
  const inTerm = units.filter((u) => u.term === term);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(inTerm.filter((u) => u.status !== 'done').map((u) => u.id)));
  const [kinds, setKinds] = useState<Set<GenKind>>(new Set(DEFAULT_KINDS));
  const [instructions, setInstructions] = useState('');
  const details = useUnitDetails(inTerm.map((u) => u.id), false);
  const mats = new Map(inTerm.map((u, i) => [u.id, details[i]?.data?.materials]));
  const has = (uid: string, kind: GenKind) => !!mats.get(uid)?.some((m) => m.kind === kind && m.status !== 'failed');
  const chosen = inTerm.filter((u) => picked.has(u.id));
  const total = chosen.reduce((n, u) => n + [...kinds].filter((k) => !has(u.id, k)).length, 0);
  const skipped = chosen.length * kinds.size - total;

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
      const { materials, job, skipped: kept } = await prepare.mutateAsync({ unit_ids: chosen.map((u) => u.id), kinds: order, instructions: instructions.trim() });
      const batch: Batch = { job: job.id, kind: 'batch', courseId: course.id, materials: materials.map((m) => ({ id: m.id, unit_id: m.unit_id, kind: m.kind })) };
      watchJob(batch);
      onStarted(batch);
      toast(`Preparando ${plural(materials.length, 'material', 'materiales')}${kept ? ` (${plural(kept, 'ya estaba hecho', 'ya estaban hechos')})` : ''}. Puedes seguir trabajando.`);
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const reason = !chosen.length ? 'Elige al menos una unidad' : !kinds.size ? 'Elige al menos un tipo de material'
    : !total ? 'Esas unidades ya tienen esos materiales' : total > PREPARE_MAX ? `Elige como mucho ${PREPARE_MAX} materiales a la vez` : '';
  return (
    <Sheet open onClose={onClose} title="Preparar el trimestre" size="large" dirty={!!instructions.trim()}
      subtitle="Crea con IA los materiales de varias unidades a la vez, a partir de lo que has subido a cada una y de su temario. Tarda varios minutos y puedes seguir trabajando."
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
              const info = unitInfo(u, mats.get(u.id), [...kinds]);
              return (
                <Row key={u.id} title={u.title} chevron={false} onClick={() => setPicked(toggle(picked, u.id))} aria-label={u.title}
                  wrapSub sub={info.warn ? <span className="prepare-warn"><WarningCircle size={14} weight="bold" /> {info.text}</span> : info.text}
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
        {skipped > 0 && total > 0 && (
          <p className="field__hint">{plural(skipped, 'material ya está hecho', 'materiales ya están hechos')} en esas unidades: no se repite{skipped === 1 ? '' : 'n'}.</p>
        )}
        <TextArea label="Indicaciones para todas (opcional)" value={instructions} onChange={(e) => setInstructions(e.target.value)}
          maxLength={1500} rows={2} placeholder="Por ejemplo: grupo con nivel bajo, ejemplos de la vida diaria" />
      </div>
    </Sheet>
  );
}

/** The evaluación to prepare: the current one, or the next one when 70 % of the current one's units are taught. */
function defaultTerm(units: Unit[], terms: number[], current: number): number {
  const mine = units.filter((u) => u.term === current);
  const done = mine.filter((u) => u.status === 'done').length;
  const next = terms.find((t) => t > current);
  if (mine.length && done / mine.length >= 0.7 && next) return next;
  return terms.includes(current) ? current : terms[0] ?? 1;
}

const HAS: Partial<Record<GenKind, string>> = { notes: 'apuntes', worksheet: 'ficha', slides: 'presentación', summary: 'resumen', adapted: 'lectura fácil' };

/** What the AI has for a unit (its files, or only its temario or title) and which chosen kinds it already has. */
function unitInfo(u: Unit, materials: Material[] | undefined, kinds: GenKind[]): { text: string; warn: boolean } {
  const status = u.status === 'done' ? 'Impartida' : u.status === 'current' ? 'En curso' : '';
  const own = materials?.filter((m) => m.kind === 'upload' || m.kind === 'link').length ?? 0;
  const done = kinds.filter((k) => materials?.some((m) => m.kind === k && m.status !== 'failed')).map((k) => HAS[k]!);
  const parts = [status];
  let warn = false;
  if (materials && !own) {
    warn = !u.summary?.trim();
    parts.push(warn ? 'Sin archivos: la IA solo tiene el título' : 'Sin archivos: la IA usa el temario');
  } else if (own) {
    parts.push(plural(own, 'archivo', 'archivos'));
  }
  if (done.length) parts.push(`Ya tiene ${done.length > 1 ? `${done.slice(0, -1).join(', ')} y ${done.at(-1)}` : done[0]}`);
  return { text: parts.filter(Boolean).join(' · '), warn };
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
                const waiting = b.kind !== 'notes' && batch.materials.some((o) => o.unit_id === uid && o.kind === 'notes'
                  && byId.get(o.id)?.status === 'generating');
                return <Row key={b.id} lead={lead} title={label} sub={finished ? '' : waiting ? 'Esperando a los apuntes' : 'Creando…'}
                  trail={finished ? undefined : <Spinner />} />;
              })}
            </List>
          </Section>
        ))}
      </div>
    </Sheet>
  );
}
