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
  running: boolean;
  onJob: (job: Job) => void;
}

type Mode = 'names' | 'list_order';

/** Step 2 — upload the scanned pile; pages are sorted by their printed marker and names matched with the class list. */
export function CollectStep({ correction, job, running, onJob }: Props) {
  const upload = useUploadPapers(correction.activity.id);
  const { toast } = useFeedback();
  const [mode, setMode] = useState<Mode>('names');

  const { stats, students } = correction;
  const missing = students.filter((s) => !s.paper_id);
  const busy = running || upload.isPending;
  const pages = students.reduce((n, s) => n + s.pages.length, 0) + correction.unmatched.reduce((n, u) => n + u.pages, 0);

  const onFiles = (files: File[]) => upload.mutate({ files, mode }, {
    onSuccess: ({ job: j }) => onJob(j),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const uploader = (
    <>
      <p className="muted step-lead">
        Fotocopia el mismo examen para todos. Escanea el montón a una o dos caras, o haz fotos, en cualquier orden:
        cada página lleva una marca y se ordena sola. Los reversos en blanco se descartan.
      </p>
      <List>
        <Row className="collect-mode" title="Emparejar" wrapSub
          sub={mode === 'names'
            ? 'Se lee el nombre de la cabecera y se compara con tu lista, que no sale de Sepia.'
            : 'Por orden alfabético de apellidos. Ordena el montón antes de escanear.'}
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
      {busy && <JobLine job={job} fallback={upload.isPending ? 'Subiendo las hojas…' : 'Procesando…'} />}
      {stats.papers === 0 && !busy && correction.unplaced.length === 0 && uploader}
      {stats.papers > 0 && (
        <p className="collect-count">
          <b className="num">{stats.matched} de {students.length}</b> emparejados · {plural(pages, 'página', 'páginas')}
          {missing.length > 0 && missing.length <= 8 && (
            <span className="muted"> · Sin examen: {missing.map((s) => s.student.first_name + ' ' + s.student.last_name.split(' ')[0]).join(', ')}</span>
          )}
        </p>
      )}
      <ScanPages correction={correction} busy={busy} onJob={onJob} />
      {(stats.papers > 0 || correction.unplaced.length > 0) && !busy && <Section title="Añadir hojas">{uploader}</Section>}
    </>
  );
}
