import { useState, useEffect } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner,
} from '@ionic/react';
import { statsChartOutline, downloadOutline, refreshOutline, checkmarkCircle } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { reports as reportsApi, classes as classesApi } from '../../services/api';
import { hapticSuccess } from '../../utils/haptics';
import './ClassReport.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ReportStats {
  class_average: number;
  class_median: number;
  pass_rate: number;
  num_students: number;
  num_exams: number;
  num_corrections: number;
}

interface ReportResult {
  download_url: string;
  report_id: string;
  stats: ReportStats;
}

const ClassReport: React.FC = () => {
  const { classId, subjectId } = useParams<{ classId: string; subjectId?: string }>();
  const [className, setClassName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    classesApi.get(classId).then(res => setClassName(res.data.name || ''));
  }, [classId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await reportsApi.generateClassReport({
        class_id: classId,
        subject_id: subjectId,
      });
      setResult(res.data);
      hapticSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Error al generar el informe';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    const url = `${API_URL}${result.download_url}`;
    window.open(url, '_blank');
  };

  return (
    <IonPage>
      <IonContent className="cr-content" scrollY>
        <div className="cr-header">
          <div className="cr-header__nav">
            <IonButtons>
              <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
            </IonButtons>
            <h1 className="cr-header__title">Informe de clase</h1>
          </div>
          {className && <p className="cr-header__subtitle">{className}</p>}
        </div>

        <div className="cr-body">
          {/* Initial empty state */}
          {!generating && !result && !error && (
            <div className="cr-empty">
              <IonIcon icon={statsChartOutline} className="cr-empty__icon" />
              <span className="cr-empty__title">Informe detallado de rendimiento</span>
              <span className="cr-empty__subtitle">
                Genera un documento PDF profesional con estadísticas, distribución de notas,
                análisis por pregunta, tendencias y recomendaciones pedagógicas con IA.
              </span>
              <IonButton onClick={handleGenerate}>
                <IonIcon icon={statsChartOutline} slot="start" />
                Generar informe
              </IonButton>
            </div>
          )}

          {/* Generating state */}
          {generating && (
            <div className="cr-generating">
              <IonSpinner color="primary" />
              <span>Generando informe...</span>
              <span className="cr-generating__sub">
                Analizando datos, generando gráficos y compilando PDF. Puede tardar hasta un minuto.
              </span>
            </div>
          )}

          {/* Error state */}
          {error && !generating && (
            <div className="cr-empty">
              <p className="cr-error">{error}</p>
              <IonButton onClick={handleGenerate}>
                <IonIcon icon={refreshOutline} slot="start" />
                Reintentar
              </IonButton>
            </div>
          )}

          {/* Result state */}
          {result && !generating && (
            <>
              <div className="cr-stats">
                <div className="cr-stat-card">
                  <div className="cr-stat-card__value">{result.stats.class_average.toFixed(1)}</div>
                  <div className="cr-stat-card__label">Media</div>
                </div>
                <div className="cr-stat-card">
                  <div className="cr-stat-card__value">{result.stats.pass_rate}%</div>
                  <div className="cr-stat-card__label">Aprobados</div>
                </div>
                <div className="cr-stat-card">
                  <div className="cr-stat-card__value">{result.stats.num_exams}</div>
                  <div className="cr-stat-card__label">Exámenes</div>
                </div>
              </div>

              <div className="cr-result">
                <IonIcon icon={checkmarkCircle} className="cr-result__check" />
                <span className="cr-result__title">Informe generado</span>
                <span className="cr-result__subtitle">
                  {result.stats.num_students} alumnos · {result.stats.num_corrections} correcciones analizadas
                </span>

                <IonButton className="cr-download-btn" onClick={handleDownload}>
                  <IonIcon icon={downloadOutline} slot="start" />
                  Descargar PDF
                </IonButton>

                <IonButton fill="clear" className="cr-regen-btn" onClick={handleGenerate}>
                  <IonIcon icon={refreshOutline} slot="start" />
                  Regenerar informe
                </IonButton>
              </div>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ClassReport;
