import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { IonPage, IonContent, IonIcon, IonSpinner, IonModal, IonList, IonItem, IonLabel, IonSegment, IonSegmentButton, useIonViewWillEnter } from '@ionic/react';
import {
  arrowForwardOutline,
  calendarOutline,
  documentTextOutline,
  timeOutline,
  chevronForwardOutline,
  chevronBackOutline,
  checkmarkDoneOutline,
  sparklesOutline,
  checkmarkCircleOutline,
} from 'ionicons/icons';
import SepiaLogo from '../../components/SepiaLogo';
import { useHistory } from 'react-router-dom';
import { useClassesStore } from '../../store/classesStore';
import { useExamsStore } from '../../store/examsStore';
import { useCalendarStore, CalendarView } from '../../store/calendarStore';
import { useStudentsStore } from '../../store/studentsStore';
import EventEditorSheet from '../../components/EventEditorSheet';
import PrepareYourDayModal from '../../components/PrepareYourDayModal';
import { CalendarEvent } from '../../types';
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

const AVATAR_COLORS = [
  '#15665E', '#1E8A7F', '#059669', '#0891B2', '#E87A1C',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const Calendar: React.FC = () => {
  const history = useHistory();
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
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showClassSelector, setShowClassSelector] = useState(false);
  const [showPrepareModal, setShowPrepareModal] = useState(false);
  
  // Week/Month navigation state
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthDate, setMonthDate] = useState(new Date());

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const pendingExams = useMemo(() => exams.filter((e) => e.status === 'assigned'), [exams]);
  const correctedExams = useMemo(() => exams.filter((e) => e.status === 'corrected'), [exams]);

  // Get week dates based on offset
  const currentWeekMonday = useMemo(() => {
    const d = new Date();
    const monday = getMonday(d);
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const currentWeekSunday = useMemo(() => getSunday(currentWeekMonday), [currentWeekMonday]);

  const loadDateRange = useCallback((startDate: Date, endDate: Date) => {
    fetchEvents(toDateStr(startDate), toDateStr(endDate));
    fetchPreparedDates(toDateStr(startDate), toDateStr(endDate));
  }, [fetchEvents, fetchPreparedDates]);

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
    if (view === 'week') {
      loadWeek();
    } else {
      loadMonth();
    }
  }, [fetchClasses, fetchExams, fetchAllStudents, loadWeek, loadMonth, view]);

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

  // Refresh data when tab becomes visible
  useIonViewWillEnter(() => {
    fetchClasses();
    fetchExams();
    fetchAllStudents();
    if (view === 'week') {
      loadWeek();
    } else {
      loadMonth();
    }
    // Update our ref to current value
    lastKnownScheduleUpdate.current = lastScheduleUpdate;
  });

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
    setEditingEvent(ev);
    setShowEventEditor(true);
  };

  const handleExamClick = (examId: string, status: string) => {
    if (status === 'assigned' || status === 'corrected') {
      history.push(`/correction/${examId}`);
    } else {
      history.push(`/tabs/exams/${examId}`);
    }
  };

  const handleNewEvent = () => {
    setEditingEvent(null);
    setShowEventEditor(true);
  };

  const handleNewExam = () => {
    if (classes.length === 0) {
      history.push('/tabs/classes');
      return;
    }
    if (classes.length === 1) {
      history.push(`/tabs/classes/${classes[0].id}/exams/new`);
    } else {
      setShowClassSelector(true);
    }
  };

  const handleClassSelect = (classId: string) => {
    setShowClassSelector(false);
    history.push(`/tabs/classes/${classId}/exams/new`);
  };

  return (
    <IonPage>
      <IonContent className="cal-content" scrollY>
        <div className="cal-banner">
          <div className="cal-banner__left">
            <SepiaLogo size={36} showText variant="white" />
          </div>
          <div className="cal-banner__right">
            <h1 className="cal-banner__greeting">{getGreeting()}</h1>
            <p className="cal-banner__date">{formatTodayDate()}</p>
          </div>
        </div>

        {/* Prepare Your Day Button */}
        <div className="cal-section">
          <button 
            className={`cal-prepare-btn ${isDayPrepared(todayStr) ? 'cal-prepare-btn--done' : ''}`}
            onClick={() => setShowPrepareModal(true)}
          >
            <div className="cal-prepare-btn__icon">
              <IonIcon icon={isDayPrepared(todayStr) ? checkmarkCircleOutline : sparklesOutline} />
            </div>
            <div className="cal-prepare-btn__content">
              <span className="cal-prepare-btn__title">
                {isDayPrepared(todayStr) ? 'Tu día está preparado' : 'Prepara tu día'}
              </span>
              <span className="cal-prepare-btn__subtitle">
                {isDayPrepared(todayStr) ? 'Toca para ver el resumen' : 'Obtén un resumen con IA de tus clases de hoy'}
              </span>
            </div>
            <IonIcon icon={chevronForwardOutline} className="cal-prepare-btn__arrow" />
          </button>
        </div>

        {pendingExams.length > 0 && (
          <div className="cal-section">
            <div 
              className="cal-pending"
              onClick={() => history.push(`/correction/${pendingExams[0].id}`)}
            >
              <div className="cal-pending__badge">{pendingExams.length}</div>
              <div className="cal-pending__content">
                <span className="cal-pending__title">
                  {pendingExams.length === 1 ? 'Examen pendiente de corregir' : 'Exámenes pendientes de corregir'}
                </span>
                <span className="cal-pending__subtitle">Toca para continuar</span>
              </div>
              <IonIcon icon={arrowForwardOutline} className="cal-pending__arrow" />
            </div>
          </div>
        )}

        <div className="cal-section">
          <div className="cal-section__header">
            <h2 className="cal-section__title">
              <IonIcon icon={calendarOutline} /> Calendario
            </h2>
          </div>

          {/* View Toggle */}
          <IonSegment 
            value={view} 
            onIonChange={(e) => handleViewChange(e.detail.value as CalendarView)}
            className="cal-view-toggle"
          >
            <IonSegmentButton value="week">
              <span>Semana</span>
            </IonSegmentButton>
            <IonSegmentButton value="month">
              <span>Mes</span>
            </IonSegmentButton>
          </IonSegment>

          {view === 'week' ? (
            <>
              {/* Week Navigation */}
              <div className="cal-week-nav">
                <button className="cal-week-nav__btn" onClick={handlePrevWeek}>
                  <IonIcon icon={chevronBackOutline} />
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
                  <IonIcon icon={chevronForwardOutline} />
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
                  <IonIcon icon={chevronBackOutline} />
                </button>
                <span className="cal-week-nav__range">
                  {MONTH_NAMES_UPPER[monthDate.getMonth()]} {monthDate.getFullYear()}
                </span>
                <button className="cal-week-nav__btn" onClick={handleNextMonth}>
                  <IonIcon icon={chevronForwardOutline} />
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
              <IonIcon icon={timeOutline} /> {formatSelectedDate()}
            </h2>
            <span className="cal-section__count">
              {selectedDayEvents.length + groupedDayExams.length} {selectedDayEvents.length + groupedDayExams.length === 1 ? 'evento' : 'eventos'}
            </span>
          </div>

          {calLoading ? (
            <div className="cal-loading"><IonSpinner name="dots" color="primary" /></div>
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
                  {selectedDayEvents.map((ev) => (
                    <div key={ev.id} className="cal-agenda-item" onClick={() => handleEventClick(ev)}>
                      <div className={`cal-agenda-item__time cal-agenda-item__time--${ev.eventType}`}>
                        {formatTime(ev.startTime) || '—'}
                      </div>
                      <div className="cal-agenda-item__content">
                        <span className="cal-agenda-item__title">{ev.title}</span>
                        {ev.className && <span className="cal-agenda-item__class">{ev.className}</span>}
                      </div>
                      <IonIcon icon={chevronForwardOutline} className="cal-agenda-item__arrow" />
                    </div>
                  ))}

                  {groupedDayExams.map((group) => {
                    const cls = classes.find((c) => c.id === group.classId);
                    return (
                      <div 
                        key={group.key} 
                        className="cal-agenda-item cal-agenda-item--exam"
                        onClick={() => handleExamClick(group.firstExamId, group.status)}
                      >
                        <div className={`cal-agenda-item__time cal-agenda-item__time--exam-${group.status}`}>
                          <IonIcon icon={documentTextOutline} />
                        </div>
                        <div className="cal-agenda-item__content">
                          <span className="cal-agenda-item__title">{group.name}</span>
                          {cls && <span className="cal-agenda-item__class">{cls.name}</span>}
                        </div>
                        <span className={`cal-agenda-item__status cal-agenda-item__status--${group.status}`}>
                          {group.status === 'assigned' ? 'Pendiente' : group.status === 'corrected' ? 'Corregido' : 'Subido'}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <div className="cal-section">
          <div className="cal-section__header">
            <h2 className="cal-section__title">Acciones rápidas</h2>
          </div>
          <div className="cal-actions">
            <button className="cal-action" onClick={handleNewExam}>
              <IonIcon icon={documentTextOutline} />
              <span>Nuevo examen</span>
            </button>
            <button className="cal-action" onClick={handleNewEvent}>
              <IonIcon icon={calendarOutline} />
              <span>Nuevo evento</span>
            </button>
          </div>
        </div>

        {correctedExams.length > 0 && (
          <div className="cal-section">
            <div className="cal-section__header">
              <h2 className="cal-section__title">Progreso del curso</h2>
            </div>
            <div className="cal-summary">
              <div className="cal-summary__item">
                <IonIcon icon={checkmarkDoneOutline} className="cal-summary__icon cal-summary__icon--success" />
                <span className="cal-summary__value">{correctedExams.length}</span>
                <span className="cal-summary__label">exámenes corregidos</span>
              </div>
            </div>
          </div>
        )}
      </IonContent>

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

      <IonModal
        isOpen={showClassSelector}
        onDidDismiss={() => setShowClassSelector(false)}
        initialBreakpoint={0.5}
        breakpoints={[0, 0.5, 0.75]}
      >
        <div className="class-selector-modal">
          <h2 className="class-selector-modal__title">Selecciona una clase</h2>
          <p className="class-selector-modal__subtitle">¿Para qué clase quieres crear el examen?</p>
          <IonList className="class-selector-modal__list">
            {classes.map((c) => (
              <IonItem 
                key={c.id} 
                button 
                onClick={() => handleClassSelect(c.id)}
                className="class-selector-modal__item"
              >
                <div 
                  className="class-selector-modal__avatar" 
                  style={{ background: avatarColor(c.name) }}
                  slot="start"
                >
                  {c.name.charAt(0)}
                </div>
                <IonLabel>
                  <h3>{c.name}</h3>
                  <p>{c.studentCount} alumnos</p>
                </IonLabel>
                <IonIcon icon={chevronForwardOutline} slot="end" />
              </IonItem>
            ))}
          </IonList>
        </div>
      </IonModal>
    </IonPage>
  );
};

export default Calendar;
