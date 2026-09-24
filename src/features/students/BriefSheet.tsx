import { Copy } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useStudentBrief } from '../../api/core';
import { AIBadge, Button, Callout, SkeletonList, Sheet, useFeedback } from '../../ui';
import './students.css';

/** "Preparar tutoría": AI draft of talking points for a family meeting. */
export default function BriefSheet({ open, onClose, studentId, name }: { open: boolean; onClose: () => void; studentId: string; name: string }) {
  const { toast } = useFeedback();
  const brief = useStudentBrief(studentId);
  const { mutate, reset } = brief;

  useEffect(() => {
    if (open) mutate();
    else reset();
  }, [open, mutate, reset]);

  const copy = async () => {
    const text = (brief.data?.bullets ?? []).map((b) => `- ${b}`).join('\n');
    try {
      await navigator.clipboard.writeText(`Tutoría · ${name}\n${text}`);
      toast('Copiado');
    } catch {
      toast('No se ha podido copiar', { tone: 'error' });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Preparar tutoría" subtitle={name}
      footer={brief.data ? <Button full variant="tinted" icon={<Copy size={18} />} onClick={copy}>Copiar</Button> : undefined}>
      {brief.isPending && <SkeletonList rows={4} />}
      {brief.error && (
        <div className="form">
          <Callout tone="warn">{brief.error.message}</Callout>
          <Button variant="tinted" onClick={() => mutate()}>Reintentar</Button>
        </div>
      )}
      {brief.data && (
        <div className="brief">
          <AIBadge />
          <ul className="brief__list">
            {brief.data.bullets.map((b) => <li key={b}>{b}</li>)}
          </ul>
          <p className="field__hint">Hecho con sus notas, asistencia y observaciones. Revísalo antes de la reunión.</p>
        </div>
      )}
    </Sheet>
  );
}
