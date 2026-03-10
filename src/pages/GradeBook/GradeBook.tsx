import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem,
  IonInput, IonModal, IonSearchbar, IonItemSliding, IonItemOptions, IonItemOption,
  IonSpinner, IonAlert, IonProgressBar,
} from '@ionic/react';
import { 
  addOutline, downloadOutline, cloudUploadOutline, bookOutline, calendarOutline, 
  sparkles, closeCircleOutline, settingsOutline, peopleOutline, schoolOutline,
  documentTextOutline, chevronForwardOutline, createOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useClassesStore } from '../../store/classesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import GradeTable from '../../components/GradeTable';
import EmptyState from '../../components/EmptyState';
import ScheduleSetupSheet from '../../components/ScheduleSetupSheet';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import './GradeBook.css';

const AVATAR_COLORS = [
  '#6C3AED', '#8B5CF6', '#059669', '#0891B2', '#D97706',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

const WEEK_DAYS = [
  { key: 'monday', label: 'Lunes', short: 'L' },
  { key: 'tuesday', label: 'Martes', short: 'M' },
  { key: 'wednesday', label: 'Miércoles', short: 'X' },
  { key: 'thursday', label: 'Jueves', short: 'J' },
  { key: 'friday', label: 'Viernes', short: 'V' },
];

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  uploaded: { color: '#64748B', label: 'Subido', bg: 'rgba(100, 116, 139, 0.1)' },
  assigned: { color: '#D97706', label: 'Por corregir', bg: 'rgba(217, 119, 6, 0.1)' },
  corrected: { color: '#059669', label: 'Corregido', bg: 'rgba(5, 150, 105, 0.1)' },
};

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const GradeBook: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const history = useHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const importStudentsToClass = useClassesStore((s) => s.importStudents);

  const allStudents = useStudentsStore((s) => s.students);
  const addStudent = useStudentsStore((s) => s.addStudent);
  const removeStudent = useStudentsStore((s) => s.removeStudent);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const studentsLoading = useStudentsStore((s) => s.loading);

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);

  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const exams = useMemo(() => allExams.filter((e) => e.classId === classId), [allExams, classId]);

  const [tab, setTab] = useState<'overview' | 'subjects' | 'grades' | 'roster'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [studentInputs, setStudentInputs] = useState<string[]>(['']);
  const [rosterSearch, setRosterSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showScheduleSheet, setShowScheduleSheet] = useState(false);
  const [showBulkExerciseModal, setShowBulkExerciseModal] = useState(false);

  useEffect(() => {
    fetchClasses();
    fetchStudents(classId);
    fetchExams(classId);
    fetchAllCorrections();
  }, [classId, fetchClasses, fetchStudents, fetchExams, fetchAllCorrections]);

  const validStudentNames = studentInputs.filter((n) => n.trim().length > 0);

  const handleInputChange = (index: number, value: string) => {
    setStudentInputs((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAddRow = () => {
    setStudentInputs((prev) => [...prev, '']);
  };

  const handleRemoveRow = (index: number) => {
    if (studentInputs.length <= 1) return;
    setStudentInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddStudents = async () => {
    const names = validStudentNames.map((n) => n.trim());
    if (names.length === 0) return;
    
    setSaving(true);
    setSaveProgress('');
    try {
      for (let i = 0; i < names.length; i++) {
        setSaveProgress(`Añadiendo ${i + 1}/${names.length}...`);
        await addStudent({ class_id: classId, name: names[i] });
      }
      setStudentInputs(['']);
      setSaveProgress('');
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to add students:', err);
    } finally {
      setSaving(false);
      setSaveProgress('');
    }
  };

  const handleModalDismiss = () => {
    setShowAddModal(false);
    setStudentInputs(['']);
    setSaveProgress('');
  };

  const handleRemoveConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await removeStudent(deleteTarget.id);
    } catch (err) {
      console.error('Failed to remove student:', err);
    }
    setDeleteTarget(null);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importStudentsToClass(classId, file);
      await fetchStudents(classId);
      alert(`Importados ${count} alumnos`);
    } catch (err) {
      console.error('Failed to import:', err);
    }
  };

  const filteredRoster = students.filter((s) =>
    s.name.toLowerCase().includes(rosterSearch.toLowerCase())
  );

  const recentExams = useMemo(() => {
    return [...exams]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [exams]);

  const pendingExamsCount = useMemo(() => {
    return exams.filter(e => e.status === 'assigned').length;
  }, [exams]);

  if (!classGroup) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="gb-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent className="gb-content" scrollY>
        {/* Class Hero Header */}
        <div className="gb-hero">
          <div className="gb-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref="/tabs/classes" text="" color="light" />
            </IonButtons>
            <IonButton 
              fill="solid" 
              size="small" 
              onClick={() => history.push('/tabs/exams/new')}
              className="gb-hero__new-btn"
            >
              <IonIcon icon={createOutline} slot="start" />
              Nuevo examen
            </IonButton>
          </div>
          <div className="gb-hero__content">
            <h1 className="gb-hero__title">{classGroup.name}</h1>
            {classGroup.lectures && classGroup.lectures.length > 0 && (
              <p className="gb-hero__subtitle">
                {classGroup.lectures.map(l => l.name).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Segment Tabs */}
        <div className="gb-tabs-wrapper">
          <IonSegment 
            value={tab} 
            onIonChange={(e) => setTab(e.detail.value as 'overview' | 'subjects' | 'grades' | 'roster')}
            className="gb-tabs"
          >
            <IonSegmentButton value="overview"><IonLabel>Resumen</IonLabel></IonSegmentButton>
            <IonSegmentButton value="subjects"><IonLabel>Asignaturas</IonLabel></IonSegmentButton>
            <IonSegmentButton value="grades"><IonLabel>Calificaciones</IonLabel></IonSegmentButton>
            <IonSegmentButton value="roster"><IonLabel>Alumnos</IonLabel></IonSegmentButton>
          </IonSegment>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".csv"
          onChange={handleImportFile}
        />

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div className="gb-overview">
            {/* Stats Grid */}
            <div className="gb-stats">
              <div className="gb-stat-card gb-stat-card--students">
                <div className="gb-stat-card__icon">
                  <IonIcon icon={peopleOutline} />
                </div>
                <div className="gb-stat-card__content">
                  <span className="gb-stat-card__value">{students.length}</span>
                  <span className="gb-stat-card__label">Alumnos</span>
                </div>
              </div>
              <div className="gb-stat-card gb-stat-card--subjects">
                <div className="gb-stat-card__icon">
                  <IonIcon icon={schoolOutline} />
                </div>
                <div className="gb-stat-card__content">
                  <span className="gb-stat-card__value">{classGroup?.lectures?.length || 0}</span>
                  <span className="gb-stat-card__label">Asignaturas</span>
                </div>
              </div>
              <div className="gb-stat-card gb-stat-card--exams">
                <div className="gb-stat-card__icon">
                  <IonIcon icon={documentTextOutline} />
                </div>
                <div className="gb-stat-card__content">
                  <span className="gb-stat-card__value">{exams.length}</span>
                  <span className="gb-stat-card__label">Exámenes</span>
                </div>
              </div>
            </div>

            {/* Pending Exams Alert */}
            {pendingExamsCount > 0 && (
              <div className="gb-pending-alert" onClick={() => {
                const pending = exams.find(e => e.status === 'assigned');
                if (pending) history.push(`/correction/${pending.id}`);
              }}>
                <div className="gb-pending-alert__left">
                  <span className="gb-pending-alert__count">{pendingExamsCount}</span>
                  <span className="gb-pending-alert__text">
                    {pendingExamsCount === 1 ? 'examen pendiente de corregir' : 'exámenes pendientes de corregir'}
                  </span>
                </div>
                <IonIcon icon={chevronForwardOutline} className="gb-pending-alert__arrow" />
              </div>
            )}

            {/* Quick Actions */}
            <div className="gb-section">
              <h3 className="gb-section__title">Acciones rápidas</h3>
              <div className="gb-actions">
                <button 
                  className="gb-action-card"
                  onClick={() => history.push(`/tabs/classes/${classId}/settings`)}
                >
                  <div className="gb-action-card__icon gb-action-card__icon--teal">
                    <IonIcon icon={settingsOutline} />
                  </div>
                  <span className="gb-action-card__label">Configurar asignaturas</span>
                </button>
                <button 
                  className="gb-action-card"
                  onClick={() => history.push(`/tabs/classes/${classId}/topics`)}
                >
                  <div className="gb-action-card__icon gb-action-card__icon--blue">
                    <IonIcon icon={bookOutline} />
                  </div>
                  <span className="gb-action-card__label">Gestionar temario</span>
                </button>
                <button 
                  className="gb-action-card"
                  onClick={() => setShowScheduleSheet(true)}
                >
                  <div className="gb-action-card__icon gb-action-card__icon--purple">
                    <IonIcon icon={calendarOutline} />
                  </div>
                  <span className="gb-action-card__label">Configurar horario</span>
                </button>
                <button 
                  className="gb-action-card"
                  onClick={() => setShowBulkExerciseModal(true)}
                >
                  <div className="gb-action-card__icon gb-action-card__icon--orange">
                    <IonIcon icon={sparkles} />
                  </div>
                  <span className="gb-action-card__label">Generar ejercicios</span>
                </button>
              </div>
            </div>

            {/* Recent Exams */}
            {recentExams.length > 0 && (
              <div className="gb-section">
                <div className="gb-section__header">
                  <h3 className="gb-section__title">Exámenes recientes</h3>
                  <button 
                    className="gb-section__link"
                    onClick={() => setTab('grades')}
                  >
                    Ver todos
                  </button>
                </div>
                <div className="gb-exams-list">
                  {recentExams.map((exam) => {
                    const status = statusConfig[exam.status] || statusConfig.uploaded;
                    return (
                      <div 
                        key={exam.id} 
                        className="gb-exam-card" 
                        onClick={() => history.push(`/correction/${exam.id}`)}
                      >
                        <div className="gb-exam-card__left">
                          <div className="gb-exam-card__info">
                            <span className="gb-exam-card__name">{exam.name}</span>
                            <span className="gb-exam-card__date">
                              {new Date(exam.date).toLocaleDateString('es-ES', { 
                                day: 'numeric', 
                                month: 'short' 
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="gb-exam-card__right">
                          <span 
                            className="gb-exam-card__status"
                            style={{ 
                              color: status.color,
                              background: status.bg
                            }}
                          >
                            {status.label}
                          </span>
                          <IonIcon icon={chevronForwardOutline} className="gb-exam-card__arrow" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {exams.length === 0 && students.length === 0 && (
              <div className="gb-empty-overview">
                <EmptyState
                  icon="🎓"
                  title="Empieza a configurar tu clase"
                  subtitle="Añade alumnos y crea exámenes para comenzar"
                  actionLabel="Añadir alumnos"
                  onAction={() => setShowAddModal(true)}
                />
              </div>
            )}
          </div>
        )}

        {/* Subjects Tab */}
        {tab === 'subjects' && (
          <div className="gb-subjects">
            {!classGroup?.lectures || classGroup.lectures.length === 0 ? (
              <EmptyState
                icon="📚"
                title="Sin asignaturas configuradas"
                subtitle="Configura las asignaturas para organizar mejor el contenido"
                actionLabel="Configurar asignaturas"
                onAction={() => history.push(`/tabs/classes/${classId}/settings`)}
              />
            ) : (
              <div className="gb-subjects-list">
                {classGroup.lectures.map((lecture) => (
                  <div key={lecture.id} className="gb-subject-card">
                    <div className="gb-subject-card__header">
                      <h3 className="gb-subject-card__name">{lecture.name}</h3>
                      <div className="gb-subject-card__schedule">
                        {lecture.schedule.length > 0 ? (
                          lecture.schedule.map((slot, idx) => (
                            <span key={idx} className="gb-schedule-badge">
                              {WEEK_DAYS.find(d => d.key === slot.day)?.short} {slot.start_time}-{slot.end_time}
                            </span>
                          ))
                        ) : (
                          <span className="gb-no-schedule">Sin horario</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="gb-subject-card__content">
                      <div className="gb-subject-card__section">
                        <h4>Exámenes</h4>
                        {exams.filter(e => e.name.toLowerCase().includes(lecture.name.toLowerCase())).length > 0 ? (
                          <div className="gb-subject-card__items">
                            {exams.filter(e => e.name.toLowerCase().includes(lecture.name.toLowerCase())).map(exam => {
                              const status = statusConfig[exam.status] || statusConfig.uploaded;
                              return (
                                <div 
                                  key={exam.id} 
                                  className="gb-subject-item" 
                                  onClick={() => history.push(`/correction/${exam.id}`)}
                                >
                                  <span className="gb-subject-item__name">{exam.name}</span>
                                  <span 
                                    className="gb-subject-item__status"
                                    style={{ color: status.color, background: status.bg }}
                                  >
                                    {status.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="gb-empty-content">Sin exámenes</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Grades Tab */}
        {tab === 'grades' && (
          <div className="gb-grades">
            {studentsLoading ? (
              <div className="gb-loading"><IonSpinner color="primary" /></div>
            ) : students.length === 0 || exams.length === 0 ? (
              <EmptyState
                icon="📊"
                title={students.length === 0 ? 'Aún no hay alumnos' : 'Aún no hay exámenes'}
                subtitle={students.length === 0 ? 'Añade alumnos para empezar' : 'Crea un examen para esta clase'}
                actionLabel={students.length === 0 ? 'Añadir alumno' : 'Nuevo examen'}
                onAction={() => (students.length === 0 ? setShowAddModal(true) : history.push('/tabs/exams/new'))}
              />
            ) : (
              <>
                <div className="gb-grades-toolbar">
                  <IonButton size="small" onClick={() => history.push('/tabs/exams/new')}>
                    <IonIcon icon={addOutline} slot="start" /> Nuevo examen
                  </IonButton>
                  <IonButton size="small" fill="outline">
                    <IonIcon icon={downloadOutline} slot="start" /> Exportar
                  </IonButton>
                </div>
                <GradeTable
                  students={students}
                  exams={exams}
                  onStudentClick={(id) => history.push(`/tabs/classes/${classId}/students/${id}`)}
                  onExamClick={(id) => history.push(`/correction/${id}`)}
                />
              </>
            )}
          </div>
        )}

        {/* Roster Tab */}
        {tab === 'roster' && (
          <div className="gb-roster">
            <div className="gb-roster-toolbar">
              <IonButton size="small" onClick={() => setShowAddModal(true)}>
                <IonIcon icon={addOutline} slot="start" /> Añadir alumno
              </IonButton>
              <IonButton size="small" fill="outline" onClick={handleImportClick}>
                <IonIcon icon={cloudUploadOutline} slot="start" /> Importar CSV
              </IonButton>
            </div>
            <IonSearchbar
              value={rosterSearch}
              onIonInput={(e) => setRosterSearch(e.detail.value ?? '')}
              placeholder="Buscar alumnos..."
              className="gb-roster-search"
            />
            {studentsLoading ? (
              <div className="gb-loading"><IonSpinner color="primary" /></div>
            ) : filteredRoster.length === 0 ? (
              <EmptyState icon="👤" title="No hay alumnos" actionLabel="Añadir alumno" onAction={() => setShowAddModal(true)} />
            ) : (
              <IonList className="gb-roster-list">
                {filteredRoster.map((s) => (
                  <IonItemSliding key={s.id}>
                    <IonItem button onClick={() => history.push(`/tabs/classes/${classId}/students/${s.id}`)} className="gb-student-item">
                      <div className="gb-student-avatar" slot="start" style={{ background: avatarColor(s.name) }}>
                        {s.name.charAt(0)}
                      </div>
                      <IonLabel>
                        <h3 className="gb-student-name">{s.name}</h3>
                        {s.studentId && <p className="gb-student-code">{s.studentId}</p>}
                      </IonLabel>
                      <IonIcon icon={chevronForwardOutline} slot="end" className="gb-student-arrow" />
                    </IonItem>
                    <IonItemOptions side="end">
                      <IonItemOption color="danger" onClick={() => setDeleteTarget({ id: s.id, name: s.name })}>
                        Quitar
                      </IonItemOption>
                    </IonItemOptions>
                  </IonItemSliding>
                ))}
              </IonList>
            )}
          </div>
        )}

        {/* Add student modal */}
        <IonModal isOpen={showAddModal} onDidDismiss={handleModalDismiss} initialBreakpoint={0.6} breakpoints={[0, 0.6, 0.9]}>
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Añadir alumnos</h2>
            
            <div className="student-inputs-list">
              {studentInputs.map((value, index) => (
                <div key={index} className="student-input-row">
                  <span className="student-input-number">{index + 1}</span>
                  <IonInput
                    value={value}
                    onIonInput={(e) => handleInputChange(index, e.detail.value ?? '')}
                    placeholder="Nombre completo"
                    disabled={saving}
                    className="student-input-field"
                  />
                  {studentInputs.length > 1 && (
                    <button
                      className="student-input-remove"
                      onClick={() => handleRemoveRow(index)}
                      disabled={saving}
                      type="button"
                    >
                      <IonIcon icon={closeCircleOutline} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <IonButton
              fill="outline"
              size="small"
              onClick={handleAddRow}
              disabled={saving}
              className="add-row-btn"
            >
              <IonIcon icon={addOutline} slot="start" />
              Añadir otro
            </IonButton>

            <p className="auto-code-hint">Se asignará un código de alumno automáticamente</p>
            
            {saveProgress && (
              <div className="add-students-progress">
                <IonProgressBar type="indeterminate" />
                <span>{saveProgress}</span>
              </div>
            )}
            
            <IonButton
              expand="block"
              onClick={handleAddStudents}
              className="ion-margin-top"
              disabled={saving || validStudentNames.length === 0}
            >
              {saving ? (
                <IonSpinner name="crescent" />
              ) : (
                `Añadir ${validStudentNames.length} alumno${validStudentNames.length !== 1 ? 's' : ''}`
              )}
            </IonButton>
          </div>
        </IonModal>

        <IonAlert
          isOpen={!!deleteTarget}
          header="Quitar alumno"
          message={`¿Quitar a "${deleteTarget?.name}" de esta clase?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
            { text: 'Quitar', role: 'destructive', handler: handleRemoveConfirm }
          ]}
          onDidDismiss={() => setDeleteTarget(null)}
        />
        <ScheduleSetupSheet
          isOpen={showScheduleSheet}
          onDismiss={() => setShowScheduleSheet(false)}
          preselectedClassId={classId}
        />
        <ExerciseGeneratorModal
          isOpen={showBulkExerciseModal}
          onDismiss={() => setShowBulkExerciseModal(false)}
          classId={classId}
        />
      </IonContent>
    </IonPage>
  );
};

export default GradeBook;
