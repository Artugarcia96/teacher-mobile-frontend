import { useState, useEffect, useRef, useMemo } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonList, IonItem, IonLabel, IonInput, IonTextarea,
  IonSpinner, IonAlert, IonItemSliding, IonItemOptions, IonItemOption,
  IonProgressBar, IonSearchbar, IonSelect, IonSelectOption, IonBadge,
  IonModal, IonToggle, IonCard, IonCardContent,
} from '@ionic/react';
import {
  addOutline, documentOutline, imageOutline, trashOutline, createOutline, checkmarkOutline,
  downloadOutline, sparklesOutline, cloudUploadOutline,
  closeOutline, chevronDownOutline, chevronUpOutline,
} from 'ionicons/icons';
import { topics as topicsApi } from '../../services/api';
import { SubTopic } from '../../types';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import { useParams, useHistory } from 'react-router-dom';
import { useTopicsStore } from '../../store/topicsStore';
import { useClassesStore } from '../../store/classesStore';
import EmptyState from '../../components/EmptyState';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import './TopicDetail.css';

const TopicDetail: React.FC = () => {
  const { classId, topicId, subjectId } = useParams<{ classId: string; topicId: string; subjectId?: string }>();
  const history = useHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subTemaFileInputRef = useRef<HTMLInputElement>(null);

  const currentTopic = useTopicsStore((s) => s.currentTopic);
  const loading = useTopicsStore((s) => s.loading);
  const fetchTopic = useTopicsStore((s) => s.fetchTopic);
  const updateTopic = useTopicsStore((s) => s.updateTopic);
  const createTopic = useTopicsStore((s) => s.createTopic);
  const uploadMaterial = useTopicsStore((s) => s.uploadMaterial);
  const deleteMaterial = useTopicsStore((s) => s.deleteMaterial);
  const updateMaterial = useTopicsStore((s) => s.updateMaterial);
  const generateMaterialAction = useTopicsStore((s) => s.generateMaterial);
  const deleteTopic = useTopicsStore((s) => s.deleteTopic);
  const clearCurrentTopic = useTopicsStore((s) => s.clearCurrentTopic);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTrimester, setEditTrimester] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deleteMaterialTarget, setDeleteMaterialTarget] = useState<{ id: string; name: string } | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');

  // Generate modal
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateTargetId, setGenerateTargetId] = useState('');

  // Sub-temas
  const [subTemaName, setSubTemaName] = useState('');
  const [creatingSubTema, setCreatingSubTema] = useState(false);
  const [expandedSubTema, setExpandedSubTema] = useState<string | null>(null);
  const [uploadingSubTemaId, setUploadingSubTemaId] = useState<string | null>(null);

  const [deleteSubTemaTarget, setDeleteSubTemaTarget] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteTopic, setShowDeleteTopic] = useState(false);

  // PDF preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const filteredMaterials = useMemo(() => {
    if (!currentTopic) return [];
    if (!materialSearch) return currentTopic.materials;
    const term = materialSearch.toLowerCase();
    return currentTopic.materials.filter((m) => m.name.toLowerCase().includes(term));
  }, [currentTopic, materialSearch]);

  useEffect(() => {
    fetchTopic(topicId);
    if (classId) fetchClassSubjects(classId);
    return () => { clearCurrentTopic(); };
  }, [topicId, classId, fetchTopic, fetchClassSubjects, clearCurrentTopic]);

  useEffect(() => {
    if (currentTopic) { setEditName(currentTopic.name); setEditDescription(currentTopic.description || ''); setEditTrimester(currentTopic.trimester ? String(currentTopic.trimester) : ''); }
  }, [currentTopic]);

  // Resolve subject color
  const subjectColor = useMemo(() => {
    if (!subjectId || !classId) return undefined;
    const subs = classSubjects[classId];
    if (!subs) return undefined;
    return subs.find(s => s.subjectId === subjectId)?.subjectColor;
  }, [subjectId, classId, classSubjects]);

  const accentColor = subjectColor || '#15665E';

  // ─── Handlers ───

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try { await updateTopic(topicId, { name: editName.trim(), description: editDescription.trim() || undefined, trimester: editTrimester ? parseInt(editTrimester) : 0 }); setIsEditing(false); }
    catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true); setUploadProgress('');
    try { const arr = Array.from(files); for (let i = 0; i < arr.length; i++) { setUploadProgress(`Subiendo ${i + 1}/${arr.length}...`); await uploadMaterial(topicId, arr[i]); } }
    catch (err) { console.error(err); }
    finally { setUploading(false); setUploadProgress(''); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleSubTemaUpload = async (subTemaId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingSubTemaId(subTemaId);
    try { for (const f of Array.from(files)) await uploadMaterial(subTemaId, f); await fetchTopic(topicId); }
    catch (err) { console.error(err); }
    finally { setUploadingSubTemaId(null); if (subTemaFileInputRef.current) subTemaFileInputRef.current.value = ''; }
  };

  const handleToggleInclude = async (materialId: string, ownerTopicId: string, value: boolean) => {
    try { await updateMaterial(ownerTopicId, materialId, { include_in_exercises: value }); if (ownerTopicId !== topicId) await fetchTopic(topicId); } catch {}
  };

  const handleToggleGeneration = async (tId: string, value: boolean) => {
    try { await updateTopic(tId, { include_in_generation: value }); await fetchTopic(topicId); } catch {}
  };

  const handleDownloadMaterial = (url: string, name: string) => {
    const fullUrl = topicsApi.getMaterialDownloadUrl(url);
    const token = localStorage.getItem('access_token');
    fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); })
      .catch(() => {});
  };

  const handlePreviewMaterial = async (url: string) => {
    try {
      const fullUrl = topicsApi.getMaterialDownloadUrl(url);
      const token = localStorage.getItem('access_token');
      const r = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const b = await r.blob();
      setPreviewUrl(window.URL.createObjectURL(b) + '#.pdf');
    } catch {}
  };

  const handleGenerateMaterial = () => {
    if (!generatePrompt.trim()) return;
    const prompt = generatePrompt.trim();
    const targetId = generateTargetId || topicId;
    const topicName = currentTopic?.name || 'Tema';

    setGenerateModalOpen(false); setGeneratePrompt(''); setGenerateTargetId('');

    addBackgroundTask({ type: 'iteration', label: `Material: ${topicName}`, description: 'La IA genera el material y compila el PDF.', initialSteps: ['Planificando...'],
      execute: async (onStep) => {
        onStep('Planificando...'); const t1 = setTimeout(() => onStep('Redactando...'), 5000); const t2 = setTimeout(() => onStep('Compilando PDF...'), 20000);
        try { await generateMaterialAction(targetId, { prompt, include_in_exercises: true }); clearTimeout(t1); clearTimeout(t2); onStep('Listo'); await fetchTopic(topicId); }
        catch (err) { clearTimeout(t1); clearTimeout(t2); throw err; } return '';
      },
    });
  };

  const handleCreateSubTema = async () => {
    if (!subTemaName.trim() || !currentTopic) return;
    setCreatingSubTema(true);
    try { const c = await createTopic(currentTopic.subjectId, { name: subTemaName.trim(), parent_id: topicId }); setSubTemaName(''); setExpandedSubTema(c.id); }
    catch (err) { console.error(err); } finally { setCreatingSubTema(false); }
  };

  const getMaterialIcon = (type?: string) => type === 'image' ? imageOutline : documentOutline;

  // ─── Render material as a card ───
  const renderMaterialCard = (material: any, ownerTopicId: string) => (
    <div className="td-material-card" key={material.id}>
      <IonItemSliding>
        <IonItem button detail={false} onClick={() => material.documentUrl && material.documentType !== 'image' ? handlePreviewMaterial(material.documentUrl) : undefined}>
          <IonIcon icon={getMaterialIcon(material.documentType)} slot="start" color="medium" />
          <IonLabel>
            <h3>{material.name}</h3>
            <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {new Date(material.uploadedAt).toLocaleDateString()}
              {material.isGenerated && <IonBadge color="medium" style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, fontWeight: 500 }}>IA</IonBadge>}
              {!material.includeInExercises && <IonBadge color="medium" style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6 }}>Excluido</IonBadge>}
            </p>
          </IonLabel>
          {material.documentUrl && (
            <IonButton fill="clear" slot="end" size="small" onClick={(e) => { e.stopPropagation(); handleDownloadMaterial(material.documentUrl, material.name); }}>
              <IonIcon icon={downloadOutline} />
            </IonButton>
          )}
        </IonItem>
        <IonItemOptions side="end">
          <IonItemOption color={material.includeInExercises ? 'warning' : 'success'} onClick={() => handleToggleInclude(material.id, ownerTopicId, !material.includeInExercises)}>
            {material.includeInExercises ? 'Excluir' : 'Incluir'}
          </IonItemOption>
          <IonItemOption color="danger" onClick={() => ownerTopicId === topicId
            ? setDeleteMaterialTarget({ id: material.id, name: material.name })
            : (async () => { try { await deleteMaterial(ownerTopicId, material.id); await fetchTopic(topicId); } catch {} })()}>
            <IonIcon icon={trashOutline} slot="icon-only" />
          </IonItemOption>
        </IonItemOptions>
      </IonItemSliding>
    </div>
  );

  // ─── Guards ───
  if (loading && !currentTopic) return <IonPage><IonContent className="ion-padding"><div className="topic-loading"><IonSpinner /></div></IonContent></IonPage>;
  if (!currentTopic) return (
    <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref={`/tabs/classes/${classId}/topics`} text="" /></IonButtons><IonTitle>Tema no encontrado</IonTitle></IonToolbar></IonHeader>
    <IonContent className="ion-padding"><EmptyState icon="📚" title="Tema no encontrado" /></IonContent></IonPage>
  );

  return (
    <IonPage style={subjectThemeStyle(subjectColor)}>
      <IonHeader>
        <IonToolbar style={subjectColor ? { '--background': subjectColor, '--color': 'white' } as React.CSSProperties : undefined}>
          <IonButtons slot="start"><IonBackButton defaultHref={subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}/topics` : `/tabs/classes/${classId}/topics`} text="" color={subjectColor ? 'light' : undefined} /></IonButtons>
          <IonTitle>{currentTopic.name}</IonTitle>
          <IonButtons slot="end">
            {isEditing
              ? <IonButton onClick={handleSaveEdit} disabled={saving} color={subjectColor ? 'light' : undefined}>{saving ? <IonSpinner name="crescent" /> : <IonIcon icon={checkmarkOutline} />}</IonButton>
              : <>
                  <IonButton onClick={() => setShowDeleteTopic(true)} color={subjectColor ? 'light' : undefined}><IonIcon icon={trashOutline} /></IonButton>
                  <IonButton onClick={() => setIsEditing(true)} color={subjectColor ? 'light' : undefined}><IonIcon icon={createOutline} /></IonButton>
                </>}
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" multiple onChange={handleFileUpload} />

        {/* ─── Header ─── */}
        {isEditing ? (
          <div style={{ padding: '12px 16px' }}>
            <IonInput value={editName} onIonInput={(e) => setEditName(e.detail.value ?? '')} placeholder="Nombre" style={{ '--background': 'var(--ion-color-light)', '--border-radius': '8px', '--padding-start': '12px', fontSize: 14, marginBottom: 8 }} />
            <IonTextarea value={editDescription} onIonInput={(e) => setEditDescription(e.detail.value ?? '')} placeholder="Descripción (opcional)" rows={2} style={{ '--background': 'var(--ion-color-light)', '--border-radius': '8px', '--padding-start': '12px', fontSize: 13, marginBottom: 8 }} />
            <IonSelect value={editTrimester} onIonChange={(e) => setEditTrimester(e.detail.value)} interface="popover" placeholder="Trimestre" style={{ fontSize: 13 }}>
              <IonSelectOption value="">Sin asignar</IonSelectOption><IonSelectOption value="1">T1</IonSelectOption><IonSelectOption value="2">T2</IonSelectOption><IonSelectOption value="3">T3</IonSelectOption>
            </IonSelect>
          </div>
        ) : (currentTopic.description || currentTopic.trimester) ? (
          <div className="topic-header">
            {currentTopic.description && <p>{currentTopic.description}</p>}
            {currentTopic.trimester && <IonBadge style={{ marginTop: 4, fontSize: 11, padding: '2px 8px', borderRadius: 999, background: `${accentColor}15`, color: accentColor }}>T{currentTopic.trimester}</IonBadge>}
          </div>
        ) : null}

        {/* ─── Generation config ─── */}
        <div style={{ padding: '4px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <IonToggle
            checked={currentTopic.includeInGeneration}
            onIonChange={(e) => handleToggleGeneration(topicId, e.detail.checked)}
            style={{ '--handle-width': '18px', '--handle-height': '18px', height: 22, width: 38, '--track-background-checked': accentColor }}
          />
          <span style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>Incluir en generación de ejercicios y exámenes</span>
        </div>

        {/* ═══ SUB-TEMAS ═══ */}
        <div className="td-section">
          <div className="td-section-header"><h3>Sub-temas</h3></div>
          <div style={{ display: 'flex', gap: 8, padding: '0 16px', marginBottom: 8 }}>
            <IonInput value={subTemaName} onIonInput={(e) => setSubTemaName(e.detail.value ?? '')} placeholder="Nuevo sub-tema..."
              style={{ '--background': 'var(--ion-color-light)', '--border-radius': '8px', '--padding-start': '12px', fontSize: '13px', flex: 1 }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSubTema(); }} />
            <IonButton size="small" disabled={!subTemaName.trim() || creatingSubTema} onClick={handleCreateSubTema}
              style={{ '--border-radius': '8px', '--background': accentColor }}>
              {creatingSubTema ? <IonSpinner name="crescent" style={{ width: 14, height: 14 }} /> : <IonIcon icon={addOutline} />}
            </IonButton>
          </div>
          {currentTopic.children.length > 0 && (
            <div style={{ padding: '0 16px' }}>
              {currentTopic.children.map(child => {
                const isExp = expandedSubTema === child.id;
                return (
                  <div key={child.id} className="td-subtema">
                    <div className="td-subtema-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer' }} onClick={() => setExpandedSubTema(isExp ? null : child.id)}>
                        <IonIcon icon={isExp ? chevronUpOutline : chevronDownOutline} style={{ fontSize: 13, color: 'var(--ion-color-medium)' }} />
                        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{child.name}</span>
                        {!child.includeInGeneration && <IonBadge color="medium" style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6 }}>Excluido</IonBadge>}
                        <span style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>{child.materials.length}</span>
                      </div>
                      <IonButton fill="clear" size="small" color="medium" onClick={(e) => { e.stopPropagation(); setDeleteSubTemaTarget({ id: child.id, name: child.name }); }}
                        style={{ '--padding-start': '4px', '--padding-end': '4px', height: 28 }}>
                        <IonIcon icon={trashOutline} style={{ fontSize: 15 }} />
                      </IonButton>
                    </div>
                    {isExp && (
                      <div className="td-subtema-body">
                        {/* Sub-topic generation toggle */}
                        <div className="td-gen-toggle">
                          <IonToggle checked={child.includeInGeneration} onIonChange={(e) => handleToggleGeneration(child.id, e.detail.checked)}
                            style={{ '--track-background-checked': accentColor } as React.CSSProperties} />
                          <span>Incluir en ejercicios/exámenes</span>
                        </div>

                        <input type="file" ref={subTemaFileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" multiple onChange={(e) => handleSubTemaUpload(child.id, e)} />
                        <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
                          <IonButton size="small" fill="outline" disabled={uploadingSubTemaId === child.id} onClick={() => subTemaFileInputRef.current?.click()} style={{ '--border-radius': '8px', fontSize: 12 }}>
                            {uploadingSubTemaId === child.id ? <IonSpinner name="crescent" style={{ width: 14, height: 14 }} /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Subir</>}
                          </IonButton>
                        </div>
                        {child.materials.length === 0
                          ? <p style={{ fontSize: 12, color: 'var(--ion-color-medium)', margin: '4px 0 0' }}>Sin materiales</p>
                          : child.materials.map(m => renderMaterialCard(m, child.id))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ MATERIALES ═══ */}
        <div className="td-section">
          <div className="td-section-header">
            <h3>Materiales</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <IonButton size="small" fill="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ '--border-radius': '8px', fontSize: 12 }}>
                {uploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Subir</>}
              </IonButton>
              <IonButton size="small" onClick={() => { setGenerateTargetId(''); setGenerateModalOpen(true); }}
                style={{ '--border-radius': '8px', '--background': accentColor, '--color': 'white', fontSize: 12 }}>
                <IonIcon icon={sparklesOutline} slot="start" /> Generar
              </IonButton>
            </div>
          </div>

          {uploadProgress && <div className="materials-upload-progress"><IonProgressBar type="indeterminate" /><span>{uploadProgress}</span></div>}

          {currentTopic.materials.length === 0
            ? <div style={{ padding: '20px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--ion-color-medium)', margin: 0 }}>Sin materiales</p>
                <p style={{ fontSize: 12, color: 'var(--ion-color-medium)', margin: '4px 0 0' }}>Sube PDFs o genera contenido con IA</p>
              </div>
            : <>
                {currentTopic.materials.length > 3 && <IonSearchbar value={materialSearch} onIonInput={(e) => setMaterialSearch(e.detail.value ?? '')} placeholder="Buscar..." className="materials-search" />}
                {filteredMaterials.length === 0
                  ? <div style={{ padding: '16px', textAlign: 'center' }}><p style={{ fontSize: 13, color: 'var(--ion-color-medium)', margin: 0 }}>Sin resultados</p></div>
                  : filteredMaterials.map(m => renderMaterialCard(m, topicId))}
              </>}
        </div>

        {/* ═══ MODALS ═══ */}

        {/* Generate Material */}
        <IonModal isOpen={generateModalOpen} onDidDismiss={() => setGenerateModalOpen(false)} initialBreakpoint={0.6} breakpoints={[0, 0.6, 0.9]}>
          <IonHeader><IonToolbar style={{ '--background': accentColor, '--color': 'white' } as React.CSSProperties}>
            <IonTitle style={{ fontSize: 16 }}>Generar Material</IonTitle>
            <IonButtons slot="end"><IonButton color="light" onClick={() => setGenerateModalOpen(false)}><IonIcon icon={closeOutline} /></IonButton></IonButtons>
          </IonToolbar></IonHeader>
          <IonContent className="ion-padding">
            <IonTextarea value={generatePrompt} onIonInput={(e) => setGeneratePrompt(e.detail.value ?? '')}
              placeholder="Describe qué material quieres generar..."
              rows={4} style={{ '--background': 'var(--ion-color-light)', '--border-radius': '8px', '--padding-start': '10px', fontSize: '13px', marginBottom: 12 }} />

            {currentTopic.children.length > 0 && (
              <IonItem lines="inset" style={{ '--padding-start': '0', marginBottom: 8 }}>
                <IonLabel style={{ fontSize: 13 }}>Destino</IonLabel>
                <IonSelect value={generateTargetId} onIonChange={(e) => setGenerateTargetId(e.detail.value)} interface="action-sheet" style={{ fontSize: 13 }}>
                  <IonSelectOption value="">{currentTopic.name}</IonSelectOption>
                  {currentTopic.children.map(c => <IonSelectOption key={c.id} value={c.id}>{c.name}</IonSelectOption>)}
                </IonSelect>
              </IonItem>
            )}

            <IonButton expand="block" disabled={!generatePrompt.trim()} onClick={handleGenerateMaterial}
              style={{ '--border-radius': '8px', '--background': accentColor, fontWeight: 600 }}>
              <IonIcon icon={sparklesOutline} slot="start" /> Generar
            </IonButton>
          </IonContent>
        </IonModal>

        {/* PDF Preview */}
        <IonModal isOpen={!!previewUrl} onDidDismiss={() => { if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="paper-preview-modal">
          <IonHeader><IonToolbar><IonTitle style={{ fontSize: 16 }}>Vista previa</IonTitle><IonButtons slot="end"><IonButton onClick={() => setPreviewUrl(null)}><IonIcon icon={closeOutline} /></IonButton></IonButtons></IonToolbar></IonHeader>
          <IonContent className="paper-preview-content">{previewUrl && <div className="paper-preview-container"><iframe src={previewUrl} title="Material" className="paper-preview-pdf" /></div>}</IonContent>
        </IonModal>

        <IonAlert isOpen={!!deleteMaterialTarget} header="Eliminar material" message={`¿Eliminar "${deleteMaterialTarget?.name}"?`}
          buttons={[{ text: 'Cancelar', role: 'cancel', handler: () => setDeleteMaterialTarget(null) }, { text: 'Eliminar', role: 'destructive', handler: async () => { if (deleteMaterialTarget) { try { await deleteMaterial(topicId, deleteMaterialTarget.id); } catch {} setDeleteMaterialTarget(null); } } }]}
          onDidDismiss={() => setDeleteMaterialTarget(null)} />

        <IonAlert isOpen={showDeleteTopic} header="Eliminar tema" message={`¿Eliminar "${currentTopic.name}" y todo su contenido?`}
          buttons={[{ text: 'Cancelar', role: 'cancel', handler: () => setShowDeleteTopic(false) }, { text: 'Eliminar', role: 'destructive', handler: async () => { try { await deleteTopic(topicId); history.goBack(); } catch {} setShowDeleteTopic(false); } }]}
          onDidDismiss={() => setShowDeleteTopic(false)} />

        <IonAlert isOpen={!!deleteSubTemaTarget} header="Eliminar sub-tema" message={`¿Eliminar "${deleteSubTemaTarget?.name}" y todo su contenido?`}
          buttons={[{ text: 'Cancelar', role: 'cancel', handler: () => setDeleteSubTemaTarget(null) }, { text: 'Eliminar', role: 'destructive', handler: async () => { if (deleteSubTemaTarget) { try { await deleteTopic(deleteSubTemaTarget.id); await fetchTopic(topicId); } catch {} setDeleteSubTemaTarget(null); } } }]}
          onDidDismiss={() => setDeleteSubTemaTarget(null)} />
      </IonContent>
    </IonPage>
  );
};

export default TopicDetail;
