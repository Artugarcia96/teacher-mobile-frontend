import './ViewToggle.css';

export type ViewMode = 'day' | 'week' | 'month';

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const ViewToggle: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div className="view-toggle">
      <button
        className={`view-toggle__btn ${value === 'day' ? 'view-toggle__btn--active' : ''}`}
        onClick={() => onChange('day')}
      >
        Día
      </button>
      <button
        className={`view-toggle__btn ${value === 'week' ? 'view-toggle__btn--active' : ''}`}
        onClick={() => onChange('week')}
      >
        Semana
      </button>
      <button
        className={`view-toggle__btn ${value === 'month' ? 'view-toggle__btn--active' : ''}`}
        onClick={() => onChange('month')}
      >
        Mes
      </button>
    </div>
  );
};

export default ViewToggle;
