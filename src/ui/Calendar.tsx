import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { addDays, dayNumber, isoDate, longDate, parseDate, weekdayShort } from '../lib/format';
import { IconButton } from './Button';
import './calendar.css';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface WeekStripProps {
  /** Monday of the visible week. */
  monday: string;
  selected: string;
  today: string;
  /** Days (ISO) that get a small dot (e.g. with classes). */
  marked?: Set<string>;
  onSelect: (iso: string) => void;
  onWeek: (delta: -1 | 1) => void;
}

/** Monday–Friday strip with previous/next week arrows. The selected day is ink-filled. */
export function WeekStrip({ monday, selected, today, marked, onSelect, onWeek }: WeekStripProps) {
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  return (
    <div className="weekstrip" role="group" aria-label="Semana">
      <IconButton label="Semana anterior" size="sm" onClick={() => onWeek(-1)}><CaretLeft size={18} /></IconButton>
      <div className="weekstrip__days">
        {days.map((d) => (
          <button key={d} type="button" aria-pressed={d === selected} aria-label={longDate(d)}
            className={`weekstrip__day${d === today ? ' weekstrip__day--today' : ''}`} onClick={() => onSelect(d)}>
            <span className="weekstrip__wd">{weekdayShort(d)}</span>
            <span className="weekstrip__n num">{dayNumber(d)}</span>
            <i className={`weekstrip__dot${marked?.has(d) ? ' weekstrip__dot--on' : ''}`} />
          </button>
        ))}
      </div>
      <IconButton label="Semana siguiente" size="sm" onClick={() => onWeek(1)}><CaretRight size={18} /></IconButton>
    </div>
  );
}

interface MonthGridProps {
  /** Any ISO date inside the month to show. */
  month: string;
  selected: string;
  today: string;
  /** Days shown faded (holidays, no classes). */
  muted?: Set<string>;
  marked?: Set<string>;
  onSelect: (iso: string) => void;
  onMonth: (delta: -1 | 1) => void;
}

/** Compact month grid (Monday first) to jump to a date. */
export function MonthGrid({ month, selected, today, muted, marked, onSelect, onMonth }: MonthGridProps) {
  const first = parseDate(month);
  first.setDate(1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= total; d++) cells.push(isoDate(new Date(first.getFullYear(), first.getMonth(), d)));
  return (
    <div className="monthgrid">
      <div className="monthgrid__head">
        <IconButton label="Mes anterior" size="sm" onClick={() => onMonth(-1)}><CaretLeft size={18} /></IconButton>
        <span className="monthgrid__title">{MONTHS[first.getMonth()]} {first.getFullYear()}</span>
        <IconButton label="Mes siguiente" size="sm" onClick={() => onMonth(1)}><CaretRight size={18} /></IconButton>
      </div>
      <div className="monthgrid__grid">
        {HEAD.map((h) => <span key={h} className="monthgrid__wd">{h}</span>)}
        {cells.map((d, i) => d ? (
          <button key={d} type="button" aria-pressed={d === selected} aria-label={longDate(d)}
            className={['monthgrid__day num', d === today && 'monthgrid__day--today', muted?.has(d) && 'monthgrid__day--muted'].filter(Boolean).join(' ')}
            onClick={() => onSelect(d)}>
            {dayNumber(d)}
            {marked?.has(d) && <i className="monthgrid__dot" />}
          </button>
        ) : <span key={`e${i}`} />)}
      </div>
    </div>
  );
}
