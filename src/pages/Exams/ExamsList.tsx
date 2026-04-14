import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, ChevronRight, Trash2, Clock, AlertCircle, CheckCircle, Sparkles, ScanLine, Filter } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useClassesStore } from '../../store/classesStore';
import { fetchRegistry } from '../../store/fetchRegistry';
import { classes as classesApi, subjects as subjectsApi } from '../../services/api';
import { ClassGroup, Exam } from '../../types';
import EmptyState from '../../components/EmptyState';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useDashboardStore } from '../../store/dashboardStore';
import PageShell from '@/components/shared/PageShell';
import Spinner from '@/components/shared/Spinner';
import AlertConfirm from '@/components/shared/AlertConfirm';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { EXAM_STATUS_CONFIG, EXAM_DEADLINE_CONFIG, EXAM_ORIGIN_CONFIG, STATUS_FILTER_OPTIONS } from './examConstants';
import './ExamsList.css';

const ExamsList: React.FC = () => {
  const { classId, subjectId } = useParams() as { classId: string; subjectId?: string };
  const navigate = useNavigate();

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
  const classSubjectsLoaded = useClassesStore((s) => s.classSubjectsLoaded);

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_validation' | 'pending_schedule' | 'scheduled' | 'pending_correction' | 'corrected'>('all');
  const [lectureFilter, setLectureFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);
  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);

  const basicClassGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);
  const exams = useMemo(() => allExams.filter((e) => {
    // Match via direct fields OR via assignments
    const directMatch = e.classId === classId && (!subjectId || e.subjectId === subjectId);
    const assignmentMatch = e.assignments?.some(a => a.classId === classId && (!subjectId || a.subjectId === subjectId));
    return directMatch || assignmentMatch;
  }), [allExams, classId, subjectId]);

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
    if (classId && fetchRegistry.isStale(`classSubjects-${classId}`, 60_000)) {
      fetchClassSubjects(classId);
      fetchRegistry.register(`classSubjects-${classId}`);
    }
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
    : '/tabs/classes';
  const examsBasePath = `${basePath}/exams`;

  return (
    <PageShell noPadding contentClassName="!p-0">
      <div className="exams-list-scroll" style={subjectThemeStyle(subjectColor) as React.CSSProperties}>
        {/* Hero Header */}
        <div className="exams-list-hero" style={subjectColor ? { background: subjectColor } : undefined}>
          <div className="exams-list-hero__nav">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(basePath)}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/20 transition-colors text-white"
              >
                <ArrowLeft size={20} />
              </button>
            </div>
            <div className="exams-list-hero__center">
              <h1 className="exams-list-hero__title">Exámenes</h1>
              {(displayClass || subjectName) && (
                <p className="exams-list-hero__subtitle">
                  {displayClass?.name}{subjectName ? ` — ${subjectName}` : ''}{aulaLabel ? ` · ${aulaLabel}` : ''}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`${examsBasePath}/new`)}
              className="text-white/90 hover:text-white hover:bg-white/20"
            >
              <Plus size={22} />
            </Button>
          </div>
        </div>

        {/* Status filter */}
        <div className="exams-filter-bar">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="exams-filter-select">
              <Filter size={14} className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((f) => {
                const count = f.value === 'all' ? exams.length : exams.filter(e => e.status === f.value).length;
                return (
                  <SelectItem key={f.value} value={f.value}>
                    <span className="flex items-center justify-between gap-2 w-full">
                      {f.label}
                      {count > 0 && <span className="exams-filter-count">{count}</span>}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <span className="exams-filter-summary">
            {filteredExams.length} {filteredExams.length === 1 ? 'examen' : 'exámenes'}
          </span>
        </div>

        {!subjectId && displayClass?.lectures && displayClass.lectures.length > 1 && (
          <div className="exams-list-filters">
            <Select
              value={lectureFilter}
              onValueChange={(v) => setLectureFilter(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las asignaturas</SelectItem>
                {displayClass.lectures.map((lecture) => (
                  <SelectItem key={lecture.id} value={lecture.id}>
                    {lecture.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Exams List */}
        <div className="exams-list-container">
          {examsLoading ? (
            <div className="exams-list-loading">
              <Spinner />
            </div>
          ) : filteredExams.length === 0 ? (
            <EmptyState
              icon="📝"
              title={exams.length === 0 ? 'Aún no hay exámenes' : 'Sin resultados'}
              subtitle={exams.length === 0 ? 'Crea tu primer examen para esta clase' : 'Prueba con otros filtros'}
              actionLabel={exams.length === 0 ? 'Crear examen' : undefined}
              onAction={exams.length === 0 ? () => navigate(`${examsBasePath}/new`) : undefined}
            />
          ) : (
            <div className="exams-list-items">
              {filteredExams.map((exam) => {
                const status = EXAM_STATUS_CONFIG[exam.status] || EXAM_STATUS_CONFIG.pending_validation;
                const corrections = getExamCorrections(exam.id);
                const correctedCount = corrections.filter(c => c.grade !== null || c.aiProcessed).length;
                const deadline = exam.deadlineStatus ? EXAM_DEADLINE_CONFIG[exam.deadlineStatus] : null;
                const lectureName = getLectureName(exam.lectureId);

                return (
                  <div
                    key={exam.id}
                    className="exams-list-card"
                    onClick={() => navigate(`${examsBasePath}/${exam.id}`)}
                  >
                    <div className="exams-list-card__content">
                      <div className="exams-list-card__header">
                        <h3 className="exams-list-card__name">{exam.name}</h3>
                        <div className="flex items-center gap-1.5">
                          {exam.examOrigin && EXAM_ORIGIN_CONFIG[exam.examOrigin] && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                              style={{
                                color: EXAM_ORIGIN_CONFIG[exam.examOrigin].color,
                                background: EXAM_ORIGIN_CONFIG[exam.examOrigin].bg,
                              }}
                            >
                              {EXAM_ORIGIN_CONFIG[exam.examOrigin].icon === 'sparkles' ? <Sparkles size={11} /> : <ScanLine size={11} />}
                              {EXAM_ORIGIN_CONFIG[exam.examOrigin].label}
                            </span>
                          )}
                          <span
                            className="exams-list-card__status"
                            style={{ color: status.color, background: status.bg }}
                          >
                            {status.label}
                          </span>
                        </div>
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
                        {(exam.status === 'scheduled' || exam.status === 'pending_correction' || exam.status === 'corrected') && (
                          <span className="exams-list-card__progress">
                            <CheckCircle size={12} />
                            {correctedCount}/{students.length} corregidos
                          </span>
                        )}
                        {deadline && exam.status !== 'corrected' && exam.correctionDeadline && (
                          <span
                            className="exams-list-card__deadline"
                            style={{ color: deadline.color }}
                          >
                            {deadline.label === 'Vencido' ? <AlertCircle size={12} /> : <Clock size={12} />}
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
                        <Trash2 size={16} />
                      </button>
                      <ChevronRight size={18} className="exams-list-card__arrow" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Delete Alert */}
        <AlertConfirm
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          header="Eliminar examen"
          message={
            `¿Eliminar "${deleteTarget?.name}"? También se eliminarán todas las correcciones asociadas. Esta acción no se puede deshacer.`
          }
          confirmText="Eliminar"
          cancelText="Cancelar"
          onConfirm={handleDelete}
          variant="destructive"
        />
      </div>
    </PageShell>
  );
};

export default ExamsList;
