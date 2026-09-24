import { useState } from 'react';
import { useUploadPapers, type Correction } from '../../api/papers';
import type { Job } from '../../api/types';
import { plural } from '../../lib/format';
import { DropZone, List, Row, Section, Segmented, useFeedback } from '../../ui';
import { JobLine } from './JobLine';
import { ScanPages } from './ScanPages';

interface Props {
  correction: Correction;
  job: Job | undefined;
  /** The pile is being read (upload or «Volver a leer»): pages cannot be edited meanwhile. */
  running: boolean;
  /** The AI is suggesting grades: pages can still be fixed (the grading re-checks them before saving). */
  grading: boolean;
  onJob: (job: Job) => void;
}

type Mode = 'names' | 'list_order';

/** Step 2 — upload the scanned pile; pages are sorted by their printed marker and names matched with the class list. */
export function CollectStep({ correction, job, running, grading, onJob }: Props) {
  const upload = useUploadPapers(correction.activity.id);
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>('names');

  const { stats, students } = correction;
  const missing = students.filter((s) => !s.paper_id);
  const busy = running || upload.isPending;
  const pages = students.reduce((n, s) => n + s.pages.length, 0) + correction.unmatched.reduce((n, u) => n + u.pages, 0);
  const blocked = busy ? `Espera a que termine: ${(running && job?.message) || 'subiendo las hojas…'}` : null;

  const onFiles = (files: File[]) => upload.mutate({ files, mode }, {
    onSuccess: ({ job: j }) => onJob(j),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const uploader = (
    <>
      <p className="muted step-lead">
        {mode === 'names'
          ? 'Escanea el montón a una o dos caras, o haz fotos. Si lo imprimiste desde Sepia, cada página lleva una marca y el montón se ordena solo, aunque venga desordenado. Los reversos en blanco se descartan.'
          : 'Ordena el montón por apellidos y escanéalo a una o dos caras. Si lo imprimiste desde Sepia, cada página lleva una marca que separa un alumno del siguiente. Los reversos en blanco se descartan.'}
      </p>
      <List>
        <Row className="collect-mode" title="Emparejar" wrapSub
          sub={mode === 'names'
            ? 'Se lee el nombre de la cabecera y se compara con tu lista, que no sale de Sepia.'
            : 'Por orden alfabético de apellidos. También se lee el nombre, para avisarte si el orden no cuadra.'}
          trail={<Segmented label="Cómo emparejar" value={mode} onChange={setMode}
            options={[{ value: 'names', label: 'Leer nombres' }, { value: 'list_order', label: 'En orden de lista' }]} />} />
      </List>
      {!busy && (
        <DropZone onFiles={onFiles} multiple accept="application/pdf,image/*"
          title={stats.papers ? 'Añadir más hojas' : 'Arrastra aquí el PDF del escáner o las fotos'}
          hint={stats.papers ? 'Se suman a las que ya has subido.' : 'PDF, JPG o PNG. Puedes subirlas en varias tandas.'}
          buttonLabel="Subir hojas" cameraLabel="Hacer fotos" />
      )}
    </>
  );

  return (
    <>
      {busy && <JobLine job={running ? job : undefined} fallback={upload.isPending ? 'Subiendo las hojas…' : 'Procesando…'} />}
      {grading && !busy && (
        <>
          <JobLine job={job} fallback="Corrigiendo…" />
          <p className="muted step-hint">Mientras, puedes seguir ordenando páginas: la IA no guarda la nota de una hoja que cambies.</p>
        </>
      )}
      {stats.papers === 0 && !busy && correction.unplaced.length === 0 && uploader}
      {stats.papers > 0 && (
        <p className="collect-count">
          <b className="num">{stats.matched} de {students.length}</b> emparejados · {plural(pages, 'página', 'páginas')}
          {missing.length > 0 && missing.length <= 8 && (
            <span className="muted"> · Sin examen: {missing.map((s) => s.student.first_name + ' ' + s.student.last_name.split(' ')[0]).join(', ')}</span>
          )}
        </p>
      )}
      <ScanPages correction={correction} blocked={blocked} busy={busy || grading} onJob={onJob} />
      {(stats.papers > 0 || correction.unplaced.length > 0) && !busy && <Section title="Añadir hojas">{uploader}</Section>}
    </>
  );
}
