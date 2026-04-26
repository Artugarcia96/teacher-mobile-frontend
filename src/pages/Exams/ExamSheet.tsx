import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  Plus,
  Check,
  Clock,
  History,
  Download,
  X,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  ExternalLink,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import MathText from './ExamContentEditor/MathText';
import type {
  ExamContent,
  ExamQuestion,
  ExamSubquestion,
  ExamOption,
  ExamIterationHistoryItem,
} from '../../types';
import './ExamSheet.css';

/* ═══════════════════════════════════════════════════════════════════════════
   EXAM SHEET — unified preview + inline editor.
   Cada pregunta arranca COLAPSADA mostrando solo enunciado de una línea +
   chips de meta. Click → expande para editar a mano. ✨ → mini-prompt
   inline para reescribir esa pregunta con IA. La barra de IA inferior cubre
   cambios globales. Una sola superficie, sin modos competidores.
   ═══════════════════════════════════════════════════════════════════════════ */

interface ExamSheetProps {
  content: ExamContent | null;
  loading?: boolean;
  readOnly?: boolean;
  /** Fired on debounced content changes. Return a promise that resolves when
   *  the save completes so we can show a "guardado" confirmation. */
  onChange?: (next: ExamContent) => Promise<void> | void;
  /** Fired when the teacher submits a global AI refine instruction. */
  onAiRefine?: (instruction: string) => void;
  /** Fired when the teacher submits a per-question AI instruction. The parent
   *  is expected to call iterate() with preserve_questions = all OTHER ids so
   *  only this question gets regenerated. If not provided, falls back to
   *  prefixing the global onAiRefine with "En la pregunta N:". */
  onAiRefineQuestion?: (questionId: string, instruction: string) => void;
  /** Disable the AI inputs (e.g. while a background task is running). */
  aiBusy?: boolean;
  /** Navigate to the legacy full editor (escape hatch for power users). */
  onOpenAdvancedEditor?: () => void;
  /** Version history data + fetchers. */
  history?: {
    items?: ExamIterationHistoryItem[];
    onDownloadCurrent: () => void;
    onDownloadVersion: (version: number) => void;
  };
}

function isEqual(a: ExamContent, b: ExamContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function renumberQuestions(content: ExamContent): ExamContent {
  let n = 1;
  return {
    ...content,
    sections: content.sections.map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({ ...q, id: String(n++) })),
    })),
  };
}

function totalPoints(content: ExamContent): number {
  return content.sections.reduce(
    (sum, s) =>
      sum +
      s.questions.reduce(
        (qs, q) =>
          qs +
          (q.points ??
            q.subquestions?.reduce((ss, sq) => ss + (sq.points ?? 0), 0) ??
            0),
        0,
      ),
    0,
  );
}

// Strip math + truncate to one screen-line worth of text.
function previewText(text: string, max = 100): string {
  if (!text) return '';
  const stripped = text
    .replace(/\$\$[\s\S]*?\$\$/g, '·')
    .replace(/\$[^$]*\$/g, '·')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > max ? stripped.slice(0, max - 1) + '…' : stripped;
}

/* ── Autosave hook ────────────────────────────────────────────────────── */

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

function useAutosave(
  draft: ExamContent | null,
  baseline: ExamContent | null,
  onChange?: (next: ExamContent) => Promise<void> | void,
): SaveState {
  const [state, setState] = useState<SaveState>('idle');
  const baselineRef = useRef(baseline);
  baselineRef.current = baseline;

  useEffect(() => {
    if (!draft || !baseline || !onChange) return;
    if (isEqual(draft, baseline)) {
      setState('idle');
      return;
    }
    setState('dirty');
    const handle = window.setTimeout(async () => {
      setState('saving');
      try {
        await onChange(draft);
        setState('saved');
        window.setTimeout(() => {
          setState((s) => (s === 'saved' ? 'idle' : s));
        }, 1400);
      } catch {
        setState('error');
      }
    }, 700);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return state;
}

/* ── Inline editable text — click to edit, blur to commit ─────────────── */

interface InlineTextProps {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}

const InlineText: React.FC<InlineTextProps> = ({
  value,
  onCommit,
  placeholder,
  multiline = true,
  className,
  readOnly,
  autoFocus,
}) => {
  const [editing, setEditing] = useState(!!autoFocus);
  const [draft, setDraft] = useState(value);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    const el = taRef.current;
    if (!editing || !el || !multiline) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 44)}px`;
  }, [editing, draft, multiline]);

  if (readOnly) {
    return (
      <span className={`es-inline es-inline--ro ${className || ''}`}>
        {value ? (
          <MathText text={value} />
        ) : (
          <em className="es-inline__placeholder">{placeholder || '—'}</em>
        )}
      </span>
    );
  }

  if (editing && multiline) {
    return (
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        autoFocus
        rows={2}
        className={`es-inline__textarea ${className || ''}`}
      />
    );
  }

  if (editing && !multiline) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        placeholder={placeholder}
        autoFocus
        className={`es-inline__input ${className || ''}`}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`es-inline es-inline--clickable ${className || ''}`}
    >
      {value ? (
        <MathText text={value} />
      ) : (
        <em className="es-inline__placeholder">{placeholder || 'Añadir…'}</em>
      )}
    </button>
  );
};

/* ── Points chip — click to edit, steppers with keyboard ──────────────── */

interface PointsChipProps {
  value?: number;
  onCommit: (next: number | undefined) => void;
  readOnly?: boolean;
}

const PointsChip: React.FC<PointsChipProps> = ({ value, onCommit, readOnly }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : '');

  useEffect(() => {
    if (!editing) setDraft(value != null ? String(value) : '');
  }, [value, editing]);

  if (readOnly) {
    if (value == null) return null;
    return <span className="es-pts">{value}<small>pt</small></span>;
  }

  if (editing) {
    return (
      <input
        type="number"
        step="0.5"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          onCommit(isNaN(n) ? undefined : n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value != null ? String(value) : '');
            setEditing(false);
          }
        }}
        autoFocus
        className="es-pts es-pts--input"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="es-pts es-pts--btn"
      title="Editar puntos"
    >
      {value != null ? value : '—'}<small>pt</small>
    </button>
  );
};

/* ── AI refine bar (global) ──────────────────────────────────────────── */

const AI_PLACEHOLDERS = [
  'Haz la pregunta 3 más fácil',
  'Añade una pregunta de geometría',
  'Quita la última pregunta',
  'Cambia la pregunta 2 a tipo test',
  'Reparte los puntos equitativamente',
];

const AI_QUICK_SUGGESTIONS = [
  'Hazlo un poco más fácil',
  'Hazlo más difícil',
  'Añade una pregunta más',
  'Reparte los puntos',
];

interface AiBarProps {
  onSubmit: (instruction: string) => void;
  busy?: boolean;
}

const AiBar: React.FC<AiBarProps> = ({ onSubmit, busy }) => {
  const [value, setValue] = useState('');
  const [placeholder, setPlaceholder] = useState(AI_PLACEHOLDERS[0]);

  useEffect(() => {
    let i = 0;
    const t = window.setInterval(() => {
      i = (i + 1) % AI_PLACEHOLDERS.length;
      setPlaceholder(AI_PLACEHOLDERS[i]);
    }, 3800);
    return () => window.clearInterval(t);
  }, []);

  const submit = (text?: string) => {
    const v = (text ?? value).trim();
    if (!v || busy) return;
    onSubmit(v);
    setValue('');
  };

  return (
    <div className="es-ai-stack">
      <div className="es-ai-suggestions" aria-label="Sugerencias rápidas">
        {AI_QUICK_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="es-ai-suggestion"
            onClick={() => submit(s)}
            disabled={busy}
            title="Aplicar al instante"
          >
            <Sparkles size={11} /> {s}
          </button>
        ))}
      </div>
      <div className={`es-ai ${busy ? 'es-ai--busy' : ''}`}>
        <Sparkles size={15} className="es-ai__icon" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={busy ? 'La IA está trabajando…' : `Pide un cambio — ej: ${placeholder}`}
          disabled={busy}
          className="es-ai__input"
          aria-label="Pedir un cambio con IA"
        />
        <button
          type="button"
          onClick={() => submit()}
          disabled={!value.trim() || busy}
          className="es-ai__send"
          title="Aplicar con IA (Enter)"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};

/* ── Per-question AI mini-prompt ─────────────────────────────────────── */

interface QAiPromptProps {
  questionNumber: string;
  busy?: boolean;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}

const QAiPrompt: React.FC<QAiPromptProps> = ({ questionNumber, busy, onSubmit, onClose }) => {
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v || busy) return;
    onSubmit(v);
    setValue('');
    onClose();
  };
  return (
    <div className="es-q-ai" onClick={(e) => e.stopPropagation()}>
      <Sparkles size={13} className="es-q-ai__icon" />
      <span className="es-q-ai__label">Cambiar pregunta {questionNumber}</span>
      <input
        type="text"
        value={value}
        autoFocus
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          if (e.key === 'Escape') onClose();
        }}
        placeholder="Ej: más fácil, cambia los números, conviértela en tipo test…"
        className="es-q-ai__input"
      />
      <button type="button" onClick={submit} disabled={!value.trim() || busy} className="es-q-ai__send">
        Aplicar
      </button>
      <button type="button" onClick={onClose} className="es-q-ai__close" aria-label="Cerrar">
        <X size={13} />
      </button>
    </div>
  );
};

/* ── Save indicator ──────────────────────────────────────────────────── */

const SaveChip: React.FC<{ state: SaveState }> = ({ state }) => {
  if (state === 'idle') return null;
  const map = {
    dirty: { icon: <Clock size={10} />, label: 'Editando…', cls: 'es-save--dirty' },
    saving: { icon: <Clock size={10} />, label: 'Guardando…', cls: 'es-save--saving' },
    saved: { icon: <Check size={10} />, label: 'Guardado', cls: 'es-save--saved' },
    error: { icon: <X size={10} />, label: 'Error al guardar', cls: 'es-save--error' },
  } as const;
  const v = map[state];
  return (
    <span className={`es-save ${v.cls}`}>
      {v.icon} {v.label}
    </span>
  );
};

/* ── Main component ──────────────────────────────────────────────────── */

const ExamSheet: React.FC<ExamSheetProps> = ({
  content,
  loading,
  readOnly,
  onChange,
  onAiRefine,
  onAiRefineQuestion,
  aiBusy,
  onOpenAdvancedEditor,
  history,
}) => {
  const [draft, setDraft] = useState<ExamContent | null>(content);
  const [baseline, setBaseline] = useState<ExamContent | null>(content);
  const [autoFocusQid, setAutoFocusQid] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setDraft(content);
    setBaseline(content);
  }, [content]);

  const saveState = useAutosave(draft, baseline, async (next) => {
    if (!onChange) return;
    await onChange(next);
    setBaseline(next);
  });

  const patch = (fn: (c: ExamContent) => ExamContent) => {
    setDraft((d) => (d ? fn(d) : d));
  };

  /* ── Section ops ────────────────────────────────────────────────── */

  const updateSectionTitle = (si: number, title: string) =>
    patch((c) => ({
      ...c,
      sections: c.sections.map((s, i) => (i === si ? { ...s, title } : s)),
    }));

  const deleteSection = (si: number) =>
    patch((c) =>
      renumberQuestions({
        ...c,
        sections: c.sections.filter((_, i) => i !== si),
      }),
    );

  const moveSection = (si: number, dir: -1 | 1) =>
    patch((c) => {
      const target = si + dir;
      if (target < 0 || target >= c.sections.length) return c;
      const sections = [...c.sections];
      [sections[si], sections[target]] = [sections[target], sections[si]];
      return renumberQuestions({ ...c, sections });
    });

  const addSection = (atIndex?: number) =>
    patch((c) => {
      const next = { title: `Bloque ${c.sections.length + 1}`, questions: [] as ExamQuestion[] };
      const insertAt = atIndex ?? c.sections.length;
      const sections = [...c.sections.slice(0, insertAt), next, ...c.sections.slice(insertAt)];
      return { ...c, sections };
    });

  /* ── Question ops ──────────────────────────────────────────────── */

  const updateQuestion = (si: number, qi: number, q: ExamQuestion) =>
    patch((c) => ({
      ...c,
      sections: c.sections.map((s, i) =>
        i !== si
          ? s
          : {
              ...s,
              questions: s.questions.map((oq, j) => (j === qi ? q : oq)),
            },
      ),
    }));

  const deleteQuestion = (si: number, qi: number) =>
    patch((c) =>
      renumberQuestions({
        ...c,
        sections: c.sections.map((s, i) =>
          i !== si ? s : { ...s, questions: s.questions.filter((_, j) => j !== qi) },
        ),
      }),
    );

  const duplicateQuestion = (si: number, qi: number) =>
    patch((c) => {
      const sections = c.sections.map((s, i) => {
        if (i !== si) return s;
        const copy = JSON.parse(JSON.stringify(s.questions[qi]));
        return {
          ...s,
          questions: [
            ...s.questions.slice(0, qi + 1),
            copy,
            ...s.questions.slice(qi + 1),
          ],
        };
      });
      return renumberQuestions({ ...c, sections });
    });

  const moveQuestion = (si: number, qi: number, dir: -1 | 1) =>
    patch((c) => {
      const section = c.sections[si];
      const target = qi + dir;
      if (target < 0 || target >= section.questions.length) return c;
      const qs = [...section.questions];
      [qs[qi], qs[target]] = [qs[target], qs[qi]];
      const sections = c.sections.map((s, i) => (i === si ? { ...s, questions: qs } : s));
      return renumberQuestions({ ...c, sections });
    });

  // Insert a fresh question at the specified position (or end of section).
  // Auto-focuses the new question so the teacher lands directly in editing.
  const addQuestion = (si: number, atIndex?: number) => {
    patch((c) => {
      const ids = c.sections.flatMap((s) => s.questions.map((q) => Number(q.id) || 0));
      const tempId = String((ids.length ? Math.max(...ids) : 0) + 1);
      const newQ: ExamQuestion = {
        id: tempId,
        text: '',
        points: 1,
        type: 'computational',
        answer_space: 'medium',
      };
      const sections = c.sections.map((s, i) => {
        if (i !== si) return s;
        const insertAt = atIndex ?? s.questions.length;
        return {
          ...s,
          questions: [...s.questions.slice(0, insertAt), newQ, ...s.questions.slice(insertAt)],
        };
      });
      // Compute the renumbered id for the new question and request focus on it.
      // Sequential numbering means: count of questions in earlier sections +
      // (insertAt within this section) + 1.
      const earlier = c.sections.slice(0, si).reduce((a, s) => a + s.questions.length, 0);
      const finalId = String(earlier + (atIndex ?? c.sections[si].questions.length) + 1);
      setAutoFocusQid(finalId);
      return renumberQuestions({ ...c, sections });
    });
  };

  /* ── Sub-question + option ops ─────────────────────────────────── */

  const updateSubquestion = (si: number, qi: number, sqi: number, sq: ExamSubquestion) =>
    updateQuestion(si, qi, {
      ...draft!.sections[si].questions[qi],
      subquestions: draft!.sections[si].questions[qi].subquestions!.map((oq, j) =>
        j === sqi ? sq : oq,
      ),
    });

  const updateOption = (si: number, qi: number, oi: number, opt: ExamOption) =>
    updateQuestion(si, qi, {
      ...draft!.sections[si].questions[qi],
      options: draft!.sections[si].questions[qi].options!.map((oq, j) =>
        j === oi ? opt : oq,
      ),
    });

  /* ── AI per-question ───────────────────────────────────────────── */
  // If the parent provides a per-question handler (which knows how to set
  // preserve_questions correctly) we use it. Otherwise we fall back to the
  // global onAiRefine prefixed with "En la pregunta N:".

  const handleQuestionAi = (qid: string, instruction: string) => {
    if (onAiRefineQuestion) {
      onAiRefineQuestion(qid, instruction);
      return;
    }
    if (onAiRefine) {
      onAiRefine(`En la pregunta ${qid}: ${instruction}`);
    }
  };

  /* ── Totals ────────────────────────────────────────────────────── */

  const meta = useMemo(() => {
    if (!draft) return null;
    const totalQs = draft.sections.reduce((a, s) => a + s.questions.length, 0);
    return {
      sections: draft.sections.length,
      questions: totalQs,
      points: totalPoints(draft),
    };
  }, [draft]);

  /* ── Render ────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="es">
        <div className="es__skeleton">
          <div className="es__skeleton-line es__skeleton-line--lg" />
          <div className="es__skeleton-line" />
          <div className="es__skeleton-line es__skeleton-line--sm" />
        </div>
      </div>
    );
  }

  if (!draft || !draft.sections?.length) {
    return (
      <div className="es es--empty">
        <p className="es__empty-text">Todavía no hay preguntas generadas.</p>
        {!readOnly && onAiRefine && (
          <div className="mt-3">
            <AiBar onSubmit={onAiRefine} busy={aiBusy} />
          </div>
        )}
      </div>
    );
  }

  const versionCount = (history?.items?.length ?? 0) + (history?.items ? 1 : 0);

  return (
    <div className="es">
      {/* Meta bar: quick counts + escape hatches (history). */}
      <div className="es__meta">
        <div className="es__meta-counts">
          <span className="es__meta-count">
            <strong>{meta!.sections}</strong> {meta!.sections === 1 ? 'bloque' : 'bloques'}
          </span>
          <span className="es__meta-sep">·</span>
          <span className="es__meta-count">
            <strong>{meta!.questions}</strong> {meta!.questions === 1 ? 'pregunta' : 'preguntas'}
          </span>
          {meta!.points > 0 && (
            <>
              <span className="es__meta-sep">·</span>
              <span className="es__meta-count">
                <strong>{meta!.points}</strong> pt
              </span>
            </>
          )}
        </div>
        <div className="es__meta-actions">
          <SaveChip state={saveState} />
          {history && history.items && history.items.length > 0 && (
            <button
              type="button"
              className="es__meta-link"
              onClick={() => setHistoryOpen(true)}
              title="Ver historial"
            >
              <History size={12} />
              {versionCount} {versionCount === 1 ? 'versión' : 'versiones'}
            </button>
          )}
        </div>
      </div>

      {/* Sheet body */}
      <div className="es__sheet">
        {draft.sections.map((section, si) => {
          const sectionPts = section.questions.reduce(
            (a, q) =>
              a +
              (q.points ??
                q.subquestions?.reduce((ss, sq) => ss + (sq.points ?? 0), 0) ??
                0),
            0,
          );
          return (
            <section key={si} className="es-section">
              <header className="es-section__head">
                <span className="es-section__marker">§{si + 1}</span>
                <div className="es-section__title-wrap">
                  <InlineText
                    value={section.title || ''}
                    onCommit={(t) => updateSectionTitle(si, t)}
                    placeholder={`Bloque ${si + 1}`}
                    multiline={false}
                    readOnly={readOnly}
                    className="es-section__title"
                  />
                  {sectionPts > 0 && (
                    <span className="es-section__pts">{sectionPts} pt</span>
                  )}
                </div>
                {!readOnly && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="es-icon-btn"
                        title="Opciones del bloque"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => moveSection(si, -1)} disabled={si === 0}>
                        <ArrowUp size={14} className="mr-2" /> Mover arriba
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => moveSection(si, 1)}
                        disabled={si === draft.sections.length - 1}
                      >
                        <ArrowDown size={14} className="mr-2" /> Mover abajo
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => deleteSection(si)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 size={14} className="mr-2" /> Eliminar bloque
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </header>

              <ol className="es-q-list">
                {section.questions.length === 0 && !readOnly && (
                  <li className="es-q-list__empty">
                    <button type="button" onClick={() => addQuestion(si)} className="es-add-btn">
                      <Plus size={13} /> Añadir la primera pregunta
                    </button>
                  </li>
                )}

                {section.questions.map((q, qi) => (
                  <li key={`${q.id}-${qi}`} className="es-q-wrap">
                    <QuestionRow
                      qi={qi}
                      q={q}
                      totalQuestions={section.questions.length}
                      readOnly={readOnly}
                      autoFocus={autoFocusQid === q.id}
                      aiBusy={aiBusy}
                      onClearAutoFocus={() => setAutoFocusQid(null)}
                      onUpdate={(nq) => updateQuestion(si, qi, nq)}
                      onDelete={() => deleteQuestion(si, qi)}
                      onDuplicate={() => duplicateQuestion(si, qi)}
                      onMove={(d) => moveQuestion(si, qi, d)}
                      onUpdateSub={(sqi, sq) => updateSubquestion(si, qi, sqi, sq)}
                      onUpdateOpt={(oi, o) => updateOption(si, qi, oi, o)}
                      onOpenAdvanced={onOpenAdvancedEditor}
                      onAiQuestion={
                        (onAiRefineQuestion || onAiRefine)
                          ? (instr) => handleQuestionAi(q.id, instr)
                          : undefined
                      }
                    />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => addQuestion(si, qi + 1)}
                        className="es-add-between"
                        title="Añadir pregunta aquí"
                        aria-label="Añadir pregunta aquí"
                      >
                        <span className="es-add-between__line" />
                        <span className="es-add-between__chip"><Plus size={11} /> pregunta</span>
                        <span className="es-add-between__line" />
                      </button>
                    )}
                  </li>
                ))}
              </ol>

              {!readOnly && (
                <div className="es-section__add-row">
                  <button
                    type="button"
                    onClick={() => addSection(si + 1)}
                    className="es-add-between es-add-between--section"
                    title="Añadir bloque después"
                    aria-label="Añadir bloque después"
                  >
                    <span className="es-add-between__line" />
                    <span className="es-add-between__chip es-add-between__chip--section"><Plus size={11} /> bloque</span>
                    <span className="es-add-between__line" />
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* AI refine bar — global. Per-question prompts live inside each row. */}
      {!readOnly && onAiRefine && (
        <div className="es__ai-wrap">
          <AiBar onSubmit={onAiRefine} busy={aiBusy} />
          {onOpenAdvancedEditor && (
            <button
              type="button"
              className="es__advanced"
              onClick={onOpenAdvancedEditor}
              title="Abrir editor avanzado (opciones, subpreguntas, figuras)"
            >
              <ExternalLink size={11} /> Editor avanzado
            </button>
          )}
        </div>
      )}

      {/* History drawer — opens from the meta bar. */}
      {history && (
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent side="right" className="w-[360px] sm:w-[420px] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Historial de versiones</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              <div className="es-history-item es-history-item--current">
                <div className="es-history-item__head">
                  <Badge>v{(history.items?.length ?? 0) + 1}</Badge>
                  <span className="es-history-item__label">Versión actual</span>
                  <button
                    type="button"
                    className="es-icon-btn"
                    onClick={history.onDownloadCurrent}
                    title="Descargar"
                  >
                    <Download size={14} />
                  </button>
                </div>
                <p className="es-history-item__note">
                  {history.items && history.items.length > 0
                    ? history.items[history.items.length - 1].instruction
                    : 'Generación inicial'}
                </p>
              </div>
              {history.items &&
                [...history.items]
                  .slice(0, -1)
                  .reverse()
                  .map((item, idx) => (
                    <div key={idx} className="es-history-item">
                      <div className="es-history-item__head">
                        <Badge variant="secondary">v{item.version}</Badge>
                        <span className="es-history-item__time">
                          {new Date(item.timestamp).toLocaleString('es-ES')}
                        </span>
                        <button
                          type="button"
                          className="es-icon-btn"
                          onClick={() => history.onDownloadVersion(item.version)}
                          title={`Descargar v${item.version}`}
                        >
                          <Download size={14} />
                        </button>
                      </div>
                      <p className="es-history-item__note">{item.instruction}</p>
                    </div>
                  ))}
              {history.items && history.items.length > 0 && (
                <div className="es-history-item">
                  <div className="es-history-item__head">
                    <Badge variant="secondary">v1</Badge>
                    <span className="es-history-item__time">Original</span>
                    <button
                      type="button"
                      className="es-icon-btn"
                      onClick={() => history.onDownloadVersion(1)}
                      title="Descargar v1"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                  <p className="es-history-item__note">Generación inicial del examen</p>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

/* ── Question row — collapsed-by-default with click-to-expand ─────────── */

interface QuestionRowProps {
  qi: number;
  q: ExamQuestion;
  totalQuestions: number;
  readOnly?: boolean;
  autoFocus?: boolean;
  aiBusy?: boolean;
  onClearAutoFocus: () => void;
  onUpdate: (q: ExamQuestion) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onUpdateSub: (sqi: number, sq: ExamSubquestion) => void;
  onUpdateOpt: (oi: number, o: ExamOption) => void;
  onOpenAdvanced?: () => void;
  onAiQuestion?: (instruction: string) => void;
}

const QuestionRow: React.FC<QuestionRowProps> = ({
  qi,
  q,
  totalQuestions,
  readOnly,
  autoFocus,
  aiBusy,
  onClearAutoFocus,
  onUpdate,
  onDelete,
  onDuplicate,
  onMove,
  onUpdateSub,
  onUpdateOpt,
  onOpenAdvanced,
  onAiQuestion,
}) => {
  // New empty questions and questions explicitly auto-focused start expanded
  // so the teacher can type immediately. ReadOnly mode also starts expanded
  // so the teacher (or whoever) can see the full content while reviewing.
  const [open, setOpen] = useState<boolean>(!!autoFocus || !q.text || !!readOnly);
  const [showAi, setShowAi] = useState(false);

  useEffect(() => {
    if (autoFocus) {
      setOpen(true);
      const t = window.setTimeout(onClearAutoFocus, 100);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus, onClearAutoFocus]);

  const hasSub = !!q.subquestions?.length;
  const hasOpts = !!q.options?.length;
  const hasVisual = !!q.visual;
  const subCount = q.subquestions?.length ?? 0;
  const optCount = q.options?.length ?? 0;

  // If the AI mini-prompt is open, replace the body with it. Number stays
  // visible so the teacher knows which question they're editing.
  if (showAi && onAiQuestion) {
    return (
      <div className="es-q es-q--ai">
        <span className="es-q__num">{q.id}.</span>
        <QAiPrompt
          questionNumber={q.id}
          busy={aiBusy}
          onSubmit={onAiQuestion}
          onClose={() => setShowAi(false)}
        />
      </div>
    );
  }

  // ── Collapsed: single-line preview with chips and actions ─────────
  if (!open) {
    return (
      <div className="es-q es-q--collapsed">
        <span className="es-q__num">{q.id}.</span>
        <button
          type="button"
          className="es-q__preview"
          onClick={() => setOpen(true)}
          title="Editar pregunta"
        >
          <span className="es-q__preview-text">
            {q.text
              ? previewText(q.text)
              : <em className="es-inline__placeholder">Sin enunciado · click para escribir</em>}
          </span>
          <span className="es-q__preview-chips">
            {hasOpts && (
              <span className="es-q__chip es-q__chip--test" title="Tipo test">
                Test · {optCount}
              </span>
            )}
            {hasSub && (
              <span className="es-q__chip" title={`${subCount} apartados`}>
                {subCount} apartados
              </span>
            )}
            {hasVisual && (
              <span className="es-q__chip" title="Contiene figura">figura</span>
            )}
            {q.points != null && q.points > 0 && (
              <span className="es-q__chip es-q__chip--pts">{q.points}<small>pt</small></span>
            )}
          </span>
        </button>
        <div className="es-q__row-actions">
          {!readOnly && onAiQuestion && (
            <button
              type="button"
              className="es-q__ai-btn"
              onClick={() => setShowAi(true)}
              title="Cambiar con IA"
            >
              <Sparkles size={13} />
            </button>
          )}
          {!readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="es-icon-btn es-icon-btn--sm" title="Más opciones">
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setOpen(true)}>
                  Editar a mano
                </DropdownMenuItem>
                {onAiQuestion && (
                  <DropdownMenuItem onClick={() => setShowAi(true)}>
                    <Sparkles size={13} className="mr-2" /> Cambiar con IA
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onMove(-1)} disabled={qi === 0}>
                  <ArrowUp size={14} className="mr-2" /> Mover arriba
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMove(1)} disabled={qi === totalQuestions - 1}>
                  <ArrowDown size={14} className="mr-2" /> Mover abajo
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy size={14} className="mr-2" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 size={14} className="mr-2" /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    );
  }

  // ── Expanded: full editable view ───────────────────────────────
  return (
    <div className="es-q es-q--expanded">
      <span className="es-q__num">{q.id}.</span>

      <div className="es-q__body">
        <InlineText
          value={q.text || ''}
          onCommit={(t) => onUpdate({ ...q, text: t })}
          placeholder="Escribe el enunciado…"
          multiline
          readOnly={readOnly}
          autoFocus={autoFocus || !q.text}
          className="es-q__text"
        />

        {hasVisual && (
          <div className="es-q__visual-chip">
            Contiene figura · <button
              type="button"
              onClick={onOpenAdvanced}
              className="es-q__visual-link"
            >editar en editor avanzado</button>
          </div>
        )}

        {hasSub && (
          <ol className="es-sub-list">
            {q.subquestions!.map((sq, sqi) => (
              <li key={sqi} className="es-sub">
                <span className="es-sub__label">{sq.label || String.fromCharCode(97 + sqi)})</span>
                <InlineText
                  value={sq.text}
                  onCommit={(t) => onUpdateSub(sqi, { ...sq, text: t })}
                  placeholder="Subpregunta…"
                  readOnly={readOnly}
                  className="es-sub__text"
                />
                <PointsChip
                  value={sq.points}
                  onCommit={(p) => onUpdateSub(sqi, { ...sq, points: p })}
                  readOnly={readOnly}
                />
              </li>
            ))}
          </ol>
        )}

        {hasOpts && (
          <ul className="es-opt-list">
            {q.options!.map((opt, oi) => (
              <li
                key={oi}
                className={`es-opt ${opt.correct ? 'es-opt--correct' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (readOnly) return;
                    const next = q.options!.map((o, j) => ({
                      ...o,
                      correct: j === oi ? !opt.correct : false,
                    }));
                    onUpdate({ ...q, options: next });
                  }}
                  className="es-opt__radio"
                  disabled={readOnly}
                  title={opt.correct ? 'Opción correcta' : 'Marcar como correcta'}
                >
                  {opt.correct ? <Check size={11} /> : null}
                </button>
                <span className="es-opt__label">
                  {opt.label || String.fromCharCode(97 + oi)})
                </span>
                <InlineText
                  value={opt.text}
                  onCommit={(t) => onUpdateOpt(oi, { ...opt, text: t })}
                  placeholder="Opción…"
                  readOnly={readOnly}
                  className="es-opt__text"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="es-q__side">
        <PointsChip
          value={q.points}
          onCommit={(p) => onUpdate({ ...q, points: p })}
          readOnly={readOnly}
        />
        {!readOnly && onAiQuestion && (
          <button
            type="button"
            className="es-q__ai-btn"
            onClick={() => setShowAi(true)}
            title="Cambiar con IA"
          >
            <Sparkles size={13} />
          </button>
        )}
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="es-icon-btn es-icon-btn--sm"
                title="Opciones de la pregunta"
              >
                <MoreHorizontal size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onMove(-1)} disabled={qi === 0}>
                <ArrowUp size={14} className="mr-2" /> Mover arriba
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onMove(1)}
                disabled={qi === totalQuestions - 1}
              >
                <ArrowDown size={14} className="mr-2" /> Mover abajo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy size={14} className="mr-2" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 size={14} className="mr-2" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!readOnly && q.text && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="es-icon-btn es-icon-btn--sm"
            title="Contraer"
            aria-label="Contraer"
          >
            <ChevronUp size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default ExamSheet;
