import { useState, useEffect, useRef } from 'react';
import { IonCard, IonCardContent, IonSelect, IonSelectOption, IonInput, IonButton, IonBadge, IonItem, IonTextarea, IonSpinner, IonIcon } from '@ionic/react';
import { closeCircle, sparkles, imageOutline, downloadOutline, documentTextOutline, helpCircle, trashOutline, chevronDownOutline, chevronUpOutline, checkmarkCircleOutline, alertCircleOutline } from 'ionicons/icons';
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
}

function getCorrectPercent(questions: AIAnalysis['questions']): number | null {
  if (!questions || questions.length === 0) return null;
  const correct = questions.filter((q) => q.status === 'correct').length;
  const partial = questions.filter((q) => q.status === 'partial').length;
  return Math.round(((correct + partial * 0.5) / questions.length) * 100);
}

/* ─── Question Breakdown: mini-cards with expandable feedback ─── */
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

        return (
          <div
            key={q.id}
            className={`scan-q-card scan-q-card--${q.status}`}
            onClick={() => q.feedback && isLong ? toggle(q.id) : undefined}
          >
            <div className="scan-q-card__header">
              <IonIcon icon={cfg.icon} color={cfg.color} className="scan-q-card__icon" />
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
  paperUrl, onStudentChange, onGradeChange, onCommentsChange, onSave, onProcessAI, onPreviewPaper, onDownloadPaper, onDownloadReport, onDelete,
}) => {
  const [expanded, setExpanded] = useState(!saved);
  const wasProcessing = useRef(false);
  const hasAI = !!aiAnalysis;

  // Auto-collapse card when AI analysis finishes
  useEffect(() => {
    if (wasProcessing.current && !aiProcessing && hasAI) {
      setExpanded(false);
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

  const studentName = students.find(s => s.id === selectedStudentId)?.name;

  return (
    <IonCard className={`scan-card ${saved ? 'scan-card-saved' : ''} ${hasGradeChanged ? 'scan-card-modified' : ''} ${aiProcessing ? 'scan-card-ai-active' : ''}`}>
      <IonCardContent className="scan-card-content">
        {/* Collapsed header — always visible */}
        <div className="scan-card-collapsed-header" onClick={() => setExpanded(!expanded)}>
          <span className="scan-card-index">#{index + 1}</span>
          <span className="scan-card-collapsed-name">
            {studentName || 'Sin asignar'}
          </span>
          <div className="scan-card-collapsed-right">
            {grade !== null && grade !== undefined ? (
              <span className={`scan-card-collapsed-grade ${(grade / maxScore) >= 0.5 ? 'scan-card-collapsed-grade--pass' : 'scan-card-collapsed-grade--fail'}`}>
                {grade}/{maxScore}
              </span>
            ) : (
              <span className="scan-card-collapsed-grade scan-card-collapsed-grade--pending">—/{maxScore}</span>
            )}
            {saved && !hasGradeChanged && <IonIcon icon={checkmarkCircleOutline} color="success" className="scan-card-collapsed-check" />}
            {hasAI && <IonIcon icon={sparkles} color="tertiary" className="scan-card-collapsed-ai" />}
            <IonIcon icon={expanded ? chevronUpOutline : chevronDownOutline} className="scan-card-collapsed-chevron" />
          </div>
        </div>

        {/* Collapsed status bar preview */}
        {!expanded && hasAI && aiAnalysis.questions && aiAnalysis.questions.length > 0 && (
          <div className="scan-card-collapsed-bar" onClick={() => setExpanded(!expanded)}>
            <QuestionStatusBar questions={aiAnalysis.questions} />
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div className="scan-card-expanded">
            <div className="scan-card-top-row">
              <div className="scan-card-index-group">
                {onPreviewPaper && (
                  <span className="scan-card-index" onClick={onPreviewPaper} style={{ cursor: 'pointer' }}>
                    <IonIcon icon={imageOutline} className="scan-card-preview-icon" />
                  </span>
                )}
                {onDownloadPaper && paperUrl && (
                  <IonButton
                    fill="clear"
                    size="small"
                    onClick={onDownloadPaper}
                    className="scan-card-download-btn"
                    title="Descargar examen"
                  >
                    <IonIcon icon={downloadOutline} slot="icon-only" />
                  </IonButton>
                )}
                {onDelete && (
                  <IonButton
                    fill="clear"
                    size="small"
                    color="danger"
                    onClick={onDelete}
                    className="scan-card-download-btn"
                    title="Eliminar"
                  >
                    <IonIcon icon={trashOutline} slot="icon-only" />
                  </IonButton>
                )}
              </div>

              <IonSelect
                value={selectedStudentId}
                onIonChange={(e) => onStudentChange(e.detail.value)}
                interface="popover"
                disabled={saved}
                placeholder="Alumno"
                className="scan-card-student-select"
              >
                {students.map((s) => (
                  <IonSelectOption key={s.id} value={s.id}>{s.name}</IonSelectOption>
                ))}
              </IonSelect>

              <div className={`scan-card-grade-inline ${hasGradeChanged ? 'scan-card-grade-modified' : ''}`}>
                <IonInput
                  type="number"
                  min={0}
                  max={maxScore}
                  value={grade ?? ''}
                  placeholder="—"
                  onIonInput={(e) => {
                    const val = parseFloat(e.detail.value ?? '');
                    if (!isNaN(val)) onGradeChange(val);
                  }}
                  className="scan-card-grade-input"
                />
                <span className="scan-card-max">/{maxScore}</span>
              </div>

              {saved && !hasGradeChanged ? (
                <IonBadge color="success" className="scan-card-status">✓</IonBadge>
              ) : (
                <>
                  {autoSaved && (
                    <span className="scan-card-autosaved">Guardado automáticamente</span>
                  )}
                  <IonButton
                    size="small"
                    onClick={onSave}
                    disabled={grade === null || !selectedStudentId || saving}
                    className="scan-card-save-btn"
                    color={hasGradeChanged ? 'warning' : 'primary'}
                  >
                    {saving ? <IonSpinner name="crescent" /> : hasGradeChanged ? 'Actualizar' : 'Guardar'}
                  </IonButton>
                </>
              )}
            </div>

            {aiAnalysis?.suggestedStudentName && !selectedStudentId && (
              <div className="scan-card-ai-hint">
                <IonIcon icon={sparkles} color="tertiary" />
                <span>IA: {aiAnalysis.suggestedStudentName} ({Math.round(confidence * 100)}%)</span>
              </div>
            )}

            {hasAnyAIContent && (
              <div className="scan-card-ai-section">
                {totalQuestions > 0 && (
                  <>
                    <div className="scan-card-ai-header">
                      <div className="scan-card-ai-stats">
                        <IonIcon icon={sparkles} color="tertiary" />
                        <span className="scan-card-ai-label">Análisis IA</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {onDownloadReport && (
                          <button onClick={onDownloadReport} className="scan-card-report-link" type="button">
                            <IonIcon icon={documentTextOutline} /> Informe
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
                        <IonIcon icon={helpCircle} />
                        <span>{blankCount} pregunta{blankCount > 1 ? 's' : ''} sin responder</span>
                      </div>
                    )}

                    <QuestionBreakdown questions={aiAnalysis.questions} />
                  </>
                )}

                {totalQuestions === 0 && (
                  <div className="scan-card-ai-header">
                    <div className="scan-card-ai-stats">
                      <IonIcon icon={sparkles} color="tertiary" />
                      <span className="scan-card-ai-label">Análisis IA</span>
                    </div>
                  </div>
                )}

                {aiAnalysis.weakAreas && aiAnalysis.weakAreas.length > 0 && (
                  <div className="scan-card-weak-areas">
                    {aiAnalysis.weakAreas.map((area, idx) => (
                      <span key={idx} className="scan-card-weak-tag">{area}</span>
                    ))}
                  </div>
                )}

                {aiAnalysis.summary && (
                  <p className="scan-card-summary">{aiAnalysis.summary}</p>
                )}

              </div>
            )}

            {!hasAnyAIContent && onProcessAI && (
              <>
                {aiProcessing ? (
                  <div className="scan-card-ai-processing">
                    <div className="scan-card-ai-processing-icon">
                      <IonIcon icon={sparkles} />
                      <span className="scan-card-ai-processing-ripple" />
                    </div>
                    <div className="scan-card-ai-processing-text">
                      <span>Analizando examen</span>
                      <span className="scan-card-ai-processing-dots">
                        <span />
                        <span />
                        <span />
                      </span>
                    </div>
                    <div className="scan-card-ai-processing-bar">
                      <div className="scan-card-ai-processing-bar-fill" />
                    </div>
                  </div>
                ) : (
                  <IonButton
                    size="small"
                    fill="outline"
                    onClick={onProcessAI}
                    className="scan-card-ai-btn"
                    disabled={!selectedStudentId}
                  >
                    <IonIcon icon={sparkles} slot="start" /> Analizar con IA
                  </IonButton>
                )}
                {!selectedStudentId && !aiProcessing && (
                  <p className="scan-card-assign-hint">Asigna un alumno para analizar con IA</p>
                )}
              </>
            )}

            {aiError && (
              <div className="scan-card-ai-error">
                <IonIcon icon={closeCircle} color="danger" />
                <span>{aiError}</span>
              </div>
            )}

            {!saved && (
              <IonItem lines="none" className="scan-card-notes-item">
                <IonTextarea
                  value={teacherComments}
                  placeholder="Comentarios (opcional)"
                  onIonInput={(e) => onCommentsChange(e.detail.value ?? '')}
                  disabled={saved}
                  rows={1}
                  autoGrow
                />
              </IonItem>
            )}

            {saved && teacherComments && (
              <p className="scan-card-notes-display">{teacherComments}</p>
            )}
          </div>
        )}
      </IonCardContent>
    </IonCard>
  );
};

export default ScanCard;
