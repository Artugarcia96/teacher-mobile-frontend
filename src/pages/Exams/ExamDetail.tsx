import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonAlert, IonChip, IonProgressBar, IonList, IonItem, IonLabel,
} from '@ionic/react';
import { 
  trashOutline, createOutline, downloadOutline, chevronForwardOutline,
  checkmarkCircleOutline, timeOutline, alertCircleOutline, sparkles,
  documentTextOutline, peopleOutline, statsChartOutline
} from 'ionicons/icons';
import { useParams, useHistory, Redirect } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useClassesStore } from '../../store/classesStore';
import { exams as examsApi } from '../../services/api';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import EmptyState from '../../components/EmptyState';
import { GradeDonut, WeakAreasRadar, QuestionStatusBar } from '../../components/charts';
import './ExamDetail.css';

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  uploaded: { color: '#64748B', label: 'Subido', bg: 'rgba(100, 116, 139, 0.1)' },
  assigned: { color: '#D97706', label: 'Por corregir', bg: 'rgba(217, 119, 6, 0.1)' },
  corrected: { color: '#059669', label: 'Corregido', bg: 'rgba(5, 150, 105, 0.1)' },
};

const deadlineConfig: Record<string, { color: string; label: string; bg: string }> = {
  ok: { color: '#059669', label: 'En plazo', bg: 'rgba(5, 150, 105, 0.1)' },
  soon: { color: '#D97706', label: 'Próximo', bg: 'rgba(217, 119, 6, 0.1)' },
  urgent: { color: '#DC2626', label: 'Urgente', bg: 'rgba(220, 38, 38, 0.1)' },
  overdue: { color: '#DC2626', label: 'Vencido', bg: 'rgba(220, 38, 38, 0.15)' },
  completed: { color: '#059669', label: 'Completado', bg: 'rgba(5, 150, 105, 0.1)' },
};

const AVATAR_COLORS = [
  '#6C3AED', '#8B5CF6', '#059669', '#0891B2', '#D97706',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const ExamDetail: React.FC = () => {
  const { classId, examId } = useParams<{ classId: string; examId: string }>();
  const history = useHistory();
  
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const deleteExam = useExamsStore((s) => s.deleteExam);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchCorrections = useCorrectionStore((s) => s.fetchCorrections);
  
  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isNewExam = examId === 'new';
  
  const exam = useMemo(() => isNewExam ? null : allExams.find((e) => e.id === examId), [allExams, examId, isNewExam]);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const examCorrections = useMemo(() => isNewExam ? [] : corrections.filter((c) => c.examId === examId), [corrections, examId, isNewExam]);
  
  const lectureName = useMemo(() => {
    if (!exam?.lectureId || !classGroup?.lectures) return null;
    return classGroup.lectures.find(l => l.id === exam.lectureId)?.name;
  }, [exam?.lectureId, classGroup?.lectures]);

  const stats = useMemo(() => {
    const gradedCorrections = examCorrections.filter(c => c.grade !== null && c.grade !== undefined);
    const totalGraded = gradedCorrections.length;
    const totalPapers = examCorrections.length;
    
    if (totalGraded === 0) {
      return { average: null, passRate: null, totalGraded: 0, totalPapers, studentsCount: students.length };
    }
    
    const sum = gradedCorrections.reduce((acc, c) => acc + (c.grade || 0), 0);
    const average = sum / totalGraded;
    const passed = gradedCorrections.filter(c => (c.grade || 0) >= (exam?.maxScore || 10) * 0.5).length;
    const passRate = (passed / totalGraded) * 100;
    
    return { average, passRate, totalGraded, totalPapers, studentsCount: students.length };
  }, [examCorrections, students.length, exam?.maxScore]);

  const correctionsList = useMemo(() => {
    return examCorrections
      .map(c => {
        const student = students.find(s => s.id === c.studentId);
        return { ...c, studentName: student?.name || 'Sin asignar' };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [examCorrections, students]);

  const gradeDistribution = useMemo(() => {
    const dist = { excellent: 0, good: 0, borderline: 0, fail: 0 };
    const maxScore = exam?.maxScore || 10;
    examCorrections.forEach((c) => {
      if (c.grade === null || c.grade === undefined) return;
      const pct = c.grade / maxScore;
      if (pct >= 0.8) dist.excellent++;
      else if (pct >= 0.6) dist.good++;
      else if (pct >= 0.5) dist.borderline++;
      else dist.fail++;
    });
    return dist;
  }, [examCorrections, exam?.maxScore]);

  const classWeakAreas = useMemo(() => {
    const areaCount: Record<string, number> = {};
    examCorrections.forEach((c) => {
      const areas = c.weakAreas || c.aiAnalysis?.weakAreas || [];
      areas.forEach((area: string) => {
        areaCount[area] = (areaCount[area] || 0) + 1;
      });
    });
    return Object.entries(areaCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([area, count]) => ({ area, count }));
  }, [examCorrections]);

  useEffect(() => {
    if (isNewExam) return;
    fetchClasses();
    fetchExams(classId);
    fetchStudents(classId);
    fetchCorrections(examId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, examId, isNewExam]);
  
  // If examId is "new", this component was loaded by mistake (route mismatch)
  // Render nothing and let ExamEditor handle it
  if (isNewExam) {
    return null;
  }

  const handleDelete = async () => {
    try {
      await deleteExam(examId);
      history.replace(`/tabs/classes/${classId}`);
    } catch (err) {
      console.error('Failed to delete exam:', err);
    }
    setShowDeleteAlert(false);
  };

  const handleDownload = async (type: 'exam' | 'solutions') => {
    if (!exam) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem('access_token');
      const url = type === 'exam' 
        ? examsApi.downloadExamUrl(examId)
        : examsApi.downloadSolutionsUrl(examId);
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      
      let filename = exam.name;
      if (type === 'solutions') {
        filename += '_soluciones';
      } else if (exam.isPersonalized) {
        filename += '_personalizado';
      }
      a.download = `${filename}.pdf`;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Failed to download:', err);
    } finally {
      setDownloading(false);
    }
  };

  if (!exam) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="ed-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  const status = statusConfig[exam.status] || statusConfig.uploaded;
  const deadline = exam.deadlineStatus ? deadlineConfig[exam.deadlineStatus] : null;

  return (
    <IonPage>
      <IonContent className="ed-content" scrollY>
        {/* Hero Header */}
        <div className="ed-hero">
          <div className="ed-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" color="light" />
            </IonButtons>
            <div className="ed-hero__center">
              <h1 className="ed-hero__title">{exam.name}</h1>
              {lectureName && (
                <p className="ed-hero__subtitle">{lectureName}</p>
              )}
            </div>
            <div className="ed-hero__actions">
              <IonButton 
                fill="clear" 
                size="small"
                onClick={() => history.push(`/tabs/exams/${examId}`)}
                className="ed-hero__action-btn"
              >
                <IonIcon icon={createOutline} slot="icon-only" />
              </IonButton>
              <IonButton 
                fill="clear" 
                size="small"
                onClick={() => setShowDeleteAlert(true)}
                className="ed-hero__action-btn ed-hero__action-btn--danger"
              >
                <IonIcon icon={trashOutline} slot="icon-only" />
              </IonButton>
            </div>
          </div>
        </div>

        {/* Info Ribbon */}
        <div className="ed-ribbon">
          <div className="ed-ribbon__item">
            <span className="ed-ribbon__value">
              {new Date(exam.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
            <span className="ed-ribbon__label">Fecha</span>
          </div>
          <div className="ed-ribbon__divider" />
          <div className="ed-ribbon__item">
            <span className="ed-ribbon__value">{exam.maxScore}</span>
            <span className="ed-ribbon__label">Máx.</span>
          </div>
          <div className="ed-ribbon__divider" />
          <div className="ed-ribbon__item">
            <span
              className="ed-ribbon__status"
              style={{ color: status.color, background: status.bg }}
            >
              {status.label}
            </span>
          </div>
          {exam.correctionDeadline && (
            <>
              <div className="ed-ribbon__divider" />
              <div className="ed-ribbon__item">
                <span className="ed-ribbon__value">
                  {new Date(exam.correctionDeadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </span>
                {deadline && exam.status !== 'corrected' && (
                  <span
                    className="ed-ribbon__deadline"
                    style={{ color: deadline.color }}
                  >
                    <IonIcon icon={deadline.label === 'Vencido' ? alertCircleOutline : timeOutline} />
                    {deadline.label}
                  </span>
                )}
              </div>
            </>
          )}
          <div className="ed-ribbon__divider" />
          <div className="ed-ribbon__item">
            {exam.hasGeneratedQuestions ? (
              <IonChip color="secondary" className="ed-type-chip">
                <IonIcon icon={sparkles} />
                IA
              </IonChip>
            ) : (
              <IonChip color="medium" className="ed-type-chip">
                <IonIcon icon={documentTextOutline} />
                PDF
              </IonChip>
            )}
          </div>
        </div>

        {/* Stats Dashboard */}
        {exam.status !== 'uploaded' && (
          <div className="ed-stats">
            <div className="ed-stat-card">
              <div className="ed-stat-icon">
                <IonIcon icon={documentTextOutline} />
              </div>
              <div className="ed-stat-content">
                <span className="ed-stat-value">{stats.totalPapers}</span>
                <span className="ed-stat-label">Entregas</span>
              </div>
            </div>
            <div className="ed-stat-card">
              <div className="ed-stat-icon ed-stat-icon--success">
                <IonIcon icon={checkmarkCircleOutline} />
              </div>
              <div className="ed-stat-content">
                <span className="ed-stat-value">{stats.totalGraded}</span>
                <span className="ed-stat-label">Corregidos</span>
              </div>
            </div>
            {stats.average !== null && (
              <div className="ed-stat-card">
                <div className="ed-stat-icon ed-stat-icon--primary">
                  <IonIcon icon={statsChartOutline} />
                </div>
                <div className="ed-stat-content">
                  <span className="ed-stat-value">{stats.average.toFixed(1)}</span>
                  <span className="ed-stat-label">Media</span>
                </div>
              </div>
            )}
            {stats.passRate !== null && (
              <div className="ed-stat-card">
                <div className="ed-stat-icon ed-stat-icon--warning">
                  <IonIcon icon={peopleOutline} />
                </div>
                <div className="ed-stat-content">
                  <span className="ed-stat-value">{stats.passRate.toFixed(0)}%</span>
                  <span className="ed-stat-label">Aprobados</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {exam.status !== 'uploaded' && stats.studentsCount > 0 && (
          <div className="ed-progress-section">
            <div className="ed-progress-header">
              <span>Progreso de corrección</span>
              <span>{stats.totalGraded}/{stats.studentsCount}</span>
            </div>
            <IonProgressBar 
              value={stats.totalGraded / stats.studentsCount} 
              color={exam.status === 'corrected' ? 'success' : 'primary'}
            />
          </div>
        )}

        {/* Performance Charts */}
        {stats.totalGraded > 0 && (
          <div className="ed-performance">
            <div className="ed-performance__charts">
              <GradeDonut
                distribution={[
                  { label: 'Excelente', count: gradeDistribution.excellent, color: 'var(--chart-excellent, #10B981)' },
                  { label: 'Bien', count: gradeDistribution.good, color: 'var(--chart-good, #3B82F6)' },
                  { label: 'Justo', count: gradeDistribution.borderline, color: 'var(--chart-borderline, #F59E0B)' },
                  { label: 'Suspenso', count: gradeDistribution.fail, color: 'var(--chart-fail, #EF4444)' },
                ]}
                centerLabel={stats.average !== null ? stats.average.toFixed(1) : '—'}
                centerSubLabel="Promedio"
                size={140}
              />
              {classWeakAreas.length >= 3 && (
                <WeakAreasRadar areas={classWeakAreas} size={160} />
              )}
            </div>
            {classWeakAreas.length > 0 && classWeakAreas.length < 3 && (
              <div className="ed-performance__weak-tags">
                {classWeakAreas.map(({ area, count }) => (
                  <span key={area} className="ed-weak-tag">
                    {area} <span className="ed-weak-count">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="ed-actions">
          <IonButton 
            expand="block" 
            onClick={() => history.push(`/correction/${examId}`)}
            className="ed-action-btn"
          >
            <IonIcon icon={createOutline} slot="start" />
            {exam.status === 'corrected' ? 'Ver correcciones' : 'Ir a corregir'}
          </IonButton>
          
          {/* Download Buttons */}
          {(exam.documentUrl || exam.hasGeneratedQuestions) && (
            <div className="ed-downloads-section">
              <span className="ed-section-label">Descargas</span>
              <div className="ed-actions-row">
                {exam.documentUrl && (
                  <IonButton 
                    expand="block"
                    fill="outline"
                    onClick={() => handleDownload('exam')}
                    disabled={downloading}
                  >
                    <IonIcon icon={downloadOutline} slot="start" />
                    {exam.isPersonalized 
                      ? 'PDF Personalizado (todos)' 
                      : exam.hasGeneratedQuestions 
                        ? 'Examen IA' 
                        : 'Examen PDF'}
                  </IonButton>
                )}
                {exam.hasGeneratedQuestions && (
                  <IonButton 
                    expand="block"
                    fill="outline"
                    onClick={() => handleDownload('solutions')}
                    disabled={downloading}
                  >
                    <IonIcon icon={documentTextOutline} slot="start" />
                    Soluciones
                  </IonButton>
                )}
              </div>
              {exam.isPersonalized && (
                <p className="ed-downloads-hint">
                  El PDF personalizado contiene una copia para cada alumno con su código impreso.
                </p>
              )}
            </div>
          )}

          <IonButton 
            expand="block"
            fill="outline"
            color="secondary"
            onClick={() => setShowExerciseModal(true)}
          >
            <IonIcon icon={sparkles} slot="start" />
            Generar ejercicios de repaso
          </IonButton>
        </div>

        {/* Corrections List */}
        <div className="ed-corrections-section">
          <h2 className="ed-section-title">Correcciones ({correctionsList.length})</h2>
          
          {correctionsList.length === 0 ? (
            <EmptyState
              icon="📄"
              title="Sin entregas"
              subtitle={exam.status === 'uploaded' ? 'Asigna el examen para empezar a recibir entregas' : 'Aún no se han subido entregas'}
              actionLabel={exam.status === 'uploaded' ? 'Asignar examen' : undefined}
              onAction={exam.status === 'uploaded' ? () => history.push(`/correction/${examId}`) : undefined}
            />
          ) : (
            <IonList className="ed-corrections-list">
              {correctionsList.map((correction) => (
                <IonItem 
                  key={correction.id}
                  button
                  onClick={() => history.push(`/correction/${examId}?studentId=${correction.studentId}`)}
                  className="ed-correction-item"
                >
                  <div 
                    className="ed-correction-avatar" 
                    slot="start"
                    style={{ background: avatarColor(correction.studentName) }}
                  >
                    {correction.studentName.charAt(0)}
                  </div>
                  <IonLabel>
                    <h3 className="ed-correction-name">{correction.studentName}</h3>
                    {correction.aiAnalysis?.questions && correction.aiAnalysis.questions.length > 0 && (
                      <div className="ed-correction-bar">
                        <QuestionStatusBar questions={correction.aiAnalysis.questions} compact />
                      </div>
                    )}
                    {!correction.aiAnalysis?.questions?.length && correction.aiAnalysis?.summary && (
                      <p className="ed-correction-summary">{correction.aiAnalysis.summary}</p>
                    )}
                  </IonLabel>
                  <div className="ed-correction-grade" slot="end">
                    {correction.grade !== null && correction.grade !== undefined ? (
                      <span 
                        className="ed-grade-value"
                        style={{ 
                          color: correction.grade >= (exam.maxScore * 0.5) ? '#059669' : '#DC2626'
                        }}
                      >
                        {correction.grade}/{exam.maxScore}
                      </span>
                    ) : (
                      <span className="ed-grade-pending">Pendiente</span>
                    )}
                    <IonIcon icon={chevronForwardOutline} className="ed-correction-arrow" />
                  </div>
                </IonItem>
              ))}
            </IonList>
          )}
        </div>

        {/* Delete Alert */}
        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Eliminar examen"
          message={`¿Eliminar "${exam.name}"? También se eliminarán todas las correcciones asociadas. Esta acción no se puede deshacer.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDelete }
          ]}
        />

        {/* Exercise Generator Modal */}
        <ExerciseGeneratorModal
          isOpen={showExerciseModal}
          onDismiss={() => setShowExerciseModal(false)}
          classId={classId}
          preselectedExamId={examId}
          preselectedSubjectId={exam?.subjectId}
        />
      </IonContent>
    </IonPage>
  );
};

export default ExamDetail;
