import { useState, useMemo, useEffect } from 'react';
import { Plus, Sparkles, ScanLine, Filter, ChevronRight, Trash2, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useExamsStore } from '../../store/examsStore';
import { useCorrectionStore } from '../../store/correctionStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { Exam } from '../../types';
import Spinner from '@/components/shared/Spinner';
import EmptyState from '@/components/EmptyState';
import AlertConfirm from '@/components/shared/AlertConfirm';
import PageShell from '@/components/shared/PageShell';
import { EXAM_STATUS_CONFIG, EXAM_ORIGIN_CONFIG, EXAM_DEADLINE_CONFIG, STATUS_FILTER_OPTIONS } from './examConstants';
import './ExamsList.css';

type StatusFilter = 'all' | 'pending_validation' | 'pending_schedule' | 'scheduled' | 'pending_correction' | 'corrected';

const ExamsGlobal: React.FC = () => {
  const navigate = useNavigate();

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const deleteExam = useExamsStore((s) => s.deleteExam);
  const examsLoading = useExamsStore((s) => s.loading);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);

  const allCorrections = useCorrectionStore((s) => s.corrections);
  const fetchAllCorrections = useCorrectionStore((s) => s.fetchAllCorrections);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null);

  useEffect(() => {
    fetchExams();
    fetchAllCorrections();
  }, [fetchExams, fetchAllCorrections]);

  // Unique class names for filter dropdown (from direct classId and assignments)
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    allExams.forEach((e) => {
      if (e.classId && e.className) map.set(e.classId, e.className);
      e.assignments?.forEach(a => {
        if (a.classId && a.className) map.set(a.classId, a.className);
      });
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allExams]);

  const filteredExams = useMemo(() => {
    let filtered = [...allExams];

    if (statusFilter !== 'all') {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }

    if (classFilter !== 'all') {
      if (classFilter === '__global__') {
        filtered = filtered.filter((e) => !e.classId && (!e.assignments || e.assignments.length === 0));
      } else {
        filtered = filtered.filter((e) =>
          e.classId === classFilter ||
          e.assignments?.some(a => a.classId === classFilter)
        );
      }
    }

    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allExams, statusFilter, classFilter]);

  const getExamCorrections = (examId: string) => {
    return allCorrections.filter(c => c.examId === examId);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExam(deleteTarget.id);
      await fetchExams();
      fetchDashboard();
    } catch (err) {
      console.error('Failed to delete exam:', err);
    }
    setDeleteTarget(null);
  };

  const headerActions = (
    <Button variant="ghost" size="sm" onClick={() => navigate('/tabs/exams/new')}>
      <Plus size={18} />
    </Button>
  );

  return (
    <PageShell title="Exámenes" headerActions={headerActions} noPadding contentClassName="!p-0">
      <div className="exams-list-scroll">
        {/* Status filter */}
        <div className="exams-filter-bar">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="exams-filter-select">
              <Filter size={14} className="text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((f) => {
                const count = f.value === 'all' ? allExams.length : allExams.filter(e => e.status === f.value).length;
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
          {classOptions.length > 0 && (
            <Select value={classFilter} onValueChange={(v) => setClassFilter(v)}>
              <SelectTrigger className="exams-filter-select">
                <SelectValue placeholder="Clase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las clases</SelectItem>
                <SelectItem value="__global__">Sin clase</SelectItem>
                {classOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="exams-filter-summary">
            {filteredExams.length} {filteredExams.length === 1 ? 'examen' : 'exámenes'}
          </span>
        </div>

        {/* Exams List */}
        <div className="exams-list-container">
          {examsLoading ? (
            <div className="exams-list-loading">
              <Spinner />
            </div>
          ) : filteredExams.length === 0 ? (
            <EmptyState
              icon="📝"
              title={allExams.length === 0 ? 'Aún no hay exámenes' : 'Sin resultados'}
              subtitle={
                allExams.length === 0
                  ? 'Crea tu primer examen'
                  : 'Prueba con otros filtros'
              }
              actionLabel={allExams.length === 0 ? 'Nuevo examen' : undefined}
              onAction={allExams.length === 0 ? () => navigate('/tabs/exams/new') : undefined}
            />
          ) : (
            <div className="exams-list-items">
              {filteredExams.map((exam) => {
                const status = EXAM_STATUS_CONFIG[exam.status] || EXAM_STATUS_CONFIG.pending_validation;
                const origin = exam.examOrigin ? EXAM_ORIGIN_CONFIG[exam.examOrigin] : null;
                const corrections = getExamCorrections(exam.id);
                const correctedCount = corrections.filter(c => c.grade !== null || c.aiProcessed).length;
                const totalStudents = corrections.length;
                const deadline = exam.deadlineStatus ? EXAM_DEADLINE_CONFIG[exam.deadlineStatus] : null;

                return (
                  <div
                    key={exam.id}
                    className="exams-list-card"
                    onClick={() => navigate(`/tabs/exams/${exam.id}`)}
                  >
                    <div className="exams-list-card__content">
                      <div className="exams-list-card__header">
                        <h3 className="exams-list-card__name">{exam.name}</h3>
                        <div className="flex items-center gap-1.5">
                          {origin && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                              style={{ color: origin.color, background: origin.bg }}
                            >
                              {origin.icon === 'sparkles' ? <Sparkles size={11} /> : <ScanLine size={11} />}
                              {origin.label}
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

                      {/* Class + Subject info */}
                      {(exam.className || exam.subjectName) && (
                        <p className="text-xs text-muted-foreground mt-0.5 mb-0">
                          {[exam.className, exam.subjectName].filter(Boolean).join(' — ')}
                        </p>
                      )}

                      <div className="exams-list-card__meta">
                        <span className="exams-list-card__date">
                          {new Date(exam.date).toLocaleDateString('es-ES', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </div>

                      <div className="exams-list-card__footer">
                        {(exam.status === 'scheduled' || exam.status === 'pending_correction' || exam.status === 'corrected') && totalStudents > 0 && (
                          <span className="exams-list-card__progress">
                            <CheckCircle size={12} />
                            {correctedCount}/{totalStudents} corregidos
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
          message={`¿Eliminar "${deleteTarget?.name}"? También se eliminarán todas las correcciones asociadas. Esta acción no se puede deshacer.`}
          confirmText="Eliminar"
          cancelText="Cancelar"
          onConfirm={handleDelete}
          variant="destructive"
        />
      </div>
    </PageShell>
  );
};

export default ExamsGlobal;
