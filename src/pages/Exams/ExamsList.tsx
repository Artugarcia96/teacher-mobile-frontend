import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton, IonButton, IonIcon,
  IonSpinner, IonAlert, IonSegment, IonSegmentButton, IonLabel,
  IonSelect, IonSelectOption,
} from '@ionic/react';
import { 
  addOutline, chevronForwardOutline, trashOutline, timeOutline,
  alertCircleOutline, checkmarkCircleOutline
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useClassesStore } from '../../store/classesStore';
import { classes as classesApi, subjects as subjectsApi } from '../../services/api';
import { ClassGroup, Exam } from '../../types';
import EmptyState from '../../components/EmptyState';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useDashboardStore } from '../../store/dashboardStore';
import './ExamsList.css';

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  uploaded: { color: '#64748B', label: 'Subido', bg: 'rgba(100, 116, 139, 0.1)' },
  assigned: { color: '#D97706', label: 'Por corregir', bg: 'rgba(217, 119, 6, 0.1)' },
  corrected: { color: '#059669', label: 'Corregido', bg: 'rgba(5, 150, 105, 0.1)' },
};

const deadlineConfig: Record<string, { color: string; label: string }> = {
  ok: { color: '#059669', label: 'En plazo' },
  soon: { color: '#D97706', label: 'Próximo' },
  urgent: { color: '#DC2626', label: 'Urgente' },
  overdue: { color: '#DC2626', label: 'Vencido' },
  completed: { color: '#059669', label: 'Completado' },
};

const ExamsList: React.FC = () => {
  const { classId, subjectId } = useParams<{ classId: string; subjectId?: string }>();
  const history = useHistory();
  
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const deleteExam = useExamsStore((s) => s.deleteExam);
  const examsLoading = useExamsStore((s) => s.loading);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const allCorrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);
  
  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const [statusFilter, setStatusFilter] = useState<'all' | 'uploaded' | 'assigned' | 'corrected'>('all');
  const [lectureFilter, setLectureFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);

  const basicClassGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const exams = useMemo(() => allExams.filter((e) => e.classId === classId && (!subjectId || e.subjectId === subjectId)), [allExams, classId, subjectId]);

  const fetchClassDetails = useCallback(async () => {
    if (!classId) return;
    try {
      const response = await classesApi.get(classId);
      setClassGroup(response.data);
    } catch (err) {
      console.error('Failed to fetch class details:', err);
    }
  }, [classId]);

  const fetchSubjectName = useCallback(async () => {
    if (!subjectId) return;
    try {
      const response = await subjectsApi.get(subjectId);
      setSubjectName(response.data.name);
    } catch (err) {
      console.error('Failed to fetch subject:', err);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchClasses();
    fetchExams(classId, subjectId);
    fetchStudents(classId);
    fetchAllCorrections();
    fetchClassDetails();
    fetchSubjectName();
    if (classId) fetchClassSubjects(classId);
  }, [classId, subjectId, fetchClasses, fetchExams, fetchStudents, fetchAllCorrections, fetchClassDetails, fetchSubjectName, fetchClassSubjects]);

  const filteredExams = useMemo(() => {
    let filtered = [...exams];
    
    if (lectureFilter !== 'all') {
      filtered = filtered.filter(e => e.lectureId === lectureFilter);
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => e.status === statusFilter);
    }
    
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [exams, lectureFilter, statusFilter]);

  const getExamCorrections = useCallback((examId: string) => {
    return allCorrections.filter(c => c.examId === examId);
  }, [allCorrections]);

  const getLectureName = useCallback((lectureId?: string) => {
    if (!lectureId) return undefined;
    const cg = classGroup || basicClassGroup;
    return cg?.lectures?.find(l => l.id === lectureId)?.name;
  }, [classGroup, basicClassGroup]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExam(deleteTarget.id);
      await fetchExams(classId, subjectId);
      fetchDashboard();
    } catch (err) {
      console.error('Failed to delete exam:', err);
    }
    setDeleteTarget(null);
  };

  const displayClass = classGroup || basicClassGroup;
  const currentSubjectSummary = subjectId ? classSubjects[classId]?.find(s => s.subjectId === subjectId) : null;
  const subjectColor = currentSubjectSummary?.subjectColor;
  const aulaLabel = currentSubjectSummary?.aula;
  const basePath = subjectId
    ? `/tabs/classes/${classId}/subjects/${subjectId}`
    : `/tabs/classes/${classId}`;
  const examsBasePath = `${basePath}/exams`;

  return (
    <IonPage>
      <IonContent className="exams-list-content" scrollY style={subjectThemeStyle(subjectColor)}>
        {/* Hero Header */}
        <div className="exams-list-hero" style={subjectColor ? { background: subjectColor } : undefined}>
          <div className="exams-list-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={basePath} text="" color="light" />
            </IonButtons>
            <div className="exams-list-hero__center">
              <h1 className="exams-list-hero__title">Exámenes</h1>
              {(displayClass || subjectName) && (
                <p className="exams-list-hero__subtitle">
                  {displayClass?.name}{subjectName ? ` — ${subjectName}` : ''}{aulaLabel ? ` · ${aulaLabel}` : ''}
                </p>
              )}
            </div>
            <IonButton 
              fill="clear" 
              size="small"
              onClick={() => history.push(`${examsBasePath}/new`)}
              className="exams-list-hero__add-btn"
            >
              <IonIcon icon={addOutline} slot="icon-only" />
            </IonButton>
          </div>
        </div>

        {/* Compact Filters */}
        <div className="exams-list-filters">
          <IonSegment 
            value={statusFilter} 
            onIonChange={(e) => setStatusFilter(e.detail.value as any)}
            className="exams-list-segment"
          >
            <IonSegmentButton value="all">
              <IonLabel>Todos</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="assigned">
              <IonLabel>Pendientes</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="corrected">
              <IonLabel>Corregidos</IonLabel>
            </IonSegmentButton>
          </IonSegment>
          
          {!subjectId && displayClass?.lectures && displayClass.lectures.length > 1 && (
            <IonSelect
              value={lectureFilter}
              onIonChange={(e) => setLectureFilter(e.detail.value)}
              interface="popover"
              className="exams-list-lecture-select"
            >
              <IonSelectOption value="all">Todas las asignaturas</IonSelectOption>
              {displayClass.lectures.map((lecture) => (
                <IonSelectOption key={lecture.id} value={lecture.id}>
                  {lecture.name}
                </IonSelectOption>
              ))}
            </IonSelect>
          )}
        </div>

        {/* Exams List */}
        <div className="exams-list-container">
          {examsLoading ? (
            <div className="exams-list-loading">
              <IonSpinner color="primary" />
            </div>
          ) : filteredExams.length === 0 ? (
            <EmptyState
              icon="📝"
              title={exams.length === 0 ? 'Aún no hay exámenes' : 'Sin resultados'}
              subtitle={exams.length === 0 ? 'Crea tu primer examen para esta clase' : 'Prueba con otros filtros'}
              actionLabel={exams.length === 0 ? 'Crear examen' : undefined}
              onAction={exams.length === 0 ? () => history.push(`${examsBasePath}/new`) : undefined}
            />
          ) : (
            <div className="exams-list-items">
              {filteredExams.map((exam) => {
                const status = statusConfig[exam.status] || statusConfig.uploaded;
                const corrections = getExamCorrections(exam.id);
                const correctedCount = corrections.filter(c => c.grade !== null || c.aiProcessed).length;
                const deadline = exam.deadlineStatus ? deadlineConfig[exam.deadlineStatus] : null;
                const lectureName = getLectureName(exam.lectureId);
                
                return (
                  <div 
                    key={exam.id} 
                    className="exams-list-card"
                    onClick={() => history.push(`${examsBasePath}/${exam.id}`)}
                  >
                    <div className="exams-list-card__content">
                      <div className="exams-list-card__header">
                        <h3 className="exams-list-card__name">{exam.name}</h3>
                        <span 
                          className="exams-list-card__status"
                          style={{ color: status.color, background: status.bg }}
                        >
                          {status.label}
                        </span>
                      </div>
                      
                      <div className="exams-list-card__meta">
                        <span className="exams-list-card__date">
                          {new Date(exam.date).toLocaleDateString('es-ES', { 
                            day: 'numeric', 
                            month: 'short',
                            year: 'numeric'
                          })}
                        </span>
                        {lectureName && (
                          <span className="exams-list-card__lecture">{lectureName}</span>
                        )}
                      </div>
                      
                      <div className="exams-list-card__footer">
                        {exam.status !== 'uploaded' && (
                          <span className="exams-list-card__progress">
                            <IonIcon icon={checkmarkCircleOutline} />
                            {correctedCount}/{students.length} corregidos
                          </span>
                        )}
                        {deadline && exam.status !== 'corrected' && exam.correctionDeadline && (
                          <span 
                            className="exams-list-card__deadline"
                            style={{ color: deadline.color }}
                          >
                            <IonIcon icon={deadline.label === 'Vencido' ? alertCircleOutline : timeOutline} />
                            {deadline.label}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="exams-list-card__actions">
                      <button 
                        className="exams-list-card__delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(exam);
                        }}
                      >
                        <IonIcon icon={trashOutline} />
                      </button>
                      <IonIcon icon={chevronForwardOutline} className="exams-list-card__arrow" />
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
          header="Eliminar examen"
          message={`¿Eliminar "${deleteTarget?.name}"? También se eliminarán las correcciones asociadas.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDelete }
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

export default ExamsList;
