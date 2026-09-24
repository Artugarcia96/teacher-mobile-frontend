import { CaretDown, X } from '@phosphor-icons/react';
import { useState } from 'react';
import { useBulkUnits, useImportUnits } from '../../api/units';
import { plural } from '../../lib/format';
import { Button, IconButton, Sheet, TextArea, useFeedback } from '../../ui';
import './units.css';

interface Proposal { key: number; title: string; term: number | null }

const PLACEHOLDER = `Tema 1. Números enteros
Tema 2. Fracciones
Tema 3. Potencias y raíces
…`;

/** Paste a book index / programación → AI proposes units with evaluación → edit → create. */
export default function ImportUnitsSheet({ open, onClose, courseId }: { open: boolean; onClose: () => void; courseId: string }) {
  if (!open) return null;
  return <ImportUnits onClose={onClose} courseId={courseId} />;
}

function ImportUnits({ onClose, courseId }: { onClose: () => void; courseId: string }) {
  const { toast } = useFeedback();
  const parse = useImportUnits(courseId);
  const bulk = useBulkUnits(courseId);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Proposal[] | null>(null);

  const propose = async () => {
    try {
      const { proposals } = await parse.mutateAsync(text);
      setItems(proposals.map((p, i) => ({ key: i, ...p })));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const valid = (items ?? []).filter((p) => p.title.trim());
  const create = async () => {
    try {
      await bulk.mutateAsync(valid.map((p) => ({ title: p.title.trim(), term: p.term })));
      toast(`${plural(valid.length, 'unidad creada', 'unidades creadas')}`);
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const update = (key: number, patch: Partial<Proposal>) =>
    setItems((xs) => xs && xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  if (!items) {
    return (
      <Sheet open onClose={onClose} title="Importar temario" size="large"
        subtitle="Sepia propone las unidades y reparte las evaluaciones. Podrás revisarlas antes de crearlas."
        footer={<Button full onClick={propose} loading={parse.isPending} disabled={text.trim().length < 3}>
          {text.trim().length < 3 ? 'Pega el índice para continuar' : 'Proponer unidades'}
        </Button>}>
        <TextArea label="Pega el índice del libro o de tu programación" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER} className="import-text" />
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Revisa las unidades" size="large"
      subtitle="Corrige los títulos, elige la evaluación (1.ª, 2.ª, 3.ª) o quita las que sobren."
      footer={<>
        <Button variant="neutral" onClick={() => setItems(null)}>Volver al texto</Button>
        <Button onClick={create} loading={bulk.isPending} disabled={!valid.length}>
          {valid.length ? `Crear ${plural(valid.length, 'unidad', 'unidades')}` : 'No queda ninguna unidad'}
        </Button>
      </>}>
      <div className="list proposals">
        {items.map((p, i) => (
          <div key={p.key} className="proposal">
            <span className="proposal__n num">{i + 1}</span>
            <input className="input proposal__title" value={p.title} aria-label={`Título de la unidad ${i + 1}`}
              onChange={(e) => update(p.key, { title: e.target.value })} />
            <div className="select-wrap proposal__term">
              <select className="select" aria-label="Evaluación" value={p.term ?? ''}
                onChange={(e) => update(p.key, { term: e.target.value ? Number(e.target.value) : null })}>
                <option value="1">1.ª</option>
                <option value="2">2.ª</option>
                <option value="3">3.ª</option>
                <option value="">Sin</option>
              </select>
              <CaretDown size={14} />
            </div>
            <IconButton label="Quitar" size="sm" onClick={() => setItems((xs) => xs && xs.filter((x) => x.key !== p.key))}>
              <X size={16} />
            </IconButton>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
