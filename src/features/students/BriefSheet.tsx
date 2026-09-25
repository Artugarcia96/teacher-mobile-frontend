import { ArrowClockwise, Copy } from '@phosphor-icons/react';
import { useEditStudentBrief, useStudentBrief } from '../../api/core';
import { AIBadge, Button, Callout, Sheet, Skeleton, TextArea, useFeedback } from '../../ui';
import './students.css';

const LINES = ['92%', '78%', '86%', '64%', '81%'];

/** "Preparar tutoría": AI draft of the points for a family meeting. It is kept (with the teacher's edits) until the
 *  student's data changes; «Copiar» copies exactly the text on screen. */
export default function BriefSheet({ open, onClose, studentId, name }: { open: boolean; onClose: () => void; studentId: string; name: string }) {
  const { toast, confirm } = useFeedback();
  const brief = useStudentBrief(studentId, open);
  const edit = useEditStudentBrief(studentId);
  const draft = brief.isFetching ? undefined : brief.data;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft!.text);
      toast('Copiado');
    } catch {
      toast('No se ha podido copiar. Selecciona el texto y cópialo a mano.', { tone: 'error' });
    }
  };
  const redo = async () => {
    if (draft?.edited && !(await confirm({ title: 'Rehacer el borrador', text: 'Se pierden los cambios que has hecho.', confirm: 'Rehacer', danger: true }))) return;
    brief.refetch();
  };
  // Tall enough to read it all without an inner scroll (about 44 characters per line on a phone).
  const rows = draft ? draft.text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 44)), 1) : 0;

  return (
    <Sheet open={open} onClose={onClose} title="Preparar tutoría" subtitle={name}
      footer={draft ? <>
        <Button variant="neutral" icon={<ArrowClockwise size={18} />} onClick={redo}>Rehacer</Button>
        <Button icon={<Copy size={18} />} onClick={copy} disabled={!draft.text.trim()} title={draft.text.trim() ? undefined : 'El borrador está vacío'}>Copiar</Button>
      </> : undefined}>
      {brief.isFetching ? (
        <div className="brief" aria-busy>
          <div className="brief__lines">{LINES.map((w) => <Skeleton key={w} h={14} w={w} />)}</div>
          <p className="field__hint">Preparando el borrador con sus notas, asistencia y observaciones. Puedes cerrar: seguirá aquí.</p>
        </div>
      ) : brief.error ? (
        <div className="form">
          <Callout tone="warn">{brief.error.message}</Callout>
          <Button variant="tinted" onClick={() => brief.refetch()}>Reintentar</Button>
        </div>
      ) : draft && (
        <div className="brief">
          <AIBadge />
          <TextArea aria-label="Borrador para la tutoría" className="brief__text" rows={rows} value={draft.text} maxLength={4000}
            onChange={(e) => edit(e.target.value)} />
          <p className="field__hint">Hecho con sus notas, asistencia y observaciones. Revísalo antes de la reunión.</p>
        </div>
      )}
    </Sheet>
  );
}
