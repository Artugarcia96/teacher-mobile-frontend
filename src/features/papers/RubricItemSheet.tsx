import { useEffect, useState } from 'react';
import type { RubricItem } from '../../api/papers';
import { formatNumber } from '../../lib/format';
import { Button, RichText, Stepper, TextArea, useFeedback } from '../../ui';
import { Sheet } from '../../ui';

interface Props {
  item: RubricItem | null;
  onClose: () => void;
  onSave: (patch: Partial<RubricItem>) => void;
  onDelete?: () => void;
}

/** Edit one question of the rubric (statement, points, expected answer). Saved with the whole rubric. */
export default function RubricItemSheet({ item, onClose, onSave, onDelete }: Props) {
  const { confirm } = useFeedback();
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [points, setPoints] = useState(1);

  useEffect(() => {
    if (!item) return;
    setText(item.text);
    setAnswer(item.answer);
    setPoints(item.points);
  }, [item]);

  const remove = async () => {
    if (await confirm({ title: 'Quitar esta pregunta', text: 'Deja de contar en la rúbrica al guardar.', confirm: 'Quitar', danger: true })) onDelete?.();
  };

  return (
    <Sheet open={!!item} onClose={onClose} title={`Pregunta ${item?.label || item?.id || ''}`}
      footer={<>
        {onDelete && <Button variant="danger" onClick={remove}>Quitar</Button>}
        <Button onClick={() => onSave({ text: text.trim(), answer: answer.trim(), points })}>Hecho</Button>
      </>}>
      <div className="form">
        <TextArea label="Enunciado" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          hint="Las fórmulas van entre $…$, por ejemplo $\frac{3}{4}$." />
        {text.includes('$') && <div className="rubric-preview"><RichText text={text} /></div>}
        <div className="gen-row">
          <span className="field__label">Puntos</span>
          <Stepper label="Puntos" value={points} min={0.25} max={100} step={0.25} format={(v) => formatNumber(v, 2)} onChange={setPoints} />
        </div>
        <TextArea label="Solución" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div>
    </Sheet>
  );
}
