import { CaretDown, FileArrowUp, X } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { useBulkUnits, useImportUnits, useImportUnitsFile } from '../../api/units';
import { plural } from '../../lib/format';
import { Button, Callout, IconButton, Sheet, TextArea, useFeedback } from '../../ui';
import './units.css';

interface Proposal { key: number; title: string; term: number | null }

const PLACEHOLDER = `Tema 1. Números enteros
Tema 2. Fracciones
Tema 3. Potencias y raíces
…`;

/** Paste a book index / programación, or choose its file → AI proposes units with evaluación → edit → create. */
export default function ImportUnitsSheet({ open, onClose, courseId }: { open: boolean; onClose: () => void; courseId: string }) {
  if (!open) return null;
  return <ImportUnits onClose={onClose} courseId={courseId} />;
}

function ImportUnits({ onClose, courseId }: { onClose: () => void; courseId: string }) {
  const { toast } = useFeedback();
  const parse = useImportUnits(courseId);
  const parseFile = useImportUnitsFile(courseId);
  const bulk = useBulkUnits(courseId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const reading = parse.isPending || parseFile.isPending;
  const show = ({ proposals, warning }: { proposals: { title: string; term: number | null }[]; warning: string | null }) => {
    setItems(proposals.map((p, i) => ({ key: i, ...p })));
    setWarning(warning);
  };
  const propose = async () => {
    if (reading) return;
    try {
      show(await parse.mutateAsync(text));
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };
  const fromFile = async (file: File) => {
    try {
      show(await parseFile.mutateAsync(file));
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
        footer={<Button full onClick={propose} loading={reading} disabled={text.trim().length < 3 || reading}>
          {reading ? 'Leyendo el temario…' : text.trim().length < 3 ? 'Pega el índice o elige el archivo' : 'Proponer unidades'}
        </Button>}>
        <div className="form">
          <Button variant="neutral" icon={<FileArrowUp size={18} />} loading={parseFile.isPending} disabled={reading}
            onClick={() => fileInput.current?.click()}>Elegir el archivo de la programación</Button>
          <input ref={fileInput} type="file" hidden accept=".pdf,.docx,.pptx,.txt,.md"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void fromFile(f); }} />
          <TextArea label="O pega el índice del libro o de tu programación" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER} className="import-text" />
        </div>
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
      <div className="form">
        {warning && <Callout tone="warn">{warning}</Callout>}
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
      </div>
    </Sheet>
  );
}
