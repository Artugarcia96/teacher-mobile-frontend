import { useMemo } from 'react';
import { IonIcon } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import './WeekStrip.css';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface Props {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  onWeekChange: (startDate: string) => void;
  eventDates: Set<string>;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

const WeekStrip: React.FC<Props> = ({ selectedDate, onDateSelect, onWeekChange, eventDates }) => {
  const todayStr = toDateStr(new Date());

  const weekDays = useMemo(() => {
    const selected = new Date(selectedDate + 'T00:00:00');
    const monday = getMonday(selected);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        date: toDateStr(d),
        dayNum: d.getDate(),
        dayLabel: DAY_LABELS[i],
        isToday: toDateStr(d) === todayStr,
        isSelected: toDateStr(d) === selectedDate,
        hasEvents: eventDates.has(toDateStr(d)),
      };
    });
  }, [selectedDate, todayStr, eventDates]);

  const monthYear = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }, [selectedDate]);

  const navigateWeek = (direction: number) => {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() + direction * 7);
    const monday = getMonday(current);
    onDateSelect(toDateStr(current));
    onWeekChange(toDateStr(monday));
  };

  return (
    <div className="week-strip">
      <div className="week-strip__header">
        <button className="week-strip__nav" onClick={() => navigateWeek(-1)}>
          <IonIcon icon={chevronBackOutline} />
        </button>
        <span className="week-strip__month">{monthYear}</span>
        <button className="week-strip__nav" onClick={() => navigateWeek(1)}>
          <IonIcon icon={chevronForwardOutline} />
        </button>
      </div>
      <div className="week-strip__days">
        {weekDays.map((day) => (
          <button
            key={day.date}
            className={`week-strip__day ${day.isSelected ? 'week-strip__day--selected' : ''} ${day.isToday ? 'week-strip__day--today' : ''}`}
            onClick={() => onDateSelect(day.date)}
          >
            <span className="week-strip__day-label">{day.dayLabel}</span>
            <span className="week-strip__day-num">{day.dayNum}</span>
            {day.hasEvents && <span className="week-strip__dot" />}
          </button>
        ))}
      </div>
    </div>
  );
};

export default WeekStrip;
