import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem,
  IonSearchbar, IonItemSliding, IonItemOptions, IonItemOption,
  IonSpinner, IonAlert, IonModal, useIonViewWillEnter,
} from '@ionic/react';
import {
  addOutline, cloudUploadOutline, bookOutline, peopleOutline,
  sparkles, settingsOutline, documentTextOutline, chevronForwardOutline,
  calendarOutline, statsChartOutline, trashOutline, chatbubbleOutline,
  pencilOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useClassesStore, DeletePreview } from '../../store/classesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useExamsStore } from '../../store/examsStore';
import { useExercisesStore } from '../../store/exercisesStore';
import { classes as classesApi } from '../../services/api';
import { ClassGroup } from '../../types';
import EmptyState from '../../components/EmptyState';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import AddStudentsModal from '../../components/AddStudentsModal';
import ClassInsightsPanel from '../../components/ClassInsightsPanel';
import SubjectCard from '../../components/SubjectCard';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { avatarColor } from '../../utils/avatarColors';
import QuickCommentModal from '../../components/QuickCommentModal';
import './GradeBook.css';

const GradeBook: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const history = useHistory();
  const isDesktop = useIsDesktop();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const importStudentsToClass = useClassesStore((s) => s.importStudents);
  const deleteClassPermanently = useClassesStore((s) => s.deleteClassPermanently);
  const getDeletePreview = useClassesStore((s) => s.getDeletePreview);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const allStudents = useStudentsStore((s) => s.students);
  const removeStudent = useStudentsStore((s) => s.removeStudent);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const studentsLoading = useStudentsStore((s) => s.loading);

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);


  const basicClassGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  const exams = useMemo(() => allExams.filter((e) => e.classId === classId), [allExams, classId]);
  const exercises = useMemo(() => allExercises.filter((e) => studentIds.has(e.studentId)), [allExercises, studentIds]);
  const uniqueExerciseCount = useMemo(() => new Set(exercises.map(e => e.name || e.id)).size, [exercises]);

  const [tab, setTab] = useState<'overview' | 'roster'>('overview');
  const [showAddModal, setShowAddModal] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [showBulkExerciseModal, setShowBulkExerciseModal] = useState(false);
  const [detailedClassData, setDetailedClassData] = useState<ClassGroup | null>(null);
  const [preselectedWeakAreas, setPreselectedWeakAreas] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [loadingDeletePreview, setLoadingDeletePreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [commentTarget, setCommentTarget] = useState<{ id: string; name: string } | null>(null);

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
    fetchClassDetails();
    fetchExercises();
    fetchClassSubjects(classId);
  }, [classId, fetchClasses, fetchStudents, fetchExams, fetchClassDetails, fetchExercises, fetchClassSubjects]);

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

  const handleStartDelete = async () => {
    setShowDeleteModal(true);
    setLoadingDeletePreview(true);
    try {
      const preview = await getDeletePreview(classId);
      setDeletePreview(preview);
    } catch (err) {
      console.error('Failed to get delete preview:', err);
    } finally {
      setLoadingDeletePreview(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await deleteClassPermanently(classId);
      await fetchClasses();
      history.replace('/tabs/classes');
    } catch (err) {
      console.error('Failed to delete class:', err);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
      setDeletePreview(null);
    }
  };

  const filteredRoster = students.filter((s) =>
    s.name.toLowerCase().includes(rosterSearch.toLowerCase())
  );


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
                  {classGroup.lectures.map(l => {
                    const subj = classSubjects[classId]?.find(s => s.subjectName === l.name || s.lectureId === l.id);
                    return subj?.aula ? `${l.name} (${subj.aula})` : l.name;
                  }).join(' · ')}
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
            onIonChange={(e) => setTab(e.detail.value as 'overview' | 'roster')}
            className="gb-tabs"
          >
            <IonSegmentButton value="overview"><IonLabel>Resumen</IonLabel></IonSegmentButton>
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
            {/* Subject Cards — primary navigation when subjects exist */}
            {(classSubjects[classId]?.length || 0) > 0 && (
              <div className="gb-subject-cards">
                {classSubjects[classId].map((subject) => {
                  const firstPending = exams.find(
                    e => e.status === 'assigned' && e.subjectId === subject.subjectId
                  );
                  return (
                    <SubjectCard
                      key={subject.subjectId}
                      subject={subject}
                      classId={classId}
                      onNavigate={(subjectId) => history.push(`/tabs/classes/${classId}/subjects/${subjectId}`)}
                      onCorrect={(examId) => history.push(`/correction/${examId}`)}
                      firstPendingExamId={firstPending?.id}
                    />
                  );
                })}
              </div>
            )}

            {/* Class Insights — cross-subject student alerts */}
            {(classSubjects[classId]?.length || 0) > 0 && students.length > 0 && (
              <ClassInsightsPanel
                classId={classId}
                onStudentClick={(studentId) => history.push(`/tabs/classes/${classId}/students/${studentId}`)}
                onGenerateExercises={(areas) => {
                  setPreselectedWeakAreas(areas);
                  setShowBulkExerciseModal(true);
                }}
              />
            )}

            {/* Overview Navigation — Trimester summary & Reports */}
            <div className="gb-overview-nav">
              <button
                className="gb-overview-nav-btn"
                onClick={() => history.push(`/tabs/classes/${classId}/trimester-summary`)}
              >
                <IonIcon icon={calendarOutline} />
                <span>Resumen trimestral</span>
              </button>
              <button
                className="gb-overview-nav-btn"
                onClick={() => history.push(`/tabs/classes/${classId}/reports`)}
              >
                <IonIcon icon={statsChartOutline} />
                <span>Informes</span>
              </button>
            </div>

            {/* Delete class */}
            <div className="gb-delete-link">
              <button
                className="gb-delete-link__btn"
                onClick={handleStartDelete}
              >
                <IonIcon icon={trashOutline} />
                <span>Eliminar clase</span>
              </button>
            </div>

            {/* Fallback when no subjects — simple nav */}
            {(classSubjects[classId]?.length || 0) === 0 && (
              <>
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
                    <IonIcon icon={pencilOutline} className="gb-nav-row__icon" />
                    <span className="gb-nav-row__label">Ejercicios</span>
                    {uniqueExerciseCount > 0 && (
                      <span className="gb-nav-row__count">{uniqueExerciseCount}</span>
                    )}
                    <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
                  </button>

                  <button
                    className="gb-nav-row"
                    onClick={() => history.push(`/tabs/classes/${classId}/topics`)}
                  >
                    <IonIcon icon={bookOutline} className="gb-nav-row__icon" />
                    <span className="gb-nav-row__label">Temario</span>
                    <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
                  </button>

                  <button
                    className="gb-nav-row gb-nav-row--last"
                    onClick={() => history.push(`/tabs/classes/${classId}/attendance`)}
                  >
                    <IonIcon icon={peopleOutline} className="gb-nav-row__icon" />
                    <span className="gb-nav-row__label">Asistencia</span>
                    <IonIcon icon={chevronForwardOutline} className="gb-nav-row__arrow" />
                  </button>
                </div>
              </>
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
                      <IonItemOption color="primary" onClick={() => setCommentTarget({ id: s.id, name: s.name })}>
                        <IonIcon icon={chatbubbleOutline} slot="icon-only" />
                      </IonItemOption>
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
          onDismiss={() => { setShowBulkExerciseModal(false); setPreselectedWeakAreas([]); }}
          classId={classId}
          weakAreas={preselectedWeakAreas.map(topic => ({ topic }))}
        />

        {/* Quick Comment Modal */}
        <QuickCommentModal
          isOpen={!!commentTarget}
          studentId={commentTarget?.id || ''}
          studentName={commentTarget?.name || ''}
          onDismiss={() => setCommentTarget(null)}
        />

        {/* Delete Class Modal */}
        <IonModal
          isOpen={showDeleteModal}
          onDidDismiss={() => { setShowDeleteModal(false); setDeletePreview(null); }}
          initialBreakpoint={isDesktop ? 1 : 0.5}
          breakpoints={isDesktop ? [0, 1] : [0, 0.5, 0.75]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Eliminar clase</h2>
            <p className="modal-sheet__subtitle">
              ¿Seguro que quieres eliminar "{classGroup?.name}"?
            </p>

            {loadingDeletePreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0' }}>
                <IonSpinner color="primary" />
                <span>Calculando elementos...</span>
              </div>
            ) : deletePreview && (
              <div style={{ padding: '8px 0' }}>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>Se eliminarán permanentemente:</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {deletePreview.counts.students > 0 && (
                    <li>{deletePreview.counts.students} alumno{deletePreview.counts.students !== 1 ? 's' : ''}</li>
                  )}
                  {deletePreview.counts.lectures > 0 && (
                    <li>{deletePreview.counts.lectures} asignatura{deletePreview.counts.lectures !== 1 ? 's' : ''}</li>
                  )}
                  {deletePreview.counts.exams > 0 && (
                    <li>{deletePreview.counts.exams} examen{deletePreview.counts.exams !== 1 ? 'es' : ''}</li>
                  )}
                  {deletePreview.counts.corrections > 0 && (
                    <li>{deletePreview.counts.corrections} corrección{deletePreview.counts.corrections !== 1 ? 'es' : ''}</li>
                  )}
                  {deletePreview.counts.exercises > 0 && (
                    <li>{deletePreview.counts.exercises} ejercicio{deletePreview.counts.exercises !== 1 ? 's' : ''}</li>
                  )}
                </ul>
                <p style={{ color: 'var(--ion-color-danger)', fontSize: 13, marginTop: 12 }}>
                  Esta acción no se puede deshacer.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <IonButton expand="block" fill="outline" onClick={() => { setShowDeleteModal(false); setDeletePreview(null); }}>
                Cancelar
              </IonButton>
              <IonButton
                expand="block"
                color="danger"
                onClick={handleDeleteConfirm}
                disabled={loadingDeletePreview || deleting}
              >
                {deleting ? <IonSpinner name="crescent" /> : 'Eliminar permanentemente'}
              </IonButton>
            </div>
          </div>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default GradeBook;
