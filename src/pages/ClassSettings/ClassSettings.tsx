import { useState, useEffect, useMemo } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonList, IonItem, IonLabel, IonInput, IonModal, IonSelect,
  IonSelectOption, IonSpinner, IonAlert, IonItemSliding, IonItemOptions, IonItemOption,
} from '@ionic/react';
import { addOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { classes as classesApi, lectures as lecturesApi } from '../../services/api';
import { Lecture, ScheduleSlot } from '../../types';
import './ClassSettings.css';

const WEEK_DAYS = [
  { key: 'monday', label: 'Lunes', short: 'L' },
  { key: 'tuesday', label: 'Martes', short: 'M' },
  { key: 'wednesday', label: 'Miércoles', short: 'X' },
  { key: 'thursday', label: 'Jueves', short: 'J' },
  { key: 'friday', label: 'Viernes', short: 'V' },
];

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 30]) {
      if (h === 21 && m > 0) break;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function formatSchedule(schedule: ScheduleSlot[]): string {
  if (!schedule || schedule.length === 0) return 'Horario pendiente';
  return schedule.map(slot => {
    const day = WEEK_DAYS.find(d => d.key === slot.day);
    return `${day?.short || slot.day} ${slot.start_time}-${slot.end_time}`;
  }).join(', ');
}

interface ClassDetail {
  id: string;
  name: string;
  year: string;
  lectures: Lecture[];
}

const ClassSettings: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const history = useHistory();

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [showLectureModal, setShowLectureModal] = useState(false);
  const [editingLecture, setEditingLecture] = useState<Lecture | null>(null);
  const [lectureName, setLectureName] = useState('');
  const [lectureSchedule, setLectureSchedule] = useState<ScheduleSlot[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const loadClass = async () => {
    setLoading(true);
    try {
      const res = await classesApi.get(classId);
      setClassData({
        id: res.data.id,
        name: res.data.name,
        year: res.data.year,
        lectures: (res.data.lectures || []).map((l: any) => ({
          id: l.id,
          classId: l.class_id,
          name: l.name,
          schedule: l.schedule || [],
        })),
      });
    } catch (err) {
      console.error('Failed to load class:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClass();
  }, [classId]);

  const openNewLecture = () => {
    setEditingLecture(null);
    setLectureName('');
    setLectureSchedule([]);
    setShowLectureModal(true);
  };

  const openEditLecture = (lecture: Lecture) => {
    setEditingLecture(lecture);
    setLectureName(lecture.name);
    setLectureSchedule([...lecture.schedule]);
    setShowLectureModal(true);
  };

  const addScheduleSlot = () => {
    setLectureSchedule(prev => [...prev, { day: 'monday', start_time: '09:00', end_time: '10:00' }]);
  };

  const updateScheduleSlot = (index: number, field: keyof ScheduleSlot, value: string) => {
    setLectureSchedule(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeScheduleSlot = (index: number) => {
    setLectureSchedule(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveLecture = async () => {
    if (!lectureName.trim()) return;
    setSaving(true);
    try {
      if (editingLecture) {
        await lecturesApi.update(classId, editingLecture.id, {
          name: lectureName.trim(),
          schedule: lectureSchedule,
        });
      } else {
        await lecturesApi.create(classId, {
          name: lectureName.trim(),
          schedule: lectureSchedule,
        });
      }
      await loadClass();
      setShowLectureModal(false);
    } catch (err) {
      console.error('Failed to save lecture:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLecture = async () => {
    if (!deleteTarget) return;
    try {
      await lecturesApi.delete(classId, deleteTarget.id);
      await loadClass();
    } catch (err) {
      console.error('Failed to delete lecture:', err);
    }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start">
              <IonBackButton defaultHref="/tabs/classes" />
            </IonButtons>
            <IonTitle>Configuración</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <div className="settings-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/tabs/classes/${classId}`} />
          </IonButtons>
          <IonTitle>{classData?.name || 'Clase'}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="settings-content">
        {/* Class Info */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Información</h2>
          </div>
          <div className="settings-info-card">
            <div className="settings-info-row">
              <span className="settings-info-label">Nombre</span>
              <span className="settings-info-value">{classData?.name}</span>
            </div>
            <div className="settings-info-row">
              <span className="settings-info-label">Curso</span>
              <span className="settings-info-value">{classData?.year}</span>
            </div>
          </div>
        </div>

        {/* Lectures */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Asignaturas</h2>
            <IonButton fill="clear" size="small" onClick={openNewLecture}>
              <IonIcon icon={addOutline} slot="start" />
              Añadir
            </IonButton>
          </div>

          {classData?.lectures && classData.lectures.length > 0 ? (
            <div className="settings-lectures">
              {classData.lectures.map(lecture => (
                <IonItemSliding key={lecture.id}>
                  <div
                    className="lecture-card"
                    onClick={() => openEditLecture(lecture)}
                  >
                    <div className="lecture-card__main">
                      <span className="lecture-card__name">{lecture.name}</span>
                      <span className="lecture-card__schedule">
                        <IonIcon icon={timeOutline} />
                        {formatSchedule(lecture.schedule)}
                      </span>
                    </div>
                  </div>
                  <IonItemOptions side="end">
                    <IonItemOption
                      color="danger"
                      onClick={() => setDeleteTarget({ id: lecture.id, name: lecture.name })}
                    >
                      Eliminar
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              ))}
            </div>
          ) : (
            <div className="settings-empty">
              <p>No hay asignaturas configuradas</p>
              <IonButton fill="outline" size="small" onClick={openNewLecture}>
                <IonIcon icon={addOutline} slot="start" />
                Añadir asignatura
              </IonButton>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Acciones</h2>
          </div>
          <div className="settings-actions">
            <IonButton
              expand="block"
              fill="outline"
              onClick={() => history.push(`/tabs/classes/${classId}`)}
            >
              Ver notas y alumnos
            </IonButton>
            <IonButton
              expand="block"
              fill="outline"
              onClick={() => history.push(`/tabs/classes/${classId}/topics`)}
            >
              Ver temario
            </IonButton>
          </div>
        </div>
      </IonContent>

      {/* Lecture Modal */}
      <IonModal
        isOpen={showLectureModal}
        onDidDismiss={() => setShowLectureModal(false)}
        initialBreakpoint={0.75}
        breakpoints={[0, 0.5, 0.75, 1]}
      >
        <div className="modal-sheet modal-sheet--scrollable">
          <h2 className="modal-sheet__title">
            {editingLecture ? 'Editar asignatura' : 'Nueva asignatura'}
          </h2>

          <IonList>
            <IonItem>
              <IonLabel position="stacked">Nombre de la asignatura</IonLabel>
              <IonInput
                value={lectureName}
                onIonInput={(e) => setLectureName(e.detail.value || '')}
                placeholder="ej. Matemáticas"
              />
            </IonItem>
          </IonList>

          <div className="schedule-section">
            <div className="schedule-section__header">
              <h3>Horario semanal</h3>
              <IonButton fill="clear" size="small" onClick={addScheduleSlot}>
                <IonIcon icon={addOutline} slot="start" />
                Añadir
              </IonButton>
            </div>

            {lectureSchedule.length === 0 ? (
              <p className="schedule-empty">Sin horario configurado</p>
            ) : (
              <div className="schedule-slots">
                {lectureSchedule.map((slot, index) => (
                  <div key={index} className="schedule-slot">
                    <IonSelect
                      value={slot.day}
                      onIonChange={(e) => updateScheduleSlot(index, 'day', e.detail.value)}
                      interface="popover"
                      className="schedule-slot__day"
                    >
                      {WEEK_DAYS.map(d => (
                        <IonSelectOption key={d.key} value={d.key}>{d.label}</IonSelectOption>
                      ))}
                    </IonSelect>
                    <IonSelect
                      value={slot.start_time}
                      onIonChange={(e) => updateScheduleSlot(index, 'start_time', e.detail.value)}
                      interface="popover"
                      className="schedule-slot__time"
                    >
                      {TIME_SLOTS.map(t => (
                        <IonSelectOption key={t} value={t}>{t}</IonSelectOption>
                      ))}
                    </IonSelect>
                    <span className="schedule-slot__separator">-</span>
                    <IonSelect
                      value={slot.end_time}
                      onIonChange={(e) => updateScheduleSlot(index, 'end_time', e.detail.value)}
                      interface="popover"
                      className="schedule-slot__time"
                    >
                      {TIME_SLOTS.map(t => (
                        <IonSelectOption key={t} value={t}>{t}</IonSelectOption>
                      ))}
                    </IonSelect>
                    <IonButton
                      fill="clear"
                      color="danger"
                      size="small"
                      onClick={() => removeScheduleSlot(index)}
                    >
                      <IonIcon icon={trashOutline} slot="icon-only" />
                    </IonButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          <IonButton
            expand="block"
            onClick={handleSaveLecture}
            disabled={saving || !lectureName.trim()}
            className="ion-margin-top"
          >
            {saving ? <IonSpinner name="crescent" /> : (editingLecture ? 'Guardar cambios' : 'Crear asignatura')}
          </IonButton>
          
          <p className="schedule-note">
            <small>El horario es opcional y se puede configurar más tarde</small>
          </p>
        </div>
      </IonModal>

      {/* Delete Alert */}
      <IonAlert
        isOpen={!!deleteTarget}
        header="Eliminar asignatura"
        message={`¿Seguro que quieres eliminar "${deleteTarget?.name}"?`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
          { text: 'Eliminar', role: 'destructive', handler: handleDeleteLecture }
        ]}
        onDidDismiss={() => setDeleteTarget(null)}
      />
    </IonPage>
  );
};

export default ClassSettings;
