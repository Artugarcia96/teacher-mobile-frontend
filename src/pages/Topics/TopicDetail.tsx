import { useState, useEffect, useRef, useMemo } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonSpinner, IonCard, IonCardContent, IonAlert, IonItemSliding, IonItemOptions, IonItemOption,
  IonProgressBar, IonSearchbar,
} from '@ionic/react';
import { addOutline, documentOutline, imageOutline, trashOutline, createOutline, checkmarkOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useTopicsStore } from '../../store/topicsStore';
import EmptyState from '../../components/EmptyState';
import './TopicDetail.css';

const TopicDetail: React.FC = () => {
  const { classId, topicId } = useParams<{ classId: string; topicId: string }>();
  const history = useHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentTopic = useTopicsStore((s) => s.currentTopic);
  const loading = useTopicsStore((s) => s.loading);
  const fetchTopic = useTopicsStore((s) => s.fetchTopic);
  const updateTopic = useTopicsStore((s) => s.updateTopic);
  const uploadMaterial = useTopicsStore((s) => s.uploadMaterial);
  const deleteMaterial = useTopicsStore((s) => s.deleteMaterial);
  const clearCurrentTopic = useTopicsStore((s) => s.clearCurrentTopic);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState<{ id: string; name: string } | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');

  const filteredMaterials = useMemo(() => {
    if (!currentTopic) return [];
    if (!materialSearch) return currentTopic.materials;
    const term = materialSearch.toLowerCase();
    return currentTopic.materials.filter((m) => m.name.toLowerCase().includes(term));
  }, [currentTopic, materialSearch]);

  useEffect(() => {
    fetchTopic(topicId);
    return () => clearCurrentTopic();
  }, [topicId, fetchTopic, clearCurrentTopic]);

  useEffect(() => {
    if (currentTopic) {
      setEditName(currentTopic.name);
      setEditDescription(currentTopic.description || '');
    }
  }, [currentTopic]);

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateTopic(topicId, {
        name: editName.trim(),
        description: editDescription.trim() || undefined
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update topic:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setUploading(true);
    setUploadProgress('');
    try {
      const fileArray = Array.from(files);
      for (let i = 0; i < fileArray.length; i++) {
        setUploadProgress(`Subiendo ${i + 1}/${fileArray.length}...`);
        await uploadMaterial(topicId, fileArray[i]);
      }
    } catch (err) {
      console.error('Failed to upload material:', err);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteMaterialConfirm = async () => {
    if (!deleteMaterialTarget) return;
    try {
      await deleteMaterial(topicId, deleteMaterialTarget.id);
    } catch (err) {
      console.error('Failed to delete material:', err);
    }
    setDeleteMaterialTarget(null);
  };

  const getMaterialIcon = (type?: string) => {
    if (type === 'image') return imageOutline;
    return documentOutline;
  };

  if (loading && !currentTopic) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="topic-loading"><IonSpinner /></div>
        </IonContent>
      </IonPage>
    );
  }

  if (!currentTopic) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start">
              <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
            </IonButtons>
            <IonTitle>Tema no encontrado</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <EmptyState icon="📚" title="Tema no encontrado" />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/tabs/classes/${classId}`} text="" />
          </IonButtons>
          <IonTitle>{currentTopic.name}</IonTitle>
          <IonButtons slot="end">
            {isEditing ? (
              <IonButton onClick={handleSaveEdit} disabled={saving}>
                {saving ? <IonSpinner name="crescent" /> : <IonIcon icon={checkmarkOutline} />}
              </IonButton>
            ) : (
              <IonButton onClick={() => setIsEditing(true)}>
                <IonIcon icon={createOutline} />
              </IonButton>
            )}
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
          multiple
          onChange={handleFileUpload}
        />

        <IonCard>
          <IonCardContent>
            {isEditing ? (
              <IonList>
                <IonItem>
                  <IonLabel position="stacked">Nombre</IonLabel>
                  <IonInput value={editName} onIonInput={(e) => setEditName(e.detail.value ?? '')} />
                </IonItem>
                <IonItem>
                  <IonLabel position="stacked">Descripción</IonLabel>
                  <IonTextarea value={editDescription} onIonInput={(e) => setEditDescription(e.detail.value ?? '')} rows={3} />
                </IonItem>
              </IonList>
            ) : (
              <>
                <h2 className="topic-title">{currentTopic.name}</h2>
                {currentTopic.description && <p className="topic-description">{currentTopic.description}</p>}
              </>
            )}
          </IonCardContent>
        </IonCard>

        <div className="materials-section">
          <div className="materials-header">
            <h3>Materiales</h3>
            <IonButton size="small" onClick={handleUploadClick} disabled={uploading}>
              {uploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={addOutline} slot="start" /> Subir</>}
            </IonButton>
          </div>

          {uploadProgress && (
            <div className="materials-upload-progress">
              <IonProgressBar type="indeterminate" />
              <span>{uploadProgress}</span>
            </div>
          )}

          {currentTopic.materials.length === 0 ? (
            <EmptyState
              icon="📄"
              title="Sin materiales"
              subtitle="Sube PDFs o imágenes para este tema"
              actionLabel="Subir material"
              onAction={handleUploadClick}
            />
          ) : (
            <>
              {currentTopic.materials.length > 3 && (
                <IonSearchbar
                  value={materialSearch}
                  onIonInput={(e) => setMaterialSearch(e.detail.value ?? '')}
                  placeholder="Buscar materiales..."
                  className="materials-search"
                />
              )}
              {filteredMaterials.length === 0 ? (
                <EmptyState
                  icon="🔍"
                  title="Sin resultados"
                  subtitle="No hay materiales que coincidan"
                />
              ) : (
                <IonList>
                  {filteredMaterials.map((material) => (
                    <IonItemSliding key={material.id}>
                      <IonItem button>
                        <IonIcon icon={getMaterialIcon(material.documentType)} slot="start" />
                        <IonLabel>
                          <h3>{material.name}</h3>
                          <p>{new Date(material.uploadedAt).toLocaleDateString()}</p>
                        </IonLabel>
                      </IonItem>
                      <IonItemOptions side="end">
                        <IonItemOption color="danger" onClick={() => setDeleteMaterialTarget({ id: material.id, name: material.name })}>
                          <IonIcon icon={trashOutline} slot="icon-only" />
                        </IonItemOption>
                      </IonItemOptions>
                    </IonItemSliding>
                  ))}
                </IonList>
              )}
            </>
          )}
        </div>

        <IonAlert
          isOpen={!!deleteMaterialTarget}
          header="Eliminar material"
          message={`¿Eliminar "${deleteMaterialTarget?.name}"?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteMaterialTarget(null) },
            { text: 'Eliminar', role: 'destructive', handler: handleDeleteMaterialConfirm }
          ]}
          onDidDismiss={() => setDeleteMaterialTarget(null)}
        />
      </IonContent>
    </IonPage>
  );
};

export default TopicDetail;
