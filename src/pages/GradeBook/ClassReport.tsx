import { useState, useEffect } from 'react';
import { BarChart3, Download, RefreshCw, CheckCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { reports as reportsApi, classes as classesApi } from '../../services/api';
import { hapticSuccess } from '../../utils/haptics';
import PageShell from '@/components/shared/PageShell';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';
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
  const { classId, subjectId } = useParams() as { classId: string; subjectId?: string };
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
    <PageShell
      title="Informe de clase"
      backHref={subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}` : '/tabs/classes'}
    >
      <div className="cr-body">
        {className && <p className="cr-header__subtitle">{className}</p>}

        {/* Initial empty state */}
        {!generating && !result && !error && (
          <div className="cr-empty">
            <BarChart3 size={48} className="cr-empty__icon" />
            <span className="cr-empty__title">Informe detallado de rendimiento</span>
            <span className="cr-empty__subtitle">
              Genera un documento PDF profesional con estadísticas, distribución de notas,
              análisis por pregunta, tendencias y recomendaciones pedagógicas con IA.
            </span>
            <Button onClick={handleGenerate}>
              <BarChart3 size={16} className="mr-2" />
              Generar informe
            </Button>
          </div>
        )}

        {/* Generating state */}
        {generating && (
          <div className="cr-generating">
            <Spinner />
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
            <Button onClick={handleGenerate}>
              <RefreshCw size={16} className="mr-2" />
              Reintentar
            </Button>
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
              <CheckCircle size={48} className="cr-result__check" />
              <span className="cr-result__title">Informe generado</span>
              <span className="cr-result__subtitle">
                {result.stats.num_students} alumnos · {result.stats.num_corrections} correcciones analizadas
              </span>

              <Button className="cr-download-btn" onClick={handleDownload}>
                <Download size={16} className="mr-2" />
                Descargar PDF
              </Button>

              <Button variant="ghost" className="cr-regen-btn" onClick={handleGenerate}>
                <RefreshCw size={16} className="mr-2" />
                Regenerar informe
              </Button>
            </div>
          </>
        )}
      </div>
    </PageShell>
  );
};

export default ClassReport;
