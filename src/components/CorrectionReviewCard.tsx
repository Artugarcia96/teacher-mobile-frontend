import { useState } from 'react';
import { IonCard, IonCardContent, IonBadge, IonIcon } from '@ionic/react';
import { checkmarkCircle, closeCircle, alertCircle, helpCircle, chevronDownOutline, chevronUpOutline, documentTextOutline, expandOutline } from 'ionicons/icons';
import { AIAnalysis } from '../types';
import './CorrectionReviewCard.css';

interface Props {
  index: number;
  studentName: string;
  grade: number | null;
  maxScore: number;
  teacherNotes?: string;
  weakAreas?: string[];
  aiAnalysis?: AIAnalysis;
  highlighted?: boolean;
  paperUrl?: string;
  onPreviewPaper?: () => void;
}

const statusConfig = {
  correct: { icon: checkmarkCircle, color: 'success', label: 'Correcto' },
  partial: { icon: alertCircle, color: 'warning', label: 'Parcial' },
  incorrect: { icon: closeCircle, color: 'danger', label: 'Incorrecto' },
  blank: { icon: helpCircle, color: 'medium', label: 'Sin respuesta' },
};

const CorrectionReviewCard: React.FC<Props> = ({
  index, studentName, grade, maxScore, teacherNotes, weakAreas, aiAnalysis, highlighted, paperUrl, onPreviewPaper
}) => {
  const [showDetails, setShowDetails] = useState(highlighted || false);
  
  const passed = grade !== null && grade / maxScore >= 0.5;
  const gradePercent = grade !== null ? (grade / maxScore) * 100 : null;
  
  const questionStats = aiAnalysis?.questions.reduce(
    (acc, q) => {
      acc[q.status] = (acc[q.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  ) || {};

  const totalQuestions = aiAnalysis?.questions.length || 0;
  const blankCount = questionStats.blank || 0;
  const hasQuestionDetails = !!(aiAnalysis?.questions.length);
  const hasNotes = !!teacherNotes;
  const hasSummary = !!aiAnalysis?.summary;

  const correctPercent = totalQuestions > 0
    ? Math.round((((questionStats.correct || 0) + (questionStats.partial || 0) * 0.5) / totalQuestions) * 100)
    : null;

  return (
    <IonCard className={`review-card ${highlighted ? 'review-card-highlighted' : ''} ${passed ? 'review-card-passed' : 'review-card-failed'}`}>
      <IonCardContent className="review-card-content">
        <div className="review-card-main">
          {/* Paper thumbnail */}
          {paperUrl && (
            <div className="review-card-thumb" onClick={onPreviewPaper}>
              <img src={paperUrl} alt="Examen" />
              <div className="review-card-thumb-overlay">
                <IonIcon icon={expandOutline} />
              </div>
            </div>
          )}
          
          <div className="review-card-info">
            {/* Header: index, name, grade */}
            <div className="review-card-header">
              <div className="review-card-identity">
                <span className="review-card-index">#{index + 1}</span>
                <span className="review-card-name">{studentName}</span>
              </div>
              <div className="review-card-grades">
                {correctPercent !== null && (
                  <span className={`review-card-ai-pct ${correctPercent >= 50 ? 'review-pct-pass' : 'review-pct-fail'}`}>
                    {correctPercent}%
                  </span>
                )}
                <div className={`review-card-grade-box ${passed ? 'grade-box-pass' : 'grade-box-fail'}`}>
                  <span className="grade-value">{grade ?? '—'}</span>
                  <span className="grade-max">/{maxScore}</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            {gradePercent !== null && (
              <div className="review-card-progress">
                <div 
                  className={`review-card-progress-bar ${passed ? 'progress-pass' : 'progress-fail'}`}
                  style={{ width: `${gradePercent}%` }}
                />
              </div>
            )}

            {/* Quick stats row - always visible when AI data exists */}
            {aiAnalysis && totalQuestions > 0 && (
              <div className="review-card-quick-stats">
                <div className="review-card-stat-badges">
                  {questionStats.correct !== undefined && questionStats.correct > 0 && <IonBadge color="success">{questionStats.correct} ✓</IonBadge>}
                  {questionStats.partial !== undefined && questionStats.partial > 0 && <IonBadge color="warning">{questionStats.partial} ~</IonBadge>}
                  {questionStats.incorrect !== undefined && questionStats.incorrect > 0 && <IonBadge color="danger">{questionStats.incorrect} ✗</IonBadge>}
                  {questionStats.blank !== undefined && questionStats.blank > 0 && <IonBadge color="medium">{questionStats.blank} —</IonBadge>}
                </div>
                {blankCount > 0 && (
                  <span className="review-card-blank-note">
                    {blankCount} sin responder
                  </span>
                )}
              </div>
            )}

            {/* Weak areas - show upfront if exist */}
            {weakAreas && weakAreas.length > 0 && (
              <div className="review-card-weak-inline">
                {weakAreas.slice(0, 3).map((area, idx) => (
                  <span key={idx} className="review-weak-tag-inline">{area}</span>
                ))}
                {weakAreas.length > 3 && <span className="review-weak-more">+{weakAreas.length - 3}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Expandable action row */}
        <div className="review-card-actions">
          {(hasQuestionDetails || hasNotes || hasSummary) && (
            <button 
              className="review-card-toggle-btn" 
              onClick={() => setShowDetails(!showDetails)}
            >
              <IonIcon icon={documentTextOutline} />
              <span>{showDetails ? 'Ocultar' : 'Ver'} detalles</span>
              <IonIcon icon={showDetails ? chevronUpOutline : chevronDownOutline} className="toggle-chevron" />
            </button>
          )}
          {onPreviewPaper && !paperUrl && (
            <button className="review-card-view-btn" onClick={onPreviewPaper}>
              <IonIcon icon={expandOutline} />
              <span>Ver examen</span>
            </button>
          )}
        </div>

        {showDetails && (
          <div className="review-card-details">
            {/* Question breakdown */}
            {aiAnalysis && aiAnalysis.questions.length > 0 && (
              <div className="review-card-questions">
                <div className="review-questions-grid">
                  {aiAnalysis.questions.map((q) => {
                    const cfg = statusConfig[q.status] || statusConfig.blank;
                    return (
                      <div key={q.id} className={`review-question-compact review-question-${q.status}`}>
                        <div className="review-q-header">
                          <IonIcon icon={cfg.icon} color={cfg.color} />
                          <span className="review-q-id">P{q.id}</span>
                        </div>
                        {q.feedback && <span className="review-q-feedback-compact">{q.feedback}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Teacher notes */}
            {teacherNotes && (
              <div className="review-card-notes">
                <span className="notes-label">Notas del profesor</span>
                <p className="notes-text">{teacherNotes}</p>
              </div>
            )}

            {/* AI summary */}
            {aiAnalysis?.summary && (
              <div className="review-card-ai-summary">
                <span className="summary-label">Resumen IA</span>
                <p className="summary-text">{aiAnalysis.summary}</p>
              </div>
            )}
          </div>
        )}
      </IonCardContent>
    </IonCard>
  );
};

export default CorrectionReviewCard;
