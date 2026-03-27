import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonAlert, IonChip, IonProgressBar, IonList, IonItem, IonLabel,
  IonTextarea, IonModal, IonHeader, IonToolbar, IonTitle, IonBadge,
  IonAccordion, IonAccordionGroup,
} from '@ionic/react';
import {
  trashOutline, downloadOutline,
  checkmarkCircleOutline, sparkles,
  documentTextOutline, personOutline, refreshOutline, closeOutline,
  peopleOutline, statsChartOutline, eyeOutline, medkitOutline,
  documentOutline, checkboxOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import api, { exercises as exercisesApi, exerciseCorrections as ecApi } from '../../services/api';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import ExerciseCorrectionPanel from '../../components/ExerciseCorrectionPanel';
import EmptyState from '../../components/EmptyState';
import { GradeDonut } from '../../components/charts';
import { ExerciseIterationHistoryItem } from '../../types';
import { subjectThemeStyle } from '../../utils/subjectTheme';

import './ExerciseDetail.css';

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  null: { color: '#64748B', label: 'Pendiente', bg: 'rgba(100, 116, 139, 0.1)' },
  in_progress: { color: '#D97706', label: 'En corrección', bg: 'rgba(217, 119, 6, 0.1)' },
  corrected: { color: '#059669', label: 'Corregido', bg: 'rgba(5, 150, 105, 0.1)' },
};

const ExerciseDetail: React.FC = () => {
  const { classId, exerciseId, subjectId } = useParams<{ classId: string; exerciseId: string; subjectId?: string }>();
  const history = useHistory();

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const deleteExercise = useExercisesStore((s) => s.deleteExercise);
  const iterateExercise = useExercisesStore((s) => s.iterateExercise);

  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showIterateModal, setShowIterateModal] = useState(false);
  const [iterateInstruction, setIterateInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState<Record<string, boolean>>({});
  const exercise = useMemo(() => allExercises.find((e) => e.id === exerciseId), [allExercises, exerciseId]);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);

  // Find all sibling exercises (same name, same class)
  const siblingExercises = useMemo(() => {
    if (!exercise) return [];
    const exerciseName = exercise.name || exercise.weakAreas?.join(', ') || 'Ejercicio';
    const studentIds = new Set(students.map(s => s.id));
    return allExercises.filter(e => {
      if (!studentIds.has(e.studentId)) return false;
      const eName = e.name || e.weakAreas?.join(', ') || 'Ejercicio';
      return eName === exerciseName;
    });
  }, [exercise, allExercises, students]);

  // Fetch corrections for all sibling exercises
  const allExerciseCorrections = useMemo(() => {
    const siblingIds = new Set(siblingExercises.map(e => e.id));
    return corrections.filter(c => siblingIds.has(c.exerciseId));
  }, [corrections, siblingExercises]);

  // Aggregate stats across all siblings
  const stats = useMemo(() => {
    const gradedCorrections = allExerciseCorrections.filter(c => c.grade !== null && c.grade !== undefined);
    const totalGraded = gradedCorrections.length;
    const totalPapers = allExerciseCorrections.length;

    if (totalGraded === 0) {
      return { average: null, passRate: null, totalGraded: 0, totalPapers, totalStudents: siblingExercises.length };
    }

    const maxScore = exercise?.maxScore || 10;
    const sum = gradedCorrections.reduce((acc, c) => acc + (c.grade || 0), 0);
    const average = sum / totalGraded;
    const passed = gradedCorrections.filter(c => (c.grade || 0) >= maxScore * 0.5).length;
    const passRate = (passed / totalGraded) * 100;

    return { average, passRate, totalGraded, totalPapers, totalStudents: siblingExercises.length };
  }, [allExerciseCorrections, siblingExercises.length, exercise?.maxScore]);

  // Grade distribution for donut chart
  const gradeDistribution = useMemo(() => {
    const dist = { excellent: 0, good: 0, borderline: 0, fail: 0 };
    const maxScore = exercise?.maxScore || 10;
    allExerciseCorrections.forEach((c) => {
      if (c.grade === null || c.grade === undefined) return;
      const pct = c.grade / maxScore;
      if (pct >= 0.8) dist.excellent++;
      else if (pct >= 0.6) dist.good++;
      else if (pct >= 0.5) dist.borderline++;
      else dist.fail++;
    });
    return dist;
  }, [allExerciseCorrections, exercise?.maxScore]);

  // Aggregate weak areas across all siblings
  const classWeakAreas = useMemo(() => {
    const areaCount: Record<string, number> = {};
    // From exercises themselves
    siblingExercises.forEach(ex => {
      (ex.weakAreas || []).forEach((area: string) => {
        areaCount[area] = (areaCount[area] || 0) + 1;
      });
    });
    // From corrections
    allExerciseCorrections.forEach((c) => {
      const areas = c.weakAreas || c.aiAnalysis?.weakAreas || [];
      areas.forEach((area: string) => {
        areaCount[area] = (areaCount[area] || 0) + 1;
      });
    });
    return Object.entries(areaCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([area, count]) => ({ area, count }));
  }, [siblingExercises, allExerciseCorrections]);

  // Corrections list with student names
  const correctionsList = useMemo(() => {
    return allExerciseCorrections
      .map(c => {
        const corrStudent = allStudents.find(s => s.id === c.studentId);
        return { ...c, studentName: corrStudent?.name || 'Sin asignar' };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [allExerciseCorrections, allStudents]);

  // Aggregate correction status
  const groupStatus = useMemo(() => {
    const correctedCount = siblingExercises.filter(e => e.correctionStatus === 'corrected').length;
    if (correctedCount === siblingExercises.length && siblingExercises.length > 0) return 'corrected';
    if (correctedCount > 0) return 'in_progress';
    return 'null';
  }, [siblingExercises]);

  useEffect(() => {
    fetchClasses();
    fetchExercises();
    fetchStudents(classId);
    if (classId) fetchClassSubjects(classId);
    // Fetch corrections for all sibling exercises
    if (exerciseId) {
      fetchCorrections(exerciseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, exerciseId]);

  // Also fetch corrections for sibling exercises once we know them
  const siblingIds = useMemo(() => siblingExercises.map(e => e.id).sort().join(','), [siblingExercises]);
  useEffect(() => {
    siblingIds.split(',').filter(Boolean).forEach(id => {
      if (id !== exerciseId) {
        fetchCorrections(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblingIds, exerciseId]);

  const handleDelete = async () => {
    try {
      // Delete all sibling exercises
      for (const ex of siblingExercises) {
        await deleteExercise(ex.id);
      }
      const backPath = subjectId
        ? `/tabs/classes/${classId}/subjects/${subjectId}/exercises`
        : `/tabs/classes/${classId}/exercises`;
      history.replace(backPath);
    } catch (err) {
      console.error('Failed to delete exercise:', err);
    }
    setShowDeleteAlert(false);
  };

  const handleDownload = async (type: 'exercises' | 'solutions') => {
    if (!exercise) return;
    setDownloading(true);
    try {
      const ids = siblingExercises.map(e => e.id);
      if (ids.length > 1) {
        // Batch download all students' PDFs
        const res = await exercisesApi.batchDownload(ids, type === 'solutions');
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${exercise.name || 'Ejercicios'}${type === 'solutions' ? '_soluciones' : ''}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      } else {
        // Single exercise download
        const path = type === 'exercises'
          ? `/exercises/${exerciseId}/pdf/exercises`
          : `/exercises/${exerciseId}/pdf/solutions`;
        const res = await api.get(path, { responseType: 'blob' });
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${exercise.name || 'Ejercicios'}${type === 'solutions' ? '_soluciones' : ''}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      }
    } catch (err) {
      console.error('Failed to download:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async (type: 'exercises' | 'solutions') => {
    if (!exercise) return;
    try {
      const path = type === 'exercises'
        ? `/exercises/${exerciseId}/pdf/exercises`
        : `/exercises/${exerciseId}/pdf/solutions`;
      const res = await api.get(path, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(blobUrl + '#.pdf');
    } catch (err) {
      console.error('Failed to preview:', err);
    }
  };

  const handleIterate = async () => {
    if (!iterateInstruction.trim()) return;
    setIterating(true);
    try {
      await iterateExercise(exerciseId, iterateInstruction);
      setShowIterateModal(false);
      setIterateInstruction('');
    } catch (err) {
      console.error('Failed to iterate:', err);
    } finally {
      setIterating(false);
    }
  };

  const quickIterations = [
    'Hazlo más fácil',
    'Hazlo más difícil',
    'Añade más ejercicios',
    'Más contexto práctico',
  ];

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

  const handleDownloadPaper = (paperUrl: string, studentName?: string) => {
    const fullUrl = getFullPaperUrl(paperUrl);
    if (!fullUrl) return;
    const token = localStorage.getItem('access_token');
    fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const ext = paperUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'jpg';
        const fileName = `${exercise?.name || 'Ejercicio'}_${studentName || 'alumno'}.${ext}`;
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
      await ecApi.update(correctionId, { grade: newGrade });
      fetchCorrections(exerciseId);
    } catch (err) {
      console.error('Failed to update grade:', err);
    } finally {
      setSavingGrade((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  if (!exercise) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="exd-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  const exerciseName = exercise.name || exercise.weakAreas?.join(', ') || 'Ejercicio';
  const status = statusConfig[groupStatus] || statusConfig.null;
  const backPath = subjectId
    ? `/tabs/classes/${classId}/subjects/${subjectId}/exercises`
    : `/tabs/classes/${classId}/exercises`;
  const effectiveSubjectId = subjectId || exercise.subjectId;
  const subjectColor = effectiveSubjectId ? classSubjects[classId]?.find(s => s.subjectId === effectiveSubjectId)?.subjectColor : undefined;

  return (
    <IonPage>
      <IonContent className="exd-content" scrollY style={subjectThemeStyle(subjectColor)}>
        {/* Hero Header */}
        <div className="exd-hero" style={subjectColor ? { background: subjectColor } : undefined}>
          <div className="exd-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={backPath} text="" color="light" />
            </IonButtons>
            <div className="exd-hero__center">
              <h1 className="exd-hero__title">{exerciseName}</h1>
              {classGroup && (
                <p className="exd-hero__subtitle">
                  {classGroup.name}
                  {exercise.exerciseType === 'recovery' && (
                    <span className="exd-hero__type-badge">
                      <IonIcon icon={medkitOutline} />
                      Recuperación
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="exd-hero__actions">
              <IonButton
                fill="clear"
                size="small"
                onClick={() => setShowIterateModal(true)}
                className="exd-hero__action-btn"
              >
                <IonIcon icon={refreshOutline} slot="icon-only" />
              </IonButton>
              <IonButton
                fill="clear"
                size="small"
                onClick={() => setShowDeleteAlert(true)}
                className="exd-hero__action-btn exd-hero__action-btn--danger"
              >
                <IonIcon icon={trashOutline} slot="icon-only" />
              </IonButton>
            </div>
          </div>
        </div>

        {/* Info Ribbon */}
        <div className="exd-ribbon">
          <div className="exd-ribbon__item">
            <span className="exd-ribbon__value">
              {new Date(exercise.assignedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
            <span className="exd-ribbon__label">Asignado</span>
          </div>
          <div className="exd-ribbon__divider" />
          <div className="exd-ribbon__item">
            <span className="exd-ribbon__value">{exercise.maxScore}</span>
            <span className="exd-ribbon__label">Máx.</span>
          </div>
          <div className="exd-ribbon__divider" />
          <div className="exd-ribbon__item">
            <span
              className="exd-ribbon__status"
              style={{ color: status.color, background: status.bg }}
            >
              {status.label}
            </span>
          </div>
          {siblingExercises.length > 1 && (
            <>
              <div className="exd-ribbon__divider" />
              <div className="exd-ribbon__item">
                <span className="exd-ribbon__value">
                  <IonIcon icon={peopleOutline} className="exd-ribbon__icon" />
                  {siblingExercises.length}
                </span>
                <span className="exd-ribbon__label">Alumnos</span>
              </div>
            </>
          )}
          {siblingExercises.length <= 1 && exercise.studentId && (
            <>
              <div className="exd-ribbon__divider" />
              <div className="exd-ribbon__item">
                <span className="exd-ribbon__value">
                  <IonIcon icon={personOutline} className="exd-ribbon__icon" />
                  {students.find(s => s.id === exercise.studentId)?.name || '—'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Weak Areas */}
        {classWeakAreas.length > 0 && (
          <div className="exd-areas-section">
            <h3 className="exd-section-title">Áreas de refuerzo</h3>
            <div className="exd-areas-list">
              {classWeakAreas.map(({ area }, i) => (
                <IonChip key={i} color="primary" outline>
                  {area}
                </IonChip>
              ))}
            </div>
          </div>
        )}

        {/* Stats Dashboard */}
        <div className="exd-stats">
          <div className="exd-stat-card">
            <div className="exd-stat-icon">
              <IonIcon icon={documentTextOutline} />
            </div>
            <div className="exd-stat-content">
              <span className="exd-stat-value">{stats.totalPapers}</span>
              <span className="exd-stat-label">Entregas</span>
            </div>
          </div>
          <div className="exd-stat-card">
            <div className="exd-stat-icon exd-stat-icon--success">
              <IonIcon icon={checkmarkCircleOutline} />
            </div>
            <div className="exd-stat-content">
              <span className="exd-stat-value">{stats.totalGraded}</span>
              <span className="exd-stat-label">Corregidos</span>
            </div>
          </div>
          {stats.average !== null && (
            <div className="exd-stat-card">
              <div className="exd-stat-icon exd-stat-icon--primary">
                <IonIcon icon={statsChartOutline} />
              </div>
              <div className="exd-stat-content">
                <span className="exd-stat-value">{stats.average.toFixed(1)}</span>
                <span className="exd-stat-label">Media</span>
              </div>
            </div>
          )}
          {stats.passRate !== null && (
            <div className="exd-stat-card">
              <div className="exd-stat-icon exd-stat-icon--warning">
                <IonIcon icon={peopleOutline} />
              </div>
              <div className="exd-stat-content">
                <span className="exd-stat-value">{stats.passRate.toFixed(0)}%</span>
                <span className="exd-stat-label">Aprobados</span>
              </div>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {stats.totalStudents > 0 && (
          <div className="exd-progress-section">
            <div className="exd-progress-header">
              <span>Progreso de corrección</span>
              <span>{stats.totalGraded}/{stats.totalStudents}</span>
            </div>
            <IonProgressBar
              value={stats.totalStudents > 0 ? stats.totalGraded / stats.totalStudents : 0}
              color={groupStatus === 'corrected' ? 'success' : 'primary'}
            />
          </div>
        )}

        {/* Performance Charts */}
        {stats.totalGraded > 0 && (
          <div className="exd-performance">
            <div className="exd-performance__charts">
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
              <div className="exd-performance__weak-tags">
                {classWeakAreas.map(({ area, count }) => (
                  <span key={area} className="exd-weak-tag">
                    {area} <span className="exd-weak-count">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="exd-actions">
          <div className="exd-downloads-section">
            <span className="exd-section-label">
              Documentos
              {exercise?.iterationHistory && exercise.iterationHistory.length > 0 && (
                <IonBadge color="primary" style={{ marginLeft: '8px', verticalAlign: 'middle' }}>
                  v{exercise.iterationHistory.length + 1} — última versión
                </IonBadge>
              )}
            </span>
            <div className="exd-doc-list">
              <div className="exd-doc-item">
                <div className="exd-doc-info">
                  <IonIcon icon={documentOutline} className="exd-doc-icon" />
                  <span className="exd-doc-name">Ejercicios</span>
                </div>
                <div className="exd-doc-actions">
                  <button className="exd-doc-btn" onClick={() => handlePreview('exercises')} title="Ver">
                    <IonIcon icon={eyeOutline} />
                  </button>
                  <button className="exd-doc-btn" onClick={() => handleDownload('exercises')} disabled={downloading} title="Descargar">
                    <IonIcon icon={downloadOutline} />
                  </button>
                </div>
              </div>
              <div className="exd-doc-item">
                <div className="exd-doc-info">
                  <IonIcon icon={checkboxOutline} className="exd-doc-icon" />
                  <span className="exd-doc-name">Soluciones</span>
                </div>
                <div className="exd-doc-actions">
                  <button className="exd-doc-btn" onClick={() => handlePreview('solutions')} title="Ver">
                    <IonIcon icon={eyeOutline} />
                  </button>
                  <button className="exd-doc-btn" onClick={() => handleDownload('solutions')} disabled={downloading} title="Descargar">
                    <IonIcon icon={downloadOutline} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <IonButton
            expand="block"
            fill="outline"
            color="secondary"
            onClick={() => setShowIterateModal(true)}
          >
            <IonIcon icon={refreshOutline} slot="start" />
            Ajustar ejercicios
          </IonButton>

          {/* Version history */}
          {exercise?.iterationHistory && exercise.iterationHistory.length > 0 && (
            <IonAccordionGroup className="exd-iteration-history">
              <IonAccordion value="history">
                <IonItem slot="header" lines="none">
                  <IonLabel>
                    Historial de versiones ({exercise.iterationHistory.length + 1} versiones)
                  </IonLabel>
                </IonItem>
                <div slot="content" className="exd-history-content">
                  {/* Current version */}
                  <div className="exd-history-item" style={{ border: '1px solid var(--ion-color-primary)', background: 'rgba(var(--ion-color-primary-rgb), 0.05)' }}>
                    <div className="exd-history-version">
                      <IonBadge color="primary">v{exercise.iterationHistory.length + 1}</IonBadge>
                      <span className="exd-history-label">Versión actual</span>
                      <IonButton
                        fill="clear"
                        size="small"
                        onClick={() => handleDownload('exercises')}
                        title="Descargar esta versión"
                      >
                        <IonIcon icon={downloadOutline} slot="icon-only" />
                      </IonButton>
                    </div>
                    <p className="exd-history-instruction">
                      {exercise.iterationHistory[exercise.iterationHistory.length - 1].instruction}
                    </p>
                    {exercise.iterationHistory[exercise.iterationHistory.length - 1].changes_made &&
                      exercise.iterationHistory[exercise.iterationHistory.length - 1].changes_made!.length > 0 && (
                      <ul className="exd-history-changes">
                        {exercise.iterationHistory[exercise.iterationHistory.length - 1].changes_made!.map((change: string, cidx: number) => (
                          <li key={cidx}>{change}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Previous versions */}
                  {[...exercise.iterationHistory].slice(0, -1).reverse().map((item: ExerciseIterationHistoryItem, idx: number) => (
                    <div key={idx} className="exd-history-item">
                      <div className="exd-history-version">
                        <IonBadge color="medium">v{item.version}</IonBadge>
                        <span className="exd-history-time">
                          {new Date(item.timestamp).toLocaleString('es-ES')}
                        </span>
                      </div>
                      <p className="exd-history-instruction">{item.instruction}</p>
                      {item.changes_made && item.changes_made.length > 0 && (
                        <ul className="exd-history-changes">
                          {item.changes_made.map((change: string, cidx: number) => (
                            <li key={cidx}>{change}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {/* Original version */}
                  <div className="exd-history-item">
                    <div className="exd-history-version">
                      <IonBadge color="medium">v1</IonBadge>
                      <span className="exd-history-label" style={{ color: '#94A3B8' }}>Versión original</span>
                    </div>
                    <p className="exd-history-instruction">Generación inicial de ejercicios</p>
                  </div>
                </div>
              </IonAccordion>
            </IonAccordionGroup>
          )}
        </div>

        {/* Corrections */}
        <div className="exd-corrections-section">
          {groupStatus === 'corrected' ? (
            <>
              <div className="exd-corrections-header">
                <h2 className="exd-section-title">Correcciones ({correctionsList.length})</h2>
              </div>
              <div className="correction-review-list">
                {correctionsList.map((correction, i) => (
                  <CorrectionReviewCard
                    key={correction.id}
                    index={i}
                    studentName={correction.studentName}
                    grade={correction.grade}
                    maxScore={exercise.maxScore}
                    teacherComments={correction.teacherComments}
                    weakAreas={correction.weakAreas}
                    aiAnalysis={correction.aiAnalysis}
                    aiProcessed={!!correction.aiAnalysis}
                    paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                    onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                    onDownloadPaper={correction.paperUrl ? () => handleDownloadPaper(correction.paperUrl!, correction.studentName) : undefined}
                    onGradeChange={(newGrade) => handleGradeChange(correction.id, newGrade)}
                    savingGrade={savingGrade[correction.id]}
                  />
                ))}
              </div>
            </>
          ) : (
            <ExerciseCorrectionPanel
              classId={classId}
              exerciseIds={siblingExercises.map(e => e.id)}
              exerciseName={exercise.name || exerciseName}
              maxScore={exercise.maxScore}
              onFinished={() => {
                fetchExercises();
                siblingExercises.forEach(e => fetchCorrections(e.id));
              }}
            />
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
                  <iframe src={previewUrl} title="Ejercicio" className="paper-preview-pdf" />
                ) : (
                  <img src={previewUrl} alt="Ejercicio" className="paper-preview-img" />
                )}
              </div>
            )}
          </IonContent>
        </IonModal>

        {/* Delete Alert */}
        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Eliminar ejercicios"
          message={`¿Eliminar "${exerciseName}"${siblingExercises.length > 1 ? ` (${siblingExercises.length} alumnos)` : ''}? También se eliminarán las correcciones asociadas. Esta acción no se puede deshacer.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDelete }
          ]}
        />

        {/* Iterate Modal */}
        <IonModal
          isOpen={showIterateModal}
          onDidDismiss={() => {
            setShowIterateModal(false);
            setIterateInstruction('');
          }}
          className="exd-iterate-modal"
        >
          <IonHeader>
            <IonToolbar>
              <IonTitle>Ajustar ejercicios</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setShowIterateModal(false)}>
                  <IonIcon icon={closeOutline} slot="icon-only" />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="exd-iterate-content">
            <p className="exd-iterate-description">
              Describe cómo quieres modificar los ejercicios. La IA regenerará las preguntas según tus instrucciones.
            </p>

            <div className="exd-quick-options">
              {quickIterations.map((opt, i) => (
                <IonChip
                  key={i}
                  outline
                  onClick={() => setIterateInstruction(opt)}
                  color={iterateInstruction === opt ? 'primary' : undefined}
                >
                  {opt}
                </IonChip>
              ))}
            </div>

            <IonTextarea
              value={iterateInstruction}
              onIonInput={(e) => setIterateInstruction(e.detail.value || '')}
              placeholder="Ej: Añade más ejercicios de fracciones y reduce la dificultad..."
              rows={4}
              className="exd-iterate-textarea"
            />

            <IonButton
              expand="block"
              onClick={handleIterate}
              disabled={!iterateInstruction.trim() || iterating}
              className="exd-iterate-btn"
            >
              {iterating ? (
                <IonSpinner name="crescent" />
              ) : (
                <>
                  <IonIcon icon={sparkles} slot="start" />
                  Aplicar cambios
                </>
              )}
            </IonButton>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default ExerciseDetail;
