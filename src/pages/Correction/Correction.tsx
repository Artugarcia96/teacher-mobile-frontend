import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonProgressBar, IonBadge,
  IonSpinner, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption,
  IonChip, IonModal,
} from '@ionic/react';
import { closeOutline, checkmarkCircleOutline, pencilOutline, eyeOutline, cloudUploadOutline, checkmarkOutline, warningOutline, helpOutline, sparkles, downloadOutline, documentTextOutline, timeOutline, peopleOutline, chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import { useParams, useHistory, useLocation } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { corrections as correctionsApi, exams as examsApi, batch, BatchJobProgress } from '../../services/api';
import { BulkUploadResult } from '../../types';
import ScanCard from '../../components/ScanCard';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import QRReviewTable from '../../components/QRReviewTable';
import EmptyState from '../../components/EmptyState';
import BatchProgressModal from '../../components/BatchProgressModal';
import { GradeDonut, WeakAreasRadar } from '../../components/charts';
import './Correction.css';

const Correction: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const history = useHistory();
  const location = useLocation();
  
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

  useEffect(() => {
    if (!loading && allExams.length > 0 && !exam) {
      history.replace('/tabs/exams');
    }
  }, [exam, loading, allExams.length, history]);
  
  const [filterBy, setFilterBy] = useState<'all' | 'passed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'grade-asc' | 'grade-desc'>('name');

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; notes: string; studentId: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [reviewAssignments, setReviewAssignments] = useState<Record<string, string>>({});
  const [confirmingReview, setConfirmingReview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  // Per-student upload state
  const [uploadingForStudent, setUploadingForStudent] = useState<string | null>(null);
  const studentFileInputRef = useRef<HTMLInputElement>(null);
  const [showStudentList, setShowStudentList] = useState(false);

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
        } else if (!next[c.id].studentId && c.studentId) {
          next[c.id] = { ...next[c.id], studentId: c.studentId };
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
          <div className="exams-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  // ── Per-student upload ──

  const handleStudentUploadClick = (studentId: string) => {
    setUploadingForStudent(studentId);
    setTimeout(() => studentFileInputRef.current?.click(), 100);
  };

  const handleStudentFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !uploadingForStudent) {
      setUploadingForStudent(null);
      return;
    }
    try {
      const newCorrections = await uploadPapers(examId, Array.from(files), uploadingForStudent);
      await fetchCorrections(examId);
      for (const c of newCorrections) {
        handleProcessAI(c.id);
      }
    } catch (err) {
      console.error('Failed to upload paper for student:', err);
    } finally {
      setUploadingForStudent(null);
      e.target.value = '';
    }
  };

  // ── Bulk upload (QR detection) ──

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
    
    await fetchCorrections(examId);

    const allCorrectionIds = [
      ...assignedCorrectionIds,
      ...(bulkResult?.autoMatched.map((m) => m.correctionId) || []),
    ].filter(cId => {
      const correction = examCorrections.find((c) => c.id === cId);
      return correction && !correction.aiAnalysis;
    });
    
    setBulkResult(null);
    setReviewAssignments({});
    setConfirmingReview(false);

    if (allCorrectionIds.length > 1) {
      try {
        const response = await batch.startBatchCorrection(examId, allCorrectionIds);
        setBatchJobId(response.data.id);
        setShowBatchProgress(true);
      } catch (err) {
        console.error('Failed to start batch correction:', err);
        for (const cId of allCorrectionIds) {
          handleProcessAI(cId);
        }
      }
    } else if (allCorrectionIds.length === 1) {
      handleProcessAI(allCorrectionIds[0]);
    }
  };
  
  const handleBatchProcessAll = async () => {
    const unprocessedIds = examCorrections
      .filter(c => !c.aiProcessed && c.paperUrl)
      .map(c => c.id);
    
    if (unprocessedIds.length === 0) return;
    
    try {
      const response = await batch.startBatchCorrection(examId, unprocessedIds);
      setBatchJobId(response.data.id);
      setShowBatchProgress(true);
    } catch (err) {
      console.error('Failed to start batch correction:', err);
    }
  };
  
  const handleBatchComplete = async (job: BatchJobProgress) => {
    await fetchCorrections(examId);
    if (job.status === 'completed' && job.failed_items === 0) {
      setShowBatchProgress(false);
      setBatchJobId(null);
    }
  };
  
  useEffect(() => {
    const fetchEstimate = async () => {
      const unprocessedCount = examCorrections.filter(c => !c.aiProcessed && c.paperUrl).length;
      if (unprocessedCount > 1) {
        try {
          const res = await batch.estimateCorrectionTime(examId);
          setBatchEstimate(res.data);
        } catch (err) {
          console.error('Failed to fetch estimate:', err);
        }
      } else {
        setBatchEstimate(null);
      }
    };
    fetchEstimate();
  }, [examCorrections, examId]);

  const getFullPaperUrl = (paperUrl?: string) => {
    if (!paperUrl) return null;
    if (paperUrl.startsWith('http')) return paperUrl;
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    
    // Handle various path formats from backend
    let cleanPath = paperUrl;
    
    // If path already starts with /files/, just append to baseUrl
    if (paperUrl.startsWith('/files/')) {
      return `${baseUrl}${paperUrl}`;
    }
    
    // If path starts with /uploads/, convert to /files/
    if (paperUrl.startsWith('/uploads/')) {
      cleanPath = '/files' + paperUrl.replace('/uploads', '');
      return `${baseUrl}${cleanPath}`;
    }
    
    // If path starts with uploads/ (no leading slash), convert to /files/
    if (paperUrl.startsWith('uploads/')) {
      cleanPath = '/files/' + paperUrl.replace('uploads/', '');
      return `${baseUrl}${cleanPath}`;
    }
    
    // Default: prepend baseUrl with proper slash handling
    if (!paperUrl.startsWith('/')) {
      return `${baseUrl}/${paperUrl}`;
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
  
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [showBatchProgress, setShowBatchProgress] = useState(false);
  const [batchEstimate, setBatchEstimate] = useState<{ paper_count: number; time_string: string } | null>(null);
  
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

  const handleDownloadStudentPaper = (paperUrl: string, studentName?: string) => {
    if (!paperUrl || !exam) return;
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
        const fileName = studentName 
          ? `${exam.name}_${studentName}.${ext}`
          : `${exam.name}_examen.${ext}`;
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

  // Student list: per-student status
  const studentCorrectionMap = useMemo(() => {
    const map: Record<string, { correction: typeof examCorrections[0] | null; status: 'none' | 'uploaded' | 'processing' | 'corrected' }> = {};
    students.forEach(s => {
      const corr = examCorrections.find(c => c.studentId === s.id);
      let status: 'none' | 'uploaded' | 'processing' | 'corrected' = 'none';
      if (corr) {
        if (corr.savedAt) status = 'corrected';
        else if (corr.aiAnalysis || corr.aiProcessed) status = 'processing';
        else status = 'uploaded';
      }
      map[s.id] = { correction: corr || null, status };
    });
    return map;
  }, [students, examCorrections]);

  const missingCount = students.filter(s => studentCorrectionMap[s.id]?.status === 'none').length;

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
        {/* Hidden file inputs */}
        <input
          type="file"
          ref={bulkInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleBulkFilesSelected}
        />
        <input
          type="file"
          ref={studentFileInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleStudentFileSelected}
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
                        { label: 'Justo', count: gradeDistribution.borderline, color: 'var(--chart-borderline, #F59E0B)' },
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

                    {classWeakAreas.length >= 3 ? (
                      <WeakAreasRadar areas={classWeakAreas} size={160} />
                    ) : classWeakAreas.length > 0 ? (
                      <div className="class-weak-areas">
                        <div className="class-weak-areas-tags">
                          {classWeakAreas.map(({ area, count }) => (
                            <span key={area} className="class-weak-tag">
                              {area} <span className="weak-count">{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Filter & Sort - compact single row */}
                <div className="correction-controls">
                  <IonSegment value={filterBy} onIonChange={(e) => setFilterBy(e.detail.value as typeof filterBy)} className="filter-segment">
                    <IonSegmentButton value="all"><IonLabel>Todos ({examCorrections.length})</IonLabel></IonSegmentButton>
                    <IonSegmentButton value="passed"><IonLabel>Aprobados</IonLabel></IonSegmentButton>
                    <IonSegmentButton value="failed"><IonLabel>Suspensos</IonLabel></IonSegmentButton>
                  </IonSegment>
                  <IonSelect value={sortBy} onIonChange={(e) => setSortBy(e.detail.value)} interface="popover" className="sort-select">
                    <IonSelectOption value="name">Nombre</IonSelectOption>
                    <IonSelectOption value="grade-desc">Nota ↓</IonSelectOption>
                    <IonSelectOption value="grade-asc">Nota ↑</IonSelectOption>
                  </IonSelect>
                </div>

                {/* Collapsible student list */}
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
                        teacherNotes={correction.teacherNotes}
                        weakAreas={correction.weakAreas}
                        aiAnalysis={correction.aiAnalysis}
                        aiProcessed={correction.aiProcessed}
                        highlighted={isHighlighted}
                        paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                        onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                        onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, student?.name) : undefined}
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
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        ) : (
          <>
            {/* Bulk review results */}
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
                  <QRReviewTable
                    items={bulkResult.needsReview.map((item) => ({
                      correctionId: item.correctionId,
                      detectedCode: item.detectedCode,
                      reason: item.reason,
                    }))}
                    itemLabel="Examen"
                    assignments={reviewAssignments}
                    students={students}
                    assignedStudentIds={assignedStudentIds}
                    thumbnails={Object.fromEntries(
                      bulkResult.needsReview
                        .map((item) => {
                          const c = examCorrections.find((c) => c.id === item.correctionId);
                          const url = getFullPaperUrl(c?.paperUrl);
                          return url ? [item.correctionId, url] : null;
                        })
                        .filter(Boolean) as [string, string][]
                    )}
                    paperUrls={Object.fromEntries(
                      bulkResult.needsReview
                        .map((item) => {
                          const c = examCorrections.find((c) => c.id === item.correctionId);
                          const url = getFullPaperUrl(c?.paperUrl);
                          return url ? [item.correctionId, url] : null;
                        })
                        .filter(Boolean) as [string, string][]
                    )}
                    onAssign={handleReviewAssignment}
                    onPreview={(url) => setPreviewUrl(url)}
                  />
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
                    onClick={() => { setBulkResult(null); setReviewAssignments({}); }}
                    disabled={confirmingReview}
                  >
                    Omitir
                  </IonButton>
                </div>
              </div>
            )}

            {/* Toolbar */}
            <div className="correction-toolbar">
              <IonButton size="small" fill="outline" color="secondary" onClick={handleBulkUploadClick} disabled={bulkUploading}>
                {bulkUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Carga masiva</>}
              </IonButton>
              
              {!bulkResult && examCorrections.filter(c => !c.aiProcessed && c.paperUrl).length > 1 && (
                <IonButton 
                  size="small" 
                  color="tertiary" 
                  onClick={handleBatchProcessAll}
                  className="batch-ai-btn"
                >
                  <IonIcon icon={sparkles} slot="start" />
                  Analizar todo ({examCorrections.filter(c => !c.aiProcessed && c.paperUrl).length})
                  {batchEstimate && (
                    <IonBadge color="light" className="time-badge">
                      <IonIcon icon={timeOutline} /> {batchEstimate.time_string}
                    </IonBadge>
                  )}
                </IonButton>
              )}
              
              {allSaved && !isReviewMode && (
                <IonButton size="small" color="success" onClick={handleFinish}>
                  <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar
                </IonButton>
              )}

              <IonButton size="small" fill="clear" color="medium" onClick={() => history.push(`/tabs/exams/${examId}`)}>
                <IonIcon icon={pencilOutline} slot="start" /> Editar examen
              </IonButton>
            </div>

            {/* Student List - per-student upload */}
            {students.length > 0 && (
              <div className="student-list-section">
                <div className="student-list-header" onClick={() => setShowStudentList(!showStudentList)}>
                  <div className="student-list-header-left">
                    <IonIcon icon={peopleOutline} />
                    <span>Alumnos ({students.length})</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {missingCount > 0 && (
                      <IonBadge color="warning">{missingCount} sin examen</IonBadge>
                    )}
                    <IonIcon icon={showStudentList ? chevronUpOutline : chevronDownOutline} />
                  </div>
                </div>

                {showStudentList && (
                  <div className="student-list-items">
                    {students.map(student => {
                      const info = studentCorrectionMap[student.id];
                      const isUploading = uploadingForStudent === student.id;
                      
                      return (
                        <div
                          key={student.id}
                          className={`student-list-item student-list-item--${info?.status || 'none'}`}
                        >
                          <div className="student-list-item-info">
                            <div className="student-list-item-name">{student.name}</div>
                            <div className="student-list-item-status">
                              {info?.status === 'corrected' && (
                                <><IonIcon icon={checkmarkCircleOutline} color="success" /> Corregido — {info.correction?.grade ?? '—'}/{exam.maxScore}</>
                              )}
                              {info?.status === 'processing' && (
                                <><IonIcon icon={sparkles} color="warning" /> Analizado por IA</>
                              )}
                              {info?.status === 'uploaded' && (
                                <><IonIcon icon={cloudUploadOutline} color="medium" /> Subido, pendiente de IA</>
                              )}
                              {info?.status === 'none' && 'Sin examen'}
                            </div>
                          </div>
                          <div className="student-list-item-actions">
                            {info?.status === 'none' && (
                              <IonButton
                                size="small"
                                fill="outline"
                                onClick={() => handleStudentUploadClick(student.id)}
                                disabled={isUploading}
                              >
                                {isUploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Subir</>}
                              </IonButton>
                            )}
                            {info?.correction && (
                              <IonButton
                                size="small"
                                fill="clear"
                                color="primary"
                                onClick={() => {
                                  setShowStudentList(false);
                                  const el = document.getElementById(`correction-${info.correction!.id}`);
                                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                              >
                                Ver
                              </IonButton>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {loading && examCorrections.length === 0 && (
              <div className="correction-loading"><IonSpinner /></div>
            )}

            {examCorrections.length === 0 && !loading && (
              <EmptyState
                icon="📷"
                title="Sin exámenes"
                subtitle="Sube los exámenes de los alumnos con carga masiva o uno por uno"
                actionLabel="Carga masiva"
                onAction={handleBulkUploadClick}
              />
            )}

            <div className="correction-scans">
              {examCorrections.map((correction, i) => {
                const local = localGrades[correction.id] || { grade: correction.grade, notes: '', studentId: correction.studentId || '' };
                const isSaved = !!correction.savedAt;
                const student = students.find(s => s.id === local.studentId);
                return (
                  <div key={correction.id} id={`correction-${correction.id}`}>
                    <ScanCard
                      index={i}
                      aiAnalysis={correction.aiAnalysis}
                      selectedStudentId={local.studentId}
                      students={students}
                      maxScore={exam.maxScore}
                      grade={local.grade}
                      originalGrade={correction.grade}
                      teacherNotes={local.notes}
                      saved={isSaved}
                      paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                      onStudentChange={(sid) => handleStudentChange(correction.id, sid)}
                      onGradeChange={(g) => handleGradeChange(correction.id, g)}
                      onNotesChange={(n) => handleNotesChange(correction.id, n)}
                      onSave={() => handleSavePaper(correction.id)}
                      onProcessAI={() => handleProcessAI(correction.id)}
                      onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                      onDownloadPaper={correction.paperUrl ? () => handleDownloadStudentPaper(correction.paperUrl!, student?.name) : undefined}
                      saving={saving[correction.id]}
                      aiProcessing={aiProcessing[correction.id]}
                      aiError={aiErrors[correction.id]}
                    />
                  </div>
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
                {previewUrl.toLowerCase().endsWith('.pdf') ? (
                  <iframe src={previewUrl} title="Examen" className="paper-preview-pdf" />
                ) : (
                  <img src={previewUrl} alt="Examen" className="paper-preview-img" />
                )}
              </div>
            )}
          </IonContent>
        </IonModal>
        
        {/* Batch Processing Progress Modal */}
        <BatchProgressModal
          isOpen={showBatchProgress}
          jobId={batchJobId}
          title="Corrigiendo exámenes"
          onClose={() => {
            setShowBatchProgress(false);
            fetchCorrections(examId);
          }}
          onComplete={handleBatchComplete}
        />
      </IonContent>
    </IonPage>
  );
};

export default Correction;
