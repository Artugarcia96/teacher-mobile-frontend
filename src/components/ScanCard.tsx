import { useState } from 'react';
import { IonCard, IonCardContent, IonSelect, IonSelectOption, IonInput, IonButton, IonBadge, IonItem, IonTextarea, IonSpinner, IonIcon } from '@ionic/react';
import { closeCircle, sparkles, chevronDownOutline, chevronUpOutline, imageOutline, downloadOutline, helpCircle } from 'ionicons/icons';
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
  teacherNotes: string;
  saved: boolean;
  saving?: boolean;
  aiProcessing?: boolean;
  aiError?: string;
  paperUrl?: string;
  onStudentChange: (studentId: string) => void;
  onGradeChange: (grade: number) => void;
  onNotesChange: (notes: string) => void;
  onSave: () => void;
  onProcessAI?: () => void;
  onPreviewPaper?: () => void;
  onDownloadPaper?: () => void;
}

function getCorrectPercent(questions: AIAnalysis['questions']): number | null {
  if (!questions || questions.length === 0) return null;
  const correct = questions.filter((q) => q.status === 'correct').length;
  const partial = questions.filter((q) => q.status === 'partial').length;
  return Math.round(((correct + partial * 0.5) / questions.length) * 100);
}

const ScanCard: React.FC<Props> = ({
  index, aiAnalysis, selectedStudentId, students,
  maxScore, grade, originalGrade, teacherNotes, saved, saving, aiProcessing, aiError,
  paperUrl, onStudentChange, onGradeChange, onNotesChange, onSave, onProcessAI, onPreviewPaper, onDownloadPaper,
}) => {
  const [showQuestionDetails, setShowQuestionDetails] = useState(false);
  const hasAI = !!aiAnalysis;
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

  return (
    <IonCard className={`scan-card ${saved ? 'scan-card-saved' : ''} ${hasGradeChanged ? 'scan-card-modified' : ''}`}>
      <IonCardContent className="scan-card-content">
        <div className="scan-card-top-row">
          <div className="scan-card-index-group">
            <span className="scan-card-index" onClick={onPreviewPaper} style={onPreviewPaper ? { cursor: 'pointer' } : undefined}>
              #{index + 1}
              {onPreviewPaper && <IonIcon icon={imageOutline} className="scan-card-preview-icon" />}
            </span>
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
            <IonButton
              size="small"
              onClick={onSave}
              disabled={grade === null || !selectedStudentId || saving}
              className="scan-card-save-btn"
              color={hasGradeChanged ? 'warning' : 'primary'}
            >
              {saving ? <IonSpinner name="crescent" /> : hasGradeChanged ? 'Actualizar' : 'Guardar'}
            </IonButton>
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
            {/* QuestionStatusBar replaces verbose question list */}
            {totalQuestions > 0 && (
              <>
                <div className="scan-card-ai-header">
                  <div className="scan-card-ai-stats">
                    <IonIcon icon={sparkles} color="tertiary" />
                    <span className="scan-card-ai-label">Análisis IA</span>
                  </div>
                  {correctPercent !== null && (
                    <span className={`scan-card-pct ${correctPercent >= 50 ? 'scan-card-pct-pass' : 'scan-card-pct-fail'}`}>
                      {correctPercent}%
                    </span>
                  )}
                </div>

                <QuestionStatusBar questions={aiAnalysis.questions} />

                {blankCount > 0 && (
                  <div className="scan-card-blank-warning">
                    <IonIcon icon={helpCircle} />
                    <span>{blankCount} pregunta{blankCount > 1 ? 's' : ''} sin responder</span>
                  </div>
                )}

                {/* Collapsible question details */}
                <button
                  className="scan-card-show-more"
                  onClick={() => setShowQuestionDetails(!showQuestionDetails)}
                  type="button"
                >
                  {showQuestionDetails ? 'Ocultar preguntas' : 'Ver preguntas'}
                  <IonIcon icon={showQuestionDetails ? chevronUpOutline : chevronDownOutline} />
                </button>

                {showQuestionDetails && (
                  <div className="scan-card-questions">
                    {aiAnalysis.questions.map((q) => {
                      const cfg = questionStatusConfig[q.status] || questionStatusConfig.blank;
                      return (
                        <div key={q.id} className={`scan-card-question scan-card-question-${q.status}`}>
                          <IonIcon icon={cfg.icon} color={cfg.color} />
                          <span className="scan-q-id">P{q.id}</span>
                          <span className={`scan-q-status-label scan-q-status-${q.status}`}>{cfg.label}</span>
                          {q.feedback && <span className="scan-q-feedback">{q.feedback}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
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
          <IonButton
            size="small"
            fill="outline"
            onClick={onProcessAI}
            className="scan-card-ai-btn"
            disabled={aiProcessing}
          >
            {aiProcessing ? <IonSpinner name="crescent" /> : <><IonIcon icon={sparkles} slot="start" /> Analizar con IA</>}
          </IonButton>
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
              value={teacherNotes}
              placeholder="Notas (opcional)"
              onIonInput={(e) => onNotesChange(e.detail.value ?? '')}
              disabled={saved}
              rows={1}
              autoGrow
            />
          </IonItem>
        )}

        {saved && teacherNotes && (
          <p className="scan-card-notes-display">{teacherNotes}</p>
        )}
      </IonCardContent>
    </IonCard>
  );
};

export default ScanCard;
