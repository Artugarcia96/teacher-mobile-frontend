import { useState } from 'react';
import { useAIUnavailable } from '../../api/core';
import { useUploadPapers, type Correction } from '../../api/papers';
import type { Job } from '../../api/types';
import { plural } from '../../lib/format';
import { DropZone, List, Row, Section, Segmented, useFeedback, useMediaQuery } from '../../ui';
import { JobLine } from './JobLine';
import { MissingPapersRow, missingText } from './MissingPapers';
import { ScanPages } from './ScanPages';

interface Props {
  correction: Correction;
  job: Job | undefined;
  /** The pile is being read (upload or «Volver a leer»): pages cannot be edited meanwhile. */
  running: boolean;
  /** The AI is suggesting grades: pages can still be fixed (the grading re-checks them before saving). */
  grading: boolean;
  onJob: (job: Job) => void;
  /** Who is missing from the pile: NP or a repeat exam (ExamAbsencesSheet). */
  onOpenMissing: () => void;
}

type Mode = 'names' | 'list_order';

/** Step 2 — upload the scanned pile; pages are sorted by their printed marker and names matched with the class list. */
export function CollectStep({ correction, job, running, grading, onJob, onOpenMissing }: Props) {
  const upload = useUploadPapers(correction.activity.id);
  const noAI = useAIUnavailable();  // reading the pile needs the AI: do not let a teacher upload 80 MB for a 503
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>('names');
  const [sent, setSent] = useState(0);
  const canDrag = useMediaQuery('(hover: hover) and (pointer: fine)'); // a phone has nothing to drag

  const { stats, students } = correction;
  const busy = running || upload.isPending;
  const pages = students.reduce((n, s) => n + s.pages.length, 0) + correction.unmatched.reduce((n, u) => n + u.pages, 0);
  const blocked = busy ? `Espera a que termine: ${(running && job?.message) || 'subiendo las hojas…'}` : null;

  const onFiles = (files: File[]) => { setSent(0); upload.mutate({ files, mode, onProgress: setSent }, {
    onSuccess: ({ job: j }) => onJob(j),
    onError: (e) => toast(e.message, { tone: 'error' }),
  }); };

  const uploader = (
    <>
      <p className="muted step-lead">
        {correction.named_print
          ? 'Escanea el montón a una o dos caras, o haz fotos, en cualquier orden. Cada copia lleva impreso el nombre del alumno y vuelve sola a su hoja. Los reversos en blanco se descartan.'
          : mode === 'names'
          ? 'Escanea el montón a una o dos caras, o haz fotos. Si lo imprimiste desde Sepia, cada página lleva una marca y el montón se ordena solo, aunque venga desordenado. Los reversos en blanco se descartan.'
          : 'Ordena el montón por apellidos y escanéalo a una o dos caras. Si lo imprimiste desde Sepia, cada página lleva una marca que separa un alumno del siguiente. Los reversos en blanco se descartan.'}
      </p>
      {!correction.named_print && ( // named copies go back to their student by the number printed on them
        <List>
          <Row className="collect-mode" title="Emparejar" wrapSub
            sub={mode === 'names'
              ? 'Se lee el nombre de la cabecera y se compara con tu lista, que no sale de Sepia.'
              : 'Por orden alfabético de apellidos. También se lee el nombre, para avisarte si el orden no cuadra.'}
            trail={<Segmented label="Cómo emparejar" value={mode} onChange={setMode}
              options={[{ value: 'names', label: 'Leer nombres' }, { value: 'list_order', label: 'En orden de lista' }]} />} />
        </List>
      )}
      {!busy && (
        <DropZone onFiles={onFiles} multiple accept="application/pdf,image/*" disabled={!!noAI}
          title={stats.papers ? 'Añadir más hojas' : 'Sube el PDF del escáner o haz fotos del montón'}
          hint={noAI ?? [canDrag && 'También puedes arrastrarlo aquí.',
            stats.papers ? 'Se suman a las que ya has subido.' : 'PDF, JPG o PNG. Puedes subirlas en varias tandas.'].filter(Boolean).join(' ')}
          buttonLabel="Subir hojas" cameraLabel="Hacer fotos" />
      )}
    </>
  );

  return (
    <>
      {busy && <JobLine job={running ? job : undefined} fallback={upload.isPending ? 'Subiendo las hojas' : 'Procesando…'}
        sent={upload.isPending ? sent : undefined} />}
      {grading && !busy && (
        <>
          <JobLine job={job} fallback="Corrigiendo…" />
          <p className="muted step-hint">Mientras, puedes seguir ordenando páginas: la IA no guarda la nota de una hoja que cambies.</p>
        </>
      )}
      {stats.papers === 0 && !busy && correction.unplaced.length === 0 && uploader}
      {stats.papers > 0 && !missingText(correction) && (
        <p className="collect-count">
          <b className="num">{stats.matched} de {students.length}</b> emparejados · {plural(pages, 'página', 'páginas')}
        </p>
      )}
      <MissingPapersRow correction={correction} onOpen={onOpenMissing} />
      <ScanPages correction={correction} blocked={blocked} busy={busy || grading} onJob={onJob} />
      {(stats.papers > 0 || correction.unplaced.length > 0) && !busy && <Section title="Añadir hojas">{uploader}</Section>}
    </>
  );
}
