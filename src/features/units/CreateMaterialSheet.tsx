import { CheckCircle, Circle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Level } from '../../api/content';
import { useAIUnavailable } from '../../api/core';
import { useLibrary } from '../../api/library';
import { useGenerateMaterial, type GenKind, type Material, type Unit } from '../../api/units';
import { List, Row, RowIcon, Segmented, Select, Sheet, Stepper, TextArea, Button, useFeedback } from '../../ui';
import { GroundingList } from '../materials/GroundingList';
import { watchJob } from '../materials/watch';
import { failedText, MaterialIcon, readyText, withArticle } from './kinds';
import './units.css';

export const KINDS: { kind: GenKind; title: string; sub: string; verb: string }[] = [
  { kind: 'notes', title: 'Apuntes', sub: 'Teoría con ejemplos resueltos y actividades', verb: 'Crear apuntes' },
  { kind: 'worksheet', title: 'Ficha', sub: 'Ejercicios por niveles con solucionario', verb: 'Crear ficha' },
  { kind: 'slides', title: 'Presentación', sub: 'Diapositivas para proyectar y PowerPoint editable', verb: 'Crear presentación' },
  { kind: 'summary', title: 'Resumen', sub: 'Una página para repasar', verb: 'Crear resumen' },
  { kind: 'adapted', title: 'Lectura fácil', sub: 'Los apuntes con lenguaje sencillo (NEAE)', verb: 'Crear lectura fácil' },
];

type LevelChoice = Level | 'todos';
const LEVELS: { value: LevelChoice; label: string }[] = [
  { value: 'todos', label: 'Todos' }, { value: 'refuerzo', label: 'Refuerzo' }, { value: 'basico', label: 'Básica' },
  { value: 'avanzado', label: 'Ampliación' },
];

const PLACEHOLDER: Record<GenKind, string> = {
  notes: 'Por ejemplo: sigue el orden del libro y usa ejemplos de la vida diaria',
  worksheet: 'Por ejemplo: problemas con datos de la vida diaria, sin calculadora',
  slides: 'Por ejemplo: para una clase de 50 minutos, con una pregunta para empezar',
  summary: 'Por ejemplo: en forma de esquema',
  adapted: 'Por ejemplo: para un alumno con dislexia',
};

export interface CreateMaterialSheetProps {
  open: boolean;
  onClose: () => void;
  unit: Unit;
  /** The unit's materials: its apuntes are a source of the ficha, the presentación and the lectura fácil. */
  materials: Material[];
  courseId: string;
  /** Prefilled choice (a ficha de refuerzo with what an exam showed). */
  initial?: { kind: GenKind; level?: Level; instructions?: string };
}

/** «Crear con IA»: what (5 kinds), from what (the unit's files, its outline in the temario, an optional guide) and a
 *  few options. The material appears in the unit at once with its progress; the teacher keeps working meanwhile. */
export default function CreateMaterialSheet(props: CreateMaterialSheetProps) {
  if (!props.open) return null;
  return <CreateMaterial {...props} />;
}

function CreateMaterial({ onClose, unit, materials, courseId, initial }: CreateMaterialSheetProps) {
  const { toast } = useFeedback();
  const generate = useGenerateMaterial(unit.id);
  const noAI = useAIUnavailable();
  const [kind, setKind] = useState<GenKind>(initial?.kind ?? 'notes');
  const [level, setLevel] = useState<LevelChoice>(initial?.level ?? 'todos');
  const [nItems, setNItems] = useState(10);
  const [sessions, setSessions] = useState(1);
  const [guide, setGuide] = useState('');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const notes = materials.find((m) => m.kind === 'notes' && m.status === 'ready');
  const uploads = useLibrary({ courseId, kinds: ['upload'] });
  const guides = (uploads.data ?? []).filter((m) => m.text_status !== 'reading' && m.text_status !== 'failed');
  const chosen = KINDS.find((k) => k.kind === kind)!;

  const submit = async () => {
    if (generate.isPending) return;
    try {
      const { material, job } = await generate.mutateAsync({
        kind, instructions: instructions.trim(),
        ...(guide ? { guide_material_id: guide } : {}),
        ...(kind === 'worksheet' ? { n_items: nItems, ...(level !== 'todos' ? { level } : {}) } : {}),
        ...((kind === 'notes' || kind === 'slides') && sessions > 1 ? { sessions } : {}),
      });
      watchJob({
        job: job.id, kind: 'material', done: readyText(material, unit.title),
        failed: failedText(material, unit.title),
        path: `/clases/${courseId}/unidades/${unit.id}/materiales/${material.id}`,
      });
      toast(`Creando ${withArticle(material)}. Puedes seguir trabajando: Sepia avisa al terminar.`);
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  return (
    <Sheet open onClose={onClose} title="Crear con IA" size="large" dirty={instructions.trim() !== (initial?.instructions ?? '').trim()}
      subtitle="Un borrador que revisas antes de usarlo. Tarda unos minutos; mientras, puedes seguir trabajando."
      footer={<Button full onClick={submit} loading={generate.isPending} disabled={!!noAI}>{noAI ?? chosen.verb}</Button>}>
      <div className="form">
        <div tabIndex={-1} data-autofocus className="kind-list">
          <List>
            {KINDS.map((k) => {
              const selected = kind === k.kind;
              return (
                <Row key={k.kind} className={selected ? 'kind-row kind-row--on' : 'kind-row'}
                  lead={<RowIcon tone={selected ? 'accent' : undefined}><MaterialIcon kind={k.kind} /></RowIcon>}
                  title={k.title} sub={k.sub} wrapSub chevron={false} onClick={() => setKind(k.kind)}
                  trail={selected ? <CheckCircle size={22} weight="fill" className="kind-row__check" /> : <Circle size={22} className="kind-row__radio" />}
                  aria-label={k.title} />
              );
            })}
          </List>
        </div>

        {kind === 'worksheet' && (
          <>
            <div className="field">
              <span className="field__label">Nivel</span>
              <Segmented full label="Nivel de la ficha" value={level} onChange={setLevel} options={LEVELS} />
              <span className="field__hint">
                {level === 'todos' ? 'Refuerzo, básico y ampliación en la misma ficha, de menos a más.' : 'Todos los ejercicios de ese nivel.'}
              </span>
            </div>
            <div className="option-line">
              <span>Ejercicios</span>
              <Stepper label="Número de ejercicios" value={nItems} onChange={setNItems} min={4} max={15} />
            </div>
          </>
        )}
        {(kind === 'notes' || kind === 'slides') && (
          <div className="option-line">
            <span>Sesiones de clase</span>
            <Stepper label="Sesiones de clase" value={sessions} onChange={setSessions} min={1} max={6}
              format={(n) => (n === 1 ? 'Una' : String(n))} />
          </div>
        )}

        <GroundingList unitIds={[unit.id]} what="el material" ownOnly label="Lo que leerá la IA" />
        <ul className="create-sources">
          {unit.summary?.trim() && <li><b>Temario:</b> el guion de la unidad («{clip(unit.summary)}»)</li>}
          {notes && kind !== 'notes' && kind !== 'summary' && (
            <li><b>Apuntes de la unidad:</b> {kind === 'adapted' ? 'los adapta' : 'no repite sus ejemplos'}</li>
          )}
          <li>Las unidades de antes y de después, para no solaparse</li>
        </ul>

        {guides.length > 0 && (
          <Select label="Seguir una guía (opcional)" value={guide} onChange={(e) => setGuide(e.target.value)}
            hint="Tu programación o una guía docente subida a la clase: la IA sigue sus indicaciones.">
            <option value="">Ninguna</option>
            {guides.map((m) => <option key={m.id} value={m.id}>{m.title}{m.unit ? ` (${m.unit.title})` : ''}</option>)}
          </Select>
        )}

        <TextArea label="Indicaciones (opcional)" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={1500}
          rows={2} placeholder={PLACEHOLDER[kind]} />
      </div>
    </Sheet>
  );
}

function clip(text: string, n = 90) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
