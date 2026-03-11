import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonSearchbar, IonIcon, IonSpinner, IonChip, IonAlert, IonBadge,
  IonItem, IonLabel, IonProgressBar, IonModal, IonList, IonButtons,
  IonAccordionGroup, IonAccordion, IonInput, IonSelect, IonSelectOption,
} from '@ionic/react';
import {
  cloudUploadOutline, documentTextOutline, imageOutline, folderOpenOutline,
  closeCircleOutline, trashOutline, eyeOutline, downloadOutline,
  schoolOutline, chevronDownOutline, bookOutline, addOutline,
  createOutline, globeOutline,
} from 'ionicons/icons';
import { useMaterialsStore } from '../../store/materialsStore';
import EmptyState from '../../components/EmptyState';
import './Materials.css';

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: documentTextOutline,
  image: imageOutline,
  other: folderOpenOutline,
};

const GLOBAL_CLASS_NAME = 'Global';
const GLOBAL_CLASS_SUBJECT = 'Material Transversal';

const Materials: React.FC = () => {
  const structure = useMaterialsStore((s) => s.structure);
  const loading = useMaterialsStore((s) => s.loading);
  const uploading = useMaterialsStore((s) => s.uploading);
  const fetchStructure = useMaterialsStore((s) => s.fetchStructure);
  const uploadMaterial = useMaterialsStore((s) => s.uploadMaterial);
  const deleteMaterial = useMaterialsStore((s) => s.deleteMaterial);
  const createClass = useMaterialsStore((s) => s.createClass);
  const createTopic = useMaterialsStore((s) => s.createTopic);

  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<string[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);

  // Upload state
  const [uploadTargetTopicId, setUploadTargetTopicId] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Quick create state
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [isCreatingGlobalClass, setIsCreatingGlobalClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassSubject, setNewClassSubject] = useState('');
  const [creatingClass, setCreatingClass] = useState(false);

  const [addingTopicToClassId, setAddingTopicToClassId] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStructure();
  }, [fetchStructure]);

  // Check if global class exists
  const globalClass = useMemo(() => 
    structure.find((c) => c.className === GLOBAL_CLASS_NAME && c.classSubject === GLOBAL_CLASS_SUBJECT),
    [structure]
  );

  // Sort structure: Global first, then alphabetically
  const sortedStructure = useMemo(() => {
    return [...structure].sort((a, b) => {
      const aIsGlobal = a.className === GLOBAL_CLASS_NAME && a.classSubject === GLOBAL_CLASS_SUBJECT;
      const bIsGlobal = b.className === GLOBAL_CLASS_NAME && b.classSubject === GLOBAL_CLASS_SUBJECT;
      if (aIsGlobal && !bIsGlobal) return -1;
      if (!aIsGlobal && bIsGlobal) return 1;
      return a.className.localeCompare(b.className);
    });
  }, [structure]);

  // Filter structure based on search and class filter
  const filteredStructure = useMemo(() => {
    let result = sortedStructure;
    
    // Apply class filter
    if (classFilter !== 'all') {
      result = result.filter((c) => c.classId === classFilter);
    }
    
    // Apply search filter
    if (search) {
      const term = search.toLowerCase();
      result = result
        .map((c) => ({
          ...c,
          topics: c.topics
            .map((t) => ({
              ...t,
              materials: t.materials.filter((m) =>
                m.name.toLowerCase().includes(term)
              ),
            }))
            .filter(
              (t) =>
                t.name.toLowerCase().includes(term) ||
                t.materials.length > 0
            ),
        }))
        .filter(
          (c) =>
            c.className.toLowerCase().includes(term) ||
            c.classSubject.toLowerCase().includes(term) ||
            c.topics.length > 0
        );
    }
    
    return result;
  }, [sortedStructure, search, classFilter]);

  const totalMaterials = useMemo(() => 
    structure.reduce((acc, c) => 
      acc + c.topics.reduce((tacc, t) => tacc + t.materials.length, 0), 0
    ), [structure]);

  const toggleClass = (classId: string) => {
    setExpandedClasses((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  };

  const expandAll = () => {
    const allClassIds = filteredStructure.map((c) => c.classId);
    const allTopicIds = filteredStructure.flatMap((c) => c.topics.map((t) => t.id));
    setExpandedClasses(allClassIds);
    setExpandedTopics(allTopicIds);
  };

  const collapseAll = () => {
    setExpandedClasses([]);
    setExpandedTopics([]);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(files);
      setUploadTargetTopicId(null);
      setShowUploadModal(true);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(Array.from(files));
      if (!uploadTargetTopicId) {
        setShowUploadModal(true);
      } else {
        handleDirectUpload(Array.from(files));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDirectUpload = async (files: File[]) => {
    if (!uploadTargetTopicId || files.length === 0) return;
    
    setUploadProgress('');
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Subiendo ${i + 1}/${files.length}...`);
        await uploadMaterial(uploadTargetTopicId, files[i]);
      }
    } catch {
      // Error handled in store
    }
    setSelectedFiles([]);
    setUploadTargetTopicId(null);
    setUploadProgress('');
  };

  const handleModalUpload = async () => {
    if (!uploadTargetTopicId || selectedFiles.length === 0) return;
    
    setUploadProgress('');
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        setUploadProgress(`Subiendo ${i + 1}/${selectedFiles.length}...`);
        await uploadMaterial(uploadTargetTopicId, selectedFiles[i]);
      }
      setSelectedFiles([]);
      setUploadTargetTopicId(null);
      setUploadProgress('');
      setShowUploadModal(false);
    } catch {
      setUploadProgress('');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMaterial(deleteTarget.id);
    } catch {
      // Error handled in store
    }
    setDeleteTarget(null);
  };

  const handleCreateClass = async () => {
    const name = isCreatingGlobalClass ? GLOBAL_CLASS_NAME : newClassName.trim();
    const subject = isCreatingGlobalClass ? GLOBAL_CLASS_SUBJECT : newClassSubject.trim();
    
    if (!name || !subject) return;
    
    setCreatingClass(true);
    try {
      const newClass = await createClass(name, subject);
      setExpandedClasses((prev) => [...prev, newClass.classId]);
      setNewClassName('');
      setNewClassSubject('');
      setShowCreateClassModal(false);
      setIsCreatingGlobalClass(false);
    } catch {
      // Error handled in store
    }
    setCreatingClass(false);
  };

  const handleCreateGlobalClass = async () => {
    setIsCreatingGlobalClass(true);
    setShowCreateClassModal(true);
  };

  const handleCreateTopic = async (classId: string) => {
    if (!newTopicName.trim()) return;
    setCreatingTopic(true);
    try {
      const newTopic = await createTopic(classId, newTopicName.trim());
      setExpandedClasses((prev) => prev.includes(classId) ? prev : [...prev, classId]);
      setExpandedTopics((prev) => [...prev, newTopic.id]);
      setNewTopicName('');
      setAddingTopicToClassId(null);
    } catch {
      // Error handled in store
    }
    setCreatingTopic(false);
  };

  const triggerUploadForTopic = (topicId: string) => {
    setUploadTargetTopicId(topicId);
    fileInputRef.current?.click();
  };

  const getFileUrl = (url: string) => {
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (url.startsWith('/uploads/')) {
      return `${baseUrl}/files${url.replace('/uploads', '')}`;
    }
    return `${baseUrl}${url}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const hasExpandedItems = expandedClasses.length > 0 || expandedTopics.length > 0;

  // Get all topics for the upload modal dropdown
  const allTopicsForUpload = useMemo(() => 
    sortedStructure.flatMap((c) =>
      c.topics.map((t) => ({
        topicId: t.id,
        topicName: t.name,
        className: c.className,
        classSubject: c.classSubject,
        isGlobal: c.className === GLOBAL_CLASS_NAME && c.classSubject === GLOBAL_CLASS_SUBJECT,
      }))
    ), [sortedStructure]);

  const isGlobalClass = (c: typeof structure[0]) => 
    c.className === GLOBAL_CLASS_NAME && c.classSubject === GLOBAL_CLASS_SUBJECT;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Materiales</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => { setIsCreatingGlobalClass(false); setShowCreateClassModal(true); }} title="Nueva clase">
              <IonIcon icon={createOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.md"
          multiple
          hidden
        />

        <div
          ref={dropZoneRef}
          className={`materials-dropzone ${isDragging ? 'materials-dropzone--active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="materials-controls">
            <IonSearchbar
              value={search}
              onIonInput={(e) => setSearch(e.detail.value ?? '')}
              placeholder="Buscar materiales..."
              className="materials-search"
              debounce={300}
            />

            {/* Class filter dropdown */}
            {structure.length > 1 && (
              <div className="materials-class-filter">
                <IonSelect
                  value={classFilter}
                  onIonChange={(e) => setClassFilter(e.detail.value)}
                  interface="popover"
                  className="materials-class-select"
                >
                  <IonSelectOption value="all">Todas las clases</IonSelectOption>
                  {sortedStructure.map((c) => (
                    <IonSelectOption key={c.classId} value={c.classId}>
                      {isGlobalClass(c) ? '🌐 Global / Transversal' : `${c.className} — ${c.classSubject}`}
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </div>
            )}

            {structure.length > 0 && (
              <div className="materials-filters">
                <span className="materials-count">
                  {totalMaterials} material{totalMaterials !== 1 ? 'es' : ''} en {structure.length} clase{structure.length !== 1 ? 's' : ''}
                </span>
                <button
                  className="materials-expand-btn"
                  onClick={hasExpandedItems ? collapseAll : expandAll}
                >
                  {hasExpandedItems ? 'Colapsar' : 'Expandir'}
                </button>
              </div>
            )}
          </div>

          {isDragging && (
            <div className="materials-drop-overlay">
              <IonIcon icon={cloudUploadOutline} />
              <span>Suelta los archivos aquí</span>
            </div>
          )}

          {uploadProgress && (
            <div className="materials-upload-indicator">
              <IonProgressBar type="indeterminate" />
              <span>{uploadProgress}</span>
            </div>
          )}

          {loading && structure.length === 0 ? (
            <div className="materials-loading">
              <IonSpinner color="primary" />
            </div>
          ) : structure.length === 0 ? (
            <EmptyState
              icon="📚"
              title="Sin clases"
              subtitle="Crea tu primera clase para empezar a organizar materiales"
              actionLabel="Crear clase"
              onAction={() => setShowCreateClassModal(true)}
            />
          ) : filteredStructure.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="Sin resultados"
              subtitle="No hay materiales que coincidan con la búsqueda"
            />
          ) : (
            <div className="materials-accordion-container">
              {/* Global class quick-add if not exists */}
              {!globalClass && (
                <button
                  className="materials-global-btn"
                  onClick={handleCreateGlobalClass}
                >
                  <IonIcon icon={globeOutline} />
                  <div className="materials-global-btn__text">
                    <span className="materials-global-btn__title">Material Transversal</span>
                    <span className="materials-global-btn__subtitle">Crear sección para material global</span>
                  </div>
                  <IonIcon icon={addOutline} className="materials-global-btn__add" />
                </button>
              )}

              <IonAccordionGroup multiple value={expandedClasses}>
                {filteredStructure.map((classData) => {
                  const isGlobal = isGlobalClass(classData);
                  
                  return (
                    <IonAccordion
                      key={classData.classId}
                      value={classData.classId}
                      className={`materials-class-accordion ${isGlobal ? 'materials-class-accordion--global' : ''}`}
                      toggleIcon={chevronDownOutline}
                      toggleIconSlot="end"
                    >
                      <IonItem
                        slot="header"
                        className="materials-class-header"
                        onClick={() => toggleClass(classData.classId)}
                      >
                        <div className={`materials-class-icon ${isGlobal ? 'materials-class-icon--global' : ''}`} slot="start">
                          <IonIcon icon={isGlobal ? globeOutline : schoolOutline} />
                        </div>
                        <IonLabel>
                          <h2 className="materials-class-name">
                            {isGlobal ? 'Global / Transversal' : classData.className}
                          </h2>
                          <p className="materials-class-subject">
                            {isGlobal ? 'Material para todas las clases' : classData.classSubject}
                          </p>
                        </IonLabel>
                        <IonBadge slot="end" color={isGlobal ? 'tertiary' : 'primary'} className="materials-class-badge">
                          {classData.topics.reduce((acc, t) => acc + t.materials.length, 0)}
                        </IonBadge>
                      </IonItem>

                      <div slot="content" className="materials-topics-container">
                        {classData.topics.length === 0 ? (
                          <div className="materials-no-topics">
                            <p>Esta {isGlobal ? 'sección' : 'clase'} no tiene temas aún</p>
                          </div>
                        ) : (
                          <IonAccordionGroup multiple value={expandedTopics}>
                            {classData.topics.map((topic) => (
                              <IonAccordion
                                key={topic.id}
                                value={topic.id}
                                className="materials-topic-accordion"
                                toggleIcon={chevronDownOutline}
                                toggleIconSlot="end"
                              >
                                <IonItem
                                  slot="header"
                                  className="materials-topic-header"
                                  onClick={() => toggleTopic(topic.id)}
                                >
                                  <div className="materials-topic-icon" slot="start">
                                    <IonIcon icon={bookOutline} />
                                  </div>
                                  <IonLabel>
                                    <h3 className="materials-topic-name">{topic.name}</h3>
                                  </IonLabel>
                                  <IonBadge slot="end" color="medium" className="materials-topic-badge">
                                    {topic.materials.length}
                                  </IonBadge>
                                </IonItem>

                                <div slot="content" className="materials-files-container">
                                  {topic.materials.length === 0 ? (
                                    <p className="materials-empty-topic">Sin materiales</p>
                                  ) : (
                                    topic.materials.map((m) => (
                                      <div key={m.id} className="material-file-row">
                                        <div className="material-file-icon">
                                          <IonIcon icon={FILE_TYPE_ICONS[m.documentType || 'other']} />
                                        </div>
                                        <div className="material-file-info">
                                          <span className="material-file-name">{m.name}</span>
                                          <span className="material-file-date">{formatDate(m.uploadedAt)}</span>
                                        </div>
                                        <div className="material-file-actions">
                                          <a
                                            href={getFileUrl(m.documentUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="material-file-action"
                                            title="Ver"
                                          >
                                            <IonIcon icon={eyeOutline} />
                                          </a>
                                          <a
                                            href={getFileUrl(m.documentUrl)}
                                            download={m.name}
                                            className="material-file-action"
                                            title="Descargar"
                                          >
                                            <IonIcon icon={downloadOutline} />
                                          </a>
                                          <button
                                            className="material-file-action material-file-action--danger"
                                            onClick={() => setDeleteTarget({ id: m.id, name: m.name })}
                                            title="Eliminar"
                                          >
                                            <IonIcon icon={trashOutline} />
                                          </button>
                                        </div>
                                      </div>
                                    ))
                                  )}

                                  <button
                                    className="material-add-btn"
                                    onClick={() => triggerUploadForTopic(topic.id)}
                                  >
                                    <IonIcon icon={cloudUploadOutline} />
                                    <span>Subir archivo</span>
                                  </button>
                                </div>
                              </IonAccordion>
                            ))}
                          </IonAccordionGroup>
                        )}

                        {/* Add topic inline form */}
                        {addingTopicToClassId === classData.classId ? (
                          <div className="materials-add-topic-form">
                            <IonInput
                              value={newTopicName}
                              onIonInput={(e) => setNewTopicName(e.detail.value ?? '')}
                              placeholder="Nombre del tema"
                              className="materials-add-topic-input"
                              onKeyDown={(e) => e.key === 'Enter' && handleCreateTopic(classData.classId)}
                            />
                            <IonButton
                              size="small"
                              onClick={() => handleCreateTopic(classData.classId)}
                              disabled={creatingTopic || !newTopicName.trim()}
                            >
                              {creatingTopic ? <IonSpinner name="crescent" /> : 'Crear'}
                            </IonButton>
                            <IonButton
                              size="small"
                              fill="clear"
                              onClick={() => {
                                setAddingTopicToClassId(null);
                                setNewTopicName('');
                              }}
                            >
                              Cancelar
                            </IonButton>
                          </div>
                        ) : (
                          <button
                            className="materials-add-topic-btn"
                            onClick={() => setAddingTopicToClassId(classData.classId)}
                          >
                            <IonIcon icon={addOutline} />
                            <span>Añadir tema</span>
                          </button>
                        )}
                      </div>
                    </IonAccordion>
                  );
                })}
              </IonAccordionGroup>

              {/* Add class card */}
              <button
                className="materials-add-class-btn"
                onClick={() => { setIsCreatingGlobalClass(false); setShowCreateClassModal(true); }}
              >
                <IonIcon icon={addOutline} />
                <span>Nueva clase</span>
              </button>
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        <IonAlert
          isOpen={!!deleteTarget}
          header="Eliminar material"
          message={`¿Eliminar "${deleteTarget?.name}"?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
            { text: 'Eliminar', role: 'destructive', handler: handleDeleteConfirm },
          ]}
          onDidDismiss={() => setDeleteTarget(null)}
        />

        {/* Upload modal (for drag & drop) */}
        <IonModal
          isOpen={showUploadModal}
          onDidDismiss={() => {
            setShowUploadModal(false);
            setSelectedFiles([]);
            setUploadTargetTopicId(null);
            setUploadProgress('');
          }}
          initialBreakpoint={0.6}
          breakpoints={[0, 0.6, 0.9]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Subir materiales</h2>

            <div className="upload-files-preview">
              {selectedFiles.map((file, idx) => (
                <IonChip key={idx} className="upload-file-chip">
                  <IonIcon icon={documentTextOutline} />
                  <span className="upload-file-name">{file.name}</span>
                  <IonIcon
                    icon={closeCircleOutline}
                    onClick={() => removeFile(idx)}
                    className="upload-file-remove"
                  />
                </IonChip>
              ))}
            </div>

            <IonList>
              <IonItem>
                <IonLabel position="stacked">Destino</IonLabel>
                <select
                  value={uploadTargetTopicId || ''}
                  onChange={(e) => setUploadTargetTopicId(e.target.value || null)}
                  className="materials-topic-select"
                >
                  <option value="">Selecciona un tema...</option>
                  {/* Global topics first */}
                  {allTopicsForUpload.some((t) => t.isGlobal) && (
                    <optgroup label="🌐 Global / Transversal">
                      {allTopicsForUpload
                        .filter((t) => t.isGlobal)
                        .map((t) => (
                          <option key={t.topicId} value={t.topicId}>
                            {t.topicName}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {/* Other classes */}
                  {sortedStructure
                    .filter((c) => !isGlobalClass(c))
                    .map((c) => (
                      <optgroup key={c.classId} label={`${c.className} — ${c.classSubject}`}>
                        {c.topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                </select>
              </IonItem>
            </IonList>

            {allTopicsForUpload.length === 0 && (
              <p className="materials-no-topics-warning">
                No hay temas disponibles. Crea una clase y un tema primero.
              </p>
            )}

            <IonButton
              expand="block"
              onClick={handleModalUpload}
              className="ion-margin-top"
              disabled={uploading || !uploadTargetTopicId || selectedFiles.length === 0}
            >
              {uploading ? <IonSpinner name="crescent" /> : `Subir ${selectedFiles.length} archivo${selectedFiles.length !== 1 ? 's' : ''}`}
            </IonButton>
          </div>
        </IonModal>

        {/* Create class modal */}
        <IonModal
          isOpen={showCreateClassModal}
          onDidDismiss={() => {
            setShowCreateClassModal(false);
            setNewClassName('');
            setNewClassSubject('');
            setIsCreatingGlobalClass(false);
          }}
          initialBreakpoint={0.45}
          breakpoints={[0, 0.45, 0.7]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">
              {isCreatingGlobalClass ? 'Crear Material Transversal' : 'Nueva clase'}
            </h2>

            {isCreatingGlobalClass ? (
              <div className="materials-global-info">
                <IonIcon icon={globeOutline} className="materials-global-info__icon" />
                <p>
                  Se creará una sección especial para material que aplica a todas las clases.
                  Podrás organizar temas y subir archivos que sean transversales.
                </p>
              </div>
            ) : (
              <IonList>
                <IonItem>
                  <IonLabel position="stacked">Nombre</IonLabel>
                  <IonInput
                    value={newClassName}
                    onIonInput={(e) => setNewClassName(e.detail.value ?? '')}
                    placeholder="ej. 3A, 2º ESO B"
                  />
                </IonItem>
                <IonItem>
                  <IonLabel position="stacked">Asignatura</IonLabel>
                  <IonInput
                    value={newClassSubject}
                    onIonInput={(e) => setNewClassSubject(e.detail.value ?? '')}
                    placeholder="ej. Matemáticas, Física"
                  />
                </IonItem>
              </IonList>
            )}

            <IonButton
              expand="block"
              onClick={handleCreateClass}
              className="ion-margin-top"
              disabled={creatingClass || (!isCreatingGlobalClass && (!newClassName.trim() || !newClassSubject.trim()))}
            >
              {creatingClass ? <IonSpinner name="crescent" /> : (isCreatingGlobalClass ? 'Crear sección global' : 'Crear clase')}
            </IonButton>
          </div>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Materials;
