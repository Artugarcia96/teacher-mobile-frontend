import { ArrowSquareOut, DotsThree, Exam, Key, NotePencil, PencilLine, Rows, UploadSimple, Warning } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useAIUnavailable } from '../../api/core';
import { useDocumentUrl, useGenerateExam, useUploadDocument, type Correction, type GenerateInput } from '../../api/papers';
import type { Job } from '../../api/types';
import { plural } from '../../lib/format';
import { Button, Callout, IconButton, List, Menu, Row, RowIcon, Section, useFeedback } from '../../ui';
import { JobLine } from './JobLine';
import { openSigned } from './openDoc';
import { RubricTable } from './RubricTable';
import { VersionsSection } from './VersionsSection';

interface Props {
  correction: Correction;
  job: Job | undefined;
  /** Uploading or generating the exam: the step shows its progress only. */
  running: boolean;
  /** Writing versions of the exam: the step stays usable, the «Versiones» section shows the progress. */
  versionsRunning: boolean;
  onJob: (job: Job) => void;
  onGenerate: () => void;
  onManual: () => void;
}

/** Step 1 — the exam document, its rubric and its versions (Modelo B, adapted ones, printing for the class). */
export function PrepareStep({ correction, job, running, versionsRunning, onJob, onGenerate, onManual }: Props) {
  const id = correction.activity.id;
  const upload = useUploadDocument(id);
  const retry = useGenerateExam(id);
  const [sent, setSent] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const noAI = useAIUnavailable();  // reading or writing the exam needs the AI
  const docUrl = useDocumentUrl(id);
  const { toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const hasDoc = !!correction.document_url || !!correction.rubric;

  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setSent(0);
    upload.mutate({ files, onProgress: setSent }, {
      onSuccess: ({ job: j }) => onJob(j),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };
  const pick = () => (noAI ? toast(noAI) : input.current?.click());
  const open = (variant: 'print' | 'key' | 'extra-sheet') =>
    openSigned(() => docUrl.mutateAsync(variant), (m) => toast(m, { tone: 'error' }), (m) => toast(m));

  const fileInput = (
    <input ref={input} type="file" hidden multiple accept="application/pdf,image/*"
      onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
  );

  if (running || upload.isPending || retry.isPending) {
    return <>{fileInput}<JobLine job={upload.isPending ? undefined : job} fallback={upload.isPending ? 'Subiendo el examen' : 'Preparando…'}
      sent={upload.isPending ? sent : undefined} /></>;
  }

  // A generation that failed (or ran out of time) stays here with its reason until another job starts.
  const failed = correction.job?.status === 'failed' && correction.job.kind === 'generate_exam' && correction.job.id !== dismissed
    ? correction.job : null;
  const failure = failed && (
    <Callout tone="warn" icon={<Warning size={18} />}>
      <div className="gen-failed">
        <span><b>No se ha podido generar el examen.</b> {failed.error}</span>
        <span className="gen-failed__actions">
          <Button size="sm" disabled={!!noAI} onClick={() => retry.mutate(failed.params as unknown as GenerateInput, {
            onSuccess: ({ job: j }) => onJob(j),
            onError: (e) => toast(e.message, { tone: 'error' }),
          })}>Volver a intentar</Button>
          <Button size="sm" variant="neutral" onClick={() => setDismissed(failed.id)}>Elegir otra opción</Button>
        </span>
      </div>
    </Callout>
  );

  if (!hasDoc) {
    return (
      <>
        {fileInput}
        {failure}
        {!failure && <List className="choice-list">
          <Row lead={<RowIcon tone="accent"><UploadSimple size={20} /></RowIcon>} title="Subir mi examen" wrapSub muted={!!noAI}
            sub={noAI ?? 'PDF o fotos de cada página. Se leen las preguntas, los puntos y las soluciones.'}
            onClick={noAI ? undefined : pick} />
          <Row lead={<RowIcon tone="accent"><PencilLine size={20} /></RowIcon>} title="Generar con IA" wrapSub muted={!!noAI}
            sub={noAI ?? 'Un borrador a partir de las unidades de la programación.'} onClick={noAI ? undefined : onGenerate} />
          <Row lead={<RowIcon><NotePencil size={20} /></RowIcon>} title="Sin documento (solo nota)"
            sub="Pones la nota de cada alumno a mano." wrapSub onClick={onManual} />
        </List>}
      </>
    );
  }

  // A repeat of a generated exam has the rubric, not the file: it is laid out on first print.
  const printable = !!correction.document_url || (correction.generated && !!correction.rubric);
  const rubric = correction.rubric ?? {
    title: '', total: correction.activity.max_score,
    items: [{ id: '1', label: '1', text: '', points: correction.activity.max_score, answer: '', steps: [] }],
  };
  return (
    <>
      {fileInput}
      {failure}
      <List>
        {printable && (
          <Row lead={<RowIcon><Exam size={20} /></RowIcon>} title="Examen para imprimir" wrapSub
            sub={[correction.pages_per_paper && `${plural(correction.pages_per_paper, 'página', 'páginas')} por alumno`,
              correction.exam_code && `cada página lleva la marca ${correction.exam_code}`].filter(Boolean).join(' · ') || 'PDF'}
            trail={<ArrowSquareOut size={18} />} chevron={false} onClick={() => open('print')} />
        )}
        {printable && (
          <Row lead={<RowIcon><Rows size={20} /></RowIcon>} title="Hoja extra" wrapSub
            sub="Folio pautado para quien necesite más espacio, con nombre y número de ejercicio"
            trail={<ArrowSquareOut size={18} />} chevron={false} onClick={() => open('extra-sheet')} />
        )}
        <Row lead={<RowIcon><Key size={20} /></RowIcon>} title="Soluciones" sub="Con la solución y los pasos de cada pregunta"
          trail={<ArrowSquareOut size={18} />} chevron={false} onClick={() => open('key')} />
      </List>
      <Section
        title={correction.rubric ? `Rúbrica · ${plural(rubric.items.length, 'pregunta', 'preguntas')}` : 'Rúbrica'}
        action={
          <Menu trigger={(o) => <IconButton label="Cambiar el examen" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
            items={[
              { label: 'Subir otro examen', icon: <UploadSimple size={18} />, onSelect: pick },
              { label: 'Generar otro con IA', icon: <PencilLine size={18} />, onSelect: () => (noAI ? toast(noAI) : onGenerate()) },
            ]} />
        }
      >
        {!correction.rubric && <p className="muted">No se han podido leer las preguntas. Escríbelas aquí para que la IA pueda sugerir notas.</p>}
        <RubricTable activityId={id} rubric={rubric} maxScore={correction.activity.max_score} generated={correction.generated} />
      </Section>
      {correction.rubric && printable && (
        <VersionsSection correction={correction} job={versionsRunning ? job : undefined} running={versionsRunning} onJob={onJob} />
      )}
    </>
  );
}
