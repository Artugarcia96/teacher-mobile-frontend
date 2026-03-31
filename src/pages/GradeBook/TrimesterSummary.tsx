import { useState, useEffect, useMemo } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonRefresher, IonRefresherContent, useIonViewWillEnter,
} from '@ionic/react';
import { downloadOutline, chevronForwardOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { classes as classesApi } from '../../services/api';
import { TrimesterSummaryRow } from '../../types';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { getPeriodNumbers, getPeriodLabel, getPeriodNoun } from '../../utils/periodConfig';
import './TrimesterSummary.css';

const TrimesterSummary: React.FC = () => {
  const { classId, subjectId } = useParams<{ classId: string; subjectId?: string }>();
  const history = useHistory();
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
  useIonViewWillEnter(() => { fetchData(); fetchConfig(classId); });

  const handleRefresh = async (e: any) => {
    await fetchData();
    e.detail.complete();
  };

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
    <IonPage>
      <IonContent className="ts-content" scrollY>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        <div className="ts-header">
          <div className="ts-header__nav">
            <IonButtons>
              <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
            </IonButtons>
            <h1 className="ts-header__title">Resumen {periodMode === 'cuatrimester' ? 'cuatrimestral' : 'trimestral'}</h1>
            <IonButton fill="clear" size="small" onClick={handleExport}>
              <IonIcon icon={downloadOutline} slot="icon-only" />
            </IonButton>
          </div>
          {className && <p className="ts-header__subtitle">{className}</p>}
        </div>

        {loading ? (
          <div className="ts-loading"><IonSpinner color="primary" /></div>
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
                    onClick={() => history.push(`/tabs/classes/${classId}/students/${r.studentId}`)}
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
              onClick={() => history.push(
                subjectId
                  ? `/tabs/classes/${classId}/subjects/${subjectId}/report-comments`
                  : `/tabs/classes/${classId}/report-comments`
              )}
            >
              <span>Generar comentarios del boletín</span>
              <IonIcon icon={chevronForwardOutline} />
            </button>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default TrimesterSummary;
