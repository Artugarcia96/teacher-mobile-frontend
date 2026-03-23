import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonAlert, IonSegment, IonSegmentButton, IonLabel,
} from '@ionic/react';
import {
  sparkles, chevronForwardOutline, trashOutline,
  checkmarkCircleOutline, peopleOutline, addOutline, medkitOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { classes as classesApi } from '../../services/api';
import { ClassGroup, Exercise } from '../../types';
import EmptyState from '../../components/EmptyState';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import { subjectThemeStyle } from '../../utils/subjectTheme';
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
  exerciseType?: 'practice' | 'recovery';
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
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'corrected'>('all');
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; ids: string[] } | null>(null);
  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

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
    if (classId) fetchClassSubjects(classId);
  }, [classId, subjectId, fetchClasses, fetchStudents, fetchExercises, fetchClassDetails, fetchClassSubjects]);

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
      exerciseType: exs[0]?.exerciseType || 'practice',
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


  const displayClass = classGroup || basicClassGroup;
  const currentSubjectSummary = subjectId ? classSubjects[classId]?.find(s => s.subjectId === subjectId) : undefined;
  const subjectName = currentSubjectSummary?.subjectName;
  const subjectColor = currentSubjectSummary?.subjectColor;
  const aulaLabel = currentSubjectSummary?.aula;
  const pendingCount = new Set(
    exercises.filter(e => e.correctionStatus !== 'corrected').map(e => e.name || e.id)
  ).size;
  const correctedCount = new Set(
    exercises.filter(e => e.correctionStatus === 'corrected').map(e => e.name || e.id)
  ).size;
  const basePath = subjectId
    ? `/tabs/classes/${classId}/subjects/${subjectId}`
    : `/tabs/classes/${classId}`;

  return (
    <IonPage>
      <IonContent className="exercises-list-content" scrollY style={subjectThemeStyle(subjectColor)}>
        {/* Hero Header */}
        <div className="exercises-list-hero" style={subjectColor ? { background: subjectColor } : undefined}>
          <div className="exercises-list-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={basePath} text="" color="light" />
            </IonButtons>
            <div className="exercises-list-hero__center">
              <h1 className="exercises-list-hero__title">Ejercicios</h1>
              <p className="exercises-list-hero__subtitle">
                {subjectName ? `${displayClass?.name} — ${subjectName}` : displayClass?.name}{aulaLabel ? ` · ${aulaLabel}` : ''}
              </p>
            </div>
            <IonButton
              fill="clear"
              size="small"
              onClick={() => setShowGenerateModal(true)}
              className="exercises-list-hero__add-btn"
            >
              <IonIcon icon={addOutline} slot="icon-only" />
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

        {/* Action Toolbar removed - use + button in header */}

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
                const groupStatus = group.correctedCount === group.totalCount ? 'corrected' :
                  group.correctedCount > 0 ? 'in_progress' : 'null';
                const status = statusConfig[groupStatus] || statusConfig.null;
                const firstExercise = group.exercises[0];

                return (
                  <div
                    key={group.name}
                    className="exercises-list-card"
                    onClick={() => {
                      if (firstExercise) {
                        history.push(`${basePath}/exercises/${firstExercise.id}`);
                      }
                    }}
                  >
                    <div className="exercises-list-card__content">
                      <div className="exercises-list-card__header">
                        <div className="exercises-list-card__name-row">
                          <h3 className="exercises-list-card__name">{group.name}</h3>
                          {group.exerciseType === 'recovery' && (
                            <span className="exercises-list-card__type-badge exercises-list-card__type-badge--recovery">
                              <IonIcon icon={medkitOutline} />
                              Recuperación
                            </span>
                          )}
                        </div>
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
                        {group.totalCount > 1 && (
                          <span className="exercises-list-card__count">
                            <IonIcon icon={peopleOutline} />
                            {group.totalCount} alumnos
                          </span>
                        )}
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
                        className="exercises-list-card__delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({
                            name: group.name,
                            ids: group.exercises.map(ex => ex.id),
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

        {/* Delete Alert */}
        <IonAlert
          isOpen={!!deleteTarget}
          onDidDismiss={() => setDeleteTarget(null)}
          header="Eliminar ejercicios"
          message={`¿Eliminar todos los ejercicios "${deleteTarget?.name}" (${deleteTarget?.ids.length})? Esta acción no se puede deshacer.`}
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
          subjectColor={subjectColor}
        />
      </IonContent>
    </IonPage>
  );
};

export default ExercisesList;
