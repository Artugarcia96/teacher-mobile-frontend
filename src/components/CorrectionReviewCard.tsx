import { useState } from 'react';
import { IonIcon, IonButton, IonInput, IonSpinner } from '@ionic/react';
import { chevronDownOutline, chevronUpOutline, expandOutline, documentTextOutline, warningOutline, downloadOutline, pencilOutline, checkmarkOutline, closeOutline, alertCircleOutline, chatbubbleOutline } from 'ionicons/icons';
import { AIAnalysis } from '../types';
import { questionStatusConfig } from '../utils/statusConfig';
import { QuestionStatusBar } from './charts';
import './CorrectionReviewCard.css';

interface Props {
  index: number;
  studentName: string;
  grade: number | null;
  maxScore: number;
  teacherComments?: string;
  weakAreas?: string[];
  aiAnalysis?: AIAnalysis;
  aiProcessed?: boolean;
  highlighted?: boolean;
  paperUrl?: string;
  onPreviewPaper?: () => void;
  onDownloadPaper?: () => void;
  onDownloadReport?: () => void;
  onGradeChange?: (newGrade: number) => void;
  savingGrade?: boolean;
  onAddComment?: () => void;
}

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/.test(lower);
}

/* ─── Question Grid with expandable feedback ─── */
const RV_FEEDBACK_THRESHOLD = 50;

const ReviewQuestionGrid: React.FC<{ questions: AIAnalysis['questions'] }> = ({ questions }) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="rv-row__questions">
      {questions.map((q) => {
        const cfg = questionStatusConfig[q.status] || questionStatusConfig.blank;
        const isLong = (q.feedback?.length || 0) > RV_FEEDBACK_THRESHOLD;
        const isExpanded = expandedIds.has(q.id);

        return (
          <div key={q.id} className={`rv-row__q rv-row__q--${q.status}`}>
            <div className="rv-row__q-head">
              <IonIcon icon={cfg.icon} color={cfg.color} />
              <span className="rv-row__q-id">P{q.id}</span>
              <span className={`rv-row__q-badge rv-row__q-badge--${q.status}`}>{cfg.label}</span>
            </div>
            {q.feedback && (
              <span
                className={`rv-row__q-feedback ${!isExpanded && isLong ? 'rv-row__q-feedback--clamped' : ''}`}
                onClick={() => isLong && toggle(q.id)}
              >
                {q.feedback}
              </span>
            )}
            {isLong && (
              <button className="rv-row__q-toggle" onClick={() => toggle(q.id)}>
                {isExpanded ? 'Menos' : 'Más'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

const CorrectionReviewCard: React.FC<Props> = ({
  studentName, grade, maxScore, teacherComments, weakAreas, aiAnalysis, aiProcessed, highlighted, paperUrl, onPreviewPaper, onDownloadPaper, onDownloadReport, onGradeChange, savingGrade, onAddComment
}) => {
  const hasContent = !!(aiAnalysis?.questions.length) || !!teacherComments || !!aiAnalysis?.summary
    || (weakAreas && weakAreas.length > 0) || !!paperUrl;
  const [expanded, setExpanded] = useState(highlighted || false);
  const [isEditingGrade, setIsEditingGrade] = useState(false);
  const [editedGrade, setEditedGrade] = useState<number | null>(grade);

  const passed = grade !== null && grade / maxScore >= 0.5;
  const gradePercent = grade !== null ? Math.round((grade / maxScore) * 100) : null;
  const noGrade = grade === null;

  const handleGradeSave = () => {
    if (editedGrade !== null && onGradeChange) {
      onGradeChange(editedGrade);
    }
    setIsEditingGrade(false);
  };

  const handleGradeCancel = () => {
    setEditedGrade(grade);
    setIsEditingGrade(false);
  };

  const totalQuestions = aiAnalysis?.questions.length || 0;
  const showThumb = paperUrl && isImageUrl(paperUrl);
  const showPdfLink = paperUrl && !isImageUrl(paperUrl);

  return (
    <div className={`rv-row ${expanded ? 'rv-row--open' : ''} ${highlighted ? 'rv-row--highlighted' : ''} ${noGrade ? 'rv-row--no-grade' : ''}`}>
      <button className="rv-row__header" onClick={() => hasContent && setExpanded(!expanded)}>
        <div className="rv-row__left">
          <span className="rv-row__name">{studentName}</span>
          {/* Compact QuestionStatusBar in collapsed state */}
          {!expanded && aiAnalysis && totalQuestions > 0 && (
            <div className="rv-row__inline-bar">
              <QuestionStatusBar questions={aiAnalysis.questions} compact showLegend={false} />
            </div>
          )}
          {!expanded && noGrade && !aiProcessed && !(aiAnalysis && totalQuestions > 0) && (
            <span className="rv-row__pending-hint">
              <IonIcon icon={warningOutline} /> Pendiente de corrección
            </span>
          )}
          {!expanded && !noGrade && (!aiAnalysis || totalQuestions === 0) && weakAreas && weakAreas.length > 0 && (
            <span className="rv-row__weak-hint">{weakAreas.slice(0, 2).join(', ')}</span>
          )}
        </div>
        <div className="rv-row__right">
          {gradePercent !== null && !isEditingGrade && (
            <span className={`rv-row__pct ${passed ? 'rv-row__pct--pass' : 'rv-row__pct--fail'}`}>
              {gradePercent}%
            </span>
          )}
          {isEditingGrade ? (
            <div className="rv-row__grade-edit" onClick={(e) => e.stopPropagation()}>
              <IonInput
                type="number"
                min={0}
                max={maxScore}
                value={editedGrade ?? ''}
                placeholder="—"
                onIonInput={(e) => {
                  const val = parseFloat(e.detail.value ?? '');
                  if (!isNaN(val)) setEditedGrade(val);
                }}
                className="rv-row__grade-input"
              />
              <span className="rv-row__grade-max">/{maxScore}</span>
              <IonButton fill="clear" size="small" onClick={handleGradeSave} disabled={savingGrade}>
                {savingGrade ? <IonSpinner name="crescent" /> : <IonIcon icon={checkmarkOutline} color="success" />}
              </IonButton>
              <IonButton fill="clear" size="small" onClick={handleGradeCancel}>
                <IonIcon icon={closeOutline} color="medium" />
              </IonButton>
            </div>
          ) : (
            <div className="rv-row__grade-display" onClick={(e) => { e.stopPropagation(); if (onGradeChange) setIsEditingGrade(true); }}>
              <span className={`rv-row__grade ${noGrade ? 'rv-row__grade--none' : passed ? 'rv-row__grade--pass' : 'rv-row__grade--fail'}`}>
                {grade !== null ? grade : '—'}<span className="rv-row__grade-max">/{maxScore}</span>
              </span>
              {onGradeChange && (
                <IonIcon icon={pencilOutline} className="rv-row__edit-icon" />
              )}
            </div>
          )}
          {hasContent && (
            <IonIcon icon={expanded ? chevronUpOutline : chevronDownOutline} className="rv-row__chevron" />
          )}
        </div>
      </button>

      {expanded && hasContent && (
        <div className="rv-row__body">
          {/* Paper actions */}
          <div className="rv-row__summary-strip">
            {showThumb && (
              <div className="rv-row__thumb" onClick={onPreviewPaper}>
                <img src={paperUrl} alt="Examen" />
                <div className="rv-row__thumb-overlay">
                  <IonIcon icon={expandOutline} />
                </div>
              </div>
            )}
            {showPdfLink && (
              <div className="rv-row__pdf-actions">
                <button className="rv-row__pdf-link" onClick={onPreviewPaper} type="button">
                  <IonIcon icon={documentTextOutline} />
                  <span>Ver</span>
                </button>
                {onDownloadPaper && (
                  <button className="rv-row__pdf-link rv-row__pdf-link--download" onClick={onDownloadPaper} type="button">
                    <IonIcon icon={downloadOutline} />
                  </button>
                )}
                {onDownloadReport && aiProcessed && (
                  <button className="rv-row__pdf-link rv-row__pdf-link--download" onClick={onDownloadReport} type="button" title="Descargar informe">
                    <IonIcon icon={documentTextOutline} />
                  </button>
                )}
              </div>
            )}
            {showThumb && onDownloadPaper && (
              <button className="rv-row__download-btn" onClick={onDownloadPaper} type="button">
                <IonIcon icon={downloadOutline} />
              </button>
            )}

            <div className="rv-row__summary-content">
              {aiAnalysis && totalQuestions > 0 && (
                <QuestionStatusBar questions={aiAnalysis.questions} />
              )}

              {noGrade && !aiProcessed && totalQuestions === 0 && (
                <div className="rv-row__no-ai-msg">
                  <IonIcon icon={warningOutline} color="warning" />
                  <span>Sin analizar — cambia a modo "Editar" para procesar con IA</span>
                </div>
              )}
            </div>
          </div>

          {/* Questions - shown directly, no toggle */}
          {aiAnalysis && totalQuestions > 0 && (
            <ReviewQuestionGrid questions={aiAnalysis.questions} />
          )}

          {/* Weak areas */}
          {weakAreas && weakAreas.length > 0 && (
            <div className="rv-row__weak-section">
              <span className="rv-row__weak-label">
                <IonIcon icon={alertCircleOutline} /> Áreas débiles
              </span>
              <div className="rv-row__weak-tags">
                {weakAreas.map((area, idx) => (
                  <span key={idx} className="rv-row__weak-tag">{area}</span>
                ))}
              </div>
            </div>
          )}

          {/* Teacher comments */}
          {teacherComments && (
            <div className="rv-row__section">
              <span className="rv-row__section-label">Comentarios del profesor</span>
              <p className="rv-row__section-text">{teacherComments}</p>
            </div>
          )}

          {/* AI Summary */}
          {aiAnalysis?.summary && (
            <div className="rv-row__section">
              <span className="rv-row__section-label">Resumen IA</span>
              <p className="rv-row__section-text">{aiAnalysis.summary}</p>
            </div>
          )}

          {/* Add comment action */}
          {onAddComment && (
            <button className="rv-row__comment-btn" onClick={(e) => { e.stopPropagation(); onAddComment(); }}>
              <IonIcon icon={chatbubbleOutline} />
              <span>Añadir comentario</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default CorrectionReviewCard;
