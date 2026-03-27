import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonBadge, IonIcon, IonSpinner, IonTextarea,
  IonLabel, IonModal, IonInput, IonSelect, IonSelectOption,
  IonActionSheet,
} from '@ionic/react';
import {
  addOutline, sparklesOutline, chevronDownOutline, chevronUpOutline,
  chevronForwardOutline, trendingUpOutline, trendingDownOutline, removeOutline,
  calendarOutline, filterOutline, documentTextOutline, cloudUploadOutline,
  trashOutline, eyeOutline, downloadOutline, chatbubbleOutline,
} from 'ionicons/icons';
import ReactMarkdown from 'react-markdown';
import { useParams, useHistory, useLocation } from 'react-router-dom';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useClassesStore } from '../../store/classesStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { CalendarEvent, ClassSubjectSummary, AttendanceRecord, MentionedStudent, StudentMentionEntry } from '../../types';
import MentionTextarea from '../../components/MentionTextarea';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import GradeDonut from '../../components/charts/GradeDonut';
import GradeTrendLine from '../../components/charts/GradeTrendLine';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { avatarColor } from '../../utils/avatarColors';
import { students as studentsApi, exercises as exercisesApi } from '../../services/api';
import './StudentFile.css';

function formatDate(d: string) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${parts[2]}/${parts[1]}`;
}

function formatTime(t?: string) {
  if (!t) return '';
  return t.slice(0, 5);
}

const StudentFile: React.FC = () => {
  const { classId, id } = useParams<{ classId: string; id: string }>();
  const history = useHistory();
  const location = useLocation();
  const isDesktop = useIsDesktop();
  const querySubjectId = useMemo(() => new URLSearchParams(location.search).get('subjectId'), [location.search]);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const addComment = useStudentsStore((s) => s.addComment);

  const exams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const allCorrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);
  const getWeakAreasForStudent = useCorrectionStore((s) => s.getWeakAreasForStudent);

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);

  const calendarEvents = useCalendarStore((s) => s.events);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);
  const createEvent = useCalendarStore((s) => s.createEvent);

  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const fetchStudentHistory = useAttendanceStore((s) => s.fetchStudentHistory);
  const uploadJustification = useAttendanceStore((s) => s.uploadJustification);
  const deleteJustification = useAttendanceStore((s) => s.deleteJustification);

  const allExerciseCorrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchExerciseCorrections = useExerciseCorrectionStore((s) => s.fetchAllCorrections);

  const student = useMemo(() => allStudents.find((st) => st.id === id), [allStudents, id]);

  // Map exercise ID -> grade from exercise corrections
  const exerciseGrades = useMemo(() => {
    const map = new Map<string, number | null>();
    allExerciseCorrections.forEach((c) => {
      if (c.studentId === id && c.grade != null) {
        map.set(c.exerciseId, c.grade);
      }
    });
    return map;
  }, [allExerciseCorrections, id]);
  const corrections = useMemo(() => allCorrections.filter((c) => c.studentId === id), [allCorrections, id]);
  const exercises = useMemo(() => allExercises.filter((e) => e.studentId === id), [allExercises, id]);
  const weakAreas = useMemo(() => getWeakAreasForStudent(id), [id, getWeakAreasForStudent]);

  // Subjects for this class
  const subjects: ClassSubjectSummary[] = classSubjects[classId] || [];

  // State
  const [selectedSubject, setSelectedSubject] = useState<string>(querySubjectId || 'all');
  const [commentText, setCommentText] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', date: '', startTime: '', endTime: '', type: 'tutoring' as string });
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [justificationActionRecord, setJustificationActionRecord] = useState<AttendanceRecord | null>(null);
  const [uploadingJustification, setUploadingJustification] = useState(false);
  const justificationInputRef = useRef<HTMLInputElement>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentMentions, setCommentMentions] = useState<MentionedStudent[]>([]);
  const [studentMentions, setStudentMentions] = useState<StudentMentionEntry[]>([]);
  const [mentionsOpen, setMentionsOpen] = useState(false);

  // Attendance stats
  const attendanceStats = useMemo(() => {
    if (attendanceHistory.length === 0) return null;
    const total = attendanceHistory.length;
    const present = attendanceHistory.filter((r) => r.status === 'present').length;
    const absent = attendanceHistory.filter((r) => r.status === 'absent').length;
    const late = attendanceHistory.filter((r) => r.status === 'late').length;
    const justified = attendanceHistory.filter((r) => r.status === 'justified').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, late, justified, rate };
  }, [attendanceHistory]);

  // Filter data by subject
  const filteredCorrections = useMemo(() => {
    if (selectedSubject === 'all') return corrections;
    return corrections.filter((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      return exam?.subjectId === selectedSubject;
    });
  }, [corrections, selectedSubject, exams]);

  const filteredExercises = useMemo(() => {
    if (selectedSubject === 'all') return exercises;
    return exercises.filter((e) => {
      if (e.subjectId === selectedSubject) return true;
      if (e.sourceExamId) {
        const exam = exams.find((ex) => ex.id === e.sourceExamId);
        if (exam?.subjectId === selectedSubject) return true;
      }
      if (e.sourceExamIds?.length) {
        return e.sourceExamIds.some((eid) => {
          const exam = exams.find((ex) => ex.id === eid);
          return exam?.subjectId === selectedSubject;
        });
      }
      return false;
    });
  }, [exercises, selectedSubject, exams]);

  // Grade stats
  const avgGrade = filteredCorrections.length > 0
    ? filteredCorrections.reduce((sum, c) => sum + (c.grade || 0), 0) / filteredCorrections.length
    : null;

  // Performance trend
  const performanceTrend = useMemo(() => {
    if (filteredCorrections.length < 2) return 'stable';
    const sorted = [...filteredCorrections].sort((a, b) =>
      new Date(a.savedAt || '').getTime() - new Date(b.savedAt || '').getTime()
    );
    const midpoint = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, midpoint);
    const secondHalf = sorted.slice(midpoint);
    const firstAvg = firstHalf.reduce((sum, c) => sum + (c.grade || 0), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, c) => sum + (c.grade || 0), 0) / secondHalf.length;
    const diff = secondAvg - firstAvg;
    if (diff > 0.5) return 'improving';
    if (diff < -0.5) return 'declining';
    return 'stable';
  }, [filteredCorrections]);

  const trendIcon = performanceTrend === 'improving' ? trendingUpOutline :
    performanceTrend === 'declining' ? trendingDownOutline : removeOutline;
  const trendLabel = performanceTrend === 'improving' ? 'Mejorando' :
    performanceTrend === 'declining' ? 'En descenso' : 'Estable';

  // Aggregated weak areas
  const aggregatedWeakAreas = useMemo(() => {
    const counts = new Map<string, number>();
    filteredCorrections.forEach((c) => {
      (c.weakAreas || []).forEach((area) => {
        counts.set(area, (counts.get(area) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredCorrections]);

  // Grade distribution for donut
  const gradeDistribution = useMemo(() => {
    let excellent = 0, good = 0, borderline = 0, fail = 0;
    filteredCorrections.forEach((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      if (!exam || c.grade === null) return;
      const pct = c.grade / exam.maxScore;
      if (pct >= 0.8) excellent++;
      else if (pct >= 0.6) good++;
      else if (pct >= 0.5) borderline++;
      else fail++;
    });
    return [
      { label: 'Excelente', count: excellent, color: 'var(--chart-excellent, #10B981)' },
      { label: 'Bien', count: good, color: 'var(--chart-good, #3B82F6)' },
      { label: 'Suficiente', count: borderline, color: 'var(--chart-borderline, #F59E0B)' },
      { label: 'Suspenso', count: fail, color: 'var(--chart-fail, #EF4444)' },
    ];
  }, [filteredCorrections, exams]);

  // Trend line data
  const trendData = useMemo(() => {
    const sorted = [...filteredCorrections]
      .filter((c) => c.grade !== null)
      .sort((a, b) => new Date(a.savedAt || '').getTime() - new Date(b.savedAt || '').getTime());
    return sorted.map((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      return {
        label: exam?.name?.slice(0, 8) || formatDate(c.savedAt?.slice(0, 10) || ''),
        value: c.grade || 0,
        maxValue: exam?.maxScore || 10,
      };
    });
  }, [filteredCorrections, exams]);

  // ─── Unified academic data grouped by subject ───
  const academicBySubject = useMemo(() => {
    const subjectMap = new Map<string, {
      subjectName: string;
      exams: Array<{ exam: typeof exams[0]; correction: typeof filteredCorrections[0] | null }>;
      exercises: typeof filteredExercises;
    }>();

    // Exams from corrections
    filteredCorrections.forEach((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      if (!exam) return;
      const key = exam.subjectId || '__none__';
      const subjectName = exam.subjectName || 'Sin asignatura';
      if (!subjectMap.has(key)) subjectMap.set(key, { subjectName, exams: [], exercises: [] });
      subjectMap.get(key)!.exams.push({ exam, correction: c });
    });

    // Uncorrected exams in this class
    exams.forEach((exam) => {
      if (selectedSubject !== 'all' && exam.subjectId !== selectedSubject) return;
      if (exam.classId !== classId) return;
      const alreadyHas = filteredCorrections.some((c) => c.examId === exam.id);
      if (alreadyHas) return;
      const key = exam.subjectId || '__none__';
      const subjectName = exam.subjectName || 'Sin asignatura';
      if (!subjectMap.has(key)) subjectMap.set(key, { subjectName, exams: [], exercises: [] });
      subjectMap.get(key)!.exams.push({ exam, correction: null });
    });

    // Exercises - resolve subject from exam if needed
    filteredExercises.forEach((ex) => {
      let subjectKey = ex.subjectId || '__none__';
      let subjectName = ex.subjectName || 'Sin asignatura';
      if (subjectKey === '__none__' && ex.sourceExamId) {
        const srcExam = exams.find((e) => e.id === ex.sourceExamId);
        if (srcExam?.subjectId) {
          subjectKey = srcExam.subjectId;
          subjectName = srcExam.subjectName || subjectName;
        }
      }
      if (!subjectMap.has(subjectKey)) subjectMap.set(subjectKey, { subjectName, exams: [], exercises: [] });
      subjectMap.get(subjectKey)!.exercises.push(ex);
    });

    return Array.from(subjectMap.entries()).map(([key, val]) => ({
      subjectId: key,
      subjectName: val.subjectName,
      exams: val.exams,
      exercises: val.exercises,
    }));
  }, [filteredCorrections, filteredExercises, exams, classId, selectedSubject]);

  const toggleSubject = (subjectId: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    setAiSummary(null);
    try {
      const res = await studentsApi.getSummary(id, classId);
      setAiSummary(res.data.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleExerciseDownload = (exerciseId: string, type: 'exercises' | 'solutions') => {
    const url = type === 'exercises'
      ? exercisesApi.downloadExercisesPdf(exerciseId)
      : exercisesApi.downloadSolutionsPdf(exerciseId);
    const token = localStorage.getItem('access_token');
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${type}_${exerciseId}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchStudents(classId);
    fetchExams(classId);
    fetchExercises(id);
    fetchAllCorrections();
    fetchExerciseCorrections();
    fetchClassSubjects(classId);
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    fetchEvents(start, end, undefined, id);
    fetchStudentHistory(id, classId).then(setAttendanceHistory).catch(() => {});
    studentsApi.getMentions(id).then((res) => setStudentMentions(res.data)).catch(() => {});
  }, [classId, id, fetchStudents, fetchExams, fetchExercises, fetchAllCorrections, fetchExerciseCorrections, fetchClassSubjects, fetchEvents, fetchStudentHistory]);

  const handleSaveComment = async () => {
    if (!commentText.trim() || !student) return;
    setSaving(true);
    try {
      await addComment(student.id, commentText.trim(), commentMentions.map((s) => s.id));
      setCommentText('');
      setCommentMentions([]);
      setShowCommentInput(false);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleJustificationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !justificationActionRecord) return;
    setUploadingJustification(true);
    try {
      const updated = await uploadJustification(justificationActionRecord.id, file);
      setAttendanceHistory((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
    } catch (err) { console.error(err); }
    finally {
      setUploadingJustification(false);
      setJustificationActionRecord(null);
      if (justificationInputRef.current) justificationInputRef.current.value = '';
    }
  };

  const handleDeleteJustification = async (record: AttendanceRecord) => {
    try {
      const updated = await deleteJustification(record.id);
      setAttendanceHistory((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
    } catch (err) { console.error(err); }
  };

  const handleViewJustification = (record: AttendanceRecord) => {
    if (record.justificationUrl) {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      window.open(`${baseUrl}${record.justificationUrl}`, '_blank');
    }
  };

  const handleCreateEvent = useCallback(async () => {
    if (!eventForm.title.trim() || !eventForm.date) return;
    setCreatingEvent(true);
    try {
      await createEvent({
        student_id: id,
        class_id: classId,
        title: eventForm.title.trim(),
        event_date: eventForm.date,
        start_time: eventForm.startTime || undefined,
        end_time: eventForm.endTime || undefined,
        event_type: eventForm.type,
      });
      setShowEventModal(false);
      setEventForm({ title: '', date: '', startTime: '', endTime: '', type: 'tutoring' });
      const start = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
      fetchEvents(start, end, undefined, id);
    } catch (err) { console.error(err); }
    finally { setCreatingEvent(false); }
  }, [eventForm, id, classId, createEvent, fetchEvents]);

  if (!student) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
            <IonSpinner color="primary" />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const displayedComments = showAllComments ? student.comments : student.comments.slice(0, 2);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
          </IonButtons>
          <IonTitle>{student.name}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="sf-content" scrollY>
        {/* ─── Profile header ─── */}
        <div className="sf-profile">
          <div className="sf-profile__avatar" style={{ background: avatarColor(student.name) }}>
            {student.name.charAt(0)}
          </div>
          <div className="sf-profile__info">
            <h2 className="sf-profile__name">{student.name}</h2>
            {student.studentId && <p className="sf-profile__code">{student.studentId}</p>}
          </div>
          {/* Inline subject filter */}
          {subjects.length > 1 && (
            <IonSelect
              value={selectedSubject}
              onIonChange={(e) => setSelectedSubject(e.detail.value as string)}
              interface="popover"
              className="sf-profile__subject-select"
              placeholder="Asignatura"
            >
              <IonSelectOption value="all">Todas</IonSelectOption>
              {subjects.map((s) => (
                <IonSelectOption key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </IonSelectOption>
              ))}
            </IonSelect>
          )}
        </div>

        {/* ─── Stats + Trend ─── */}
        <div className="sf-stats">
          <div className="metric-card">
            <div className="metric-card__value">{filteredCorrections.length}</div>
            <div className="metric-card__label">Exámenes</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{avgGrade !== null ? avgGrade.toFixed(1) : '—'}</div>
            <div className="metric-card__label">Promedio</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__value">{filteredExercises.length}</div>
            <div className="metric-card__label">Ejercicios</div>
          </div>
          <div className="metric-card">
            <div className={`metric-card__value ${attendanceStats ? (attendanceStats.rate < 75 ? 'metric-card__value--danger' : attendanceStats.rate < 90 ? 'metric-card__value--warning' : '') : ''}`}>
              {attendanceStats ? `${attendanceStats.rate}%` : '—'}
            </div>
            <div className="metric-card__label">Asistencia</div>
          </div>
        </div>

        {filteredCorrections.length >= 2 && (
          <div className={`sf-trend sf-trend--${performanceTrend}`}>
            <IonIcon icon={trendIcon} />
            <span>{trendLabel}</span>
          </div>
        )}

        {/* ─── Rendimiento (charts) ─── */}
        {filteredCorrections.length > 0 && (
          <div className="sf-section">
            <div className="sf-charts-row">
              <div className="sf-chart-card">
                <GradeDonut
                  distribution={gradeDistribution}
                  centerLabel={avgGrade !== null ? avgGrade.toFixed(1) : '—'}
                  centerSubLabel="promedio"
                  size={100}
                />
              </div>
              {trendData.length >= 2 && (
                <div className="sf-chart-card sf-chart-card--wide">
                  <span className="sf-chart-card__title">Evolución</span>
                  <GradeTrendLine data={trendData} height={80} />
                </div>
              )}
            </div>
            {aggregatedWeakAreas.length > 0 && (
              <div className="sf-weak-tags" style={{ marginTop: 'var(--space-sm)' }}>
                {aggregatedWeakAreas.slice(0, 6).map((a) => (
                  <span key={a.topic} className="sf-weak-tag">
                    {a.topic} <span className="sf-weak-count">{a.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Acciones rápidas ─── */}
        <div className="sf-actions-row">
          <button className="sf-action-btn" onClick={() => setShowExerciseModal(true)}>
            <IonIcon icon={sparklesOutline} />
            <span>Ejercicios</span>
          </button>
          <button className="sf-action-btn" onClick={handleGenerateSummary} disabled={loadingSummary}>
            {loadingSummary
              ? <IonSpinner name="crescent" style={{ width: 20, height: 20 }} />
              : <IonIcon icon={chatbubbleOutline} />}
            <span>Resumen IA</span>
          </button>
          <button className="sf-action-btn" onClick={() => setShowEventModal(true)}>
            <IonIcon icon={calendarOutline} />
            <span>Evento</span>
          </button>
        </div>

        {/* AI summary inline */}
        {(aiSummary || loadingSummary) && (
          <div className="sf-ai-summary">
            {loadingSummary ? (
              <div className="sf-ai-summary__loading">
                <IonSpinner name="crescent" color="primary" />
                <span>Analizando datos del alumno...</span>
              </div>
            ) : (
              <div className="sf-ai-summary__content">
                <ReactMarkdown>{aiSummary!}</ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* ─── Académico (THE main section) ─── */}
        <div className="sf-section">
          <div className="sf-section__header">
            <span className="sf-section__title">Académico</span>
          </div>

          {academicBySubject.length === 0 ? (
            <p className="sf-empty">Sin datos académicos</p>
          ) : (
            <div className="sf-academic-groups">
              {academicBySubject.map((group) => {
                const isExpanded = expandedSubjects.has(group.subjectId);
                return (
                  <div key={group.subjectId} className="sf-academic-group">
                    <div className="sf-academic-group__header" onClick={() => toggleSubject(group.subjectId)}>
                      <IonIcon
                        icon={isExpanded ? chevronDownOutline : chevronForwardOutline}
                        className="sf-academic-group__chevron"
                      />
                      <span className="sf-academic-group__name">{group.subjectName}</span>
                      <span className="sf-academic-group__counts">
                        {group.exams.length > 0 && `${group.exams.length} exam.`}
                        {group.exams.length > 0 && group.exercises.length > 0 && ' · '}
                        {group.exercises.length > 0 && `${group.exercises.length} ejerc.`}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="sf-academic-group__content">
                        {/* Exam rows */}
                        {group.exams.map(({ exam, correction }) => {
                          const hasGrade = correction?.grade != null;
                          const pct = hasGrade && exam ? (correction!.grade! / exam.maxScore) : 0;
                          return (
                            <div
                              key={exam.id + (correction?.id || '')}
                              className="sf-grade-row"
                              style={{ cursor: correction ? 'pointer' : 'default' }}
                              onClick={() => correction && history.push(`/correction/${exam.id}?studentId=${id}`)}
                            >
                              {hasGrade && (
                                <div
                                  className="sf-grade-row__bar"
                                  style={{
                                    width: `${Math.max(pct * 100, 4)}%`,
                                    background: pct >= 0.8 ? 'var(--chart-excellent)' : pct >= 0.6 ? 'var(--chart-good)' : pct >= 0.5 ? 'var(--chart-borderline)' : 'var(--chart-fail)'
                                  }}
                                />
                              )}
                              <div className="sf-grade-row__content">
                                <span className="sf-grade-row__name">{exam.name}</span>
                                <div className="sf-grade-row__right">
                                  {exam.date && <span className="sf-grade-row__date">{formatDate(exam.date)}</span>}
                                  {hasGrade ? (
                                    <span className={`sf-grade-pill ${pct >= 0.8 ? 'grade-pass' : pct >= 0.5 ? 'grade-borderline' : 'grade-fail'}`}>
                                      {correction!.grade}/{exam.maxScore}
                                    </span>
                                  ) : (
                                    <IonBadge color={exam.status === 'corrected' ? 'success' : exam.status === 'assigned' ? 'warning' : 'medium'} style={{ fontSize: 10 }}>
                                      {exam.status === 'corrected' ? 'Corregido' : exam.status === 'assigned' ? 'Asignado' : 'Subido'}
                                    </IonBadge>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Separator if both exams and exercises */}
                        {group.exams.length > 0 && group.exercises.length > 0 && (
                          <div className="sf-academic-divider" />
                        )}

                        {/* Exercise compact rows */}
                        {group.exercises.map((ex) => {
                          const grade = exerciseGrades.get(ex.id);
                          const hasGrade = grade != null;
                          const pct = hasGrade ? (grade! / ex.maxScore) : 0;
                          return (
                            <div
                              key={ex.id}
                              className="sf-exercise-row"
                              onClick={() => history.push(`/exercise-correction/${ex.id}`)}
                            >
                              <IonIcon icon={documentTextOutline} className="sf-exercise-row__icon" />
                              <div className="sf-exercise-row__info">
                                <span className="sf-exercise-row__name">{ex.name || 'Ejercicio'}</span>
                                <span className="sf-exercise-row__meta">{formatDate(ex.assignedAt?.slice(0, 10) || '')}</span>
                              </div>
                              <div className="sf-exercise-row__actions">
                                {hasGrade ? (
                                  <span className={`sf-grade-pill ${pct >= 0.8 ? 'grade-pass' : pct >= 0.5 ? 'grade-borderline' : 'grade-fail'}`}>
                                    {grade}/{ex.maxScore}
                                  </span>
                                ) : (
                                  <IonBadge color={ex.correctionStatus === 'corrected' ? 'success' : ex.correctionStatus === 'in_progress' ? 'warning' : 'medium'} style={{ fontSize: 10 }}>
                                    {ex.correctionStatus === 'corrected' ? 'Corregido' : ex.correctionStatus === 'in_progress' ? 'Corrigiendo' : 'Pendiente'}
                                  </IonBadge>
                                )}
                                {ex.pdfExercisesUrl && (
                                  <button
                                    className="sf-exercise-row__pdf"
                                    onClick={(e) => { e.stopPropagation(); handleExerciseDownload(ex.id, 'exercises'); }}
                                    title="PDF ejercicios"
                                  >
                                    <IonIcon icon={documentTextOutline} />
                                  </button>
                                )}
                                {ex.pdfSolutionsUrl && (
                                  <button
                                    className="sf-exercise-row__pdf sf-exercise-row__pdf--sol"
                                    onClick={(e) => { e.stopPropagation(); handleExerciseDownload(ex.id, 'solutions'); }}
                                    title="PDF soluciones"
                                  >
                                    <IonIcon icon={downloadOutline} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Asistencia (collapsible) ─── */}
        {attendanceHistory.length > 0 && attendanceStats && (
          <div className="sf-section">
            <div className="sf-section__header sf-section__header--toggle" onClick={() => setAttendanceOpen(!attendanceOpen)}>
              <div className="sf-section__header-left">
                <IonIcon icon={attendanceOpen ? chevronDownOutline : chevronForwardOutline} className="sf-section__chevron" />
                <span className="sf-section__title">Asistencia</span>
              </div>
              <span className="sf-section__subtitle">{attendanceStats.rate}% · {attendanceStats.total} sesiones</span>
            </div>

            {/* Always show the bar */}
            <div className="sf-attendance-bar" style={{ margin: '0 0 var(--space-xs)' }}>
              {attendanceStats.present > 0 && <div className="sf-attendance-bar__segment sf-attendance-bar__segment--present" style={{ width: `${(attendanceStats.present / attendanceStats.total) * 100}%` }} />}
              {attendanceStats.late > 0 && <div className="sf-attendance-bar__segment sf-attendance-bar__segment--late" style={{ width: `${(attendanceStats.late / attendanceStats.total) * 100}%` }} />}
              {attendanceStats.justified > 0 && <div className="sf-attendance-bar__segment sf-attendance-bar__segment--justified" style={{ width: `${(attendanceStats.justified / attendanceStats.total) * 100}%` }} />}
              {attendanceStats.absent > 0 && <div className="sf-attendance-bar__segment sf-attendance-bar__segment--absent" style={{ width: `${(attendanceStats.absent / attendanceStats.total) * 100}%` }} />}
            </div>

            {attendanceOpen && (
              <>
                <div className="sf-attendance-legend">
                  <span className="sf-attendance-legend__item"><span className="sf-attendance-dot sf-attendance-dot--present" /> Presente {attendanceStats.present}</span>
                  <span className="sf-attendance-legend__item"><span className="sf-attendance-dot sf-attendance-dot--late" /> Retraso {attendanceStats.late}</span>
                  <span className="sf-attendance-legend__item"><span className="sf-attendance-dot sf-attendance-dot--justified" /> Justificada {attendanceStats.justified}</span>
                  <span className="sf-attendance-legend__item"><span className="sf-attendance-dot sf-attendance-dot--absent" /> Ausencia {attendanceStats.absent}</span>
                </div>
                <div className="sf-attendance-list">
                  {(showAllAttendance ? attendanceHistory : attendanceHistory.slice(0, 5)).map((r) => (
                    <div key={r.id} className="sf-attendance-row">
                      <span className="sf-attendance-row__date">
                        {formatDate(r.date)}
                        {r.subjectName && <span className="sf-attendance-row__subject">{r.subjectName}</span>}
                      </span>
                      <span className={`sf-attendance-status sf-attendance-status--${r.status}`}>
                        {r.status === 'present' ? 'Presente' : r.status === 'absent' ? 'Ausente' : r.status === 'late' ? 'Retraso' : 'Justificada'}
                      </span>
                      {r.note && <span className="sf-attendance-row__note">{r.note}</span>}
                      {(r.status === 'justified' || r.status === 'absent') && (
                        <button
                          className={`sf-justification-btn ${r.justificationUrl ? 'sf-justification-btn--has-doc' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.justificationUrl) {
                              setJustificationActionRecord(r);
                            } else {
                              setJustificationActionRecord(r);
                              justificationInputRef.current?.click();
                            }
                          }}
                        >
                          <IonIcon icon={r.justificationUrl ? documentTextOutline : cloudUploadOutline} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {attendanceHistory.length > 5 && (
                  <button className="sf-section__link sf-section__link--center" onClick={() => setShowAllAttendance(!showAllAttendance)}>
                    {showAllAttendance ? 'Ver menos' : `Ver todas (${attendanceHistory.length})`}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Comentarios (collapsible) ─── */}
        <div className="sf-section">
          <div className="sf-section__header sf-section__header--toggle" onClick={() => setCommentsOpen(!commentsOpen)}>
            <div className="sf-section__header-left">
              <IonIcon icon={commentsOpen ? chevronDownOutline : chevronForwardOutline} className="sf-section__chevron" />
              <span className="sf-section__title">
                Comentarios{student.comments.length > 0 ? ` (${student.comments.length})` : ''}
              </span>
            </div>
            <button className="sf-section__link" onClick={(e) => { e.stopPropagation(); setShowCommentInput(!showCommentInput); setCommentsOpen(true); }}>
              <IonIcon icon={addOutline} style={{ marginRight: 4, fontSize: 14 }} />
              Añadir
            </button>
          </div>

          {commentsOpen && (
            <>
              {showCommentInput && (
                <div className="sf-comment-input">
                  <MentionTextarea
                    value={commentText}
                    onChange={setCommentText}
                    mentionedStudents={commentMentions}
                    onMentionsChange={setCommentMentions}
                    placeholder="Escribe un comentario..."
                    rows={2}
                    helperText="Usa @ para mencionar otros alumnos"
                  />
                  <div className="sf-comment-input__actions">
                    <IonButton size="small" fill="outline" onClick={() => { setShowCommentInput(false); setCommentText(''); setCommentMentions([]); }}>
                      Cancelar
                    </IonButton>
                    <IonButton size="small" onClick={handleSaveComment} disabled={saving || !commentText.trim()}>
                      {saving ? <IonSpinner name="crescent" /> : 'Guardar'}
                    </IonButton>
                  </div>
                </div>
              )}

              {student.comments.length === 0 && !showCommentInput ? (
                <p className="sf-empty">Sin comentarios</p>
              ) : (
                <>
                  <div className="sf-comments-list">
                    {displayedComments.map((n) => (
                      <div key={n.id} className="sf-comment-item">
                        <span className="sf-comment-date">{n.createdAt?.slice(0, 10)}</span>
                        <p className="sf-comment-text">{n.text}</p>
                      </div>
                    ))}
                  </div>
                  {student.comments.length > 2 && (
                    <button className="sf-section__link sf-section__link--center" onClick={() => setShowAllComments(!showAllComments)}>
                      {showAllComments ? 'Ver menos' : `Ver todos (${student.comments.length})`}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
        {/* ─── Menciones (collapsible) ─── */}
        {studentMentions.length > 0 && (
          <div className="sf-section">
            <div className="sf-section__header sf-section__header--toggle" onClick={() => setMentionsOpen(!mentionsOpen)}>
              <div className="sf-section__header-left">
                <IonIcon icon={mentionsOpen ? chevronDownOutline : chevronForwardOutline} className="sf-section__chevron" />
                <span className="sf-section__title">
                  Menciones ({studentMentions.length})
                </span>
              </div>
            </div>

            {mentionsOpen && (
              <div className="sf-mentions-list">
                {studentMentions.map((m) => (
                  <div key={m.id} className="sf-mention-item">
                    <div className="sf-mention-item__header">
                      <span className="sf-mention-item__source">
                        {m.source_type === 'event' ? (
                          <>{m.event_title || 'Evento'}</>
                        ) : (
                          <>{m.comment_note_type === 'class_session' ? 'Comentario de clase' : m.comment_note_type === 'event_observation' ? 'Observación' : 'Comentario'}</>
                        )}
                      </span>
                      <span className="sf-mention-item__date">
                        {m.event_date || m.created_at?.slice(0, 10)}
                      </span>
                    </div>
                    <p className="sf-mention-item__text">{m.context_text}</p>
                    {m.class_name && (
                      <span className="sf-mention-item__class">{m.class_name}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </IonContent>

      {/* ─── Modals ─── */}
      <ExerciseGeneratorModal
        isOpen={showExerciseModal}
        onDismiss={() => setShowExerciseModal(false)}
        studentId={id}
        studentName={student.name}
        weakAreas={weakAreas}
        classId={classId}
        preselectedSubjectId={selectedSubject !== 'all' ? selectedSubject : undefined}
        subjectColor={selectedSubject !== 'all' ? subjects.find(s => s.subjectId === selectedSubject)?.subjectColor : undefined}
      />

      <IonModal
        isOpen={showEventModal}
        onDidDismiss={() => setShowEventModal(false)}
        initialBreakpoint={isDesktop ? 1 : 0.5}
        breakpoints={isDesktop ? [0, 1] : [0, 0.5, 0.75]}
        className="sf-event-modal"
      >
        <div className="modal-sheet">
          <h3 className="modal-sheet__title">Asignar evento</h3>
          <p className="modal-sheet__subtitle">Crear evento para {student.name}</p>
          <div className="sf-event-form">
            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Tipo</label>
              <IonSelect value={eventForm.type} onIonChange={(e) => setEventForm((f) => ({ ...f, type: e.detail.value }))} interface="popover" className="sf-event-form__select">
                <IonSelectOption value="tutoring">Tutoría</IonSelectOption>
                <IonSelectOption value="exam">Examen</IonSelectOption>
                <IonSelectOption value="custom">Otro</IonSelectOption>
              </IonSelect>
            </div>
            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Título</label>
              <IonInput value={eventForm.title} onIonInput={(e) => setEventForm((f) => ({ ...f, title: e.detail.value ?? '' }))} placeholder={eventForm.type === 'tutoring' ? `Tutoría con ${student.name}` : 'Nombre del evento'} className="sf-event-form__input" />
            </div>
            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Fecha</label>
              <IonInput type="date" value={eventForm.date} onIonInput={(e) => setEventForm((f) => ({ ...f, date: e.detail.value ?? '' }))} className="sf-event-form__input" />
            </div>
            <div className="sf-event-form__row">
              <div className="sf-event-form__field sf-event-form__field--half">
                <label className="sf-event-form__label">Hora inicio</label>
                <IonInput type="time" value={eventForm.startTime} onIonInput={(e) => setEventForm((f) => ({ ...f, startTime: e.detail.value ?? '' }))} className="sf-event-form__input" />
              </div>
              <div className="sf-event-form__field sf-event-form__field--half">
                <label className="sf-event-form__label">Hora fin</label>
                <IonInput type="time" value={eventForm.endTime} onIonInput={(e) => setEventForm((f) => ({ ...f, endTime: e.detail.value ?? '' }))} className="sf-event-form__input" />
              </div>
            </div>
            <IonButton expand="block" onClick={handleCreateEvent} disabled={creatingEvent || !eventForm.title.trim() || !eventForm.date} className="sf-event-form__submit">
              {creatingEvent ? <IonSpinner name="crescent" /> : 'Crear evento'}
            </IonButton>
          </div>
        </div>
      </IonModal>

      <input type="file" ref={justificationInputRef} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleJustificationUpload} />

      <IonActionSheet
        isOpen={!!justificationActionRecord?.justificationUrl}
        onDidDismiss={() => setJustificationActionRecord(null)}
        header="Justificante"
        buttons={[
          { text: 'Ver justificante', icon: eyeOutline, handler: () => { if (justificationActionRecord) handleViewJustification(justificationActionRecord); } },
          { text: 'Reemplazar documento', icon: cloudUploadOutline, handler: () => { justificationInputRef.current?.click(); } },
          { text: 'Eliminar justificante', icon: trashOutline, role: 'destructive', handler: () => { if (justificationActionRecord) handleDeleteJustification(justificationActionRecord); } },
          { text: 'Cancelar', role: 'cancel' },
        ]}
      />

      {uploadingJustification && (
        <div className="sf-justification-overlay">
          <IonSpinner color="primary" />
          <span>Subiendo justificante...</span>
        </div>
      )}
    </IonPage>
  );
};

export default StudentFile;
