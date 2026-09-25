import { useEffect, useState } from 'react';
import { useGenerateExam, type Difficulty } from '../../api/papers';
import type { Job } from '../../api/types';
import { useUnits } from '../../api/units';
import { Button, Chip, Segmented, Sheet, Skeleton, Stepper, TextArea, useFeedback } from '../../ui';
import { GroundingList } from '../materials/GroundingList';
import { unitFor } from '../units/unitFor';

interface Props {
  open: boolean;
  onClose: () => void;
  activityId: string;
  courseId: string;
  /** The unit the teacher came from ("Generar examen" in a unit): preselected over anything else. */
  initialUnitId?: string | null;
  /** To preselect the unit of the exam: the one linked to it, else the one its title names, else the current one. */
  activityTitle: string;
  activityUnitIds: string[];
  onJob: (job: Job) => void;
}

const DIFFICULTY: { value: Difficulty; label: string }[] = [
  { value: 'facil', label: 'Fácil' },
  { value: 'medio', label: 'Media' },
  { value: 'dificil', label: 'Difícil' },
];

/** "Generar con IA": units + number of questions + difficulty + one line of instructions. */
export default function GenerateExamSheet({ open, onClose, activityId, courseId, initialUnitId, activityTitle, activityUnitIds, onJob }: Props) {
  const units = useUnits(open ? courseId : undefined);
  const generate = useGenerateExam(activityId);
  const { toast } = useFeedback();
  const [selected, setSelected] = useState<string[]>([]);
  const [n, setN] = useState(6);
  const [difficulty, setDifficulty] = useState<Difficulty>('medio');
  const [instructions, setInstructions] = useState('');

  useEffect(() => {
    if (open) setSelected(initialUnitId ? [initialUnitId] : []);
  }, [open, initialUnitId]);

  useEffect(() => {
    // Preselect the exam's unit when nothing was chosen.
    if (open && !initialUnitId && units.data?.length && selected.length === 0) {
      const id = unitFor(units.data, activityTitle, activityUnitIds);
      if (id) setSelected([id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, units.data]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const hasUnits = !!units.data?.length;

  const submit = () => {
    generate.mutate({ unit_ids: selected, n_items: n, difficulty, instructions: instructions.trim() || undefined }, {
      onSuccess: ({ job }) => { onJob(job); onClose(); },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  return (
    <Sheet open={open} onClose={onClose} dirty={!!instructions.trim()} title="Generar examen con IA"
      subtitle="La IA redacta un borrador con soluciones. Lo revisas antes de imprimir."
      footer={
        <Button onClick={submit} loading={generate.isPending} disabled={hasUnits && selected.length === 0}>
          {hasUnits && selected.length === 0 ? 'Elige al menos una unidad' : 'Generar examen'}
        </Button>
      }>
      <div className="form">
        <div className="field">
          <span className="field__label">Unidades</span>
          {units.isLoading ? <Skeleton h={26} w="70%" /> : hasUnits ? (
            <div className="chip-row">
              {units.data!.map((u) => (
                <Chip key={u.id} selected={selected.includes(u.id)} onClick={() => toggle(u.id)}>{u.title}</Chip>
              ))}
            </div>
          ) : (
            <p className="field__hint">
              {units.isError ? 'No se ha podido cargar la programación.' : 'Esta clase aún no tiene unidades.'} La IA usará el título del examen.
            </p>
          )}
        </div>
        <GroundingList unitIds={selected} what="el examen" />
        <div className="gen-row">
          <span className="field__label">Número de preguntas</span>
          <Stepper label="Número de preguntas" value={n} min={4} max={12} onChange={setN} />
        </div>
        <div className="field">
          <span className="field__label">Dificultad</span>
          <Segmented label="Dificultad" full value={difficulty} options={DIFFICULTY} onChange={setDifficulty} />
        </div>
        <TextArea label="Indicaciones (opcional)" rows={3} maxLength={600} value={instructions}
          onChange={(e) => setInstructions(e.target.value)} placeholder="Por ejemplo: sin calculadora, incluye un problema con recetas." />
      </div>
    </Sheet>
  );
}
