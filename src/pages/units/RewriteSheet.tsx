import { useState } from 'react';
import type { Element } from '../../api/content';
import { Button, Chip, Sheet, TextArea } from '../../ui';

const QUICK = ['Más sencillo', 'Más corto', 'Cambia los datos', 'Añade un paso intermedio', 'Otro ejemplo de la vida diaria'];

/** «Reescribir con IA»: what the teacher wants changed in one element (the AI rewrites it and checks it like a
 *  generated material; 20-60 s, the teacher keeps working). */
export default function RewriteSheet({ el, sending, onSend, onClose }: {
  el: Element; sending: boolean; onSend: (instruction: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const ok = text.trim().length >= 2;
  const what = 'layout' in el ? 'esta diapositiva' : 'este apartado';
  return (
    <Sheet open onClose={onClose} title="Reescribir con IA" dirty={!!text.trim()}
      subtitle={`La IA reescribe ${what} y comprueba las soluciones. Tarda menos de un minuto; puedes seguir trabajando.`}
      footer={<Button full disabled={!ok} loading={sending} onClick={() => ok && !sending && onSend(text.trim())}>
        {ok ? 'Reescribir' : 'Escribe qué quieres cambiar'}
      </Button>}>
      <div className="form">
        <div className="chip-row" role="group" aria-label="Cambios frecuentes">
          {QUICK.map((q) => <Chip key={q} selected={text === q} onClick={() => setText(q)}>{q}</Chip>)}
        </div>
        <TextArea label="Qué quieres cambiar" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} rows={3}
          data-autofocus placeholder="Por ejemplo: usa datos de un partido de baloncesto y quita el último apartado" />
      </div>
    </Sheet>
  );
}
