import { useState, useEffect, useCallback } from 'react';
import {
  IonButton, IonIcon, IonSpinner, IonBadge,
  useIonViewWillEnter
} from '@ionic/react';
import {
  refreshOutline, trendingUpOutline, trendingDownOutline,
  removeOutline, alertCircleOutline, sparkles,
  schoolOutline, checkmarkCircleOutline, chevronDownOutline, chevronUpOutline,
} from 'ionicons/icons';
import { classes as classesApi } from '../services/api';
import ReactMarkdown from 'react-markdown';
import './ClassInsightsPanel.css';

interface WeakArea {
  topic: string;
  student_count: number;
  severity: string;
}

interface StudentAlert {
  student_id: string;
  student_name: string;
  issue: string;
  suggested_action: string;
}

interface ClassInsights {
  class_id: string;
  average_grade: number | null;
  pass_rate: number | null;
  trend: string | null;
  weak_areas: WeakArea[];
  student_alerts: StudentAlert[];
  ai_summary: string | null;
  updated_at: string | null;
}

interface ClassInsightsPanelProps {
  classId: string;
  subjectId?: string;
  onStudentClick?: (studentId: string) => void;
  onGenerateExercises?: (weakAreas: string[]) => void;
}

const INVALID_WEAK_AREA_PATTERNS = [
  /^examen/i, /^revisar/i, /^todas las/i, /^sin responder/i,
  /^no respondido/i, /^respuesta/i, /^pregunta/i, /^ejercicio/i,
  /^nota/i, /^puntuación/i, /^error/i, /^falta/i,
  /^incompleto/i, /^blanco/i, /^vacío/i,
];

const isValidWeakArea = (topic: string): boolean => {
  if (!topic || topic.trim().length < 3 || topic.trim().length > 100) return false;
  return !INVALID_WEAK_AREA_PATTERNS.some(p => p.test(topic.trim()));
};

const ClassInsightsPanel: React.FC<ClassInsightsPanelProps> = ({
  classId, subjectId, onStudentClick, onGenerateExercises
}) => {
  const [insights, setInsights] = useState<ClassInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadInsights = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = subjectId
        ? await classesApi.getSubjectInsights(classId, subjectId)
        : await classesApi.getInsights(classId);
      setInsights(res.data);
    } catch (err) { console.error(err); }
    finally { if (showLoading) setLoading(false); }
  }, [classId, subjectId]);

  useEffect(() => { loadInsights(); }, [loadInsights]);
  useIonViewWillEnter(() => { loadInsights(false); });

  const handleRefresh = async () => {
    if (subjectId) {
      await loadInsights(false);
      return;
    }
    setRefreshing(true);
    try {
      const res = await classesApi.refreshInsights(classId, true);
      setInsights(res.data);
    } catch (err) { console.error(err); }
    finally { setRefreshing(false); }
  };

  if (loading) {
    return (
      <div className="cip cip--loading">
        <IonSpinner name="crescent" />
        <span>Analizando...</span>
      </div>
    );
  }

  const hasData = insights && (insights.average_grade !== null || insights.weak_areas.length > 0);
  if (!hasData) {
    return (
      <div className="cip cip--empty">
        <span className="cip__empty-text">Sin datos de análisis</span>
        <IonButton fill="clear" size="small" onClick={handleRefresh} disabled={refreshing}>
          <IonIcon icon={refreshOutline} slot="start" className={refreshing ? 'spinning' : ''} />
          Actualizar
        </IonButton>
      </div>
    );
  }

  const validWeakAreas = insights.weak_areas.filter(a => isValidWeakArea(a.topic));
  const trendIcon = insights.trend === 'improving' ? trendingUpOutline :
    insights.trend === 'declining' ? trendingDownOutline : removeOutline;
  const trendColor = insights.trend === 'improving' ? 'success' :
    insights.trend === 'declining' ? 'danger' : 'medium';
  const trendText = insights.trend === 'improving' ? 'Mejorando' :
    insights.trend === 'declining' ? 'Empeorando' : 'Estable';

  return (
    <div className="cip">
      {/* Compact stats row */}
      <div className="cip__header" onClick={() => setExpanded(!expanded)}>
        <div className="cip__stats-inline">
          <div className="cip__stat">
            <IonIcon icon={schoolOutline} className="cip__stat-icon" />
            <span className="cip__stat-value">
              {insights.average_grade !== null ? insights.average_grade.toFixed(1) : '—'}
            </span>
            <span className="cip__stat-label">media</span>
          </div>
          <span className="cip__stat-sep">·</span>
          <div className="cip__stat">
            <IonIcon icon={checkmarkCircleOutline} className="cip__stat-icon" />
            <span className="cip__stat-value">
              {insights.pass_rate !== null ? `${Math.round(insights.pass_rate)}%` : '—'}
            </span>
            <span className="cip__stat-label">aprob.</span>
          </div>
          <span className="cip__stat-sep">·</span>
          <div className={`cip__stat cip__stat--${trendColor}`}>
            <IonIcon icon={trendIcon} className="cip__stat-icon" />
            <span className="cip__stat-value">{trendText}</span>
          </div>
        </div>
        <div className="cip__header-actions">
          <IonButton
            fill="clear"
            size="small"
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            disabled={refreshing}
            className="cip__refresh-btn"
          >
            <IonIcon icon={refreshOutline} slot="icon-only" className={refreshing ? 'spinning' : ''} />
          </IonButton>
          <IonIcon icon={expanded ? chevronUpOutline : chevronDownOutline} className="cip__expand-icon" />
        </div>
      </div>

      {/* Weak areas — always visible as compact tags */}
      {validWeakAreas.length > 0 && (
        <div className="cip__weak-tags">
          {validWeakAreas.slice(0, expanded ? 10 : 3).map((area, i) => (
            <span key={i} className={`cip__weak-tag cip__weak-tag--${area.severity}`}>
              {area.topic}
              <span className="cip__weak-tag-count">{area.student_count}</span>
            </span>
          ))}
          {!expanded && validWeakAreas.length > 3 && (
            <span className="cip__weak-more" onClick={() => setExpanded(true)}>
              +{validWeakAreas.length - 3} más
            </span>
          )}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="cip__expanded">
          {/* Generate button */}
          {onGenerateExercises && validWeakAreas.length > 0 && (
            <button
              className="cip__generate-btn"
              onClick={() => onGenerateExercises(validWeakAreas.map(a => a.topic))}
            >
              <IonIcon icon={sparkles} />
              Generar ejercicios de refuerzo
            </button>
          )}

          {/* Student alerts — compact */}
          {insights.student_alerts.length > 0 && (
            <div className="cip__alerts">
              <span className="cip__section-label">
                <IonIcon icon={alertCircleOutline} />
                Alumnos con dificultades
              </span>
              {insights.student_alerts.slice(0, 3).map((alert, i) => (
                <div
                  key={i}
                  className="cip__alert-row"
                  onClick={() => onStudentClick?.(alert.student_id)}
                >
                  <span className="cip__alert-name">{alert.student_name}</span>
                  <span className="cip__alert-issue">{alert.issue}</span>
                </div>
              ))}
            </div>
          )}

          {/* AI Summary — collapsed with max-height */}
          {insights.ai_summary && (
            <div className="cip__ai-summary">
              <span className="cip__section-label">
                <IonIcon icon={sparkles} />
                Resumen IA
              </span>
              <div className="cip__ai-content">
                <ReactMarkdown>{insights.ai_summary}</ReactMarkdown>
              </div>
            </div>
          )}

          {insights.updated_at && (
            <span className="cip__updated">
              Actualizado {new Date(insights.updated_at).toLocaleString('es-ES', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ClassInsightsPanel;
