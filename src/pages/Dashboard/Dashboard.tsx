import { useEffect, useMemo, useState, useCallback } from 'react';
import { IonPage, IonContent, IonIcon, IonFab, IonFabButton, IonFabList, IonSpinner } from '@ionic/react';
import {
  addOutline,
  arrowForwardOutline,
  calendarOutline,
  createOutline,
  trashOutline,
} from 'ionicons/icons';
import SepiaLogo from '../../components/SepiaLogo';
import { useHistory } from 'react-router-dom';
import { useClassesStore } from '../../store/classesStore';
import { useExamsStore } from '../../store/examsStore';
import { useCalendarStore } from '../../store/calendarStore';
import WeekStrip from '../../components/WeekStrip';
import MonthGrid from '../../components/MonthGrid';
import ViewToggle, { ViewMode } from '../../components/ViewToggle';
import { CalendarEventCard, GroupedExamCard } from '../../components/EventCard';
import ScheduleSetupSheet from '../../components/ScheduleSetupSheet';
import EventEditorSheet from '../../components/EventEditorSheet';
import { CalendarEvent } from '../../types';
import './Dashboard.css';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
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

function getFirstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getLastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = toDateStr(new Date());
  const dayName = DAY_NAMES[d.getDay()];
  const monthName = MONTH_NAMES_SHORT[d.getMonth()];

  if (dateStr === today) return `Hoy — ${dayName} ${d.getDate()} ${monthName}`;
  return `${dayName} ${d.getDate()} ${monthName}`;
}

const Dashboard: React.FC = () => {
  const history = useHistory();
  const todayStr = toDateStr(new Date());

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const exams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const calEvents = useCalendarStore((s) => s.events);
  const calLoading = useCalendarStore((s) => s.loading);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);
  const bulkDelete = useCalendarStore((s) => s.bulkDelete);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);
  const [showEventEditor, setShowEventEditor] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkAction, setShowBulkAction] = useState(false);

  // Class filter for when there are many events
  const [selectedClassFilter, setSelectedClassFilter] = useState<string | null>(null);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const pendingExams = useMemo(() => exams.filter((e) => e.status === 'assigned'), [exams]);

  const loadWeek = useCallback((dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const monday = getMonday(d);
    const sunday = getSunday(monday);
    fetchEvents(toDateStr(monday), toDateStr(sunday));
  }, [fetchEvents]);

  const loadMonth = useCallback((dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const firstDay = getFirstOfMonth(d);
    const lastDay = getLastOfMonth(d);
    // Load extra days for prev/next month visible in grid
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + 7);
    fetchEvents(toDateStr(startDate), toDateStr(endDate));
  }, [fetchEvents]);

  const loadDateRange = useCallback((dateStr: string, mode: ViewMode) => {
    if (mode === 'month') {
      loadMonth(dateStr);
    } else {
      loadWeek(dateStr);
    }
  }, [loadWeek, loadMonth]);

  useEffect(() => {
    fetchClasses();
    fetchExams();
    loadDateRange(todayStr, viewMode);
  }, [fetchClasses, fetchExams, loadDateRange, todayStr, viewMode]);

  const eventDates = useMemo(() => {
    const dates = new Set<string>();
    calEvents.forEach((e) => dates.add(e.date));
    exams.forEach((e) => dates.add(e.date));
    return dates;
  }, [calEvents, exams]);

  const dayEvents = useMemo(() => {
    let filtered = calEvents.filter((e) => e.date === selectedDate);
    if (selectedClassFilter) {
      filtered = filtered.filter((e) => e.classId === selectedClassFilter);
    }
    return filtered;
  }, [calEvents, selectedDate, selectedClassFilter]);

  const dayExams = useMemo(() => {
    let filtered = exams.filter((e) => e.date === selectedDate);
    if (selectedClassFilter) {
      filtered = filtered.filter((e) => e.classId === selectedClassFilter);
    }
    return filtered;
  }, [exams, selectedDate, selectedClassFilter]);

  // Get unique classes that have events on the selected day (for filter chips)
  const classesWithEventsToday = useMemo(() => {
    const classIds = new Set<string>();
    calEvents.filter((e) => e.date === selectedDate).forEach((e) => {
      if (e.classId) classIds.add(e.classId);
    });
    exams.filter((e) => e.date === selectedDate).forEach((e) => {
      classIds.add(e.classId);
    });
    return classes.filter((c) => classIds.has(c.id));
  }, [calEvents, exams, selectedDate, classes]);

  // Group exams by name for cleaner display (instead of showing one card per student)
  const groupedDayExams = useMemo(() => {
    const groups = new Map<string, typeof dayExams>();
    dayExams.forEach((exam) => {
      const key = `${exam.name}-${exam.classId}-${exam.status}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(exam);
    });
    return Array.from(groups.entries()).map(([key, examsInGroup]) => ({
      key,
      name: examsInGroup[0].name,
      classId: examsInGroup[0].classId,
      status: examsInGroup[0].status,
      exams: examsInGroup,
      count: examsInGroup.length,
      firstExamId: examsInGroup[0].id,
    }));
  }, [dayExams]);

  // Week view: group events by date
  const weekEventsByDate = useMemo(() => {
    if (viewMode !== 'week') return new Map<string, CalendarEvent[]>();
    const d = new Date(selectedDate + 'T00:00:00');
    const monday = getMonday(d);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      dates.push(toDateStr(day));
    }
    const grouped = new Map<string, CalendarEvent[]>();
    dates.forEach(date => {
      const events = calEvents.filter(e => e.date === date);
      if (events.length > 0) {
        grouped.set(date, events);
      }
    });
    return grouped;
  }, [calEvents, selectedDate, viewMode]);

  const weekExamsByDate = useMemo(() => {
    if (viewMode !== 'week') return new Map<string, typeof exams>();
    const d = new Date(selectedDate + 'T00:00:00');
    const monday = getMonday(d);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      dates.push(toDateStr(day));
    }
    const grouped = new Map<string, typeof exams>();
    dates.forEach(date => {
      const dayExams = exams.filter(e => e.date === date);
      if (dayExams.length > 0) {
        grouped.set(date, dayExams);
      }
    });
    return grouped;
  }, [exams, selectedDate, viewMode]);

  // Grouped exams for week view (by name+class+status)
  const groupExamsForDisplay = (examsList: typeof exams) => {
    const groups = new Map<string, typeof exams>();
    examsList.forEach((exam) => {
      const key = `${exam.name}-${exam.classId}-${exam.status}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(exam);
    });
    return Array.from(groups.entries()).map(([key, examsInGroup]) => ({
      key,
      name: examsInGroup[0].name,
      classId: examsInGroup[0].classId,
      status: examsInGroup[0].status,
      exams: examsInGroup,
      count: examsInGroup.length,
      firstExamId: examsInGroup[0].id,
    }));
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleWeekChange = (startDate: string) => {
    const monday = new Date(startDate + 'T00:00:00');
    const sunday = getSunday(monday);
    fetchEvents(toDateStr(monday), toDateStr(sunday));
  };

  const handleMonthChange = (startDate: string, endDate: string) => {
    // Load extra days for grid visibility
    const start = new Date(startDate + 'T00:00:00');
    start.setDate(start.getDate() - 7);
    const end = new Date(endDate + 'T00:00:00');
    end.setDate(end.getDate() + 7);
    fetchEvents(toDateStr(start), toDateStr(end));
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setSelectMode(false);
    setSelectedIds(new Set());
    loadDateRange(selectedDate, mode);
  };

  const handleEventClick = (ev: CalendarEvent) => {
    if (selectMode) {
      toggleSelect(ev.id);
    } else {
      setEditingEvent(ev);
      setShowEventEditor(true);
    }
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

  // Bulk selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLongPress = (id: string) => {
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    await bulkDelete(Array.from(selectedIds));
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };


  const hasAnyEvents = dayEvents.length > 0 || groupedDayExams.length > 0;
  const hasAnyWeekEvents = weekEventsByDate.size > 0 || weekExamsByDate.size > 0;

  return (
    <IonPage>
      <IonContent className="cal-content" scrollY>
        {/* Branded Header */}
        <div className="sepia-header">
          <div className="sepia-header__brand">
            <SepiaLogo size={48} showText variant="white" />
          </div>
        </div>

        {/* Greeting + View Toggle */}
        <div className="cal-greeting">
          <h1 className="cal-greeting__title">{getGreeting()}</h1>
          <div className="cal-view-toggle-wrapper">
            <ViewToggle value={viewMode} onChange={handleViewModeChange} />
          </div>
        </div>

        {/* Week strip (for day and week views) */}
        {(viewMode === 'day' || viewMode === 'week') && (
          <WeekStrip
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            onWeekChange={handleWeekChange}
            eventDates={eventDates}
          />
        )}

        {/* Month grid */}
        {viewMode === 'month' && (
          <MonthGrid
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            onMonthChange={handleMonthChange}
            eventDates={eventDates}
          />
        )}

        <div className="cal-body">
          {/* Pending corrections banner */}
          {pendingExams.length > 0 && !selectMode && (
            <div
              className="cal-pending"
              onClick={() => history.push(`/correction/${pendingExams[0].id}`)}
            >
              <div className="cal-pending__left">
                <span className="cal-pending__count">{pendingExams.length}</span>
                <span className="cal-pending__text">
                  {pendingExams.length === 1 ? 'examen pendiente' : 'exámenes pendientes'}
                </span>
              </div>
              <IonIcon icon={arrowForwardOutline} className="cal-pending__arrow" />
            </div>
          )}

          {/* Select mode header */}
          {selectMode && (
            <div className="cal-select-bar">
              <button className="cal-select-bar__cancel" onClick={exitSelectMode}>Cancelar</button>
              <span className="cal-select-bar__count">{selectedIds.size} seleccionados</span>
              <button
                className="cal-select-bar__action"
                onClick={handleBulkDelete}
                disabled={selectedIds.size === 0}
              >
                <IonIcon icon={trashOutline} />
              </button>
            </div>
          )}

          {/* Loading */}
          {calLoading && (
            <div className="cal-loading"><IonSpinner color="primary" /></div>
          )}

          {/* Day view events */}
          {!calLoading && (viewMode === 'day' || viewMode === 'month') && (
            <>
              <div className="cal-day-header">
                <span className="cal-day-header__text">{formatDayHeader(selectedDate)}</span>
              </div>

              {/* Class filter chips (only show if 2+ classes have events) */}
              {classesWithEventsToday.length > 1 && (
                <div className="cal-class-filter">
                  <button
                    className={`cal-class-chip ${!selectedClassFilter ? 'cal-class-chip--active' : ''}`}
                    onClick={() => setSelectedClassFilter(null)}
                  >
                    Todas
                  </button>
                  {classesWithEventsToday.map((cls) => (
                    <button
                      key={cls.id}
                      className={`cal-class-chip ${selectedClassFilter === cls.id ? 'cal-class-chip--active' : ''}`}
                      onClick={() => setSelectedClassFilter(cls.id)}
                    >
                      {cls.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="cal-events">
                {dayEvents.map((ev) => (
                  <div
                    key={ev.id}
                    onContextMenu={(e) => { e.preventDefault(); handleLongPress(ev.id); }}
                  >
                    <CalendarEventCard
                      event={ev}
                      onClick={() => handleEventClick(ev)}
                      selectable={selectMode}
                      selected={selectedIds.has(ev.id)}
                      onToggleSelect={() => toggleSelect(ev.id)}
                    />
                  </div>
                ))}

                {groupedDayExams.map((group) => {
                  const cls = classes.find((c) => c.id === group.classId);
                  return (
                    <GroupedExamCard
                      key={group.key}
                      name={group.name}
                      className={cls?.name}
                      status={group.status}
                      count={group.count}
                      onClick={() => handleExamClick(group.firstExamId, group.status)}
                    />
                  );
                })}

                {!hasAnyEvents && (
                  <div className="cal-empty">
                    <span className="cal-empty__icon">📅</span>
                    <p className="cal-empty__text">Sin eventos este día</p>
                    <button className="cal-empty__add" onClick={handleNewEvent}>
                      Añadir evento
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Week view events */}
          {!calLoading && viewMode === 'week' && (
            <div className="cal-week-view">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(selectedDate + 'T00:00:00');
                const monday = getMonday(d);
                const day = new Date(monday);
                day.setDate(monday.getDate() + i);
                const dateStr = toDateStr(day);
                const events = weekEventsByDate.get(dateStr) || [];
                const dayExamsForDate = weekExamsByDate.get(dateStr) || [];
                const hasEvents = events.length > 0 || dayExamsForDate.length > 0;
                
                return (
                  <div key={dateStr} className="cal-week-day">
                    <div 
                      className={`cal-week-day__header ${dateStr === selectedDate ? 'cal-week-day__header--selected' : ''}`}
                      onClick={() => handleDateSelect(dateStr)}
                    >
                      <span className="cal-week-day__header-text">{formatDayHeader(dateStr)}</span>
                    </div>
                    {hasEvents && (
                      <div className="cal-week-day__events">
                        {events.map((ev) => (
                          <div
                            key={ev.id}
                            onContextMenu={(e) => { e.preventDefault(); handleLongPress(ev.id); }}
                          >
                            <CalendarEventCard
                              event={ev}
                              onClick={() => handleEventClick(ev)}
                              selectable={selectMode}
                              selected={selectedIds.has(ev.id)}
                              onToggleSelect={() => toggleSelect(ev.id)}
                              compact
                            />
                          </div>
                        ))}
                        {groupExamsForDisplay(dayExamsForDate).map((group) => {
                          const cls = classes.find((c) => c.id === group.classId);
                          return (
                            <GroupedExamCard
                              key={group.key}
                              name={group.name}
                              className={cls?.name}
                              status={group.status}
                              count={group.count}
                              onClick={() => handleExamClick(group.firstExamId, group.status)}
                              compact
                            />
                          );
                        })}
                      </div>
                    )}
                    {!hasEvents && (
                      <div className="cal-week-day__empty">—</div>
                    )}
                  </div>
                );
              })}
              {!hasAnyWeekEvents && (
                <div className="cal-empty">
                  <span className="cal-empty__icon">📅</span>
                  <p className="cal-empty__text">Sin eventos esta semana</p>
                  <button className="cal-empty__add" onClick={handleNewEvent}>
                    Añadir evento
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FAB */}
        {!selectMode && (
          <IonFab vertical="bottom" horizontal="end" slot="fixed" className="cal-fab">
            <IonFabButton>
              <IonIcon icon={addOutline} />
            </IonFabButton>
            <IonFabList side="top">
              <IonFabButton onClick={handleNewEvent} title="Evento">
                <IonIcon icon={createOutline} />
              </IonFabButton>
              <IonFabButton onClick={() => setShowScheduleSheet(true)} title="Horario">
                <IonIcon icon={calendarOutline} />
              </IonFabButton>
            </IonFabList>
          </IonFab>
        )}
      </IonContent>

      <ScheduleSetupSheet
        isOpen={showScheduleSheet}
        onDismiss={() => { setShowScheduleSheet(false); loadDateRange(selectedDate, viewMode); }}
      />

      <EventEditorSheet
        isOpen={showEventEditor}
        onDismiss={() => { setShowEventEditor(false); setEditingEvent(null); loadDateRange(selectedDate, viewMode); }}
        existingEvent={editingEvent}
        defaultDate={selectedDate}
      />
    </IonPage>
  );
};

export default Dashboard;
