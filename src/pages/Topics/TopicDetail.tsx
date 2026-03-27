import { useState, useEffect, useRef, useMemo } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonItem, IonLabel, IonInput, IonTextarea,
  IonSpinner, IonAlert, IonSelect, IonSelectOption, IonBadge,
  IonModal, IonActionSheet, IonProgressBar,
} from '@ionic/react';
import {
  addOutline, documentOutline, imageOutline, trashOutline, createOutline, checkmarkOutline,
  downloadOutline, sparklesOutline, cloudUploadOutline,
  closeOutline, chevronDownOutline, chevronForwardOutline,
  ellipsisHorizontal, folderOpenOutline,
} from 'ionicons/icons';
import { topics as topicsApi } from '../../services/api';

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
  const moveMaterial = useTopicsStore((s) => s.moveMaterial);
  const clearCurrentTopic = useTopicsStore((s) => s.clearCurrentTopic);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTrimester, setEditTrimester] = useState<string>('');
  const [editIncludeInGeneration, setEditIncludeInGeneration] = useState(true);
  const [saving, setSaving] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadTargetId, setUploadTargetId] = useState<string>('');

  // Sub-temas
  const [subTemaName, setSubTemaName] = useState('');
  const [creatingSubTema, setCreatingSubTema] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Context menu (material actions)
  const [activeMaterial, setActiveMaterial] = useState<{ id: string; name: string; ownerTopicId: string; documentUrl?: string; documentType?: string; includeInExercises: boolean } | null>(null);

  // Move target selection
  const [showMoveSheet, setShowMoveSheet] = useState(false);

  // Alerts
  const [deleteSubTemaTarget, setDeleteSubTemaTarget] = useState<{ id: string; name: string } | null>(null);
  const [showDeleteTopic, setShowDeleteTopic] = useState(false);
  const [deleteMaterialConfirm, setDeleteMaterialConfirm] = useState(false);

  // Generate modal
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateTargetId, setGenerateTargetId] = useState('');
  const [generateEnfoque, setGenerateEnfoque] = useState('practico');
  const [generatePages, setGeneratePages] = useState(10);
  const [generateExercises, setGenerateExercises] = useState(5);
  const [generateExamples, setGenerateExamples] = useState(2);

  // PDF preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchTopic(topicId);
    if (classId) fetchClassSubjects(classId);
    return () => { clearCurrentTopic(); };
  }, [topicId, classId, fetchTopic, fetchClassSubjects, clearCurrentTopic]);

  useEffect(() => {
    if (currentTopic) {
      setEditName(currentTopic.name);
      setEditDescription(currentTopic.description || '');
      setEditTrimester(currentTopic.trimester ? String(currentTopic.trimester) : '');
      setEditIncludeInGeneration(currentTopic.includeInGeneration);
    }
  }, [currentTopic]);

  const subjectColor = useMemo(() => {
    if (!subjectId || !classId) return undefined;
    const subs = classSubjects[classId];
    if (!subs) return undefined;
    return subs.find(s => s.subjectId === subjectId)?.subjectColor;
  }, [subjectId, classId, classSubjects]);

  const accentColor = subjectColor || '#15665E';

  // Total material count
  const totalMaterials = useMemo(() => {
    if (!currentTopic) return 0;
    return currentTopic.materials.length + currentTopic.children.reduce((acc, c) => acc + c.materials.length, 0);
  }, [currentTopic]);

  // ─── Section expand/collapse ───
  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ─── Handlers ───

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      await updateTopic(topicId, { name: editName.trim(), description: editDescription.trim() || undefined, trimester: editTrimester ? parseInt(editTrimester) : 0, include_in_generation: editIncludeInGeneration });
      setIsEditing(false);
    } catch (err) { console.error(err); } finally { setSaving(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const targetId = uploadTargetId || topicId;
    setUploading(true); setUploadProgress('');
    try {
      const arr = Array.from(files);
      for (let i = 0; i < arr.length; i++) {
        setUploadProgress(`Subiendo ${i + 1}/${arr.length}...`);
        await uploadMaterial(targetId, arr[i]);
      }
      if (targetId !== topicId) await fetchTopic(topicId);
    } catch (err) { console.error(err); }
    finally { setUploading(false); setUploadProgress(''); setUploadTargetId(''); if (fileInputRef.current) fileInputRef.current.value = ''; if (subTemaFileInputRef.current) subTemaFileInputRef.current.value = ''; }
  };

  const triggerUpload = (targetId: string) => {
    setUploadTargetId(targetId);
    const ref = targetId === topicId ? fileInputRef : subTemaFileInputRef;
    ref.current?.click();
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

  const handleGenerateMaterial = async () => {
    if (!generatePrompt.trim()) return;
    const prompt = generatePrompt.trim();
    const targetId = generateTargetId || topicId;
    const topicName = currentTopic?.name || 'Tema';
    const enfoque = generateEnfoque;
    const pages = generatePages;
    const exercises = generateExercises;
    const examples = generateExamples;

    setGenerateModalOpen(false); setGeneratePrompt(''); setGenerateTargetId('');

    addBackgroundTask({
      type: 'iteration',
      label: `Generar: ${topicName}`,
      description: `La IA genera material (${enfoque}, ~${pages} páginas). Esto puede tardar varios minutos.`,
      initialSteps: ['Iniciando pipeline...'],
      execute: async (onStep) => {
        onStep('Lanzando generación...');
        try {
          const result = await generateMaterialAction(targetId, {
            prompt, enfoque, target_pages: pages,
            exercises_per_chapter: exercises, examples_per_section: examples,
          });
          onStep('Generación en curso (se procesa en segundo plano)');
          // The generation runs as a server-side background task.
          // We return the batch_job_id so user can track it.
          return result.batch_job_id;
        } catch (err) { throw err; }
      },
    });
  };

  const handleCreateSubTema = async () => {
    if (!subTemaName.trim() || !currentTopic) return;
    setCreatingSubTema(true);
    try {
      const c = await createTopic(currentTopic.subjectId, { name: subTemaName.trim(), parent_id: topicId });
      setSubTemaName('');
      setExpandedSections(prev => new Set(prev).add(c.id));
    } catch (err) { console.error(err); } finally { setCreatingSubTema(false); }
  };

  const handleToggleGeneration = async (tId: string, value: boolean) => {
    try { await updateTopic(tId, { include_in_generation: value }); await fetchTopic(topicId); } catch {}
  };

  const getMaterialIcon = (type?: string) => type === 'image' ? imageOutline : documentOutline;

  // Keep a ref to activeMaterial so IonAlert handlers can access it after dismiss
  const activeMaterialRef = useRef(activeMaterial);
  activeMaterialRef.current = activeMaterial;


  // ─── Render a compact material row ───
  const renderMaterial = (material: any, ownerTopicId: string) => (
    <div
      className="td-mat-row"
      key={material.id}
      onClick={() => material.documentUrl && material.documentType !== 'image' ? handlePreviewMaterial(material.documentUrl) : undefined}
    >
      <IonIcon icon={getMaterialIcon(material.documentType)} className="td-mat-icon" />
      <div className="td-mat-info">
        <span className="td-mat-name">{material.name}</span>
        <span className="td-mat-meta">
          {material._pageCount ? `${material._pageCount} páginas` : new Date(material.uploadedAt).toLocaleDateString()}
          {material.isGenerated && <IonBadge color="medium" className="td-mat-badge">IA</IonBadge>}
          {!material.includeInExercises && <IonBadge color="medium" className="td-mat-badge">Excluido</IonBadge>}
        </span>
      </div>
      <button
        className="td-mat-menu-btn"
        onClick={(e) => {
          e.stopPropagation();
          setActiveMaterial({
            id: material.id, name: material.name, ownerTopicId,
            documentUrl: material.documentUrl, documentType: material.documentType,
            includeInExercises: material.includeInExercises,
          });
        }}
      >
        <IonIcon icon={ellipsisHorizontal} />
      </button>
    </div>
  );

  // ─── Render a subtopic section ───
  const renderSubTopic = (child: any, idx: number) => {
    const isExpanded = expandedSections.has(child.id);
    return (
      <div className="td-folder" key={child.id}>
        <div className="td-folder-header" onClick={() => toggleSection(child.id)}>
          <IonIcon icon={isExpanded ? chevronDownOutline : chevronForwardOutline} className="td-folder-chevron" style={{ color: accentColor }} />
          <span className="td-folder-name">{child.name}</span>
          {child.materials.length > 0 && (
            <span className="td-folder-count">{child.materials.length}</span>
          )}
          {!child.includeInGeneration && <IonBadge color="medium" className="td-mat-badge">Excluido</IonBadge>}
          <button className="td-folder-menu" onClick={(e) => {
            e.stopPropagation();
            // Simple: show delete/toggle alert
            setDeleteSubTemaTarget({ id: child.id, name: child.name });
          }}>
            <IonIcon icon={ellipsisHorizontal} />
          </button>
        </div>
        {isExpanded && (
          <div className="td-folder-body">
            {child.materials.map((m: any) => renderMaterial(m, child.id))}
            <div className="td-folder-actions">
              <button className="td-add-btn" onClick={() => triggerUpload(child.id)}>
                <IonIcon icon={cloudUploadOutline} /> Subir
              </button>
              <button className="td-add-btn" onClick={() => { setGenerateTargetId(child.id); setGenerateModalOpen(true); }}>
                <IonIcon icon={sparklesOutline} /> Generar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Guards ───
  if (loading && !currentTopic) return <IonPage><IonContent className="ion-padding"><div className="topic-loading"><IonSpinner /></div></IonContent></IonPage>;
  if (!currentTopic) return (
    <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref={`/tabs/classes/${classId}/topics`} text="" /></IonButtons><IonTitle>Tema no encontrado</IonTitle></IonToolbar></IonHeader>
    <IonContent className="ion-padding"><EmptyState icon="📚" title="Tema no encontrado" /></IonContent></IonPage>
  );

  const hasSubtopics = currentTopic.children.length > 0;

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
        <input type="file" ref={subTemaFileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" multiple onChange={handleFileUpload} />

        {/* ─── Edit mode ─── */}
        {isEditing ? (
          <div className="td-edit-panel">
            <IonInput value={editName} onIonInput={(e) => setEditName(e.detail.value ?? '')} placeholder="Nombre" className="td-edit-input" />
            <IonTextarea value={editDescription} onIonInput={(e) => setEditDescription(e.detail.value ?? '')} placeholder="Descripción (opcional)" rows={2} className="td-edit-input" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <IonSelect value={editTrimester} onIonChange={(e) => setEditTrimester(e.detail.value)} interface="popover" placeholder="Trimestre" style={{ fontSize: 13, flex: 1 }}>
                <IonSelectOption value="">Sin asignar</IonSelectOption>
                <IonSelectOption value="1">T1</IonSelectOption>
                <IonSelectOption value="2">T2</IonSelectOption>
                <IonSelectOption value="3">T3</IonSelectOption>
              </IonSelect>
            </div>
            <div className="td-edit-option" onClick={() => setEditIncludeInGeneration(!editIncludeInGeneration)}>
              <div className={`td-edit-checkbox ${editIncludeInGeneration ? 'td-edit-checkbox--checked' : ''}`} style={editIncludeInGeneration ? { borderColor: accentColor, background: accentColor } : undefined}>
                {editIncludeInGeneration && <IonIcon icon={checkmarkOutline} style={{ fontSize: 12, color: 'white' }} />}
              </div>
              <span>Incluir en generación de ejercicios y exámenes</span>
            </div>
          </div>
        ) : (currentTopic.description || currentTopic.trimester || !currentTopic.includeInGeneration) ? (
          <div className="topic-header">
            {currentTopic.description && <p>{currentTopic.description}</p>}
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {currentTopic.trimester && <IonBadge style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: `${accentColor}15`, color: accentColor }}>T{currentTopic.trimester}</IonBadge>}
              {!currentTopic.includeInGeneration && <IonBadge color="medium" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>Excluido de generación</IonBadge>}
            </div>
          </div>
        ) : null}

        {/* ═══ ACTION BAR ═══ */}
        <div className="td-action-bar">
          <button className="td-action-btn td-action-upload" onClick={() => triggerUpload(topicId)} disabled={uploading}>
            {uploading ? <IonSpinner name="crescent" style={{ width: 16, height: 16 }} /> : <><IonIcon icon={cloudUploadOutline} /> Subir</>}
          </button>
          <button className="td-action-btn td-action-generate" style={{ background: accentColor }} onClick={() => { setGenerateTargetId(''); setGenerateModalOpen(true); }}>
            <IonIcon icon={sparklesOutline} /> Generar
          </button>
        </div>

        {uploadProgress && (
          <div className="materials-upload-progress">
            <IonProgressBar type="indeterminate" />
            <span>{uploadProgress}</span>
          </div>
        )}

        {/* ═══ SUBTEMAS (folders) ═══ */}
        {hasSubtopics && (
          <div className="td-section">
            <div className="td-section-header"><h3>Sub-temas</h3></div>
            {currentTopic.children.map((child, idx) => renderSubTopic(child, idx))}
          </div>
        )}

        {/* ─── Add sub-tema ─── */}
        <div className="td-add-subtema">
          <IonInput
            value={subTemaName}
            onIonInput={(e) => setSubTemaName(e.detail.value ?? '')}
            placeholder="Nombre del sub-tema..."
            className="td-add-subtema-input"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSubTema(); }}
          />
          <IonButton fill="clear" size="small" disabled={!subTemaName.trim() || creatingSubTema} onClick={handleCreateSubTema} style={{ '--color': accentColor }}>
            {creatingSubTema ? <IonSpinner name="crescent" style={{ width: 14, height: 14 }} /> : <IonIcon icon={addOutline} />}
          </IonButton>
        </div>

        {/* ═══ MATERIALES ═══ */}
        {(currentTopic.materials.length > 0 || currentTopic.pdfUrl || !hasSubtopics) && (
          <div className="td-section">
            <div className="td-section-header">
              <h3>Materiales</h3>
              {(currentTopic.materials.length > 0 || currentTopic.pdfUrl) && (
                <span className="td-section-count">{currentTopic.materials.length + (currentTopic.pdfUrl ? 1 : 0)}</span>
              )}
            </div>

            {/* Textbook PDF as a regular material */}
            {currentTopic.pdfUrl && renderMaterial({
              id: `__textbook_${topicId}`,
              name: `${currentTopic.name}.pdf`,
              documentUrl: `/topics/${topicId}/pdf`,
              documentType: 'pdf',
              uploadedAt: currentTopic.createdAt,
              isGenerated: true,
              includeInExercises: true,
              _isTextbookPdf: true,
              _pageCount: currentTopic.pageCount,
            }, topicId)}

            {currentTopic.materials.length === 0 && !currentTopic.pdfUrl ? (
              <div className="td-empty-state">
                <p>Sube PDFs o genera contenido con IA</p>
              </div>
            ) : (
              currentTopic.materials.map(m => renderMaterial(m, topicId))
            )}
          </div>
        )}

        {/* Some bottom padding */}
        <div style={{ height: 40 }} />

        {/* ═══ MODALS & SHEETS ═══ */}

        {/* Material context menu */}
        {/* Material context menu */}
        <IonAlert
          isOpen={!!activeMaterial && !showMoveSheet && !deleteMaterialConfirm}
          header={activeMaterial?.name || ''}
          onDidDismiss={({ detail }) => {
            // Only clear if user cancelled (no action taken that needs activeMaterial)
            if (detail.role === 'cancel' || detail.role === 'backdrop') {
              setActiveMaterial(null);
            }
          }}
          buttons={(() => {
            if (!activeMaterial || !currentTopic) return [{ text: 'Cerrar', role: 'cancel' }];
            const m = activeMaterial;
            const isTextbookPdf = m.id.startsWith('__textbook_');
            const btns: any[] = [];

            if (m.documentUrl) {
              btns.push({
                text: 'Descargar',
                handler: () => {
                  const ref = activeMaterialRef.current;
                  if (ref?.documentUrl) handleDownloadMaterial(ref.documentUrl, ref.name);
                  setActiveMaterial(null);
                },
              });
            }
            if (!isTextbookPdf) {
              if (currentTopic.children.length > 0) {
                btns.push({ text: 'Mover a...', handler: () => setShowMoveSheet(true) });
              }
              btns.push({
                text: m.includeInExercises ? 'Excluir de ejercicios' : 'Incluir en ejercicios',
                handler: async () => {
                  const ref = activeMaterialRef.current;
                  if (!ref) return;
                  try { await updateMaterial(ref.ownerTopicId, ref.id, { include_in_exercises: !ref.includeInExercises }); if (ref.ownerTopicId !== topicId) await fetchTopic(topicId); } catch {}
                  setActiveMaterial(null);
                },
              });
              btns.push({ text: 'Eliminar', role: 'destructive', handler: () => setDeleteMaterialConfirm(true) });
            }
            btns.push({ text: 'Cancelar', role: 'cancel' });
            return btns;
          })()}
        />

        {/* Move destination picker */}
        <IonActionSheet
          isOpen={showMoveSheet}
          header="Mover a..."
          onDidDismiss={() => { setShowMoveSheet(false); setActiveMaterial(null); }}
          buttons={(() => {
            const ref = activeMaterialRef.current;
            if (!ref || !currentTopic) return [{ text: 'Cancelar', role: 'cancel' as const }];
            const from = ref.ownerTopicId;
            const btns: any[] = [];
            if (from !== topicId) {
              btns.push({
                text: `${currentTopic.name} (sin sub-tema)`,
                handler: () => { moveMaterial(from, ref.id, topicId).catch(() => {}); },
              });
            }
            for (const c of currentTopic.children) {
              if (c.id !== from) {
                btns.push({
                  text: c.name,
                  handler: () => { moveMaterial(from, ref.id, c.id).catch(() => {}); },
                });
              }
            }
            btns.push({ text: 'Cancelar', role: 'cancel' });
            return btns;
          })()}
        />

        {/* Delete material confirmation */}
        <IonAlert
          isOpen={deleteMaterialConfirm}
          header="Eliminar material"
          message={`¿Eliminar "${activeMaterial?.name}"?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: async () => {
              const ref = activeMaterialRef.current;
              if (ref) {
                try { await deleteMaterial(ref.ownerTopicId, ref.id); if (ref.ownerTopicId !== topicId) await fetchTopic(topicId); } catch {}
              }
            }},
          ]}
          onDidDismiss={() => { setDeleteMaterialConfirm(false); setActiveMaterial(null); }}
        />

        {/* Generate Material */}
        <IonModal isOpen={generateModalOpen} onDidDismiss={() => setGenerateModalOpen(false)} initialBreakpoint={0.75} breakpoints={[0, 0.75, 0.95]}>
          <IonHeader><IonToolbar style={{ '--background': accentColor, '--color': 'white' } as React.CSSProperties}>
            <IonTitle style={{ fontSize: 16 }}>Generar Material</IonTitle>
            <IonButtons slot="end"><IonButton color="light" onClick={() => setGenerateModalOpen(false)}><IonIcon icon={closeOutline} /></IonButton></IonButtons>
          </IonToolbar></IonHeader>
          <IonContent className="ion-padding" style={subjectThemeStyle(subjectColor)}>
            <p style={{ fontSize: 12, color: 'var(--ion-color-medium)', margin: '0 0 10px' }}>
              La IA analizará los materiales existentes del tema y generará contenido nuevo.
            </p>

            <IonTextarea value={generatePrompt} onIonInput={(e) => setGeneratePrompt(e.detail.value ?? '')}
              placeholder="Describe qué quieres generar... Ej: 'Resumen visual con ejemplos prácticos de ecuaciones de primer grado' o 'Ficha de repaso para el examen'"
              rows={4} style={{ '--background': 'var(--ion-color-light)', '--border-radius': '8px', '--padding-start': '10px', fontSize: '13px', marginBottom: 12 }} />

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div
                onClick={() => setGenerateEnfoque('practico')}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  background: generateEnfoque === 'practico' ? accentColor : 'var(--ion-color-light)',
                  color: generateEnfoque === 'practico' ? 'white' : 'var(--ion-text-color)',
                  border: `1px solid ${generateEnfoque === 'practico' ? accentColor : 'var(--ion-color-light-shade)'}`,
                }}
              >
                Práctico
              </div>
              <div
                onClick={() => setGenerateEnfoque('teorico')}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'center', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                  background: generateEnfoque === 'teorico' ? accentColor : 'var(--ion-color-light)',
                  color: generateEnfoque === 'teorico' ? 'white' : 'var(--ion-text-color)',
                  border: `1px solid ${generateEnfoque === 'teorico' ? accentColor : 'var(--ion-color-light-shade)'}`,
                }}
              >
                Teórico
              </div>
            </div>

            <IonItem lines="none" style={{ '--padding-start': '0', marginBottom: 4 }}>
              <IonLabel style={{ fontSize: 13 }}>Páginas aprox.</IonLabel>
              <IonSelect value={String(generatePages)} onIonChange={(e) => setGeneratePages(parseInt(e.detail.value))} interface="popover" style={{ fontSize: 13 }}>
                <IonSelectOption value="5">5</IonSelectOption>
                <IonSelectOption value="10">10</IonSelectOption>
                <IonSelectOption value="15">15</IonSelectOption>
                <IonSelectOption value="20">20</IonSelectOption>
                <IonSelectOption value="30">30</IonSelectOption>
              </IonSelect>
            </IonItem>

            <IonItem lines="none" style={{ '--padding-start': '0', marginBottom: 4 }}>
              <IonLabel style={{ fontSize: 13 }}>Ejercicios por sección</IonLabel>
              <IonSelect value={String(generateExercises)} onIonChange={(e) => setGenerateExercises(parseInt(e.detail.value))} interface="popover" style={{ fontSize: 13 }}>
                <IonSelectOption value="0">Sin ejercicios</IonSelectOption>
                <IonSelectOption value="3">3</IonSelectOption>
                <IonSelectOption value="5">5</IonSelectOption>
                <IonSelectOption value="10">10</IonSelectOption>
                <IonSelectOption value="15">15</IonSelectOption>
              </IonSelect>
            </IonItem>

            <IonItem lines="none" style={{ '--padding-start': '0', marginBottom: 12 }}>
              <IonLabel style={{ fontSize: 13 }}>Ejemplos por sección</IonLabel>
              <IonSelect value={String(generateExamples)} onIonChange={(e) => setGenerateExamples(parseInt(e.detail.value))} interface="popover" style={{ fontSize: 13 }}>
                <IonSelectOption value="0">Sin ejemplos</IonSelectOption>
                <IonSelectOption value="1">1</IonSelectOption>
                <IonSelectOption value="2">2</IonSelectOption>
                <IonSelectOption value="3">3</IonSelectOption>
              </IonSelect>
            </IonItem>

            <IonButton expand="block" disabled={!generatePrompt.trim()} onClick={handleGenerateMaterial}
              style={{ '--border-radius': '8px', '--background': accentColor, fontWeight: 600 }}>
              <IonIcon icon={sparklesOutline} slot="start" /> Generar Material
            </IonButton>
          </IonContent>
        </IonModal>

        {/* PDF Preview */}
        <IonModal isOpen={!!previewUrl} onDidDismiss={() => { if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="paper-preview-modal">
          <IonHeader><IonToolbar><IonTitle style={{ fontSize: 16 }}>Vista previa</IonTitle><IonButtons slot="end"><IonButton onClick={() => setPreviewUrl(null)}><IonIcon icon={closeOutline} /></IonButton></IonButtons></IonToolbar></IonHeader>
          <IonContent className="paper-preview-content" scrollY={false}>{previewUrl && <div className="paper-preview-container"><iframe src={previewUrl} title="Material" className="paper-preview-pdf" /></div>}</IonContent>
        </IonModal>

        {/* Delete topic */}
        <IonAlert isOpen={showDeleteTopic} header="Eliminar tema" message={`¿Eliminar "${currentTopic.name}" y todo su contenido?`}
          buttons={[{ text: 'Cancelar', role: 'cancel', handler: () => setShowDeleteTopic(false) }, { text: 'Eliminar', role: 'destructive', handler: async () => { try { await deleteTopic(topicId); history.goBack(); } catch {} setShowDeleteTopic(false); } }]}
          onDidDismiss={() => setShowDeleteTopic(false)} />

        {/* Delete sub-tema */}
        <IonAlert isOpen={!!deleteSubTemaTarget} header={deleteSubTemaTarget?.name || ''}
          message="¿Qué quieres hacer con este sub-tema?"
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteSubTemaTarget(null) },
            ...(deleteSubTemaTarget ? [{
              text: currentTopic.children.find(c => c.id === deleteSubTemaTarget.id)?.includeInGeneration ? 'Excluir de generación' : 'Incluir en generación',
              handler: () => {
                const child = currentTopic.children.find(c => c.id === deleteSubTemaTarget!.id);
                if (child) handleToggleGeneration(child.id, !child.includeInGeneration);
                setDeleteSubTemaTarget(null);
              },
            }] : []),
            { text: 'Eliminar', role: 'destructive', handler: async () => {
              if (deleteSubTemaTarget) { try { await deleteTopic(deleteSubTemaTarget.id); await fetchTopic(topicId); } catch {} }
              setDeleteSubTemaTarget(null);
            }},
          ]}
          onDidDismiss={() => setDeleteSubTemaTarget(null)} />
      </IonContent>
    </IonPage>
  );
};

export default TopicDetail;
