import { useMemo } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import './MonthGrid.css';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface Props {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  onMonthChange: (startDate: string, endDate: string) => void;
  eventDates: Set<string>;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getFirstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getLastOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

const MonthGrid: React.FC<Props> = ({ selectedDate, onDateSelect, onMonthChange, eventDates }) => {
  const todayStr = toDateStr(new Date());

  const currentMonth = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [selectedDate]);

  const monthDays = useMemo(() => {
    const firstDay = new Date(currentMonth.year, currentMonth.month, 1);
    const lastDay = getLastOfMonth(firstDay);
    
    // Get day of week for first day (0 = Sunday, we want Monday = 0)
    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    const days: Array<{
      date: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      hasEvents: boolean;
    }> = [];
    
    // Previous month days
    const prevMonthLast = new Date(currentMonth.year, currentMonth.month, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(prevMonthLast);
      d.setDate(prevMonthLast.getDate() - i);
      const dateStr = toDateStr(d);
      days.push({
        date: dateStr,
        dayNum: d.getDate(),
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents: eventDates.has(dateStr),
      });
    }
    
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(currentMonth.year, currentMonth.month, i);
      const dateStr = toDateStr(d);
      days.push({
        date: dateStr,
        dayNum: i,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents: eventDates.has(dateStr),
      });
    }
    
    // Next month days to fill the grid (6 rows * 7 days = 42)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(currentMonth.year, currentMonth.month + 1, i);
      const dateStr = toDateStr(d);
      days.push({
        date: dateStr,
        dayNum: i,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        hasEvents: eventDates.has(dateStr),
      });
    }
    
    return days;
  }, [currentMonth, selectedDate, todayStr, eventDates]);

  const monthYear = `${MONTH_NAMES[currentMonth.month]} ${currentMonth.year}`;

  const navigateMonth = (direction: number) => {
    const newMonth = new Date(currentMonth.year, currentMonth.month + direction, 1);
    const firstDay = getFirstOfMonth(newMonth);
    const lastDay = getLastOfMonth(newMonth);
    onDateSelect(toDateStr(firstDay));
    onMonthChange(toDateStr(firstDay), toDateStr(lastDay));
  };

  const handleDateClick = (date: string) => {
    onDateSelect(date);
  };

  return (
    <div className="month-grid">
      <div className="month-grid__header">
        <button className="month-grid__nav" onClick={() => navigateMonth(-1)}>
          <IonIcon icon={chevronBackOutline} />
        </button>
        <span className="month-grid__title">{monthYear}</span>
        <button className="month-grid__nav" onClick={() => navigateMonth(1)}>
          <IonIcon icon={chevronForwardOutline} />
        </button>
      </div>
      
      <div className="month-grid__day-labels">
        {DAY_LABELS.map((label, i) => (
          <span key={i} className="month-grid__day-label">{label}</span>
        ))}
      </div>
      
      <div className="month-grid__days">
        {monthDays.map((day, i) => (
          <button
            key={i}
            className={`month-grid__day 
              ${day.isCurrentMonth ? '' : 'month-grid__day--other'} 
              ${day.isSelected ? 'month-grid__day--selected' : ''} 
              ${day.isToday ? 'month-grid__day--today' : ''}`}
            onClick={() => handleDateClick(day.date)}
          >
            <span className="month-grid__day-num">{day.dayNum}</span>
            {day.hasEvents && <span className="month-grid__dot" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MonthGrid;
