import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonAlert, IonSegment, IonSegmentButton, IonLabel,
} from '@ionic/react';
import { 
  sparkles, chevronForwardOutline, trashOutline, timeOutline,
  checkmarkCircleOutline, peopleOutline, chevronDownOutline, chevronUpOutline,
  cloudUploadOutline, downloadOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { classes as classesApi, exercises as exercisesApi } from '../../services/api';
import { ClassGroup, Exercise } from '../../types';
import EmptyState from '../../components/EmptyState';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import './ExercisesList.css';

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  null: { color: '#64748B', label: 'Pendiente', bg: 'rgba(100, 116, 139, 0.1)' },
  in_progress: { color: '#D97706', label: 'En corrección', bg: 'rgba(217, 119, 6, 0.1)' },
  corrected: { color: '#059669', label: 'Corregido', bg: 'rgba(5, 150, 105, 0.1)' },
};

interface ExerciseGroup {
  name: string;
  exercises: Exercise[];
  latestDate: string;
  correctedCount: number;
  totalCount: number;
}

const ExercisesList: React.FC = () => {
  const { classId, subjectId } = useParams<{ classId: string; subjectId?: string }>();
  const history = useHistory();
  
  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const deleteExercise = useExercisesStore((s) => s.deleteExercise);
  const exercisesLoading = useExercisesStore((s) => s.loading);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'corrected'>('all');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'group' | 'single'; name: string; ids: string[] } | null>(null);
  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);

  const basicClassGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const studentIds = useMemo(() => new Set(students.map(s => s.id)), [students]);
  
  const exercises = useMemo(() => {
    let filtered = allExercises.filter((e) => studentIds.has(e.studentId));
    if (subjectId) {
      filtered = filtered.filter(e => e.subjectId === subjectId);
    }
    return filtered;
  }, [allExercises, studentIds, subjectId]);

  const fetchClassDetails = useCallback(async () => {
    if (!classId) return;
    try {
      const response = await classesApi.get(classId);
      setClassGroup(response.data);
    } catch (err) {
      console.error('Failed to fetch class details:', err);
    }
  }, [classId]);

  useEffect(() => {
    fetchClasses();
    fetchStudents(classId);
    fetchExercises();
    fetchClassDetails();
  }, [classId, fetchClasses, fetchStudents, fetchExercises, fetchClassDetails]);

  // Group exercises by name
  const groupedExercises = useMemo(() => {
    const groups = new Map<string, Exercise[]>();
    exercises.forEach((ex) => {
      const key = ex.name || ex.weakAreas?.join(', ') || 'Ejercicio';
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(ex);
    });
    
    return Array.from(groups.entries()).map(([name, exs]): ExerciseGroup => ({
      name,
      exercises: exs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()),
      latestDate: exs.reduce((latest, ex) => {
        const date = new Date(ex.assignedAt);
        return date > new Date(latest) ? ex.assignedAt : latest;
      }, exs[0]?.assignedAt || ''),
      correctedCount: exs.filter(e => e.correctionStatus === 'corrected').length,
      totalCount: exs.length,
    })).sort((a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime());
  }, [exercises]);

  const filteredGroups = useMemo(() => {
    if (statusFilter === 'all') return groupedExercises;
    
    return groupedExercises.map(group => {
      const filtered = group.exercises.filter(e => 
        statusFilter === 'pending' ? e.correctionStatus !== 'corrected' : e.correctionStatus === 'corrected'
      );
      if (filtered.length === 0) return null;
      return {
        ...group,
        exercises: filtered,
        correctedCount: filtered.filter(e => e.correctionStatus === 'corrected').length,
        totalCount: filtered.length,
      };
    }).filter(Boolean) as ExerciseGroup[];
  }, [groupedExercises, statusFilter]);

  const getStudentName = useCallback((studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'Alumno';
  }, [students]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      for (const id of deleteTarget.ids) {
        await deleteExercise(id);
      }
      await fetchExercises();
    } catch (err) {
      console.error('Failed to delete exercise:', err);
    }
    setDeleteTarget(null);
  };

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleBulkUploadClick = () => {
    history.push(`/exercise-bulk-correction/${classId}`);
  };

  const handleDownloadSingle = async (exerciseId: string, type: 'exercises' | 'solutions') => {
    const url = type === 'exercises'
      ? exercisesApi.downloadExercisesPdf(exerciseId)
      : exercisesApi.downloadSolutionsPdf(exerciseId);
    const token = localStorage.getItem('access_token');
    setDownloading(`${exerciseId}-${type}`);
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${type === 'exercises' ? 'ejercicios' : 'soluciones'}_${exerciseId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadGroup = async (exerciseIds: string[], groupName: string) => {
    if (exerciseIds.length === 0) return;
    setDownloading(`group-${groupName}`);
    try {
      const res = await exercisesApi.batchDownload(exerciseIds, false);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_todos.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('Batch download error:', err);
    } finally {
      setDownloading(null);
    }
  };

  const displayClass = classGroup || basicClassGroup;
  const pendingCount = exercises.filter(e => e.correctionStatus !== 'corrected').length;
  const correctedCount = exercises.filter(e => e.correctionStatus === 'corrected').length;

  return (
    <IonPage>
      <IonContent className="exercises-list-content" scrollY>
        {/* Hero Header */}
        <div className="exercises-list-hero">
          <div className="exercises-list-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}` : `/tabs/classes/${classId}`} text="" color="light" />
            </IonButtons>
            <div className="exercises-list-hero__center">
              <h1 className="exercises-list-hero__title">Ejercicios</h1>
              {displayClass && (
                <p className="exercises-list-hero__subtitle">{displayClass.name}</p>
              )}
            </div>
            <IonButton 
              fill="clear" 
              size="small"
              onClick={() => setShowGenerateModal(true)}
              className="exercises-list-hero__add-btn"
            >
              <IonIcon icon={sparkles} slot="icon-only" />
            </IonButton>
          </div>
        </div>

        {/* Compact Filters */}
        <div className="exercises-list-filters">
          <IonSegment 
            value={statusFilter} 
            onIonChange={(e) => setStatusFilter(e.detail.value as any)}
            className="exercises-list-segment"
          >
            <IonSegmentButton value="all">
              <IonLabel>Todos ({exercises.length})</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="pending">
              <IonLabel>Pendientes ({pendingCount})</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="corrected">
              <IonLabel>Corregidos ({correctedCount})</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>

        {/* Bulk Upload Toolbar */}
        {exercises.length > 0 && (
          <div className="exercises-list-toolbar">
            <IonButton 
              size="small" 
              fill="outline" 
              onClick={handleBulkUploadClick}
            >
              <IonIcon icon={cloudUploadOutline} slot="start" />
              Carga masiva
            </IonButton>
          </div>
        )}

        {/* Exercises List */}
        <div className="exercises-list-container">
          {exercisesLoading ? (
            <div className="exercises-list-loading">
              <IonSpinner color="primary" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <EmptyState
              icon="📚"
              title={exercises.length === 0 ? 'Aún no hay ejercicios' : 'Sin resultados'}
              subtitle={exercises.length === 0 ? 'Genera ejercicios de repaso para tus alumnos' : 'Prueba con otros filtros'}
              actionLabel={exercises.length === 0 ? 'Generar ejercicios' : undefined}
              onAction={exercises.length === 0 ? () => setShowGenerateModal(true) : undefined}
            />
          ) : (
            <div className="exercises-list-items">
              {filteredGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.name);
                const groupStatus = group.correctedCount === group.totalCount ? 'corrected' : 
                  group.correctedCount > 0 ? 'in_progress' : 'null';
                const status = statusConfig[groupStatus] || statusConfig.null;
                
                return (
                  <div key={group.name} className="exercises-list-group">
                    {/* Group Header Card */}
                    <div 
                      className="exercises-list-card exercises-list-card--group"
                      onClick={() => toggleGroup(group.name)}
                    >
                      <div className="exercises-list-card__content">
                        <div className="exercises-list-card__header">
                          <h3 className="exercises-list-card__name">{group.name}</h3>
                          <span 
                            className="exercises-list-card__status"
                            style={{ color: status.color, background: status.bg }}
                          >
                            {status.label}
                          </span>
                        </div>
                        
                        <div className="exercises-list-card__meta">
                          <span className="exercises-list-card__date">
                            {new Date(group.latestDate).toLocaleDateString('es-ES', { 
                              day: 'numeric', 
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                          <span className="exercises-list-card__count">
                            <IonIcon icon={peopleOutline} />
                            {group.totalCount} alumno{group.totalCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        <div className="exercises-list-card__footer">
                          <span className="exercises-list-card__progress">
                            <IonIcon icon={checkmarkCircleOutline} />
                            {group.correctedCount}/{group.totalCount} corregidos
                          </span>
                        </div>
                      </div>
                      
                      <div className="exercises-list-card__actions">
                        <button 
                          className="exercises-list-card__download"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadGroup(group.exercises.map(ex => ex.id), group.name);
                          }}
                          disabled={downloading === `group-${group.name}`}
                          title="Descargar todos los PDFs"
                        >
                          {downloading === `group-${group.name}` ? (
                            <IonSpinner name="crescent" />
                          ) : (
                            <IonIcon icon={downloadOutline} />
                          )}
                        </button>
                        <button 
                          className="exercises-list-card__delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget({
                              type: 'group',
                              name: group.name,
                              ids: group.exercises.map(ex => ex.id),
                            });
                          }}
                        >
                          <IonIcon icon={trashOutline} />
                        </button>
                        <IonIcon 
                          icon={isExpanded ? chevronUpOutline : chevronDownOutline} 
                          className="exercises-list-card__expand" 
                        />
                      </div>
                    </div>

                    {/* Expanded: Individual exercises */}
                    {isExpanded && (
                      <div className="exercises-list-group__items">
                        {group.exercises.map((exercise) => {
                          const exStatus = statusConfig[exercise.correctionStatus || 'null'] || statusConfig.null;
                          const studentName = getStudentName(exercise.studentId);
                          
                          return (
                            <div 
                              key={exercise.id} 
                              className="exercises-list-card exercises-list-card--child"
                              onClick={() => history.push(subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}/exercises/${exercise.id}` : `/tabs/classes/${classId}/exercises/${exercise.id}`)}
                            >
                              <div className="exercises-list-card__content">
                                <div className="exercises-list-card__header">
                                  <h3 className="exercises-list-card__name">{studentName}</h3>
                                  <span 
                                    className="exercises-list-card__status"
                                    style={{ color: exStatus.color, background: exStatus.bg }}
                                  >
                                    {exStatus.label}
                                  </span>
                                </div>
                                
                                <div className="exercises-list-card__meta">
                                  <span className="exercises-list-card__date">
                                    {new Date(exercise.assignedAt).toLocaleDateString('es-ES', { 
                                      day: 'numeric', 
                                      month: 'short'
                                    })}
                                  </span>
                                  <span className="exercises-list-card__questions">
                                    {exercise.questions?.length || 0} preguntas
                                  </span>
                                  {exercise.deliveryDate && (
                                    <span className="exercises-list-card__delivery">
                                      <IonIcon icon={timeOutline} />
                                      {new Date(exercise.deliveryDate).toLocaleDateString('es-ES', {
                                        day: 'numeric',
                                        month: 'short'
                                      })}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="exercises-list-card__actions">
                                <button
                                  className="exercises-list-card__download"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadSingle(exercise.id, 'exercises');
                                  }}
                                  disabled={downloading === `${exercise.id}-exercises`}
                                  title="Descargar PDF"
                                >
                                  {downloading === `${exercise.id}-exercises` ? (
                                    <IonSpinner name="crescent" />
                                  ) : (
                                    <IonIcon icon={downloadOutline} />
                                  )}
                                </button>
                                {exercise.correctionStatus !== 'corrected' && (
                                  <button
                                    className="exercises-list-card__upload"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      history.push(`/exercise-correction/${exercise.id}`);
                                    }}
                                    title="Subir y corregir"
                                  >
                                    <IonIcon icon={cloudUploadOutline} />
                                  </button>
                                )}
                                <button 
                                  className="exercises-list-card__delete"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget({
                                      type: 'single',
                                      name: `${group.name} - ${studentName}`,
                                      ids: [exercise.id],
                                    });
                                  }}
                                >
                                  <IonIcon icon={trashOutline} />
                                </button>
                                <IonIcon icon={chevronForwardOutline} className="exercises-list-card__arrow" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Delete Alert */}
        <IonAlert
          isOpen={!!deleteTarget}
          onDidDismiss={() => setDeleteTarget(null)}
          header={deleteTarget?.type === 'group' ? 'Eliminar grupo de ejercicios' : 'Eliminar ejercicio'}
          message={
            deleteTarget?.type === 'group' 
              ? `¿Eliminar todos los ejercicios "${deleteTarget.name}" (${deleteTarget.ids.length})? Esta acción no se puede deshacer.`
              : `¿Eliminar "${deleteTarget?.name}"? Esta acción no se puede deshacer.`
          }
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDelete }
          ]}
        />

        {/* Generate Modal */}
        <ExerciseGeneratorModal
          isOpen={showGenerateModal}
          onDismiss={() => {
            setShowGenerateModal(false);
            fetchExercises();
          }}
          classId={classId}
          preselectedSubjectId={subjectId}
        />
      </IonContent>
    </IonPage>
  );
};

export default ExercisesList;
