import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Sparkles, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Minus,
  Calendar, FileText, CloudUpload,
  Trash2, Eye,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useClassesStore } from '../../store/classesStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { ClassSubjectSummary, AttendanceRecord, MentionedStudent, StudentMentionEntry } from '../../types';
import MentionTextarea from '../../components/MentionTextarea';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import { avatarColor } from '../../utils/avatarColors';
import { students as studentsApi, authenticatedFetch } from '../../services/api';

import PageShell from '@/components/shared/PageShell';
import Modal from '@/components/shared/Modal';
import Spinner from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

/* Tiny inline SVG sparkline. Renders a single polyline + a dot at the
   last data point. Designed to be readable at ~80×24 px with as few as
   2 data points. Color reflects the latest value's bucket. */
const Sparkline: React.FC<{
  data: number[]; // values, oldest → newest, normalised 0..1
  width?: number;
  height?: number;
  stroke?: string;
}> = ({ data, width = 88, height = 28, stroke = '#15665E' }) => {
  if (!data.length) return null;
  if (data.length === 1) {
    const cy = height / 2;
    return (
      <svg width={width} height={height} className="sf-spark">
        <line x1={2} y1={cy} x2={width - 2} y2={cy} stroke={stroke} strokeOpacity={0.18} strokeWidth={1.5} />
        <circle cx={width - 4} cy={cy} r={3} fill={stroke} />
      </svg>
    );
  }
  const pad = 3;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * usableW;
    const y = pad + (1 - Math.max(0, Math.min(1, v))) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastX = pad + usableW;
  const lastY = pad + (1 - Math.max(0, Math.min(1, data[data.length - 1]))) * usableH;
  const areaPath = `M ${points[0]} L ${points.join(' ')} L ${lastX.toFixed(1)},${(height - pad).toFixed(1)} L ${pad},${(height - pad).toFixed(1)} Z`;
  return (
    <svg width={width} height={height} className="sf-spark">
      <path d={areaPath} fill={stroke} fillOpacity={0.1} />
      <polyline points={points.join(' ')} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill={stroke} />
    </svg>
  );
};

const StudentFile: React.FC = () => {
  const { classId, id } = useParams() as { classId: string; id: string };
  const navigate = useNavigate();
  const location = useLocation();
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
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showAllAttendance, setShowAllAttendance] = useState(false);
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

  const TrendIcon = performanceTrend === 'improving' ? TrendingUp :
    performanceTrend === 'declining' ? TrendingDown : Minus;
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

  // ── Sparkline data: chronological grade history (last 10) ───────────
  // Normalised to 0..1 against each exam's max so a 7/10 and an 8/10 sit
  // on the same scale even with different max scores.
  const gradeHistory = useMemo(() => {
    const sorted = [...filteredCorrections]
      .filter((c) => c.grade !== null && c.grade !== undefined)
      .sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));
    const last = sorted.slice(-10);
    return last.map((c) => {
      const exam = exams.find((e) => e.id === c.examId);
      const max = exam?.maxScore || 10;
      return Math.max(0, Math.min(1, (c.grade ?? 0) / max));
    });
  }, [filteredCorrections, exams]);

  // ── Hero card grade label ────────────────────────────────────────────
  // Single source of truth for the verbal bracket shown in the hero card.
  const gradeBucket = useMemo(() => {
    if (avgGrade === null) return null;
    const pct = avgGrade / 10;
    if (pct >= 0.8) return { label: 'Excelente', cls: 'excellent' as const };
    if (pct >= 0.6) return { label: 'Bien', cls: 'good' as const };
    if (pct >= 0.5) return { label: 'Suficiente', cls: 'borderline' as const };
    return { label: 'Suspenso', cls: 'fail' as const };
  }, [avgGrade]);

  // ── Flat lists for the new exam/exercise sections ───────────────────
  // We sort by date descending so the teacher sees the most recent first.
  const flatExams = useMemo(() => {
    const items = academicBySubject.flatMap((g) =>
      g.exams.map(({ exam, correction }) => ({
        exam,
        correction,
        subjectName: g.subjectName,
        subjectId: g.subjectId,
      }))
    );
    return items.sort((a, b) => {
      const da = a.exam.date || a.correction?.savedAt || '';
      const db = b.exam.date || b.correction?.savedAt || '';
      return db.localeCompare(da);
    });
  }, [academicBySubject]);

  const flatExercises = useMemo(() => {
    const items = academicBySubject.flatMap((g) =>
      g.exercises.map((ex) => ({
        exercise: ex,
        subjectName: g.subjectName,
        subjectId: g.subjectId,
      }))
    );
    return items.sort((a, b) =>
      (b.exercise.assignedAt || '').localeCompare(a.exercise.assignedAt || '')
    );
  }, [academicBySubject]);

  // ── Behavioral / situational alerts ───────────────────────────────────
  // The teacher opens the file because something prompted them to. This
  // section surfaces "what should you actually know about this student".
  // Empty array → the entire band hides.
  const behavioralAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      severity: 'danger' | 'warn' | 'info';
      text: string;
    }> = [];

    // Asistencia baja (necesita al menos 3 sesiones registradas para no
    // dar falsos positivos con muestras minúsculas).
    if (attendanceStats && attendanceStats.total >= 3 && attendanceStats.rate < 75) {
      alerts.push({
        id: 'low-attendance',
        severity: attendanceStats.rate < 50 ? 'danger' : 'warn',
        text: `Asistencia ${attendanceStats.rate}% — ${attendanceStats.absent} ausencia${attendanceStats.absent === 1 ? '' : 's'}, ${attendanceStats.late} retraso${attendanceStats.late === 1 ? '' : 's'}`,
      });
    }

    // 3+ retrasos en los últimos 7 días.
    const now = Date.now();
    const recentLates = attendanceHistory.filter(
      (r) => r.status === 'late' && r.date && (now - new Date(r.date).getTime()) < 7 * 86400000
    );
    if (recentLates.length >= 3) {
      alerts.push({
        id: 'many-recent-lates',
        severity: 'warn',
        text: `${recentLates.length} retrasos en la última semana`,
      });
    }

    // 2 suspensos consecutivos en los últimos exámenes calificados.
    const sortedByDate = [...filteredCorrections]
      .filter((c) => c.grade !== null)
      .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
    if (sortedByDate.length >= 2) {
      const lastTwo = sortedByDate.slice(0, 2);
      const passingFor = (c: typeof sortedByDate[number]) => {
        const exam = exams.find((e) => e.id === c.examId);
        const max = exam?.maxScore || 10;
        return (c.grade ?? 0) >= max * 0.5;
      };
      if (lastTwo.every((c) => !passingFor(c))) {
        alerts.push({
          id: 'two-fails',
          severity: 'danger',
          text: 'Suspenso en los 2 últimos exámenes',
        });
      }
    }

    // Exámenes asignados sin entregar (paper missing for an active exam).
    const missingDeliveries = flatExams.filter(
      ({ exam, correction }) =>
        !correction?.paperUrl &&
        !correction?.notTaken &&
        ['scheduled', 'pending_correction', 'corrected'].includes(exam.status)
    );
    if (missingDeliveries.length > 0) {
      alerts.push({
        id: 'missing-deliveries',
        severity: 'warn',
        text: missingDeliveries.length === 1
          ? `Sin entrega en "${missingDeliveries[0].exam.name}"`
          : `${missingDeliveries.length} exámenes sin entregar`,
      });
    }

    // Entregados pero sin nota (esperando corrección).
    const pendingCorrection = flatExams.filter(
      ({ correction }) => correction?.paperUrl && correction.grade == null && !correction.notTaken
    );
    if (pendingCorrection.length > 0) {
      alerts.push({
        id: 'pending-correction',
        severity: 'info',
        text: pendingCorrection.length === 1
          ? '1 examen pendiente de corregir'
          : `${pendingCorrection.length} exámenes pendientes de corregir`,
      });
    }

    return alerts;
  }, [attendanceStats, attendanceHistory, filteredCorrections, exams, flatExams]);

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
      <PageShell title="">
        <div className="flex justify-center p-16">
          <Spinner />
        </div>
      </PageShell>
    );
  }

  const displayedComments = showAllComments ? student.comments : student.comments.slice(0, 2);

  return (
    <PageShell
      title={student.name}
      backHref={querySubjectId ? `/tabs/classes/${classId}/subjects/${querySubjectId}` : `/tabs/classes/${classId}`}
      noPadding
    >
      {/* ─── Identidad: avatar + nombre + filtro asignatura ─── */}
      <div className="sf-id">
        <div className="sf-id__avatar" style={{ background: avatarColor(student.name) }}>
          {student.name.charAt(0).toUpperCase()}
        </div>
        <div className="sf-id__info">
          <h2 className="sf-id__name">{student.name}</h2>
          {student.studentId && <p className="sf-id__code">{student.studentId}</p>}
        </div>
        {subjects.length > 1 && (
          <Select value={selectedSubject} onValueChange={(v) => setSelectedSubject(v)}>
            <SelectTrigger className="sf-id__subject">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">Todas las asignaturas</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ─── Hero: dense single row with sparkline + grade + counts ─── */}
      <div className={`sf-hero${gradeBucket ? ` sf-hero--${gradeBucket.cls}` : ''}`}>
        <div className="sf-hero__avg-block">
          <div className="sf-hero__avg-line">
            <span className="sf-hero__avg-value">
              {avgGrade !== null ? avgGrade.toFixed(1) : '—'}
            </span>
            <span className="sf-hero__avg-max">/10</span>
            {filteredCorrections.length >= 2 && (
              <TrendIcon
                size={14}
                className={`sf-hero__trend-icon sf-hero__trend-icon--${performanceTrend}`}
              />
            )}
          </div>
          <div className="sf-hero__avg-meta">
            {gradeBucket ? (
              <span className={`sf-hero__bucket sf-hero__bucket--${gradeBucket.cls}`}>
                {gradeBucket.label}
              </span>
            ) : (
              <span className="sf-hero__bucket sf-hero__bucket--empty">Sin datos</span>
            )}
          </div>
        </div>

        {gradeHistory.length >= 1 && (
          <div className="sf-hero__spark-wrap">
            <Sparkline
              data={gradeHistory}
              width={96}
              height={36}
              stroke={
                gradeBucket?.cls === 'excellent' ? '#10B981'
                  : gradeBucket?.cls === 'good' ? '#3B82F6'
                  : gradeBucket?.cls === 'borderline' ? '#F59E0B'
                  : gradeBucket?.cls === 'fail' ? '#EF4444'
                  : '#94A3B8'
              }
            />
            <span className="sf-hero__spark-label">últimas {gradeHistory.length}</span>
          </div>
        )}

        <div className="sf-hero__metrics">
          <div className="sf-hero__metric">
            <span className="sf-hero__metric-value">{filteredCorrections.length}</span>
            <span className="sf-hero__metric-label">
              {filteredCorrections.length === 1 ? 'examen' : 'exámenes'}
            </span>
          </div>
          {attendanceStats && (
            <div className="sf-hero__metric">
              <span className={`sf-hero__metric-value ${attendanceStats.rate < 75 ? 'sf-hero__metric-value--alert' : ''}`}>
                {attendanceStats.rate}%
              </span>
              <span className="sf-hero__metric-label">asistencia</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Alerts as dense inline lines ─── */}
      {behavioralAlerts.length > 0 && (
        <ul className="sf-alerts">
          {behavioralAlerts.map((a) => (
            <li key={a.id} className={`sf-alert sf-alert--${a.severity}`}>
              <span className="sf-alert__dot" />
              <span className="sf-alert__text">{a.text}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ─── Áreas a reforzar (compact pills) ─── */}
      {aggregatedWeakAreas.length > 0 && (
        <div className="sf-weak">
          {aggregatedWeakAreas.slice(0, 6).map((a) => (
            <span key={a.topic} className="sf-weak__tag">
              {a.topic}
              <span className="sf-weak__count">{a.count}</span>
            </span>
          ))}
        </div>
      )}

      {/* ─── Actions: 3 buttons in a single tight row ─── */}
      <div className="sf-actions">
        <button
          className="sf-action sf-action--primary"
          onClick={handleGenerateSummary}
          disabled={loadingSummary}
        >
          {loadingSummary ? <Spinner size={14} /> : <Sparkles size={14} />}
          Resumen IA
        </button>
        <button className="sf-action" onClick={() => setShowExerciseModal(true)}>
          <FileText size={14} />
          Ejercicios
        </button>
        <button className="sf-action" onClick={() => setShowEventModal(true)}>
          <Calendar size={14} />
          Evento
        </button>
      </div>

      {/* AI summary inline */}
      {(aiSummary || loadingSummary) && (
        <div className="sf-ai-summary">
          {loadingSummary ? (
            <div className="sf-ai-summary__loading">
              <Spinner size={20} />
              <span>Analizando datos del alumno...</span>
            </div>
          ) : (
            <div className="sf-ai-summary__content">
              <ReactMarkdown>{aiSummary!}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* ─── Exámenes ─── */}
      <div className="sf-list">
        <div className="sf-list__header">
          <span className="sf-list__title">Exámenes</span>
          <span className="sf-list__count">{flatExams.length}</span>
        </div>
        {flatExams.length === 0 ? (
          <p className="sf-list__empty">
            Sin exámenes en {selectedSubject === 'all' ? 'esta clase' : 'esta asignatura'}
          </p>
        ) : (
          <div className="sf-list__items">
            {flatExams.map(({ exam, correction, subjectName }) => {
              const hasGrade = correction?.grade != null;
              const pct = hasGrade ? correction!.grade! / exam.maxScore : 0;
              const cls = !hasGrade
                ? ''
                : pct >= 0.8 ? 'excellent'
                : pct >= 0.6 ? 'good'
                : pct >= 0.5 ? 'borderline'
                : 'fail';
              const goToExam = () => {
                const params = new URLSearchParams({ studentId: id! });
                const base = exam.classId && exam.subjectId
                  ? `/tabs/classes/${exam.classId}/subjects/${exam.subjectId}/exams/${exam.id}`
                  : exam.classId
                  ? `/tabs/classes/${exam.classId}/exams/${exam.id}`
                  : `/tabs/exams/${exam.id}`;
                navigate(`${base}?${params.toString()}`);
              };
              return (
                <button
                  key={exam.id + (correction?.id || '')}
                  type="button"
                  className={`sf-row${cls ? ` sf-row--${cls}` : ''}`}
                  onClick={goToExam}
                >
                  <div className="sf-row__main">
                    <span className="sf-row__name">{exam.name}</span>
                    <div className="sf-row__meta">
                      {selectedSubject === 'all' && (
                        <span className="sf-row__subject">{subjectName}</span>
                      )}
                      {exam.date && (
                        <span className="sf-row__date">{formatDate(exam.date)}</span>
                      )}
                    </div>
                  </div>
                  <div className="sf-row__right">
                    {hasGrade ? (
                      <span className={`sf-grade sf-grade--${cls}`}>
                        {correction!.grade}/{exam.maxScore}
                      </span>
                    ) : correction?.notTaken ? (
                      <span className="sf-tag sf-tag--muted">No present.</span>
                    ) : correction?.paperUrl ? (
                      <span className="sf-tag sf-tag--info">Por corregir</span>
                    ) : exam.status === 'corrected' ? (
                      <span className="sf-tag sf-tag--warn">Sin entrega</span>
                    ) : (
                      <span className="sf-tag sf-tag--muted">Programado</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Ejercicios ─── */}
      <div className="sf-list">
        <div className="sf-list__header">
          <span className="sf-list__title">Ejercicios</span>
          <span className="sf-list__count">{flatExercises.length}</span>
        </div>
        {flatExercises.length === 0 ? (
          <div className="sf-list__empty-with-action">
            <p className="sf-list__empty">Sin ejercicios asignados</p>
            <button
              type="button"
              className="sf-action sf-action--small"
              onClick={() => setShowExerciseModal(true)}
            >
              <Plus size={14} /> Generar
            </button>
          </div>
        ) : (
          <div className="sf-list__items">
            {flatExercises.map(({ exercise: ex, subjectName }) => {
              const grade = exerciseGrades.get(ex.id);
              const hasGrade = grade != null;
              const pct = hasGrade ? grade! / ex.maxScore : 0;
              const cls = !hasGrade
                ? ''
                : pct >= 0.8 ? 'excellent'
                : pct >= 0.6 ? 'good'
                : pct >= 0.5 ? 'borderline'
                : 'fail';
              return (
                <button
                  key={ex.id}
                  type="button"
                  className={`sf-row${cls ? ` sf-row--${cls}` : ''}`}
                  onClick={() => navigate(`/exercise-correction/${ex.id}`)}
                >
                  <div className="sf-row__main">
                    <span className="sf-row__name">{ex.name || 'Ejercicio'}</span>
                    <div className="sf-row__meta">
                      {selectedSubject === 'all' && (
                        <span className="sf-row__subject">{subjectName}</span>
                      )}
                      {ex.assignedAt && (
                        <span className="sf-row__date">
                          {formatDate(ex.assignedAt.slice(0, 10))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="sf-row__right">
                    {hasGrade ? (
                      <span className={`sf-grade sf-grade--${cls}`}>
                        {grade}/{ex.maxScore}
                      </span>
                    ) : ex.correctionStatus === 'corrected' ? (
                      <span className="sf-tag sf-tag--info">Corregido</span>
                    ) : ex.correctionStatus === 'in_progress' ? (
                      <span className="sf-tag sf-tag--info">Corrigiendo</span>
                    ) : (
                      <span className="sf-tag sf-tag--muted">Pendiente</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Asistencia: split bar inline + history ─── */}
      {attendanceHistory.length > 0 && attendanceStats && (
        <div className="sf-list">
          <div className="sf-list__header">
            <span className="sf-list__title">Asistencia</span>
            <span className={`sf-list__count ${attendanceStats.rate < 75 ? 'sf-list__count--alert' : ''}`}>
              {attendanceStats.rate}% · {attendanceStats.total} ses.
            </span>
          </div>

          {/* Compact split bar — present / late / justified / absent.
              No labels: legend below as inline dot+number rows. */}
          <div className="sf-att-bar" aria-hidden="true">
            {attendanceStats.present > 0 && (
              <div
                className="sf-att-bar__seg sf-att-bar__seg--present"
                style={{ width: `${(attendanceStats.present / attendanceStats.total) * 100}%` }}
              />
            )}
            {attendanceStats.late > 0 && (
              <div
                className="sf-att-bar__seg sf-att-bar__seg--late"
                style={{ width: `${(attendanceStats.late / attendanceStats.total) * 100}%` }}
              />
            )}
            {attendanceStats.justified > 0 && (
              <div
                className="sf-att-bar__seg sf-att-bar__seg--justified"
                style={{ width: `${(attendanceStats.justified / attendanceStats.total) * 100}%` }}
              />
            )}
            {attendanceStats.absent > 0 && (
              <div
                className="sf-att-bar__seg sf-att-bar__seg--absent"
                style={{ width: `${(attendanceStats.absent / attendanceStats.total) * 100}%` }}
              />
            )}
          </div>
          <div className="sf-att-legend">
            {attendanceStats.present > 0 && (
              <span className="sf-att-leg sf-att-leg--present">
                <span className="sf-att-leg__dot" />Presente {attendanceStats.present}
              </span>
            )}
            {attendanceStats.late > 0 && (
              <span className="sf-att-leg sf-att-leg--late">
                <span className="sf-att-leg__dot" />Retraso {attendanceStats.late}
              </span>
            )}
            {attendanceStats.justified > 0 && (
              <span className="sf-att-leg sf-att-leg--justified">
                <span className="sf-att-leg__dot" />Justif. {attendanceStats.justified}
              </span>
            )}
            {attendanceStats.absent > 0 && (
              <span className="sf-att-leg sf-att-leg--absent">
                <span className="sf-att-leg__dot" />Ausencia {attendanceStats.absent}
              </span>
            )}
          </div>
          <div className="sf-list__items">
            {(showAllAttendance ? attendanceHistory : attendanceHistory.slice(0, 3)).map((r) => (
              <div key={r.id} className="sf-att-row">
                <span className="sf-att-row__date">
                  {formatDate(r.date)}
                  {r.subjectName && (
                    <span className="sf-att-row__subject">{r.subjectName}</span>
                  )}
                </span>
                <span className={`sf-att-tag sf-att-tag--${r.status}`}>
                  {r.status === 'present' ? 'Presente'
                    : r.status === 'absent' ? 'Ausente'
                    : r.status === 'late' ? 'Retraso'
                    : 'Justificada'}
                </span>
                {(r.status === 'justified' || r.status === 'absent') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`sf-justify-btn ${r.justificationUrl ? 'sf-justify-btn--has-doc' : ''}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.justificationUrl ? <FileText size={14} /> : <CloudUpload size={14} />}
                      </button>
                    </DropdownMenuTrigger>
                    {r.justificationUrl ? (
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewJustification(r)}>
                          <Eye size={14} className="mr-2" /> Ver justificante
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setJustificationActionRecord(r);
                          justificationInputRef.current?.click();
                        }}>
                          <CloudUpload size={14} className="mr-2" /> Reemplazar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteJustification(r)}>
                          <Trash2 size={14} className="mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    ) : (
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setJustificationActionRecord(r);
                          justificationInputRef.current?.click();
                        }}>
                          <CloudUpload size={14} className="mr-2" /> Subir justificante
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
          {attendanceHistory.length > 3 && (
            <button
              type="button"
              className="sf-list__link"
              onClick={() => setShowAllAttendance(!showAllAttendance)}
            >
              {showAllAttendance ? 'Ver menos' : `Ver todas (${attendanceHistory.length})`}
            </button>
          )}
        </div>
      )}

      {/* ─── Comentarios — input siempre visible ─── */}
      <div className="sf-list">
        <div className="sf-list__header">
          <span className="sf-list__title">Comentarios</span>
          <span className="sf-list__count">{student.comments.length}</span>
        </div>
        <div className="sf-comment-input-inline">
          <MentionTextarea
            value={commentText}
            onChange={setCommentText}
            mentionedStudents={commentMentions}
            onMentionsChange={setCommentMentions}
            placeholder="Añade un comentario rápido sobre este alumno..."
            rows={2}
            helperText="Usa @ para mencionar otros alumnos"
          />
          <div className="sf-comment-input-inline__actions">
            <Button
              size="sm"
              onClick={handleSaveComment}
              disabled={saving || !commentText.trim()}
            >
              {saving ? <Spinner size={14} /> : 'Guardar'}
            </Button>
          </div>
        </div>
        {student.comments.length > 0 && (
          <div className="sf-list__items">
            {displayedComments.map((n) => (
              <div key={n.id} className="sf-comment">
                <span className="sf-comment__date">{n.createdAt?.slice(0, 10)}</span>
                <p className="sf-comment__text">{n.text}</p>
              </div>
            ))}
          </div>
        )}
        {student.comments.length > 2 && (
          <button
            type="button"
            className="sf-list__link"
            onClick={() => setShowAllComments(!showAllComments)}
          >
            {showAllComments ? 'Ver menos' : `Ver todos (${student.comments.length})`}
          </button>
        )}
      </div>
      {/* ─── Menciones ─── */}
      {studentMentions.length > 0 && (
        <div className="sf-list">
          <button
            type="button"
            className="sf-list__header sf-list__header--clickable"
            onClick={() => setMentionsOpen(!mentionsOpen)}
          >
            <span className="sf-list__title">
              Menciones
              {mentionsOpen
                ? <ChevronDown size={14} className="ml-1 inline" />
                : <ChevronRight size={14} className="ml-1 inline" />}
            </span>
            <span className="sf-list__count">{studentMentions.length}</span>
          </button>

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

      <Modal
        open={showEventModal}
        onClose={() => setShowEventModal(false)}
        title="Asignar evento"
        sheetHeight="md"
      >
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground mb-3">Crear evento para {student.name}</p>
          <div className="sf-event-form">
            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Tipo</label>
              <Select value={eventForm.type} onValueChange={(v) => setEventForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutoring">Tutoría</SelectItem>
                  <SelectItem value="exam">Examen</SelectItem>
                  <SelectItem value="custom">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Título</label>
              <Input value={eventForm.title} onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))} placeholder={eventForm.type === 'tutoring' ? `Tutoría con ${student.name}` : 'Nombre del evento'} className="text-sm" />
            </div>
            <div className="sf-event-form__field">
              <label className="sf-event-form__label">Fecha</label>
              <Input type="date" value={eventForm.date} onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))} className="text-sm" />
            </div>
            <div className="sf-event-form__row">
              <div className="sf-event-form__field sf-event-form__field--half">
                <label className="sf-event-form__label">Hora inicio</label>
                <Input type="time" value={eventForm.startTime} onChange={(e) => setEventForm((f) => ({ ...f, startTime: e.target.value }))} className="text-sm" />
              </div>
              <div className="sf-event-form__field sf-event-form__field--half">
                <label className="sf-event-form__label">Hora fin</label>
                <Input type="time" value={eventForm.endTime} onChange={(e) => setEventForm((f) => ({ ...f, endTime: e.target.value }))} className="text-sm" />
              </div>
            </div>
            <Button className="w-full" onClick={handleCreateEvent} disabled={creatingEvent || !eventForm.title.trim() || !eventForm.date}>
              {creatingEvent ? <Spinner size={16} /> : 'Crear evento'}
            </Button>
          </div>
        </div>
      </Modal>

      <input type="file" ref={justificationInputRef} style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={handleJustificationUpload} />

      {uploadingJustification && (
        <div className="sf-justification-overlay">
          <Spinner size={24} className="text-white" />
          <span>Subiendo justificante...</span>
        </div>
      )}
    </PageShell>
  );
};

export default StudentFile;
