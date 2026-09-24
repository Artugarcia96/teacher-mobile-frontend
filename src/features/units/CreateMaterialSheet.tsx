import { CheckCircle, Circle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useGenerateMaterial, type Difficulty, type GenKind, type Material, type WorksheetKind } from '../../api/units';
import { List, Row, RowIcon, Segmented, Sheet, Stepper, TextField, Button, useFeedback } from '../../ui';
import { MaterialIcon } from './kinds';
import './units.css';

const KINDS: { kind: GenKind; title: string; sub: string }[] = [
  { kind: 'notes', title: 'Apuntes', sub: '3-5 páginas con ejemplos y ejercicios resueltos' },
  { kind: 'slides', title: 'Presentación', sub: '10-14 diapositivas, PowerPoint editable' },
  { kind: 'summary', title: 'Resumen', sub: 'Una página para repasar' },
  { kind: 'adapted', title: 'Lectura fácil', sub: 'Versión adaptada de los apuntes (NEAE)' },
  { kind: 'worksheet', title: 'Ficha', sub: 'Ejercicios con solucionario' },
];

export interface CreateMaterialSheetProps {
  open: boolean;
  onClose: () => void;
  unitId: string;
  /** Latest ready apuntes of the unit (source for "Lectura fácil"). */
  notesId?: string | null;
  onCreated?: (material: Material) => void;
}

/** "Crear con IA": pick one of 5 kinds + a few options. The material appears in the unit with a spinner. */
export default function CreateMaterialSheet(props: CreateMaterialSheetProps) {
  if (!props.open) return null;
  return <CreateMaterial {...props} />;
}

function CreateMaterial({ onClose, unitId, notesId, onCreated }: CreateMaterialSheetProps) {
  const { toast } = useFeedback();
  const generate = useGenerateMaterial(unitId);
  const [kind, setKind] = useState<GenKind>('notes');
  const [length, setLength] = useState<'breve' | 'normal'>('normal');
  const [wk, setWk] = useState<WorksheetKind>('refuerzo');
  const [nItems, setNItems] = useState(6);
  const [difficulty, setDifficulty] = useState<Difficulty>('medio');
  const [instructions, setInstructions] = useState('');

  const submit = async () => {
    try {
      const { material } = await generate.mutateAsync({
        kind, instructions: instructions.trim(),
        ...(kind === 'notes' || kind === 'slides' ? { length } : {}),
        ...(kind === 'worksheet' ? { worksheet_kind: wk, n_items: nItems, difficulty } : {}),
        ...(kind === 'adapted' && notesId ? { from_material_id: notesId } : {}),
      });
      toast('Creando el material. Aparecerá en la unidad en unos segundos.');
      onCreated?.(material);
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  return (
    <Sheet open onClose={onClose} title="Crear con IA"
      subtitle="Usa el título de la unidad y los archivos que hayas subido. Es un borrador: podrás revisarlo y editarlo."
      footer={<Button full onClick={submit} loading={generate.isPending}>Crear</Button>}>
      <div className="form">
        <div tabIndex={-1} data-autofocus className="kind-list">
        <List>
          {KINDS.map((k) => {
            const disabled = k.kind === 'adapted' && !notesId;
            const selected = kind === k.kind;
            return (
              <Row key={k.kind} className={selected ? 'kind-row kind-row--on' : 'kind-row'}
                lead={<RowIcon tone={selected ? 'accent' : undefined}><MaterialIcon kind={k.kind} /></RowIcon>}
                title={k.title}
                sub={disabled ? 'Crea antes los apuntes de la unidad' : k.sub}
                wrapSub muted={disabled} chevron={false}
                onClick={disabled ? undefined : () => setKind(k.kind)}
                trail={disabled ? undefined : selected
                  ? <CheckCircle size={22} weight="fill" className="kind-row__check" />
                  : <Circle size={22} className="kind-row__radio" />}
                aria-label={k.title}
              />
            );
          })}
        </List>
        </div>

        {(kind === 'notes' || kind === 'slides') && (
          <div className="field">
            <span className="field__label">Extensión</span>
            <Segmented full label="Extensión" value={length} onChange={setLength}
              options={[{ value: 'breve', label: 'Breve' }, { value: 'normal', label: 'Normal' }]} />
          </div>
        )}

        {kind === 'worksheet' && (
          <>
            <div className="field">
              <span className="field__label">Tipo de ficha</span>
              <Segmented full label="Tipo de ficha" value={wk} onChange={setWk}
                options={[{ value: 'refuerzo', label: 'Refuerzo' }, { value: 'practica', label: 'Práctica' }, { value: 'ampliacion', label: 'Ampliación' }]} />
            </div>
            <div className="field">
              <span className="field__label">Dificultad</span>
              <Segmented full label="Dificultad" value={difficulty} onChange={setDifficulty}
                options={[{ value: 'facil', label: 'Fácil' }, { value: 'medio', label: 'Media' }, { value: 'dificil', label: 'Difícil' }]} />
            </div>
            <div className="option-line">
              <span>Número de ejercicios</span>
              <Stepper label="Número de ejercicios" value={nItems} onChange={setNItems} min={4} max={12} />
            </div>
          </>
        )}

        <TextField label="Indicaciones (opcional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={600}
          placeholder={kind === 'worksheet' ? 'Por ejemplo: problemas de la vida diaria' : 'Por ejemplo: más ejemplos de la vida diaria'} />
      </div>
    </Sheet>
  );
}
