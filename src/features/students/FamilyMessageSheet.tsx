/** «Avisar a la familia»: mensaje editable hecho con los hechos (faltas con fecha, suspensos, incidencias; sin IA).
 *  «Copiar y guardar» lo copia para pegarlo en la plataforma del centro o en un correo, deja los hechos como observación
 *  «Familia» y quita al alumno de «A vigilar» hasta que haya algo nuevo. La observación se guarda una sola vez: si el
 *  navegador no deja copiar, el texto queda seleccionado y el botón pasa a «Copiar» (solo portapapeles). */
import { Copy } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useFamilyMessage, useSaveFamilyNote } from '../../api/today';
import type { CourseRef, StudentRef } from '../../api/types';
import { Button, Sheet, SkeletonList, TextArea, useFeedback } from '../../ui';
import './students.css';

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
  const [saved, setSaved] = useState(false);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (text === null && q.data) setText(q.data.text);
  }, [q.data, text]);

  const copy = async (message: string) => {
    try {
      await navigator.clipboard.writeText(message);
      return true;
    } catch {
      return false;
    }
  };
  const selectText = () => requestAnimationFrame(() => area.current?.querySelector('textarea')?.select());

  const submit = async () => {
    const message = (text ?? '').trim();
    if (saved) {  // the note is already there: only copy
      if (await copy(message)) { toast('Mensaje copiado'); onClose(); } else { toast('No se ha podido copiar: selecciona el texto y cópialo a mano.', { tone: 'error' }); selectText(); }
      return;
    }
    const copied = await copy(message);
    try {
      await save.mutateAsync({ studentId: student.id, courseId: course.id, text: message });
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
      return;
    }
    setSaved(true);
    if (copied) {
      toast('Mensaje copiado y guardado en observaciones');
      onClose();
    } else {
      toast('Guardado en observaciones. No se ha podido copiar: selecciona el texto y cópialo a mano.', { tone: 'error' });
      selectText();
    }
  };

  const empty = !(text ?? '').trim();
  const dirty = !saved && text !== null && !!q.data && text !== q.data.text;
  // Tall enough to read the whole message without an inner scroll (about 44 characters per line on a phone).
  const rows = Math.max(10, (text ?? '').split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 44)), 1));
  return (
    <Sheet open side dirty={dirty} onClose={onClose} title="Avisar a la familia" subtitle={`${student.name} · ${course.label}`}
      footer={<Button full icon={<Copy size={18} />} onClick={submit} loading={save.isPending} disabled={empty}
        title={empty ? 'Escribe el mensaje' : undefined}>{saved ? 'Copiar' : 'Copiar y guardar'}</Button>}>
      {q.error ? <p className="muted">{(q.error as Error).message}</p> : text === null ? <SkeletonList rows={4} /> : (
        <div className="form" ref={area}>
          <TextArea aria-label="Mensaje para la familia" className="family-text" rows={rows} value={text} maxLength={4000}
            onChange={(e) => setText(e.target.value)} />
          <p className="field__hint">{saved ? 'Guardado en observaciones. Copia el texto y pégalo en la plataforma del centro o en un correo.'
            : <>Revísalo y pégalo en la plataforma del centro o en un correo. Los hechos quedan como observación «Familia» y
              {' '}{student.first_name} sale de «A vigilar» hasta que haya algo nuevo.</>}</p>
        </div>
      )}
    </Sheet>
  );
}
