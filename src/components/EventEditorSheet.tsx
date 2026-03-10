import { useState, useEffect, useMemo } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonInput, IonTextarea, IonSpinner,
} from '@ionic/react';
import { CalendarEvent } from '../types';
import { useClassesStore } from '../store/classesStore';
import { useCalendarStore } from '../store/calendarStore';
import './EventEditorSheet.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  existingEvent?: CalendarEvent | null;
  defaultDate?: string;
}

const EventEditorSheet: React.FC<Props> = ({ isOpen, onDismiss, existingEvent, defaultDate }) => {
  const allClasses = useClassesStore((s) => s.classes);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);
  const createEvent = useCalendarStore((s) => s.createEvent);
  const updateEvent = useCalendarStore((s) => s.updateEvent);
  const deleteEvent = useCalendarStore((s) => s.deleteEvent);

  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventType, setEventType] = useState<'class_session' | 'custom'>('custom');
  const [classId, setClassId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (existingEvent) {
        setTitle(existingEvent.title);
        setEventDate(existingEvent.date);
        setStartTime(existingEvent.startTime || '');
        setEndTime(existingEvent.endTime || '');
        setEventType(existingEvent.eventType);
        setClassId(existingEvent.classId || '');
        setNotes(existingEvent.notes || '');
      } else {
        setTitle('');
        setEventDate(defaultDate || new Date().toISOString().slice(0, 10));
        setStartTime('');
        setEndTime('');
        setEventType('custom');
        setClassId('');
        setNotes('');
      }
    }
  }, [isOpen, existingEvent, defaultDate]);

  const handleClassChange = (id: string) => {
    setClassId(id);
    if (id) {
      const cls = classes.find((c) => c.id === id);
      if (cls && !title) {
        setTitle(`${cls.name} — ${cls.subject}`);
      }
      setEventType('class_session');
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !eventDate) return;
    setSaving(true);
    try {
      if (existingEvent) {
        await updateEvent(existingEvent.id, {
          title: title.trim(),
          event_date: eventDate,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          notes: notes || undefined,
        });
      } else {
        await createEvent({
          class_id: classId || undefined,
          title: title.trim(),
          event_date: eventDate,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          event_type: eventType,
          notes: notes || undefined,
        });
      }
      onDismiss();
    } catch (err) {
      console.error('Failed to save event:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingEvent) return;
    setSaving(true);
    try {
      await deleteEvent(existingEvent.id);
      onDismiss();
    } catch (err) {
      console.error('Failed to delete event:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!existingEvent) return;
    setSaving(true);
    try {
      await updateEvent(existingEvent.id, { is_cancelled: !existingEvent.isCancelled });
      onDismiss();
    } catch (err) {
      console.error('Failed to toggle cancel:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={0.7}
      breakpoints={[0, 0.7, 0.95]}
    >
      <div className="ev-editor">
        <h2 className="ev-editor__title">
          {existingEvent ? 'Editar evento' : 'Nuevo evento'}
        </h2>

        <IonItem lines="none" className="ev-editor__field">
          <IonInput
            value={title}
            onIonInput={(e) => setTitle(e.detail.value ?? '')}
            placeholder="Título del evento"
            label="Título"
            labelPlacement="stacked"
          />
        </IonItem>

        {!existingEvent && (
          <IonItem lines="none" className="ev-editor__field">
            <IonLabel position="stacked">Clase (opcional)</IonLabel>
            <IonSelect
              value={classId}
              onIonChange={(e) => handleClassChange(e.detail.value)}
              interface="popover"
              placeholder="Sin clase"
            >
              <IonSelectOption value="">Sin clase</IonSelectOption>
              {classes.map((c) => (
                <IonSelectOption key={c.id} value={c.id}>
                  {c.name} — {c.subject}
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
        )}

        <IonItem lines="none" className="ev-editor__field">
          <IonInput
            type="date"
            value={eventDate}
            onIonInput={(e) => setEventDate(e.detail.value ?? '')}
            label="Fecha"
            labelPlacement="stacked"
          />
        </IonItem>

        <div className="ev-editor__row">
          <IonItem lines="none" className="ev-editor__field ev-editor__field--half">
            <IonInput
              type="time"
              value={startTime}
              onIonInput={(e) => setStartTime(e.detail.value ?? '')}
              label="Inicio"
              labelPlacement="stacked"
            />
          </IonItem>
          <IonItem lines="none" className="ev-editor__field ev-editor__field--half">
            <IonInput
              type="time"
              value={endTime}
              onIonInput={(e) => setEndTime(e.detail.value ?? '')}
              label="Fin"
              labelPlacement="stacked"
            />
          </IonItem>
        </div>

        <IonItem lines="none" className="ev-editor__field">
          <IonTextarea
            value={notes}
            onIonInput={(e) => setNotes(e.detail.value ?? '')}
            placeholder="Notas (opcional)"
            rows={2}
          />
        </IonItem>

        <IonButton
          expand="block"
          className="ev-editor__save"
          onClick={handleSave}
          disabled={saving || !title.trim() || !eventDate}
        >
          {saving ? <IonSpinner name="crescent" /> : 'Guardar'}
        </IonButton>

        {existingEvent && (
          <div className="ev-editor__actions">
            <IonButton
              fill="outline"
              color="medium"
              size="small"
              onClick={handleCancel}
              disabled={saving}
            >
              {existingEvent.isCancelled ? 'Reactivar' : 'Cancelar sesión'}
            </IonButton>
            <IonButton
              fill="outline"
              color="danger"
              size="small"
              onClick={handleDelete}
              disabled={saving}
            >
              Eliminar
            </IonButton>
          </div>
        )}
      </div>
    </IonModal>
  );
};

export default EventEditorSheet;
