import { useState, useEffect } from 'react';
import { Sparkles, Download, RefreshCw } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { reports as reportsApi, classes as classesApi } from '../../services/api';
import { hapticSuccess } from '../../utils/haptics';
import PageShell from '@/components/shared/PageShell';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import Spinner from '@/components/shared/Spinner';
import './ReportComments.css';

interface StudentComment {
  studentId: string;
  studentName: string;
  comment: string;
  avgGrade: number | null;
}

const ReportComments: React.FC = () => {
  const { classId, subjectId } = useParams() as { classId: string; subjectId?: string };
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
    <PageShell
      title="Comentarios del bolet&iacute;n"
      backHref={subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}` : '/tabs/classes'}
      headerActions={
        comments.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={handleExport}>
            <Download size={18} />
          </Button>
        ) : undefined
      }
    >
      {className && <p className="rc-header__subtitle">{className}</p>}

      {comments.length === 0 && !generating && (
        <div className="rc-empty">
          <Sparkles size={48} className="rc-empty__icon" />
          <span className="rc-empty__title">Genera comentarios con IA</span>
          <span className="rc-empty__subtitle">
            Basados en las notas, tendencias y observaciones de cada alumno
          </span>
          <Button onClick={handleGenerate} disabled={generating}>
            <Sparkles size={16} className="mr-2" />
            Generar comentarios
          </Button>
        </div>
      )}

      {generating && (
        <div className="rc-generating">
          <Spinner />
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
                <Textarea
                  className="rc-card__textarea"
                  value={displayComment}
                  onChange={(e) => handleEditComment(c.studentId, e.target.value)}
                />
                <div className="rc-card__actions">
                  <button
                    className="rc-card__regen-btn"
                    onClick={() => handleRegenerate(c.studentId)}
                    disabled={isRegenerating}
                  >
                    {isRegenerating ? (
                      <Spinner size={14} />
                    ) : (
                      <>
                        <RefreshCw size={14} />
                        <span>Regenerar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="rc-footer">
            <Button className="w-full" onClick={handleGenerate}>
              <Sparkles size={16} className="mr-2" />
              Regenerar todos
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
};

export default ReportComments;
