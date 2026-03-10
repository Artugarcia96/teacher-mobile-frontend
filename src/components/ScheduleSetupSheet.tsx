import { useState, useMemo, useEffect } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonInput, IonSpinner,
} from '@ionic/react';
import { useClassesStore } from '../store/classesStore';
import { useCalendarStore } from '../store/calendarStore';
import './ScheduleSetupSheet.css';

const DAYS = [
  { key: 'monday', label: 'L' },
  { key: 'tuesday', label: 'M' },
  { key: 'wednesday', label: 'X' },
  { key: 'thursday', label: 'J' },
  { key: 'friday', label: 'V' },
];

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 21 && m > 0) break;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  preselectedClassId?: string;
}

const ScheduleSetupSheet: React.FC<Props> = ({ isOpen, onDismiss, preselectedClassId }) => {
  const allClasses = useClassesStore((s) => s.classes);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const generateSchedule = useCalendarStore((s) => s.generateSchedule);

  const [classId, setClassId] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 4);
    return d.toISOString().slice(0, 10);
  });
  const [generating, setGenerating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (preselectedClassId) setClassId(preselectedClassId);
    } else {
      setClassId('');
      setSelectedDays([]);
      setStartTime('09:00');
      setEndTime('10:00');
      setError('');
      setSuccess(false);
    }
  }, [isOpen, preselectedClassId]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleGenerate = async () => {
    if (!classId || selectedDays.length === 0) return;
    setGenerating(true);
    setError('');
    try {
      await generateSchedule({
        class_id: classId,
        days: selectedDays,
        start_time: startTime,
        end_time: endTime,
        start_date: startDate,
        end_date: endDate,
      });
      setSuccess(true);
      setTimeout(() => onDismiss(), 1000);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al generar horario');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={0.75}
      breakpoints={[0, 0.75, 0.95]}
    >
      <div className="sched-sheet">
        <h2 className="sched-sheet__title">Configurar horario</h2>
        <p className="sched-sheet__subtitle">Genera sesiones de clase automaticamente</p>

        {!preselectedClassId && (
          <IonItem lines="none" className="sched-field">
            <IonLabel position="stacked">Clase</IonLabel>
            <IonSelect
              value={classId}
              onIonChange={(e) => setClassId(e.detail.value)}
              interface="popover"
              placeholder="Seleccionar clase"
            >
              {classes.map((c) => (
                <IonSelectOption key={c.id} value={c.id}>
                  {c.name} — {c.subject}
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        )}

        <div className="sched-days">
          <span className="sched-days__label">Dias de clase</span>
          <div className="sched-days__row">
            {DAYS.map((d) => (
              <button
                key={d.key}
                className={`sched-days__chip ${selectedDays.includes(d.key) ? 'sched-days__chip--active' : ''}`}
                onClick={() => toggleDay(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sched-time-row">
          <IonItem lines="none" className="sched-field sched-field--half">
            <IonLabel position="stacked">Inicio</IonLabel>
            <IonSelect value={startTime} onIonChange={(e) => setStartTime(e.detail.value)} interface="popover">
              {TIME_SLOTS.map((t) => (
                <IonSelectOption key={t} value={t}>{t}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          <IonItem lines="none" className="sched-field sched-field--half">
            <IonLabel position="stacked">Fin</IonLabel>
            <IonSelect value={endTime} onIonChange={(e) => setEndTime(e.detail.value)} interface="popover">
              {TIME_SLOTS.map((t) => (
                <IonSelectOption key={t} value={t}>{t}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        </div>

        <div className="sched-time-row">
          <IonItem lines="none" className="sched-field sched-field--half">
            <IonLabel position="stacked">Desde</IonLabel>
            <IonInput
              type="date"
              value={startDate}
              onIonInput={(e) => setStartDate(e.detail.value ?? '')}
            />
          </IonItem>
          <IonItem lines="none" className="sched-field sched-field--half">
            <IonLabel position="stacked">Hasta</IonLabel>
            <IonInput
              type="date"
              value={endDate}
              onIonInput={(e) => setEndDate(e.detail.value ?? '')}
            />
          </IonItem>
        </div>

        {error && <p className="sched-error">{error}</p>}

        {success ? (
          <div className="sched-success">Horario generado</div>
        ) : (
          <IonButton
            expand="block"
            className="sched-btn"
            onClick={handleGenerate}
            disabled={generating || !classId || selectedDays.length === 0}
          >
            {generating ? <IonSpinner name="crescent" /> : 'Generar horario'}
          </IonButton>
        )}
      </div>
    </IonModal>
  );
};

export default ScheduleSetupSheet;
