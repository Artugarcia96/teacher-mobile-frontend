import { useState } from 'react';
import { IonIcon, IonButton, IonInput, IonSpinner } from '@ionic/react';
import { chevronDownOutline, chevronUpOutline, expandOutline, documentTextOutline, warningOutline, downloadOutline, pencilOutline, checkmarkOutline, closeOutline } from 'ionicons/icons';
import { AIAnalysis } from '../types';
import { questionStatusConfig } from '../utils/statusConfig';
import { QuestionStatusBar } from './charts';
import './CorrectionReviewCard.css';

interface Props {
  index: number;
  studentName: string;
  grade: number | null;
  maxScore: number;
  teacherNotes?: string;
  weakAreas?: string[];
  aiAnalysis?: AIAnalysis;
  aiProcessed?: boolean;
  highlighted?: boolean;
  paperUrl?: string;
  onPreviewPaper?: () => void;
  onDownloadPaper?: () => void;
  onGradeChange?: (newGrade: number) => void;
  savingGrade?: boolean;
}

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(jpe?g|png|gif|webp)(\?.*)?$/.test(lower);
}

const CorrectionReviewCard: React.FC<Props> = ({
  studentName, grade, maxScore, teacherNotes, weakAreas, aiAnalysis, aiProcessed, highlighted, paperUrl, onPreviewPaper, onDownloadPaper, onGradeChange, savingGrade
}) => {
  const hasContent = !!(aiAnalysis?.questions.length) || !!teacherNotes || !!aiAnalysis?.summary
    || (weakAreas && weakAreas.length > 0) || !!paperUrl;
  const [expanded, setExpanded] = useState(highlighted || false);
  const [showDetails, setShowDetails] = useState(false);
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
  const hasDetailContent = (totalQuestions > 0) || !!teacherNotes || !!aiAnalysis?.summary;

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
          {/* Level 1: Summary strip */}
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

              {weakAreas && weakAreas.length > 0 && (
                <div className="rv-row__weak-tags">
                  {weakAreas.map((area, idx) => (
                    <span key={idx} className="rv-row__weak-tag">{area}</span>
                  ))}
                </div>
              )}

              {noGrade && !aiProcessed && totalQuestions === 0 && (
                <div className="rv-row__no-ai-msg">
                  <IonIcon icon={warningOutline} color="warning" />
                  <span>Sin analizar — cambia a modo "Editar" para procesar con IA</span>
                </div>
              )}
            </div>
          </div>

          {/* Level 2: Details toggle */}
          {hasDetailContent && (
            <>
              <button
                className="rv-row__details-toggle"
                onClick={() => setShowDetails(!showDetails)}
                type="button"
              >
                {showDetails ? 'Ocultar detalles' : 'Ver detalles'}
                <IonIcon icon={showDetails ? chevronUpOutline : chevronDownOutline} />
              </button>

              {showDetails && (
                <div className="rv-row__details">
                  {aiAnalysis && totalQuestions > 0 && (
                    <div className="rv-row__questions">
                      {aiAnalysis.questions.map((q) => {
                        const cfg = questionStatusConfig[q.status] || questionStatusConfig.blank;
                        return (
                          <div key={q.id} className={`rv-row__q rv-row__q--${q.status}`}>
                            <div className="rv-row__q-head">
                              <IonIcon icon={cfg.icon} color={cfg.color} />
                              <span className="rv-row__q-id">P{q.id}</span>
                            </div>
                            {q.feedback && <span className="rv-row__q-feedback">{q.feedback}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {teacherNotes && (
                    <div className="rv-row__section">
                      <span className="rv-row__section-label">Notas del profesor</span>
                      <p className="rv-row__section-text">{teacherNotes}</p>
                    </div>
                  )}

                  {aiAnalysis?.summary && (
                    <div className="rv-row__section">
                      <span className="rv-row__section-label">Resumen IA</span>
                      <p className="rv-row__section-text">{aiAnalysis.summary}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CorrectionReviewCard;
