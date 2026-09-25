import { ArrowClockwise, ArrowSquareOut, Key, Trash, UsersThree } from '@phosphor-icons/react';
import { useAIUnavailable } from '../../api/core';
import { useDocumentUrl, type Correction } from '../../api/papers';
import type { Job } from '../../api/types';
import { useRedoVersion, useRemoveVersion, useVersion, useVersionDocUrl, type Versions } from '../../api/versions';
import { plural } from '../../lib/format';
import { AIBadge, Button, Callout, List, Row, RowIcon, Section, Sheet, SkeletonList, useFeedback } from '../../ui';
import { openSigned } from './openDoc';
import { RubricTable } from './RubricTable';

interface Props {
  activityId: string;
  /** The version shown ("A" = Modelo A), null = closed. */
  versionKey: string | null;
  versions: Versions;
  correction: Correction;
  /** Something is being prepared: «Rehacer» waits. */
  running: boolean;
  onClose: () => void;
  onJob: (job: Job) => void;
  /** «Cambiar el reparto» (this sheet closes first: never two sheets at once). */
  onAssign: () => void;
}

/** One version of the exam: its PDF and solutions, who takes it, its questions (editable like Modelo A's) and, at the
 * end, «Quitar versión». */
export default function VersionSheet({ activityId, versionKey, versions, correction, running, onClose, onJob, onAssign }: Props) {
  const isBase = versionKey === 'A';
  const detail = useVersion(activityId, versionKey && !isBase ? versionKey : null).data;
  const docUrl = useDocumentUrl(activityId);
  const versionDoc = useVersionDocUrl(activityId);
  const redo = useRedoVersion(activityId);
  const remove = useRemoveVersion(activityId);
  const noAI = useAIUnavailable();
  const { toast, confirm } = useFeedback();
  const v = isBase ? versions.base : versions.versions.find((x) => x.key === versionKey);
  if (!versionKey || !v) return null;

  const fail = (e: Error) => toast(e.message, { tone: 'error' });
  const open = (variant: 'print' | 'key') => openSigned(
    () => (isBase ? docUrl.mutateAsync(variant) : versionDoc.mutateAsync({ key: v.key, variant })),
    (m) => toast(m, { tone: 'error' }), (m) => toast(m));
  const ready = v.status === 'ready';
  const names = correction.students.filter((s) => v.student_ids.includes(s.student.id)).map((s) => s.student.sort_name);

  const onRedo = async () => {
    if (!(await confirm({
      title: `Rehacer «${v.label}»`,
      text: 'La IA vuelve a escribir esta versión a partir del modelo A. Se pierden los cambios que le hayas hecho.',
      confirm: 'Rehacer',
    }))) return;
    redo.mutate(v.key, { onSuccess: ({ job }) => { onJob(job); onClose(); }, onError: fail });
  };
  const onRemove = async () => {
    if (!(await confirm({
      title: `Quitar «${v.label}»`,
      text: v.student_ids.length ? `${plural(v.student_ids.length, 'alumno vuelve', 'alumnos vuelven')} al modelo A.` : undefined,
      confirm: 'Quitar versión', danger: true,
    }))) return;
    remove.mutate(v.key, { onSuccess: () => { toast(`${v.label} quitada`); onClose(); }, onError: fail });
  };

  const ai = v.kind !== 'base' && !v.same_questions;
  const subtitle = [v.code && `Marca ${v.code}`, v.pages && plural(v.pages, 'página', 'páginas'),
    v.kind !== 'base' && !v.comparable && 'Preguntas propias: no suma en «Errores frecuentes»'].filter(Boolean).join(' · ');

  return (
    <Sheet open onClose={onClose} side size="large" title={v.label}
      subtitle={v.draft || subtitle ? <span className="version-sub">{v.draft && <AIBadge />}{subtitle}</span> : undefined}>
      <div className="form">
        {v.status === 'failed' && <Callout tone="warn">{v.error || 'No se ha podido preparar.'} Pulsa «Rehacer».</Callout>}
        {v.status === 'generating' && <Callout>La IA está escribiendo esta versión. Puedes seguir trabajando.</Callout>}
        {v.stale && <Callout tone="warn">Se escribió a partir de un modelo A que ya ha cambiado. Rehazla para que coincida.</Callout>}
        {ready && v.error && <Callout tone="warn">{v.error}</Callout>}
        {ready && v.warnings.map((w) => <Callout key={w} tone="warn">{w}</Callout>)}
        {ready && (
          <List>
            <Row lead={<RowIcon><ArrowSquareOut size={20} /></RowIcon>} title="Ver el examen" chevron={false}
              sub={isBase ? 'Para fotocopiar, sin nombres' : v.enlarged ? 'Sin nombres, en A3: imprímelo en A3' : 'Sin nombres, con su marca en cada página'}
              onClick={() => open('print')} />
            <Row lead={<RowIcon><Key size={20} /></RowIcon>} title="Soluciones" chevron={false} onClick={() => open('key')} />
          </List>
        )}

        <Section title={`Alumnos · ${v.student_ids.length}`}
          action={versions.versions.length > 0 && <Button size="sm" variant="plain" icon={<UsersThree size={16} />} onClick={onAssign}>Cambiar el reparto</Button>}>
          <p className="version-names">{names.length ? names.join(' · ') : 'Nadie hace esta versión.'}</p>
        </Section>

        {isBase && <p className="muted">Sus preguntas son las de la rúbrica del paso «Preparar».</p>}
        {v.same_questions && (
          <p className="muted">
            {v.enlarged
              ? 'Tu examen tal cual, con sus figuras, ampliado a A3 (141 %). Sus preguntas se editan en el modelo A.'
              : 'Las mismas preguntas del modelo A, con letra más grande y más espacio para responder. Se editan en el modelo A.'}
          </p>
        )}
        {ai && ready && (
          detail?.rubric
            ? <Section title={`Preguntas · ${detail.rubric.items.length}`}>
              <RubricTable activityId={activityId} versionKey={v.key} rubric={detail.rubric} maxScore={correction.activity.max_score} />
            </Section>
            : <SkeletonList rows={3} />
        )}

        {v.kind !== 'base' && (
          <div className="version-end">
            {ai && (
              <Button variant="neutral" icon={<ArrowClockwise size={18} />} onClick={onRedo} loading={redo.isPending}
                disabled={running || v.in_use || v.status === 'generating' || !!noAI}>
                Rehacer
              </Button>
            )}
            <Button variant="danger" icon={<Trash size={18} />} onClick={onRemove} loading={remove.isPending} disabled={v.in_use}>
              Quitar versión
            </Button>
            {v.in_use ? <span className="muted">Ya hay hojas o notas de esta versión: se queda como se imprimió.</span>
              : ai && noAI ? <span className="muted">{noAI}</span>
                : running && ai && <span className="muted">Rehacer espera a que termine lo que se está preparando.</span>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
