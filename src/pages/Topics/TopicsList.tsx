import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonModal, IonSpinner, IonBadge, IonAlert, IonChip, IonProgressBar,
  IonItemSliding, IonItemOptions, IonItemOption, IonReorder, IonReorderGroup,
  IonSearchbar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonCheckbox,
} from '@ionic/react';
import {
  addOutline, documentTextOutline, cloudUploadOutline, closeCircleOutline,
  bookOutline, linkOutline, trashOutline, sparklesOutline, downloadOutline,
  sparkles, checkmarkCircleOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useTopicsStore } from '../../store/topicsStore';
import { useClassesStore } from '../../store/classesStore';
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
import '../../components/ContentCreatorModal.css';
import './TopicsList.css';

const TopicsList: React.FC = () => {
  const { classId, subjectId: urlSubjectId } = useParams<{ classId: string; subjectId?: string }>();
  const history = useHistory();
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
  const { plans: coursePlans, fetchPlans: fetchCoursePlans, deletePlan } = useCoursePlanStore();
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
    fetchClasses();
    fetchTopicsForClass(classId);
    if (classId) { fetchClassSubjects(classId); fetchAcademicConfig(classId); }
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
    <IonPage style={subjectThemeStyle(subjectColor)}>
      <IonHeader>
        <IonToolbar style={subjectColor ? { '--background': subjectColor, '--color': 'white' } as React.CSSProperties : undefined}>
          <IonButtons slot="start">
            <IonBackButton defaultHref={urlSubjectId ? `/tabs/classes/${classId}/subjects/${urlSubjectId}` : `/tabs/classes/${classId}`} text="" color={subjectColor ? 'light' : undefined} />
          </IonButtons>
          <IonTitle>{classGroup ? `${classGroup.name} — Temario` : 'Temario'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleOpenSubjectModal} title="Gestionar asignaturas" color={subjectColor ? 'light' : undefined}>
              <IonIcon icon={linkOutline} />
            </IonButton>
            {activeSubjectId && (
              <IonButton onClick={() => {
                if (activeTrimester !== 'all' && activeTrimester !== '0') {
                  setNewTrimester(activeTrimester);
                }
                setShowTopicModal(true);
              }} color={subjectColor ? 'light' : undefined}>
                <IonIcon icon={addOutline} />
              </IonButton>
            )}
          </IonButtons>
        </IonToolbar>

        {/* Subject selector — only show when NOT in a subject-scoped route */}
        {!urlSubjectId && classSubjects.length > 0 && (
          <IonToolbar className="subject-selector-toolbar">
            {classSubjects.length <= 4 ? (
              <IonSegment
                value={activeSubjectId}
                onIonChange={(e) => { setActiveSubjectId(e.detail.value as string); setSearch(''); setActiveTrimester('all'); }}
                className="subject-segment"
              >
                {classSubjects.map((s) => (
                  <IonSegmentButton key={s.id} value={s.id}>
                    <IonLabel>{s.name}</IonLabel>
                  </IonSegmentButton>
                ))}
              </IonSegment>
            ) : (
              <IonSelect
                value={activeSubjectId}
                onIonChange={(e) => { setActiveSubjectId(e.detail.value); setSearch(''); setActiveTrimester('all'); }}
                interface="popover"
                className="subject-dropdown"
              >
                {classSubjects.map((s) => (
                  <IonSelectOption key={s.id} value={s.id}>{s.name}</IonSelectOption>
                ))}
              </IonSelect>
            )}
          </IonToolbar>
        )}

      </IonHeader>

      <IonContent>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
          multiple
          style={{ display: 'none' }}
        />

        {topicsLoading ? (
          <div className="topics-loading"><IonSpinner color="primary" /></div>
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
            {/* ─── Course plan section ─── */}
            {activeSubjectId && (
              <div className="topics-generated">
                {coursePlans.filter((p) => p.subjectId === activeSubjectId && p.classId === classId).length > 0 ? (
                  <>
                    <div className="topics-generated__header">
                      <IonIcon icon={sparklesOutline} className="topics-generated__icon" />
                      <span className="topics-generated__title">Planificación del curso</span>
                    </div>
                    {coursePlans
                      .filter((p) => p.subjectId === activeSubjectId && p.classId === classId)
                      .map((plan) => (
                        <CoursePlanCard
                          key={plan.id}
                          plan={plan}
                          subjectName={activeSubjectName}
                          onClick={() => {
                            if (plan.status === 'completed') {
                              setSelectedPlanId(plan.id);
                            }
                          }}
                          onDelete={() => setDeletePlanTarget({
                            id: plan.id,
                            name: plan.title || `Planificación ${activeSubjectName}`,
                          })}
                        />
                      ))
                    }
                  </>
                ) : (
                  <button
                    className="cplan-card cplan-card--new"
                    onClick={() => setShowCoursePlanCreator(true)}
                  >
                    <IonIcon icon={sparkles} className="cplan-card__icon" />
                    <span className="cplan-card__title">Planificar curso con IA</span>
                    <span className="cplan-card__new-desc">
                      Sube la programación y genera un plan completo con fechas, exámenes y sesiones de repaso
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* ─── Pending textbooks (not yet split into temas) ─── */}
            {activeSubjectId && textbooks.filter(tb => !tb.temasCreated && !tb.coursePlanId).length > 0 && (
              <div className="topics-generated">
                <div className="topics-generated__header">
                  <IonIcon icon={sparklesOutline} className="topics-generated__icon" />
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
              <IonSearchbar
                value={search}
                onIonInput={(e) => setSearch(e.detail.value ?? '')}
                placeholder="Buscar temas..."
                className="topics-search"
              />
            )}
            {activeTopics.length === 0 && !search && activeTrimester === 'all' && textbooks.filter(tb => !tb.temasCreated).length === 0 ? (
              <EmptyState
                icon="📄"
                title={`Sin temas en ${activeSubjectName}`}
                subtitle="Añade temas y sube materiales para esta asignatura"
                actionLabel="Nuevo tema"
                onAction={() => setShowTopicModal(true)}
              />
            ) : activeTopics.length === 0 && (search || activeTrimester !== 'all') ? (
              <EmptyState icon="🔍" title="Sin resultados" subtitle={search ? "No hay temas que coincidan" : "No hay temas en este trimestre"} />
            ) : activeTopics.length > 0 ? (
              <IonList className="topics-list">
                <IonReorderGroup disabled={false} onIonItemReorder={(e) => e.detail.complete()}>
                  {activeTopics.map((topic, idx) => (
                    <IonItemSliding key={topic.id}>
                      <IonItem
                        button
                        onClick={() => history.push(activeSubjectId ? `/tabs/classes/${classId}/subjects/${activeSubjectId}/topics/${topic.id}` : `/tabs/classes/${classId}/topics/${topic.id}`)}
                        className="topic-item card-item"
                      >
                        <div className="topic-item__left" slot="start">
                          <div className="topic-item__number">{idx + 1}</div>
                        </div>
                        <IonLabel className="topic-item__body">
                          <h3 className="topic-item__name">{topic.name}</h3>
                          {topic.description && <p className="topic-item__desc">{topic.description}</p>}
                          {((topic.trimester && activeTrimester === 'all') || topic.hasContent) && (
                            <div className="topic-item__tags">
                              {topic.trimester && activeTrimester === 'all' && (
                                <span className="topic-item__trimester-tag">{getPeriodLabel(periodMode, topic.trimester)}</span>
                              )}
                              {topic.hasContent && (
                                <span className={`topic-item__content-tag topic-item__content-tag--${topic.status === 'taught' ? 'taught' : topic.status === 'ready' ? 'ready' : 'default'}`}>
                                  {topic.pageCount ? `${topic.pageCount}p` : 'IA'}
                                </span>
                              )}
                            </div>
                          )}
                        </IonLabel>
                        <div className="topic-item__right" slot="end">
                          {topic.materialCount > 0 && (
                            <span className="topic-item__material-count">
                              <IonIcon icon={documentTextOutline} /> {topic.materialCount}
                            </span>
                          )}
                          <button className="topic-item__delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: topic.id, name: topic.name }); }}>
                            <IonIcon icon={trashOutline} />
                          </button>
                          <IonReorder />
                        </div>
                      </IonItem>
                      <IonItemOptions side="end">
                        <IonItemOption
                          color="danger"
                          onClick={() => setDeleteTarget({ id: topic.id, name: topic.name })}
                        >
                          Eliminar
                        </IonItemOption>
                      </IonItemOptions>
                    </IonItemSliding>
                  ))}
                </IonReorderGroup>
              </IonList>
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
        <IonAlert
          isOpen={!!deleteTarget}
          header="Eliminar tema"
          message={`¿Eliminar "${deleteTarget?.name}" y todo su contenido?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
            { text: 'Eliminar', role: 'destructive', handler: handleDeleteConfirm },
          ]}
          onDidDismiss={() => setDeleteTarget(null)}
        />

        {/* Delete plan confirmation */}
        <IonAlert
          isOpen={!!deletePlanTarget}
          header="Eliminar planificación"
          message={`¿Eliminar "${deletePlanTarget?.name}"?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeletePlanTarget(null) },
            { text: 'Eliminar', role: 'destructive', handler: async () => {
              if (deletePlanTarget) {
                await deletePlan(deletePlanTarget.id);
                fetchCoursePlans(activeSubjectId, classId);
                fetchTopicsForClass(classId);
              }
              setDeletePlanTarget(null);
            }},
          ]}
          onDidDismiss={() => setDeletePlanTarget(null)}
        />

        {/* Unlink subject confirmation */}
        <IonAlert
          isOpen={!!unlinkTarget}
          header="Desvincular asignatura"
          message={`¿Quitar "${unlinkTarget?.name}" de esta clase? La asignatura y sus temas seguirán existiendo, pero no estarán vinculados a esta clase.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setUnlinkTarget(null) },
            { text: 'Desvincular', role: 'destructive', handler: handleUnlinkConfirm },
          ]}
          onDidDismiss={() => setUnlinkTarget(null)}
        />

        {/* ─── Link/create subjects modal ─── */}
        <IonModal
          isOpen={showSubjectModal}
          onDidDismiss={() => setShowSubjectModal(false)}
          initialBreakpoint={isDesktop ? 1 : 0.65}
          breakpoints={isDesktop ? [0, 1] : [0, 0.65, 0.85]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Asignaturas de {classGroup?.name || 'la clase'}</h2>
            <p className="modal-sheet__subtitle">
              Vincula asignaturas existentes (comparten temario con otras clases).
            </p>

            {classSubjects.length > 0 && (
              <div className="linked-subjects">
                <span className="linked-subjects__label">Vinculadas a esta clase:</span>
                <div className="linked-subjects__items">
                  {classSubjects.map((s) => (
                    <div key={s.id} className="linked-subject-item">
                      <IonIcon icon={bookOutline} className="linked-subject-item__icon" />
                      <span className="linked-subject-item__name">{s.name}</span>
                      {s.topicCount > 0 && (
                        <IonBadge color="medium">{s.topicCount} tema{s.topicCount !== 1 ? 's' : ''}</IonBadge>
                      )}
                      <IonButton
                        fill="clear"
                        size="small"
                        color="danger"
                        className="linked-subject-item__remove"
                        onClick={() => setUnlinkTarget({ id: s.id, name: s.name })}
                      >
                        <IonIcon icon={trashOutline} slot="icon-only" />
                      </IonButton>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import from another class */}
            {otherClasses.length > 0 && (
              <div className="import-from-class">
                <span className="import-from-class__label">Importar de otra clase:</span>
                <IonItem lines="none" className="import-class-selector">
                  <IonSelect
                    value={selectedSourceClassId}
                    onIonChange={(e) => handleSourceClassChange(e.detail.value || '')}
                    interface="popover"
                    placeholder="Seleccionar clase..."
                  >
                    {otherClasses.map((c) => (
                      <IonSelectOption key={c.id} value={c.id}>{c.name}</IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>

                {selectedSourceClassId && (
                  loadingSourceSubjects ? (
                    <div className="import-loading"><IonSpinner name="crescent" /></div>
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
                          <IonCheckbox checked={selectedLinkIds.includes(s.id)} />
                          <span>{s.name}</span>
                          {s.topicCount > 0 && (
                            <IonBadge color="medium">{s.topicCount} tema{s.topicCount !== 1 ? 's' : ''}</IonBadge>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            )}

            <IonButton
              expand="block"
              className="ion-margin-top"
              onClick={handleLinkSubjects}
              disabled={linkingSaving || selectedLinkIds.length === 0}
            >
              {linkingSaving ? <IonSpinner name="crescent" /> : 'Añadir'}
            </IonButton>
          </div>
        </IonModal>

        {/* ─── New topic / generate content modal ─── */}
        <IonModal
          isOpen={showTopicModal}
          onDidDismiss={handleTopicModalDismiss}
          initialBreakpoint={isDesktop ? 1 : 0.75}
          breakpoints={isDesktop ? [0, 1] : [0, 0.75, 1]}
        >
          <IonHeader>
            <IonToolbar style={subjectColor ? { '--background': subjectColor, '--color': 'white' } as React.CSSProperties : undefined}>
              <IonTitle style={{ fontSize: 16 }}>Añadir — {activeSubjectName}</IonTitle>
              <IonButtons slot="end">
                <IonButton color={subjectColor ? 'light' : undefined} onClick={handleTopicModalDismiss}>
                  <IonIcon icon={closeCircleOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ion-padding" style={subjectThemeStyle(subjectColor)}>
            <div className="modal-sheet modal-sheet--scrollable" style={{ padding: 0 }}>

            <div className="ccm">
                {/* Nombre */}
                <div className="ccm__field">
                  <span className="ccm__enfoque-label">Nombre</span>
                  <IonItem lines="none" className="ccm__input">
                    <IonInput
                      value={newName}
                      onIonInput={(e) => setNewName(e.detail.value ?? '')}
                      placeholder="ej. Ecuaciones lineales"
                    />
                  </IonItem>
                </div>

                {/* Descripción */}
                <div className="ccm__notes">
                  <span className="ccm__enfoque-label">Descripción (opcional)</span>
                  <IonItem lines="none" className="ccm__notes-item">
                    <IonTextarea
                      value={newDescription}
                      onIonInput={(e) => setNewDescription(e.detail.value ?? '')}
                      placeholder="Breve descripción del tema"
                      rows={2}
                    />
                  </IonItem>
                </div>

                {/* Trimestre */}
                <div className="ccm__field">
                  <span className="ccm__enfoque-label">Trimestre</span>
                  <div className="ccm__trimester-pills">
                    {[
                      { value: '', label: 'Sin asignar' },
                      ...getPeriodNumbers(periodMode).map((t) => ({ value: String(t), label: getPeriodFullLabel(periodMode, t) })),
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        className={`ccm__trimester-pill${(newTrimester || '') === opt.value ? ' ccm__trimester-pill--active' : ''}`}
                        onClick={() => setNewTrimester(opt.value)}
                        type="button"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Documentos */}
                <div className="ccm__upload">
                  <span className="ccm__enfoque-label">Documentos (opcional)</span>
                  <button
                    className={`ccm__upload-btn ${selectedFiles.length > 0 ? 'ccm__upload-btn--has-file' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                  >
                    <IonIcon icon={selectedFiles.length > 0 ? checkmarkCircleOutline : cloudUploadOutline} />
                    <span className="ccm__upload-name">
                      {selectedFiles.length > 0 ? `${selectedFiles.length} archivo${selectedFiles.length > 1 ? 's' : ''}` : 'Añadir documentos'}
                    </span>
                  </button>

                  {selectedFiles.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {selectedFiles.map((file, idx) => (
                        <IonChip key={idx} style={{ margin: 0 }}>
                          <IonIcon icon={documentTextOutline} />
                          <IonLabel>{file.name}</IonLabel>
                          <IonIcon icon={closeCircleOutline} onClick={() => removeFile(idx)} style={{ cursor: 'pointer' }} />
                        </IonChip>
                      ))}
                    </div>
                  )}
                </div>

                {uploadProgress && (
                  <div className="topic-upload-progress">
                    <IonProgressBar type="indeterminate" />
                    <span>{uploadProgress}</span>
                  </div>
                )}

                <IonButton
                  expand="block"
                  color="primary"
                  onClick={handleCreate}
                  className="ccm__generate"
                  disabled={saving || !newName.trim() || !activeSubjectId}
                >
                  {saving ? (
                    <>
                      <IonSpinner name="crescent" style={{ marginRight: 8 }} />
                      Creando...
                    </>
                  ) : (
                    <>
                      <IonIcon icon={addOutline} slot="start" />
                      Crear tema
                    </>
                  )}
                </IonButton>
              </div>
          </div>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default TopicsList;
