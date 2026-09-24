import { DotsThree } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Block, NotesDoc } from '../../api/units';
import { Button, IconButton, Menu, RichText, Sheet, Spinner, TextArea } from '../../ui';

const LABEL: Partial<Record<Block['type'], string>> = { definition: 'Definición', example: 'Ejemplo', formula: 'Fórmulas', note: 'Atención' };

interface Props {
  doc: NotesDoc;
  /** Block being rewritten by the AI (shows a spinner over it). */
  busyId?: string | null;
  saving?: boolean;
  onSaveBlock: (block: Block) => Promise<unknown>;
  onRewrite: (blockId: string, instruction: string) => void;
}

/** Reading view of apuntes / resumen / lectura fácil, styled like the PDF. Each block can be edited or rewritten. */
export default function NotesView({ doc, busyId, saving, onSaveBlock, onRewrite }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  let n = 0;

  return (
    <article className="reading">
      {doc.objectives.length > 0 && (
        <div className="reading__objectives">
          <div className="reading__label">Al terminar la unidad sabrás</div>
          <ul>{doc.objectives.map((o, i) => <li key={i}><RichText text={o} /></li>)}</ul>
        </div>
      )}
      {doc.sections.map((sec) => (
        <section key={sec.id} className="reading__section">
          <h2>{sec.title}</h2>
          {sec.blocks.map((b) => {
            const number = b.type === 'exercise' ? ++n : 0;
            return editing === b.id ? (
              <BlockEditor key={b.id} block={b} saving={saving} onCancel={() => setEditing(null)}
                onSave={async (nb) => { await onSaveBlock(nb); setEditing(null); }} />
            ) : (
              <div key={b.id} className={`nblock nblock--${b.type}${busyId === b.id ? ' nblock--busy' : ''}`}>
                <BlockBody block={b} number={number} />
                <div className="nblock__menu">
                  <Menu
                    trigger={(open) => <IconButton size="sm" label="Opciones del apartado" onClick={open}><DotsThree size={18} weight="bold" /></IconButton>}
                    items={[
                      { label: 'Editar', onSelect: () => setEditing(b.id) },
                      { label: 'Más sencillo', onSelect: () => onRewrite(b.id, 'Hazlo más sencillo y más corto, para alumnos con dificultades.'), separatorBefore: true },
                      { label: 'Añadir un ejemplo', onSelect: () => onRewrite(b.id, 'Añade un ejemplo concreto y cercano a los alumnos.') },
                      { label: 'Reescribir…', onSelect: () => setAsking(b.id) },
                    ]}
                  />
                </div>
                {busyId === b.id && <div className="nblock__spinner"><Spinner /></div>}
              </div>
            );
          })}
        </section>
      ))}
      {doc.self_check.length > 0 && (
        <section className="reading__section">
          <h2>Autoevaluación</h2>
          <ol className="reading__check">{doc.self_check.map((q, i) => <li key={i}><RichText text={q} /></li>)}</ol>
        </section>
      )}
      <RewriteSheet blockId={asking} onClose={() => setAsking(null)} onSubmit={(id, text) => { setAsking(null); onRewrite(id, text); }} />
    </article>
  );
}

function BlockBody({ block: b, number }: { block: Block; number: number }) {
  const [open, setOpen] = useState(false);
  const label = LABEL[b.type];
  if (b.type === 'exercise') {
    return (
      <div className="nblock__exercise">
        <span className="nblock__num num">{number}</span>
        <div>
          <RichText as="div" text={b.text} />
          {b.solution && (
            <>
              <Button size="sm" variant="plain" className="nblock__toggle" onClick={() => setOpen(!open)}>{open ? 'Ocultar solución' : 'Ver solución'}</Button>
              {open && <div className="nblock__solution"><RichText text={b.solution} /></div>}
            </>
          )}
        </div>
      </div>
    );
  }
  const showTitle = b.title && b.title.toLowerCase() !== (label ?? '').toLowerCase();
  return (
    <>
      {label && <div className="nblock__label">{label}{showTitle ? `: ${b.title}` : ''}</div>}
      {!label && b.title && <div className="nblock__title">{b.title}</div>}
      {b.text && <RichText as="p" text={b.text} />}
      {b.items.length > 0 && <ul>{b.items.map((it, i) => <li key={i}><RichText text={it} /></li>)}</ul>}
      {b.type === 'example' && b.solution && (
        <>
          <Button size="sm" variant="plain" className="nblock__toggle" onClick={() => setOpen(!open)}>{open ? 'Ocultar resolución' : 'Resolución'}</Button>
          {open && <div className="nblock__solution"><RichText text={b.solution} /></div>}
        </>
      )}
    </>
  );
}

function BlockEditor({ block, saving, onSave, onCancel }: { block: Block; saving?: boolean; onSave: (b: Block) => void; onCancel: () => void }) {
  const [text, setText] = useState(block.text);
  const [items, setItems] = useState(block.items.join('\n'));
  const [solution, setSolution] = useState(block.solution);
  const hasSolution = block.type === 'example' || block.type === 'exercise';
  return (
    <div className="nblock nblock--editing">
      {(block.text || !block.items.length) && (
        <TextArea label={block.type === 'exercise' ? 'Enunciado' : 'Texto'} value={text} onChange={(e) => setText(e.target.value)}
          hint="Las fórmulas van entre $…$, por ejemplo $\frac{3}{4}$" />
      )}
      {block.items.length > 0 && (
        <TextArea label="Puntos (uno por línea)" value={items} onChange={(e) => setItems(e.target.value)} />
      )}
      {hasSolution && <TextArea label={block.type === 'exercise' ? 'Solución' : 'Resolución'} value={solution} onChange={(e) => setSolution(e.target.value)} />}
      <div className="nblock__edit-actions">
        <Button size="sm" variant="neutral" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" loading={saving}
          onClick={() => onSave({ ...block, text, solution, items: items.split('\n').map((x) => x.trim()).filter(Boolean) })}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

function RewriteSheet({ blockId, onClose, onSubmit }: { blockId: string | null; onClose: () => void; onSubmit: (id: string, text: string) => void }) {
  const [text, setText] = useState('');
  const ok = text.trim().length >= 3;
  return (
    <Sheet open={!!blockId} onClose={onClose} title="Reescribir apartado"
      footer={<Button full disabled={!ok} onClick={() => { onSubmit(blockId!, text.trim()); setText(''); }}>{ok ? 'Reescribir' : 'Escribe qué quieres cambiar'}</Button>}>
      <TextArea label="¿Qué quieres cambiar?" value={text} onChange={(e) => setText(e.target.value)} maxLength={600}
        placeholder="Por ejemplo: explícalo con un ejemplo de deporte y quita la segunda frase" />
    </Sheet>
  );
}
