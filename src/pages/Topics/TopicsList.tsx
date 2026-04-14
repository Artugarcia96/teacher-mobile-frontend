import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus, FileText, Upload, XCircle,
  BookOpen, Link, Trash2, Sparkles, Download,
  CheckCircle,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTopicsStore } from '../../store/topicsStore';
import { useClassesStore } from '../../store/classesStore';
import { fetchRegistry } from '../../store/fetchRegistry';
import { useTextbooksStore } from '../../store/textbooksStore';
import { useCoursePlanStore } from '../../store/coursePlanStore';
import { subjects as subjectsApi } from '../../services/api';
import { SubjectListItem, Textbook } from '../../types';
import EmptyState from '../../components/EmptyState';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import TextbookCard from '../../components/TextbookCard';
import TextbookDetailModal from '../../components/TextbookDetailModal';
import CoursePlanCard from '../../components/CoursePlanCard';
import CoursePlanCreatorModal from '../../components/CoursePlanCreatorModal';
import CoursePlanDetailModal from '../../components/CoursePlanDetailModal';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { getPeriodNumbers, getPeriodLabel, getPeriodFullLabel } from '../../utils/periodConfig';
import PageShell from '@/components/shared/PageShell';
import Spinner from '@/components/shared/Spinner';
import Searchbar from '@/components/shared/Searchbar';
import AlertConfirm from '@/components/shared/AlertConfirm';
import Modal from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import './TopicsList.css';

const TopicsList: React.FC = () => {
  const { classId, subjectId: urlSubjectId } = useParams() as { classId: string; subjectId?: string };
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classesStoreSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);

  const topicsBySubject = useTopicsStore((s) => s.topicsBySubject);
  const classSubjects = useTopicsStore((s) => s.classSubjects);
  const topicsLoading = useTopicsStore((s) => s.loading);
  const fetchTopicsForClass = useTopicsStore((s) => s.fetchTopicsForClass);
  const linkSubjectToClass = useTopicsStore((s) => s.linkSubjectToClass);
  const unlinkSubjectFromClass = useTopicsStore((s) => s.unlinkSubjectFromClass);
  const createTopic = useTopicsStore((s) => s.createTopic);
  const deleteTopic = useTopicsStore((s) => s.deleteTopic);
  const uploadMaterial = useTopicsStore((s) => s.uploadMaterial);

  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [activeTrimester, setActiveTrimester] = useState<string>('all');
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [search, setSearch] = useState('');

  // New topic form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTrimester, setNewTrimester] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Link subject form
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
  const [linkingSaving, setLinkingSaving] = useState(false);

  // Import from class selector
  const [selectedSourceClassId, setSelectedSourceClassId] = useState('');
  const [sourceClassSubjects, setSourceClassSubjects] = useState<SubjectListItem[]>([]);
  const [loadingSourceSubjects, setLoadingSourceSubjects] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null);

  // Course plan state
  const { plans: coursePlans, fetchPlans: fetchCoursePlans, deletePlan, fetchProgress: fetchPlanProgress } = useCoursePlanStore();
  const [showCoursePlanCreator, setShowCoursePlanCreator] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState<{ id: string; name: string } | null>(null);

  const { textbooks, fetchTextbooks } = useTextbooksStore();
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);
  const periodMode = useAcademicConfigStore((s) => s.configs[classId])?.periodMode;
  const fetchAcademicConfig = useAcademicConfigStore((s) => s.fetchConfig);

  const activeSubject = useMemo(
    () => topicsBySubject.find((s) => s.subjectId === activeSubjectId),
    [topicsBySubject, activeSubjectId]
  );

  const activeTopics = useMemo(() => {
    let topics = activeSubject?.topics || [];
    if (activeTrimester !== 'all') {
      const tri = parseInt(activeTrimester);
      topics = topics.filter((t) => (t.trimester || 0) === tri);
    }
    if (!search) return topics;
    const term = search.toLowerCase();
    return topics.filter(
      (t) => t.name.toLowerCase().includes(term) || t.description?.toLowerCase().includes(term)
    );
  }, [activeSubject, activeTrimester, search]);

  // Check which trimesters have topics to show relevant filter options
  const availableTrimesters = useMemo(() => {
    const topics = activeSubject?.topics || [];
    const trims = new Set(topics.map((t) => t.trimester || 0));
    return trims;
  }, [activeSubject]);

  // Other classes to import from (excluding current class)
  const otherClasses = useMemo(
    () => allClasses.filter((c) => c.id !== classId),
    [allClasses, classId]
  );

  // Filter subjects from source class that are NOT already linked to current class
  const availableSourceSubjects = useMemo(() => {
    const linkedIds = new Set(classSubjects.map((s) => s.id));
    return sourceClassSubjects.filter((s) => !linkedIds.has(s.id));
  }, [sourceClassSubjects, classSubjects]);

  useEffect(() => {
    const load = async () => {
      if (classId && fetchRegistry.isStale(`classSubjects-${classId}`, 60_000)) {
        await fetchClassSubjects(classId);
        fetchRegistry.register(`classSubjects-${classId}`);
      }
    };
    fetchClasses();
    fetchTopicsForClass(classId);
    if (classId) { load(); fetchAcademicConfig(classId); }
  }, [classId, fetchClasses, fetchTopicsForClass, fetchClassSubjects, fetchAcademicConfig]);

  useEffect(() => {
    if (urlSubjectId) {
      setActiveSubjectId(urlSubjectId);
    } else if (classSubjects.length > 0 && (!activeSubjectId || !classSubjects.find((s) => s.id === activeSubjectId))) {
      setActiveSubjectId(classSubjects[0].id);
    }
  }, [classSubjects, activeSubjectId, urlSubjectId]);

  useEffect(() => {
    if (activeSubjectId) {
      fetchTextbooks(activeSubjectId);
      fetchCoursePlans(activeSubjectId, classId);
    }
  }, [activeSubjectId, classId, fetchTextbooks, fetchCoursePlans]);

  // Find the accepted plan for current subject+class and fetch its progress
  const acceptedPlan = useMemo(
    () => coursePlans.find((p) => p.subjectId === activeSubjectId && p.classId === classId && p.topicsCreated),
    [coursePlans, activeSubjectId, classId]
  );

  useEffect(() => {
    if (acceptedPlan) fetchPlanProgress(acceptedPlan.id).catch(() => null);
  }, [acceptedPlan?.id]);

  const handleOpenSubjectModal = () => {
    setSelectedLinkIds([]);
    setSelectedSourceClassId('');
    setSourceClassSubjects([]);
    setShowSubjectModal(true);
  };

  const handleSourceClassChange = async (sourceClassId: string) => {
    setSelectedSourceClassId(sourceClassId);
    setSelectedLinkIds([]);
    if (!sourceClassId) {
      setSourceClassSubjects([]);
      return;
    }
    setLoadingSourceSubjects(true);
    try {
      const res = await subjectsApi.forClass(sourceClassId);
      const subjects: SubjectListItem[] = res.data.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        topicCount: s.topic_count || 0,
        classCount: s.class_count || 0,
      }));
      setSourceClassSubjects(subjects);
    } catch (err) {
      console.error('Failed to fetch subjects for class', err);
      setSourceClassSubjects([]);
    } finally {
      setLoadingSourceSubjects(false);
    }
  };

  const handleLinkSubjects = async () => {
    setLinkingSaving(true);
    try {
      for (const subjectId of selectedLinkIds) {
        await linkSubjectToClass(subjectId, classId);
      }
      setShowSubjectModal(false);
      setSelectedLinkIds([]);
    } catch (err) {
      console.error('Failed to link subjects:', err);
    } finally {
      setLinkingSaving(false);
    }
  };

  const toggleLinkSubject = (id: string) => {
    setSelectedLinkIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!newName.trim() || !activeSubjectId) return;
    setSaving(true);
    setUploadProgress('');
    try {
      const newTopic = await createTopic(activeSubjectId, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        trimester: newTrimester ? parseInt(newTrimester) : undefined,
      });

      if (selectedFiles.length > 0 && newTopic) {
        for (let i = 0; i < selectedFiles.length; i++) {
          setUploadProgress(`Subiendo ${i + 1}/${selectedFiles.length}...`);
          await uploadMaterial(newTopic.id, selectedFiles[i]);
        }
      }

      setNewName('');
      setNewDescription('');
      setNewTrimester('');
      setSelectedFiles([]);
      setUploadProgress('');
      setShowTopicModal(false);
    } catch (err) {
      console.error('Failed to create topic:', err);
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  const handleTopicModalDismiss = () => {
    setShowTopicModal(false);
    setNewName('');
    setNewDescription('');
    setNewTrimester('');
    setSelectedFiles([]);
    setUploadProgress('');
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTopic(deleteTarget.id);
    } catch (err) {
      console.error('Failed to delete topic:', err);
    }
    setDeleteTarget(null);
  };

  const handleUnlinkConfirm = async () => {
    if (!unlinkTarget) return;
    try {
      await unlinkSubjectFromClass(unlinkTarget.id, classId);
    } catch (err) {
      console.error('Failed to unlink subject:', err);
    }
    setUnlinkTarget(null);
  };

  const activeSubjectName = classSubjects.find((s) => s.id === activeSubjectId)?.name || '';
  const subjectColor = urlSubjectId ? classesStoreSubjects[classId]?.find(s => s.subjectId === urlSubjectId)?.subjectColor : undefined;

  return (
    <PageShell
      title={classGroup ? `${classGroup.name} — Temario` : 'Temario'}
      backHref={urlSubjectId ? `/tabs/classes/${classId}/subjects/${urlSubjectId}` : '/tabs/classes'}
      headerActions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleOpenSubjectModal} title="Gestionar asignaturas">
            <Link size={18} />
          </Button>
          {activeSubjectId && (
            <Button variant="ghost" size="sm" onClick={() => {
              if (activeTrimester !== 'all' && activeTrimester !== '0') {
                setNewTrimester(activeTrimester);
              }
              setShowTopicModal(true);
            }}>
              <Plus size={18} />
            </Button>
          )}
        </div>
      }
      noPadding
      className={subjectColor ? '' : ''}
    >
      <div style={subjectThemeStyle(subjectColor)}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
          multiple
          style={{ display: 'none' }}
        />

        {/* Subject selector -- only show when NOT in a subject-scoped route */}
        {!urlSubjectId && classSubjects.length > 0 && (
          <div className="px-4 lg:px-6 py-2 border-b border-border">
            {classSubjects.length <= 4 ? (
              <Tabs
                value={activeSubjectId}
                onValueChange={(v) => { setActiveSubjectId(v); setSearch(''); setActiveTrimester('all'); }}
              >
                <TabsList variant="line" className="w-full">
                  {classSubjects.map((s) => (
                    <TabsTrigger key={s.id} value={s.id} className="flex-1 text-sm">
                      {s.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <Select
                value={activeSubjectId}
                onValueChange={(v) => { setActiveSubjectId(v); setSearch(''); setActiveTrimester('all'); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {classSubjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {topicsLoading ? (
          <div className="topics-loading"><Spinner /></div>
        ) : classSubjects.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Sin asignaturas"
            subtitle="Añade asignaturas a esta clase para organizar el temario (ej. Matemáticas, Lengua...)"
            actionLabel="Añadir asignaturas"
            onAction={handleOpenSubjectModal}
          />
        ) : (
          <>
            {/* ─── Empty state: unified onboarding when no topics ─── */}
            {activeSubjectId && (activeSubject?.topics.length || 0) === 0 && coursePlans.filter((p) => p.subjectId === activeSubjectId && p.classId === classId).length === 0 && textbooks.filter(tb => !tb.temasCreated).length === 0 && (
              <div className="topics-onboarding">
                <div className="topics-onboarding__hero">
                  <button className="topics-onboarding__plan" onClick={() => setShowCoursePlanCreator(true)}>
                    <Sparkles size={26} className="topics-onboarding__plan-icon" />
                    <div className="topics-onboarding__plan-text">
                      <span className="topics-onboarding__plan-title">Planificar curso con IA</span>
                      <span className="topics-onboarding__plan-desc">
                        Sube la programación y genera automáticamente temas, fechas, exámenes y contenido
                      </span>
                    </div>
                  </button>
                  <div className="topics-onboarding__divider">
                    <span>o añade temas manualmente</span>
                  </div>
                  <button className="topics-onboarding__manual" onClick={() => setShowTopicModal(true)}>
                    <Plus size={16} />
                    <span>Nuevo tema</span>
                  </button>
                </div>
              </div>
            )}

            {/* ─── Plan in progress (not yet accepted, no topics yet) ─── */}
            {activeSubjectId && (activeSubject?.topics.length || 0) === 0 && coursePlans.filter((p) => p.subjectId === activeSubjectId && p.classId === classId).length > 0 && (
              <div className="topics-onboarding">
                <div className="topics-onboarding__hero">
                  {coursePlans
                    .filter((p) => p.subjectId === activeSubjectId && p.classId === classId)
                    .map((plan) => {
                      const isProcessing = plan.status === 'analyzing' || plan.status === 'generating';
                      return (
                        <div key={plan.id} className="topics-plan-status"
                          onClick={() => { if (plan.status === 'completed') setSelectedPlanId(plan.id); }}
                          role={plan.status === 'completed' ? 'button' : undefined}
                        >
                          <div className="topics-plan-status__row">
                            <Sparkles size={22} className="topics-plan-status__icon" />
                            <div className="topics-plan-status__info">
                              <span className="topics-plan-status__title">{plan.title || `Planificación ${activeSubjectName}`}</span>
                              <span className="topics-plan-status__label">
                                {isProcessing ? (
                                  <><Spinner size={12} /> {plan.status === 'analyzing' ? 'Analizando currículo...' : 'Generando plan...'}</>
                                ) : plan.status === 'completed' ? (
                                  'Planificación lista — toca para revisar'
                                ) : plan.status === 'failed' ? (
                                  'Error al generar'
                                ) : 'Pendiente'}
                              </span>
                            </div>
                            {!isProcessing && (
                              <button className="topics-plan-status__delete" onClick={(e) => {
                                e.stopPropagation();
                                setDeletePlanTarget({ id: plan.id, name: plan.title || `Planificación ${activeSubjectName}` });
                              }}>
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          {isProcessing && <Progress className="h-[3px] rounded-sm mt-2" />}
                        </div>
                      );
                    })
                  }
                  <div className="topics-onboarding__divider">
                    <span>mientras tanto</span>
                  </div>
                  <button className="topics-onboarding__manual" onClick={() => setShowTopicModal(true)}>
                    <Plus size={16} />
                    <span>Añadir tema manualmente</span>
                  </button>
                </div>
              </div>
            )}

            {/* ─── When topics exist: pending plan controls ─── */}
            {activeSubjectId && (activeSubject?.topics.length || 0) > 0 && coursePlans.filter((p) => p.subjectId === activeSubjectId && p.classId === classId && !p.topicsCreated).length > 0 && (
              <div className="topics-generated">
                {coursePlans
                  .filter((p) => p.subjectId === activeSubjectId && p.classId === classId && !p.topicsCreated)
                  .map((plan) => (
                    <CoursePlanCard
                      key={plan.id}
                      plan={plan}
                      subjectName={activeSubjectName}
                      onClick={() => { if (plan.status === 'completed') setSelectedPlanId(plan.id); }}
                      onDelete={() => setDeletePlanTarget({ id: plan.id, name: plan.title || `Planificación ${activeSubjectName}` })}
                    />
                  ))
                }
              </div>
            )}

            {/* ─── Pending textbooks (not yet split into temas) ─── */}
            {activeSubjectId && textbooks.filter(tb => !tb.temasCreated && !tb.coursePlanId).length > 0 && (
              <div className="topics-generated">
                <div className="topics-generated__header">
                  <Sparkles size={18} className="topics-generated__icon" />
                  <span className="topics-generated__title">Contenido generado</span>
                </div>
                {textbooks.filter(tb => !tb.temasCreated && !tb.coursePlanId).map((tb) => (
                  <TextbookCard
                    key={tb.id}
                    textbook={tb}
                    onClick={() => setSelectedTextbook(tb)}
                  />
                ))}
              </div>
            )}

            {/* Trimester pill filters */}
            {availableTrimesters.size > 1 && (
              <div className="trimester-pills">
                <button
                  className={`trimester-pill ${activeTrimester === 'all' ? 'trimester-pill--active' : ''}`}
                  onClick={() => { setActiveTrimester('all'); setSearch(''); }}
                >
                  Todos
                </button>
                {getPeriodNumbers(periodMode).filter((t) => availableTrimesters.has(t)).map((t) => (
                  <button
                    key={t}
                    className={`trimester-pill ${activeTrimester === String(t) ? 'trimester-pill--active' : ''}`}
                    onClick={() => { setActiveTrimester(String(t)); setSearch(''); }}
                  >
                    {getPeriodLabel(periodMode, t)}
                  </button>
                ))}
                {availableTrimesters.has(0) && (
                  <button
                    className={`trimester-pill ${activeTrimester === '0' ? 'trimester-pill--active' : ''}`}
                    onClick={() => { setActiveTrimester('0'); setSearch(''); }}
                  >
                    Sin trimestre
                  </button>
                )}
              </div>
            )}

            {(activeSubject?.topics.length || 0) > 3 && (
              <Searchbar
                value={search}
                onChange={(v) => setSearch(v)}
                placeholder="Buscar temas..."
                className="mx-4 lg:mx-6 my-1"
              />
            )}
            {activeTopics.length === 0 && (search || activeTrimester !== 'all') ? (
              <EmptyState icon="🔍" title="Sin resultados" subtitle={search ? "No hay temas que coincidan" : "No hay temas en este trimestre"} />
            ) : activeTopics.length > 0 ? (
              <div className="topics-list">
                <div className="flex flex-col">
                  {activeTopics.map((topic, idx) => (
                    <div
                      key={topic.id}
                      className="topic-item card-item cursor-pointer"
                      onClick={() => navigate(activeSubjectId ? `/tabs/classes/${classId}/subjects/${activeSubjectId}/topics/${topic.id}` : `/tabs/classes/${classId}/topics/${topic.id}`)}
                    >
                      <div className="topic-item__left">
                        <div className={`topic-item__number topic-item__number--${topic.status === 'taught' ? 'taught' : topic.status === 'ready' ? 'ready' : 'draft'}`}>
                          {topic.status === 'taught' ? '✓' : idx + 1}
                        </div>
                      </div>
                      <div className="topic-item__body">
                        <h3 className="topic-item__name">{topic.name}</h3>
                        {topic.description && <p className="topic-item__desc">{topic.description}</p>}
                        <div className="topic-item__tags">
                          {topic.trimester && activeTrimester === 'all' && (
                            <span className="topic-item__trimester-tag">{getPeriodLabel(periodMode, topic.trimester)}</span>
                          )}
                          {topic.hasContent && (
                            <span className={`topic-item__content-tag topic-item__content-tag--${topic.status === 'taught' ? 'taught' : topic.status === 'ready' ? 'ready' : 'default'}`}>
                              <Sparkles size={10} /> {topic.pageCount ? `${topic.pageCount} pág.` : 'IA'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="topic-item__right">
                        {topic.materialCount > 0 && (
                          <span className="topic-item__material-count">
                            <FileText size={14} className="opacity-60" /> {topic.materialCount}
                          </span>
                        )}
                        <button className="topic-item__delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: topic.id, name: topic.name }); }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* Textbook detail modal */}
        <TextbookDetailModal
          isOpen={!!selectedTextbook}
          onClose={() => {
            setSelectedTextbook(null);
            if (activeSubjectId) fetchTextbooks(activeSubjectId);
            fetchTopicsForClass(classId);
          }}
          textbook={selectedTextbook}
        />

        {/* Course plan creator modal */}
        <CoursePlanCreatorModal
          isOpen={showCoursePlanCreator}
          onClose={() => { setShowCoursePlanCreator(false); }}
          subjectId={activeSubjectId}
          subjectName={activeSubjectName}
          classId={classId}
          educationLevel={classGroup?.educationLevel || 'secundaria'}

          onPlanReady={() => {
            fetchCoursePlans(activeSubjectId, classId);
          }}
        />

        {/* Course plan detail modal */}
        <CoursePlanDetailModal
          isOpen={!!selectedPlanId}
          onClose={() => {
            setSelectedPlanId(null);
            fetchCoursePlans(activeSubjectId, classId);
            fetchTopicsForClass(classId);
          }}
          planId={selectedPlanId || ''}
          subjectName={activeSubjectName}
          periodMode={periodMode}
          onAccept={() => {
            fetchTopicsForClass(classId);
            fetchCoursePlans(activeSubjectId, classId);
          }}
        />

        {/* Delete topic confirmation */}
        <AlertConfirm
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          header="Eliminar tema"
          message={`¿Eliminar "${deleteTarget?.name}" y todo su contenido?`}
          cancelText="Cancelar"
          confirmText="Eliminar"
          variant="destructive"
          onConfirm={handleDeleteConfirm}
        />

        {/* Delete plan confirmation */}
        <AlertConfirm
          open={!!deletePlanTarget}
          onClose={() => setDeletePlanTarget(null)}
          header="Eliminar planificación"
          message={`¿Eliminar "${deletePlanTarget?.name}"?`}
          cancelText="Cancelar"
          confirmText="Eliminar"
          variant="destructive"
          onConfirm={async () => {
            if (deletePlanTarget) {
              await deletePlan(deletePlanTarget.id);
              await Promise.all([
                fetchCoursePlans(activeSubjectId, classId),
                fetchTopicsForClass(classId),
                fetchClassSubjects(classId),
              ]);
            }
            setDeletePlanTarget(null);
          }}
        />

        {/* Unlink subject confirmation */}
        <AlertConfirm
          open={!!unlinkTarget}
          onClose={() => setUnlinkTarget(null)}
          header="Desvincular asignatura"
          message={`¿Quitar "${unlinkTarget?.name}" de esta clase? La asignatura y sus temas seguirán existiendo, pero no estarán vinculados a esta clase.`}
          cancelText="Cancelar"
          confirmText="Desvincular"
          variant="destructive"
          onConfirm={handleUnlinkConfirm}
        />

        {/* ─── Link/create subjects modal ─── */}
        <Modal
          open={showSubjectModal}
          onClose={() => setShowSubjectModal(false)}
          title={`Asignaturas de ${classGroup?.name || 'la clase'}`}
          description="Vincula asignaturas existentes (comparten temario con otras clases)."
          sheetHeight="lg"
        >
          <div className="flex flex-col gap-4">
            {classSubjects.length > 0 && (
              <div className="linked-subjects">
                <span className="linked-subjects__label">Vinculadas a esta clase:</span>
                <div className="linked-subjects__items">
                  {classSubjects.map((s) => (
                    <div key={s.id} className="linked-subject-item">
                      <BookOpen size={18} className="linked-subject-item__icon" />
                      <span className="linked-subject-item__name">{s.name}</span>
                      {s.topicCount > 0 && (
                        <Badge variant="secondary">{s.topicCount} tema{s.topicCount !== 1 ? 's' : ''}</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="linked-subject-item__remove text-destructive hover:text-destructive"
                        onClick={() => setUnlinkTarget({ id: s.id, name: s.name })}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import from another class */}
            {otherClasses.length > 0 && (
              <div className="import-from-class">
                <span className="import-from-class__label">Importar de otra clase:</span>
                <div className="import-class-selector">
                  <Select
                    value={selectedSourceClassId}
                    onValueChange={(v) => handleSourceClassChange(v || '')}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar clase..." />
                    </SelectTrigger>
                    <SelectContent>
                      {otherClasses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedSourceClassId && (
                  loadingSourceSubjects ? (
                    <div className="import-loading"><Spinner /></div>
                  ) : availableSourceSubjects.length === 0 ? (
                    <p className="import-empty">
                      {sourceClassSubjects.length === 0
                        ? 'Esta clase no tiene asignaturas'
                        : 'Todas las asignaturas de esta clase ya están vinculadas'}
                    </p>
                  ) : (
                    <div className="available-subjects__list">
                      {availableSourceSubjects.map((s) => (
                        <div
                          key={s.id}
                          className={`subject-link-chip ${selectedLinkIds.includes(s.id) ? 'subject-link-chip--active' : ''}`}
                          onClick={() => toggleLinkSubject(s.id)}
                        >
                          <Checkbox checked={selectedLinkIds.includes(s.id)} />
                          <span>{s.name}</span>
                          {s.topicCount > 0 && (
                            <Badge variant="secondary">{s.topicCount} tema{s.topicCount !== 1 ? 's' : ''}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            <Button
              className="w-full mt-2"
              onClick={handleLinkSubjects}
              disabled={linkingSaving || selectedLinkIds.length === 0}
            >
              {linkingSaving ? <Spinner size={16} /> : 'Añadir'}
            </Button>
          </div>
        </Modal>

        {/* ─── New topic / generate content modal ─── */}
        <Modal
          open={showTopicModal}
          onClose={handleTopicModalDismiss}
          title={`Añadir — ${activeSubjectName}`}
          sheetHeight="lg"
        >
          <div style={subjectThemeStyle(subjectColor)} className="flex flex-col gap-4">
            <div className="ccm">
                {/* Nombre */}
                <div className="ccm__field">
                  <span className="ccm__enfoque-label">Nombre</span>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="ej. Ecuaciones lineales"
                  />
                </div>

                {/* Descripción */}
                <div className="ccm__notes">
                  <span className="ccm__enfoque-label">Descripción (opcional)</span>
                  <Textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Breve descripción del tema"
                    rows={2}
                  />
                </div>

                {/* Trimestre */}
                <div className="ccm__field">
                  <span className="ccm__enfoque-label">Trimestre</span>
                  <Select value={newTrimester || ''} onValueChange={(v) => setNewTrimester(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin asignar</SelectItem>
                      {getPeriodNumbers(periodMode).map((t) => (
                        <SelectItem key={t} value={String(t)}>{getPeriodFullLabel(periodMode, t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Documentos */}
                <div className="ccm__upload">
                  <span className="ccm__enfoque-label">Documentos (opcional)</span>
                  <button
                    className={`ccm__upload-btn ${selectedFiles.length > 0 ? 'ccm__upload-btn--has-file' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                  >
                    {selectedFiles.length > 0 ? <CheckCircle size={18} /> : <Upload size={18} />}
                    <span className="ccm__upload-name">
                      {selectedFiles.length > 0 ? `${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''}` : 'Añadir documentos'}
                    </span>
                  </button>

                  {selectedFiles.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {selectedFiles.map((file, idx) => (
                        <Badge key={idx} variant="outline" className="gap-1 py-1 px-2">
                          <FileText size={12} />
                          <span>{file.name}</span>
                          <XCircle size={12} onClick={() => removeFile(idx)} className="cursor-pointer" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {uploadProgress && (
                  <div className="topic-upload-progress">
                    <Progress className="h-1 rounded-sm" />
                    <span>{uploadProgress}</span>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={saving || !newName.trim() || !activeSubjectId}
                >
                  {saving ? (
                    <>
                      <Spinner size={16} className="mr-2" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Plus size={16} className="mr-1" />
                      Crear tema
                    </>
                  )}
                </Button>
              </div>
          </div>
        </Modal>
      </div>
    </PageShell>
  );
};

export default TopicsList;
