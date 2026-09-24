/** «Avisar a la familia»: mensaje editable hecho con los hechos (faltas con fecha, suspensos, incidencias; sin IA).
 *  «Copiar» para pegarlo en la plataforma del centro o en un correo; «Guardar como observación» lo archiva como
 *  observación «Familia» y quita al alumno de «A vigilar» hasta que haya algo nuevo. */
import { Copy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useFamilyMessage, useSaveFamilyNote } from '../../api/today';
import type { CourseRef, StudentRef } from '../../api/types';
import { Button, Sheet, SkeletonList, TextArea, useFeedback } from '../../ui';
import './notes.css';

export interface FamilyMessageSheetProps {
  open: boolean;
  onClose: () => void;
  student: StudentRef;
  course: CourseRef;
}

export default function FamilyMessageSheet(props: FamilyMessageSheetProps) {
  if (!props.open) return null;
  return <MessageBody key={`${props.student.id}|${props.course.id}`} {...props} />;
}

function MessageBody({ onClose, student, course }: FamilyMessageSheetProps) {
  const { toast } = useFeedback();
  const q = useFamilyMessage(student.id, course.id);
  const save = useSaveFamilyNote();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (text === null && q.data) setText(q.data.text);
  }, [q.data, text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      toast('Mensaje copiado');
    } catch {
      toast('No se ha podido copiar. Selecciona el texto y cópialo a mano.', { tone: 'error' });
    }
  };

  const submit = async () => {
    try {
      await save.mutateAsync({ studentId: student.id, courseId: course.id, text: (text ?? '').trim() });
      toast('Guardado en observaciones (Familia)');
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const empty = !(text ?? '').trim();
  // Tall enough to read the whole message without an inner scroll (about 44 characters per line on a phone).
  const rows = Math.max(10, (text ?? '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 44)), 1));
  return (
    <Sheet open side onClose={onClose} title="Avisar a la familia" subtitle={`${student.name} · ${course.label}`}
      footer={<>
        <Button variant="neutral" icon={<Copy size={18} />} onClick={copy} disabled={empty}>Copiar</Button>
        <Button onClick={submit} loading={save.isPending} disabled={empty} title={empty ? 'Escribe el mensaje' : undefined}>
          Guardar como observación
        </Button>
      </>}>
      {q.error ? <p className="muted">{(q.error as Error).message}</p> : text === null ? <SkeletonList rows={4} /> : (
        <div className="form">
          <TextArea aria-label="Mensaje para la familia" className="family-text" rows={rows} value={text} maxLength={4000}
            onChange={(e) => setText(e.target.value)} />
          <p className="field__hint">Revísalo antes de enviarlo por la plataforma del centro o por correo. Al guardarlo, queda como observación
            «Familia» y {student.first_name} sale de «A vigilar» hasta que haya algo nuevo.</p>
        </div>
      )}
    </Sheet>
  );
}
