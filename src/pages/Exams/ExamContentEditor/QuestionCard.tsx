import { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  MoreVertical,
  Plus,
  Circle,
  CheckCircle2,
  ListChecks,
  AlignLeft,
  Sparkles,
  GripVertical,
  X,
} from 'lucide-react';
import type {
  ExamQuestion,
  ExamAnswerSpace,
  ExamOption,
  ExamSubquestion,
} from '../../../types';
import MathText from './MathText';
import MathToolbar from './MathToolbar';
import VisualEditor from './VisualEditor';

const ANSWER_SPACES: { value: ExamAnswerSpace; label: string }[] = [
  { value: 'small',      label: 'Pequeño' },
  { value: 'medium',     label: 'Medio' },
  { value: 'large',      label: 'Grande' },
  { value: 'number_box', label: 'Caja numérica' },
  { value: 'drawing',    label: 'Dibujo' },
];

// Strip math + truncate for preview lines.
function previewText(text: string, max = 110): string {
  if (!text) return '';
  const stripped = text.replace(/\$\$[\s\S]*?\$\$/g, '·').replace(/\$[^$]*\$/g, '·').replace(/\s+/g, ' ').trim();
  return stripped.length > max ? stripped.slice(0, max - 1) + '…' : stripped;
}

// ── Textarea with cursor-aware math insertion ─────────────────────────

interface AutoTextareaHandle {
  insertAtCursor: (text: string, caretBack?: number) => void;
}

interface AutoTextareaProps {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  minRows?: number;
  apiRef?: React.MutableRefObject<AutoTextareaHandle | null>;
}

const AutoTextarea: React.FC<AutoTextareaProps> = ({
  value, onChange, onBlur, placeholder, autoFocus, minRows = 2, apiRef,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minRows * 24)}px`;
  }, [value, minRows]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      insertAtCursor: (text: string, caretBack = 0) => {
        const el = ref.current;
        if (!el) return;
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? value.length;
        const next = value.slice(0, start) + text + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => {
          el.focus();
          const caret = start + text.length - caretBack;
          el.setSelectionRange(caret, caret);
        });
      },
    };
    return () => { if (apiRef) apiRef.current = null; };
  }, [value, onChange, apiRef]);

  return (
    <Textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rows={minRows}
      className="resize-none w-full font-[inherit]"
    />
  );
};

// ── Editable text: click to edit, blur to save, with optional math bar ──

interface EditableTextProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  withMathToolbar?: boolean;
  className?: string;
  autoEdit?: boolean;
}

const EditableText: React.FC<EditableTextProps> = ({
  value, onChange, placeholder, multiline = true, withMathToolbar = false, className, autoEdit = false,
}) => {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(value);
  const apiRef = useRef<AutoTextareaHandle | null>(null);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (editing && multiline) {
    return (
      <div className="space-y-1.5">
        {withMathToolbar && (
          <MathToolbar onInsert={(t, back) => apiRef.current?.insertAtCursor(t, back)} />
        )}
        <AutoTextarea
          apiRef={apiRef}
          value={draft}
          onChange={setDraft}
          onBlur={() => { onChange(draft); setEditing(false); }}
          placeholder={placeholder}
          autoFocus
        />
      </div>
    );
  }
  if (editing && !multiline) {
    return (
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onChange(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setDraft(value); setEditing(false); }
        }}
        placeholder={placeholder}
        autoFocus
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`ece-editable ${className || ''}`}
    >
      {value
        ? <MathText text={value} />
        : <span className="ece-editable__placeholder">{placeholder || 'Click para editar'}</span>}
    </button>
  );
};

// ── MCQ Options editor ─────────────────────────────────────────────────

const OptionsEditor: React.FC<{
  options: ExamOption[];
  onChange: (opts: ExamOption[]) => void;
}> = ({ options, onChange }) => {
  const toggleCorrect = (i: number) => {
    onChange(options.map((o, j) => j === i ? { ...o, correct: !o.correct } : o));
  };
  return (
    <div className="space-y-1">
      {options.map((opt, i) => (
        <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 group">
          <button
            type="button"
            onClick={() => toggleCorrect(i)}
            className="mt-1 flex-shrink-0"
            title={opt.correct ? 'Quitar como correcta' : 'Marcar como correcta'}
          >
            {opt.correct
              ? <CheckCircle2 size={18} className="text-green-600" />
              : <Circle size={18} className="text-muted-foreground" />
            }
          </button>
          <span className="text-sm font-semibold text-muted-foreground mt-1 w-5">{opt.label || String.fromCharCode(65 + i)}</span>
          <div className="flex-1 min-w-0">
            <EditableText
              value={opt.text}
              onChange={(t) => onChange(options.map((o, j) => j === i ? { ...o, text: t } : o))}
              placeholder="Texto de la opción"
              withMathToolbar
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            disabled={options.length <= 2}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600 flex-shrink-0"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => {
          const nextLabel = String.fromCharCode(65 + options.length);
          onChange([...options, { label: nextLabel, text: '', correct: false }]);
        }}
      >
        <Plus size={14} className="mr-1" /> Añadir opción
      </Button>
    </div>
  );
};

// ── Subquestion row ────────────────────────────────────────────────────

const SubquestionRow: React.FC<{
  sub: ExamSubquestion;
  index: number;
  total: number;
  onChange: (sub: ExamSubquestion) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}> = ({ sub, index, total, onChange, onDelete, onMove }) => (
  <div className="ece-subq">
    <div className="ece-subq__row">
      <span className="ece-subq__label">{sub.label})</span>
      <div className="ece-subq__body">
        <EditableText
          value={sub.text}
          onChange={(t) => onChange({ ...sub, text: t })}
          placeholder="Enunciado del apartado"
          withMathToolbar
        />
        <div className="ece-subq__meta">
          <Input
            type="number"
            step={0.25}
            min={0}
            value={sub.points ?? 0}
            onChange={(e) => onChange({ ...sub, points: Number(e.target.value) || 0 })}
            className="h-7 w-14 text-xs"
            title="Puntos"
          />
          <span>pts</span>
          <Select
            value={sub.answer_space ?? 'small'}
            onValueChange={(v) => onChange({ ...sub, answer_space: v as ExamAnswerSpace })}
          >
            <SelectTrigger className="h-7 w-auto min-w-[5.5rem] text-xs" title="Espacio para responder">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANSWER_SPACES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="ece-subq__actions">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} title="Mover arriba">
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} title="Mover abajo">
          <ChevronDown size={14} />
        </button>
        <button type="button" onClick={onDelete} className="is-danger" title="Eliminar apartado">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  </div>
);

// ── Inline AI mini-prompt ──────────────────────────────────────────────
// Lives inside the expanded card. Lets the teacher say "esta pregunta más
// fácil" / "cambia los números" without leaving the editor or re-opening
// the full re-prompt sheet. Calls back to the parent which knows how to
// preserve all OTHER questions and only regenerate this one.

const InlineAIPrompt: React.FC<{
  loading: boolean;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}> = ({ loading, onSubmit, onClose }) => {
  const [text, setText] = useState('');
  const submit = () => {
    const v = text.trim();
    if (!v || loading) return;
    onSubmit(v);
    setText('');
  };
  return (
    <div className="ece-ai-prompt" onClick={(e) => e.stopPropagation()}>
      <Sparkles size={14} className="ece-ai-prompt__icon" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === 'Escape') onClose();
        }}
        placeholder="Pídele a la IA que cambie esta pregunta…"
        autoFocus
        disabled={loading}
        className="h-8 text-sm border-0 bg-transparent shadow-none focus-visible:ring-0 px-1"
      />
      <Button size="sm" onClick={submit} disabled={!text.trim() || loading} className="h-7 px-2.5 text-xs">
        {loading ? 'Aplicando…' : 'Aplicar'}
      </Button>
      <button type="button" onClick={onClose} className="ece-ai-prompt__close" aria-label="Cerrar">
        <X size={14} />
      </button>
    </div>
  );
};

// ── QuestionCard ───────────────────────────────────────────────────────

export interface QuestionCardProps {
  question: ExamQuestion;
  displayIndex: string;
  anchorId?: string;
  onChange: (q: ExamQuestion) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onAIIterate?: (questionId: string, instruction: string) => Promise<void>;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  isFirst: boolean;
  isLast: boolean;
  readOnly?: boolean;
  dirty?: boolean;
  /** When true, the card opens expanded (used for newly added questions). */
  defaultExpanded?: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  displayIndex,
  anchorId,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  onAIIterate,
  onDragStart,
  onDragOver,
  onDrop,
  isFirst,
  isLast,
  readOnly,
  dirty,
  defaultExpanded,
}) => {
  const isMCQ = question.type === 'mcq';
  const hasVisual = !!question.visual;
  // Empty new questions auto-expand. Existing ones start collapsed so the
  // teacher can SCAN the whole exam without scrolling 20 screens.
  const [expanded, setExpanded] = useState<boolean>(
    !!defaultExpanded || !question.text,
  );
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAILoading] = useState(false);

  const setIsMCQ = (nextIsMCQ: boolean) => {
    if (nextIsMCQ === isMCQ) return;
    if (nextIsMCQ) {
      onChange({
        ...question,
        type: 'mcq',
        options: question.options?.length ? question.options : [
          { label: 'A', text: '', correct: false },
          { label: 'B', text: '', correct: false },
        ],
      });
    } else {
      onChange({
        ...question,
        type: 'computational',
        options: undefined,
      });
    }
  };

  const updateSub = (i: number, patch: ExamSubquestion) => {
    const subs = [...(question.subquestions || [])];
    subs[i] = patch;
    onChange({ ...question, subquestions: subs });
  };

  const moveSub = (i: number, dir: -1 | 1) => {
    const subs = [...(question.subquestions || [])];
    const target = i + dir;
    if (target < 0 || target >= subs.length) return;
    [subs[i], subs[target]] = [subs[target], subs[i]];
    subs.forEach((s, idx) => { s.label = String.fromCharCode(97 + idx); });
    onChange({ ...question, subquestions: subs });
  };

  const deleteSub = (i: number) => {
    const subs = (question.subquestions || []).filter((_, j) => j !== i);
    subs.forEach((s, idx) => { s.label = String.fromCharCode(97 + idx); });
    onChange({ ...question, subquestions: subs.length ? subs : undefined });
  };

  const addSub = () => {
    const subs = [...(question.subquestions || [])];
    const label = String.fromCharCode(97 + subs.length);
    subs.push({ label, text: '', points: 0, answer_space: 'small' });
    onChange({ ...question, subquestions: subs });
  };

  const handleAISubmit = async (instruction: string) => {
    if (!onAIIterate) return;
    setAILoading(true);
    try {
      await onAIIterate(question.id, instruction);
      setShowAI(false);
    } finally {
      setAILoading(false);
    }
  };

  const subCount = question.subquestions?.length ?? 0;
  const optCount = isMCQ ? (question.options?.length ?? 0) : 0;

  // ── Collapsed row (default for non-empty questions) ────────────────
  if (!expanded) {
    return (
      <div
        className={`ece-question ece-question--collapsed group ${dirty ? 'ece-question--dirty' : ''}`}
        data-qid={anchorId}
        draggable={!readOnly && !!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="ece-question__row"
          onClick={() => setExpanded(true)}
          aria-label="Editar pregunta"
        >
          {!readOnly && (
            <span className="ece-question__grip" title="Arrastra para reordenar">
              <GripVertical size={14} />
            </span>
          )}
          <span className="ece-question__id">{displayIndex}</span>
          <span className="ece-question__preview">
            {question.text
              ? previewText(question.text)
              : <span className="ece-editable__placeholder">Sin enunciado · click para editar</span>}
          </span>
          <span className="ece-question__chips">
            {isMCQ && (
              <span className="ece-question__chip ece-question__chip--test" title="Tipo test">
                <ListChecks size={11} /> Test
              </span>
            )}
            {subCount > 0 && (
              <span className="ece-question__chip" title={`${subCount} apartados`}>
                {subCount} apartados
              </span>
            )}
            {optCount > 0 && (
              <span className="ece-question__chip" title={`${optCount} opciones`}>
                {optCount} opciones
              </span>
            )}
            {(question.points ?? 0) > 0 && (
              <span className="ece-question__chip ece-question__chip--pts">{question.points} pts</span>
            )}
          </span>
        </button>
        <div className="ece-question__row-actions" onClick={(e) => e.stopPropagation()}>
          {!readOnly && onAIIterate && (
            <button
              type="button"
              className="ece-question__ai-btn"
              onClick={() => { setExpanded(true); setShowAI(true); }}
              title="Cambiar con IA"
            >
              <Sparkles size={14} />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={readOnly} title="Más opciones" className="h-7 w-7 p-0">
                <MoreVertical size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => setExpanded(true)}>
                <AlignLeft size={15} className="mr-2" /> Editar a mano
              </DropdownMenuItem>
              {onAIIterate && (
                <DropdownMenuItem onClick={() => { setExpanded(true); setShowAI(true); }}>
                  <Sparkles size={15} className="mr-2" /> Cambiar con IA
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMove(-1)} disabled={isFirst}>
                <ChevronUp size={15} className="mr-2" /> Mover arriba
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(1)} disabled={isLast}>
                <ChevronDown size={15} className="mr-2" /> Mover abajo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy size={15} className="mr-2" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                <Trash2 size={15} className="mr-2" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // ── Expanded card ─────────────────────────────────────────────────
  // Drag is intentionally DISABLED when expanded — the teacher is editing
  // text/inputs and we don't want a stray drag to interrupt selection.
  // Reorder happens from the collapsed view (or via the menu).
  return (
    <div
      className={`ece-question ece-question--expanded group ${dirty ? 'ece-question--dirty' : ''}`}
      data-qid={anchorId}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="ece-question__header">
        <span className="ece-question__id">{displayIndex}</span>

        {isMCQ && (
          <span className="ece-question__chip ece-question__chip--test" title="Tipo test">
            <ListChecks size={11} /> Test
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5 flex-shrink-0">
          {!readOnly && onAIIterate && !showAI && (
            <button
              type="button"
              className="ece-question__ai-btn"
              onClick={() => setShowAI(true)}
              title="Cambiar con IA"
            >
              <Sparkles size={14} />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={readOnly} title="Más opciones" className="h-7 w-7 p-0">
                <MoreVertical size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => setIsMCQ(false)}>
                <AlignLeft size={15} className="mr-2" />
                <span className="flex-1">Respuesta abierta</span>
                {!isMCQ && <CheckCircle2 size={14} className="text-emerald-600" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsMCQ(true)}>
                <ListChecks size={15} className="mr-2" />
                <span className="flex-1">Tipo test</span>
                {isMCQ && <CheckCircle2 size={14} className="text-emerald-600" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onMove(-1)} disabled={isFirst}>
                <ChevronUp size={15} className="mr-2" /> Mover arriba
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(1)} disabled={isLast}>
                <ChevronDown size={15} className="mr-2" /> Mover abajo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy size={15} className="mr-2" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
                <Trash2 size={15} className="mr-2" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!readOnly && (
            <button
              type="button"
              onClick={() => { setExpanded(false); setShowAI(false); }}
              className="ece-question__collapse-btn"
              title="Contraer"
              aria-label="Contraer"
            >
              <ChevronUp size={15} />
            </button>
          )}
        </div>
      </div>

      {showAI && onAIIterate && (
        <div className="mb-2">
          <InlineAIPrompt
            loading={aiLoading}
            onSubmit={handleAISubmit}
            onClose={() => setShowAI(false)}
          />
        </div>
      )}

      <div className="ece-question__body">
        {readOnly ? (
          <MathText text={question.text} />
        ) : (
          <EditableText
            value={question.text}
            onChange={(t) => onChange({ ...question, text: t })}
            placeholder="Escribe el enunciado. Usa la barra de símbolos para fórmulas."
            withMathToolbar
            autoEdit={!question.text}
          />
        )}
      </div>

      {hasVisual && !readOnly && (
        <div className="mt-3">
          <VisualEditor
            value={question.visual}
            onChange={(v) => onChange({ ...question, visual: v })}
          />
        </div>
      )}

      {isMCQ && question.options && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Opciones — marca la(s) correcta(s)
          </p>
          <OptionsEditor
            options={question.options}
            onChange={(opts) => onChange({ ...question, options: opts })}
          />
        </div>
      )}

      {!isMCQ && (
        <div className="mt-2">
          {question.subquestions && question.subquestions.length > 0 && (
            <div className="space-y-0">
              {question.subquestions.map((sub, i) => (
                <SubquestionRow
                  key={i}
                  sub={sub}
                  index={i}
                  total={question.subquestions!.length}
                  onChange={(s) => updateSub(i, s)}
                  onDelete={() => deleteSub(i)}
                  onMove={(dir) => moveSub(i, dir)}
                />
              ))}
            </div>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={addSub}
              className="inline-flex items-center gap-1 mt-2 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-indigo-600 transition-colors"
            >
              <Plus size={13} /> Añadir apartado
            </button>
          )}
        </div>
      )}

      {/* Footer compacto: puntos + espacio. Solo visible cuando la card está
          expandida — antes era una fila siempre presente que sumaba altura
          inútil cuando el profe solo quería leer. */}
      {!readOnly && (
        <div className="ece-question__footer">
          <span className="ece-question__footer-label">Puntos</span>
          <Input
            type="number"
            step={0.25}
            min={0}
            value={question.points ?? 0}
            onChange={(e) => onChange({ ...question, points: Number(e.target.value) || 0 })}
            className="h-7 w-16 text-xs"
          />
          {!isMCQ && !question.subquestions?.length && (
            <>
              <span className="ece-question__footer-label">Espacio</span>
              <Select
                value={question.answer_space ?? 'medium'}
                onValueChange={(v) => onChange({ ...question, answer_space: v as ExamAnswerSpace })}
              >
                <SelectTrigger className="h-7 w-auto min-w-[6rem] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANSWER_SPACES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
export { EditableText };
