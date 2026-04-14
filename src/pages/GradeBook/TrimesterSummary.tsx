import { useState, useEffect, useMemo } from 'react';
import { Download, ChevronRight } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { classes as classesApi } from '../../services/api';
import { TrimesterSummaryRow } from '../../types';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { getPeriodNumbers, getPeriodLabel, getPeriodNoun } from '../../utils/periodConfig';
import PageShell from '@/components/shared/PageShell';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';
import './TrimesterSummary.css';

const TrimesterSummary: React.FC = () => {
  const { classId, subjectId } = useParams() as { classId: string; subjectId?: string };
  const navigate = useNavigate();
  const [rows, setRows] = useState<TrimesterSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState('');
  const periodMode = useAcademicConfigStore(s => s.configs[classId])?.periodMode;
  const fetchConfig = useAcademicConfigStore(s => s.fetchConfig);
  const periodNumbers = useMemo(() => getPeriodNumbers(periodMode), [periodMode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, classRes] = await Promise.all([
        classesApi.getTrimesterSummary(classId, subjectId),
        classesApi.get(classId),
      ]);
      setClassName(classRes.data.name || '');
      setRows((summaryRes.data || []).map((r: any) => ({
        studentId: r.student_id,
        studentName: r.student_name,
        t1Avg: r.t1_avg,
        t2Avg: r.t2_avg,
        t3Avg: r.t3_avg,
        finalAvg: r.final_avg,
        riskStatus: r.risk_status,
      })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); fetchConfig(classId); }, [classId, subjectId]);

  const gradeClass = (val: number | null) => {
    if (val === null) return '';
    if (val >= 6) return 'ts-cell--pass';
    if (val >= 5) return 'ts-cell--borderline';
    return 'ts-cell--fail';
  };

  const riskLabel = (status: string) => {
    switch (status) {
      case 'at_risk': return 'En riesgo';
      case 'borderline': return 'Límite';
      default: return 'OK';
    }
  };

  const avgByPeriod = (r: TrimesterSummaryRow, n: number): number | null => {
    if (n === 1) return r.t1Avg;
    if (n === 2) return r.t2Avg;
    return r.t3Avg;
  };

  const handleExport = () => {
    const header = ['Alumno', ...periodNumbers.map(n => getPeriodLabel(periodMode, n)), 'Final', 'Estado'];
    const csvRows = rows.map(r => [
      r.studentName,
      ...periodNumbers.map(n => { const v = avgByPeriod(r, n); return v !== null ? v.toFixed(1) : ''; }),
      r.finalAvg !== null ? r.finalAvg.toFixed(1) : '',
      riskLabel(r.riskStatus),
    ]);
    const csv = [header, ...csvRows]
      .map(row => row.map(c => `"${c}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `resumen_${getPeriodNoun(periodMode)}_${className}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <PageShell
      title={`Resumen ${periodMode === 'cuatrimester' ? 'cuatrimestral' : 'trimestral'}`}
      backHref={subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}` : '/tabs/classes'}
      headerActions={
        <Button variant="ghost" size="sm" onClick={handleExport}>
          <Download size={18} />
        </Button>
      }
    >
      {className && <p className="ts-header__subtitle">{className}</p>}

      {loading ? (
        <div className="ts-loading"><Spinner /></div>
      ) : rows.length === 0 ? (
        <div className="ts-empty">
          <span className="ts-empty__icon">📊</span>
          <span className="ts-empty__text">No hay datos suficientes</span>
          <span className="ts-empty__sub">Necesitas al menos un examen corregido</span>
        </div>
      ) : (
        <div className="ts-table-wrapper">
          <table className="ts-table">
            <thead>
              <tr>
                <th className="ts-th ts-th--name">Alumno</th>
                {periodNumbers.map(n => (
                  <th key={n} className="ts-th">{getPeriodLabel(periodMode, n)}</th>
                ))}
                <th className="ts-th ts-th--final">Final</th>
                <th className="ts-th">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.studentId}
                  className="ts-row pressable"
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => navigate(`/tabs/classes/${classId}/students/${r.studentId}`)}
                >
                  <td className="ts-cell ts-cell--name">{r.studentName}</td>
                  {periodNumbers.map(n => {
                    const val = avgByPeriod(r, n);
                    return (
                      <td key={n} className={`ts-cell ${gradeClass(val)}`}>
                        {val !== null ? val.toFixed(1) : '—'}
                      </td>
                    );
                  })}
                  <td className={`ts-cell ts-cell--final ${gradeClass(r.finalAvg)}`}>
                    {r.finalAvg !== null ? r.finalAvg.toFixed(1) : '—'}
                  </td>
                  <td className="ts-cell">
                    <span className={`ts-risk ts-risk--${r.riskStatus}`}>
                      {riskLabel(r.riskStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Link to generate report comments */}
      {rows.length > 0 && (
        <div className="ts-actions">
          <button
            className="ts-report-btn pressable"
            onClick={() => navigate(
              subjectId
                ? `/tabs/classes/${classId}/subjects/${subjectId}/report-comments`
                : `/tabs/classes/${classId}/report-comments`
            )}
          >
            <span>Generar comentarios del boletín</span>
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </PageShell>
  );
};

export default TrimesterSummary;
