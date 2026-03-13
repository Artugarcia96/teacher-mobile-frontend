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
  bookOutline, linkOutline, trashOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useTopicsStore } from '../../store/topicsStore';
import { useClassesStore } from '../../store/classesStore';
import { subjects as subjectsApi } from '../../services/api';
import { SubjectListItem } from '../../types';
import EmptyState from '../../components/EmptyState';
import './TopicsList.css';

const TopicsList: React.FC = () => {
  const { classId, subjectId: urlSubjectId } = useParams<{ classId: string; subjectId?: string }>();
  const history = useHistory();

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);

  const topicsBySubject = useTopicsStore((s) => s.topicsBySubject);
  const classSubjects = useTopicsStore((s) => s.classSubjects);
  const topicsLoading = useTopicsStore((s) => s.loading);
  const fetchTopicsForClass = useTopicsStore((s) => s.fetchTopicsForClass);
  const linkSubjectToClass = useTopicsStore((s) => s.linkSubjectToClass);
  const unlinkSubjectFromClass = useTopicsStore((s) => s.unlinkSubjectFromClass);
  const createAndLinkSubject = useTopicsStore((s) => s.createAndLinkSubject);
  const createTopic = useTopicsStore((s) => s.createTopic);
  const deleteTopic = useTopicsStore((s) => s.deleteTopic);
  const uploadMaterial = useTopicsStore((s) => s.uploadMaterial);

  const [activeSubjectId, setActiveSubjectId] = useState('');
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [search, setSearch] = useState('');

  // New topic form
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Link subject form
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [linkingSaving, setLinkingSaving] = useState(false);

  // Import from class selector
  const [selectedSourceClassId, setSelectedSourceClassId] = useState('');
  const [sourceClassSubjects, setSourceClassSubjects] = useState<SubjectListItem[]>([]);
  const [loadingSourceSubjects, setLoadingSourceSubjects] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSubject = useMemo(
    () => topicsBySubject.find((s) => s.subjectId === activeSubjectId),
    [topicsBySubject, activeSubjectId]
  );

  const activeTopics = useMemo(() => {
    const topics = activeSubject?.topics || [];
    if (!search) return topics;
    const term = search.toLowerCase();
    return topics.filter(
      (t) => t.name.toLowerCase().includes(term) || t.description?.toLowerCase().includes(term)
    );
  }, [activeSubject, search]);

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
  }, [classId, fetchClasses, fetchTopicsForClass]);

  useEffect(() => {
    if (urlSubjectId) {
      // When navigating from a subject-scoped route, lock to that subject
      setActiveSubjectId(urlSubjectId);
    } else if (classSubjects.length > 0 && (!activeSubjectId || !classSubjects.find((s) => s.id === activeSubjectId))) {
      setActiveSubjectId(classSubjects[0].id);
    }
  }, [classSubjects, activeSubjectId, urlSubjectId]);

  const handleOpenSubjectModal = () => {
    setSelectedLinkIds([]);
    setNewSubjectName('');
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
      if (newSubjectName.trim()) {
        await createAndLinkSubject(newSubjectName.trim(), classId);
      }
      setShowSubjectModal(false);
      setSelectedLinkIds([]);
      setNewSubjectName('');
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
      });

      if (selectedFiles.length > 0 && newTopic) {
        for (let i = 0; i < selectedFiles.length; i++) {
          setUploadProgress(`Subiendo ${i + 1}/${selectedFiles.length}...`);
          await uploadMaterial(newTopic.id, selectedFiles[i]);
        }
      }

      setNewName('');
      setNewDescription('');
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

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
          </IonButtons>
          <IonTitle>{classGroup ? `${classGroup.name} — Temario` : 'Temario'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleOpenSubjectModal} title="Gestionar asignaturas">
              <IonIcon icon={linkOutline} />
            </IonButton>
            {activeSubjectId && (
              <IonButton onClick={() => setShowTopicModal(true)}>
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
                onIonChange={(e) => { setActiveSubjectId(e.detail.value as string); setSearch(''); }}
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
                onIonChange={(e) => { setActiveSubjectId(e.detail.value); setSearch(''); }}
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
        ) : activeTopics.length === 0 && !search ? (
          <EmptyState
            icon="📄"
            title={`Sin temas en ${activeSubjectName}`}
            subtitle="Añade temas y sube materiales para esta asignatura"
            actionLabel="Nuevo tema"
            onAction={() => setShowTopicModal(true)}
          />
        ) : (
          <>
            {(activeSubject?.topics.length || 0) > 3 && (
              <IonSearchbar
                value={search}
                onIonInput={(e) => setSearch(e.detail.value ?? '')}
                placeholder="Buscar temas..."
                className="topics-search"
              />
            )}
            {activeTopics.length === 0 && search ? (
              <EmptyState icon="🔍" title="Sin resultados" subtitle="No hay temas que coincidan" />
            ) : (
              <IonList className="topics-list">
                <IonReorderGroup disabled={false} onIonItemReorder={(e) => e.detail.complete()}>
                  {activeTopics.map((topic, idx) => (
                    <IonItemSliding key={topic.id}>
                      <IonItem
                        button
                        onClick={() => history.push(`/tabs/classes/${classId}/topics/${topic.id}`)}
                        className="topic-item card-item"
                      >
                        <div className="topic-item__number" slot="start">{idx + 1}</div>
                        <IonLabel>
                          <h3 className="topic-item__name">{topic.name}</h3>
                          {topic.description && <p className="topic-item__desc">{topic.description}</p>}
                        </IonLabel>
                        <IonBadge slot="end" color="medium" className="topic-item__badge">
                          <IonIcon icon={documentTextOutline} /> {topic.materialCount}
                        </IonBadge>
                        <IonReorder slot="end" />
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
            )}
          </>
        )}

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
          initialBreakpoint={0.65}
          breakpoints={[0, 0.5, 0.65, 0.85]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Asignaturas de {classGroup?.name || 'la clase'}</h2>
            <p className="modal-sheet__subtitle">
              Vincula asignaturas existentes (comparten temario con otras clases) o crea una nueva.
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

            <div className="new-subject-section">
              <span className="new-subject-section__label">Crear nueva asignatura:</span>
              <IonItem lines="none" className="new-subject-input">
                <IonInput
                  value={newSubjectName}
                  onIonInput={(e) => setNewSubjectName(e.detail.value ?? '')}
                  placeholder="ej. Matemáticas, Lengua, Ciencias..."
                />
              </IonItem>
            </div>

            <IonButton
              expand="block"
              className="ion-margin-top"
              onClick={handleLinkSubjects}
              disabled={linkingSaving || (selectedLinkIds.length === 0 && !newSubjectName.trim())}
            >
              {linkingSaving ? <IonSpinner name="crescent" /> : 'Añadir'}
            </IonButton>
          </div>
        </IonModal>

        {/* ─── New topic modal ─── */}
        <IonModal
          isOpen={showTopicModal}
          onDidDismiss={handleTopicModalDismiss}
          initialBreakpoint={0.75}
          breakpoints={[0, 0.5, 0.75]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Nuevo tema — {activeSubjectName}</h2>
            <IonList>
              <IonItem>
                <IonLabel position="stacked">Nombre</IonLabel>
                <IonInput
                  value={newName}
                  onIonInput={(e) => setNewName(e.detail.value ?? '')}
                  placeholder="ej. Ecuaciones lineales"
                />
              </IonItem>
              <IonItem>
                <IonLabel position="stacked">Descripción (opcional)</IonLabel>
                <IonTextarea
                  value={newDescription}
                  onIonInput={(e) => setNewDescription(e.detail.value ?? '')}
                  placeholder="Breve descripción del tema"
                  rows={2}
                />
              </IonItem>
            </IonList>

            <div className="topic-upload-section">
              <IonButton fill="outline" expand="block" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                <IonIcon icon={cloudUploadOutline} slot="start" />
                Añadir documentos
              </IonButton>

              {selectedFiles.length > 0 && (
                <div className="topic-files-list">
                  {selectedFiles.map((file, idx) => (
                    <IonChip key={idx} className="topic-file-chip">
                      <IonIcon icon={documentTextOutline} />
                      <span className="topic-file-name">{file.name}</span>
                      <IonIcon icon={closeCircleOutline} onClick={() => removeFile(idx)} className="topic-file-remove" />
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
              onClick={handleCreate}
              className="ion-margin-top"
              disabled={saving || !newName.trim() || !activeSubjectId}
            >
              {saving ? <IonSpinner name="crescent" /> : 'Crear tema'}
            </IonButton>
          </div>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default TopicsList;
