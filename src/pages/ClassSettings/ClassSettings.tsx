import { useState, useEffect, useMemo } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonList, IonItem, IonLabel, IonInput, IonModal, IonSelect,
  IonSelectOption, IonSpinner, IonAlert, IonItemSliding, IonItemOptions, IonItemOption,
  IonSegment, IonSegmentButton, IonCheckbox, IonSearchbar, IonProgressBar,
} from '@ionic/react';
import { addOutline, timeOutline, trashOutline, closeOutline, checkboxOutline, squareOutline, personAddOutline, chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import { classes as classesApi, lectures as lecturesApi, subjects as subjectsApi } from '../../services/api';
import { Lecture, ScheduleSlot, EducationLevel } from '../../types';
import { useClassesStore } from '../../store/classesStore';
import { useStudentsStore, StudentPoolEntry } from '../../store/studentsStore';
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

const EDUCATION_LEVELS: [EducationLevel, string, string][] = [
  ['infantil', 'Infantil', '3-5'],
  ['primaria_lower', 'Primaria Inf.', '6-8'],
  ['primaria_upper', 'Primaria Sup.', '9-11'],
  ['secundaria', 'Secundaria', '12-15'],
  ['bachillerato', 'Bachillerato', '16-17'],
  ['universidad', 'Universidad', '18+'],
];

interface ClassDetail {
  id: string;
  name: string;
  year: string;
  educationLevel: EducationLevel;
  lectures: Lecture[];
}

const ClassSettings: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [showLectureModal, setShowLectureModal] = useState(false);
  const [editingLecture, setEditingLecture] = useState<Lecture | null>(null);
  const [lectureName, setLectureName] = useState('');
  const [lectureSchedule, setLectureSchedule] = useState<ScheduleSlot[]>([]);
  const [classSubjectsList, setClassSubjectsList] = useState<{id: string; name: string}[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Selection mode for lectures
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Students (inline config)
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const bulkAddStudents = useStudentsStore((s) => s.bulkAddStudents);
  const addExistingToClass = useStudentsStore((s) => s.addExistingToClass);
  const fetchPoolNotInClass = useStudentsStore((s) => s.fetchPoolNotInClass);
  const removeFromClass = useStudentsStore((s) => s.removeFromClass);
  const studentsLoading = useStudentsStore((s) => s.loading);
  const poolLoading = useStudentsStore((s) => s.poolLoading);

  const students = useMemo(() => allStudents.filter((s) => s.classId === classId), [allStudents, classId]);

  const [showAddStudents, setShowAddStudents] = useState(false);
  const [addStudentsTab, setAddStudentsTab] = useState<'new' | 'existing'>('new');
  const [studentInputs, setStudentInputs] = useState<string[]>(['']);
  const [availableStudents, setAvailableStudents] = useState<StudentPoolEntry[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [addSearch, setAddSearch] = useState('');
  const [addClassFilter, setAddClassFilter] = useState('');
  const [studentsSaving, setStudentsSaving] = useState(false);
  const [studentsProgress, setStudentsProgress] = useState('');
  const [removeStudentTarget, setRemoveStudentTarget] = useState<{ id: string; name: string } | null>(null);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const firstId = Array.from(selectedIds)[0];
    const lectureToDelete = classData?.lectures.find(l => l.id === firstId);
    if (lectureToDelete) {
      setDeleteTarget({ id: lectureToDelete.id, name: lectureToDelete.name });
    }
  };

  const loadClass = async () => {
    setLoading(true);
    try {
      const res = await classesApi.get(classId);
      setClassData({
        id: res.data.id,
        name: res.data.name,
        year: res.data.year,
        educationLevel: res.data.education_level || 'secundaria',
        lectures: (res.data.lectures || []).map((l: any) => ({
          id: l.id,
          classId: l.class_id,
          name: l.name,
          subjectId: l.subject_id || undefined,
          subjectName: l.subject_name || undefined,
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

  useEffect(() => {
    if (classId) fetchStudents(classId);
  }, [classId, fetchStudents]);

  useEffect(() => {
    // Fetch ALL teacher subjects so the dropdown always shows available options
    subjectsApi.list().then(res => {
      setClassSubjectsList(res.data.map((s: any) => ({ id: s.id, name: s.name })));
    }).catch(() => setClassSubjectsList([]));
  }, [classId]);

  useEffect(() => {
    if (showAddStudents && addStudentsTab === 'existing' && classId) {
      fetchPoolNotInClass(classId).then(setAvailableStudents);
    }
  }, [showAddStudents, addStudentsTab, classId, fetchPoolNotInClass]);

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
      // Refresh global stores so class cards update immediately
      await Promise.all([
        fetchClasses(),
        fetchClassSubjects(classId),
      ]);
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
      await Promise.all([fetchClasses(), fetchClassSubjects(classId)]);
    } catch (err) {
      console.error('Failed to delete lecture:', err);
    }
    setDeleteTarget(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // ——— Students (inline config) ———
  const handleStudentInputChange = (index: number, value: string) => {
    setStudentInputs((prev) => {
      const u = [...prev];
      u[index] = value;
      return u;
    });
  };
  const handleAddStudentRow = () => setStudentInputs((prev) => [...prev, '']);
  const handleRemoveStudentRow = (index: number) => {
    if (studentInputs.length <= 1) return;
    setStudentInputs((prev) => prev.filter((_, i) => i !== index));
  };
  const validNewNames = studentInputs.filter((n) => n.trim().length > 0);

  const uniqueClassesForFilter = useMemo(() => Array.from(
    new Map(availableStudents.flatMap((s) => s.classes).map((c) => [c.class_id, c])).values()
  ).sort((a, b) => a.class_name.localeCompare(b.class_name)), [availableStudents]);

  const filteredAvailableStudents = useMemo(() => availableStudents.filter((s) => {
    const matchSearch = !addSearch || s.name.toLowerCase().includes(addSearch.toLowerCase());
    const matchClass = !addClassFilter || s.classes.some((c) => c.class_id === addClassFilter);
    return matchSearch && matchClass;
  }), [availableStudents, addSearch, addClassFilter]);

  const toggleAddStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllAddStudents = () => {
    if (selectedStudentIds.size === filteredAvailableStudents.length) setSelectedStudentIds(new Set());
    else setSelectedStudentIds(new Set(filteredAvailableStudents.map((s) => s.id)));
  };

  const handleAddNewStudents = async () => {
    const names = validNewNames;
    if (names.length === 0) return;
    setStudentsSaving(true);
    setStudentsProgress(`Añadiendo ${names.length} alumnos...`);
    try {
      await bulkAddStudents(classId, names);
      setStudentInputs(['']);
      await fetchStudents(classId);
    } catch (err) {
      console.error('Failed to add students:', err);
    } finally {
      setStudentsSaving(false);
      setStudentsProgress('');
    }
  };

  const handleAddExistingStudents = async () => {
    if (selectedStudentIds.size === 0) return;
    setStudentsSaving(true);
    setStudentsProgress(`Añadiendo ${selectedStudentIds.size} alumnos...`);
    try {
      await addExistingToClass(classId, Array.from(selectedStudentIds));
      setSelectedStudentIds(new Set());
      // Refresh both the class students and available students lists
      await fetchStudents(classId);
      const updatedPool = await fetchPoolNotInClass(classId);
      setAvailableStudents(updatedPool);
    } catch (err) {
      console.error('Failed to add existing students:', err);
    } finally {
      setStudentsSaving(false);
      setStudentsProgress('');
    }
  };

  const handleRemoveStudentFromClass = async () => {
    if (!removeStudentTarget) return;
    try {
      await removeFromClass(classId, removeStudentTarget.id);
      await fetchStudents(classId);
    } catch (err) {
      console.error('Failed to remove student:', err);
    }
    setRemoveStudentTarget(null);
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
            <div className="settings-info-row settings-info-row--vertical">
              <span className="settings-info-label">Nivel educativo</span>
              <div className="education-level-chips">
                {EDUCATION_LEVELS.map(([value, label, ages]) => (
                  <button
                    key={value}
                    type="button"
                    className={`education-level-chip ${classData?.educationLevel === value ? 'education-level-chip--active' : ''}`}
                    onClick={async () => {
                      if (value === classData?.educationLevel) return;
                      try {
                        await classesApi.update(classId, { education_level: value });
                        setClassData((prev) => prev ? { ...prev, educationLevel: value } : prev);
                        fetchClasses();
                      } catch (err) {
                        console.error('Failed to update education level:', err);
                      }
                    }}
                  >
                    <span className="education-level-chip__label">{label}</span>
                    <span className="education-level-chip__ages">{ages}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Lectures */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Asignaturas</h2>
            <div className="settings-section__actions">
              {selectionMode ? (
                <>
                  <IonButton fill="clear" size="small" onClick={exitSelectionMode}>
                    <IonIcon icon={closeOutline} slot="icon-only" />
                  </IonButton>
                  <IonButton 
                    fill="clear" 
                    size="small" 
                    color="danger" 
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.size === 0}
                  >
                    <IonIcon icon={trashOutline} slot="icon-only" />
                  </IonButton>
                </>
              ) : (
                <>
                  {classData?.lectures && classData.lectures.length > 0 && (
                    <IonButton fill="clear" size="small" onClick={() => setSelectionMode(true)}>
                      <IonIcon icon={trashOutline} slot="icon-only" />
                    </IonButton>
                  )}
                  <IonButton fill="clear" size="small" onClick={openNewLecture}>
                    <IonIcon icon={addOutline} slot="start" />
                    Añadir
                  </IonButton>
                </>
              )}
            </div>
          </div>

          {classData?.lectures && classData.lectures.length > 0 ? (
            <div className="settings-lectures">
              {classData.lectures.map(lecture => {
                const isSelected = selectedIds.has(lecture.id);
                return (
                  <IonItemSliding key={lecture.id} disabled={selectionMode}>
                    <div
                      className={`lecture-card ${selectionMode ? 'lecture-card--selectable' : ''} ${isSelected ? 'lecture-card--selected' : ''}`}
                      onClick={() => {
                        if (selectionMode) {
                          toggleSelection(lecture.id);
                        } else {
                          openEditLecture(lecture);
                        }
                      }}
                    >
                      {selectionMode && (
                        <div className="lecture-card__checkbox">
                          <IonIcon 
                            icon={isSelected ? checkboxOutline : squareOutline} 
                            color={isSelected ? 'primary' : 'medium'}
                          />
                        </div>
                      )}
                      <div className="lecture-card__main">
                        <span className="lecture-card__name">{lecture.name}</span>
                        {lecture.subjectName && (
                          <span className="lecture-card__subject">{lecture.subjectName}</span>
                        )}
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
                );
              })}
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

        {/* Students — configure inline */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Alumnos</h2>
            <span className="settings-section__count">{students.length}</span>
          </div>

          {studentsLoading ? (
            <div className="settings-students-loading"><IonSpinner color="primary" /></div>
          ) : (
            <>
              <div className="settings-add-students-block">
                <button
                  type="button"
                  className="settings-add-students-toggle"
                  onClick={() => setShowAddStudents((v) => !v)}
                >
                  <IonIcon icon={addOutline} />
                  <span>Añadir alumnos</span>
                  <IonIcon icon={showAddStudents ? chevronUpOutline : chevronDownOutline} />
                </button>

                {showAddStudents && (
                  <div className="settings-add-students-form">
                    {studentsSaving && (
                      <div className="settings-add-students-progress">
                        <IonProgressBar type="indeterminate" />
                        <span>{studentsProgress}</span>
                      </div>
                    )}

                    <IonSegment value={addStudentsTab} onIonChange={(e) => setAddStudentsTab(e.detail.value as 'new' | 'existing')}>
                      <IonSegmentButton value="new">
                        <IonLabel>Nuevos</IonLabel>
                      </IonSegmentButton>
                      <IonSegmentButton value="existing">
                        <IonLabel>Existentes</IonLabel>
                      </IonSegmentButton>
                    </IonSegment>

                    {addStudentsTab === 'new' && (
                      <div className="settings-add-new">
                        <p className="settings-add-hint">
                          Introduce los nombres de los nuevos alumnos para {classData?.name}
                        </p>
                        <IonList className="settings-add-input-list">
                          {studentInputs.map((value, index) => (
                            <IonItem key={index}>
                              <IonInput
                                value={value}
                                placeholder={`Nombre del alumno ${index + 1}`}
                                onIonInput={(e) => handleStudentInputChange(index, e.detail.value ?? '')}
                              />
                              {studentInputs.length > 1 && (
                                <IonButton fill="clear" slot="end" onClick={() => handleRemoveStudentRow(index)}>
                                  <IonIcon icon={trashOutline} color="danger" />
                                </IonButton>
                              )}
                            </IonItem>
                          ))}
                        </IonList>
                        <IonButton fill="clear" expand="block" onClick={handleAddStudentRow}>
                          <IonIcon icon={addOutline} slot="start" />
                          Añadir otro
                        </IonButton>
                        <IonButton
                          expand="block"
                          onClick={handleAddNewStudents}
                          disabled={studentsSaving || validNewNames.length === 0}
                        >
                          {studentsSaving ? <IonSpinner name="crescent" /> : `Añadir ${validNewNames.length || ''} alumnos`}
                        </IonButton>
                      </div>
                    )}

                    {addStudentsTab === 'existing' && (
                      <div className="settings-add-existing">
                        {availableStudents.length === 0 && !poolLoading ? (
                          <div className="settings-add-empty">
                            <IonIcon icon={personAddOutline} />
                            <p>No hay alumnos de otras clases para añadir.</p>
                          </div>
                        ) : (
                          <>
                            <IonSearchbar
                              value={addSearch}
                              onIonInput={(e) => setAddSearch(e.detail.value ?? '')}
                              placeholder="Buscar alumnos..."
                              className="settings-add-search"
                            />
                            {uniqueClassesForFilter.length > 0 && (
                              <IonSelect
                                value={addClassFilter}
                                onIonChange={(e) => setAddClassFilter(e.detail.value)}
                                interface="popover"
                                placeholder="Todas las clases"
                                className="settings-add-class-filter"
                              >
                                <IonSelectOption value="">Todas las clases</IonSelectOption>
                                {uniqueClassesForFilter.map((c) => (
                                  <IonSelectOption key={c.class_id} value={c.class_id}>{c.class_name}</IonSelectOption>
                                ))}
                              </IonSelect>
                            )}
                            {poolLoading ? (
                              <div className="settings-add-loading"><IonSpinner /></div>
                            ) : (
                              <>
                                <div className="settings-add-select-all">
                                  <IonCheckbox
                                    checked={selectedStudentIds.size === filteredAvailableStudents.length && filteredAvailableStudents.length > 0}
                                    indeterminate={selectedStudentIds.size > 0 && selectedStudentIds.size < filteredAvailableStudents.length}
                                    onIonChange={toggleAllAddStudents}
                                  />
                                  <span>Seleccionar todos ({filteredAvailableStudents.length})</span>
                                </div>
                                <IonList className="settings-add-existing-list">
                                  {filteredAvailableStudents.map((st) => (
                                    <IonItem key={st.id} button onClick={() => toggleAddStudent(st.id)}>
                                      <IonCheckbox slot="start" checked={selectedStudentIds.has(st.id)} />
                                      <IonLabel>
                                        <h2>{st.name}</h2>
                                        {st.classes.length > 0 && (
                                          <p>En: {st.classes.map((c) => c.class_name).join(', ')}</p>
                                        )}
                                      </IonLabel>
                                    </IonItem>
                                  ))}
                                </IonList>
                                <IonButton
                                  expand="block"
                                  onClick={handleAddExistingStudents}
                                  disabled={studentsSaving || selectedStudentIds.size === 0}
                                >
                                  {studentsSaving ? <IonSpinner name="crescent" /> : `Añadir ${selectedStudentIds.size || ''} seleccionados`}
                                </IonButton>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {students.length > 0 ? (
                <div className="settings-students-list">
                  {students.map((s) => (
                    <div key={s.id} className="settings-student-row">
                      <div className="settings-student-info">
                        <span className="settings-student-name">{s.name}</span>
                        {s.studentId && (
                          <span className="settings-student-code">{s.studentId}</span>
                        )}
                      </div>
                      <IonButton
                        fill="clear"
                        size="small"
                        color="danger"
                        onClick={() => setRemoveStudentTarget({ id: s.id, name: s.name })}
                      >
                        <IonIcon icon={trashOutline} slot="icon-only" />
                      </IonButton>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="settings-students-empty">Aún no hay alumnos en esta clase.</p>
              )}
            </>
          )}
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
            {classSubjectsList.length > 0 && !editingLecture && (
              <div className="subject-name-suggestions">
                <span className="subject-name-suggestions__label">Sugerencias:</span>
                <div className="subject-name-suggestions__list">
                  {classSubjectsList
                    .filter(s => !lectureName || s.name.toLowerCase().includes(lectureName.toLowerCase()))
                    .slice(0, 5)
                    .map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className={`subject-name-suggestion ${lectureName === s.name ? 'subject-name-suggestion--active' : ''}`}
                        onClick={() => setLectureName(s.name)}
                      >
                        {s.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
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

      {/* Delete Lecture Alert */}
      <IonAlert
        isOpen={!!deleteTarget}
        header="Eliminar asignatura"
        message={`¿Seguro que quieres eliminar "${deleteTarget?.name}"? Se eliminará la asignatura y su horario asociado.`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
          { text: 'Eliminar', role: 'destructive', handler: handleDeleteLecture }
        ]}
        onDidDismiss={() => setDeleteTarget(null)}
      />

      {/* Remove Student from Class Alert */}
      <IonAlert
        isOpen={!!removeStudentTarget}
        header="Quitar de la clase"
        message={`¿Quitar a "${removeStudentTarget?.name}" de esta clase? El alumno seguirá existiendo en otras clases si está asignado.`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setRemoveStudentTarget(null) },
          { text: 'Quitar', role: 'destructive', handler: handleRemoveStudentFromClass }
        ]}
        onDidDismiss={() => setRemoveStudentTarget(null)}
      />
    </IonPage>
  );
};

export default ClassSettings;
