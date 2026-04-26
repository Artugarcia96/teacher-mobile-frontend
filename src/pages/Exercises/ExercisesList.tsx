import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronRight, CheckCircle, Users, Cross } from 'lucide-react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { fetchRegistry } from '../../store/fetchRegistry';
import { classes as classesApi } from '../../services/api';
import { ClassGroup, Exercise } from '../../types';
import EmptyState from '../../components/EmptyState';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import Spinner from '@/components/shared/Spinner';
import AlertConfirm from '@/components/shared/AlertConfirm';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SubjectPageHeader from '../../components/SubjectPageHeader';
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
  const { classId, subjectId } = useParams() as { classId: string; subjectId?: string };
  const navigate = useNavigate();

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
  const [calendarTopicIds, setCalendarTopicIds] = useState<string[]>([]);
  const [calendarName, setCalendarName] = useState('');

  const location = useLocation();

  // Auto-open generate modal from calendar navigation (?generate=1)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('generate') === '1') {
      setCalendarTopicIds(params.get('topicIds')?.split(',').filter(Boolean) || []);
      setCalendarName(params.get('name') || '');
      setShowGenerateModal(true);
      // Clean up URL
      navigate(location.pathname, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (classId && fetchRegistry.isStale(`classSubjects-${classId}`, 60_000)) {
      fetchClassSubjects(classId);
      fetchRegistry.register(`classSubjects-${classId}`);
    }
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
      await Promise.all(deleteTarget.ids.map((id) => deleteExercise(id)));
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
    : '/tabs/classes';

  return (
    <div className="flex flex-col h-full min-h-0" style={subjectThemeStyle(subjectColor)}>
      <SubjectPageHeader
        eyebrow={displayClass?.name || (subjectName ? '' : 'Clases')}
        title={`${subjectName || displayClass?.name || ''}${subjectName ? ' · ' : ''}Ejercicios`}
        sub={aulaLabel || undefined}
        backHref={basePath}
        actions={(
          <button
            type="button"
            onClick={() => setShowGenerateModal(true)}
            aria-label="Nuevo ejercicio"
          >
            <Plus size={14} />
            Nuevo
          </button>
        )}
      />

      {/* Compact Filters */}
      <div className="exercises-list-filters">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as any)}
          className="w-full"
        >
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">Todos ({exercises.length})</TabsTrigger>
            <TabsTrigger value="pending" className="flex-1">Pendientes ({pendingCount})</TabsTrigger>
            <TabsTrigger value="corrected" className="flex-1">Corregidos ({correctedCount})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Exercises List */}
      <div className="flex-1 overflow-y-auto">
        <div className="exercises-list-container">
          {exercisesLoading ? (
            <div className="exercises-list-loading">
              <Spinner />
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
                        navigate(`${basePath}/exercises/${firstExercise.id}`);
                      }
                    }}
                  >
                    <div className="exercises-list-card__content">
                      <div className="exercises-list-card__header">
                        <div className="exercises-list-card__name-row">
                          <h3 className="exercises-list-card__name">{group.name}</h3>
                          {group.exerciseType === 'recovery' && (
                            <span className="exercises-list-card__type-badge exercises-list-card__type-badge--recovery">
                              <Cross size={12} />
                              Repaso
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
                            <Users size={12} />
                            {group.totalCount} alumnos
                          </span>
                        )}
                      </div>

                      <div className="exercises-list-card__footer">
                        <span className="exercises-list-card__progress">
                          <CheckCircle size={12} className="text-emerald-600" />
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
                        <Trash2 size={16} />
                      </button>
                      <ChevronRight size={18} className="text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Alert */}
      <AlertConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        header="Eliminar ejercicios"
        message={`¿Eliminar todos los ejercicios "${deleteTarget?.name}" (${deleteTarget?.ids.length})? Esta acción no se puede deshacer.`}
        cancelText="Cancelar"
        confirmText="Eliminar"
        variant="destructive"
        onConfirm={handleDelete}
      />

      {/* Generate Modal */}
      <ExerciseGeneratorModal
        isOpen={showGenerateModal}
        onDismiss={() => {
          setShowGenerateModal(false);
          setCalendarTopicIds([]);
          setCalendarName('');
          fetchExercises();
        }}
        classId={classId}
        preselectedSubjectId={subjectId}
        preselectedTopicIds={calendarTopicIds}
        preselectedName={calendarName}
        subjectColor={subjectColor}
      />
    </div>
  );
};

export default ExercisesList;
