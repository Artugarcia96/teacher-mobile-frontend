import { useState, useEffect, useCallback } from 'react';
import {
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonButton, IonIcon, IonSpinner, IonChip, IonBadge,
  useIonViewWillEnter
} from '@ionic/react';
import { 
  refreshOutline, trendingUpOutline, trendingDownOutline, 
  removeOutline, alertCircleOutline, sparkles, 
  schoolOutline, checkmarkCircleOutline, analyticsOutline
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
  onStudentClick?: (studentId: string) => void;
  onGenerateExercises?: (weakAreas: string[]) => void;
}

const INVALID_WEAK_AREA_PATTERNS = [
  /^examen/i,
  /^revisar/i,
  /^todas las/i,
  /^sin responder/i,
  /^no respondido/i,
  /^respuesta/i,
  /^pregunta/i,
  /^ejercicio/i,
  /^nota/i,
  /^puntuación/i,
  /^error/i,
  /^falta/i,
  /^incompleto/i,
  /^blanco/i,
  /^vacío/i,
];

const isValidWeakArea = (topic: string): boolean => {
  if (!topic || topic.trim().length < 3) return false;
  if (topic.trim().length > 100) return false;
  return !INVALID_WEAK_AREA_PATTERNS.some(pattern => pattern.test(topic.trim()));
};

const ClassInsightsPanel: React.FC<ClassInsightsPanelProps> = ({
  classId, onStudentClick, onGenerateExercises
}) => {
  const [insights, setInsights] = useState<ClassInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadInsights = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await classesApi.getInsights(classId);
      setInsights(res.data);
    } catch (err) {
      console.error('Failed to load insights:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  useIonViewWillEnter(() => {
    loadInsights(false);
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await classesApi.refreshInsights(classId, true);
      setInsights(res.data);
    } catch (err) {
      console.error('Failed to refresh insights:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const getTrendIcon = () => {
    if (!insights?.trend) return removeOutline;
    if (insights.trend === 'improving') return trendingUpOutline;
    if (insights.trend === 'declining') return trendingDownOutline;
    return removeOutline;
  };

  const getTrendColor = () => {
    if (!insights?.trend) return 'medium';
    if (insights.trend === 'improving') return 'success';
    if (insights.trend === 'declining') return 'danger';
    return 'medium';
  };

  const getTrendText = () => {
    if (!insights?.trend) return 'Sin datos';
    if (insights.trend === 'improving') return 'Mejorando';
    if (insights.trend === 'declining') return 'Empeorando';
    return 'Estable';
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'high') return 'danger';
    if (severity === 'medium') return 'warning';
    return 'medium';
  };

  const getGradeColor = (grade: number | null) => {
    if (grade === null) return 'medium';
    if (grade >= 7) return 'success';
    if (grade >= 5) return 'warning';
    return 'danger';
  };

  if (loading) {
    return (
      <IonCard className="insights-panel insights-panel--loading">
        <IonCardContent>
          <IonSpinner name="crescent" />
          <span>Analizando datos de la clase...</span>
        </IonCardContent>
      </IonCard>
    );
  }

  const hasData = insights && (insights.average_grade !== null || insights.weak_areas.length > 0);

  if (!hasData) {
    return (
      <IonCard className="insights-panel insights-panel--empty">
        <IonCardHeader>
          <IonCardTitle className="insights-panel__title">
            <div className="insights-panel__title-content">
              <IonIcon icon={analyticsOutline} />
              <span>Análisis de la clase</span>
            </div>
            <IonButton 
              fill="clear" 
              size="small" 
              onClick={handleRefresh} 
              disabled={refreshing}
              className="insights-panel__refresh-btn"
            >
              <IonIcon 
                icon={refreshOutline} 
                slot="icon-only" 
                className={refreshing ? 'spinning' : ''} 
              />
            </IonButton>
          </IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <IonIcon icon={analyticsOutline} className="insights-panel__empty-icon" />
          <p className="insights-panel__empty-title">Sin datos suficientes</p>
          <p className="insights-panel__empty-text">
            Corrige algunos exámenes para ver el análisis de la clase.
          </p>
        </IonCardContent>
      </IonCard>
    );
  }

  const validWeakAreas = insights.weak_areas.filter(area => isValidWeakArea(area.topic));

  return (
    <IonCard className="insights-panel">
      <IonCardHeader>
        <IonCardTitle className="insights-panel__title">
          <div className="insights-panel__title-content">
            <IonIcon icon={analyticsOutline} />
            <span>Análisis de la clase</span>
          </div>
          <IonButton 
            fill="clear" 
            size="small" 
            onClick={handleRefresh} 
            disabled={refreshing}
            className="insights-panel__refresh-btn"
          >
            <IonIcon 
              icon={refreshOutline} 
              slot="icon-only" 
              className={refreshing ? 'spinning' : ''} 
            />
          </IonButton>
        </IonCardTitle>
      </IonCardHeader>

      <IonCardContent>
        <div className="insights-panel__stats">
          <div className={`insights-panel__stat insights-panel__stat--${getGradeColor(insights.average_grade)}`}>
            <div className="insights-panel__stat-icon">
              <IonIcon icon={schoolOutline} />
            </div>
            <span className="insights-panel__stat-value">
              {insights.average_grade !== null ? insights.average_grade.toFixed(1) : '-'}
            </span>
            <span className="insights-panel__stat-label">Nota media</span>
          </div>
          
          <div className={`insights-panel__stat insights-panel__stat--${insights.pass_rate !== null && insights.pass_rate >= 60 ? 'success' : insights.pass_rate !== null ? 'warning' : 'medium'}`}>
            <div className="insights-panel__stat-icon">
              <IonIcon icon={checkmarkCircleOutline} />
            </div>
            <span className="insights-panel__stat-value">
              {insights.pass_rate !== null ? `${Math.round(insights.pass_rate)}%` : '-'}
            </span>
            <span className="insights-panel__stat-label">Aprobados</span>
          </div>
          
          <div className={`insights-panel__stat insights-panel__stat--${getTrendColor()}`}>
            <div className="insights-panel__stat-icon">
              <IonIcon icon={getTrendIcon()} />
            </div>
            <span className="insights-panel__stat-value insights-panel__stat-value--trend">
              {getTrendText()}
            </span>
            <span className="insights-panel__stat-label">Tendencia</span>
          </div>
        </div>

        {validWeakAreas.length > 0 && (
          <div className="insights-panel__section insights-panel__weak-areas-section">
            <h4 className="insights-panel__section-title">
              <span className="insights-panel__section-icon insights-panel__section-icon--warning">!</span>
              Áreas a reforzar
            </h4>
            <div className="insights-panel__weak-areas">
              {validWeakAreas.slice(0, 5).map((area, i) => (
                <div 
                  key={i} 
                  className={`insights-panel__weak-area insights-panel__weak-area--${area.severity}`}
                >
                  <span className="insights-panel__weak-area-topic">{area.topic}</span>
                  <span className="insights-panel__weak-area-count">
                    {area.student_count} {area.student_count === 1 ? 'alumno' : 'alumnos'}
                  </span>
                </div>
              ))}
            </div>
            {onGenerateExercises && validWeakAreas.length > 0 && (
              <IonButton
                fill="outline"
                size="small"
                className="insights-panel__generate-btn"
                onClick={() => onGenerateExercises(validWeakAreas.map((a) => a.topic))}
              >
                <IonIcon icon={sparkles} slot="start" />
                Generar ejercicios de refuerzo
              </IonButton>
            )}
          </div>
        )}

        {insights.student_alerts.length > 0 && (
          <div className="insights-panel__section insights-panel__alerts-section">
            <h4 className="insights-panel__section-title">
              <IonIcon icon={alertCircleOutline} color="warning" />
              Alumnos que necesitan atención
            </h4>
            <div className="insights-panel__alerts">
              {insights.student_alerts.slice(0, 3).map((alert, i) => (
                <div
                  key={i}
                  className="insights-panel__alert"
                  onClick={() => onStudentClick?.(alert.student_id)}
                >
                  <div className="insights-panel__alert-avatar">
                    {alert.student_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="insights-panel__alert-content">
                    <span className="insights-panel__alert-name">{alert.student_name}</span>
                    <span className="insights-panel__alert-issue">{alert.issue}</span>
                  </div>
                  <IonIcon icon={alertCircleOutline} className="insights-panel__alert-icon" />
                </div>
              ))}
            </div>
          </div>
        )}

        {insights.ai_summary && (
          <div className="insights-panel__section insights-panel__ai-summary">
            <h4 className="insights-panel__section-title">
              <IonIcon icon={sparkles} color="primary" />
              Resumen AI
            </h4>
            <div className="insights-panel__ai-content">
              <ReactMarkdown>{insights.ai_summary}</ReactMarkdown>
            </div>
          </div>
        )}

        {insights.updated_at && (
          <div className="insights-panel__footer">
            <span className="insights-panel__updated">
              Actualizado {new Date(insights.updated_at).toLocaleString('es-ES', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        )}
      </IonCardContent>
    </IonCard>
  );
};

export default ClassInsightsPanel;
