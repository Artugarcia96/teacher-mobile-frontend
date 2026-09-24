import { DotsThree, Trash } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useAssignPaper, useDeletePaper, useSuggest, useUploadPapers, type Correction } from '../../api/papers';
import type { Job } from '../../api/types';
import { fileUrl } from '../../lib/api';
import { plural } from '../../lib/format';
import { Chip, DropZone, IconButton, Lightbox, List, Menu, Row, Section, Segmented, Stepper, useFeedback } from '../../ui';
import { JobLine } from './JobLine';
import StudentPickerSheet from './StudentPickerSheet';

interface Props {
  correction: Correction;
  job: Job | undefined;
  running: boolean;
  onJob: (job: Job) => void;
}

type Mode = 'names' | 'list_order';

/** Step 2 — upload the scanned pile; names are read and matched with the class list. */
export function CollectStep({ correction, job, running, onJob }: Props) {
  const id = correction.activity.id;
  const upload = useUploadPapers(id);
  const assign = useAssignPaper(id);
  const remove = useDeletePaper(id);
  const suggest = useSuggest(id);
  const { toast, confirm } = useFeedback();
  const [perPaper, setPerPaper] = useState(correction.pages_per_paper || 1);
  const [mode, setMode] = useState<Mode>('names');
  const [picker, setPicker] = useState<{ paperId: string; thumb: string | null; detected: string | null } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  useEffect(() => { if (correction.pages_per_paper) setPerPaper(correction.pages_per_paper); }, [correction.pages_per_paper]);

  const { stats, students, unmatched } = correction;
  const toConfirm = students.filter((s) => s.paper_id && s.match_status === 'suggested');
  const missing = students.filter((s) => !s.paper_id);
  const busy = running || upload.isPending;
  const byId = new Map(students.map((s) => [s.student.id, s.student]));

  const onFiles = (files: File[]) => upload.mutate({ files, pagesPerPaper: perPaper, mode }, {
    onSuccess: ({ job: j }) => onJob(j),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const doAssign = (paperId: string, studentId: string) => {
    const target = students.find((s) => s.student.id === studentId);
    const final = ['confirmed', 'absent', 'exempt'].includes(target?.grade?.status ?? '');
    // New pages for this student → ask the AI again (never over a confirmed grade).
    const needsSuggestion = !!correction.rubric && !final && (!target?.grade || (!!target.paper_id && target.paper_id !== paperId));
    assign.mutate({ paperId, studentId }, {
      onSuccess: () => {
        toast(`Hoja asignada a ${byId.get(studentId)?.name ?? 'el alumno'}`);
        if (needsSuggestion) suggest.mutate([studentId], { onSuccess: ({ job: j }) => onJob(j) });
      },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const discard = async (paperId: string) => {
    if (!(await confirm({ title: 'Descartar esta hoja', text: 'Se borran sus páginas escaneadas.', confirm: 'Descartar', danger: true }))) return;
    remove.mutate(paperId, { onSuccess: () => toast('Hoja descartada'), onError: (e) => toast(e.message, { tone: 'error' }) });
  };

  const thumb = (url: string | null, label: string, wide = false) => url ? (
    <button type="button" className={`paper-thumb${wide ? ' paper-thumb--wide' : ''}`} onClick={() => setViewer(url)} aria-label={`Ver ${label}`}>
      <img src={fileUrl(url)} alt="" loading="lazy" />
    </button>
  ) : null;

  const uploader = (
    <>
      <p className="muted step-lead">Fotocopia el mismo examen para todos. Después escanea el montón en la copistería o haz fotos, en cualquier orden.</p>
      <List>
        <Row title="Páginas por examen" sub={correction.pages_per_paper ? 'Tomado del examen original' : undefined}
          trail={<Stepper label="Páginas por examen" value={perPaper} min={1} max={20} onChange={setPerPaper} />} />
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
      {stats.papers === 0 && !busy && uploader}
      {stats.papers > 0 && (
        <p className="collect-count">
          <b className="num">{stats.matched} de {students.length}</b> emparejados · {plural(stats.papers, 'hoja', 'hojas')}
          {missing.length > 0 && missing.length <= 8 && (
            <span className="muted"> · Sin examen: {missing.map((s) => s.student.first_name + ' ' + s.student.last_name.split(' ')[0]).join(', ')}</span>
          )}
        </p>
      )}

      {unmatched.length > 0 && (
        <Section title={`Sin identificar · ${unmatched.length}`}>
          <List inset={16}>
            {unmatched.map((u) => (
              <Row key={u.paper_id} className="tray-row" lead={thumb(u.thumb_url, 'la cabecera')}
                title={u.detected_name ? <span>Parece: <i>{u.detected_name}</i></span> : 'Nombre ilegible'}
                wrapSub
                sub={
                  <div className="tray-sub">
                  {thumb(u.thumb_url, 'la cabecera', true)}
                  <div className="chip-row tray-chips">
                    {u.candidates.map((c) => (
                      <Chip key={c.id} tone="outline" onClick={() => doAssign(u.paper_id, c.id)}>{c.first_name} {c.last_name.split(' ')[0]}</Chip>
                    ))}
                    <Chip onClick={() => setPicker({ paperId: u.paper_id, thumb: u.thumb_url, detected: u.detected_name })}>Otro…</Chip>
                  </div>
                  </div>
                }
                trail={
                  <Menu trigger={(o) => <IconButton label="Más" size="sm" onClick={o}><DotsThree size={20} weight="bold" /></IconButton>}
                    items={[{ label: 'Descartar hoja', icon: <Trash size={18} />, danger: true, onSelect: () => discard(u.paper_id) }]} />
                }
              />
            ))}
          </List>
        </Section>
      )}

      {toConfirm.length > 0 && (
        <Section title={`Por confirmar · ${toConfirm.length}`}>
          <List inset={16}>
            {toConfirm.map((s) => (
              <Row key={s.paper_id} className="tray-row" lead={thumb(s.thumb_url, 'la cabecera')}
                title={s.student.name}
                wrapSub
                sub={
                  <div className="tray-sub">
                    {thumb(s.thumb_url, 'la cabecera', true)}
                    {s.detected_name && <span className="muted">Se lee «{s.detected_name}»</span>}
                    <div className="chip-row tray-chips">
                      <Chip tone="accent" onClick={() => doAssign(s.paper_id!, s.student.id)}>Es correcto</Chip>
                      <Chip onClick={() => setPicker({ paperId: s.paper_id!, thumb: s.thumb_url, detected: s.detected_name })}>Cambiar</Chip>
                    </div>
                  </div>
                }
              />
            ))}
          </List>
        </Section>
      )}

      {stats.papers > 0 && !busy && <Section title="Añadir hojas">{uploader}</Section>}

      <StudentPickerSheet open={!!picker} onClose={() => setPicker(null)} students={students}
        thumbUrl={picker?.thumb} detected={picker?.detected}
        onPick={(sid) => picker && doAssign(picker.paperId, sid)} />
      {viewer && <Lightbox images={[fileUrl(viewer)!]} index={0} onIndex={() => {}} onClose={() => setViewer(null)} label="Hoja escaneada" />}
    </>
  );
}
