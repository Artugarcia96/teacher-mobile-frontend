import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  FileText,
  Clock,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  CheckCircle,
  FileText as ReaderIcon,
  HelpCircle,
  BookOpen,
  Pencil,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Spinner from '@/components/shared/Spinner';
import { parseEventNotes } from '../../utils/parseEventNotes';
import { useNavigate } from 'react-router-dom';
import PageShell from '@/components/shared/PageShell';
import { useClassesStore } from '../../store/classesStore';
import { useExamsStore } from '../../store/examsStore';
import { useTallerStore } from '../../store/tallerStore';
import { useCalendarStore, CalendarView } from '../../store/calendarStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { useAttendanceStore } from '../../store/attendanceStore';
import EventEditorSheet from '../../components/EventEditorSheet';
import SessionDetailDrawer from '../../components/SessionDetailDrawer';
import PrepareYourDayModal from '../../components/PrepareYourDayModal';
import AttendanceSheet from '../../components/AttendanceSheet';
import { CalendarEvent } from '../../types';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import './Calendar.css';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_NAMES_UPPER = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '¡Buenos días!';
  if (h < 20) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function getCalendarWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Start from the Monday before/on the first day of month
  let start = getMonday(firstDay);

  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];

  // Generate all days needed (up to 6 weeks)
  const endDate = new Date(lastDay);
  endDate.setDate(endDate.getDate() + (7 - endDate.getDay()) % 7);

  let current = new Date(start);
  while (current <= endDate || currentWeek.length > 0) {
    currentWeek.push(new Date(current));

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
      if (current > lastDay) break;
    }

    current.setDate(current.getDate() + 1);
  }

  return weeks;
}

function formatTodayDate(): string {
  const d = new Date();
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

function formatTime(time?: string): string {
  if (!time) return '';
  return time.slice(0, 5);
}


const Calendar: React.FC = () => {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const todayStr = toDateStr(new Date());
  const today = new Date();

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const exams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const fetchAllStudents = useStudentsStore((s) => s.fetchAllStudents);

  const calEvents = useCalendarStore((s) => s.events);
  const calLoading = useCalendarStore((s) => s.loading);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);
  const view = useCalendarStore((s) => s.view);
  const setView = useCalendarStore((s) => s.setView);
  const preparedDates = useCalendarStore((s) => s.preparedDates);
  const fetchPreparedDates = useCalendarStore((s) => s.fetchPreparedDates);
  const lastScheduleUpdate = useCalendarStore((s) => s.lastScheduleUpdate);

  // Track schedule updates to trigger refresh
  const lastKnownScheduleUpdate = useRef(lastScheduleUpdate);

  const [showEventEditor, setShowEventEditor] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const [showPrepareModal, setShowPrepareModal] = useState(false);
  const [attendanceData, setAttendanceData] = useState<{classId: string; date: string; eventId?: string; subjectId?: string} | null>(null);

  const fetchTaken = useAttendanceStore(s => s.fetchTaken);
  const isAttendanceTaken = useAttendanceStore(s => s.isAttendanceTaken);

  // Week/Month navigation state
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthDate, setMonthDate] = useState(new Date());

  const dashboardData = useDashboardStore((s) => s.data);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  // Get week dates based on offset
  const currentWeekMonday = useMemo(() => {
    const d = new Date();
    const monday = getMonday(d);
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const currentWeekSunday = useMemo(() => getSunday(currentWeekMonday), [currentWeekMonday]);

  const loadDateRange = useCallback((startDate: Date, endDate: Date) => {
    const start = toDateStr(startDate);
    const end = toDateStr(endDate);
    fetchEvents(start, end);
    fetchPreparedDates(start, end);
    fetchTaken(start, end);
  }, [fetchEvents, fetchPreparedDates, fetchTaken]);

  const loadWeek = useCallback(() => {
    loadDateRange(currentWeekMonday, currentWeekSunday);
  }, [loadDateRange, currentWeekMonday, currentWeekSunday]);

  const loadMonth = useCallback(() => {
    const start = getMonthStart(monthDate);
    const end = getMonthEnd(monthDate);
    // Extend range to include partial weeks
    const extStart = getMonday(start);
    const extEnd = getSunday(end);
    loadDateRange(extStart, extEnd);
  }, [loadDateRange, monthDate]);

  useEffect(() => {
    fetchClasses();
    fetchExams();
    fetchAllStudents();
    fetchDashboard();
    if (view === 'week') {
      loadWeek();
    } else {
      loadMonth();
    }
  }, [fetchClasses, fetchExams, fetchAllStudents, fetchDashboard, loadWeek, loadMonth, view]);

  // Refresh when schedule is updated from another page (e.g., GradeBook)
  useEffect(() => {
    if (lastScheduleUpdate > lastKnownScheduleUpdate.current) {
      lastKnownScheduleUpdate.current = lastScheduleUpdate;
      // Refresh calendar data
      if (view === 'week') {
        loadWeek();
      } else {
        loadMonth();
      }
    }
  }, [lastScheduleUpdate, view, loadWeek, loadMonth]);


  const selectedDayEvents = useMemo(() => {
    return calEvents
      .filter((e) => e.date === selectedDate && !e.isCancelled)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [calEvents, selectedDate]);

  const selectedDayExams = useMemo(() => {
    return exams.filter((e) => e.date === selectedDate);
  }, [exams, selectedDate]);

  const isToday = selectedDate === todayStr;

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekMonday);
      d.setDate(currentWeekMonday.getDate() + i);
      const dateStr = toDateStr(d);
      const hasEvents = calEvents.some(e => e.date === dateStr && !e.isCancelled) || exams.some(e => e.date === dateStr);
      const isPrepared = preparedDates.includes(dateStr);
      days.push({
        date: dateStr,
        dayName: DAY_NAMES_SHORT[d.getDay()],
        dayNum: d.getDate(),
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents,
        isPrepared,
      });
    }
    return days;
  }, [calEvents, exams, selectedDate, currentWeekMonday, todayStr, preparedDates]);

  const monthWeeks = useMemo(() => {
    return getCalendarWeeks(monthDate.getFullYear(), monthDate.getMonth());
  }, [monthDate]);

  const isDayPrepared = useCallback((dateStr: string) => {
    return preparedDates.includes(dateStr);
  }, [preparedDates]);

  const handlePrevWeek = () => setWeekOffset(w => w - 1);
  const handleNextWeek = () => setWeekOffset(w => w + 1);
  const handleGoToToday = () => {
    setWeekOffset(0);
    setSelectedDate(todayStr);
  };

  const handlePrevMonth = () => {
    setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1));
  };

  const handleViewChange = (newView: CalendarView) => {
    setView(newView);
    if (newView === 'month') {
      setMonthDate(new Date(selectedDate + 'T00:00:00'));
    }
  };

  const groupedDayExams = useMemo(() => {
    const groups = new Map<string, typeof selectedDayExams>();
    selectedDayExams.forEach((exam) => {
      const key = `${exam.name}-${exam.classId}-${exam.status}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(exam);
    });
    return Array.from(groups.entries()).map(([key, examsInGroup]) => ({
      key,
      name: examsInGroup[0].name,
      classId: examsInGroup[0].classId,
      status: examsInGroup[0].status,
      count: examsInGroup.length,
      firstExamId: examsInGroup[0].id,
    }));
  }, [selectedDayExams]);

  const formatSelectedDate = (): string => {
    const d = new Date(selectedDate + 'T00:00:00');
    if (selectedDate === todayStr) return 'Hoy';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selectedDate === toDateStr(tomorrow)) return 'Mañana';
    return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()}`;
  };

  const formatWeekRange = (): string => {
    const monday = currentWeekMonday;
    const sunday = currentWeekSunday;
    if (monday.getMonth() === sunday.getMonth()) {
      return `${monday.getDate()} - ${sunday.getDate()} de ${MONTH_NAMES[monday.getMonth()]}`;
    }
    return `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()].slice(0, 3)} - ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()].slice(0, 3)}`;
  };

  const isCurrentWeek = weekOffset === 0;

  const handleEventClick = (ev: CalendarEvent) => {
    // Sesiones de clase abren el hub operativo (materiales + pasar lista +
    // notas). Eventos custom/tutoría siguen abriendo el editor clásico para
    // permitir mover fecha, cancelar, etc.
    if (ev.eventType === 'class_session') {
      setOpenSessionId(ev.id);
      return;
    }
    setEditingEvent(ev);
    setShowEventEditor(true);
  };

  const handleExamClick = (examId: string, _status: string) => {
    // Unified exam detail: same URL for prep, scheduling and correction.
    navigate(`/tabs/exams/${examId}`);
  };

  const handleNewEvent = () => {
    setEditingEvent(null);
    setShowEventEditor(true);
  };


  const handleCreateMaterialForDay = () => {
    // Construye el hint con la fecha seleccionada en formato legible
    const d = new Date(selectedDate + 'T00:00:00');
    const human = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    useTallerStore.getState().openTaller({
      limitTo: 'content',
      defaultType: 'presentation',
      date: selectedDate,
      promptHint: `Material para la clase del ${human}. `,
    });
  };

  const headerActions = (
    <div className="flex items-center gap-1">
      <button
        onClick={handleCreateMaterialForDay}
        aria-label="Crear material para este día"
        title="Crear material para este día"
        className="flex items-center gap-1 px-2 h-8 rounded-lg hover:bg-accent transition-colors text-primary font-medium text-xs"
      >
        <Sparkles size={16} />
        <span className="hidden sm:inline">Material</span>
      </button>
      <button
        onClick={() => navigate('/tabs/guide')}
        aria-label="Guía de uso"
        className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent transition-colors"
      >
        <HelpCircle size={20} />
      </button>
    </div>
  );

  return (
    <PageShell title="Calendario" headerActions={headerActions} noPadding contentClassName="pb-[100px] bg-background">

        {/* Prepare Your Day Button */}
        <div className="cal-section">
          <button
            className={`cal-prepare-btn ${isDayPrepared(todayStr) ? 'cal-prepare-btn--done' : ''}`}
            onClick={() => setShowPrepareModal(true)}
          >
            <div className="cal-prepare-btn__icon">
              {isDayPrepared(todayStr) ? <CheckCircle size={20} color="#ffffff" /> : <Sparkles size={20} color="#ffffff" />}
            </div>
            <div className="cal-prepare-btn__content">
              <span className="cal-prepare-btn__title">
                {isDayPrepared(todayStr) ? 'Tu día está preparado' : 'Prepara tu día'}
              </span>
              <span className="cal-prepare-btn__subtitle">
                {isDayPrepared(todayStr) ? 'Toca para ver el resumen' : 'Obtén un resumen con IA de tus clases de hoy'}
              </span>
            </div>
            <ChevronRight size={18} className="cal-prepare-btn__arrow" />
          </button>
        </div>

        {dashboardData && dashboardData.pendingCorrections.length > 0 && (
          <div className="cal-section">
            <div className="cal-pending-header">
              <div className="cal-pending__badge">{dashboardData.stats.pendingCorrectionsCount}</div>
              <span className="cal-pending-header__title">
                {dashboardData.pendingCorrections.length === 1 ? 'Corrección pendiente' : 'Correcciones pendientes'}
              </span>
            </div>
            <div className="cal-pending-list">
              {dashboardData.pendingCorrections.slice(0, 4).map((pc) => (
                <button
                  key={pc.examId}
                  className="cal-pending-item"
                  onClick={() => navigate(
                    pc.classId
                      ? `/tabs/classes/${pc.classId}/exams/${pc.examId}`
                      : `/tabs/exams/${pc.examId}`
                  )}
                >
                  <div className="cal-pending-item__info">
                    <span className="cal-pending-item__name">{pc.examName}</span>
                    <span className="cal-pending-item__class">
                      {pc.className}{pc.subjectName ? ` · ${pc.subjectName}` : ''}
                    </span>
                  </div>
                  <div className="cal-pending-item__right">
                    <span className="cal-pending-item__count">{pc.pendingCount}/{pc.totalCount}</span>
                    {pc.deadlineStatus && pc.deadlineStatus !== 'ok' && (
                      <span className={`cal-pending-item__deadline cal-pending-item__deadline--${pc.deadlineStatus}`}>
                        {pc.deadlineStatus === 'overdue' ? 'Vencido' :
                         pc.deadlineStatus === 'urgent' ? 'Urgente' : 'Pronto'}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={14} className="cal-pending-item__arrow" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="cal-section">
          <div className="cal-section__header">
            <h2 className="cal-section__title">
              <CalendarIcon size={16} className="text-primary" /> Calendario
            </h2>
          </div>

          {/* View Toggle */}
          <Tabs
            value={view}
            onValueChange={(v) => handleViewChange(v as CalendarView)}
            className="cal-view-toggle-tabs"
          >
            <TabsList className="w-full">
              <TabsTrigger value="week" className="flex-1">Semana</TabsTrigger>
              <TabsTrigger value="month" className="flex-1">Mes</TabsTrigger>
            </TabsList>
          </Tabs>

          {view === 'week' ? (
            <>
              {/* Week Navigation */}
              <div className="cal-week-nav">
                <button className="cal-week-nav__btn" onClick={handlePrevWeek}>
                  <ChevronLeft size={18} />
                </button>
                <div className="cal-week-nav__center">
                  <span className="cal-week-nav__range">{formatWeekRange()}</span>
                  {!isCurrentWeek && (
                    <button className="cal-week-nav__today" onClick={handleGoToToday}>
                      Ir a hoy
                    </button>
                  )}
                </div>
                <button className="cal-week-nav__btn" onClick={handleNextWeek}>
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Week Days */}
              <div className="cal-mini-cal">
                {weekDays.map((day) => (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDate(day.date)}
                    className={`cal-mini-cal__day ${day.isToday ? 'cal-mini-cal__day--today' : ''} ${day.isSelected ? 'cal-mini-cal__day--selected' : ''} ${day.hasEvents ? 'cal-mini-cal__day--has-events' : ''}`}
                  >
                    <span className="cal-mini-cal__name">{day.dayName}</span>
                    <span className="cal-mini-cal__num">{day.dayNum}</span>
                    {day.hasEvents && <span className="cal-mini-cal__dot" />}
                    {day.isPrepared && <span className="cal-mini-cal__check" />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Month Navigation */}
              <div className="cal-week-nav">
                <button className="cal-week-nav__btn" onClick={handlePrevMonth}>
                  <ChevronLeft size={18} />
                </button>
                <span className="cal-week-nav__range">
                  {MONTH_NAMES_UPPER[monthDate.getMonth()]} {monthDate.getFullYear()}
                </span>
                <button className="cal-week-nav__btn" onClick={handleNextMonth}>
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Month Grid */}
              <div className="cal-month">
                <div className="cal-month__header">
                  {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <span key={d} className="cal-month__header-day">{d}</span>
                  ))}
                </div>
                {monthWeeks.map((week, wi) => (
                  <div key={wi} className="cal-month__week">
                    {week.map((day) => {
                      const dateStr = toDateStr(day);
                      const isCurrentMonth = day.getMonth() === monthDate.getMonth();
                      const hasEvents = calEvents.some(e => e.date === dateStr && !e.isCancelled);
                      const hasExams = exams.some(e => e.date === dateStr);
                      const isPrepared = isDayPrepared(dateStr);
                      return (
                        <button
                          key={dateStr}
                          onClick={() => setSelectedDate(dateStr)}
                          className={`cal-month__day ${!isCurrentMonth ? 'cal-month__day--other' : ''} ${dateStr === todayStr ? 'cal-month__day--today' : ''} ${dateStr === selectedDate ? 'cal-month__day--selected' : ''}`}
                        >
                          <span className="cal-month__day-num">{day.getDate()}</span>
                          <div className="cal-month__day-dots">
                            {hasEvents && <span className="cal-month__day-dot cal-month__day-dot--event" />}
                            {hasExams && <span className="cal-month__day-dot cal-month__day-dot--exam" />}
                          </div>
                          {isPrepared && <span className="cal-month__day-check" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="cal-section">
          <div className="cal-section__header">
            <h2 className="cal-section__title">
              <Clock size={16} className="text-primary" /> {formatSelectedDate()}
            </h2>
            <div className="cal-section__actions">
              <span className="cal-section__count">
                {selectedDayEvents.length + groupedDayExams.length} {selectedDayEvents.length + groupedDayExams.length === 1 ? 'evento' : 'eventos'}
              </span>
              <button className="cal-section__add-btn" onClick={handleNewEvent}>
                + Añadir evento
              </button>
            </div>
          </div>

          {calLoading ? (
            <div className="cal-loading"><Spinner size={24} /></div>
          ) : (
            <div className="cal-agenda">
              {selectedDayEvents.length === 0 && groupedDayExams.length === 0 ? (
                <div className="cal-empty">
                  <span className="cal-empty__text">Sin eventos {isToday ? 'para hoy' : 'este día'}</span>
                  <button className="cal-empty__add" onClick={handleNewEvent}>
                    + Añadir evento
                  </button>
                </div>
              ) : (
                <>
                  {selectedDayEvents.map((ev) => {
                    const parsed = parseEventNotes(ev.notes);
                    const timeStr = ev.startTime ? `${formatTime(ev.startTime)}${ev.endTime ? ' - ' + formatTime(ev.endTime) : ''}` : '';
                    const isUnplanned = ev.eventType === 'class_session' && !parsed.isPlanEvent && !parsed.focus;
                    const lecturePart = ev.title.includes(' — ') ? ev.title.split(' — ').slice(1).join(' — ') : '';
                    // Show subject in prefix only when title doesn't already start with it (avoids "RG · RG — ...")
                    const subjectInPrefix = ev.classSubject && !ev.title.startsWith(ev.classSubject) ? ` · ${ev.classSubject}` : '';
                    // For unplanned: skip lecturePart if it equals the subject name (avoids "RG — RG")
                    const showLecture = lecturePart && lecturePart !== ev.classSubject;
                    return (
                    <div key={ev.id} className={`cal-card cal-card--${ev.eventType} ${isUnplanned ? 'cal-card--unplanned' : ''}`} onClick={() => handleEventClick(ev)}>
                      {isUnplanned ? (
                        <div className="cal-card__preview">
                          <span className="cal-card__preview-info">
                            {ev.className || ''}{ev.aula ? ` · ${ev.aula}` : ''}{subjectInPrefix}{showLecture ? ` — ${lecturePart}` : ''}
                          </span>
                          {timeStr && <span className="cal-card__time">{timeStr}</span>}
                        </div>
                      ) : (
                        <>
                          {/* Header: class + time */}
                          <div className="cal-card__header">
                            <span className="cal-card__class">
                              {ev.className || ''}{ev.aula ? ` · ${ev.aula}` : ''}{subjectInPrefix}
                            </span>
                            {timeStr && <span className="cal-card__time">{timeStr}</span>}
                          </div>

                          {/* Session content */}
                          <span className="cal-card__title">{ev.title}</span>
                          {parsed.focus && <span className="cal-card__focus">{parsed.focus}</span>}
                          {!parsed.isPlanEvent && ev.topicName && <span className="cal-card__topic">{ev.topicName}</span>}

                          {parsed.keyPoints.length > 0 && (
                            <div className="cal-card__tags">
                              {parsed.keyPoints.slice(0, 4).map((kp, ki) => (
                                <span key={ki} className="cal-card__tag">{kp}</span>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Action buttons row */}
                      <div className="cal-card__actions">
                        {ev.eventType === 'class_session' && ev.classId && (() => {
                          const taken = isAttendanceTaken(ev.classId!, ev.date, ev.subjectId);
                          return (
                            <button
                              className={`cal-card__action ${taken ? 'cal-card__action--done' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setAttendanceData({ classId: ev.classId!, date: ev.date, eventId: ev.id, subjectId: ev.subjectId });
                              }}
                            >
                              {taken ? <CheckCircle size={14} /> : <ReaderIcon size={14} />}
                              <span>{taken ? 'Lista revisada' : 'Pasar lista'}</span>
                            </button>
                          );
                        })()}
                        {ev.topicPdfUrl && (
                          <button
                            className="cal-card__action"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`${import.meta.env.VITE_API_URL || ''}/files${ev.topicPdfUrl}`, '_blank');
                            }}
                          >
                            <BookOpen size={14} />
                            <span>Ver material</span>
                          </button>
                        )}
                        {parsed.isPlanEvent && ev.classId && ev.subjectId && (
                          <button
                            className="cal-card__action"
                            onClick={(e) => {
                              e.stopPropagation();
                              const params = new URLSearchParams({ generate: '1' });
                              if (parsed.topicIds.length) params.set('topicIds', parsed.topicIds.join(','));
                              if (ev.title) params.set('name', ev.title);
                              navigate(`/tabs/classes/${ev.classId}/subjects/${ev.subjectId}/exercises?${params}`);
                            }}
                          >
                            <Sparkles size={14} />
                            <span>Ejercicios</span>
                          </button>
                        )}
                        {ev.eventType === 'exam' && parsed.isPlanEvent && !ev.examId && (
                          <button
                            className="cal-card__action"
                            onClick={(e) => {
                              e.stopPropagation();
                              const params = new URLSearchParams();
                              if (parsed.topicIds.length) params.set('topicIds', parsed.topicIds.join(','));
                              params.set('date', ev.date);
                              params.set('name', ev.title);
                              navigate(`/tabs/classes/${ev.classId}/subjects/${ev.subjectId}/exams/new?${params}`);
                            }}
                          >
                            <Pencil size={14} />
                            <span>Crear examen</span>
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}

                  {groupedDayExams.map((group) => {
                    const cls = classes.find((c) => c.id === group.classId);
                    return (
                      <div
                        key={group.key}
                        className="cal-agenda-item cal-agenda-item--exam"
                        onClick={() => handleExamClick(group.firstExamId, group.status)}
                      >
                        <div className={`cal-agenda-item__time cal-agenda-item__time--exam-${group.status}`}>
                          <FileText size={18} />
                        </div>
                        <div className="cal-agenda-item__content">
                          <span className="cal-agenda-item__title">{group.name}</span>
                          {cls && <span className="cal-agenda-item__class">{cls.name}</span>}
                        </div>
                        <span className={`cal-agenda-item__status cal-agenda-item__status--${group.status}`}>
                          {group.status === 'pending_correction' ? 'Sin corregir' : group.status === 'corrected' ? 'Evaluado' : group.status === 'scheduled' ? 'Planificado' : 'Pendiente'}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>


      <EventEditorSheet
        isOpen={showEventEditor}
        onDismiss={() => {
          setShowEventEditor(false);
          setEditingEvent(null);
          view === 'week' ? loadWeek() : loadMonth();
        }}
        existingEvent={editingEvent}
        defaultDate={selectedDate}
      />

      <PrepareYourDayModal
        isOpen={showPrepareModal}
        onDismiss={() => setShowPrepareModal(false)}
        date={todayStr}
      />

      <AttendanceSheet
        isOpen={!!attendanceData}
        classId={attendanceData?.classId || ''}
        date={attendanceData?.date || ''}
        eventId={attendanceData?.eventId}
        subjectId={attendanceData?.subjectId}
        onDismiss={() => setAttendanceData(null)}
      />

      <SessionDetailDrawer
        eventId={openSessionId}
        open={!!openSessionId}
        onClose={() => {
          setOpenSessionId(null);
          // Refresca por si cambió título/notas/asistencia inline
          view === 'week' ? loadWeek() : loadMonth();
        }}
      />
    </PageShell>
  );
};

export default Calendar;
