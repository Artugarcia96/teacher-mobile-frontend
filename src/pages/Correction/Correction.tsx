import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonProgressBar, IonBadge, IonCard, IonCardContent,
  IonSpinner, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption,
  IonChip, IonModal,
} from '@ionic/react';
import { closeOutline, cameraOutline, checkmarkCircleOutline, pencilOutline, eyeOutline, cloudUploadOutline, checkmarkOutline, warningOutline, helpOutline, sparkles, expandOutline, funnelOutline, swapVerticalOutline, trendingDownOutline, downloadOutline, ellipsisVertical } from 'ionicons/icons';
import { useParams, useHistory, useLocation } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { corrections as correctionsApi, exams as examsApi } from '../../services/api';
import { BulkUploadResult, BulkUploadNeedsReview } from '../../types';
import ScanCard from '../../components/ScanCard';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import EmptyState from '../../components/EmptyState';
import './Correction.css';

const Correction: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const history = useHistory();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const updateExamStatus = useExamsStore((s) => s.updateExam);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const corrections = useCorrectionStore((s) => s.corrections);
  const fetchCorrections = useCorrectionStore((s) => s.fetchCorrections);
  const uploadPapers = useCorrectionStore((s) => s.uploadPapers);
  const updateCorrection = useCorrectionStore((s) => s.updateCorrection);
  const processAI = useCorrectionStore((s) => s.processAI);
  const finishCorrection = useCorrectionStore((s) => s.finishCorrection);
  const loading = useCorrectionStore((s) => s.loading);

  const exam = useMemo(() => allExams.find((e) => e.id === examId), [allExams, examId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === exam?.classId), [allStudents, exam?.classId]);
  const examCorrections = useMemo(() => corrections.filter((c) => c.examId === examId), [corrections, examId]);

  const queryParams = new URLSearchParams(location.search);
  const highlightStudentId = queryParams.get('studentId');
  
  const isReviewMode = exam?.status === 'corrected';
  const [viewMode, setViewMode] = useState<'review' | 'edit'>(isReviewMode ? 'review' : 'edit');

  // Guard: if exam was deleted while this page is still mounted, redirect back
  useEffect(() => {
    if (!loading && allExams.length > 0 && !exam) {
      history.replace('/tabs/exams');
    }
  }, [exam, loading, allExams.length, history]);
  
  const [filterBy, setFilterBy] = useState<'all' | 'passed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'grade-asc' | 'grade-desc'>('name');

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; notes: string; studentId: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  
  const [uploadMode, setUploadMode] = useState<'normal' | 'bulk'>('normal');
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

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
    setLocalGrades((prev) => {
      const next = { ...prev };
      examCorrections.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = { grade: c.grade, notes: c.teacherNotes || '', studentId: c.studentId || '' };
        } else {
          if (!next[c.id].studentId && c.studentId) {
            next[c.id] = { ...next[c.id], studentId: c.studentId };
          }
        }
      });
      return next;
    });
  }, [examCorrections]);

  useEffect(() => {
    if (exam?.status === 'corrected') {
      setViewMode('review');
    }
  }, [exam?.status]);

  if (!exam) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await uploadPapers(examId, Array.from(files));
      await fetchCorrections(examId);
    } catch (err) {
      console.error('Failed to upload papers:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleBulkUploadClick = () => {
    bulkInputRef.current?.click();
  };

  const handleBulkFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setBulkUploading(true);
    try {
      const response = await correctionsApi.bulkUpload(examId, Array.from(files));
      const data = response.data;
      setBulkResult({
        autoMatched: (data.auto_matched || []).map((m: any) => ({
          correctionId: m.correction_id,
          studentId: m.student_id,
          studentName: m.student_name,
          studentCode: m.student_code,
          confidence: m.confidence
        })),
        needsReview: (data.needs_review || []).map((r: any) => ({
          correctionId: r.correction_id,
          detectedCode: r.detected_code,
          reason: r.reason,
          suggestions: (r.suggestions || []).map((s: any) => ({
            studentId: s.student_id,
            studentName: s.student_name,
            code: s.code
          }))
        })),
        studentsWithoutPapers: (data.students_without_papers || []).map((s: any) => ({
          studentId: s.student_id,
          studentName: s.student_name,
          code: s.code
        }))
      });
      setUploadMode('bulk');
      await fetchCorrections(examId);
    } catch (err) {
      console.error('Failed to bulk upload papers:', err);
    } finally {
      setBulkUploading(false);
      e.target.value = '';
    }
  };

  const handleReviewAssignment = (correctionId: string, studentId: string) => {
    setReviewAssignments(prev => ({ ...prev, [correctionId]: studentId }));
  };

  const handleConfirmReviewAssignments = async () => {
    setConfirmingReview(true);
    const assignments = Object.entries(reviewAssignments);
    const assignedCorrectionIds: string[] = [];
    for (const [correctionId, studentId] of assignments) {
      if (studentId) {
        try {
          await updateCorrection(correctionId, { student_id: studentId });
          assignedCorrectionIds.push(correctionId);
        } catch (err) {
          console.error('Failed to assign student:', err);
        }
      }
    }
    setBulkResult(null);
    setReviewAssignments({});
    setUploadMode('normal');
    await fetchCorrections(examId);

    // Auto-trigger AI analysis for all newly assigned + auto-matched corrections
    const allCorrectionIds = [
      ...assignedCorrectionIds,
      ...(bulkResult?.autoMatched.map((m) => m.correctionId) || []),
    ];
    for (const cId of allCorrectionIds) {
      const correction = examCorrections.find((c) => c.id === cId);
      if (correction && !correction.aiAnalysis) {
        handleProcessAI(cId);
      }
    }
    setConfirmingReview(false);
  };

  const getFullPaperUrl = (paperUrl?: string) => {
    if (!paperUrl) return null;
    if (paperUrl.startsWith('http')) return paperUrl;
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (paperUrl.startsWith('/uploads/')) {
      return `${baseUrl}/files${paperUrl.replace('/uploads', '')}`;
    }
    return `${baseUrl}${paperUrl}`;
  };

  const assignedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    examCorrections.forEach((c) => { if (c.studentId) ids.add(c.studentId); });
    if (bulkResult) {
      bulkResult.autoMatched.forEach((m) => ids.add(m.studentId));
      Object.values(reviewAssignments).forEach((sid) => { if (sid) ids.add(sid); });
    }
    return ids;
  }, [examCorrections, bulkResult, reviewAssignments]);

  const getReasonText = (reason: string) => {
    const reasons: Record<string, string> = {
      'no_code': 'Sin código detectado',
      'partial_code': 'Código parcialmente legible',
      'no_match': 'Código no coincide con ningún alumno',
      'duplicate_code': 'Código duplicado',
      'already_assigned': 'Alumno ya tiene examen',
      'ai_error': 'Error al procesar con IA'
    };
    return reasons[reason] || reason;
  };

  const handleStudentChange = (correctionId: string, studentId: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], studentId } }));
  };

  const handleGradeChange = (correctionId: string, grade: number) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], grade } }));
  };

  const handleNotesChange = (correctionId: string, notes: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], notes } }));
  };

  const handleSavePaper = async (correctionId: string) => {
    const local = localGrades[correctionId];
    if (!local || local.grade === null) return;
    
    setSaving((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const correction = examCorrections.find((c) => c.id === correctionId);
      let weakAreas = correction?.aiAnalysis?.weakAreas || [];
      if (weakAreas.length === 0 && local.grade < (exam?.maxScore || 10) * 0.5) {
        weakAreas = ['Revisar'];
      }
      
      await updateCorrection(correctionId, {
        student_id: local.studentId || undefined,
        grade: local.grade,
        teacher_notes: local.notes,
        weak_areas: weakAreas,
      });
    } catch (err) {
      console.error('Failed to save correction:', err);
    } finally {
      setSaving((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  
  const handleProcessAI = async (correctionId: string) => {
    setAiErrors((prev) => ({ ...prev, [correctionId]: '' }));
    setAiProcessing((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const result = await processAI(correctionId);
      
      if (result?.suggestedStudentName) {
        const nameLower = result.suggestedStudentName.toLowerCase();
        const matchedStudent = students.find((s) => 
          s.name.toLowerCase() === nameLower ||
          s.name.toLowerCase().includes(nameLower) ||
          nameLower.includes(s.name.toLowerCase())
        );
        if (matchedStudent) {
          setLocalGrades((prev) => ({
            ...prev,
            [correctionId]: { ...prev[correctionId], studentId: matchedStudent.id }
          }));
        }
      }
      
      // Refresh corrections to ensure UI is in sync
      await fetchCorrections(examId);
    } catch (err: any) {
      console.error('AI processing failed:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido';
      setAiErrors((prev) => ({ ...prev, [correctionId]: errorMsg }));
    } finally {
      setAiProcessing((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const handleFinish = async () => {
    try {
      await finishCorrection(examId);
      await updateExamStatus(examId, { status: 'corrected' });
      history.goBack();
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const savedCount = examCorrections.filter((c) => c.savedAt).length;
  const totalPapers = examCorrections.length || students.length;
  const progress = totalPapers > 0 ? savedCount / totalPapers : 0;
  const allSaved = savedCount === examCorrections.length && examCorrections.length > 0;

  const correctedStudentIds = new Set(examCorrections.filter((c) => c.savedAt).map((c) => c.studentId));
  const missingStudents = students.filter((s) => !correctedStudentIds.has(s.id));

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
    const areaCount: Record<string, number> = {};
    examCorrections.forEach((c) => {
      const areas = c.weakAreas || c.aiAnalysis?.weakAreas || [];
      areas.forEach((area) => {
        areaCount[area] = (areaCount[area] || 0) + 1;
      });
    });
    return Object.entries(areaCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([area, count]) => ({ area, count }));
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
          case 'grade-desc':
            return (b.grade ?? -1) - (a.grade ?? -1);
          case 'grade-asc':
            return (a.grade ?? 999) - (b.grade ?? 999);
          case 'name':
          default:
            return getStudentName(a.studentId).localeCompare(getStudentName(b.studentId));
        }
      });
    }
    
    return sorted;
  }, [filteredCorrections, highlightStudentId, sortBy, students]);

  const handleReopen = async () => {
    try {
      await updateExamStatus(examId, { status: 'assigned' });
      setViewMode('edit');
    } catch (err) {
      console.error('Failed to reopen exam:', err);
    }
  };

  const handleDownloadExam = () => {
    if (!exam) return;
    const token = localStorage.getItem('access_token');
    const url = examsApi.downloadExamUrl(exam.id);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
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
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
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
              <IonButton onClick={handleDownloadExam} title="Descargar examen">
                <IonIcon icon={downloadOutline} />
              </IonButton>
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
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleFilesSelected}
        />
        <input
          type="file"
          ref={bulkInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleBulkFilesSelected}
        />

        {viewMode === 'review' ? (
          <>
            {examCorrections.length === 0 ? (
              <EmptyState
                icon="📋"
                title="Sin correcciones"
                subtitle="No hay correcciones para este examen"
              />
            ) : (
              <>
                {/* Enhanced Summary Dashboard */}
                <div className="correction-dashboard">
                  <div className="dashboard-main-stats">
                    <div className="dashboard-stat dashboard-stat-primary">
                      <span className="dashboard-stat-value">
                        {examCorrections.filter(c => c.grade !== null).length > 0 
                          ? (examCorrections.reduce((sum, c) => sum + (c.grade || 0), 0) / examCorrections.filter(c => c.grade !== null).length).toFixed(1)
                          : '—'}
                      </span>
                      <span className="dashboard-stat-label">Promedio</span>
                      <span className="dashboard-stat-sublabel">de {exam.maxScore} pts</span>
                    </div>
                    <div className="dashboard-stats-grid">
                      <div className="dashboard-stat">
                        <span className="dashboard-stat-value">{examCorrections.length}</span>
                        <span className="dashboard-stat-label">Exámenes</span>
                      </div>
                      <div className="dashboard-stat dashboard-stat-success">
                        <span className="dashboard-stat-value">{gradeDistribution.excellent + gradeDistribution.good + gradeDistribution.borderline}</span>
                        <span className="dashboard-stat-label">Aprobados</span>
                      </div>
                      <div className="dashboard-stat dashboard-stat-danger">
                        <span className="dashboard-stat-value">{gradeDistribution.fail}</span>
                        <span className="dashboard-stat-label">Reprobados</span>
                      </div>
                    </div>
                  </div>

                  {/* Grade Distribution Bar */}
                  <div className="grade-distribution">
                    <div className="grade-distribution-label">Distribución de notas</div>
                    <div className="grade-distribution-bar">
                      {gradeDistribution.excellent > 0 && (
                        <div 
                          className="grade-bar-segment grade-bar-excellent" 
                          style={{ flex: gradeDistribution.excellent }}
                          title={`Excelente (≥80%): ${gradeDistribution.excellent}`}
                        />
                      )}
                      {gradeDistribution.good > 0 && (
                        <div 
                          className="grade-bar-segment grade-bar-good" 
                          style={{ flex: gradeDistribution.good }}
                          title={`Bueno (60-79%): ${gradeDistribution.good}`}
                        />
                      )}
                      {gradeDistribution.borderline > 0 && (
                        <div 
                          className="grade-bar-segment grade-bar-borderline" 
                          style={{ flex: gradeDistribution.borderline }}
                          title={`Justo (50-59%): ${gradeDistribution.borderline}`}
                        />
                      )}
                      {gradeDistribution.fail > 0 && (
                        <div 
                          className="grade-bar-segment grade-bar-fail" 
                          style={{ flex: gradeDistribution.fail }}
                          title={`Reprobado (<50%): ${gradeDistribution.fail}`}
                        />
                      )}
                    </div>
                    <div className="grade-distribution-legend">
                      <span className="legend-item"><span className="legend-dot legend-excellent"></span> ≥80%</span>
                      <span className="legend-item"><span className="legend-dot legend-good"></span> 60-79%</span>
                      <span className="legend-item"><span className="legend-dot legend-borderline"></span> 50-59%</span>
                      <span className="legend-item"><span className="legend-dot legend-fail"></span> &lt;50%</span>
                    </div>
                  </div>

                  {/* Class-wide Weak Areas */}
                  {classWeakAreas.length > 0 && (
                    <div className="class-weak-areas">
                      <div className="class-weak-areas-header">
                        <IonIcon icon={trendingDownOutline} />
                        <span>Áreas a reforzar en clase</span>
                      </div>
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

                {/* Filter & Sort Controls */}
                <div className="correction-controls">
                  <div className="control-group">
                    <IonIcon icon={funnelOutline} className="control-icon" />
                    <IonSegment value={filterBy} onIonChange={(e) => setFilterBy(e.detail.value as typeof filterBy)} className="filter-segment">
                      <IonSegmentButton value="all">
                        <IonLabel>Todos</IonLabel>
                      </IonSegmentButton>
                      <IonSegmentButton value="passed">
                        <IonLabel>Aprobados</IonLabel>
                      </IonSegmentButton>
                      <IonSegmentButton value="failed">
                        <IonLabel>Reprobados</IonLabel>
                      </IonSegmentButton>
                    </IonSegment>
                  </div>
                  <div className="control-group">
                    <IonIcon icon={swapVerticalOutline} className="control-icon" />
                    <IonSelect 
                      value={sortBy} 
                      onIonChange={(e) => setSortBy(e.detail.value)}
                      interface="popover"
                      className="sort-select"
                    >
                      <IonSelectOption value="name">Nombre</IonSelectOption>
                      <IonSelectOption value="grade-desc">Nota ↓</IonSelectOption>
                      <IonSelectOption value="grade-asc">Nota ↑</IonSelectOption>
                    </IonSelect>
                  </div>
                  <span className="results-count">{sortedCorrections.length} de {examCorrections.length}</span>
                </div>

                <div className="correction-scans">
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
                        teacherNotes={correction.teacherNotes}
                        weakAreas={correction.weakAreas}
                        aiAnalysis={correction.aiAnalysis}
                        highlighted={isHighlighted}
                        paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                        onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {bulkResult && (
              <div className="bulk-review-section">
                <div className="bulk-review-stats">
                  <IonChip color="success">
                    <IonIcon icon={checkmarkOutline} />
                    {bulkResult.autoMatched.length} asignados
                  </IonChip>
                  {bulkResult.needsReview.length > 0 && (
                    <IonChip color="warning">
                      <IonIcon icon={warningOutline} />
                      {bulkResult.needsReview.length} pendientes
                    </IonChip>
                  )}
                  {bulkResult.studentsWithoutPapers.length > 0 && (
                    <IonChip color="medium">
                      <IonIcon icon={helpOutline} />
                      {bulkResult.studentsWithoutPapers.length} sin examen
                    </IonChip>
                  )}
                </div>

                {bulkResult.needsReview.length > 0 && (
                  <div className="bulk-review-cards">
                    <p className="bulk-review-label">Asignación manual necesaria:</p>
                    {bulkResult.needsReview.map((item, idx) => {
                      const correction = examCorrections.find((c) => c.id === item.correctionId);
                      const paperFullUrl = getFullPaperUrl(correction?.paperUrl);
                      return (
                        <IonCard key={item.correctionId} className="bulk-review-card">
                          <IonCardContent className="bulk-review-card-content">
                            <div className="bulk-review-card-top">
                              {paperFullUrl && (
                                <div
                                  className="bulk-review-thumb"
                                  onClick={() => setPreviewUrl(paperFullUrl)}
                                >
                                  <img src={paperFullUrl} alt={`Examen ${idx + 1}`} />
                                  <div className="bulk-review-thumb-overlay">
                                    <IonIcon icon={expandOutline} />
                                  </div>
                                </div>
                              )}
                              <div className="bulk-review-card-info">
                                <span className="bulk-review-card-index">Examen {idx + 1}</span>
                                <div className="bulk-review-card-meta">
                                  {item.detectedCode && <span className="detected-code">{item.detectedCode}</span>}
                                  <span className="reason-text">{getReasonText(item.reason)}</span>
                                </div>
                                <IonSelect
                                  interface="popover"
                                  placeholder="Seleccionar alumno"
                                  value={reviewAssignments[item.correctionId] || ''}
                                  onIonChange={(e) => handleReviewAssignment(item.correctionId, e.detail.value)}
                                  className="bulk-review-select"
                                >
                                  {students
                                    .filter((s) => !assignedStudentIds.has(s.id) || reviewAssignments[item.correctionId] === s.id)
                                    .map((s) => (
                                      <IonSelectOption key={s.id} value={s.id}>
                                        {s.name} {s.studentId ? `(${s.studentId})` : ''}
                                      </IonSelectOption>
                                    ))}
                                  <IonSelectOption value="">— Sin asignar —</IonSelectOption>
                                </IonSelect>
                              </div>
                            </div>
                          </IonCardContent>
                        </IonCard>
                      );
                    })}
                  </div>
                )}

                <div className="bulk-review-actions">
                  <IonButton
                    expand="block"
                    onClick={handleConfirmReviewAssignments}
                    disabled={confirmingReview}
                    className="bulk-review-confirm-btn"
                  >
                    {confirmingReview ? (
                      <><IonSpinner name="crescent" /> Asignando y analizando...</>
                    ) : (
                      <><IonIcon icon={sparkles} slot="start" /> Confirmar y analizar con IA</>
                    )}
                  </IonButton>
                  <IonButton
                    expand="block"
                    fill="clear"
                    color="medium"
                    onClick={() => { setBulkResult(null); setReviewAssignments({}); setUploadMode('normal'); }}
                    disabled={confirmingReview}
                  >
                    Omitir
                  </IonButton>
                </div>
              </div>
            )}

            <div className="correction-toolbar">
              <IonButton size="small" fill="outline" onClick={handleUploadClick} disabled={uploading || bulkUploading}>
                {uploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cameraOutline} slot="start" /> Subir</>}
              </IonButton>
              <IonButton size="small" fill="outline" color="secondary" onClick={handleBulkUploadClick} disabled={uploading || bulkUploading}>
                {bulkUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Carga masiva</>}
              </IonButton>
              
              {allSaved && !isReviewMode && (
                <IonButton size="small" color="success" onClick={handleFinish}>
                  <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar
                </IonButton>
              )}

              {missingStudents.length > 0 && examCorrections.length > 0 && (
                <IonBadge color="warning" className="missing-badge">
                  {missingStudents.length} sin examen
                </IonBadge>
              )}

              <IonButton size="small" fill="clear" color="medium" onClick={() => history.push(`/tabs/exams/${examId}`)}>
                <IonIcon icon={pencilOutline} slot="start" /> Editar examen
              </IonButton>
            </div>

            {loading && examCorrections.length === 0 && (
              <div className="correction-loading"><IonSpinner /></div>
            )}

            {examCorrections.length === 0 && !loading && (
              <EmptyState
                icon="📷"
                title="Sin exámenes"
                subtitle="Sube los exámenes de los alumnos"
                actionLabel="Subir"
                onAction={handleUploadClick}
              />
            )}

            <div className="correction-scans">
              {examCorrections.map((correction, i) => {
                const local = localGrades[correction.id] || { grade: correction.grade, notes: '', studentId: correction.studentId || '' };
                const isSaved = !!correction.savedAt;
                return (
                  <ScanCard
                    key={correction.id}
                    index={i}
                    aiAnalysis={correction.aiAnalysis}
                    selectedStudentId={local.studentId}
                    students={students}
                    maxScore={exam.maxScore}
                    grade={local.grade}
                    teacherNotes={local.notes}
                    saved={isSaved}
                    paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                    onStudentChange={(sid) => handleStudentChange(correction.id, sid)}
                    onGradeChange={(g) => handleGradeChange(correction.id, g)}
                    onNotesChange={(n) => handleNotesChange(correction.id, n)}
                    onSave={() => handleSavePaper(correction.id)}
                    onProcessAI={() => handleProcessAI(correction.id)}
                    onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                    saving={saving[correction.id]}
                    aiProcessing={aiProcessing[correction.id]}
                    aiError={aiErrors[correction.id]}
                  />
                );
              })}
            </div>

            {!allSaved && examCorrections.length > 0 && !isReviewMode && (
              <div className="correction-finish">
                <IonButton expand="block" color="success" onClick={handleFinish}>
                  <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar corrección
                </IonButton>
              </div>
            )}
          </>
        )}
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
                <img src={previewUrl} alt="Examen" className="paper-preview-img" />
              </div>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Correction;
