import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonModal, IonSpinner, IonBadge, IonAlert, IonChip, IonProgressBar,
  IonItemSliding, IonItemOptions, IonItemOption, IonReorder, IonReorderGroup,
  IonSearchbar,
} from '@ionic/react';
import { addOutline, documentTextOutline, cloudUploadOutline, closeCircleOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useTopicsStore } from '../../store/topicsStore';
import { useClassesStore } from '../../store/classesStore';
import EmptyState from '../../components/EmptyState';
import './TopicsList.css';

const TopicsList: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const history = useHistory();

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);

  const topicsList = useTopicsStore((s) => s.topics);
  const topicsLoading = useTopicsStore((s) => s.loading);
  const fetchTopics = useTopicsStore((s) => s.fetchTopics);
  const createTopic = useTopicsStore((s) => s.createTopic);
  const deleteTopic = useTopicsStore((s) => s.deleteTopic);

  const allClassTopics = useMemo(() => topicsList.filter((t) => t.classId === classId), [topicsList, classId]);

  const uploadMaterial = useTopicsStore((s) => s.uploadMaterial);

  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');

  const classTopics = useMemo(() => {
    if (!search) return allClassTopics;
    const term = search.toLowerCase();
    return allClassTopics.filter((t) => 
      t.name.toLowerCase().includes(term) || 
      t.description?.toLowerCase().includes(term)
    );
  }, [allClassTopics, search]);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchClasses();
    fetchTopics(classId);
  }, [classId, fetchClasses, fetchTopics]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    setUploadProgress('');
    try {
      const newTopic = await createTopic(classId, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });

      // Upload files if any
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
      setShowModal(false);
    } catch (err) {
      console.error('Failed to create topic:', err);
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  };

  const handleModalDismiss = () => {
    setShowModal(false);
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

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
          </IonButtons>
          <IonTitle>{classGroup ? `${classGroup.name} — Temario` : 'Temario'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setShowModal(true)}>
              <IonIcon icon={addOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {topicsLoading && allClassTopics.length === 0 ? (
          <div className="topics-loading"><IonSpinner color="primary" /></div>
        ) : allClassTopics.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Sin temas"
            subtitle="Organiza el contenido de la clase por temas y lecciones"
            actionLabel="Nuevo tema"
            onAction={() => setShowModal(true)}
          />
        ) : (
          <>
          {allClassTopics.length > 3 && (
            <IonSearchbar
              value={search}
              onIonInput={(e) => setSearch(e.detail.value ?? '')}
              placeholder="Buscar temas..."
              className="topics-search"
            />
          )}
          {classTopics.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="Sin resultados"
              subtitle="No hay temas que coincidan con la búsqueda"
            />
          ) : (
          <IonList className="topics-list">
            <IonReorderGroup disabled={false} onIonItemReorder={(e) => e.detail.complete()}>
              {classTopics.map((topic, idx) => (
                <IonItemSliding key={topic.id}>
                  <IonItem
                    button
                    onClick={() => history.push(`/tabs/classes/${classId}/topics/${topic.id}`)}
                    className="topic-item card-item"
                  >
                    <div className="topic-item__number" slot="start">{idx + 1}</div>
                    <IonLabel>
                      <h3 className="topic-item__name">{topic.name}</h3>
                      {topic.description && (
                        <p className="topic-item__desc">{topic.description}</p>
                      )}
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

        {/* Delete confirmation */}
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

        {/* New topic modal */}
        <IonModal isOpen={showModal} onDidDismiss={handleModalDismiss} initialBreakpoint={0.75} breakpoints={[0, 0.5, 0.75]}>
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Nuevo tema</h2>
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

            {/* File upload section */}
            <div className="topic-upload-section">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
                multiple
                hidden
              />
              <IonButton
                fill="outline"
                expand="block"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <IonIcon icon={cloudUploadOutline} slot="start" />
                Añadir documentos
              </IonButton>

              {selectedFiles.length > 0 && (
                <div className="topic-files-list">
                  {selectedFiles.map((file, idx) => (
                    <IonChip key={idx} className="topic-file-chip">
                      <IonIcon icon={documentTextOutline} />
                      <span className="topic-file-name">{file.name}</span>
                      <IonIcon
                        icon={closeCircleOutline}
                        onClick={() => removeFile(idx)}
                        className="topic-file-remove"
                      />
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
              disabled={saving || !newName.trim()}
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
