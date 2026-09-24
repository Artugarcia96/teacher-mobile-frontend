import { ArrowSquareOut, DotsThree, Exam, Key, NotePencil, PencilLine, Rows, UploadSimple } from '@phosphor-icons/react';
import { useRef } from 'react';
import { useDocumentUrl, useUploadDocument, type Correction } from '../../api/papers';
import type { Job } from '../../api/types';
import { plural } from '../../lib/format';
import { IconButton, List, Menu, Row, RowIcon, Section, useFeedback } from '../../ui';
import { JobLine } from './JobLine';
import { openSigned } from './openDoc';
import { RubricTable } from './RubricTable';

interface Props {
  correction: Correction;
  job: Job | undefined;
  running: boolean;
  onJob: (job: Job) => void;
  onGenerate: () => void;
  onManual: () => void;
}

/** Step 1 — the exam document and its rubric. */
export function PrepareStep({ correction, job, running, onJob, onGenerate, onManual }: Props) {
  const id = correction.activity.id;
  const upload = useUploadDocument(id);
  const docUrl = useDocumentUrl(id);
  const { toast } = useFeedback();
  const input = useRef<HTMLInputElement>(null);
  const hasDoc = !!correction.document_url || !!correction.rubric;

  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    upload.mutate(files, {
      onSuccess: ({ job: j }) => onJob(j),
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };
  const open = (variant: 'print' | 'key' | 'extra-sheet') => openSigned(() => docUrl.mutateAsync(variant), (m) => toast(m, { tone: 'error' }));

  const fileInput = (
    <input ref={input} type="file" hidden multiple accept="application/pdf,image/*"
      onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
  );

  if (running || upload.isPending) {
    return <>{fileInput}<JobLine job={job} fallback={upload.isPending ? 'Subiendo el examen…' : 'Preparando…'} /></>;
  }

  if (!hasDoc) {
    return (
      <>
        {fileInput}
        <List className="choice-list">
          <Row lead={<RowIcon tone="accent"><UploadSimple size={20} /></RowIcon>} title="Subir mi examen"
            sub="PDF o fotos de cada página. Se leen las preguntas, los puntos y las soluciones." wrapSub
            onClick={() => input.current?.click()} />
          <Row lead={<RowIcon tone="accent"><PencilLine size={20} /></RowIcon>} title="Generar con IA"
            sub="Un borrador a partir de las unidades de la programación." wrapSub onClick={onGenerate} />
          <Row lead={<RowIcon><NotePencil size={20} /></RowIcon>} title="Sin documento (solo nota)"
            sub="Pones la nota de cada alumno a mano." wrapSub onClick={onManual} />
        </List>
      </>
    );
  }

  const rubric = correction.rubric ?? {
    title: '', total: correction.activity.max_score,
    items: [{ id: '1', label: '1', text: '', points: correction.activity.max_score, answer: '', steps: [] }],
  };
  return (
    <>
      {fileInput}
      <List>
        {correction.document_url && (
          <Row lead={<RowIcon><Exam size={20} /></RowIcon>} title="Examen para imprimir" wrapSub
            sub={[correction.pages_per_paper && `${plural(correction.pages_per_paper, 'página', 'páginas')} por alumno`,
              correction.exam_code && `cada página lleva la marca ${correction.exam_code}`].filter(Boolean).join(' · ') || 'PDF'}
            trail={<ArrowSquareOut size={18} />} chevron={false} onClick={() => open('print')} />
        )}
        {correction.document_url && (
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
              { label: 'Subir otro examen', icon: <UploadSimple size={18} />, onSelect: () => input.current?.click() },
              { label: 'Generar otro con IA', icon: <PencilLine size={18} />, onSelect: onGenerate },
            ]} />
        }
        footer={correction.generated ? 'Al guardar se actualiza también el PDF para imprimir.' : undefined}
      >
        {!correction.rubric && <p className="muted">No se han podido leer las preguntas. Escríbelas aquí para que la IA pueda sugerir notas.</p>}
        <RubricTable activityId={id} rubric={rubric} maxScore={correction.activity.max_score} />
      </Section>
    </>
  );
}
