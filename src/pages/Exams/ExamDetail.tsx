import { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonAlert, IonChip, IonBadge,
  IonModal, IonHeader, IonToolbar, IonTitle,
} from '@ionic/react';
import {
  trashOutline, createOutline, downloadOutline, checkmarkCircleOutline,
  timeOutline, alertCircleOutline, sparkles,
  documentTextOutline, peopleOutline, statsChartOutline, closeOutline, eyeOutline,
  documentOutline, scanOutline, checkboxOutline, copyOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useClassesStore } from '../../store/classesStore';
import api, { exams as examsApi, corrections as correctionsApi, authenticatedFetch } from '../../services/api';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import CorrectionPanel from '../../components/CorrectionPanel';
import { GradeDonut } from '../../components/charts';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useDashboardStore } from '../../store/dashboardStore';
import './ExamDetail.css';
import '../../pages/Correction/Correction.css';

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

const ExamDetail: React.FC = () => {
  const { classId, examId } = useParams<{ classId: string; examId: string }>();
  const history = useHistory();
  
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const deleteExam = useExamsStore((s) => s.deleteExam);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchCorrections = useCorrectionStore((s) => s.fetchCorrections);
  
  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState<Record<string, boolean>>({});

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

  const pipeline = useMemo(() => {
    const total = students.length;
    const uploaded = examCorrections.filter(c => c.paperUrl).length;
    const aiProcessed = examCorrections.filter(c => c.aiProcessed).length;
    const graded = examCorrections.filter(c => c.grade !== null && c.grade !== undefined).length;
    const delivered = examCorrections.filter(c => c.delivered).length;
    return { total, uploaded, aiProcessed, graded, delivered };
  }, [examCorrections, students.length]);

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
    if (classId) fetchClassSubjects(classId);
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
      fetchDashboard();
      history.replace(`/tabs/classes/${classId}`);
    } catch (err) {
      console.error('Failed to delete exam:', err);
    }
    setShowDeleteAlert(false);
  };

  const handleDownload = async (type: 'exam' | 'solutions' | 'digitalized') => {
    if (!exam) return;
    setDownloading(true);
    try {
      const urlMap = {
        exam: examsApi.downloadExamUrl(examId!),
        solutions: examsApi.downloadSolutionsUrl(examId!),
        digitalized: examsApi.downloadDigitalizedUrl(examId!),
      };
      const url = urlMap[type];
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      let filename = exam.name;
      if (type === 'solutions') filename += '_soluciones';
      else if (type === 'digitalized') filename += '_digitalizado';
      else if (exam.isPersonalized) filename += '_personalizado';
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async (type: 'exam' | 'solutions' | 'digitalized') => {
    if (!exam) return;
    try {
      const pathMap = {
        exam: `/exams/${examId}/download`,
        solutions: `/exams/${examId}/solutions`,
        digitalized: `/exams/${examId}/digitalized`,
      };
      const path = pathMap[type];
      const res = await api.get(path, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(blobUrl + '#.pdf');
    } catch (err) {
      console.error('Failed to preview:', err);
    }
  };

  const getFullPaperUrl = (paperUrl?: string) => {
    if (!paperUrl) return null;
    if (paperUrl.startsWith('http')) return paperUrl;
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (paperUrl.startsWith('/files/')) return `${baseUrl}${paperUrl}`;
    if (paperUrl.startsWith('/uploads/')) return `${baseUrl}/files${paperUrl.replace('/uploads', '')}`;
    if (paperUrl.startsWith('uploads/')) return `${baseUrl}/files/${paperUrl.replace('uploads/', '')}`;
    if (!paperUrl.startsWith('/')) return `${baseUrl}/${paperUrl}`;
    return `${baseUrl}${paperUrl}`;
  };

  const handleDownloadStudentPaper = (paperUrl: string, studentName?: string) => {
    if (!paperUrl || !exam) return;
    const fullUrl = getFullPaperUrl(paperUrl);
    if (!fullUrl) return;
    authenticatedFetch(fullUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const ext = paperUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'jpg';
        const fileName = studentName ? `${exam.name}_${studentName}.${ext}` : `${exam.name}_examen.${ext}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const handleGradeChange = async (correctionId: string, newGrade: number) => {
    setSavingGrade((prev) => ({ ...prev, [correctionId]: true }));
    try {
      await correctionsApi.update(correctionId, { grade: newGrade });
      fetchCorrections(examId);
    } catch (err) {
      console.error('Failed to update grade:', err);
    } finally {
      setSavingGrade((prev) => ({ ...prev, [correctionId]: false }));
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
  const subjectColor = exam.subjectId ? classSubjects[classId]?.find(s => s.subjectId === exam.subjectId)?.subjectColor : undefined;

  return (
    <IonPage>
      <IonContent className="ed-content" scrollY style={subjectThemeStyle(subjectColor)}>
        {/* Hero Header */}
        <div className="ed-hero" style={subjectColor ? { background: subjectColor } : undefined}>
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
                onClick={() => history.push(
                  exam.subjectId
                    ? `/tabs/classes/${classId}/subjects/${exam.subjectId}/exams/${examId}/edit`
                    : `/tabs/classes/${classId}/exams/${examId}/edit`
                )}
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
            <span className="ed-ribbon__label">Fecha examen</span>
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

        {/* Pipeline Status Counters */}
        {pipeline.total > 0 && (
          <div className="ed-pipeline">
            {[
              { label: 'Realizado', count: pipeline.total, done: pipeline.total > 0 },
              { label: 'Subido', count: pipeline.uploaded, done: pipeline.uploaded >= pipeline.total },
              { label: 'Corregido IA', count: pipeline.aiProcessed, done: pipeline.aiProcessed >= pipeline.uploaded && pipeline.uploaded > 0 },
              { label: 'Evaluado', count: pipeline.graded, done: pipeline.graded >= pipeline.uploaded && pipeline.uploaded > 0 },
              { label: 'Entregado', count: pipeline.delivered, done: pipeline.delivered >= pipeline.graded && pipeline.graded > 0 },
            ].map((step, i, arr) => (
              <div key={step.label} className="ed-pipeline__step-wrapper">
                <div className={`ed-pipeline__step${step.done ? ' ed-pipeline__step--done' : step.count > 0 ? ' ed-pipeline__step--active' : ''}`}>
                  <div className="ed-pipeline__count">{step.label === 'Realizado' ? step.count : `${step.count}/${pipeline.total}`}</div>
                  <div className="ed-pipeline__label">{step.label}</div>
                </div>
                {i < arr.length - 1 && <div className="ed-pipeline__connector" />}
              </div>
            ))}
          </div>
        )}

        {/* Stats Summary */}
        {stats.totalGraded > 0 && (
          <div className="ed-stats">
            <div className="ed-stat-card">
              <div className="ed-stat-icon ed-stat-icon--primary">
                <IonIcon icon={statsChartOutline} />
              </div>
              <div className="ed-stat-content">
                <span className="ed-stat-value">{stats.average !== null ? stats.average.toFixed(1) : '—'}</span>
                <span className="ed-stat-label">Media</span>
              </div>
            </div>
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

        {/* Performance Charts */}
        {stats.totalGraded > 0 && (
          <div className="ed-performance">
            <div className="ed-performance__charts">
              <GradeDonut
                distribution={[
                  { label: 'Excelente', count: gradeDistribution.excellent, color: 'var(--chart-excellent, #10B981)' },
                  { label: 'Bien', count: gradeDistribution.good, color: 'var(--chart-good, #3B82F6)' },
                  { label: 'Suficiente', count: gradeDistribution.borderline, color: 'var(--chart-borderline, #F59E0B)' },
                  { label: 'Suspenso', count: gradeDistribution.fail, color: 'var(--chart-fail, #EF4444)' },
                ]}
                centerLabel={stats.average !== null ? stats.average.toFixed(1) : '—'}
                centerSubLabel="Promedio"
                size={140}
              />
            </div>
            {classWeakAreas.length > 0 && (
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

        {/* Downloads & Actions */}
        <div className="ed-actions">
          {/* Download Buttons */}
          {(exam.documentUrl || exam.hasGeneratedQuestions) && (
            <div className="ed-downloads-section">
              <span className="ed-section-label">
                {exam.isPersonalized ? 'Documento (1 copia por alumno con QR)' : 'Documentos'}
                {exam.iterationHistory && exam.iterationHistory.length > 0 && (
                  <IonBadge color="primary" style={{ marginLeft: '8px', verticalAlign: 'middle' }}>
                    v{exam.iterationHistory.length + 1} — última versión
                  </IonBadge>
                )}
              </span>
              <div className="ed-doc-list">
                {exam.documentUrl && (
                  <div className="ed-doc-item">
                    <div className="ed-doc-info">
                      <IonIcon icon={exam.isPersonalized ? copyOutline : documentOutline} className="ed-doc-icon" />
                      <span className="ed-doc-name">
                        {exam.isPersonalized ? 'Todas las copias' : 'Original'}
                      </span>
                    </div>
                    <div className="ed-doc-actions">
                      <button className="ed-doc-btn" onClick={() => handlePreview('exam')} title="Ver">
                        <IonIcon icon={eyeOutline} />
                      </button>
                      <button className="ed-doc-btn" onClick={() => handleDownload('exam')} disabled={downloading} title="Descargar">
                        <IonIcon icon={downloadOutline} />
                      </button>
                    </div>
                  </div>
                )}
                {exam.hasGeneratedQuestions && exam.documentUrl && !exam.documentUrl.includes('_exam.pdf') && (
                  <div className="ed-doc-item">
                    <div className="ed-doc-info">
                      <IonIcon icon={scanOutline} className="ed-doc-icon" />
                      <span className="ed-doc-name">Examen digitalizado</span>
                    </div>
                    <div className="ed-doc-actions">
                      <button className="ed-doc-btn" onClick={() => handlePreview('digitalized')} title="Ver">
                        <IonIcon icon={eyeOutline} />
                      </button>
                      <button className="ed-doc-btn" onClick={() => handleDownload('digitalized')} disabled={downloading} title="Descargar">
                        <IonIcon icon={downloadOutline} />
                      </button>
                    </div>
                  </div>
                )}
                {exam.hasGeneratedQuestions && (
                  <div className="ed-doc-item">
                    <div className="ed-doc-info">
                      <IonIcon icon={checkboxOutline} className="ed-doc-icon" />
                      <span className="ed-doc-name">Soluciones</span>
                    </div>
                    <div className="ed-doc-actions">
                      <button className="ed-doc-btn" onClick={() => handlePreview('solutions')} title="Ver">
                        <IonIcon icon={eyeOutline} />
                      </button>
                      <button className="ed-doc-btn" onClick={() => handleDownload('solutions')} disabled={downloading} title="Descargar">
                        <IonIcon icon={downloadOutline} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {exam.isPersonalized && (
                <p className="ed-downloads-hint">
                  El PDF incluye una copia del examen por cada alumno, con su nombre y código QR impresos para identificación automática al corregir.
                </p>
              )}
            </div>
          )}

          {exam.status === 'corrected' && (
            <IonButton
              expand="block"
              fill="outline"
              color="secondary"
              onClick={() => setShowExerciseModal(true)}
            >
              <IonIcon icon={sparkles} slot="start" />
              Generar ejercicios de repaso
            </IonButton>
          )}
        </div>

        {/* Corrections section */}
        <div className={`ed-corrections-section${exam.status !== 'corrected' ? ' ed-corrections-section--inline' : ''}`}>
          {exam.status === 'corrected' ? (
            /* Review mode: inline review cards */
            <>
              <div className="ed-corrections-header">
                <h2 className="ed-section-title">Correcciones ({correctionsList.length})</h2>
                {correctionsList.length > 0 && (
                  <IonButton
                    fill="clear"
                    size="small"
                    onClick={() => history.push(`/correction/${examId}`)}
                    className="ed-edit-corrections-btn"
                  >
                    <IonIcon icon={createOutline} slot="start" />
                    Editar
                  </IonButton>
                )}
              </div>
              {correctionsList.length > 0 ? (
                <div className="correction-review-list">
                  {correctionsList.map((correction, i) => (
                    <CorrectionReviewCard
                      key={correction.id}
                      index={i}
                      studentName={correction.studentName}
                      grade={correction.grade}
                      maxScore={exam.maxScore}
                      teacherComments={correction.teacherComments}
                      weakAreas={correction.weakAreas}
                      aiAnalysis={correction.aiAnalysis}
                      aiProcessed={correction.aiProcessed}
                      paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                      onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                      onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, correction.studentName) : undefined}
                      onGradeChange={(newGrade) => handleGradeChange(correction.id, newGrade)}
                      savingGrade={savingGrade[correction.id]}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            /* Edit mode: inline correction workflow */
            <>
              <div className="ed-corrections-header">
                <h2 className="ed-section-title">Correcciones</h2>
              </div>
              <CorrectionPanel
                examId={examId}
                onFinished={() => {
                  fetchExams(classId);
                  fetchCorrections(examId);
                }}
              />
            </>
          )}
        </div>

        {/* Paper preview modal */}
        <IonModal isOpen={!!previewUrl} onDidDismiss={() => { if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="paper-preview-modal">
          <IonHeader>
            <IonToolbar>
              <IonTitle>Vista previa</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setPreviewUrl(null)}>
                  <IonIcon icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="paper-preview-content" scrollY={false}>
            {previewUrl && (
              <div className="paper-preview-container">
                {previewUrl.toLowerCase().endsWith('.pdf') ? (
                  <iframe src={previewUrl} title="Examen" className="paper-preview-pdf" />
                ) : (
                  <img src={previewUrl} alt="Examen" className="paper-preview-img" />
                )}
              </div>
            )}
          </IonContent>
        </IonModal>

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
