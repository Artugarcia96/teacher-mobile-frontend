import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { avatarColor } from '../../utils/avatarColors';
import {
  IonPage, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem,
  IonSearchbar, IonItemSliding, IonItemOptions, IonItemOption,
  IonSpinner, IonAlert, IonPopover, useIonViewWillEnter,
} from '@ionic/react';
import {
  addOutline, downloadOutline, cloudUploadOutline, bookOutline, peopleOutline,
  sparkles, settingsOutline, documentTextOutline, chevronForwardOutline, createOutline,
  locationOutline, timeOutline, calendarOutline, chevronBackOutline,
  chatbubbleOutline, sendOutline, chevronDownOutline, trashOutline,
} from 'ionicons/icons';
import { parseEventNotes } from '../../utils/parseEventNotes';
import { useParams, useHistory } from 'react-router-dom';
import { useClassesStore } from '../../store/classesStore';
import { fetchRegistry } from '../../store/fetchRegistry';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { useCommentsStore } from '../../store/commentsStore';
import { useCalendarStore, ClassBreakdown } from '../../store/calendarStore';
import { useCoursePlanStore } from '../../store/coursePlanStore';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { getPeriodLabel, PERIOD_COLORS } from '../../utils/periodConfig';
import { calendar as calendarApi, preparation as prepApi } from '../../services/api';
import { classes as classesApi, exams as examsApi, exercises as exercisesApi, subjects as subjectsApi } from '../../services/api';
import { CalendarEvent, ClassGroup, ScheduleSlot, MentionedStudent } from '../../types';
import MentionTextarea from '../../components/MentionTextarea';

const DAY_ABBR: Record<string, string> = {
  lunes: 'L', martes: 'M', miércoles: 'X', miercoles: 'X',
  jueves: 'J', viernes: 'V', sábado: 'S', sabado: 'S', domingo: 'D',
  monday: 'L', tuesday: 'M', wednesday: 'X', thursday: 'J',
  friday: 'V', saturday: 'S', sunday: 'D',
};

const DAY_ORDER: Record<string, number> = {
  lunes: 0, martes: 1, miércoles: 2, miercoles: 2,
  jueves: 3, viernes: 4, sábado: 5, sabado: 5, domingo: 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};

function sortSlotsByWeekday(slots: ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => (DAY_ORDER[a.day.toLowerCase()] ?? 7) - (DAY_ORDER[b.day.toLowerCase()] ?? 7));
}

function formatScheduleDays(slots: ScheduleSlot[]): string {
  if (!slots || slots.length === 0) return '';
  return sortSlotsByWeekday(slots).map(s => DAY_ABBR[s.day.toLowerCase()] || s.day.slice(0, 3)).join(', ');
}

function formatScheduleDetail(slots: ScheduleSlot[]): { day: string; time: string }[] {
  if (!slots || slots.length === 0) return [];
  return sortSlotsByWeekday(slots).map(s => {
    const day = DAY_ABBR[s.day.toLowerCase()] || s.day.slice(0, 3);
    const start = s.start_time?.slice(0, 5) || '';
    const end = s.end_time?.slice(0, 5) || '';
    const time = start && end ? `${start} – ${end}` : start || '';
    return { day, time };
  });
}
import GradeTable from '../../components/GradeTable';
import EmptyState from '../../components/EmptyState';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import AddStudentsModal from '../../components/AddStudentsModal';
import SubjectDayInsight from '../../components/SubjectDayInsight';
import ClassInsightsPanel from '../../components/ClassInsightsPanel';
import EventEditorSheet from '../../components/EventEditorSheet';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import './GradeBook.css';

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'X', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function getSunday(monday: Date): Date {
  const s = new Date(monday);
  s.setDate(s.getDate() + 6);
  return s;
}

function mapCalEvent(e: any): CalendarEvent {
  return {
    id: e.id, classId: e.class_id, studentId: e.student_id, examId: e.exam_id,
    title: e.title, date: e.event_date, startTime: e.start_time, endTime: e.end_time,
    eventType: e.event_type, notes: e.notes, isCancelled: e.is_cancelled,
    className: e.class_name, classSubject: e.class_subject, subjectId: e.subject_id,
    studentName: e.student_name, examName: e.exam_name, examStatus: e.exam_status,
  };
}

const SubjectGradeBook: React.FC = () => {
  const { classId, subjectId } = useParams<{ classId: string; subjectId: string }>();
  const history = useHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const importStudentsToClass = useClassesStore((s) => s.importStudents);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const classSubjectsLoaded = useClassesStore((s) => s.classSubjectsLoaded);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const allStudents = useStudentsStore((s) => s.students);
  const removeFromClass = useStudentsStore((s) => s.removeFromClass);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const studentsLoading = useStudentsStore((s) => s.loading);

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const allCorrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);

  const exerciseCorrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchAllExerciseCorrections = useExerciseCorrectionStore((s) => s.fetchAllCorrections);

  const subjectComments = useCommentsStore((s) => s.comments);
  const commentsLoading = useCommentsStore((s) => s.loading);
  const fetchComments = useCommentsStore((s) => s.fetchComments);
  const createClassComment = useCommentsStore((s) => s.createClassComment);

  const coursePlansData = useCoursePlanStore((s) => s.plans);
  const fetchCoursePlans = useCoursePlanStore((s) => s.fetchPlans);
  const planProgress = useCoursePlanStore((s) => s.progress);
  const fetchPlanProgress = useCoursePlanStore((s) => s.fetchProgress);
  const deletePlan = useCoursePlanStore((s) => s.deletePlan);
  const periodMode = useAcademicConfigStore((s) => s.configs[classId])?.periodMode;
  const [deletePlanTarget, setDeletePlanTarget] = useState<{ id: string; name: string } | null>(null);

  const basicClassGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const exams = useMemo(() => allExams.filter((e) => e.classId === classId && e.subjectId === subjectId), [allExams, classId, subjectId]);
  const exercises = useMemo(() => allExercises.filter((e) => studentIds.has(e.studentId) && e.subjectId === subjectId), [allExercises, studentIds, subjectId]);
  const uniqueExerciseCount = useMemo(() => new Set(exercises.map(e => e.name || e.id)).size, [exercises]);

  const subjectsReady = !!classSubjectsLoaded[classId];
  const subjectSummary = classSubjects[classId]?.find(s => s.subjectId === subjectId);
  const subjectName = subjectSummary?.subjectName || '';
  const subjectColor = subjectsReady ? (subjectSummary?.subjectColor || '#15665E') : '#15665E';

  // Today's preparation insight for this subject — fetched via dedicated lightweight endpoint
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [subjectBreakdown, setSubjectBreakdown] = useState<ClassBreakdown | null>(null);

  const fetchSubjectPrep = useCallback(async () => {
    try {
      const res = await prepApi.getForSubject(todayStr, classId, subjectId);
      if (res.status === 204 || !res.data?.breakdown) {
        setSubjectBreakdown(null);
        return;
      }
      const bd = res.data.breakdown as ClassBreakdown;
      if (res.data.grade_alerts && res.data.grade_alerts.length > 0) {
        bd.grade_alerts = res.data.grade_alerts;
      }
      setSubjectBreakdown(bd);
    } catch {
      setSubjectBreakdown(null);
    }
  }, [todayStr, classId, subjectId]);

  const [tab, setTab] = useState<'overview' | 'grades' | 'roster'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [importAlert, setImportAlert] = useState<{ header: string; message: string } | null>(null);
  const [showBulkExerciseModal, setShowBulkExerciseModal] = useState(false);
  const [preselectedWeakAreas, setPreselectedWeakAreas] = useState<string[]>([]);
  const [detailedClassData, setDetailedClassData] = useState<ClassGroup | null>(null);

  // ── Subject Weekly Calendar ──
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [subjectEvents, setSubjectEvents] = useState<CalendarEvent[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [showEventEditor, setShowEventEditor] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const [commentMentions, setCommentMentions] = useState<MentionedStudent[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [savingComment, setSavingComment] = useState(false);

  const currentWeekMonday = useMemo(() => {
    const d = new Date();
    const monday = getMonday(d);
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const currentWeekSunday = useMemo(() => getSunday(currentWeekMonday), [currentWeekMonday]);

  const loadSubjectWeek = useCallback(async () => {
    setCalLoading(true);
    try {
      const res = await calendarApi.list(
        toDateStr(currentWeekMonday),
        toDateStr(currentWeekSunday),
        classId,
      );
      const all = (res.data as any[]).map(mapCalEvent);
      // Filter to this subject only
      setSubjectEvents(all.filter(e => !e.isCancelled && (e.subjectId === subjectId || e.classSubject === subjectName)));
    } catch {
      setSubjectEvents([]);
    }
    setCalLoading(false);
  }, [currentWeekMonday, currentWeekSunday, classId, subjectId, subjectName]);

  useEffect(() => {
    loadSubjectWeek();
  }, [loadSubjectWeek]);

  // Subject exams for the week
  const weekExams = useMemo(() => {
    const start = toDateStr(currentWeekMonday);
    const end = toDateStr(currentWeekSunday);
    return exams.filter(e => e.date >= start && e.date <= end);
  }, [exams, currentWeekMonday, currentWeekSunday]);

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekMonday);
      d.setDate(currentWeekMonday.getDate() + i);
      const dateStr = toDateStr(d);
      const hasEvents = subjectEvents.some(e => e.date === dateStr) || weekExams.some(e => e.date === dateStr);
      days.push({
        date: dateStr,
        dayName: DAY_NAMES_SHORT[d.getDay()],
        dayNum: d.getDate(),
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents,
      });
    }
    return days;
  }, [subjectEvents, weekExams, selectedDate, currentWeekMonday, todayStr]);

  const selectedDayEvents = useMemo(() => {
    return subjectEvents
      .filter(e => e.date === selectedDate)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [subjectEvents, selectedDate]);

  const selectedDayExams = useMemo(() => {
    return weekExams.filter(e => e.date === selectedDate);
  }, [weekExams, selectedDate]);

  const formatWeekRange = (): string => {
    const monday = currentWeekMonday;
    const sunday = currentWeekSunday;
    if (monday.getMonth() === sunday.getMonth()) {
      return `${monday.getDate()} - ${sunday.getDate()} de ${MONTH_NAMES[monday.getMonth()]}`;
    }
    return `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()].slice(0, 3)} - ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()].slice(0, 3)}`;
  };

  const formatTime = (time?: string): string => time ? time.slice(0, 5) : '';

  const classGroup = detailedClassData || basicClassGroup;

  const headerTitle = useMemo(() => {
    const className = classGroup?.name || '';
    if (className && subjectName) return `${className} — ${subjectName}`;
    if (className) return className;
    return subjectName;
  }, [classGroup?.name, subjectName]);

  const fetchClassDetails = useCallback(async () => {
    if (!classId) return;
    try {
      const response = await classesApi.get(classId);
      setDetailedClassData(response.data);
    } catch (err) {
      console.error('Failed to fetch class details:', err);
    }
  }, [classId]);

  useEffect(() => {
    const load = async () => {
      // Ensure subject metadata (color, schedule, aula) is available before
      // the rest of the page renders so headers & banners don't flash.
      if (fetchRegistry.isStale(`classSubjects-${classId}`, 60_000)) {
        await fetchClassSubjects(classId);
        fetchRegistry.register(`classSubjects-${classId}`);
      }
      fetchStudents(classId);
      fetchExams(classId);
      fetchAllCorrections();
      fetchClassDetails();
      fetchExercises();
      fetchAllExerciseCorrections();
      fetchComments({ class_id: classId, subject_id: subjectId, days: 90 });
      fetchSubjectPrep();
      fetchCoursePlans(subjectId, classId);
    };
    fetchClasses();
    load();
  }, [classId, subjectId, fetchClasses, fetchStudents, fetchExams, fetchAllCorrections, fetchClassDetails, fetchExercises, fetchClassSubjects, fetchComments, fetchSubjectPrep, fetchCoursePlans]);

  const activePlan = useMemo(
    () => coursePlansData.find((p) => p.subjectId === subjectId && p.classId === classId && p.isActive && p.topicsCreated),
    [coursePlansData, subjectId, classId]
  );

  useEffect(() => {
    if (activePlan) fetchPlanProgress(activePlan.id);
  }, [activePlan?.id]);

  useIonViewWillEnter(() => {
    fetchClassDetails();
    // Refresh preparation when returning to page (e.g. after generating from Calendar)
    fetchSubjectPrep();
    if (fetchRegistry.isStale(`classSubjects-${classId}`, 60_000)) {
      fetchClassSubjects(classId);
      fetchRegistry.register(`classSubjects-${classId}`);
    }
  });

  const handleRemoveConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await removeFromClass(classId, deleteTarget.id);
    } catch (err) {
      console.error('Failed to remove student:', err);
    }
    setDeleteTarget(null);
  };

  const handleSaveComment = async () => {
    if (!newCommentText.trim()) return;
    setSavingComment(true);
    try {
      await createClassComment({
        class_id: classId,
        subject_id: subjectId,
        text: newCommentText.trim(),
        mentioned_student_ids: commentMentions.map(s => s.id),
      });
      setNewCommentText('');
      setCommentMentions([]);
      fetchComments({ class_id: classId, subject_id: subjectId, days: 90 });
    } catch (err) {
      console.error('Failed to save comment:', err);
    } finally {
      setSavingComment(false);
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importStudentsToClass(classId, file);
      await fetchStudents(classId);
      setImportAlert({ header: 'Importación completada', message: `Se importaron ${count} alumnos.` });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Error al importar el archivo.';
      setImportAlert({ header: 'Error al importar', message: detail });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExamWeightChange = useCallback(async (examId: string, weight: number) => {
    try {
      await examsApi.updateWeight(examId, weight);
      fetchExams(classId);
    } catch (err) { console.error('Failed to update exam weight:', err); }
  }, [classId, fetchExams]);

  const handleExerciseWeightChange = useCallback(async (exerciseId: string, weight: number) => {
    try {
      await exercisesApi.updateWeight(exerciseId, weight);
      fetchExercises();
    } catch (err) { console.error('Failed to update exercise weight:', err); }
  }, [fetchExercises]);

  const handleCategoryWeightChange = useCallback(async (examWeightPct: number) => {
    try {
      await subjectsApi.updateClassLink(subjectId, classId, { exam_weight_pct: examWeightPct });
      fetchClassSubjects(classId);
    } catch (err) { console.error('Failed to update category weight:', err); }
  }, [subjectId, classId, fetchClassSubjects]);

  const handleExportGrades = () => {
    if (students.length === 0 || exams.length === 0) return;

    const sortedExams = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const header = ['Alumno', ...sortedExams.map(e => e.name)];

    const rows = students.map(student => {
      const grades = sortedExams.map(exam => {
        const correction = allCorrections.find(c => c.examId === exam.id && c.studentId === student.id);
        return correction?.grade !== undefined && correction?.grade !== null ? String(correction.grade) : '';
      });
      return [student.name, ...grades];
    });

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `calificaciones_${classGroup?.name || 'clase'}_${subjectName || 'asignatura'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const filteredRoster = students.filter((s) =>
    s.name.toLowerCase().includes(rosterSearch.toLowerCase())
  );

  const pendingExamsCount = useMemo(() => {
    return exams.filter(e => e.status === 'assigned').length;
  }, [exams]);

  const pendingExercisesCount = useMemo(() => {
    const pendingNames = new Set(
      exercises.filter(e => e.correctionStatus !== 'corrected').map(e => e.name || e.id)
    );
    return pendingNames.size;
  }, [exercises]);

  if (!classGroup) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="gb-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  const hasPending = pendingExamsCount > 0 || pendingExercisesCount > 0;

  return (
    <IonPage>
      <IonContent
        className="gb-content gb-content--subject"
        scrollY
        style={subjectThemeStyle(subjectColor)}
      >
        {/* Header */}
        <div className="gb-hero gb-hero--compact" style={{ background: subjectColor }}>
          <div className="gb-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" color="light" />
            </IonButtons>
            <div className="gb-hero__center">
              <h1 className="gb-hero__title">{headerTitle}</h1>
              {subjectsReady && (subjectSummary?.aula || (subjectSummary?.schedule && subjectSummary.schedule.length > 0)) && (
                <div className="gb-hero__info-badges">
                  {subjectSummary?.aula && (
                    <span className="gb-hero__badge">
                      <IonIcon icon={locationOutline} />
                      {subjectSummary.aula}
                    </span>
                  )}
                  {subjectSummary?.schedule && subjectSummary.schedule.length > 0 && (
                    <>
                      <span className="gb-hero__badge" id="schedule-badge">
                        <IonIcon icon={timeOutline} />
                        {formatScheduleDays(subjectSummary.schedule)}
                      </span>
                      <IonPopover trigger="schedule-badge" triggerAction="click" side="bottom" alignment="center" className="gb-schedule-popover">
                        <div className="gb-schedule-detail">
                          {formatScheduleDetail(subjectSummary.schedule).map((s, i) => (
                            <div key={i} className="gb-schedule-detail__row">
                              <span className="gb-schedule-detail__day">{s.day}</span>
                              <span className="gb-schedule-detail__time">{s.time}</span>
                            </div>
                          ))}
                        </div>
                      </IonPopover>
                    </>
                  )}
                </div>
              )}
            </div>
            <IonButton
              fill="clear"
              size="small"
              onClick={() => history.push(`/tabs/classes/${classId}/settings`)}
              className="gb-hero__settings-btn"
            >
              <IonIcon icon={settingsOutline} slot="icon-only" />
            </IonButton>
          </div>
        </div>

        {/* Tabs */}
        <div className="gb-tabs-wrapper">
          <IonSegment
            value={tab}
            onIonChange={(e) => setTab(e.detail.value as 'overview' | 'grades' | 'roster')}
            className="gb-tabs"
          >
            <IonSegmentButton value="overview"><IonLabel>Resumen</IonLabel></IonSegmentButton>
            <IonSegmentButton value="grades"><IonLabel>Calificaciones</IonLabel></IonSegmentButton>
            <IonSegmentButton value="roster"><IonLabel>Alumnos</IonLabel></IonSegmentButton>
          </IonSegment>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".csv,.txt"
          onChange={handleImportFile}
        />

        {/* ── Overview Tab ── */}
        {tab === 'overview' && (
          <div className="gb-overview">
            {/* AI Day Insight for this subject */}
            {subjectBreakdown && (
              <div className="gb-day-insight">
                <SubjectDayInsight breakdown={subjectBreakdown} />
              </div>
            )}

            {/* ── Course plan progress (rich widget) ── */}
            {activePlan && planProgress && planProgress.totalTopics > 0 && (
              <div className="tpc" onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/topics`)} role="button">
                <div className="tpc__row1">
                  <span className="tpc__pct">{Math.round((planProgress.taughtTopics / planProgress.totalTopics) * 100)}%</span>
                  <span className="tpc__title">{planProgress.taughtTopics} de {planProgress.totalTopics} temas</span>
                  <button className="tpc__delete" onClick={(e) => {
                    e.stopPropagation();
                    setDeletePlanTarget({ id: activePlan.id, name: activePlan.title || 'Planificación' });
                  }}>
                    <IonIcon icon={trashOutline} />
                  </button>
                </div>

                <div className="tpc__bar">
                  <div className="tpc__bar-fill" style={{ width: `${Math.round((planProgress.taughtTopics / planProgress.totalTopics) * 100)}%` }} />
                </div>

                <div className="tpc__tri-row">
                  {planProgress.trimesterProgress.map((tp, i) => (
                    <span key={tp.trimester} className="tpc__tri" style={{ color: PERIOD_COLORS[tp.trimester] }}>
                      {i > 0 && <span className="tpc__tri-sep">·</span>}
                      {getPeriodLabel(periodMode, tp.trimester)} {tp.completed}/{tp.planned}
                    </span>
                  ))}
                </div>

                <div className="tpc__footer">
                  <span className="tpc__current">
                    {planProgress.currentTopic ? `Actual: ${planProgress.currentTopic}` : 'Todos los temas impartidos'}
                  </span>
                  {planProgress.sessionsAheadBehind !== 0 && (
                    <span className={`tpc__pace ${planProgress.sessionsAheadBehind >= 0 ? 'tpc__pace--ahead' : 'tpc__pace--behind'}`}>
                      {planProgress.sessionsAheadBehind > 0 ? '+' : ''}{planProgress.sessionsAheadBehind} ses.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Subject Weekly Calendar ── */}
            <div className="gb-week-cal">
              <div className="gb-week-cal__header">
                <h3 className="gb-week-cal__title">
                  <IonIcon icon={calendarOutline} /> Semana
                </h3>
              </div>

              <div className="gb-week-cal__nav">
                <button className="gb-week-cal__nav-btn" onClick={() => setWeekOffset(w => w - 1)}>
                  <IonIcon icon={chevronBackOutline} />
                </button>
                <div className="gb-week-cal__nav-center">
                  <span className="gb-week-cal__range">{formatWeekRange()}</span>
                  {weekOffset !== 0 && (
                    <button className="gb-week-cal__today-btn" onClick={() => { setWeekOffset(0); setSelectedDate(todayStr); }}>
                      Ir a hoy
                    </button>
                  )}
                </div>
                <button className="gb-week-cal__nav-btn" onClick={() => setWeekOffset(w => w + 1)}>
                  <IonIcon icon={chevronForwardOutline} />
                </button>
              </div>

              <div className="gb-week-cal__days">
                {weekDays.map((day) => (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`gb-week-cal__day ${day.isToday ? 'gb-week-cal__day--today' : ''} ${day.isSelected ? 'gb-week-cal__day--selected' : ''}`}
                  >
                    <span className="gb-week-cal__day-name">{day.dayName}</span>
                    <span className="gb-week-cal__day-num">{day.dayNum}</span>
                    {day.hasEvents && <span className="gb-week-cal__day-dot" />}
                  </button>
                ))}
              </div>

              {/* Day events */}
              <div className="gb-week-cal__events">
                {calLoading ? (
                  <div className="gb-week-cal__loading"><IonSpinner name="dots" color="primary" /></div>
                ) : selectedDayEvents.length === 0 && selectedDayExams.length === 0 ? (
                  <div className="gb-week-cal__empty">
                    <span>Sin eventos este día</span>
                  </div>
                ) : (
                  <>
                    {selectedDayEvents.map((ev) => {
                      const parsed = parseEventNotes(ev.notes);
                      const timeStr = ev.startTime ? `${formatTime(ev.startTime)}${ev.endTime ? ' - ' + formatTime(ev.endTime) : ''}` : '';
                      const isUnplanned = ev.eventType === 'class_session' && !parsed.isPlanEvent && !parsed.focus;
                      const lecturePart = ev.title.includes(' — ') ? ev.title.split(' — ').slice(1).join(' — ') : '';
                      return (
                      <div
                        key={ev.id}
                        className={`gb-week-cal__card ${isUnplanned ? 'gb-week-cal__card--unplanned' : ''}`}
                        onClick={() => { setEditingEvent(ev); setShowEventEditor(true); }}
                      >
                        {isUnplanned ? (
                          <div className="gb-week-cal__card-preview">
                            <span className="gb-week-cal__card-preview-info">
                              {ev.className || ''}{ev.aula ? ` · ${ev.aula}` : ''}{lecturePart ? ` — ${lecturePart}` : ''}
                            </span>
                            {timeStr && <span className="gb-week-cal__card-time">{timeStr}</span>}
                          </div>
                        ) : (
                          <>
                            <div className="gb-week-cal__card-header">
                              <span className="gb-week-cal__card-title">{ev.title}</span>
                              {timeStr && <span className="gb-week-cal__card-time">{timeStr}</span>}
                            </div>
                            {parsed.focus && (
                              <span className="gb-week-cal__card-focus">{parsed.focus}</span>
                            )}
                            {parsed.keyPoints.length > 0 && (
                              <div className="gb-week-cal__card-tags">
                                {parsed.keyPoints.slice(0, 3).map((kp, ki) => (
                                  <span key={ki} className="gb-week-cal__card-tag">{kp}</span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        {/* Action buttons */}
                        <div className="gb-week-cal__card-actions">
                          {ev.topicPdfUrl && (
                            <button className="gb-week-cal__card-action" onClick={(e) => {
                              e.stopPropagation();
                              window.open(`${import.meta.env.VITE_API_URL || ''}/files${ev.topicPdfUrl}`, '_blank');
                            }}>
                              <IonIcon icon={bookOutline} /> Ver material
                            </button>
                          )}
                          {parsed.isPlanEvent && (
                            <button className="gb-week-cal__card-action" onClick={(e) => {
                              e.stopPropagation();
                              history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exercises?generate=1`);
                            }}>
                              <IonIcon icon={sparkles} /> Ejercicios
                            </button>
                          )}
                          {ev.eventType === 'exam' && parsed.isPlanEvent && !ev.examId && (
                            <button className="gb-week-cal__card-action" onClick={(e) => {
                              e.stopPropagation();
                              const params = new URLSearchParams();
                              if (parsed.topicIds.length) params.set('topicIds', parsed.topicIds.join(','));
                              params.set('date', ev.date);
                              params.set('name', ev.title);
                              history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exams/new?${params}`);
                            }}>
                              <IonIcon icon={createOutline} /> Crear examen
                            </button>
                          )}
                        </div>
                      </div>
                      );
                    })}
                    {selectedDayExams.map((exam) => (
                      <div
                        key={exam.id}
                        className="gb-week-cal__event"
                        onClick={() => {
                          if (exam.status === 'assigned' || exam.status === 'corrected') {
                            history.push(`/correction/${exam.id}`);
                          } else {
                            history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exams/${exam.id}`);
                          }
                        }}
                      >
                        <div className="gb-week-cal__event-time gb-week-cal__event-time--exam">
                          <IonIcon icon={documentTextOutline} />
                        </div>
                        <div className="gb-week-cal__event-content">
                          <span className="gb-week-cal__event-title">{exam.name}</span>
                        </div>
                        <span className={`gb-week-cal__exam-status gb-week-cal__exam-status--${exam.status}`}>
                          {exam.status === 'assigned' ? 'Pendiente' : exam.status === 'corrected' ? 'Corregido' : 'Subido'}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Subject Stats */}
            <ClassInsightsPanel
              classId={classId}
              subjectId={subjectId}
              onStudentClick={(id) => history.push(`/tabs/classes/${classId}/students/${id}?subjectId=${subjectId}`)}
              onGenerateExercises={(areas) => {
                setPreselectedWeakAreas(areas || []);
                setShowBulkExerciseModal(true);
              }}
            />

            {/* Pending Alerts */}
            {hasPending && (
              <div className="gb-alerts">
                {pendingExamsCount > 0 && (
                  <button
                    className="gb-alert-row gb-alert-row--warning"
                    onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exams`)}
                  >
                    <span className="gb-alert-row__badge">{pendingExamsCount}</span>
                    <span className="gb-alert-row__text">
                      {pendingExamsCount === 1 ? 'examen pendiente de corregir' : 'exámenes pendientes de corregir'}
                    </span>
                    <IonIcon icon={chevronForwardOutline} className="gb-alert-row__arrow" />
                  </button>
                )}
                {pendingExercisesCount > 0 && (
                  <button
                    className="gb-alert-row gb-alert-row--info"
                    onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exercises`)}
                  >
                    <span className="gb-alert-row__badge">{pendingExercisesCount}</span>
                    <span className="gb-alert-row__text">
                      {pendingExercisesCount === 1 ? 'ejercicio pendiente' : 'ejercicios pendientes'}
                    </span>
                    <IonIcon icon={chevronForwardOutline} className="gb-alert-row__arrow" />
                  </button>
                )}
              </div>
            )}

            {/* Navigation List */}
            <div className="gb-nav-card">
              <button
                className="gb-nav-row"
                onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exams`)}
              >
                <IonIcon icon={documentTextOutline} className="gb-nav-row__icon" />
                <span className="gb-nav-row__label">Exámenes</span>
                {exams.length > 0 && (
                  <span className="gb-nav-row__count">{exams.length}</span>
                )}
                <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
              </button>

              <button
                className="gb-nav-row"
                onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exercises`)}
              >
                <IonIcon icon={sparkles} className="gb-nav-row__icon" />
                <span className="gb-nav-row__label">Ejercicios</span>
                {uniqueExerciseCount > 0 && (
                  <span className="gb-nav-row__count">{uniqueExerciseCount}</span>
                )}
                <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
              </button>

              <button
                className="gb-nav-row"
                onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/topics`)}
              >
                <IonIcon icon={bookOutline} className="gb-nav-row__icon" />
                <span className="gb-nav-row__label">Temario</span>
                <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
              </button>


              <button
                className="gb-nav-row gb-nav-row--last"
                onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/attendance`)}
              >
                <IonIcon icon={peopleOutline} className="gb-nav-row__icon" />
                <span className="gb-nav-row__label">Asistencia</span>
                <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
              </button>
            </div>

            {/* ── Notas / Comentarios ── */}
            <div className="gb-comments-section">
              <button
                className="gb-comments-section__header gb-comments-section__header--toggle"
                onClick={() => setNotesOpen(o => !o)}
              >
                <IonIcon icon={chatbubbleOutline} className="gb-comments-section__icon" />
                <span className="gb-comments-section__title">Notas</span>
                {subjectComments.length > 0 && (
                  <span className="gb-nav-row__count">{subjectComments.length}</span>
                )}
                <IonIcon
                  icon={chevronDownOutline}
                  className={`gb-comments-section__chevron ${notesOpen ? 'gb-comments-section__chevron--open' : ''}`}
                />
              </button>

              {notesOpen && (
                <>
                  {/* New comment input */}
                  <div className="gb-comments-section__input-row">
                    <MentionTextarea
                      value={newCommentText}
                      onChange={setNewCommentText}
                      mentionedStudents={commentMentions}
                      onMentionsChange={setCommentMentions}
                      placeholder="Escribe una nota..."
                      rows={1}
                      disabled={savingComment}
                      helperText="Usa @ para mencionar alumnos"
                      classId={classId}
                    />
                    <button
                      className="gb-comments-section__send-btn"
                      onClick={handleSaveComment}
                      disabled={savingComment || !newCommentText.trim()}
                    >
                      {savingComment ? <IonSpinner name="dots" /> : <IonIcon icon={sendOutline} />}
                    </button>
                  </div>

                  {/* Comments list */}
                  {commentsLoading ? (
                    <div className="gb-comments-section__loading"><IonSpinner name="dots" color="primary" /></div>
                  ) : subjectComments.length === 0 ? (
                    <div className="gb-comments-section__empty">Sin notas aún</div>
                  ) : (
                    <div className="gb-comments-section__list">
                      {subjectComments.map((c) => (
                        <div key={c.id} className="gb-comment-item">
                          <div className="gb-comment-item__text">{c.text}</div>
                          <div className="gb-comment-item__meta">
                            {new Date(c.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' · '}
                            {new Date(c.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {exams.length === 0 && students.length === 0 && (
              <div className="gb-empty-overview">
                <EmptyState
                  icon="🎓"
                  title="Empieza a configurar tu clase"
                  subtitle="Añade alumnos y crea exámenes para comenzar"
                  actionLabel="Añadir alumnos"
                  onAction={() => setShowAddModal(true)}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Grades Tab ── */}
        {tab === 'grades' && (
          <div className="gb-grades">
            {studentsLoading ? (
              <div className="gb-loading"><IonSpinner color="primary" /></div>
            ) : students.length === 0 || (exams.length === 0 && exercises.length === 0) ? (
              <EmptyState
                icon="📊"
                title={students.length === 0 ? 'Aún no hay alumnos' : 'Aún no hay exámenes ni ejercicios'}
                subtitle={students.length === 0 ? 'Añade alumnos para empezar' : 'Crea un examen o genera ejercicios'}
                actionLabel={students.length === 0 ? 'Añadir alumno' : 'Generar ejercicios'}
                onAction={() => (students.length === 0 ? setShowAddModal(true) : setShowBulkExerciseModal(true))}
              />
            ) : (
              <>
                <div className="gb-grades-toolbar">
                  <IonButton size="small" fill="outline" onClick={handleExportGrades}>
                    <IonIcon icon={downloadOutline} slot="start" /> Exportar
                  </IonButton>
                </div>
                <GradeTable
                  students={students}
                  exams={exams}
                  exercises={exercises}
                  exerciseCorrections={exerciseCorrections}
                  examWeightPct={subjectSummary?.examWeightPct ?? 70}
                  onStudentClick={(id) => history.push(`/tabs/classes/${classId}/students/${id}?subjectId=${subjectId}`)}
                  onExamClick={(id) => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exams/${id}`)}
                  onExerciseClick={(id) => history.push(`/tabs/classes/${classId}/subjects/${subjectId}/exercises/${id}`)}
                  onExamWeightChange={handleExamWeightChange}
                  onExerciseWeightChange={handleExerciseWeightChange}
                  onCategoryWeightChange={handleCategoryWeightChange}
                />
              </>
            )}
          </div>
        )}

        {/* ── Roster Tab ── */}
        {tab === 'roster' && (
          <div className="gb-roster">
            <div className="gb-roster-toolbar">
              <IonButton size="small" onClick={() => setShowAddModal(true)}>
                <IonIcon icon={addOutline} slot="start" /> Añadir alumno
              </IonButton>
              <IonButton size="small" fill="outline" onClick={handleImportClick}>
                <IonIcon icon={cloudUploadOutline} slot="start" /> Importar CSV
              </IonButton>
            </div>
            <IonSearchbar
              value={rosterSearch}
              onIonInput={(e) => setRosterSearch(e.detail.value ?? '')}
              placeholder="Buscar alumnos..."
              className="gb-roster-search"
            />
            {studentsLoading ? (
              <div className="gb-loading"><IonSpinner color="primary" /></div>
            ) : filteredRoster.length === 0 ? (
              <EmptyState icon="👤" title="No hay alumnos" actionLabel="Añadir alumno" onAction={() => setShowAddModal(true)} />
            ) : (
              <IonList className="gb-roster-list">
                {filteredRoster.map((s) => (
                  <IonItemSliding key={s.id}>
                    <IonItem button onClick={() => history.push(`/tabs/classes/${classId}/students/${s.id}?subjectId=${subjectId}`)} className="gb-student-item">
                      <div className="gb-student-avatar" slot="start" style={{ background: avatarColor(s.name) }}>
                        {s.name.charAt(0)}
                      </div>
                      <IonLabel>
                        <h3 className="gb-student-name">{s.name}</h3>
                        {s.studentId && <p className="gb-student-code">{s.studentId}</p>}
                      </IonLabel>
                      <IonIcon icon={chevronForwardOutline} slot="end" className="gb-student-arrow" />
                    </IonItem>
                    <IonItemOptions side="end">
                      <IonItemOption color="danger" onClick={() => setDeleteTarget({ id: s.id, name: s.name })}>
                        Quitar
                      </IonItemOption>
                    </IonItemOptions>
                  </IonItemSliding>
                ))}
              </IonList>
            )}
          </div>
        )}

        {/* Modals */}
        <AddStudentsModal
          isOpen={showAddModal}
          classId={classId}
          className={classGroup?.name || ''}
          onDismiss={() => setShowAddModal(false)}
          onStudentsAdded={() => fetchStudents(classId)}
        />

        <IonAlert
          isOpen={!!deleteTarget}
          header="Quitar alumno"
          message={`¿Quitar a "${deleteTarget?.name}" de esta clase?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
            { text: 'Quitar', role: 'destructive', handler: handleRemoveConfirm }
          ]}
          onDidDismiss={() => setDeleteTarget(null)}
        />
        <IonAlert
          isOpen={!!importAlert}
          header={importAlert?.header || ''}
          message={importAlert?.message || ''}
          buttons={['OK']}
          onDidDismiss={() => setImportAlert(null)}
        />
        <IonAlert
          isOpen={!!deletePlanTarget}
          header="Eliminar planificación"
          message={`¿Eliminar "${deletePlanTarget?.name}"? Se borrarán los temas y el contenido generado.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeletePlanTarget(null) },
            { text: 'Eliminar', role: 'destructive', handler: async () => {
              if (deletePlanTarget) {
                await deletePlan(deletePlanTarget.id);
                await Promise.all([
                  fetchCoursePlans(subjectId, classId),
                  fetchClassSubjects(classId),
                  loadSubjectWeek(),
                ]);
              }
              setDeletePlanTarget(null);
            }},
          ]}
          onDidDismiss={() => setDeletePlanTarget(null)}
        />

        <ExerciseGeneratorModal
          isOpen={showBulkExerciseModal}
          onDismiss={() => { setShowBulkExerciseModal(false); setPreselectedWeakAreas([]); }}
          classId={classId}
          preselectedSubjectId={subjectId}
          weakAreas={preselectedWeakAreas.map(topic => ({ topic }))}
        />
        <EventEditorSheet
          isOpen={showEventEditor}
          onDismiss={() => { setShowEventEditor(false); setEditingEvent(null); loadSubjectWeek(); }}
          existingEvent={editingEvent}
          defaultDate={selectedDate}
        />
      </IonContent>
    </IonPage>
  );
};

export default SubjectGradeBook;
