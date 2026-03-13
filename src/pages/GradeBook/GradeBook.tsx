import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem,
  IonSearchbar, IonItemSliding, IonItemOptions, IonItemOption,
  IonSpinner, IonAlert, useIonViewWillEnter,
} from '@ionic/react';
import { 
  addOutline, downloadOutline, cloudUploadOutline, bookOutline,
  sparkles, settingsOutline, documentTextOutline, chevronForwardOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useClassesStore } from '../../store/classesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { classes as classesApi } from '../../services/api';
import { ClassGroup, ClassSubjectSummary } from '../../types';
import GradeTable from '../../components/GradeTable';
import EmptyState from '../../components/EmptyState';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import AddStudentsModal from '../../components/AddStudentsModal';
import ClassInsightsPanel from '../../components/ClassInsightsPanel';
import './GradeBook.css';

const AVATAR_COLORS = [
  '#6C3AED', '#8B5CF6', '#059669', '#0891B2', '#D97706',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

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
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const allStudents = useStudentsStore((s) => s.students);
  const removeStudent = useStudentsStore((s) => s.removeStudent);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const studentsLoading = useStudentsStore((s) => s.loading);

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const allCorrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);
  
  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);

  const basicClassGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const exams = useMemo(() => allExams.filter((e) => e.classId === classId), [allExams, classId]);
  const exercises = useMemo(() => allExercises.filter((e) => studentIds.has(e.studentId)), [allExercises, studentIds]);

  const [tab, setTab] = useState<'overview' | 'grades' | 'roster'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showBulkExerciseModal, setShowBulkExerciseModal] = useState(false);
  const [detailedClassData, setDetailedClassData] = useState<ClassGroup | null>(null);
  const [preselectedWeakAreas, setPreselectedWeakAreas] = useState<string[]>([]);

  const classGroup = detailedClassData || basicClassGroup;

  const fetchClassDetails = useCallback(async () => {
    if (!classId) return;
    try {
      const response = await classesApi.get(classId);
      setDetailedClassData(response.data);
    } catch (err) {
      console.error('Failed to fetch class details:', err);
    }
  }, [classId]);

  useEffect(() => {
    fetchClasses();
    fetchStudents(classId);
    fetchExams(classId);
    fetchAllCorrections();
    fetchClassDetails();
    fetchExercises();
    fetchClassSubjects(classId);
  }, [classId, fetchClasses, fetchStudents, fetchExams, fetchAllCorrections, fetchClassDetails, fetchExercises, fetchClassSubjects]);

  useIonViewWillEnter(() => {
    fetchClassDetails();
  });

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

  const handleExportGrades = () => {
    if (students.length === 0 || exams.length === 0) return;
    
    const sortedExams = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const header = ['Alumno', ...sortedExams.map(e => e.name)];
    
    const rows = students.map(student => {
      const grades = sortedExams.map(exam => {
        const correction = allCorrections.find(c => c.examId === exam.id && c.studentId === student.id);
        return correction?.grade !== undefined && correction?.grade !== null ? String(correction.grade) : '';
      });
      return [student.name, ...grades];
    });
    
    const csvContent = [header, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notas_${classGroup?.name || 'clase'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const filteredRoster = students.filter((s) =>
    s.name.toLowerCase().includes(rosterSearch.toLowerCase())
  );

  const pendingExamsCount = useMemo(() => {
    return exams.filter(e => e.status === 'assigned').length;
  }, [exams]);

  const pendingExercisesCount = useMemo(() => {
    return exercises.filter(e => e.correctionStatus !== 'corrected').length;
  }, [exercises]);

  if (!classGroup) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="gb-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  const hasPending = pendingExamsCount > 0 || pendingExercisesCount > 0;

  return (
    <IonPage>
      <IonContent className="gb-content" scrollY>
        {/* Header */}
        <div className="gb-hero gb-hero--compact">
          <div className="gb-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref="/tabs/classes" text="" color="light" />
            </IonButtons>
            <div className="gb-hero__center">
              <h1 className="gb-hero__title">{classGroup.name}</h1>
              {classGroup.lectures && classGroup.lectures.length > 0 && (
                <p className="gb-hero__subtitle">
                  {classGroup.lectures.map(l => l.name).join(' · ')}
                </p>
              )}
            </div>
            <IonButton 
              fill="clear" 
              size="small" 
              onClick={() => history.push(`/tabs/classes/${classId}/settings`)}
              className="gb-hero__settings-btn"
            >
              <IonIcon icon={settingsOutline} slot="icon-only" />
            </IonButton>
          </div>
        </div>

        {/* Tabs */}
        <div className="gb-tabs-wrapper">
          <IonSegment 
            value={tab} 
            onIonChange={(e) => setTab(e.detail.value as 'overview' | 'grades' | 'roster')}
            className="gb-tabs"
          >
            <IonSegmentButton value="overview"><IonLabel>Resumen</IonLabel></IonSegmentButton>
            <IonSegmentButton value="grades"><IonLabel>Notas</IonLabel></IonSegmentButton>
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

        {/* ── Overview Tab ── */}
        {tab === 'overview' && (
          <div className="gb-overview">
            {/* Primary Actions */}
            <div className="gb-actions">
              <button 
                className="gb-action-btn"
                onClick={() => history.push(`/tabs/classes/${classId}/exams/new`)}
              >
                <IonIcon icon={addOutline} />
                <span>Nuevo examen</span>
              </button>
              <button 
                className="gb-action-btn gb-action-btn--alt"
                onClick={() => setShowBulkExerciseModal(true)}
              >
                <IonIcon icon={sparkles} />
                <span>Generar ejercicios</span>
              </button>
            </div>

            {/* Pending Alerts */}
            {hasPending && (
              <div className="gb-alerts">
                {pendingExamsCount > 0 && (
                  <button 
                    className="gb-alert-row gb-alert-row--warning"
                    onClick={() => history.push(`/tabs/classes/${classId}/exams`)}
                  >
                    <span className="gb-alert-row__badge">{pendingExamsCount}</span>
                    <span className="gb-alert-row__text">
                      {pendingExamsCount === 1 ? 'examen pendiente de corregir' : 'exámenes pendientes de corregir'}
                    </span>
                    <IonIcon icon={chevronForwardOutline} className="gb-alert-row__arrow" />
                  </button>
                )}
                {pendingExercisesCount > 0 && (
                  <button 
                    className="gb-alert-row gb-alert-row--info"
                    onClick={() => history.push(`/tabs/classes/${classId}/exercises`)}
                  >
                    <span className="gb-alert-row__badge">{pendingExercisesCount}</span>
                    <span className="gb-alert-row__text">
                      {pendingExercisesCount === 1 ? 'ejercicio pendiente' : 'ejercicios pendientes'}
                    </span>
                    <IonIcon icon={chevronForwardOutline} className="gb-alert-row__arrow" />
                  </button>
                )}
              </div>
            )}

            {/* Subject-based navigation */}
            {(classSubjects[classId]?.length || 0) > 0 ? (
              <div className="gb-nav-card">
                <div className="gb-nav-section-title">Asignaturas</div>
                {classSubjects[classId].map((subject) => (
                  <button
                    key={subject.subjectId}
                    className="gb-nav-row"
                    onClick={() => history.push(`/tabs/classes/${classId}/subjects/${subject.subjectId}`)}
                  >
                    <IonIcon icon={bookOutline} className="gb-nav-row__icon" />
                    <span className="gb-nav-row__label">{subject.subjectName}</span>
                    <div className="gb-nav-row__meta">
                      {subject.examCount > 0 && <span className="gb-nav-row__count">{subject.examCount} ex.</span>}
                      {subject.pendingCorrections > 0 && <span className="gb-nav-row__pending">{subject.pendingCorrections}</span>}
                    </div>
                    <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="gb-nav-card">
                <button
                  className="gb-nav-row"
                  onClick={() => history.push(`/tabs/classes/${classId}/exams`)}
                >
                  <IonIcon icon={documentTextOutline} className="gb-nav-row__icon" />
                  <span className="gb-nav-row__label">Exámenes</span>
                  {exams.length > 0 && (
                    <span className="gb-nav-row__count">{exams.length}</span>
                  )}
                  <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
                </button>

                <button
                  className="gb-nav-row"
                  onClick={() => history.push(`/tabs/classes/${classId}/exercises`)}
                >
                  <IonIcon icon={sparkles} className="gb-nav-row__icon" />
                  <span className="gb-nav-row__label">Ejercicios</span>
                  {exercises.length > 0 && (
                    <span className="gb-nav-row__count">{exercises.length}</span>
                  )}
                  <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
                </button>

                <button
                  className="gb-nav-row gb-nav-row--last"
                  onClick={() => history.push(`/tabs/classes/${classId}/topics`)}
                >
                  <IonIcon icon={bookOutline} className="gb-nav-row__icon" />
                  <span className="gb-nav-row__label">Temario</span>
                  <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
                </button>
              </div>
            )}

            {/* Class Insights */}
            {students.length > 0 && (
              <ClassInsightsPanel
                classId={classId}
                onStudentClick={(studentId) => history.push(`/tabs/classes/${classId}/students/${studentId}`)}
                onGenerateExercises={(areas) => {
                  setPreselectedWeakAreas(areas);
                  setShowBulkExerciseModal(true);
                }}
              />
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

        {/* ── Grades Tab ── */}
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
                onAction={() => (students.length === 0 ? setShowAddModal(true) : history.push(`/tabs/classes/${classId}/exams/new`))}
              />
            ) : (
              <>
                <div className="gb-grades-toolbar">
                  <IonButton size="small" onClick={() => history.push(`/tabs/classes/${classId}/exams/new`)}>
                    <IonIcon icon={addOutline} slot="start" /> Nuevo examen
                  </IonButton>
                  <IonButton size="small" fill="outline" onClick={handleExportGrades}>
                    <IonIcon icon={downloadOutline} slot="start" /> Exportar
                  </IonButton>
                </div>
                <GradeTable
                  students={students}
                  exams={exams}
                  onStudentClick={(id) => history.push(`/tabs/classes/${classId}/students/${id}`)}
                  onExamClick={(id) => history.push(`/tabs/classes/${classId}/exams/${id}`)}
                />
              </>
            )}
          </div>
        )}

        {/* ── Roster Tab ── */}
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

        {/* Modals */}
        <AddStudentsModal
          isOpen={showAddModal}
          classId={classId}
          className={classGroup?.name || ''}
          onDismiss={() => setShowAddModal(false)}
          onStudentsAdded={() => fetchStudents(classId)}
        />

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
