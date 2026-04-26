import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Save,
  Plus,
  ChevronUp,
  ChevronDown,
  Trash2,
  AlertTriangle,
  Menu,
  Eye,
  RotateCcw,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import Spinner from '@/components/shared/Spinner';
import PdfViewer from '@/components/shared/PdfViewer';
import { useExamsStore } from '../../../store/examsStore';
import api, { exams as examsApi } from '../../../services/api';
import type { Exam, ExamContent, ExamSection, ExamQuestion } from '../../../types';
import QuestionCard from './QuestionCard';
import { EditableText } from './QuestionCard';
import './styles.css';

// ── Helpers ────────────────────────────────────────────────────────────

const DRAFT_PREFIX = 'ece:draft:';

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function isDirty(a: ExamContent, b: ExamContent): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function nextQuestionId(sections: ExamSection[]): string {
  const ids = sections.flatMap((s) => s.questions.map((q) => Number(q.id) || 0));
  const max = ids.length ? Math.max(...ids) : 0;
  return String(max + 1);
}

function renumberQuestionIds(content: ExamContent): ExamContent {
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
    (sum, s) => sum + s.questions.reduce(
      (qs, q) => qs + (q.points ?? (q.subquestions?.reduce((ss, sq) => ss + (sq.points ?? 0), 0) ?? 0)),
      0
    ),
    0
  );
}

// ── Status → editability ───────────────────────────────────────────────

type Purpose = 'evaluation' | 'practice' | 'recovery';

function editabilityFor(
  status: string | undefined,
  purpose: Purpose,
): {
  readOnly: boolean;
  warn: 'none' | 'downgrade' | 'distributed' | 'locked';
} {
  if (status === 'pending_correction' || status === 'corrected') {
    return { readOnly: true, warn: 'locked' };
  }
  if (status === 'scheduled') return { readOnly: false, warn: 'distributed' };
  if (status === 'pending_schedule' && purpose === 'evaluation') {
    return { readOnly: false, warn: 'downgrade' };
  }
  return { readOnly: false, warn: 'none' };
}

// ── Main component ─────────────────────────────────────────────────────

const ExamContentEditor: React.FC = () => {
  const { examId, classId, subjectId } = useParams() as {
    examId: string;
    classId?: string;
    subjectId?: string;
  };
  const navigate = useNavigate();
  const location = useLocation();
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const updateExamContent = useExamsStore((s) => s.updateExamContent);

  const exam: Exam | undefined = allExams.find((e) => e.id === examId);
  const purpose: Purpose = (exam?.purpose as Purpose) || 'evaluation';
  const isExercise = purpose !== 'evaluation';

  const [content, setContent] = useState<ExamContent | null>(null);
  const [original, setOriginal] = useState<ExamContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<number>(0);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [confirmScheduled, setConfirmScheduled] = useState(false);
  const [confirmScheduledAck, setConfirmScheduledAck] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [restorePrompt, setRestorePrompt] = useState<ExamContent | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [aiSheetOpen, setAISheetOpen] = useState(false);
  const [aiInstruction, setAIInstruction] = useState('');
  const [aiBusy, setAIBusy] = useState(false);
  const [aiBusyLabel, setAIBusyLabel] = useState('');

  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Drag&drop source pointer. Lives in a ref to avoid re-renders during drag.
  const dragSrc = useRef<{ si: number; qi: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ si: number; qi: number } | null>(null);

  const backPath = useMemo(() => {
    const path = location.pathname;
    if (classId && subjectId) return `/tabs/classes/${classId}/subjects/${subjectId}/exams/${examId}`;
    if (classId) return `/tabs/classes/${classId}/exams/${examId}`;
    if (path.includes('/exercises/')) return `/tabs/exercises/${examId}`;
    return `/tabs/exams/${examId}`;
  }, [classId, subjectId, examId, location.pathname]);

  const { readOnly, warn } = editabilityFor(exam?.status, purpose);
  const dirty = content && original ? isDirty(content, original) : false;

  // ── Load exam & questions ────────────────────────────────────────────

  useEffect(() => {
    if (!exam) fetchExams(classId);
  }, [exam, classId, fetchExams]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!examId) return;
      try {
        const res = await examsApi.getQuestions(examId);
        if (cancelled) return;
        const fetched = (res.data?.questions || { sections: [] }) as ExamContent;
        if (!Array.isArray(fetched.sections)) fetched.sections = [];
        setOriginal(deepClone(fetched));
        const draftRaw = localStorage.getItem(DRAFT_PREFIX + examId);
        if (draftRaw) {
          try {
            const draft = JSON.parse(draftRaw) as ExamContent;
            if (isDirty(draft, fetched)) {
              setRestorePrompt(draft);
              setContent(fetched);
            } else {
              localStorage.removeItem(DRAFT_PREFIX + examId);
              setContent(fetched);
            }
          } catch {
            setContent(fetched);
          }
        } else {
          setContent(fetched);
        }
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.response?.data?.detail || 'No se pudo cargar el contenido';
        toast.error(msg);
        navigate(backPath);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [examId, navigate, backPath]);

  // ── Local draft autosave (debounced) ─────────────────────────────────

  useEffect(() => {
    if (!content || !examId || readOnly) return;
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_PREFIX + examId, JSON.stringify(content));
      } catch { /* quota etc. */ }
    }, 600);
    return () => clearTimeout(t);
  }, [content, examId, dirty, readOnly]);

  // ── Warn on unload if dirty ──────────────────────────────────────────

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // ── Scroll-spy for active section ────────────────────────────────────

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const onScroll = () => {
      const bodyTop = body.getBoundingClientRect().top;
      const tops = sectionRefs.current.map((r) =>
        r ? r.getBoundingClientRect().top - bodyTop : Infinity,
      );
      const idx = tops.findIndex((t) => t > 80);
      setActiveSection(idx === -1 ? tops.length - 1 : Math.max(0, idx - 1));
    };
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, [content]);

  // ── Mutation helpers ─────────────────────────────────────────────────

  const patchContent = (patch: (c: ExamContent) => ExamContent) => {
    if (!content) return;
    setContent(patch(content));
  };

  const updateSection = (si: number, patch: Partial<ExamSection>) => {
    patchContent((c) => ({
      ...c,
      sections: c.sections.map((s, i) => i === si ? { ...s, ...patch } : s),
    }));
  };

  const updateQuestion = (si: number, qi: number, q: ExamQuestion) => {
    patchContent((c) => ({
      ...c,
      sections: c.sections.map((s, i) => i !== si ? s : {
        ...s,
        questions: s.questions.map((oq, j) => j === qi ? q : oq),
      }),
    }));
  };

  const deleteQuestion = (si: number, qi: number) => {
    patchContent((c) => renumberQuestionIds({
      ...c,
      sections: c.sections.map((s, i) => i !== si ? s : {
        ...s,
        questions: s.questions.filter((_, j) => j !== qi),
      }),
    }));
  };

  const duplicateQuestion = (si: number, qi: number) => {
    patchContent((c) => {
      const section = c.sections[si];
      const original = section.questions[qi];
      const copy = deepClone(original);
      const newSections = c.sections.map((s, i) => i !== si ? s : {
        ...s,
        questions: [
          ...s.questions.slice(0, qi + 1),
          copy,
          ...s.questions.slice(qi + 1),
        ],
      });
      return renumberQuestionIds({ ...c, sections: newSections });
    });
  };

  const moveQuestion = (si: number, qi: number, dir: -1 | 1) => {
    patchContent((c) => {
      const section = c.sections[si];
      const target = qi + dir;
      if (target < 0 || target >= section.questions.length) return c;
      const newQuestions = [...section.questions];
      [newQuestions[qi], newQuestions[target]] = [newQuestions[target], newQuestions[qi]];
      const newSections = c.sections.map((s, i) => i !== si ? s : { ...s, questions: newQuestions });
      return renumberQuestionIds({ ...c, sections: newSections });
    });
  };

  // Drag & drop reorder. Supports moving a question within the same section
  // OR across sections. Drop semantic: "place ABOVE target" — after the splice
  // shifts indices, we adjust by -1 if we just removed something earlier in
  // the same section. We renumber afterwards so IDs stay sequential.
  const moveQuestionTo = (src: { si: number; qi: number }, dst: { si: number; qi: number }) => {
    if (src.si === dst.si && src.qi === dst.qi) return;
    patchContent((c) => {
      const next = deepClone(c);
      const [moved] = next.sections[src.si].questions.splice(src.qi, 1);
      const targetIdx = (src.si === dst.si && src.qi < dst.qi) ? dst.qi - 1 : dst.qi;
      next.sections[dst.si].questions.splice(targetIdx, 0, moved);
      return renumberQuestionIds(next);
    });
  };

  // Insert a fresh question at the given position (qi is the index BEFORE
  // which to insert, or end-of-section if undefined). Auto-expands the new
  // card so the teacher lands directly in edit mode.
  const addQuestion = (si: number, atIndex?: number) => {
    if (!content) return;
    const newId = nextQuestionId(content.sections);
    const newQ: ExamQuestion = {
      id: newId,
      text: '',
      points: 1,
      type: 'computational',
      answer_space: 'medium',
    };
    setContent((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      const insertAt = atIndex ?? next.sections[si].questions.length;
      next.sections[si].questions.splice(insertAt, 0, newQ);
      return renumberQuestionIds(next);
    });
    // QuestionCard auto-expands any question with empty text, so the new card
    // lands directly in edit mode without us tracking ids ourselves.
  };

  const addSection = () => {
    patchContent((c) => ({
      ...c,
      sections: [...c.sections, { title: `Bloque ${c.sections.length + 1}`, questions: [] }],
    }));
  };

  const deleteSection = (si: number) => {
    patchContent((c) => renumberQuestionIds({
      ...c,
      sections: c.sections.filter((_, i) => i !== si),
    }));
  };

  const moveSection = (si: number, dir: -1 | 1) => {
    patchContent((c) => {
      const target = si + dir;
      if (target < 0 || target >= c.sections.length) return c;
      const newSections = [...c.sections];
      [newSections[si], newSections[target]] = [newSections[target], newSections[si]];
      return renumberQuestionIds({ ...c, sections: newSections });
    });
  };

  // ── Save ─────────────────────────────────────────────────────────────

  const attemptSave = async () => {
    if (!content || !examId) return;
    if (warn === 'distributed' && !confirmScheduledAck) {
      setConfirmScheduled(true);
      return;
    }
    doSave();
  };

  const doSave = async () => {
    if (!content || !examId) return;
    setSaving(true);
    try {
      await updateExamContent(examId, content);
      localStorage.removeItem(DRAFT_PREFIX + examId);
      toast.success('Contenido guardado. PDF regenerado.');
      navigate(backPath);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'No se pudo guardar el contenido';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = () => {
    if (!original) return;
    setContent(deepClone(original));
    if (examId) localStorage.removeItem(DRAFT_PREFIX + examId);
    setConfirmDiscard(false);
  };

  // ── AI iterate (whole exam OR single question) ───────────────────────
  // Strategy: if there are unsaved local edits, save them first (so the AI
  // operates on the version the teacher actually sees). Then call the
  // iterate endpoint, re-fetch the questions, and stay in the editor.
  // Per-question mode passes preserve_questions with all OTHER ids so the
  // backend only regenerates the targeted one.

  const runAIIterate = async (instruction: string, preserveQuestions?: number[]) => {
    if (!examId || !content) return;
    setAIBusy(true);
    setAIBusyLabel(preserveQuestions ? 'Aplicando cambios a la pregunta…' : 'Reescribiendo el examen…');
    try {
      // Save first so the iterate operates on the latest state.
      if (dirty) {
        await updateExamContent(examId, content);
        setOriginal(deepClone(content));
        if (examId) localStorage.removeItem(DRAFT_PREFIX + examId);
      }
      await examsApi.iterate(examId, {
        instruction,
        ...(preserveQuestions ? { preserve_questions: preserveQuestions } : {}),
      });
      // Re-fetch the questions (the iterate endpoint returns the Exam, not
      // the sections payload).
      const res = await examsApi.getQuestions(examId);
      const fetched = (res.data?.questions || { sections: [] }) as ExamContent;
      if (!Array.isArray(fetched.sections)) fetched.sections = [];
      setContent(fetched);
      setOriginal(deepClone(fetched));
      // Refresh exam status (iterate may have downgraded it).
      fetchExams(classId);
      toast.success(preserveQuestions ? 'Pregunta actualizada' : 'Examen actualizado');
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'La IA no pudo aplicar los cambios';
      toast.error(msg);
      throw e;
    } finally {
      setAIBusy(false);
      setAIBusyLabel('');
    }
  };

  const handleQuestionAI = async (questionId: string, instruction: string) => {
    if (!content) return;
    // Preserve every OTHER question; backend will re-generate only this one.
    const allIds = content.sections
      .flatMap((s) => s.questions.map((q) => Number(q.id)))
      .filter((n) => Number.isFinite(n));
    const preserve = allIds.filter((id) => String(id) !== questionId);
    const prefix = `En la pregunta ${questionId}: `;
    await runAIIterate(prefix + instruction, preserve);
  };

  const handleGlobalAI = async () => {
    const text = aiInstruction.trim();
    if (!text || !content) return;
    try {
      await runAIIterate(text);
      setAIInstruction('');
      setAISheetOpen(false);
    } catch { /* toast already shown */ }
  };

  const handlePreview = async () => {
    if (!examId) return;
    setPreviewLoading(true);
    try {
      const res = await api.get(`/exams/${examId}/download?preview=true`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      setPreviewUrl(blobUrl);
    } catch {
      toast.error('No se pudo cargar la vista previa');
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const scrollToSection = (si: number) => {
    setOutlineOpen(false);
    window.setTimeout(() => {
      const el = sectionRefs.current[si];
      const body = bodyRef.current;
      if (!el || !body) return;
      const stickyOffset = window.matchMedia('(min-width: 992px)').matches ? 0 : 52;
      const top = el.offsetTop - stickyOffset;
      body.scrollTo({ top, behavior: 'smooth' });
    }, 220);
  };

  // ── Dirty markers per section / question ────────────────────────────

  const dirtyBySection = useMemo(() => {
    if (!content || !original) return [] as boolean[];
    return content.sections.map((s, i) => {
      const o = original.sections[i];
      if (!o) return true;
      return JSON.stringify(s) !== JSON.stringify(o);
    });
  }, [content, original]);

  const isQuestionDirty = (si: number, qi: number): boolean => {
    if (!content || !original) return false;
    const o = original.sections[si]?.questions[qi];
    if (!o) return true;
    return JSON.stringify(content.sections[si].questions[qi]) !== JSON.stringify(o);
  };

  // ── Render ───────────────────────────────────────────────────────────

  if (loading || !content) {
    return (
      <div className="ece-shell">
        <header className="ece-header">
          <button onClick={() => navigate(backPath)} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent">
            <ArrowLeft size={20} />
          </button>
          <h1 className="ece-header__title">Cargando editor…</h1>
        </header>
        <div className="flex items-center justify-center flex-1 min-h-[240px]">
          <Spinner />
        </div>
      </div>
    );
  }

  const statusChip = (() => {
    if (saving) return (
      <span className="ece-header__status ece-header__status--saving">
        <Clock size={12} /> <span className="ece-header__status-label">Guardando…</span>
      </span>
    );
    if (dirty) return (
      <span className="ece-header__status ece-header__status--dirty">
        <AlertTriangle size={12} /> <span className="ece-header__status-label">Sin guardar</span>
      </span>
    );
    return (
      <span className="ece-header__status">
        <CheckCircle2 size={12} /> <span className="ece-header__status-label">Sincronizado</span>
      </span>
    );
  })();

  const scrollToQuestion = (si: number, qid: string) => {
    setOutlineOpen(false);
    window.setTimeout(() => {
      const body = bodyRef.current;
      if (!body) return;
      const el = body.querySelector<HTMLElement>(`[data-qid="${si}-${qid}"]`);
      if (!el) return;
      const stickyOffset = window.matchMedia('(min-width: 992px)').matches ? 0 : 52;
      const top = el.offsetTop - stickyOffset;
      body.scrollTo({ top, behavior: 'smooth' });
      el.classList.add('ece-question--flash');
      window.setTimeout(() => el.classList.remove('ece-question--flash'), 1000);
    }, 220);
  };

  const renderOutline = () => {
    const totalQs = content.sections.reduce((a, s) => a + s.questions.length, 0);
    const totalPts = totalPoints(content);
    const dirtyCount = dirtyBySection.filter(Boolean).length;
    return (
      <>
        <div className="ece-outline__summary">
          <span>{content.sections.length} {content.sections.length === 1 ? 'bloque' : 'bloques'}</span>
          <span className="ece-outline__summary-sep">·</span>
          <span>{totalQs} {totalQs === 1 ? 'pregunta' : 'preguntas'}</span>
          <span className="ece-outline__summary-sep">·</span>
          <span>{totalPts} pts</span>
          {dirtyCount > 0 && (
            <span className="ece-outline__summary-dirty">· {dirtyCount} sin guardar</span>
          )}
        </div>

        <nav className="ece-outline__nav" aria-label="Índice del examen">
          {content.sections.map((s, si) => {
            const isActive = activeSection === si;
            const qCount = s.questions.length;
            const sectionHasDirty = dirtyBySection[si];
            return (
              <div key={si} className="ece-outline__section">
                <button
                  type="button"
                  className={`ece-outline__section-name ${isActive ? 'ece-outline__section-name--active' : ''}`}
                  onClick={() => scrollToSection(si)}
                  title={s.title || 'Sin título'}
                >
                  <span className="ece-outline__section-marker">§{si + 1}</span>
                  <span className="ece-outline__section-label">
                    {s.title || 'Sin título'}
                  </span>
                  {sectionHasDirty && <span className="ece-outline__section-dirty-dot" />}
                </button>
                {qCount > 0 && (
                  <ul className="ece-outline__q-list">
                    {s.questions.map((q, qi) => (
                      <li key={qi}>
                        <button
                          type="button"
                          className={`ece-outline__q ${isQuestionDirty(si, qi) ? 'ece-outline__q--dirty' : ''}`}
                          onClick={() => scrollToQuestion(si, q.id)}
                          title={q.text || 'Sin enunciado'}
                        >
                          <span className="ece-outline__q-num">{q.id}</span>
                          <span className="ece-outline__q-text">
                            {q.text ? q.text.replace(/\$[^$]*\$/g, '·').slice(0, 48) : <em>Sin enunciado</em>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {!readOnly && (
          <button type="button" onClick={addSection} className="ece-outline__add">
            <Plus size={13} /> Añadir bloque
          </button>
        )}
      </>
    );
  };

  const kindLabel = isExercise ? (purpose === 'recovery' ? 'ficha de recuperación' : 'ficha de ejercicios') : 'examen';

  return (
    <div className="ece-shell">
      {/* Header */}
      <header className="ece-header">
        <button
          onClick={() => {
            if (dirty) { setConfirmDiscard(true); return; }
            navigate(backPath);
          }}
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent -ml-1"
          title="Volver"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="ece-header__title">{exam?.name || 'Editar contenido'}</h1>
        {statusChip}
        {!readOnly && (
          <button
            type="button"
            onClick={() => setAISheetOpen(true)}
            className="ece-header__ai-btn"
            title="Cambiar el examen con IA"
            aria-label="Cambiar el examen con IA"
          >
            <Sparkles size={15} />
            <span className="ece-header__ai-btn-label">IA</span>
          </button>
        )}
        {exam?.hasGeneratedQuestions && (
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading}
            className="ece-header__preview-btn"
            title="Vista previa del PDF"
            aria-label="Vista previa del PDF"
          >
            <Eye size={17} />
          </button>
        )}
      </header>

      {/* Banner according to status */}
      {warn === 'locked' && (
        <div className="ece-banner ece-banner--danger">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Solo lectura.</strong> Este {kindLabel} ya ha sido realizado por los alumnos.
            Modificar preguntas rompería la correlación con sus respuestas. Si necesitas cambiar
            el contenido, crea uno nuevo.
          </div>
        </div>
      )}
      {warn === 'distributed' && (
        <div className="ece-banner ece-banner--warning">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <strong>Ya asignado.</strong> Los PDFs pueden haberse descargado o impreso.
            Los cambios se aplicarán a los PDFs regenerados — los alumnos con copias
            previas tendrán la versión antigua.
          </div>
        </div>
      )}
      {warn === 'downgrade' && (
        <div className="ece-banner ece-banner--info">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            Al guardar, el examen volverá a estado <strong>pendiente de validación</strong> —
            necesitarás validar de nuevo para regenerar el solucionario.
          </div>
        </div>
      )}

      <div className="ece-mobile-index">
        <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1">
              <Menu size={16} className="mr-2" /> Índice ({content.sections.length})
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto ece-outline-sheet">
            <SheetHeader>
              <SheetTitle className="ece-outline-sheet__title">Índice</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{renderOutline()}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="ece-body" ref={bodyRef}>
        <aside className="ece-outline">{renderOutline()}</aside>
        <div className="ece-main">
          {content.sections.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-sm mb-3">Todavía no hay bloques.</p>
              {!readOnly && (
                <Button onClick={addSection}>
                  <Plus size={16} className="mr-2" /> Añadir primer bloque
                </Button>
              )}
            </div>
          )}

          {content.sections.map((section, si) => {
            const sectionPts = section.questions.reduce(
              (a, q) => a + (q.points ?? (q.subquestions?.reduce((ss, sq) => ss + (sq.points ?? 0), 0) ?? 0)),
              0,
            );
            return (
              <section
                key={si}
                ref={(el) => { sectionRefs.current[si] = el; }}
                className="ece-section"
                data-accent={si % 5}
              >
                <div className="ece-section__header">
                  <span className="ece-section__badge">§{si + 1}</span>
                  <div className="flex-1 min-w-0">
                    {readOnly ? (
                      <h2 className="text-[0.95rem] font-semibold leading-tight">{section.title || 'Sin título'}</h2>
                    ) : (
                      <EditableText
                        value={section.title}
                        onChange={(t) => updateSection(si, { title: t })}
                        placeholder="Nombre del bloque"
                        multiline={false}
                        className="text-[0.95rem] font-semibold leading-tight"
                      />
                    )}
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {section.questions.length} {section.questions.length === 1 ? 'pregunta' : 'preguntas'}
                      {sectionPts > 0 && ` · ${sectionPts} pts`}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => moveSection(si, -1)} disabled={si === 0} title="Mover arriba">
                        <ChevronUp size={16} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => moveSection(si, 1)} disabled={si === content.sections.length - 1} title="Mover abajo">
                        <ChevronDown size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSection(si)}
                        className="text-red-600"
                        title="Eliminar bloque"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="ece-section__body">
                  {section.questions.length === 0 && !readOnly && (
                    <button
                      type="button"
                      onClick={() => addQuestion(si)}
                      className="ece-section__add ece-section__add--empty"
                    >
                      <Plus size={14} /> Añadir la primera pregunta
                    </button>
                  )}
                  {section.questions.map((q, qi) => (
                    <div key={`${q.id}-${qi}`} className="ece-question-wrap">
                      <QuestionCard
                        question={q}
                        displayIndex={q.id}
                        anchorId={`${si}-${q.id}`}
                        readOnly={readOnly}
                        dirty={isQuestionDirty(si, qi)}
                        defaultExpanded={!q.text}
                        onChange={(nq) => updateQuestion(si, qi, nq)}
                        onDelete={() => deleteQuestion(si, qi)}
                        onDuplicate={() => duplicateQuestion(si, qi)}
                        onMove={(dir) => moveQuestion(si, qi, dir)}
                        onAIIterate={readOnly ? undefined : handleQuestionAI}
                        onDragStart={readOnly ? undefined : () => { dragSrc.current = { si, qi }; }}
                        onDragOver={readOnly ? undefined : (e: React.DragEvent) => {
                          if (!dragSrc.current) return;
                          e.preventDefault();
                          if (dragTarget?.si !== si || dragTarget?.qi !== qi) {
                            setDragTarget({ si, qi });
                          }
                        }}
                        onDrop={readOnly ? undefined : () => {
                          if (dragSrc.current) {
                            moveQuestionTo(dragSrc.current, { si, qi });
                          }
                          dragSrc.current = null;
                          setDragTarget(null);
                        }}
                        isFirst={qi === 0}
                        isLast={qi === section.questions.length - 1}
                      />
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => addQuestion(si, qi + 1)}
                          className="ece-add-between"
                          title="Añadir pregunta aquí"
                          aria-label="Añadir pregunta aquí"
                        >
                          <span className="ece-add-between__line" />
                          <span className="ece-add-between__chip">
                            <Plus size={12} /> pregunta
                          </span>
                          <span className="ece-add-between__line" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {!readOnly && content.sections.length > 0 && (
            <div className="flex justify-center mt-5 mb-2">
              <Button variant="ghost" size="sm" onClick={addSection}>
                <Plus size={14} className="mr-1" /> Añadir bloque
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Save bar (sticky bottom) */}
      {!readOnly && (
        <div className="ece-savebar">
          <div className={`ece-savebar__info ${dirty ? 'ece-savebar__info--dirty' : ''}`}>
            {dirty ? (
              <>Cambios sin guardar</>
            ) : (
              <>Todo guardado · {totalPoints(content)} pts · {content.sections.reduce((a, s) => a + s.questions.length, 0)} preguntas</>
            )}
          </div>
          {dirty && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)} disabled={saving}>
              <RotateCcw size={14} className="mr-1" />
              <span className="ece-savebar__cta-label-long">Descartar</span>
            </Button>
          )}
          <Button onClick={attemptSave} disabled={!dirty || saving}>
            <Save size={16} className="mr-2" />
            <span className="ece-savebar__cta-label-long">{saving ? 'Guardando…' : 'Guardar y regenerar PDF'}</span>
            <span className="ece-savebar__cta-label-short">{saving ? 'Guardando…' : 'Guardar'}</span>
          </Button>
        </div>
      )}

      {/* AI sheet — global re-prompt for the whole exam. Per-question prompts
          live inside each card. The same backend endpoint is used; per-question
          mode passes preserve_questions to keep everything else intact. */}
      <Sheet open={aiSheetOpen} onOpenChange={(o) => { if (!aiBusy) setAISheetOpen(o); }}>
        <SheetContent side="bottom" className="ece-ai-sheet">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles size={16} className="text-indigo-600" /> Cambiar el examen con IA
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">
              Describe en lenguaje natural qué quieres cambiar. La IA reescribirá el examen
              respetando el resto del contenido. Si tienes cambios sin guardar, se guardarán antes.
            </p>
            <Textarea
              value={aiInstruction}
              onChange={(e) => setAIInstruction(e.target.value)}
              placeholder="Ej: hazlo un poco más fácil, añade una pregunta sobre fracciones, sustituye la pregunta 4 por una de geometría…"
              rows={4}
              autoFocus
              disabled={aiBusy}
              className="text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {[
                'Hazlo un poco más fácil',
                'Hazlo más difícil',
                'Añade una pregunta sobre…',
                'Cambia los números de las preguntas',
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setAIInstruction(s)}
                  disabled={aiBusy}
                  className="ece-ai-suggest"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => { if (!aiBusy) setAISheetOpen(false); }} disabled={aiBusy}>Cancelar</Button>
              <Button onClick={handleGlobalAI} disabled={!aiInstruction.trim() || aiBusy}>
                <Sparkles size={14} className="mr-1.5" />
                {aiBusy ? 'Aplicando…' : 'Aplicar cambios'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Loading scrim while AI is working */}
      {aiBusy && (
        <div className="ece-ai-busy">
          <div className="ece-ai-busy__card">
            <Sparkles size={20} className="text-indigo-500 animate-pulse" />
            <div>
              <div className="text-sm font-semibold">{aiBusyLabel || 'Aplicando IA…'}</div>
              <div className="text-xs text-muted-foreground">Esto puede tardar unos segundos.</div>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled confirmation modal */}
      <Dialog open={confirmScheduled} onOpenChange={setConfirmScheduled}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar edición</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Este {kindLabel} ya está asignado. Los PDFs pueden haberse
                descargado o impreso ya.</p>
                <p>Al guardar:</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  <li>Se regenerarán los PDFs con el contenido actualizado.</li>
                  <li>Los alumnos con copias previas tendrán la versión antigua.</li>
                </ul>
                <p className="text-amber-700 font-medium">¿Continuar?</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmScheduled(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                setConfirmScheduledAck(true);
                setConfirmScheduled(false);
                doSave();
              }}
            >
              Sí, guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard confirmation */}
      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar cambios</DialogTitle>
            <DialogDescription>
              Se perderán todas las modificaciones sin guardar. ¿Continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Seguir editando</Button>
            <Button
              variant="destructive"
              onClick={() => {
                discardChanges();
                navigate(backPath);
              }}
            >
              Descartar y salir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF preview overlay */}
      {previewUrl && (
        <div className="ece-preview-overlay">
          <PdfViewer
            url={previewUrl}
            title={exam?.name || 'Vista previa'}
            onClose={closePreview}
          />
        </div>
      )}

      {previewLoading && !previewUrl && (
        <div className="ece-preview-overlay ece-preview-overlay--loading">
          <Spinner />
          <span className="ece-preview-overlay__loading-label">Cargando documento…</span>
        </div>
      )}

      {/* Restore draft prompt */}
      <Dialog open={!!restorePrompt} onOpenChange={(o) => !o && setRestorePrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Borrador sin guardar</DialogTitle>
            <DialogDescription>
              Tienes cambios sin guardar de una sesión anterior. ¿Quieres restaurarlos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (examId) localStorage.removeItem(DRAFT_PREFIX + examId);
                setRestorePrompt(null);
              }}
            >
              Descartar borrador
            </Button>
            <Button
              onClick={() => {
                if (restorePrompt) setContent(restorePrompt);
                setRestorePrompt(null);
              }}
            >
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamContentEditor;
