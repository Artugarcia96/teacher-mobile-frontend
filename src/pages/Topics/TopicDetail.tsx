import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, FileText, Image, Trash2, Pencil, Check,
  Download, Sparkles, CloudUpload, X, ChevronDown,
  ChevronRight, MoreHorizontal, FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { topics as topicsApi, authenticatedFetch } from '../../services/api';

import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import { useParams, useNavigate } from 'react-router-dom';
import { useTopicsStore } from '../../store/topicsStore';
import { useClassesStore } from '../../store/classesStore';
import EmptyState from '../../components/EmptyState';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import { useAcademicConfigStore } from '../../store/academicConfigStore';
import { getPeriodNumbers, getPeriodLabel } from '../../utils/periodConfig';

import PageShell from '@/components/shared/PageShell';
import Modal from '@/components/shared/Modal';
import AlertConfirm from '@/components/shared/AlertConfirm';
import Spinner from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

import './TopicDetail.css';

const TopicDetail: React.FC = () => {
  const { classId, topicId, subjectId } = useParams() as { classId: string; topicId: string; subjectId?: string };
  const navigate = useNavigate();
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
  const periodMode = useAcademicConfigStore((s) => s.configs[classId])?.periodMode;
  const fetchAcademicConfig = useAcademicConfigStore((s) => s.fetchConfig);

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
    if (classId) { fetchClassSubjects(classId); fetchAcademicConfig(classId); }
    return () => { clearCurrentTopic(); };
  }, [topicId, classId, fetchTopic, fetchClassSubjects, fetchAcademicConfig, clearCurrentTopic]);

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
      toast.success('Tema actualizado');
    } catch (err) { console.error(err); toast.error('Error al guardar el tema'); } finally { setSaving(false); }
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
      toast.success(`${arr.length} archivo${arr.length > 1 ? 's subidos' : ' subido'}`);
    } catch (err) { console.error(err); toast.error('Error al subir material'); }
    finally { setUploading(false); setUploadProgress(''); setUploadTargetId(''); if (fileInputRef.current) fileInputRef.current.value = ''; if (subTemaFileInputRef.current) subTemaFileInputRef.current.value = ''; }
  };

  const triggerUpload = (targetId: string) => {
    setUploadTargetId(targetId);
    const ref = targetId === topicId ? fileInputRef : subTemaFileInputRef;
    ref.current?.click();
  };

  const handleDownloadMaterial = (url: string, name: string) => {
    const fullUrl = topicsApi.getMaterialDownloadUrl(url);
    authenticatedFetch(fullUrl)
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); })
      .catch(() => { toast.error('Error al descargar'); });
  };

  const handlePreviewMaterial = async (url: string) => {
    try {
      const fullUrl = topicsApi.getMaterialDownloadUrl(url);
      const r = await authenticatedFetch(fullUrl);
      if (!r.ok) throw new Error();
      const b = await r.blob();
      setPreviewUrl(window.URL.createObjectURL(b) + '#.pdf');
    } catch { toast.error('Error al cargar vista previa'); }
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
    toast.success('Generación iniciada. Puedes seguir trabajando mientras se procesa.');

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
    try { await updateTopic(tId, { include_in_generation: value }); await fetchTopic(topicId); } catch { toast.error('Error al actualizar'); }
  };

  const getMaterialIcon = (type?: string) => type === 'image' ? Image : FileText;

  // Keep a ref to activeMaterial so handlers can access it after dismiss
  const activeMaterialRef = useRef(activeMaterial);
  activeMaterialRef.current = activeMaterial;


  // ─── Render a compact material row ───
  const renderMaterial = (material: any, ownerTopicId: string) => {
    const IconComp = getMaterialIcon(material.documentType);
    return (
      <div
        className="td-mat-row"
        key={material.id}
        onClick={() => material.documentUrl && material.documentType !== 'image' ? handlePreviewMaterial(material.documentUrl) : undefined}
      >
        <IconComp size={22} className="td-mat-icon" />
        <div className="td-mat-info">
          <span className="td-mat-name">{material.name}</span>
          <span className="td-mat-meta">
            {material._pageCount ? `${material._pageCount} páginas` : new Date(material.uploadedAt).toLocaleDateString()}
            {material.isGenerated && <Badge variant="secondary" className="td-mat-badge">IA</Badge>}
            {!material.includeInExercises && <Badge variant="secondary" className="td-mat-badge">Excluido</Badge>}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="td-mat-menu-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={20} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {material.documentUrl && (
              <DropdownMenuItem onClick={() => handleDownloadMaterial(material.documentUrl, material.name)}>
                <Download size={14} className="mr-2" /> Descargar
              </DropdownMenuItem>
            )}
            {!material.id.startsWith('__textbook_') && currentTopic && currentTopic.children.length > 0 && (
              <DropdownMenuItem onClick={() => {
                setActiveMaterial({
                  id: material.id, name: material.name, ownerTopicId,
                  documentUrl: material.documentUrl, documentType: material.documentType,
                  includeInExercises: material.includeInExercises,
                });
                setShowMoveSheet(true);
              }}>
                <FolderOpen size={14} className="mr-2" /> Mover a...
              </DropdownMenuItem>
            )}
            {!material.id.startsWith('__textbook_') && (
              <DropdownMenuItem onClick={async () => {
                try { await updateMaterial(ownerTopicId, material.id, { include_in_exercises: !material.includeInExercises }); if (ownerTopicId !== topicId) await fetchTopic(topicId); } catch {}
              }}>
                {material.includeInExercises ? 'Excluir de ejercicios' : 'Incluir en ejercicios'}
              </DropdownMenuItem>
            )}
            {!material.id.startsWith('__textbook_') && (
              <DropdownMenuItem className="text-destructive" onClick={() => {
                setActiveMaterial({
                  id: material.id, name: material.name, ownerTopicId,
                  documentUrl: material.documentUrl, documentType: material.documentType,
                  includeInExercises: material.includeInExercises,
                });
                setDeleteMaterialConfirm(true);
              }}>
                <Trash2 size={14} className="mr-2" /> Eliminar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  // ─── Render a subtopic section ───
  const renderSubTopic = (child: any, idx: number) => {
    const isExpanded = expandedSections.has(child.id);
    return (
      <div className="td-folder" key={child.id}>
        <div className="td-folder-header" onClick={() => toggleSection(child.id)}>
          {isExpanded
            ? <ChevronDown size={14} className="td-folder-chevron" style={{ color: accentColor }} />
            : <ChevronRight size={14} className="td-folder-chevron" style={{ color: accentColor }} />
          }
          <span className="td-folder-name">{child.name}</span>
          {child.materials.length > 0 && (
            <span className="td-folder-count">{child.materials.length}</span>
          )}
          {!child.includeInGeneration && <Badge variant="secondary" className="td-mat-badge">Excluido</Badge>}
          <button className="td-folder-menu" onClick={(e) => {
            e.stopPropagation();
            setDeleteSubTemaTarget({ id: child.id, name: child.name });
          }}>
            <MoreHorizontal size={18} />
          </button>
        </div>
        {isExpanded && (
          <div className="td-folder-body">
            {child.materials.map((m: any) => renderMaterial(m, child.id))}
            <div className="td-folder-actions">
              <button className="td-add-btn" onClick={() => triggerUpload(child.id)}>
                <CloudUpload size={14} /> Subir
              </button>
              <button className="td-add-btn" onClick={() => { setGenerateTargetId(child.id); setGenerateModalOpen(true); }}>
                <Sparkles size={14} /> Generar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Guards ───
  if (loading && !currentTopic) return (
    <PageShell title="">
      <div className="topic-loading"><Spinner /></div>
    </PageShell>
  );
  if (!currentTopic) return (
    <PageShell title="Tema no encontrado" backHref={`/tabs/classes/${classId}/topics`}>
      <EmptyState icon="📚" title="Tema no encontrado" />
    </PageShell>
  );

  const hasSubtopics = currentTopic.children.length > 0;

  return (
    <PageShell
      title={currentTopic.name}
      backHref={subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}/topics` : `/tabs/classes/${classId}/topics`}
      noPadding
      headerActions={
        isEditing
          ? <Button variant="ghost" size="icon" onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Spinner size={18} /> : <Check size={18} />}
            </Button>
          : <>
              <Button variant="ghost" size="icon" onClick={() => setShowDeleteTopic(true)}><Trash2 size={18} /></Button>
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}><Pencil size={18} /></Button>
            </>
      }
    >
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" multiple onChange={handleFileUpload} />
      <input type="file" ref={subTemaFileInputRef} style={{ display: 'none' }} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png" multiple onChange={handleFileUpload} />

      {/* ─── Edit mode ─── */}
      {isEditing ? (
        <div className="td-edit-panel">
          <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" className="mb-2 text-sm" />
          <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descripción (opcional)" rows={2} className="mb-2 text-sm" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Select value={editTrimester} onValueChange={(v) => setEditTrimester(v)}>
              <SelectTrigger className="flex-1 text-sm">
                <SelectValue placeholder="Trimestre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin asignar</SelectItem>
                {getPeriodNumbers(periodMode).map((t) => (
                  <SelectItem key={t} value={String(t)}>{getPeriodLabel(periodMode, t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="td-edit-option" onClick={() => setEditIncludeInGeneration(!editIncludeInGeneration)}>
            <Checkbox
              checked={editIncludeInGeneration}
              onCheckedChange={(v) => setEditIncludeInGeneration(!!v)}
              style={editIncludeInGeneration ? { borderColor: accentColor, backgroundColor: accentColor } : undefined}
            />
            <span>Incluir en generación de ejercicios y exámenes</span>
          </div>
        </div>
      ) : (
        <div className="topic-header">
          {currentTopic.description && <p>{currentTopic.description}</p>}
          <div className="td-info-strip">
            {/* Status pills */}
            <button
              className={`td-status-pill td-status-pill--${currentTopic.status}`}
              onClick={async () => {
                const next = currentTopic.status === 'draft' ? 'ready' : currentTopic.status === 'ready' ? 'taught' : 'draft';
                try { await updateTopic(topicId, {}); await topicsApi.updateStatus(topicId, next); await fetchTopic(topicId); } catch { toast.error('Error al cambiar estado'); }
              }}
            >
              {currentTopic.status === 'taught' ? '✓ Impartido' : currentTopic.status === 'ready' ? '● Listo' : '○ Borrador'}
            </button>
            {currentTopic.trimester && (
              <span className="td-info-badge" style={{ background: `${accentColor}12`, color: accentColor }}>
                {getPeriodLabel(periodMode, currentTopic.trimester)}
              </span>
            )}
            {!currentTopic.includeInGeneration && (
              <span className="td-info-badge td-info-badge--muted">Excluido</span>
            )}
          </div>
          {/* Scheduled dates from plan */}
          {currentTopic.scheduledDates && currentTopic.scheduledDates.length > 0 && (
            <div className="td-schedule">
              <span className="td-schedule-label">Sesiones programadas</span>
              <div className="td-schedule-dates">
                {currentTopic.scheduledDates.map((d, i) => {
                  const [,m,day] = d.split('-');
                  const MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
                  return <span key={i} className="td-schedule-chip">{parseInt(day)} {MONTHS[parseInt(m)-1]}</span>;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── MATERIALES DE REFERENCIA (inputs for generation) ─── */}
      <div className="td-section">
        <div className="td-section-header">
          <h3>Materiales de referencia</h3>
          {currentTopic.materials.length > 0 && (
            <span className="td-section-count">{currentTopic.materials.length}</span>
          )}
        </div>
        {currentTopic.materials.length > 0 ? (
          currentTopic.materials.map(m => renderMaterial(m, topicId))
        ) : (
          <p className="td-empty-hint">Sube PDFs, documentos o imágenes que la IA usará como referencia para generar contenido.</p>
        )}
        <button className="td-action-btn td-action-upload" onClick={() => triggerUpload(topicId)} disabled={uploading}>
          {uploading ? <Spinner size={16} /> : <><CloudUpload size={16} /> Subir material</>}
        </button>
        {uploadProgress && (
          <div className="materials-upload-progress">
            <Progress className="w-full h-[3px]" />
            <span>{uploadProgress}</span>
          </div>
        )}
      </div>

      {/* ─── GENERATED CONTENT (hero card or CTA) ─── */}
      <div className="td-section">
        <div className="td-section-header">
          <h3>Contenido generado</h3>
        </div>
        {currentTopic.pdfUrl ? (
          <>
            <div className="td-content-card">
              <div className="td-content-card-body" onClick={() => handlePreviewMaterial(`/topics/${topicId}/pdf`)}>
                <div className="td-content-icon" style={{ background: accentColor }}>
                  <FileText size={24} />
                </div>
                <div className="td-content-info">
                  <p className="td-content-title">{currentTopic.name}</p>
                  <div className="td-content-meta">
                    <span>{currentTopic.pageCount ? `${currentTopic.pageCount} páginas` : 'PDF generado'}</span>
                    <Badge variant="secondary" className="td-mat-badge">IA</Badge>
                  </div>
                </div>
                <div className="td-content-actions">
                  <button className="td-content-action-btn" onClick={(e) => { e.stopPropagation(); handleDownloadMaterial(`/topics/${topicId}/pdf`, `${currentTopic.name}.pdf`); }}>
                    <Download size={18} />
                  </button>
                </div>
              </div>
            </div>
            <button
              className="td-action-btn td-action-generate"
              style={{ background: accentColor }}
              onClick={() => { setGenerateTargetId(''); setGenerateModalOpen(true); }}
            >
              <Sparkles size={16} /> Generar nuevo contenido
            </button>
            <p className="td-regen-hint">Se usará el contenido actual como referencia para la nueva generación</p>
          </>
        ) : (
          <div className="td-generate-cta" onClick={() => { setGenerateTargetId(''); setGenerateModalOpen(true); }}>
            <div className="td-generate-cta-icon" style={{ background: accentColor }}>
              <Sparkles size={26} />
            </div>
            <h4>Generar material con IA</h4>
            <p>Crea contenido pedagógico personalizado: teoría, ejemplos resueltos y ejercicios</p>
          </div>
        )}
      </div>

      {/* SUBTEMAS (folders) */}
      {hasSubtopics && (
        <div className="td-section">
          <div className="td-section-header"><h3>Sub-temas</h3></div>
          {currentTopic.children.map((child, idx) => renderSubTopic(child, idx))}
        </div>
      )}

      {/* Add sub-tema */}
      <div className="td-add-subtema">
        <Input
          value={subTemaName}
          onChange={(e) => setSubTemaName(e.target.value)}
          placeholder="Nombre del sub-tema..."
          className="flex-1 text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSubTema(); }}
        />
        <Button variant="ghost" size="sm" disabled={!subTemaName.trim() || creatingSubTema} onClick={handleCreateSubTema} style={{ color: accentColor }}>
          {creatingSubTema ? <Spinner size={14} /> : <Plus size={18} />}
        </Button>
      </div>

      {/* Some bottom padding */}
      <div style={{ height: 40 }} />

      {/* MODALS & SHEETS */}

      {/* Move destination picker */}
      <Modal open={showMoveSheet} onClose={() => { setShowMoveSheet(false); setActiveMaterial(null); }} title="Mover a...">
        <div className="flex flex-col gap-1 py-2">
          {activeMaterial && currentTopic && activeMaterial.ownerTopicId !== topicId && (
            <Button variant="ghost" className="justify-start" onClick={() => {
              moveMaterial(activeMaterial.ownerTopicId, activeMaterial.id, topicId).catch(() => {});
              setShowMoveSheet(false); setActiveMaterial(null);
            }}>
              {currentTopic.name} (sin sub-tema)
            </Button>
          )}
          {activeMaterial && currentTopic && currentTopic.children.filter(c => c.id !== activeMaterial.ownerTopicId).map(c => (
            <Button key={c.id} variant="ghost" className="justify-start" onClick={() => {
              moveMaterial(activeMaterial.ownerTopicId, activeMaterial.id, c.id).catch(() => {});
              setShowMoveSheet(false); setActiveMaterial(null);
            }}>
              {c.name}
            </Button>
          ))}
        </div>
      </Modal>

      {/* Delete material confirmation */}
      <AlertConfirm
        open={deleteMaterialConfirm}
        onClose={() => { setDeleteMaterialConfirm(false); setActiveMaterial(null); }}
        header="Eliminar material"
        message={`¿Eliminar "${activeMaterial?.name}"?`}
        confirmText="Eliminar"
        variant="destructive"
        onConfirm={async () => {
          const ref = activeMaterialRef.current;
          if (ref) {
            try { await deleteMaterial(ref.ownerTopicId, ref.id); if (ref.ownerTopicId !== topicId) await fetchTopic(topicId); } catch {}
          }
          setDeleteMaterialConfirm(false); setActiveMaterial(null);
        }}
      />

      {/* Generate Material */}
      <Modal open={generateModalOpen} onClose={() => setGenerateModalOpen(false)} title="Generar Material" sheetHeight="lg">
        <div className="space-y-4">
          {/* Material context */}
          <div className="space-y-2">
            {currentTopic?.pdfUrl && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 text-sm">
                <Sparkles size={16} className="shrink-0 text-primary" />
                <span>Se usará el <strong>contenido actual ({currentTopic.pageCount || ''}p)</strong> como base para la nueva generación</span>
              </div>
            )}
            {totalMaterials > 0 ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted text-sm">
                <FileText size={16} className="shrink-0 text-primary" />
                <span>+ <strong>{totalMaterials} material{totalMaterials !== 1 ? 'es' : ''}</strong> subidos como referencia</span>
              </div>
            ) : !currentTopic?.pdfUrl ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/10 text-sm text-warning">
                <FileText size={16} className="shrink-0" />
                <span>Sin materiales de referencia. La IA generará contenido basándose solo en tu descripción.</span>
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Descripción del contenido</label>
            <Textarea value={generatePrompt} onChange={(e) => setGeneratePrompt(e.target.value)}
              placeholder="Ej: 'Explicaciones claras con ejemplos sobre ecuaciones de primer grado' o 'Ficha de repaso con ejercicios resueltos'"
              rows={3} className="text-sm" autoFocus />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Enfoque</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGenerateEnfoque('practico')}
                className="flex-1 p-2.5 rounded-lg text-center cursor-pointer border transition-colors"
                style={{
                  background: generateEnfoque === 'practico' ? accentColor : 'var(--color-muted)',
                  color: generateEnfoque === 'practico' ? 'white' : 'var(--color-foreground)',
                  borderColor: generateEnfoque === 'practico' ? accentColor : 'var(--color-border)',
                }}
                aria-pressed={generateEnfoque === 'practico'}
              >
                <span className="text-sm font-medium block">Práctico</span>
                <span className="text-[11px] opacity-80 block mt-0.5">Más ejercicios y ejemplos</span>
              </button>
              <button
                type="button"
                onClick={() => setGenerateEnfoque('teorico')}
                className="flex-1 p-2.5 rounded-lg text-center cursor-pointer border transition-colors"
                style={{
                  background: generateEnfoque === 'teorico' ? accentColor : 'var(--color-muted)',
                  color: generateEnfoque === 'teorico' ? 'white' : 'var(--color-foreground)',
                  borderColor: generateEnfoque === 'teorico' ? accentColor : 'var(--color-border)',
                }}
                aria-pressed={generateEnfoque === 'teorico'}
              >
                <span className="text-sm font-medium block">Teórico</span>
                <span className="text-[11px] opacity-80 block mt-0.5">Más explicaciones y conceptos</span>
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">Configuración</label>
            <div className="flex items-center justify-between">
              <span className="text-sm">Páginas</span>
              <Select value={String(generatePages)} onValueChange={(v) => setGeneratePages(parseInt(v))}>
                <SelectTrigger className="w-20 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Ejercicios / sección</span>
              <Select value={String(generateExercises)} onValueChange={(v) => setGenerateExercises(parseInt(v))}>
                <SelectTrigger className="w-20 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Ejemplos / sección</span>
              <Select value={String(generateExamples)} onValueChange={(v) => setGenerateExamples(parseInt(v))}>
                <SelectTrigger className="w-20 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pre-generation summary */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-sm">Resumen</p>
            <p>PDF de ~{generatePages} páginas, enfoque {generateEnfoque === 'practico' ? 'práctico' : 'teórico'}, {generateExercises} ejercicios y {generateExamples} ejemplos por sección.</p>
            <p>Tiempo estimado: 2-5 minutos. Se procesa en segundo plano.</p>
          </div>

          <Button className="w-full font-semibold h-11" disabled={!generatePrompt.trim()} onClick={handleGenerateMaterial}
            style={{ background: accentColor }}>
            <Sparkles size={16} className="mr-2" /> Generar Material
          </Button>
        </div>
      </Modal>

      {/* PDF Preview */}
      <Modal open={!!previewUrl} onClose={() => { if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} title="Vista previa" sheetHeight="full">
        {previewUrl && <div className="w-full h-full"><iframe src={previewUrl} title="Material" className="w-full h-full border-none bg-white" style={{ minHeight: '70vh' }} /></div>}
      </Modal>

      {/* Delete topic */}
      <AlertConfirm
        open={showDeleteTopic}
        onClose={() => setShowDeleteTopic(false)}
        header="Eliminar tema"
        message={`¿Eliminar "${currentTopic.name}" y todo su contenido?`}
        confirmText="Eliminar"
        variant="destructive"
        onConfirm={async () => { try { await deleteTopic(topicId); navigate(-1); } catch {} setShowDeleteTopic(false); }}
      />

      {/* Delete sub-tema */}
      {deleteSubTemaTarget && (
        <Modal open={!!deleteSubTemaTarget} onClose={() => setDeleteSubTemaTarget(null)} title={deleteSubTemaTarget.name} sheetHeight="sm">
          <div className="flex flex-col gap-2 py-2">
            <Button variant="ghost" className="justify-start" onClick={() => {
              const child = currentTopic.children.find(c => c.id === deleteSubTemaTarget.id);
              if (child) handleToggleGeneration(child.id, !child.includeInGeneration);
              setDeleteSubTemaTarget(null);
            }}>
              {currentTopic.children.find(c => c.id === deleteSubTemaTarget.id)?.includeInGeneration ? 'Excluir de generación' : 'Incluir en generación'}
            </Button>
            <Button variant="destructive" className="justify-start" onClick={async () => {
              if (deleteSubTemaTarget) { try { await deleteTopic(deleteSubTemaTarget.id); await fetchTopic(topicId); } catch {} }
              setDeleteSubTemaTarget(null);
            }}>
              Eliminar
            </Button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
};

export default TopicDetail;
