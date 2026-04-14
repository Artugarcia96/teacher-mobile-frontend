import { useState, useEffect, useRef } from 'react';
import {
  XCircle, Sparkles, Image, Download, FileText, HelpCircle, Trash2, Upload,
  ChevronDown, ChevronUp, CheckCircle, AlertCircle, MoreVertical, RefreshCw, UserX, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import Spinner from '@/components/shared/Spinner';
import { Student, AIAnalysis } from '../types';
import { questionStatusConfig } from '../utils/statusConfig';
import { QuestionStatusBar } from './charts';
import './ScanCard.css';

interface Props {
  index: number;
  aiAnalysis?: AIAnalysis;
  selectedStudentId: string;
  students: Student[];
  maxScore: number;
  grade: number | null;
  originalGrade?: number | null;
  teacherComments: string;
  saved: boolean;
  saving?: boolean;
  autoSaved?: boolean;
  aiProcessing?: boolean;
  aiError?: string;
  paperUrl?: string;
  onStudentChange: (studentId: string) => void;
  onGradeChange: (grade: number) => void;
  onCommentsChange: (comments: string) => void;
  onSave: () => void;
  onProcessAI?: () => void;
  onPreviewPaper?: () => void;
  onDownloadPaper?: () => void;
  onDownloadReport?: () => void;
  onDelete?: () => void;
  /** Upload paper for this student (shown when no paperUrl) */
  onUploadPaper?: () => void;
  /** Replace the existing paper with a new file (shown when paperUrl exists). */
  onReplacePaper?: () => void;
  /** Mark the student as "did not take the exam". */
  onMarkNotTaken?: () => void;
  /** Undo NP — return to "pending". */
  onUnmarkNotTaken?: () => void;
  /** True when this correction is in the NP state. */
  notTaken?: boolean;
  /** Show a "Reemplazando..." spinner pill while the paper is being replaced. */
  replacing?: boolean;
  /** Standalone mode: no student list required. Shows text input for name instead of select. */
  standalone?: boolean;
  /** Free-text student name for standalone mode */
  studentName?: string;
  onStudentNameChange?: (name: string) => void;
}

function getCorrectPercent(questions: AIAnalysis['questions']): number | null {
  if (!questions || questions.length === 0) return null;
  const correct = questions.filter((q) => q.status === 'correct').length;
  const partial = questions.filter((q) => q.status === 'partial').length;
  return Math.round(((correct + partial * 0.5) / questions.length) * 100);
}

/* Status icon mapping for question breakdown */
const STATUS_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  correct: CheckCircle,
  partial: AlertCircle,
  incorrect: XCircle,
  blank: HelpCircle,
};

const STATUS_COLORS: Record<string, string> = {
  correct: 'text-emerald-600',
  partial: 'text-yellow-600',
  incorrect: 'text-red-600',
  blank: 'text-slate-400',
};

/* Question Breakdown: mini-cards with expandable feedback */
const FEEDBACK_CHAR_THRESHOLD = 60;

const QuestionBreakdown: React.FC<{ questions: AIAnalysis['questions'] }> = ({ questions }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="scan-q-grid">
      {questions.map((q) => {
        const cfg = questionStatusConfig[q.status] || questionStatusConfig.blank;
        const isLong = (q.feedback?.length || 0) > FEEDBACK_CHAR_THRESHOLD;
        const isExpanded = expandedIds.has(q.id);
        const IconComp = STATUS_ICONS[q.status] || HelpCircle;

        return (
          <div
            key={q.id}
            className={`scan-q-card scan-q-card--${q.status}`}
            onClick={() => q.feedback && isLong ? toggle(q.id) : undefined}
          >
            <div className="scan-q-card__header">
              <IconComp size={14} className={`scan-q-card__icon ${STATUS_COLORS[q.status] || ''}`} />
              <span className="scan-q-card__id">P{q.id}</span>
              <span className={`scan-q-card__badge scan-q-card__badge--${q.status}`}>{cfg.label}</span>
            </div>
            {q.feedback && (
              <p className={`scan-q-card__feedback ${!isExpanded && isLong ? 'scan-q-card__feedback--clamped' : ''}`}>
                {q.feedback}
              </p>
            )}
            {isLong && (
              <button className="scan-q-card__toggle" onClick={(e) => { e.stopPropagation(); toggle(q.id); }}>
                {isExpanded ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

const ScanCard: React.FC<Props> = ({
  index, aiAnalysis, selectedStudentId, students,
  maxScore, grade, originalGrade, teacherComments, saved, saving, autoSaved, aiProcessing, aiError,
  paperUrl, onStudentChange, onGradeChange, onCommentsChange, onSave, onProcessAI, onPreviewPaper, onDownloadPaper, onDownloadReport, onDelete, onUploadPaper,
  onReplacePaper, onMarkNotTaken, onUnmarkNotTaken, notTaken, replacing,
  standalone, studentName: standaloneStudentName, onStudentNameChange,
}) => {
  const kebabRef = useRef<HTMLDetailsElement | null>(null);
  const closeKebab = () => { if (kebabRef.current) kebabRef.current.open = false; };
  // Close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!kebabRef.current) return;
      if (!kebabRef.current.contains(e.target as Node)) kebabRef.current.open = false;
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const showKebab = !!(onReplacePaper || onMarkNotTaken || onUnmarkNotTaken || onDelete);
  const [expanded, setExpanded] = useState(!saved && !!paperUrl && !notTaken);
  const wasProcessing = useRef(false);
  const hasAI = !!aiAnalysis;

  // Auto-expand card when AI analysis finishes (so user sees results)
  useEffect(() => {
    if (wasProcessing.current && !aiProcessing && hasAI) {
      setExpanded(true);
    }
    wasProcessing.current = !!aiProcessing;
  }, [aiProcessing, hasAI]);
  const confidence = aiAnalysis?.confidence || 0;

  const hasGradeChanged = saved && grade !== originalGrade;

  const totalQuestions = aiAnalysis?.questions?.length || 0;
  const blankCount = aiAnalysis?.questions?.filter(q => q.status === 'blank').length || 0;
  const correctPercent = hasAI && totalQuestions > 0 ? getCorrectPercent(aiAnalysis.questions) : null;

  const hasAnyAIContent = hasAI && (
    totalQuestions > 0 ||
    (aiAnalysis.weakAreas && aiAnalysis.weakAreas.length > 0) ||
    aiAnalysis.summary
  );

  const studentName = standalone ? standaloneStudentName : students.find(s => s.id === selectedStudentId)?.name;
  const displayName = studentName || (standalone ? 'Alumno' : 'Sin asignar');

  return (
    <div className={`scan-card ${saved ? 'scan-card-saved' : ''} ${hasGradeChanged ? 'scan-card-modified' : ''} ${aiProcessing ? 'scan-card-ai-active' : ''}`}>
      <div className="scan-card-content">
        {/* Collapsed header — always visible.
            A small 6px dot to the left of the name signals delivery state at
            a glance: green = paper uploaded, slate = not delivered (or NP).
            Compact enough not to compete with the index/grade chips. */}
        <div className="scan-card-collapsed-header" onClick={() => setExpanded(!expanded)}>
          <span className="scan-card-index">#{index + 1}</span>
          <span
            className={`scan-card-delivery-dot${
              notTaken
                ? ' scan-card-delivery-dot--np'
                : paperUrl
                ? ' scan-card-delivery-dot--delivered'
                : ' scan-card-delivery-dot--missing'
            }`}
            aria-label={
              notTaken ? 'No presentado' : paperUrl ? 'Examen entregado' : 'Sin entrega'
            }
            title={
              notTaken ? 'No presentado' : paperUrl ? 'Examen entregado' : 'Sin entrega'
            }
          />
          <span className="scan-card-collapsed-name">
            {displayName}
          </span>
          <div className="scan-card-collapsed-right">
            {/* NP state takes precedence over upload/grade indicators */}
            {notTaken ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200"
                title="Marcado como no presentado — excluido de la media de la clase"
              >
                <UserX size={12} /> No presentado
              </span>
            ) : (
              <>
                {!paperUrl && !aiProcessing && (
                  onUploadPaper ? (
                    <button
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onUploadPaper(); }}
                      title="Subir examen de este alumno"
                    >
                      <Upload size={12} /> Subir
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Sin examen</span>
                  )
                )}
                {/* Replace-in-progress indicator */}
                {replacing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                    <Spinner size={12} /> Reemplazando
                  </span>
                )}
                {/* "Corregir IA" — clickable shortcut to run AI on this paper. */}
                {!replacing && !expanded && !hasAI && !aiProcessing && paperUrl && selectedStudentId && onProcessAI && (
                  <button
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onProcessAI(); }}
                    title="Corregir este examen con IA"
                  >
                    <Sparkles size={12} /> Corregir IA
                  </button>
                )}
                {aiProcessing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700">
                    <Spinner size={12} /> Corrigiendo
                  </span>
                )}
                {grade !== null && grade !== undefined ? (
                  <span className={`scan-card-collapsed-grade ${(grade / maxScore) >= 0.5 ? 'scan-card-collapsed-grade--pass' : 'scan-card-collapsed-grade--fail'}`}>
                    {grade}/{maxScore}
                  </span>
                ) : (
                  <span className="scan-card-collapsed-grade scan-card-collapsed-grade--pending">—/{maxScore}</span>
                )}
                {saved && !hasGradeChanged && <CheckCircle size={16} className="text-emerald-600" />}
                {hasAI && !aiProcessing && <Sparkles size={14} className="text-indigo-500" />}
              </>
            )}
            {showKebab && (
              <details
                ref={kebabRef}
                className="scan-card-kebab"
                onClick={(e) => e.stopPropagation()}
              >
                <summary
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors list-none cursor-pointer"
                  title="Acciones"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical size={14} />
                </summary>
                <div className="scan-card-kebab__menu">
                  {!notTaken && paperUrl && onReplacePaper && (
                    <button
                      type="button"
                      className="scan-card-kebab__item"
                      onClick={() => { closeKebab(); onReplacePaper(); }}
                    >
                      <RefreshCw size={14} /> Reemplazar entrega
                    </button>
                  )}
                  {!notTaken && !paperUrl && onUploadPaper && (
                    <button
                      type="button"
                      className="scan-card-kebab__item"
                      onClick={() => { closeKebab(); onUploadPaper(); }}
                    >
                      <Upload size={14} /> Subir entrega
                    </button>
                  )}
                  {!notTaken && onMarkNotTaken && (
                    <button
                      type="button"
                      className="scan-card-kebab__item"
                      onClick={() => { closeKebab(); onMarkNotTaken(); }}
                    >
                      <UserX size={14} /> Marcar como no presentado
                    </button>
                  )}
                  {notTaken && onUnmarkNotTaken && (
                    <button
                      type="button"
                      className="scan-card-kebab__item"
                      onClick={() => { closeKebab(); onUnmarkNotTaken(); }}
                    >
                      <RotateCcw size={14} /> Marcar como presentado
                    </button>
                  )}
                  {onDelete && !onMarkNotTaken && (
                    <button
                      type="button"
                      className="scan-card-kebab__item scan-card-kebab__item--danger"
                      onClick={() => { closeKebab(); onDelete(); }}
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                  )}
                </div>
              </details>
            )}
            {expanded ? <ChevronUp size={16} className="scan-card-collapsed-chevron" /> : <ChevronDown size={16} className="scan-card-collapsed-chevron" />}
          </div>
        </div>

        {/* Collapsed status bar preview */}
        {!expanded && hasAI && aiAnalysis.questions && aiAnalysis.questions.length > 0 && (
          <div className="scan-card-collapsed-bar" onClick={() => setExpanded(!expanded)}>
            <QuestionStatusBar questions={aiAnalysis.questions} />
          </div>
        )}

        {/* Expanded content — collapsed (and gated) when student is NP */}
        {expanded && !notTaken && (
          <div className="scan-card-expanded">
            <div className="scan-card-top-row">
              <div className="scan-card-index-group">
                {onPreviewPaper && (
                  <span className="scan-card-index" onClick={onPreviewPaper} style={{ cursor: 'pointer' }}>
                    <Image size={12} className="scan-card-preview-icon" />
                  </span>
                )}
                {onDownloadPaper && paperUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDownloadPaper}
                    className="scan-card-download-btn"
                    title="Descargar examen"
                  >
                    <Download size={16} />
                  </Button>
                )}
                {onDelete && !showKebab && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    className="scan-card-download-btn text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>

              {standalone ? (
                <Input
                  value={studentName || ''}
                  onChange={(e) => onStudentNameChange?.(e.target.value)}
                  placeholder="Nombre del alumno"
                  className="scan-card-student-select"
                  disabled={saved}
                />
              ) : (
                <Select
                  value={selectedStudentId}
                  onValueChange={onStudentChange}
                  disabled={saved}
                >
                  <SelectTrigger className="scan-card-student-select">
                    <SelectValue placeholder="Alumno" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className={`scan-card-grade-inline ${hasGradeChanged ? 'scan-card-grade-modified' : ''}`}>
                <Input
                  type="number"
                  min={0}
                  max={maxScore}
                  value={grade ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= maxScore) onGradeChange(val);
                  }}
                  className="scan-card-grade-input"
                />
                <span className="scan-card-max">/{maxScore}</span>
              </div>

              {saved && !hasGradeChanged ? (
                <Badge variant="default" className="scan-card-status bg-emerald-600">✓</Badge>
              ) : (
                <>
                  {autoSaved && (
                    <span className="scan-card-autosaved">Guardado automáticamente</span>
                  )}
                  <Button
                    size="sm"
                    onClick={onSave}
                    disabled={grade === null || (!standalone && !selectedStudentId) || saving}
                    className="scan-card-save-btn"
                    variant={hasGradeChanged ? 'outline' : 'default'}
                  >
                    {saving ? <Spinner size={16} /> : hasGradeChanged ? 'Actualizar' : 'Guardar'}
                  </Button>
                </>
              )}
            </div>

            {aiAnalysis?.suggestedStudentName && !selectedStudentId && (
              <div className="scan-card-ai-hint">
                <Sparkles size={14} className="text-indigo-500" />
                <span>IA: {aiAnalysis.suggestedStudentName} ({Math.round(confidence * 100)}%)</span>
              </div>
            )}

            {hasAnyAIContent && (
              <div className="scan-card-ai-section">
                {totalQuestions > 0 && (
                  <>
                    <div className="scan-card-ai-header">
                      <div className="scan-card-ai-stats">
                        <Sparkles size={14} className="text-indigo-500" />
                        <span className="scan-card-ai-label">Análisis IA</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {onDownloadReport && (
                          <button onClick={onDownloadReport} className="scan-card-report-link" type="button">
                            <FileText size={14} /> Informe
                          </button>
                        )}
                        {correctPercent !== null && (
                          <span className={`scan-card-pct ${correctPercent >= 50 ? 'scan-card-pct-pass' : 'scan-card-pct-fail'}`}>
                            {correctPercent}%
                          </span>
                        )}
                      </div>
                    </div>

                    <QuestionStatusBar questions={aiAnalysis.questions} />

                    {blankCount > 0 && (
                      <div className="scan-card-blank-warning">
                        <HelpCircle size={14} />
                        <span>{blankCount} pregunta{blankCount > 1 ? 's' : ''} sin responder</span>
                      </div>
                    )}

                    <QuestionBreakdown questions={aiAnalysis.questions} />
                  </>
                )}

                {totalQuestions === 0 && (
                  <div className="scan-card-ai-header">
                    <div className="scan-card-ai-stats">
                      <Sparkles size={14} className="text-indigo-500" />
                      <span className="scan-card-ai-label">Análisis IA</span>
                    </div>
                  </div>
                )}

                {/* Summary + weak areas in a compact row */}
                {(aiAnalysis.summary || (aiAnalysis.weakAreas && aiAnalysis.weakAreas.length > 0)) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {aiAnalysis.summary && (
                      <span className="text-[11px] text-muted-foreground">{aiAnalysis.summary}</span>
                    )}
                    {aiAnalysis.weakAreas && aiAnalysis.weakAreas.length > 0 && aiAnalysis.weakAreas.map((area, idx) => (
                      <span key={idx} className="scan-card-weak-tag">{area}</span>
                    ))}
                  </div>
                )}

              </div>
            )}

            {!hasAnyAIContent && onProcessAI && (
              <div className="mt-2">
                {aiProcessing ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-indigo-50 border border-indigo-100">
                    <Spinner size={14} />
                    <span className="text-xs text-indigo-600 font-medium">Corrigiendo con IA...</span>
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onProcessAI}
                      className="scan-card-ai-btn"
                      disabled={(!standalone && !selectedStudentId) || !paperUrl}
                    >
                      <Sparkles size={16} /> Corregir con IA
                    </Button>
                    {!paperUrl && (
                      <p className="scan-card-assign-hint">Sube el examen del alumno para poder corregir</p>
                    )}
                    {paperUrl && !standalone && !selectedStudentId && (
                      <p className="scan-card-assign-hint">Asigna un alumno para corregir con IA</p>
                    )}
                  </>
                )}
              </div>
            )}

            {aiError && (
              <div className="scan-card-ai-error">
                <XCircle size={14} className="text-red-600 flex-shrink-0" />
                <span>{aiError}</span>
              </div>
            )}

            {!saved && (
              <div className="scan-card-notes-item">
                <Textarea
                  value={teacherComments}
                  placeholder="Comentarios (opcional)"
                  onChange={(e) => onCommentsChange(e.target.value)}
                  disabled={saved}
                  rows={1}
                />
              </div>
            )}

            {saved && teacherComments && (
              <p className="scan-card-notes-display">{teacherComments}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanCard;
