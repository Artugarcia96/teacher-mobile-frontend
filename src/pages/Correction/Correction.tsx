import { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonProgressBar, IonBadge,
  IonSpinner, IonSegment, IonSegmentButton, IonLabel,
  IonModal,
} from '@ionic/react';
import {
  closeOutline, pencilOutline, eyeOutline, downloadOutline, documentTextOutline,
  swapVerticalOutline, funnelOutline, clipboardOutline,
} from 'ionicons/icons';
import { useParams, useHistory, useLocation } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { corrections as correctionsApi, exams as examsApi } from '../../services/api';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import CorrectionPanel from '../../components/CorrectionPanel';
import QuickCommentModal from '../../components/QuickCommentModal';
import { GradeDonut } from '../../components/charts';
import './Correction.css';

const Correction: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const history = useHistory();
  const location = useLocation();

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);

  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchCorrections = useCorrectionStore((s) => s.fetchCorrections);
  const updateCorrection = useCorrectionStore((s) => s.updateCorrection);
  const loading = useCorrectionStore((s) => s.loading);

  const exam = useMemo(() => allExams.find((e) => e.id === examId), [allExams, examId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === exam?.classId), [allStudents, exam?.classId]);
  const examCorrections = useMemo(() => corrections.filter((c) => c.examId === examId), [corrections, examId]);

  const queryParams = new URLSearchParams(location.search);
  const highlightStudentId = queryParams.get('studentId');

  const isReviewMode = exam?.status === 'corrected';
  const [viewMode, setViewMode] = useState<'review' | 'edit'>(isReviewMode ? 'review' : 'edit');

  const [filterBy, setFilterBy] = useState<'all' | 'passed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'grade-asc' | 'grade-desc'>('name');
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!loading && allExams.length > 0 && !exam) {
      history.replace('/tabs/exams');
    }
  }, [exam, loading, allExams.length, history]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  useEffect(() => {
    if (exam && exam.classId) {
      fetchStudents(exam.classId);
      fetchCorrections(examId);
    }
  }, [exam, examId, fetchStudents, fetchCorrections]);

  useEffect(() => {
    if (exam?.status === 'corrected') {
      setViewMode('review');
    }
  }, [exam?.status]);

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

  const handleDownloadExam = () => {
    if (!exam) return;
    const token = localStorage.getItem('access_token');
    const url = examsApi.downloadExamUrl(exam.id);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob(); })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${exam.name}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const handleDownloadSolutions = () => {
    if (!exam) return;
    const token = localStorage.getItem('access_token');
    const url = examsApi.downloadSolutionsUrl(exam.id);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob(); })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${exam.name}_soluciones.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const handleDownloadStudentPaper = (paperUrl: string, studentName?: string) => {
    if (!paperUrl || !exam) return;
    const fullUrl = getFullPaperUrl(paperUrl);
    if (!fullUrl) return;
    const token = localStorage.getItem('access_token');
    fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob(); })
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

  const handleDownloadReport = (correctionId: string, studentName?: string) => {
    if (!exam) return;
    const token = localStorage.getItem('access_token');
    const url = correctionsApi.downloadReportUrl(correctionId);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob(); })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = studentName ? `correccion_${studentName}.pdf` : 'correccion.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Report download error:', err));
  };

  const handleBatchDownloadReports = () => {
    if (!exam) return;
    correctionsApi.batchDownloadReports(exam.id)
      .then((res) => {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `correcciones_${exam.name}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Batch report download error:', err));
  };

  // ── Review mode computed ──
  const savedCount = examCorrections.filter((c) => c.savedAt).length;
  const totalPapers = examCorrections.length || students.length;
  const progress = totalPapers > 0 ? savedCount / totalPapers : 0;

  const passedCount = useMemo(() => {
    const maxScore = exam?.maxScore || 10;
    return examCorrections.filter(c => c.grade !== null && c.grade / maxScore >= 0.5).length;
  }, [examCorrections, exam?.maxScore]);
  const failedCount = examCorrections.length - passedCount;

  const gradeDistribution = useMemo(() => {
    const dist = { excellent: 0, good: 0, borderline: 0, fail: 0, missing: 0 };
    const maxScore = exam?.maxScore || 10;
    examCorrections.forEach((c) => {
      if (c.grade === null) {
        dist.missing++;
      } else {
        const pct = c.grade / maxScore;
        if (pct >= 0.8) dist.excellent++;
        else if (pct >= 0.6) dist.good++;
        else if (pct >= 0.5) dist.borderline++;
        else dist.fail++;
      }
    });
    return dist;
  }, [examCorrections, exam?.maxScore]);

  const classWeakAreas = useMemo(() => {
    // Collect all raw weak areas
    const rawAreas: string[] = [];
    examCorrections.forEach((c) => {
      const areas = c.weakAreas || c.aiAnalysis?.weakAreas || [];
      areas.forEach((a: string) => rawAreas.push(a));
    });

    // Group similar areas: normalize, then merge if one is a substring of another
    // or if they share enough words in common
    const normalize = (s: string) => s.toLowerCase().trim().replace(/[()]/g, '');
    const getWords = (s: string) => new Set(normalize(s).split(/\s+/).filter(w => w.length > 2));

    // canonical label -> count
    const groups: { label: string; norm: string; words: Set<string>; count: number }[] = [];

    for (const raw of rawAreas) {
      const norm = normalize(raw);
      if (norm.length < 3) continue;
      const words = getWords(raw);

      // Find best matching existing group
      let merged = false;
      for (const g of groups) {
        // Substring match (either direction)
        if (g.norm.includes(norm) || norm.includes(g.norm)) {
          g.count++;
          // Keep the shorter label as canonical
          if (raw.length < g.label.length) {
            g.label = raw;
            g.norm = norm;
          }
          merged = true;
          break;
        }
        // Word overlap: if ≥60% of words match, merge
        if (words.size >= 2 && g.words.size >= 2) {
          const overlap = [...words].filter(w => g.words.has(w)).length;
          const minSize = Math.min(words.size, g.words.size);
          if (overlap / minSize >= 0.6) {
            g.count++;
            if (raw.length < g.label.length) {
              g.label = raw;
              g.norm = norm;
              g.words = words;
            }
            merged = true;
            break;
          }
        }
      }
      if (!merged) {
        groups.push({ label: raw, norm, words, count: 1 });
      }
    }

    return groups
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(({ label, count }) => ({ area: label, count }));
  }, [examCorrections]);

  const filteredCorrections = useMemo(() => {
    const maxScore = exam?.maxScore || 10;
    return examCorrections.filter((c) => {
      if (filterBy === 'all') return true;
      const passed = c.grade !== null && c.grade / maxScore >= 0.5;
      return filterBy === 'passed' ? passed : !passed;
    });
  }, [examCorrections, filterBy, exam?.maxScore]);

  const sortedCorrections = useMemo(() => {
    const getStudentName = (studentId?: string) => students.find((s) => s.id === studentId)?.name || '';
    let sorted = [...filteredCorrections];
    if (highlightStudentId) {
      sorted.sort((a, b) => {
        if (a.studentId === highlightStudentId) return -1;
        if (b.studentId === highlightStudentId) return 1;
        return 0;
      });
    } else {
      sorted.sort((a, b) => {
        switch (sortBy) {
          case 'grade-desc': return (b.grade ?? -1) - (a.grade ?? -1);
          case 'grade-asc': return (a.grade ?? 999) - (b.grade ?? 999);
          case 'name':
          default: return getStudentName(a.studentId).localeCompare(getStudentName(b.studentId));
        }
      });
    }
    return sorted;
  }, [filteredCorrections, highlightStudentId, sortBy, students]);

  if (!exam) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="exams-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => history.goBack()}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle>{exam.name}</IonTitle>
          <IonButtons slot="end">
            {(exam.documentUrl || exam.hasGeneratedQuestions) && (
              <>
                <IonButton onClick={handleDownloadExam} title="Descargar examen">
                  <IonIcon icon={downloadOutline} />
                </IonButton>
                {exam.hasGeneratedQuestions && (
                  <IonButton onClick={handleDownloadSolutions} title="Descargar solucionario">
                    <IonIcon icon={documentTextOutline} />
                  </IonButton>
                )}
                {examCorrections.some(c => c.aiProcessed) && (
                  <IonButton onClick={handleBatchDownloadReports} title="Descargar informes de corrección">
                    <IonIcon icon={clipboardOutline} />
                  </IonButton>
                )}
              </>
            )}
            {isReviewMode ? (
              <IonBadge color="success" className="progress-badge">Corregido</IonBadge>
            ) : (
              <IonBadge color={progress >= 1 ? 'success' : 'primary'} className="progress-badge">
                {savedCount}/{totalPapers}
              </IonBadge>
            )}
          </IonButtons>
        </IonToolbar>
        {isReviewMode && (
          <IonToolbar>
            <IonSegment value={viewMode} onIonChange={(e) => setViewMode(e.detail.value as typeof viewMode)}>
              <IonSegmentButton value="review">
                <IonIcon icon={eyeOutline} />
                <IonLabel>Revisar</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="edit">
                <IonIcon icon={pencilOutline} />
                <IonLabel>Editar</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
        {!isReviewMode && <IonProgressBar value={progress} color={progress >= 1 ? 'success' : 'primary'} />}
      </IonHeader>

      <IonContent className="correction-content">
        {viewMode === 'review' ? (
          <>
            {examCorrections.length === 0 ? (
              <div className="correction-loading" style={{ flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '14px', color: '#94A3B8' }}>Sin correcciones para este examen</span>
              </div>
            ) : (
              <>
                {/* Compact Summary */}
                <div className="correction-dashboard">
                  <div className="dashboard-row">
                    <div className="dashboard-stat dashboard-stat-primary">
                      <span className="dashboard-stat-value">
                        {examCorrections.filter(c => c.grade !== null).length > 0
                          ? (examCorrections.reduce((sum, c) => sum + (c.grade || 0), 0) / examCorrections.filter(c => c.grade !== null).length).toFixed(1)
                          : '—'}
                      </span>
                      <span className="dashboard-stat-label">Promedio</span>
                    </div>
                    <div className="dashboard-stat dashboard-stat-success">
                      <span className="dashboard-stat-value">{gradeDistribution.excellent + gradeDistribution.good + gradeDistribution.borderline}</span>
                      <span className="dashboard-stat-label">Aprobados</span>
                    </div>
                    <div className="dashboard-stat dashboard-stat-danger">
                      <span className="dashboard-stat-value">{gradeDistribution.fail}</span>
                      <span className="dashboard-stat-label">Suspensos</span>
                    </div>
                  </div>

                  <div className="dashboard-charts">
                    <GradeDonut
                      distribution={[
                        { label: 'Excelente', count: gradeDistribution.excellent, color: 'var(--chart-excellent, #10B981)' },
                        { label: 'Bien', count: gradeDistribution.good, color: 'var(--chart-good, #3B82F6)' },
                        { label: 'Suficiente', count: gradeDistribution.borderline, color: 'var(--chart-borderline, #F59E0B)' },
                        { label: 'Suspenso', count: gradeDistribution.fail, color: 'var(--chart-fail, #EF4444)' },
                      ]}
                      centerLabel={
                        examCorrections.filter(c => c.grade !== null).length > 0
                          ? (examCorrections.reduce((sum, c) => sum + (c.grade || 0), 0) / examCorrections.filter(c => c.grade !== null).length).toFixed(1)
                          : '—'
                      }
                      centerSubLabel="Promedio"
                      size={140}
                    />

                    {classWeakAreas.length > 0 && (
                      <div className="class-weak-areas">
                        <div className="class-weak-areas-tags">
                          {classWeakAreas.map(({ area, count }) => (
                            <span key={area} className="class-weak-tag">
                              {area} <span className="weak-count">{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Filter & Sort */}
                <div className="correction-controls">
                  <div className="correction-filter-row">
                    <IonIcon icon={funnelOutline} className="correction-controls__icon" />
                    <div className="correction-chips">
                      <button className={`correction-chip ${filterBy === 'all' ? 'correction-chip--active' : ''}`} onClick={() => setFilterBy('all')}>
                        Todos <span className="correction-chip__count">{examCorrections.length}</span>
                      </button>
                      <button className={`correction-chip correction-chip--success ${filterBy === 'passed' ? 'correction-chip--active' : ''}`} onClick={() => setFilterBy('passed')}>
                        Aprobados <span className="correction-chip__count">{passedCount}</span>
                      </button>
                      <button className={`correction-chip correction-chip--danger ${filterBy === 'failed' ? 'correction-chip--active' : ''}`} onClick={() => setFilterBy('failed')}>
                        Suspensos <span className="correction-chip__count">{failedCount}</span>
                      </button>
                    </div>
                  </div>
                  <div className="correction-sort-row">
                    <IonIcon icon={swapVerticalOutline} className="correction-controls__icon" />
                    <div className="correction-chips">
                      <button className={`correction-chip ${sortBy === 'name' ? 'correction-chip--active' : ''}`} onClick={() => setSortBy('name')}>Nombre</button>
                      <button className={`correction-chip ${sortBy === 'grade-desc' ? 'correction-chip--active' : ''}`} onClick={() => setSortBy('grade-desc')}>Nota ↓</button>
                      <button className={`correction-chip ${sortBy === 'grade-asc' ? 'correction-chip--active' : ''}`} onClick={() => setSortBy('grade-asc')}>Nota ↑</button>
                    </div>
                  </div>
                </div>

                {/* Review cards */}
                <div className="correction-review-list">
                  {sortedCorrections.map((correction, i) => {
                    const student = students.find(s => s.id === correction.studentId);
                    const isHighlighted = correction.studentId === highlightStudentId;
                    return (
                      <CorrectionReviewCard
                        key={correction.id}
                        index={i}
                        studentName={student?.name || 'Alumno desconocido'}
                        grade={correction.grade}
                        maxScore={exam.maxScore}
                        teacherComments={correction.teacherComments}
                        weakAreas={correction.weakAreas}
                        aiAnalysis={correction.aiAnalysis}
                        aiProcessed={correction.aiProcessed}
                        highlighted={isHighlighted}
                        paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                        onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                        onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, student?.name) : undefined}
                        onDownloadReport={correction.aiProcessed ? () => handleDownloadReport(correction.id, student?.name) : undefined}
                        onGradeChange={async (newGrade) => {
                          setSaving((prev) => ({ ...prev, [correction.id]: true }));
                          try {
                            await updateCorrection(correction.id, { grade: newGrade });
                            await fetchCorrections(examId);
                          } catch (err) {
                            console.error('Failed to update grade:', err);
                          } finally {
                            setSaving((prev) => ({ ...prev, [correction.id]: false }));
                          }
                        }}
                        savingGrade={saving[correction.id]}
                        onAddComment={student ? () => setCommentTarget({ id: student.id, name: student.name }) : undefined}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          /* Edit mode: delegated to CorrectionPanel */
          <CorrectionPanel
            examId={examId}
            onFinished={() => history.goBack()}
          />
        )}

        {/* Quick Comment Modal */}
        <QuickCommentModal
          isOpen={!!commentTarget}
          studentId={commentTarget?.id || ''}
          studentName={commentTarget?.name || ''}
          onDismiss={() => setCommentTarget(null)}
        />

        {/* Paper preview modal */}
        <IonModal isOpen={!!previewUrl} onDidDismiss={() => setPreviewUrl(null)} className="paper-preview-modal">
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
          <IonContent className="paper-preview-content">
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
      </IonContent>
    </IonPage>
  );
};

export default Correction;
