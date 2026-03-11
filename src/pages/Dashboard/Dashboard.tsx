import { useEffect, useMemo, useState, useCallback } from 'react';
import { IonPage, IonContent, IonIcon, IonSpinner } from '@ionic/react';
import {
  addOutline,
  arrowForwardOutline,
  calendarOutline,
  documentTextOutline,
  peopleOutline,
  schoolOutline,
  timeOutline,
  chevronForwardOutline,
  settingsOutline,
  folderOutline,
  pencilOutline,
  checkmarkDoneOutline,
} from 'ionicons/icons';
import SepiaLogo from '../../components/SepiaLogo';
import { useHistory } from 'react-router-dom';
import { useClassesStore } from '../../store/classesStore';
import { useExamsStore } from '../../store/examsStore';
import { useCalendarStore } from '../../store/calendarStore';
import { useStudentsStore } from '../../store/studentsStore';
import { CalendarEventCard, GroupedExamCard } from '../../components/EventCard';
import ScheduleSetupSheet from '../../components/ScheduleSetupSheet';
import EventEditorSheet from '../../components/EventEditorSheet';
import { CalendarEvent } from '../../types';
import './Dashboard.css';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return '¡Buenos días!';
  if (h < 20) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
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

function formatTodayDate(): string {
  const d = new Date();
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

function formatTime(time?: string): string {
  if (!time) return '';
  return time.slice(0, 5);
}

const Dashboard: React.FC = () => {
  const history = useHistory();
  const todayStr = toDateStr(new Date());

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const exams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const allStudents = useStudentsStore((s) => s.students);

  const calEvents = useCalendarStore((s) => s.events);
  const calLoading = useCalendarStore((s) => s.loading);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);

  const [showScheduleSheet, setShowScheduleSheet] = useState(false);
  const [showEventEditor, setShowEventEditor] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const pendingExams = useMemo(() => exams.filter((e) => e.status === 'assigned'), [exams]);
  const correctedExams = useMemo(() => exams.filter((e) => e.status === 'corrected'), [exams]);

  const loadWeek = useCallback(() => {
    const d = new Date();
    const monday = getMonday(d);
    const sunday = getSunday(monday);
    fetchEvents(toDateStr(monday), toDateStr(sunday));
  }, [fetchEvents]);

  useEffect(() => {
    fetchClasses();
    fetchExams();
    loadWeek();
  }, [fetchClasses, fetchExams, loadWeek]);

  // Selected day's events
  const selectedDayEvents = useMemo(() => {
    return calEvents
      .filter((e) => e.date === selectedDate && !e.isCancelled)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [calEvents, selectedDate]);

  const selectedDayExams = useMemo(() => {
    return exams.filter((e) => e.date === selectedDate);
  }, [exams, selectedDate]);
  
  const isToday = selectedDate === todayStr;

  // This week's stats
  const weekStats = useMemo(() => {
    const d = new Date();
    const monday = getMonday(d);
    const sunday = getSunday(monday);
    const mondayStr = toDateStr(monday);
    const sundayStr = toDateStr(sunday);

    const weekExams = exams.filter(e => e.date >= mondayStr && e.date <= sundayStr);
    const weekEvents = calEvents.filter(e => e.date >= mondayStr && e.date <= sundayStr && !e.isCancelled);
    
    const classSessionsCount = weekEvents.filter(e => e.eventType === 'class_session').length;
    const customEventsCount = weekEvents.filter(e => e.eventType === 'custom').length;

    return {
      examsCount: weekExams.length,
      classSessionsCount,
      customEventsCount,
      pendingCount: pendingExams.length,
    };
  }, [exams, calEvents, pendingExams]);

  // Next 7 days mini calendar
  const next7Days = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = toDateStr(d);
      const hasEvents = calEvents.some(e => e.date === dateStr && !e.isCancelled) || exams.some(e => e.date === dateStr);
      days.push({
        date: dateStr,
        dayName: DAY_NAMES_SHORT[d.getDay()],
        dayNum: d.getDate(),
        isToday: i === 0,
        isSelected: dateStr === selectedDate,
        hasEvents,
      });
    }
    return days;
  }, [calEvents, exams, selectedDate]);

  // Group exams for display
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
  
  // Format selected date for display
  const formatSelectedDate = (): string => {
    const d = new Date(selectedDate + 'T00:00:00');
    if (selectedDate === todayStr) return 'Hoy';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selectedDate === toDateStr(tomorrow)) return 'Mañana';
    return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()}`;
  };

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

  const totalStudents = useMemo(() => {
    return allStudents.length;
  }, [allStudents]);

  return (
    <IonPage>
      <IonContent className="dash-content" scrollY>
        {/* Single-level banner: logo left, greeting right */}
        <div className="dash-banner">
          <div className="dash-banner__left">
            <SepiaLogo size={36} showText variant="white" />
          </div>
          <div className="dash-banner__right">
            <h1 className="dash-banner__greeting">{getGreeting()}</h1>
            <p className="dash-banner__date">{formatTodayDate()}</p>
          </div>
        </div>

        {/* Weekly Summary Cards */}
        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">Resumen semanal</h2>
            <button className="dash-section__link" onClick={() => history.push('/tabs/exams')}>
              Ver todo <IonIcon icon={chevronForwardOutline} />
            </button>
          </div>
          <div className="dash-stats">
            <div className="dash-stat dash-stat--exams" onClick={() => history.push('/tabs/exams')}>
              <div className="dash-stat__icon">
                <IonIcon icon={documentTextOutline} />
              </div>
              <div className="dash-stat__content">
                <span className="dash-stat__value">{weekStats.examsCount}</span>
                <span className="dash-stat__label">Exámenes</span>
              </div>
            </div>
            <div className="dash-stat dash-stat--classes" onClick={() => history.push('/tabs/classes')}>
              <div className="dash-stat__icon">
                <IonIcon icon={schoolOutline} />
              </div>
              <div className="dash-stat__content">
                <span className="dash-stat__value">{classes.length}</span>
                <span className="dash-stat__label">Clases</span>
              </div>
            </div>
            <div className="dash-stat dash-stat--students" onClick={() => history.push('/tabs/classes')}>
              <div className="dash-stat__icon">
                <IonIcon icon={peopleOutline} />
              </div>
              <div className="dash-stat__content">
                <span className="dash-stat__value">{totalStudents}</span>
                <span className="dash-stat__label">Alumnos</span>
              </div>
            </div>
            <div className="dash-stat dash-stat--sessions">
              <div className="dash-stat__icon">
                <IonIcon icon={calendarOutline} />
              </div>
              <div className="dash-stat__content">
                <span className="dash-stat__value">{weekStats.classSessionsCount}</span>
                <span className="dash-stat__label">Sesiones</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Tasks Banner */}
        {pendingExams.length > 0 && (
          <div className="dash-section">
            <div 
              className="dash-pending"
              onClick={() => history.push(`/correction/${pendingExams[0].id}`)}
            >
              <div className="dash-pending__badge">{pendingExams.length}</div>
              <div className="dash-pending__content">
                <span className="dash-pending__title">
                  {pendingExams.length === 1 ? 'Examen pendiente de corregir' : 'Exámenes pendientes de corregir'}
                </span>
                <span className="dash-pending__subtitle">Toca para continuar</span>
              </div>
              <IonIcon icon={arrowForwardOutline} className="dash-pending__arrow" />
            </div>
          </div>
        )}

        {/* Mini Week Calendar */}
        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">
              <IonIcon icon={calendarOutline} /> Esta semana
            </h2>
            <button className="dash-section__link" onClick={() => setShowScheduleSheet(true)}>
              Horario <IonIcon icon={settingsOutline} />
            </button>
          </div>
          <div className="dash-mini-cal">
            {next7Days.map((day) => (
              <button 
                key={day.date}
                onClick={() => setSelectedDate(day.date)}
                className={`dash-mini-cal__day ${day.isToday ? 'dash-mini-cal__day--today' : ''} ${day.isSelected ? 'dash-mini-cal__day--selected' : ''} ${day.hasEvents ? 'dash-mini-cal__day--has-events' : ''}`}
              >
                <span className="dash-mini-cal__name">{day.dayName}</span>
                <span className="dash-mini-cal__num">{day.dayNum}</span>
                {day.hasEvents && <span className="dash-mini-cal__dot" />}
              </button>
            ))}
          </div>
        </div>

        {/* Day's Agenda */}
        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">
              <IonIcon icon={timeOutline} /> {formatSelectedDate()}
            </h2>
            <span className="dash-section__count">
              {selectedDayEvents.length + groupedDayExams.length} {selectedDayEvents.length + groupedDayExams.length === 1 ? 'evento' : 'eventos'}
            </span>
          </div>

          {calLoading ? (
            <div className="dash-loading"><IonSpinner name="dots" color="primary" /></div>
          ) : (
            <div className="dash-agenda">
              {selectedDayEvents.length === 0 && groupedDayExams.length === 0 ? (
                <div className="dash-empty">
                  <span className="dash-empty__text">Sin eventos {isToday ? 'para hoy' : 'este día'}</span>
                  <button className="dash-empty__add" onClick={handleNewEvent}>
                    + Añadir evento
                  </button>
                </div>
              ) : (
                <>
                  {selectedDayEvents.map((ev) => (
                    <div key={ev.id} className="dash-agenda-item" onClick={() => handleEventClick(ev)}>
                      <div className={`dash-agenda-item__time dash-agenda-item__time--${ev.eventType}`}>
                        {formatTime(ev.startTime) || '—'}
                      </div>
                      <div className="dash-agenda-item__content">
                        <span className="dash-agenda-item__title">{ev.title}</span>
                        {ev.className && <span className="dash-agenda-item__class">{ev.className}</span>}
                      </div>
                      <IonIcon icon={chevronForwardOutline} className="dash-agenda-item__arrow" />
                    </div>
                  ))}

                  {groupedDayExams.map((group) => {
                    const cls = classes.find((c) => c.id === group.classId);
                    return (
                      <div 
                        key={group.key} 
                        className="dash-agenda-item dash-agenda-item--exam"
                        onClick={() => handleExamClick(group.firstExamId, group.status)}
                      >
                        <div className={`dash-agenda-item__time dash-agenda-item__time--exam-${group.status}`}>
                          <IonIcon icon={documentTextOutline} />
                        </div>
                        <div className="dash-agenda-item__content">
                          <span className="dash-agenda-item__title">{group.name}</span>
                          {cls && <span className="dash-agenda-item__class">{cls.name}</span>}
                        </div>
                        <span className={`dash-agenda-item__status dash-agenda-item__status--${group.status}`}>
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

        {/* Quick Actions */}
        <div className="dash-section">
          <div className="dash-section__header">
            <h2 className="dash-section__title">Acciones rápidas</h2>
          </div>
          <div className="dash-actions">
            <button className="dash-action" onClick={() => history.push('/tabs/exams/new')}>
              <IonIcon icon={documentTextOutline} />
              <span>Nuevo examen</span>
            </button>
            <button className="dash-action" onClick={handleNewEvent}>
              <IonIcon icon={calendarOutline} />
              <span>Nuevo evento</span>
            </button>
            <button className="dash-action" onClick={() => history.push('/tabs/materials')}>
              <IonIcon icon={folderOutline} />
              <span>Materiales</span>
            </button>
            <button className="dash-action" onClick={() => history.push('/tabs/exercises')}>
              <IonIcon icon={pencilOutline} />
              <span>Ejercicios</span>
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {correctedExams.length > 0 && (
          <div className="dash-section">
            <div className="dash-section__header">
              <h2 className="dash-section__title">Resumen del curso</h2>
            </div>
            <div className="dash-summary">
              <div className="dash-summary__item">
                <IonIcon icon={checkmarkDoneOutline} className="dash-summary__icon dash-summary__icon--success" />
                <span className="dash-summary__value">{correctedExams.length}</span>
                <span className="dash-summary__label">exámenes corregidos</span>
              </div>
            </div>
          </div>
        )}
      </IonContent>

      <ScheduleSetupSheet
        isOpen={showScheduleSheet}
        onDismiss={() => { setShowScheduleSheet(false); loadWeek(); }}
      />

      <EventEditorSheet
        isOpen={showEventEditor}
        onDismiss={() => { setShowEventEditor(false); setEditingEvent(null); loadWeek(); }}
        existingEvent={editingEvent}
        defaultDate={selectedDate}
      />
    </IonPage>
  );
};

export default Dashboard;
