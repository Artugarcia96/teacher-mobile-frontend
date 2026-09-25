import { Exam, Info, Plus, Printer, UsersThree, Warning } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Correction } from '../../api/papers';
import type { Job, StudentRef } from '../../api/types';
import { useClassPrintUrl, useCreateModelB, usePrepareAdapted, useVersions, versionKeys, type Adaptation, type Version, type Versions } from '../../api/versions';
import { plural } from '../../lib/format';
import { AIBadge, Button, Callout, List, Row, RowIcon, Section, Spinner, useFeedback } from '../../ui';
import { measureChips } from '../students/support';
import AssignmentSheet from './AssignmentSheet';
import { JobLine } from './JobLine';
import { openSigned } from './openDoc';
import VersionSheet from './VersionSheet';

interface Props {
  correction: Correction;
  /** The `prepare_versions` job while it runs. */
  job: Job | undefined;
  running: boolean;
  onJob: (job: Job) => void;
}

/** "Mario, Lucía y 9 más" — who takes a version, in list order (a first name two students share gets the surname's
 * initial: "Rubén C., Rubén F."). */
function whoText(ids: string[], byId: Map<string, StudentRef>, max = 3): string {
  const count = new Map<string, number>();
  byId.forEach((s) => count.set(s.first_name, (count.get(s.first_name) ?? 0) + 1));
  const names = ids.flatMap((id) => {
    const s = byId.get(id);
    if (!s) return [];
    return [(count.get(s.first_name) ?? 0) > 1 && s.last_name ? `${s.first_name} ${s.last_name[0]}.` : s.first_name];
  });
  if (!names.length) return 'Sin alumnos';
  if (names.length <= max) return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
  return `${names.slice(0, max).join(', ')} y ${names.length - max} más`;
}

/** What a version row says under its name. */
function versionSub(v: Version, byId: Map<string, StudentRef>) {
  if (v.status === 'generating') return <span className="version-status"><Spinner /> Escribiendo…</span>;
  if (v.status === 'failed') return <span className="version-status version-status--warn"><Warning size={14} /> No se ha podido preparar · ábrela para rehacerla</span>;
  const who = `${plural(v.student_ids.length, 'alumno', 'alumnos')} · ${whoText(v.student_ids, byId)}`;
  if (v.stale) return <span className="version-status version-status--warn"><Warning size={14} /> Escrita para otro modelo A · rehazla</span>;
  return <span className="version-status">{v.draft && <AIBadge />}{who}</span>;
}

/** Under a student with measures: the version they take ("Adaptado · por pasos") or that they still take the class's. */
function adaptationSub(a: Adaptation, vs: Versions) {
  const chips = measureChips(a.student.support).join(' · ');
  const needs = a.measures.some((m) => m === 'letra_ampliada' || m === 'enunciados_por_pasos' || m === 'examen_adaptado' || m === 'acs');
  const version = a.version.kind === 'adaptada' ? a.version.label : needs && vs.versions.some((v) => v.kind === 'adaptada') ? 'Aún con el examen de la clase' : null;
  return <span className="adapt-sub"><span>{chips}</span>{version && <span className="faint">{version}</span>}</span>;
}

/** Preparar › Versiones: Modelo A and the other versions of the exam (Modelo B written by the AI, adapted versions from
 * the class's support measures), who takes each, and «Imprimir para la clase». */
export function VersionsSection({ correction, job, running, onJob }: Props) {
  const id = correction.activity.id;
  const qc = useQueryClient();
  const { data: vs } = useVersions(id);
  const createB = useCreateModelB(id);
  const adapt = usePrepareAdapted(id);
  const classPrint = useClassPrintUrl(id);
  const { toast } = useFeedback();
  const [open, setOpen] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const progress = job?.progress;
  useEffect(() => { // each version appears as soon as it is ready
    if (running) qc.invalidateQueries({ queryKey: versionKeys.all(id) });
  }, [progress, running, qc, id]);

  if (!vs) return null;
  const byId = new Map(correction.students.map((s) => [s.student.id, s.student]));
  const busy = running || createB.isPending || adapt.isPending;
  const hasB = vs.versions.some((v) => v.kind === 'modelo');
  const all = [vs.base, ...vs.versions];
  const pendingVersions = vs.versions.filter((v) => v.status !== 'ready');
  const fail = (e: Error) => toast(e.message, { tone: 'error' });

  const onCreateB = () => createB.mutate(undefined, { onSuccess: ({ job: j }) => onJob(j), onError: fail });
  const onAdapt = () => adapt.mutate(undefined, {
    onSuccess: ({ job: j }) => (j ? onJob(j) : toast('Versiones adaptadas al día')),
    onError: fail,
  });
  const onPrint = () => openSigned(() => classPrint.mutateAsync(), (m) => toast(m, { tone: 'error' }), (m) => toast(m));
  const printBlocked = busy ? 'Espera a que terminen las versiones'
    : pendingVersions.some((v) => v.status === 'failed') ? 'Rehaz o quita las versiones que no se han podido preparar' : undefined;

  return (
    <>
      <Section title="Versiones">
        {running && <JobLine job={job} fallback="Preparando las versiones…" />}
        <List>
          {all.map((v) => (
            <Row key={v.key} lead={<RowIcon tone={v.kind === 'base' ? undefined : 'accent'}><Exam size={20} /></RowIcon>}
              title={v.label} wrapSub onClick={() => setOpen(v.key)}
              sub={v.kind === 'base'
                ? `${plural(v.student_ids.length, 'alumno', 'alumnos')}${vs.versions.length ? ` · ${whoText(v.student_ids, byId)}` : ' · toda la clase'}`
                : versionSub(v, byId)} />
          ))}
          {!hasB && (
            <Row lead={<RowIcon tone="accent"><Plus size={20} /></RowIcon>} title="Añadir modelo B" wrapSub onClick={busy ? undefined : onCreateB}
              sub={busy ? 'Espera a que termine lo que se está preparando' : 'La IA escribe otro examen con las mismas preguntas, puntos y dificultad, y otros datos. Se reparte A, B, A, B… por lista.'}
              muted={busy} />
          )}
          {vs.versions.length > 0 && (
            <Row lead={<RowIcon><UsersThree size={20} /></RowIcon>} title="Cambiar el reparto" wrapSub onClick={() => setAssigning(true)}
              sub="Quién hace cada versión, alumno a alumno" />
          )}
        </List>
      </Section>

      {vs.adaptations.length > 0 && (
        <Section title="Adaptaciones en esta clase"
          footer={vs.pending_adapted > 0 && (
            <div className="versions-action">
              <Button variant="tinted" onClick={onAdapt} loading={adapt.isPending} disabled={running}>
                Preparar versiones adaptadas
              </Button>
              <span className="muted">
                {running ? 'Espera a que terminen las versiones en marcha.'
                  : `${plural(vs.pending_adapted, 'alumno aún no tiene', 'alumnos aún no tienen')} la versión que piden sus medidas.`}
              </span>
            </div>
          )}>
          {vs.reminders.length > 0 && (
            <Callout icon={<Info size={18} />}>
              {vs.reminders.map((r) => `${r.label}: ${whoText(r.students.map((s) => s.id), new Map(r.students.map((s) => [s.id, s])), 6)}`).join(' · ')}
            </Callout>
          )}
          <List>
            {vs.adaptations.map((a) => (
              <Row key={a.student.id} title={a.student.sort_name} wrapSub sub={adaptationSub(a, vs)} />
            ))}
          </List>
        </Section>
      )}

      <div className="versions-action">
        <Button icon={<Printer size={18} />} onClick={onPrint} loading={classPrint.isPending} disabled={!!printBlocked}>
          Imprimir para la clase
        </Button>
        <span className="muted">
          {printBlocked ?? `Un PDF en orden de lista: cada copia con el nombre${vs.versions.length ? ' y la versión' : ''} de su alumno, así al escanear cada hoja vuelve a su dueño.`}
        </span>
      </div>

      <VersionSheet activityId={id} versionKey={open} versions={vs} correction={correction} running={busy}
        onClose={() => setOpen(null)} onJob={onJob} onAssign={() => { setOpen(null); setAssigning(true); }} />
      <AssignmentSheet open={assigning} onClose={() => setAssigning(false)} activityId={id} versions={vs} students={correction.students.map((s) => s.student)} />
    </>
  );
}
