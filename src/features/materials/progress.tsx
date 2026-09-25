import { useJob } from '../../api/core';
import type { Material } from '../../api/units';
import { plural } from '../../lib/format';
import { Progress } from '../../ui';

/** The content pipeline's stages, in order: the job's `message` says which one is running (backend STEP_LABEL). */
export const STEPS = ['Analizando tus fuentes…', 'Planificando…', 'Redactando…', 'Revisando soluciones…', 'Maquetando…'];

/** Where the generation of a material is: its stage («Redactando… · 3 de 5») or, inside «Preparar el trimestre»,
 *  how far the batch is. */
export function useGeneration(m: Pick<Material, 'status' | 'job_id'>) {
  const job = useJob(m.status === 'generating' ? m.job_id : null);
  if (job?.kind === 'prepare_materials') {
    return { text: `Preparando el trimestre · ${job.progress} de ${plural(job.total, 'material', 'materiales')}`, step: 0 };
  }
  const i = STEPS.indexOf(job?.message ?? '');
  const step = i < 0 ? 0 : i + 1;
  return { text: step ? `${STEPS[i]} · paso ${step} de ${STEPS.length}` : 'En cola…', step };
}

/** One line + bar for a material being created (unit list). */
export function GenerationLine({ m }: { m: Pick<Material, 'status' | 'job_id'> }) {
  const g = useGeneration(m);
  return (
    <span className="gen-line">
      <span className="gen-line__text">{g.text}</span>
      {g.step > 0 && <Progress value={g.step} total={STEPS.length} />}
    </span>
  );
}
