import { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonSearchbar, IonModal, IonItem, IonLabel, IonInput, IonList,
  IonButtons, IonIcon, IonSpinner, IonItemSliding, IonItemOptions, IonItemOption,
  IonAlert, IonBadge, IonToast, useIonViewWillEnter,
} from '@ionic/react';
import { addOutline, swapVerticalOutline, alertCircleOutline, chevronForwardOutline, chevronDownOutline, trashOutline, closeOutline, checkboxOutline, squareOutline, settingsOutline } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { useClassesStore, DeletePreview } from '../../store/classesStore';
import { useExamsStore } from '../../store/examsStore';
import { useCalendarStore, getBreakdownsForClass } from '../../store/calendarStore';
import { ClassSubjectSummary } from '../../types';
import EmptyState from '../../components/EmptyState';
import SubjectDayInsight from '../../components/SubjectDayInsight';
import './Classes.css';

const AVATAR_COLORS = [
  '#15665E', '#1E8A7F', '#059669', '#0891B2', '#E87A1C',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const Classes: React.FC = () => {
  const history = useHistory();
  const allClasses = useClassesStore((s) => s.classes);
  const addClass = useClassesStore((s) => s.addClass);
  const deleteClassPermanently = useClassesStore((s) => s.deleteClassPermanently);
  const bulkDeleteClasses = useClassesStore((s) => s.bulkDeleteClasses);
  const getDeletePreview = useClassesStore((s) => s.getDeletePreview);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const loading = useClassesStore((s) => s.loading);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

  const currentPreparation = useCalendarStore((s) => s.currentPreparation);
  const getPreparation = useCalendarStore((s) => s.getPreparation);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'subject' | 'students'>('name');
  
  // Selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Toast notifications
  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger' | 'warning'>('success');

  // Expandable class cards
  const [expandedClasses, setExpandedClasses] = useState<Record<string, boolean>>({});

  // Class creation fields
  const [newName, setNewName] = useState('');
  const [yearFrom, setYearFrom] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-09-01`;
  });
  const [yearTo, setYearTo] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
    return `${y}-06-30`;
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchClasses();
    fetchExams();
    // Load today's preparation silently (reuse data from "Prepara tu día")
    if (!currentPreparation || currentPreparation.prep_date !== todayStr) {
      getPreparation(todayStr);
    }
  }, [fetchClasses, fetchExams]);

  // Fetch subjects for all visible classes
  useEffect(() => {
    classes.forEach((c) => {
      if (!classSubjects[c.id]) {
        fetchClassSubjects(c.id);
      }
    });
  }, [classes, classSubjects, fetchClassSubjects]);

  // Refresh data when tab becomes visible
  useIonViewWillEnter(() => {
    fetchClasses();
    fetchExams();
    // Refresh subjects too
    classes.forEach((c) => fetchClassSubjects(c.id));
  });

  const pendingByClass = useMemo(() => {
    const map = new Map<string, number>();
    allExams.forEach(exam => {
      if (exam.status === 'assigned' && exam.classId) {
        map.set(exam.classId, (map.get(exam.classId) || 0) + 1);
      }
    });
    return map;
  }, [allExams]);

  const totalPending = useMemo(() => {
    return allExams.filter(e => e.status === 'assigned').length;
  }, [allExams]);

  const filtered = useMemo(() => {
    let result = classes.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.subject.toLowerCase().includes(search.toLowerCase())
    );
    
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'subject':
          return a.subject.localeCompare(b.subject);
        case 'students':
          return (b.studentCount || 0) - (a.studentCount || 0);
        default:
          return 0;
      }
    });
    
    return result;
  }, [classes, search, sortBy]);

  const toggleExpand = (classId: string) => {
    setExpandedClasses((prev) => ({
      ...prev,
      [classId]: !prev[classId],
    }));
    // Fetch subjects if not already loaded
    if (!classSubjects[classId]) {
      fetchClassSubjects(classId);
    }
  };

  const yearLabel = `${yearFrom.slice(0, 4)}-${yearTo.slice(0, 4)}`;

  const resetModal = () => {
    setNewName('');
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await addClass({ name: newName.trim(), year: yearLabel });
      resetModal();
      setShowModal(false);
      history.push(`/tabs/classes/${id}/settings`);
    } catch (err) {
      console.error('Failed to create class:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleStartDelete = async (id: string, name: string) => {
    setDeleteTarget({ id, name });
    setLoadingPreview(true);
    try {
      const preview = await getDeletePreview(id);
      setDeletePreview(preview);
    } catch (err) {
      console.error('Failed to get delete preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteClassPermanently(deleteTarget.id);
      // Refresh dependent stores after deletion
      await Promise.all([
        fetchClasses(),
        fetchExams(),
      ]);
      setToastMessage('Clase eliminada correctamente');
      setToastColor('success');
    } catch (err) {
      console.error(err);
      setToastMessage('Error al eliminar la clase');
      setToastColor('danger');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      setDeletePreview(null);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
    setDeletePreview(null);
  };

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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    if (selectedIds.size === 1) {
      // Single class deletion - use existing flow
      const firstId = Array.from(selectedIds)[0];
      const classToDelete = classes.find(c => c.id === firstId);
      if (classToDelete) {
        handleStartDelete(classToDelete.id, classToDelete.name);
      }
    } else {
      // Multiple classes deletion - use bulk delete endpoint
      setDeleting(true);
      
      try {
        const result = await bulkDeleteClasses(Array.from(selectedIds));
        
        // Refresh dependent stores after deletion
        await Promise.all([
          fetchClasses(),
          fetchExams(),
        ]);
        
        // Show result feedback
        if (result.errors.length === 0) {
          setToastMessage(`${result.deleted} ${result.deleted === 1 ? 'clase eliminada' : 'clases eliminadas'} correctamente`);
          setToastColor('success');
        } else {
          setToastMessage(`${result.deleted} clases eliminadas, ${result.errors.length} fallaron`);
          setToastColor('warning');
          console.warn('Delete errors:', result.errors);
        }
      } catch (err) {
        console.error('Bulk delete failed:', err);
        setToastMessage('Error al eliminar las clases');
        setToastColor('danger');
      } finally {
        setDeleting(false);
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          {selectionMode ? (
            <>
              <IonButtons slot="start">
                <IonButton onClick={exitSelectionMode}>
                  <IonIcon icon={closeOutline} />
                </IonButton>
              </IonButtons>
              <IonTitle>{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</IonTitle>
              <IonButtons slot="end">
                <IonButton 
                  color="danger" 
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.size === 0 || deleting}
                >
                  {deleting ? <IonSpinner name="crescent" /> : <IonIcon icon={trashOutline} />}
                </IonButton>
              </IonButtons>
            </>
          ) : (
            <>
              <IonTitle>Clases</IonTitle>
              <IonButtons slot="end">
                {classes.length > 0 && (
                  <IonButton onClick={() => setSelectionMode(true)}>
                    <IonIcon icon={trashOutline} />
                  </IonButton>
                )}
                <IonButton onClick={() => setShowModal(true)}>
                  <IonIcon icon={addOutline} />
                </IonButton>
              </IonButtons>
            </>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="classes-controls">
          <IonSearchbar
            value={search}
            onIonInput={(e) => setSearch(e.detail.value ?? '')}
            placeholder="Buscar clases..."
            className="classes-search"
          />
          
          {classes.length > 1 && (
            <div className="classes-sort">
              <IonIcon icon={swapVerticalOutline} className="classes-sort__icon" />
              <div className="classes-sort__chips">
                <button
                  className={`classes-sort__chip ${sortBy === 'name' ? 'classes-sort__chip--active' : ''}`}
                  onClick={() => setSortBy('name')}
                >
                  Nombre
                </button>
                <button
                  className={`classes-sort__chip ${sortBy === 'subject' ? 'classes-sort__chip--active' : ''}`}
                  onClick={() => setSortBy('subject')}
                >
                  Asignatura
                </button>
                <button
                  className={`classes-sort__chip ${sortBy === 'students' ? 'classes-sort__chip--active' : ''}`}
                  onClick={() => setSortBy('students')}
                >
                  Alumnos
                </button>
              </div>
            </div>
          )}
        </div>

        {totalPending > 0 && (
          <div className="classes-pending-banner">
            <div className="classes-pending-banner__icon">
              <IonIcon icon={alertCircleOutline} />
            </div>
            <div className="classes-pending-banner__content">
              <span className="classes-pending-banner__title">
                {totalPending} {totalPending === 1 ? 'examen pendiente' : 'exámenes pendientes'} de corregir
              </span>
              <span className="classes-pending-banner__subtitle">
                En {pendingByClass.size} {pendingByClass.size === 1 ? 'clase' : 'clases'}
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="classes-loading"><IonSpinner color="primary" /></div>
        )}

        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Aún no hay clases"
            subtitle="Crea tu primera clase para empezar"
            actionLabel="Nueva clase"
            onAction={() => setShowModal(true)}
          />
        ) : (
          <div className="classes-grid">
            {filtered.map((c) => {
              const pending = pendingByClass.get(c.id) || 0;
              const isSelected = selectedIds.has(c.id);
              const isExpanded = !!expandedClasses[c.id];
              const subjects: ClassSubjectSummary[] = classSubjects[c.id] || [];

              return (
                <IonItemSliding key={c.id} disabled={selectionMode}>
                  <div className={`class-card-wrapper ${isExpanded ? 'class-card-wrapper--expanded' : ''}`}>
                    <div
                      className={`class-card ${pending > 0 ? 'class-card--has-pending' : ''} ${selectionMode ? 'class-card--selectable' : ''} ${isSelected ? 'class-card--selected' : ''} ${isExpanded ? 'class-card--expanded' : ''}`}
                    >
                      {selectionMode && (
                        <div className="class-card__checkbox" onClick={() => toggleSelection(c.id)}>
                          <IonIcon
                            icon={isSelected ? checkboxOutline : squareOutline}
                            color={isSelected ? 'primary' : 'medium'}
                          />
                        </div>
                      )}
                      <div className="class-card__avatar" style={{ background: avatarColor(c.name) }}>
                        {c.name.charAt(0)}
                        {pending > 0 && (
                          <span className="class-card__pending-dot" />
                        )}
                      </div>
                      <div
                        className="class-card__info"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectionMode) {
                            toggleSelection(c.id);
                          } else {
                            history.push(`/tabs/classes/${c.id}`);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="class-card__name">{c.name}</span>
                        {pending > 0 && (
                          <span className="class-card__pending-text">
                            {pending} {pending === 1 ? 'pendiente' : 'pendientes'}
                          </span>
                        )}
                        {!selectionMode && subjects.length > 0 && (
                          <div className="class-card__subjects">
                            {subjects.slice(0, 3).map((subj) => (
                              <span
                                key={subj.subjectId}
                                className="class-card__subject-chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  history.push(`/tabs/classes/${c.id}/subjects/${subj.subjectId}`);
                                }}
                              >
                                {subj.subjectName}
                                {subj.pendingCorrections > 0 && (
                                  <span className="class-card__subject-chip-badge">{subj.pendingCorrections}</span>
                                )}
                              </span>
                            ))}
                            {subjects.length > 3 && (
                              <span className="class-card__subject-more">+{subjects.length - 3}</span>
                            )}
                          </div>
                        )}
                        {!selectionMode && subjects.length === 0 && (
                          <span
                            className="class-card__no-subjects"
                            onClick={(e) => {
                              e.stopPropagation();
                              history.push(`/tabs/classes/${c.id}/settings`);
                            }}
                          >
                            Sin asignaturas
                          </span>
                        )}
                      </div>
                      <div className="class-card__right">
                        {!selectionMode && (
                          <>
                            <div className="class-card__stats">
                              <div className="class-card__stat">
                                <span className="class-card__stat-value">{c.studentCount}</span>
                                <span className="class-card__stat-label">alumnos</span>
                              </div>
                            </div>
                            <button
                              className="class-card__expand-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(c.id);
                              }}
                            >
                              <IonIcon
                                icon={chevronDownOutline}
                                className={`class-card__expand-icon ${isExpanded ? 'class-card__expand-icon--rotated' : ''}`}
                              />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {isExpanded && !selectionMode && (
                      <div className="class-card__subjects-list">
                        {subjects.length === 0 ? (
                          <div
                            className="class-card__subject-row class-card__subject-row--empty"
                            onClick={() => history.push(`/tabs/classes/${c.id}/settings`)}
                          >
                            <span className="class-card__subject-name">Sin asignaturas</span>
                            <IonIcon icon={settingsOutline} className="class-card__subject-settings-icon" />
                          </div>
                        ) : (
                          subjects.map((subj) => (
                            <div
                              key={subj.subjectId}
                              className="class-card__subject-row"
                              onClick={() => history.push(`/tabs/classes/${c.id}/subjects/${subj.subjectId}`)}
                            >
                              <span className="class-card__subject-name">{subj.subjectName}</span>
                              <div className="class-card__subject-stats">
                                {subj.examCount > 0 && (
                                  <span className="class-card__subject-exam-count">
                                    {subj.examCount} {subj.examCount === 1 ? 'examen' : 'exám.'}
                                  </span>
                                )}
                                {subj.pendingCorrections > 0 && (
                                  <IonBadge color="danger" className="class-card__subject-pending-badge">
                                    {subj.pendingCorrections} pend.
                                  </IonBadge>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                        {/* Today's AI insights for this class */}
                        {(() => {
                          const classBreakdowns = getBreakdownsForClass(currentPreparation, c.id);
                          return classBreakdowns.length > 0 ? (
                            <div className="class-card__insights">
                              {classBreakdowns.map((bd, idx) => (
                                <SubjectDayInsight key={idx} breakdown={bd} compact />
                              ))}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                  <IonItemOptions side="end">
                    <IonItemOption color="danger" onClick={() => handleStartDelete(c.id, c.name)}>
                      Eliminar
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              );
            })}
          </div>
        )}

        {/* Enhanced Delete Confirmation Modal */}
        <IonModal
          isOpen={!!deleteTarget}
          onDidDismiss={handleCancelDelete}
          initialBreakpoint={0.55}
          breakpoints={[0, 0.55, 0.75]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Eliminar clase</h2>
            <p className="modal-sheet__subtitle">
              ¿Seguro que quieres eliminar "{deleteTarget?.name}"?
            </p>
            
            {loadingPreview ? (
              <div className="delete-preview-loading">
                <IonSpinner color="primary" />
                <span>Calculando elementos...</span>
              </div>
            ) : deletePreview && (
              <div className="delete-preview">
                <p className="delete-preview__warning">
                  Se eliminarán permanentemente:
                </p>
                <ul className="delete-preview__list">
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
                  {deletePreview.counts.calendar_events > 0 && (
                    <li>{deletePreview.counts.calendar_events} evento{deletePreview.counts.calendar_events !== 1 ? 's' : ''} del calendario</li>
                  )}
                  {deletePreview.counts.notes > 0 && (
                    <li>{deletePreview.counts.notes} nota{deletePreview.counts.notes !== 1 ? 's' : ''}</li>
                  )}
                </ul>
                <p className="delete-preview__note">
                  Esta acción no se puede deshacer.
                </p>
              </div>
            )}
            
            <div className="delete-modal-buttons">
              <IonButton expand="block" fill="outline" onClick={handleCancelDelete}>
                Cancelar
              </IonButton>
              <IonButton 
                expand="block" 
                color="danger" 
                onClick={handleDeleteConfirm}
                disabled={loadingPreview || deleting}
              >
                {deleting ? <IonSpinner name="crescent" /> : 'Eliminar permanentemente'}
              </IonButton>
            </div>
          </div>
        </IonModal>

        {/* Create class modal - simplified */}
        <IonModal
          isOpen={showModal}
          onDidDismiss={() => { setShowModal(false); resetModal(); }}
          initialBreakpoint={0.45}
          breakpoints={[0, 0.45, 0.6]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Nueva clase</h2>
            <IonList>
              <IonItem>
                <IonLabel position="stacked">Nombre de la clase</IonLabel>
                <IonInput value={newName} onIonInput={(e) => setNewName(e.detail.value ?? '')} placeholder="ej. 1A, 2B, 3ESO..." />
              </IonItem>
            </IonList>

            <div className="curso-dates">
              <span className="curso-dates__label">Curso escolar</span>
              <div className="curso-dates__row">
                <IonItem lines="none" className="curso-dates__field">
                  <IonLabel position="stacked">Desde</IonLabel>
                  <IonInput type="date" value={yearFrom} onIonInput={(e) => setYearFrom(e.detail.value ?? '')} />
                </IonItem>
                <IonItem lines="none" className="curso-dates__field">
                  <IonLabel position="stacked">Hasta</IonLabel>
                  <IonInput type="date" value={yearTo} onIonInput={(e) => setYearTo(e.detail.value ?? '')} />
                </IonItem>
              </div>
            </div>

            <p className="modal-hint">Después de crear la clase podrás añadir asignaturas, horarios y alumnos.</p>

            <IonButton
              expand="block"
              onClick={handleCreate}
              className="ion-margin-top"
              disabled={creating || !newName.trim()}
            >
              {creating ? <IonSpinner name="crescent" /> : 'Crear clase'}
            </IonButton>
          </div>
        </IonModal>

        {/* Toast for feedback */}
        <IonToast
          isOpen={!!toastMessage}
          message={toastMessage}
          duration={3000}
          color={toastColor}
          onDidDismiss={() => setToastMessage('')}
        />
      </IonContent>
    </IonPage>
  );
};

export default Classes;
