import { useState, useEffect } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonTextarea,
} from '@ionic/react';
import { sparkles, downloadOutline, refreshOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { reports as reportsApi, classes as classesApi } from '../../services/api';
import { hapticSuccess } from '../../utils/haptics';
import './ReportComments.css';

interface StudentComment {
  studentId: string;
  studentName: string;
  comment: string;
  avgGrade: number | null;
}

const ReportComments: React.FC = () => {
  const { classId, subjectId } = useParams<{ classId: string; subjectId?: string }>();
  const [comments, setComments] = useState<StudentComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [className, setClassName] = useState('');
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});

  useEffect(() => {
    classesApi.get(classId).then(res => setClassName(res.data.name || ''));
  }, [classId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await reportsApi.generateComments({
        class_id: classId,
        subject_id: subjectId,
      });
      const data = (res.data || []).map((c: any) => ({
        studentId: c.student_id,
        studentName: c.student_name,
        comment: c.comment,
        avgGrade: c.avg_grade,
      }));
      setComments(data);
      setEditedComments({});
      hapticSuccess();
    } catch (err) {
      console.error('Failed to generate comments:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async (studentId: string, instruction?: string) => {
    setRegeneratingId(studentId);
    try {
      const res = await reportsApi.regenerateComment({
        student_id: studentId,
        class_id: classId,
        subject_id: subjectId,
        instruction,
      });
      setComments(prev => prev.map(c =>
        c.studentId === studentId ? { ...c, comment: res.data.comment } : c
      ));
      setEditedComments(prev => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } catch (err) {
      console.error('Failed to regenerate:', err);
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleEditComment = (studentId: string, value: string) => {
    setEditedComments(prev => ({ ...prev, [studentId]: value }));
  };

  const handleExport = () => {
    const rows = comments.map(c => {
      const text = editedComments[c.studentId] ?? c.comment;
      return `"${c.studentName}","${text.replace(/"/g, '""')}"`;
    });
    const csv = `"Alumno","Comentario"\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `comentarios_${className}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const gradeClass = (val: number | null) => {
    if (val === null) return '';
    if (val >= 6) return 'rc-grade--pass';
    if (val >= 5) return 'rc-grade--borderline';
    return 'rc-grade--fail';
  };

  return (
    <IonPage>
      <IonContent className="rc-content" scrollY>
        <div className="rc-header">
          <div className="rc-header__nav">
            <IonButtons>
              <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
            </IonButtons>
            <h1 className="rc-header__title">Comentarios del bolet&iacute;n</h1>
            {comments.length > 0 && (
              <IonButton fill="clear" size="small" onClick={handleExport}>
                <IonIcon icon={downloadOutline} slot="icon-only" />
              </IonButton>
            )}
          </div>
          {className && <p className="rc-header__subtitle">{className}</p>}
        </div>

        {comments.length === 0 && !generating && (
          <div className="rc-empty">
            <IonIcon icon={sparkles} className="rc-empty__icon" />
            <span className="rc-empty__title">Genera comentarios con IA</span>
            <span className="rc-empty__subtitle">
              Basados en las notas, tendencias y observaciones de cada alumno
            </span>
            <IonButton onClick={handleGenerate} disabled={generating}>
              <IonIcon icon={sparkles} slot="start" />
              Generar comentarios
            </IonButton>
          </div>
        )}

        {generating && (
          <div className="rc-generating">
            <IonSpinner color="primary" />
            <span>Generando comentarios...</span>
            <span className="rc-generating__sub">Esto puede tardar unos segundos</span>
          </div>
        )}

        {comments.length > 0 && !generating && (
          <div className="rc-list">
            {comments.map((c, i) => {
              const displayComment = editedComments[c.studentId] ?? c.comment;
              const isRegenerating = regeneratingId === c.studentId;
              return (
                <div
                  key={c.studentId}
                  className="rc-card stagger-item"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="rc-card__header">
                    <span className="rc-card__name">{c.studentName}</span>
                    {c.avgGrade !== null && (
                      <span className={`rc-card__grade ${gradeClass(c.avgGrade)}`}>
                        {c.avgGrade.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <IonTextarea
                    className="rc-card__textarea"
                    value={displayComment}
                    autoGrow
                    onIonInput={(e) => handleEditComment(c.studentId, e.detail.value || '')}
                  />
                  <div className="rc-card__actions">
                    <button
                      className="rc-card__regen-btn"
                      onClick={() => handleRegenerate(c.studentId)}
                      disabled={isRegenerating}
                    >
                      {isRegenerating ? (
                        <IonSpinner name="crescent" />
                      ) : (
                        <>
                          <IonIcon icon={refreshOutline} />
                          <span>Regenerar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="rc-footer">
              <IonButton expand="block" onClick={handleGenerate}>
                <IonIcon icon={sparkles} slot="start" />
                Regenerar todos
              </IonButton>
            </div>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default ReportComments;
