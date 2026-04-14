import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ArrowUpDown, AlertCircle, Trash2, X, CheckSquare, Square,
  Settings, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Modal from '@/components/shared/Modal';
import Spinner from '@/components/shared/Spinner';
import Searchbar from '@/components/shared/Searchbar';
import PageShell from '@/components/shared/PageShell';
import { useClassesStore, DeletePreview } from '../../store/classesStore';
import { useExamsStore } from '../../store/examsStore';
import { ClassSubjectSummary, EducationLevel, ScheduleSlot } from '../../types';
import { EDUCATION_LEVEL_OPTIONS } from '../../utils/educationLevels';
import EmptyState from '../../components/EmptyState';
import OnboardingChecklist from '../../components/OnboardingChecklist';
import { SkeletonClassCard, SkeletonSubjectChip } from '../../components/SkeletonLoaders';
import { avatarColor } from '../../utils/avatarColors';
import './Classes.css';

/* ─── Schedule formatting helpers ─── */
const DAY_ABBR: Record<string, string> = {
  lunes: 'L', martes: 'M', miércoles: 'X', miercoles: 'X',
  jueves: 'J', viernes: 'V', sábado: 'S', sabado: 'S', domingo: 'D',
  monday: 'L', tuesday: 'M', wednesday: 'X', thursday: 'J',
  friday: 'V', saturday: 'S', sunday: 'D',
};
const DAY_ORDER: Record<string, number> = {
  lunes: 0, martes: 1, miércoles: 2, miercoles: 2,
  jueves: 3, viernes: 4, sábado: 5, sabado: 5, domingo: 6,
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3,
  friday: 4, saturday: 5, sunday: 6,
};
function formatScheduleCompact(slots: ScheduleSlot[]): string {
  if (!slots || slots.length === 0) return '';
  const sorted = [...slots].sort((a, b) => (DAY_ORDER[a.day.toLowerCase()] ?? 7) - (DAY_ORDER[b.day.toLowerCase()] ?? 7));
  const groups: Record<string, string[]> = {};
  const order: string[] = [];
  for (const s of sorted) {
    const day = DAY_ABBR[s.day.toLowerCase()] || s.day.slice(0, 2);
    const key = s.start_time?.slice(0, 5) || '';
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(day);
  }
  return order.map(key => {
    const days = groups[key].join(', ');
    return key ? `${days} ${key}` : days;
  }).join(' · ');
}

const Classes: React.FC = () => {
  const navigate = useNavigate();
  const allClasses = useClassesStore((s) => s.classes);
  const addClass = useClassesStore((s) => s.addClass);
  const deleteClassPermanently = useClassesStore((s) => s.deleteClassPermanently);
  const bulkDeleteClasses = useClassesStore((s) => s.bulkDeleteClasses);
  const getDeletePreview = useClassesStore((s) => s.getDeletePreview);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const classSubjectsLoaded = useClassesStore((s) => s.classSubjectsLoaded);
  const loading = useClassesStore((s) => s.loading);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);

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
  const [educationLevel, setEducationLevel] = useState<EducationLevel>('secundaria');
  const [creating, setCreating] = useState(false);
  const [duplicateClass, setDuplicateClass] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchClasses();
    fetchExams();
  }, [fetchClasses, fetchExams]);

  // Fetch subjects for all visible classes
  useEffect(() => {
    classes.forEach((c) => {
      if (!classSubjects[c.id]) {
        fetchClassSubjects(c.id);
      }
    });
  }, [classes, classSubjects, fetchClassSubjects]);

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

  const yearLabel = (() => {
    const fmtDate = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
    return `${fmtDate(yearFrom)} - ${fmtDate(yearTo)}`;
  })();

  const resetModal = () => {
    setNewName('');
    setEducationLevel('secundaria');
    setDuplicateClass(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const trimmed = newName.trim();
    const existing = classes.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setDuplicateClass({ id: existing.id, name: existing.name });
      return;
    }
    setCreating(true);
    try {
      const id = await addClass({ name: trimmed, year: yearLabel, education_level: educationLevel });
      resetModal();
      setShowModal(false);
      navigate(`/tabs/classes/${id}/settings`);
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
      await Promise.all([fetchClasses(), fetchExams()]);
      toast.success('Clase eliminada correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar la clase');
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Bulk delete
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<string[] | null>(null);
  const [bulkDeletePreviews, setBulkDeletePreviews] = useState<Record<string, DeletePreview>>({});
  const [loadingBulkPreview, setLoadingBulkPreview] = useState(false);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (selectedIds.size === 1) {
      const firstId = Array.from(selectedIds)[0];
      const classToDelete = classes.find(c => c.id === firstId);
      if (classToDelete) handleStartDelete(classToDelete.id, classToDelete.name);
    } else {
      const ids = Array.from(selectedIds);
      setBulkDeleteTarget(ids);
      setLoadingBulkPreview(true);
      try {
        const previews: Record<string, DeletePreview> = {};
        await Promise.all(ids.map(async (id) => {
          try { previews[id] = await getDeletePreview(id); } catch {}
        }));
        setBulkDeletePreviews(previews);
      } finally {
        setLoadingBulkPreview(false);
      }
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDeleteTarget) return;
    setDeleting(true);
    try {
      const result = await bulkDeleteClasses(bulkDeleteTarget);
      await Promise.all([fetchClasses(), fetchExams()]);
      if (result.errors.length === 0) {
        toast.success(`${result.deleted} ${result.deleted === 1 ? 'clase eliminada' : 'clases eliminadas'} correctamente`);
      } else {
        toast.warning(`${result.deleted} eliminadas, ${result.errors.length} fallaron`);
      }
    } catch (err) {
      console.error('Bulk delete failed:', err);
      toast.error('Error al eliminar las clases');
    } finally {
      setDeleting(false);
      setBulkDeleteTarget(null);
      setBulkDeletePreviews({});
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  const headerActions = selectionMode ? (
    <>
      <Button variant="ghost" size="sm" onClick={exitSelectionMode}><X size={18} /></Button>
      <span className="text-sm font-medium">{selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}</span>
      <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={selectedIds.size === 0 || deleting}>
        {deleting ? <Spinner size={16} /> : <Trash2 size={18} />}
      </Button>
    </>
  ) : (
    <>
      {classes.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setSelectionMode(true)}>
          <Trash2 size={18} />
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setShowModal(true)}>
        <Plus size={18} />
      </Button>
    </>
  );

  return (
    <PageShell title={selectionMode ? undefined : 'Clases'} headerActions={headerActions}>
      <div className="classes-controls">
        <Searchbar value={search} onChange={setSearch} placeholder="Buscar clases..." />

        {classes.length > 1 && (
          <div className="classes-sort">
            <ArrowUpDown size={16} className="text-muted-foreground" />
            <div className="classes-sort__chips">
              {(['name', 'subject', 'students'] as const).map((key) => (
                <button
                  key={key}
                  className={`classes-sort__chip ${sortBy === key ? 'classes-sort__chip--active' : ''}`}
                  onClick={() => setSortBy(key)}
                >
                  {key === 'name' ? 'Nombre' : key === 'subject' ? 'Asignatura' : 'Alumnos'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <OnboardingChecklist
        classCount={classes.length}
        hasSubjects={Object.values(classSubjects).some(s => s.length > 0)}
        studentCount={classes.reduce((sum, c) => sum + (c.studentCount || 0), 0)}
        examCount={allExams.length}
        hasCorrected={allExams.some(e => e.status === 'corrected')}
      />

      {loading && (
        <div className="classes-grid">
          {[1, 2, 3].map(i => <SkeletonClassCard key={i} />)}
        </div>
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
            const isSelected = selectedIds.has(c.id);
            const subjects: ClassSubjectSummary[] = classSubjects[c.id] || [];
            const subjectsReady = !!classSubjectsLoaded[c.id];

            return (
              <div
                key={c.id}
                className={`class-card-wrapper ${selectionMode && isSelected ? 'class-card-wrapper--selected' : ''}`}
                onClick={selectionMode ? () => toggleSelection(c.id) : undefined}
              >
                {/* ── Header row ── */}
                <div className={`class-card ${selectionMode ? 'class-card--selectable' : ''}`}>
                  {selectionMode && (
                    <div className="class-card__checkbox">
                      {isSelected ? <CheckSquare size={20} className="text-primary" /> : <Square size={20} className="text-muted-foreground" />}
                    </div>
                  )}
                  <span
                    className="class-card__color-bar"
                    style={{ background: avatarColor(c.name) }}
                  />
                  <div className="class-card__info">
                    <span className="class-card__name">{c.name}</span>
                    <span className="class-card__students-text">
                      {(c.studentCount ?? 0) > 0
                        ? `${c.studentCount} alumno${c.studentCount !== 1 ? 's' : ''}`
                        : 'Sin alumnos'}
                      {subjects.length > 0 && ` · ${subjects.length} asignatura${subjects.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  {!selectionMode && (
                    <button
                      className="class-card__settings-btn"
                      onClick={(e) => { e.stopPropagation(); navigate(`/tabs/classes/${c.id}/settings`); }}
                      title="Configuración"
                    >
                      <Settings size={16} />
                    </button>
                  )}
                </div>

                {/* ── Subject rows (always visible) ── */}
                {!selectionMode && subjects.length > 0 && (
                  <div className="class-card__subjects-detail">
                    {subjects.map((subj) => {
                      const schedule = subj.schedule?.length ? formatScheduleCompact(subj.schedule) : '';
                      return (
                        <div
                          key={subj.subjectId}
                          className="class-card__subj-row"
                          onClick={() => navigate(`/tabs/classes/${c.id}/subjects/${subj.subjectId}`)}
                        >
                          <span
                            className="class-card__subj-dot"
                            style={{ background: subj.subjectColor || avatarColor(subj.subjectName) }}
                          />
                          <div className="class-card__subj-info">
                            <span className="class-card__subj-name">{subj.subjectName}</span>
                            {(subj.aula || schedule) && (
                              <span className="class-card__subj-meta">
                                {subj.aula && <span className="class-card__subj-aula">{subj.aula}</span>}
                                {subj.aula && schedule && <span className="class-card__subj-sep">·</span>}
                                {schedule && <span>{schedule}</span>}
                              </span>
                            )}
                          </div>
                          <ChevronRight size={14} className="class-card__subj-arrow" />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Empty: add subject CTA ── */}
                {!selectionMode && subjects.length === 0 && subjectsReady && (
                  <div className="class-card__subjects-detail">
                    <div
                      className="class-card__subj-row class-card__subj-row--cta"
                      onClick={() => navigate(`/tabs/classes/${c.id}/settings`)}
                    >
                      <Plus size={14} className="text-primary" />
                      <span className="class-card__subj-cta-text">Añadir asignatura</span>
                    </div>
                  </div>
                )}

                {/* ── Loading skeleton ── */}
                {!selectionMode && subjects.length === 0 && !subjectsReady && (
                  <div className="class-card__subjects-detail class-card__subjects-detail--loading">
                    <SkeletonSubjectChip />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal open={!!deleteTarget} onClose={handleCancelDelete} title="Eliminar clase">
        <p className="text-sm text-muted-foreground">
          ¿Seguro que quieres eliminar "{deleteTarget?.name}"?
        </p>

        {loadingPreview ? (
          <div className="delete-preview-loading">
            <Spinner />
            <span>Calculando elementos...</span>
          </div>
        ) : deletePreview && (
          <div className="delete-preview">
            <p className="delete-preview__warning">Se eliminarán permanentemente:</p>
            <ul className="delete-preview__list">
              {deletePreview.counts.students > 0 && <li>{deletePreview.counts.students} alumno{deletePreview.counts.students !== 1 ? 's' : ''}</li>}
              {deletePreview.counts.lectures > 0 && <li>{deletePreview.counts.lectures} asignatura{deletePreview.counts.lectures !== 1 ? 's' : ''}</li>}
              {deletePreview.counts.exams > 0 && <li>{deletePreview.counts.exams} examen{deletePreview.counts.exams !== 1 ? 'es' : ''}</li>}
              {deletePreview.counts.corrections > 0 && <li>{deletePreview.counts.corrections} corrección{deletePreview.counts.corrections !== 1 ? 'es' : ''}</li>}
              {deletePreview.counts.exercises > 0 && <li>{deletePreview.counts.exercises} ejercicio{deletePreview.counts.exercises !== 1 ? 's' : ''}</li>}
              {deletePreview.counts.calendar_events > 0 && <li>{deletePreview.counts.calendar_events} evento{deletePreview.counts.calendar_events !== 1 ? 's' : ''} del calendario</li>}
              {deletePreview.counts.comments > 0 && <li>{deletePreview.counts.comments} comentario{deletePreview.counts.comments !== 1 ? 's' : ''}</li>}
            </ul>
            <p className="delete-preview__note">Esta acción no se puede deshacer.</p>
          </div>
        )}

        <div className="delete-modal-buttons">
          <Button variant="outline" className="w-full" onClick={handleCancelDelete}>Cancelar</Button>
          <Button variant="destructive" className="w-full" onClick={handleDeleteConfirm} disabled={loadingPreview || deleting}>
            {deleting ? <Spinner size={16} /> : 'Eliminar permanentemente'}
          </Button>
        </div>
      </Modal>

      {/* Bulk delete modal */}
      <Modal open={!!bulkDeleteTarget} onClose={() => { setBulkDeleteTarget(null); setBulkDeletePreviews({}); }} title={`Eliminar ${bulkDeleteTarget?.length} clases`}>
        <p className="text-sm text-muted-foreground">¿Seguro que quieres eliminar estas clases?</p>

        {loadingBulkPreview ? (
          <div className="delete-preview-loading">
            <Spinner />
            <span>Calculando elementos...</span>
          </div>
        ) : (
          <div className="delete-preview">
            <p className="delete-preview__warning">Se eliminarán permanentemente:</p>
            <ul className="delete-preview__list">
              {bulkDeleteTarget?.map(id => {
                const c = classes.find(cl => cl.id === id);
                const p = bulkDeletePreviews[id];
                const details: string[] = [];
                if (p?.counts.students) details.push(`${p.counts.students} alumno${p.counts.students !== 1 ? 's' : ''}`);
                if (p?.counts.lectures) details.push(`${p.counts.lectures} asignatura${p.counts.lectures !== 1 ? 's' : ''}`);
                if (p?.counts.exams) details.push(`${p.counts.exams} examen${p.counts.exams !== 1 ? 'es' : ''}`);
                return (
                  <li key={id}>
                    <strong>{c?.name || id}</strong>
                    {details.length > 0 && <span> — {details.join(', ')}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="delete-preview__note">Esta acción no se puede deshacer.</p>
          </div>
        )}

        <div className="delete-modal-buttons">
          <Button variant="outline" className="w-full" onClick={() => { setBulkDeleteTarget(null); setBulkDeletePreviews({}); }}>Cancelar</Button>
          <Button variant="destructive" className="w-full" onClick={handleBulkDeleteConfirm} disabled={loadingBulkPreview || deleting}>
            {deleting ? <Spinner size={16} /> : `Eliminar ${bulkDeleteTarget?.length} clases`}
          </Button>
        </div>
      </Modal>

      {/* Create class modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); resetModal(); }} title="Nueva clase">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground block mb-1.5">Nombre de la clase</label>
            <Input
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setDuplicateClass(null); }}
              placeholder="ej. 1A, 2B, 3ESO..."
            />
          </div>

          {duplicateClass && (
            <div className="duplicate-class-warning">
              <AlertCircle size={16} className="shrink-0 text-orange-600 mt-0.5" />
              <span>
                Ya existe una clase llamada <strong>«{duplicateClass.name}»</strong>.{' '}
                <button
                  className="duplicate-class-warning__link"
                  onClick={() => {
                    setShowModal(false);
                    resetModal();
                    navigate(`/tabs/classes/${duplicateClass.id}/settings`);
                  }}
                >
                  Ir a esa clase
                </button>{' '}
                para añadir asignaturas.
              </span>
            </div>
          )}

          <div className="curso-dates">
            <span className="curso-dates__label">Curso escolar</span>
            <div className="curso-dates__row">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Desde</label>
                <Input type="date" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground block mb-1">Hasta</label>
                <Input type="date" value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="education-level-section">
            <span className="education-level-section__label">Nivel educativo</span>
            <div className="education-level-chips">
              {EDUCATION_LEVEL_OPTIONS.map(([value, label, ages]) => (
                <button
                  key={value}
                  type="button"
                  className={`education-level-chip ${educationLevel === value ? 'education-level-chip--active' : ''}`}
                  onClick={() => setEducationLevel(value)}
                >
                  <span className="education-level-chip__label">{label}</span>
                  <span className="education-level-chip__ages">{ages}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="modal-hint">Después de crear la clase podrás añadir asignaturas, horarios y alumnos.</p>

          <Button className="w-full" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <Spinner size={16} /> : 'Crear clase'}
          </Button>
        </div>
      </Modal>
    </PageShell>
  );
};

export default Classes;
