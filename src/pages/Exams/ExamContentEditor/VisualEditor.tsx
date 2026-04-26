import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { ExamVisual } from '../../../types';

const VISUAL_LABELS: Record<ExamVisual['kind'], string> = {
  clock: 'Reloj',
  empty_clock: 'Reloj vacío',
  number_line: 'Recta numérica',
  object_grid: 'Objetos (contar)',
  shapes: 'Figuras',
  fraction_bar: 'Fracción',
  dot_pattern: 'Puntos',
};

const GRID_OBJECTS = [
  'star', 'apple', 'fish', 'heart', 'flower',
  'sun', 'tree', 'car', 'ball', 'cat', 'dog', 'rabbit',
];

const SHAPE_TYPES = ['circle', 'square', 'triangle', 'star', 'diamond'];
const SHAPE_COLORS = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'];

function visualSummary(v: ExamVisual): string {
  switch (v.kind) {
    case 'clock': return `Reloj ${String(v.hour).padStart(2, '0')}:${String(v.minute).padStart(2, '0')}`;
    case 'empty_clock': return 'Reloj vacío';
    case 'number_line': {
      const extras: string[] = [];
      if (v.highlights?.length) extras.push(`marca ${v.highlights.join(', ')}`);
      if (v.arrow_at !== undefined) extras.push(`flecha en ${v.arrow_at}`);
      return `Recta ${v.min}→${v.max}${extras.length ? ' · ' + extras.join(' · ') : ''}`;
    }
    case 'object_grid': return `${v.count} ${v.object}${v.columns ? ` · ${v.columns} col` : ''}`;
    case 'shapes': return `${v.items.length} figura${v.items.length === 1 ? '' : 's'}`;
    case 'fraction_bar': return `${v.numerator}/${v.denominator}`;
    case 'dot_pattern': return `${v.count} puntos`;
  }
}

// ── Per-kind forms ──────────────────────────────────────────────────

const ClockForm: React.FC<{ value: Extract<ExamVisual, { kind: 'clock' }>; onChange: (v: ExamVisual) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label className="text-xs">Hora</Label>
      <Input
        type="number"
        min={0}
        max={23}
        value={value.hour}
        onChange={(e) => onChange({ ...value, hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
      />
    </div>
    <div>
      <Label className="text-xs">Minuto</Label>
      <Input
        type="number"
        min={0}
        max={59}
        value={value.minute}
        onChange={(e) => onChange({ ...value, minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
      />
    </div>
  </div>
);

const NumberLineForm: React.FC<{ value: Extract<ExamVisual, { kind: 'number_line' }>; onChange: (v: ExamVisual) => void }> = ({ value, onChange }) => {
  const [highlightsText, setHighlightsText] = useState((value.highlights || []).join(', '));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Min</Label>
          <Input type="number" value={value.min} onChange={(e) => onChange({ ...value, min: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">Max</Label>
          <Input type="number" value={value.max} onChange={(e) => onChange({ ...value, max: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <Label className="text-xs">Paso</Label>
          <Input type="number" value={value.step ?? 1} onChange={(e) => onChange({ ...value, step: Number(e.target.value) || 1 })} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Marcas (coma-separadas)</Label>
        <Input
          value={highlightsText}
          onChange={(e) => {
            setHighlightsText(e.target.value);
            const nums = e.target.value
              .split(',')
              .map((s) => Number(s.trim()))
              .filter((n) => !isNaN(n));
            onChange({ ...value, highlights: nums.length ? nums : undefined });
          }}
          placeholder="Ej: 3, 7, 10"
        />
      </div>
      <div>
        <Label className="text-xs">Flecha en (opcional)</Label>
        <Input
          type="number"
          value={value.arrow_at ?? ''}
          onChange={(e) => {
            const n = e.target.value === '' ? undefined : Number(e.target.value);
            onChange({ ...value, arrow_at: n });
          }}
        />
      </div>
    </div>
  );
};

const ObjectGridForm: React.FC<{ value: Extract<ExamVisual, { kind: 'object_grid' }>; onChange: (v: ExamVisual) => void }> = ({ value, onChange }) => (
  <div className="space-y-3">
    <div>
      <Label className="text-xs">Objeto</Label>
      <Select value={value.object} onValueChange={(v) => onChange({ ...value, object: v })}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {GRID_OBJECTS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">Cantidad</Label>
        <Input type="number" min={1} value={value.count} onChange={(e) => onChange({ ...value, count: Math.max(1, Number(e.target.value) || 1) })} />
      </div>
      <div>
        <Label className="text-xs">Columnas</Label>
        <Input type="number" min={1} value={value.columns ?? 5} onChange={(e) => onChange({ ...value, columns: Math.max(1, Number(e.target.value) || 1) })} />
      </div>
    </div>
  </div>
);

const ShapesForm: React.FC<{ value: Extract<ExamVisual, { kind: 'shapes' }>; onChange: (v: ExamVisual) => void }> = ({ value, onChange }) => (
  <div className="space-y-2">
    <Label className="text-xs">Figuras</Label>
    {value.items.map((item, i) => (
      <div key={i} className="flex gap-2 items-center">
        <Select value={item.shape} onValueChange={(v) => {
          const items = [...value.items]; items[i] = { ...items[i], shape: v };
          onChange({ ...value, items });
        }}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SHAPE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={item.color ?? 'blue'} onValueChange={(v) => {
          const items = [...value.items]; items[i] = { ...items[i], color: v };
          onChange({ ...value, items });
        }}>
          <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SHAPE_COLORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ ...value, items: value.items.filter((_, j) => j !== i) })}
          disabled={value.items.length === 1}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    ))}
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      onClick={() => onChange({ ...value, items: [...value.items, { shape: 'circle', color: 'blue' }] })}
    >
      <Plus size={14} className="mr-1" /> Añadir figura
    </Button>
  </div>
);

const FractionForm: React.FC<{ value: Extract<ExamVisual, { kind: 'fraction_bar' }>; onChange: (v: ExamVisual) => void }> = ({ value, onChange }) => (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <Label className="text-xs">Numerador</Label>
      <Input type="number" min={0} value={value.numerator} onChange={(e) => onChange({ ...value, numerator: Math.max(0, Number(e.target.value) || 0) })} />
    </div>
    <div>
      <Label className="text-xs">Denominador</Label>
      <Input type="number" min={1} value={value.denominator} onChange={(e) => onChange({ ...value, denominator: Math.max(1, Number(e.target.value) || 1) })} />
    </div>
  </div>
);

const DotPatternForm: React.FC<{ value: Extract<ExamVisual, { kind: 'dot_pattern' }>; onChange: (v: ExamVisual) => void }> = ({ value, onChange }) => (
  <div>
    <Label className="text-xs">Cantidad</Label>
    <Input type="number" min={1} value={value.count} onChange={(e) => onChange({ ...value, count: Math.max(1, Number(e.target.value) || 1) })} />
  </div>
);

// ── Main component ─────────────────────────────────────────────────

interface VisualEditorProps {
  value: ExamVisual | null | undefined;
  onChange: (v: ExamVisual | null) => void;
}

const VisualEditor: React.FC<VisualEditorProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const renderForm = () => {
    if (!value) return null;
    switch (value.kind) {
      case 'clock': return <ClockForm value={value} onChange={onChange} />;
      case 'empty_clock': return <p className="text-xs text-muted-foreground">Sin parámetros.</p>;
      case 'number_line': return <NumberLineForm value={value} onChange={onChange} />;
      case 'object_grid': return <ObjectGridForm value={value} onChange={onChange} />;
      case 'shapes': return <ShapesForm value={value} onChange={onChange} />;
      case 'fraction_bar': return <FractionForm value={value} onChange={onChange} />;
      case 'dot_pattern': return <DotPatternForm value={value} onChange={onChange} />;
    }
  };

  // This component only handles editing/deleting an EXISTING visual.
  // Adding a new visual is done from the QuestionCard's ⋮ menu.
  if (!value) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-50/50 border border-dashed border-indigo-300">
      <span className="text-xs flex-1 text-indigo-900">
        <span className="font-semibold">Visual:</span> {visualSummary(value)}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" title="Editar parámetros">
            <Pencil size={14} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-3">
            <p className="text-xs font-semibold">Editar {VISUAL_LABELS[value.kind]}</p>
            {renderForm()}
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(null)}
        className="text-red-600 hover:text-red-700"
        title="Eliminar visual"
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
};

export default VisualEditor;
