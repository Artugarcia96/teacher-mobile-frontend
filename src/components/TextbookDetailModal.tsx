import { useState, useMemo, useEffect } from 'react';
import {
  IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonButtons, IonIcon, IonSpinner, IonTextarea, IonItem, IonAlert,
  IonBadge, IonInput, IonSegment, IonSegmentButton, IonLabel,
} from '@ionic/react';
import {
  closeOutline, downloadOutline, trashOutline,
  chevronDownOutline, chevronUpOutline, refreshOutline, sparkles,
  checkmarkCircleOutline, addOutline, closeCircleOutline,
  bookOutline, layersOutline, eyeOutline,
} from 'ionicons/icons';
import { Textbook, SuggestedTema } from '../types';
import { useTextbooksStore } from '../store/textbooksStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { textbooks as textbooksApi, authenticatedFetch } from '../services/api';

interface TextbookDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  textbook: Textbook | null;
}

interface FlatSection {
  globalNum: number;
  title: string;
  chapterNumber: number;
  chapterTitle: string;
}

interface EditableTema {
  name: string;
  sections: FlatSection[];
  trimester: number;
  description?: string;
}

type TemaPhase = 'idle' | 'loading' | 'editing' | 'confirming' | 'done';

const LOADING_STEPS = [
  'Leyendo estructura del libro...',
  'Agrupando por coherencia temática...',
  'Asignando trimestres...',
];

const TextbookDetailModal: React.FC<TextbookDetailModalProps> = ({
  isOpen, onClose, textbook,
}) => {
  const iterateChapter = useTextbooksStore((s) => s.iterateChapter);
  const deleteTextbook = useTextbooksStore((s) => s.deleteTextbook);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [iterationInstruction, setIterationInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [iterationError, setIterationError] = useState('');
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Tema flow state
  const [temaPhase, setTemaPhase] = useState<TemaPhase>('idle');
  const [editableTemas, setEditableTemas] = useState<EditableTema[]>([]);
  const [unassigned, setUnassigned] = useState<FlatSection[]>([]);
  const [temaError, setTemaError] = useState('');
  const [loadingStep, setLoadingStep] = useState(0);

  // Flatten all sections
  const allSections = useMemo<FlatSection[]>(() => {
    if (!textbook?.bookPlan?.chapters) return [];
    const sections: FlatSection[] = [];
    let globalNum = 1;
    for (const ch of textbook.bookPlan.chapters) {
      for (const sec of (ch.sections || [])) {
        sections.push({
          globalNum: globalNum++,
          title: sec.title,
          chapterNumber: ch.number,
          chapterTitle: ch.title,
        });
      }
    }
    return sections;
  }, [textbook?.bookPlan]);

  // Reset state when textbook changes or modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setExpandedChapter(null);
      setIterationInstruction('');
      setIterationError('');
      setTemaPhase('idle');
      setEditableTemas([]);
      setUnassigned([]);
      setTemaError('');
      setLoadingStep(0);
      if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [isOpen, textbook?.id]);

  if (!textbook) return null;

  const title = textbook.title || textbook.bookPlan?.title || 'Contenido sin título';
  const chapters = textbook.bookPlan?.chapters || [];
  const stats = textbook.stats;
  const isCompleted = textbook.status === 'completed' || textbook.status === 'completed_no_pdf';

  // ── Handlers ──

  const handleDownload = () => {
    const url = textbooksApi.getPdfUrl(textbook.id);
    authenticatedFetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${title.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const handlePreview = async () => {
    const url = textbooksApi.getPdfUrl(textbook.id);
    try {
      const res = await authenticatedFetch(url);
      if (!res.ok) throw new Error('Preview failed');
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(blobUrl + '#.pdf');
    } catch (err) {
      console.error('Preview error:', err);
    }
  };

  const handleIterate = async (chapterNumber: number) => {
    if (!iterationInstruction.trim()) return;
    const instruction = iterationInstruction.trim();
    const chTitle = chapters.find(c => c.number === chapterNumber)?.title || `Cap. ${chapterNumber}`;

    addBackgroundTask({
      type: 'iteration',
      label: `${chTitle}`,
      description: 'La IA analiza las secciones afectadas, reescribe el contenido según tus indicaciones y regenera el PDF.',
      initialSteps: ['Analizando secciones...'],
      execute: async (onStep) => {
        onStep('Analizando secciones...');
        const stepTimer1 = setTimeout(() => onStep('Editando secciones en paralelo...'), 3000);
        const stepTimer2 = setTimeout(() => onStep('Generando diagramas...'), 12000);
        const stepTimer3 = setTimeout(() => onStep('Compilando PDF...'), 25000);

        await iterateChapter(textbook.id, chapterNumber, instruction);

        clearTimeout(stepTimer1);
        clearTimeout(stepTimer2);
        clearTimeout(stepTimer3);
        return '';
      },
    });

    setIterationInstruction('');
    setExpandedChapter(null);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteTextbook(textbook.id);
      onClose();
    } catch (err: any) {
      console.error('Delete error:', err);
    } finally {
      setDeleting(false);
    }
  };

  // ── Tema Flow Handlers ──

  const handleDividirEnTemas = () => {
    // Group sections by chapter — no AI needed
    const chapterMap = new Map<number, FlatSection[]>();
    for (const sec of allSections) {
      const existing = chapterMap.get(sec.chapterNumber) || [];
      existing.push(sec);
      chapterMap.set(sec.chapterNumber, existing);
    }

    const totalChapters = chapterMap.size;
    const temas: EditableTema[] = [];
    let idx = 0;
    for (const [chNum, secs] of chapterMap) {
      const chTitle = secs[0]?.chapterTitle || `Tema ${chNum}`;
      // Auto-distribute trimesters
      const trimester = Math.min(3, Math.floor(idx * 3 / totalChapters) + 1);
      temas.push({
        name: chTitle,
        sections: secs,
        trimester,
      });
      idx++;
    }

    setEditableTemas(temas);
    setUnassigned([]);
    setTemaPhase('editing');
  };

  const handleRenameTema = (idx: number, name: string) => {
    setEditableTemas(prev => prev.map((t, i) => i === idx ? { ...t, name } : t));
  };

  const handleChangeTrimester = (idx: number, trimester: number) => {
    setEditableTemas(prev => prev.map((t, i) => i === idx ? { ...t, trimester } : t));
  };

  const handleRemoveSection = (temaIdx: number, globalNum: number) => {
    const section = editableTemas[temaIdx].sections.find(s => s.globalNum === globalNum);
    if (!section) return;

    setEditableTemas(prev => prev.map((t, i) =>
      i === temaIdx ? { ...t, sections: t.sections.filter(s => s.globalNum !== globalNum) } : t
    ));
    setUnassigned(prev => [...prev, section].sort((a, b) => a.globalNum - b.globalNum));
  };

  const handleAssignSection = (globalNum: number, temaIdx: number) => {
    const section = unassigned.find(s => s.globalNum === globalNum);
    if (!section) return;

    setUnassigned(prev => prev.filter(s => s.globalNum !== globalNum));
    setEditableTemas(prev => prev.map((t, i) =>
      i === temaIdx ? { ...t, sections: [...t.sections, section].sort((a, b) => a.globalNum - b.globalNum) } : t
    ));
  };

  const handleAddTema = () => {
    const lastTrimester = editableTemas.length > 0 ? editableTemas[editableTemas.length - 1].trimester : 1;
    setEditableTemas(prev => [...prev, {
      name: `Tema ${prev.length + 1}`,
      sections: [],
      trimester: lastTrimester,
    }]);
  };

  const handleDeleteTema = (idx: number) => {
    const tema = editableTemas[idx];
    setUnassigned(prev => [...prev, ...tema.sections].sort((a, b) => a.globalNum - b.globalNum));
    setEditableTemas(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmTemas = async () => {
    const validTemas = editableTemas.filter(t => t.sections.length > 0);
    if (validTemas.length === 0) return;

    setTemaPhase('confirming');
    try {
      await textbooksApi.createTemas(textbook.id, {
        temas: validTemas.map(t => ({
          name: t.name,
          sections: t.sections.map(s => s.globalNum),
          trimester: t.trimester,
        })),
      });
      setTemaPhase('done');
    } catch (err: any) {
      setTemaError(err.response?.data?.detail || 'Error al crear los temas');
      setTemaPhase('editing');
    }
  };

  // ── Helpers ──

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)} seg`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins} min ${secs} seg` : `${mins} min`;
  };

  const formatWords = (words: number): string => {
    if (words >= 1000) return `${(words / 1000).toFixed(1)}k`;
    return String(words);
  };

  const validTemaCount = editableTemas.filter(t => t.sections.length > 0).length;

  return (
    <>
      <IonModal isOpen={isOpen} onDidDismiss={onClose}>
        <IonHeader>
          <IonToolbar>
            <IonTitle style={{ fontSize: 16 }}>{title}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={onClose}>
                <IonIcon icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>

        <IonContent className="ion-padding">

          {/* ─── SECTION 1: Summary ─── */}
          {textbook.pdfUrl && textbook.status === 'completed' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <IonButton
                expand="block"
                onClick={handlePreview}
                style={{ flex: 1, '--border-radius': '10px', fontWeight: 600, '--background': 'var(--ion-color-primary, #15665E)' }}
              >
                <IonIcon icon={eyeOutline} slot="start" />
                Ver PDF
              </IonButton>
              <IonButton
                expand="block"
                color="medium"
                fill="outline"
                onClick={handleDownload}
                style={{ flex: 1, '--border-radius': '10px', fontWeight: 600 }}
              >
                <IonIcon icon={downloadOutline} slot="start" />
                Descargar
              </IonButton>
            </div>
          )}

          {stats && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10,
              marginBottom: 20,
              padding: 14,
              borderRadius: 12,
              background: 'var(--ion-color-light)',
            }}>
              {stats.estimated_pages != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ion-color-primary, #15665E)' }}>{stats.estimated_pages}</div>
                  <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>Páginas</div>
                </div>
              )}
              {stats.total_words != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ion-color-primary, #15665E)' }}>{formatWords(stats.total_words)}</div>
                  <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>Palabras</div>
                </div>
              )}
              {stats.generation_time_seconds != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#E87A1C' }}>{formatTime(stats.generation_time_seconds)}</div>
                  <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>Tiempo</div>
                </div>
              )}
            </div>
          )}

          {/* Error states */}
          {textbook.status === 'failed' && textbook.errorMessage && (
            <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: 'var(--ion-color-danger-tint)', color: 'var(--ion-color-danger-shade)', fontSize: 14 }}>
              {textbook.errorMessage}
            </div>
          )}
          {textbook.status === 'completed_no_pdf' && (
            <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#FFF3E0', color: '#E65100', fontSize: 14 }}>
              {textbook.errorMessage || 'El contenido se generó pero la compilación del PDF falló. Puedes intentar regenerar un capítulo para corregir el error.'}
            </div>
          )}

          {/* ═══ STEP 1: Chapters — Edit content ═══ */}
          {chapters.length > 0 && temaPhase !== 'editing' && temaPhase !== 'confirming' && temaPhase !== 'done' && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {isCompleted && allSections.length > 0 && (
                  <span style={{
                    background: 'var(--ion-color-primary, #15665E)', color: '#fff', borderRadius: 6,
                    padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                  }}>1</span>
                )}
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--ion-text-color)' }}>
                  Contenido ({chapters.length} capitulos)
                </h3>
              </div>
              {isCompleted && (
                <p style={{ fontSize: 12, color: 'var(--ion-color-medium)', margin: '0 0 12px', lineHeight: 1.4 }}>
                  Revisa y edita cada capitulo antes de dividir en temas.
                </p>
              )}

              {chapters.map((chapter) => {
                const isExpanded = expandedChapter === chapter.number;
                const sectionCount = chapter.sections?.length || 0;

                return (
                  <div key={chapter.number} style={{
                    marginBottom: 8, borderRadius: 10,
                    border: isExpanded ? '1.5px solid rgba(21, 102, 94, 0.3)' : '1px solid var(--ion-color-light-shade)',
                    overflow: 'hidden', transition: 'border-color 0.15s',
                  }}>
                    {/* Chapter row */}
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', cursor: 'pointer',
                        background: isExpanded ? 'rgba(21, 102, 94, 0.04)' : 'transparent',
                      }}
                      onClick={() => {
                        setExpandedChapter(isExpanded ? null : chapter.number);
                        setIterationInstruction('');
                        setIterationError('');
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: 8,
                        background: 'var(--ion-color-primary, #15665E)', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>{chapter.number}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{chapter.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--ion-color-medium)' }}>
                          {sectionCount} {sectionCount === 1 ? 'seccion' : 'secciones'}
                        </div>
                      </div>
                      <IonIcon icon={isExpanded ? chevronUpOutline : chevronDownOutline} style={{ fontSize: 18, color: 'var(--ion-color-medium)', flexShrink: 0 }} />
                    </div>

                    {/* Expanded: sections + editor */}
                    {isExpanded && (
                      <div style={{ padding: '0 12px 12px' }}>
                        {/* Section list */}
                        {chapter.sections && chapter.sections.length > 0 && (
                          <div style={{
                            marginBottom: 12, padding: '8px 10px',
                            borderRadius: 8, background: 'var(--ion-color-light)',
                          }}>
                            {chapter.sections.map((section) => (
                              <div key={section.number} style={{
                                padding: '4px 0', fontSize: 13,
                                color: 'var(--ion-color-medium-shade)',
                                display: 'flex', gap: 8,
                              }}>
                                <span style={{ color: 'var(--ion-color-medium)', fontWeight: 600, minWidth: 24 }}>
                                  {chapter.number}.{section.number}
                                </span>
                                <span>{section.title}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* AI editor */}
                        {isCompleted && (
                          <div style={{
                            borderRadius: 10, border: '1px solid rgba(21, 102, 94, 0.15)',
                            padding: 10, background: 'rgba(21, 102, 94, 0.02)',
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ion-color-primary, #15665E)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <IonIcon icon={sparkles} style={{ fontSize: 13 }} />
                              Editar con IA
                            </div>
                            <IonTextarea
                              value={iterationInstruction}
                              onIonInput={(e) => setIterationInstruction(e.detail.value ?? '')}
                              placeholder="Ej: Simplifica las explicaciones, añade ejemplos practicos..."
                              rows={2}
                              style={{
                                '--background': '#fff', '--border-radius': '8px',
                                '--padding-start': '10px', fontSize: '13px', marginBottom: 6,
                                border: '1px solid var(--ion-color-light-shade)', borderRadius: 8,
                              }}
                            />

                            {/* Preset chips */}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                              {[
                                { label: 'Simplificar', val: 'Simplifica las explicaciones, usa vocabulario mas sencillo' },
                                { label: '+Ejemplos', val: 'Añade mas ejemplos resueltos practicos' },
                                { label: '+Diagramas', val: 'Añade diagramas TikZ ilustrativos' },
                                { label: 'Profundizar', val: 'Amplía y profundiza las explicaciones teoricas' },
                              ].map(p => (
                                <button key={p.label}
                                  onClick={() => { setIterationInstruction(p.val); }}
                                  style={{
                                    border: '1px solid var(--ion-color-light-shade)', borderRadius: 14,
                                    padding: '3px 10px', fontSize: 11, fontWeight: 500,
                                    background: '#fff', color: 'var(--ion-color-medium-shade)', cursor: 'pointer',
                                  }}>
                                  {p.label}
                                </button>
                              ))}
                            </div>

                            {iterationError && (
                              <div style={{ padding: '6px 10px', marginBottom: 6, borderRadius: 6, background: 'var(--ion-color-danger-tint)', color: 'var(--ion-color-danger-shade)', fontSize: 12 }}>
                                {iterationError}
                              </div>
                            )}

                            <IonButton
                              expand="block" size="small"
                              onClick={() => handleIterate(chapter.number)}
                              disabled={iterating || !iterationInstruction.trim()}
                              style={{ '--border-radius': '8px', '--background': 'var(--ion-color-primary, #15665E)', fontWeight: 600, fontSize: 13 }}
                            >
                              {iterating
                                ? <><IonSpinner name="crescent" style={{ width: 14, height: 14, marginRight: 6 }} /> Editando...</>
                                : <><IonIcon icon={sparkles} slot="start" /> Aplicar cambios</>
                              }
                            </IonButton>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ═══ STEP 2: Organize into temas ═══ */}
          {isCompleted && allSections.length > 0 && (
            <div style={{ marginBottom: 24 }}>

              {/* Phase: idle — Show CTA */}
              {temaPhase === 'idle' && (
                <div style={{
                  borderRadius: 14,
                  border: '2px dashed var(--ion-color-primary, #15665E)',
                  padding: 20,
                  background: 'rgba(21, 102, 94, 0.03)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      background: 'var(--ion-color-primary, #15665E)', color: '#fff', borderRadius: 6,
                      padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0,
                    }}>2</span>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--ion-text-color)' }}>
                      Dividir en temas
                    </h3>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--ion-color-medium)', margin: '0 0 14px', lineHeight: 1.4 }}>
                    Organiza las secciones en temas para tu planificacion. Cada tema tendra su propio contenido y PDF.
                  </p>
                  {temaError && (
                    <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'var(--ion-color-danger-tint)', color: 'var(--ion-color-danger-shade)', fontSize: 13 }}>
                      {temaError}
                    </div>
                  )}
                  <IonButton
                    expand="block"
                    style={{ '--border-radius': '10px', '--background': 'var(--ion-color-primary, #15665E)', fontWeight: 600 }}
                    onClick={handleDividirEnTemas}
                  >
                    <IonIcon icon={layersOutline} slot="start" />
                    Dividir en temas
                  </IonButton>
                </div>
              )}

              {/* Phase: editing — Tema organizer */}
              {temaPhase === 'editing' && (
                <div>
                  {temaError && (
                    <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'var(--ion-color-danger-tint)', color: 'var(--ion-color-danger-shade)', fontSize: 13 }}>
                      {temaError}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {editableTemas.map((tema, temaIdx) => (
                      <div key={temaIdx}>
                        {/* ── Tema card ── */}
                        <div style={{
                          borderRadius: 12,
                          overflow: 'hidden',
                          border: '1.5px solid var(--ion-border-color, rgba(21, 102, 94, 0.25))',
                          background: 'var(--ion-card-background, var(--ion-background-color))',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        }}>
                          {/* Tema header */}
                          <div style={{
                            padding: '10px 12px',
                            background: 'var(--ion-color-primary, #15665E)',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                            <span style={{
                              background: 'rgba(255,255,255,0.2)',
                              color: '#fff', borderRadius: 6, padding: '2px 8px',
                              fontSize: 12, fontWeight: 700, flexShrink: 0,
                            }}>
                              {temaIdx + 1}
                            </span>
                            <input
                              value={tema.name}
                              onChange={(e) => handleRenameTema(temaIdx, e.target.value)}
                              placeholder="Nombre del tema..."
                              style={{
                                flex: 1, border: 'none', background: 'rgba(255,255,255,0.15)',
                                borderRadius: 6, padding: '4px 8px',
                                fontSize: 13, fontWeight: 600, outline: 'none', minWidth: 0,
                                color: '#fff',
                              }}
                            />
                            {/* Trimester pills */}
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              {[1, 2, 3].map(t => (
                                <button key={t} onClick={() => handleChangeTrimester(temaIdx, t)}
                                  style={{
                                    width: 28, height: 24, border: 'none', borderRadius: 5, cursor: 'pointer',
                                    fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                                    background: tema.trimester === t ? '#E87A1C' : 'rgba(255,255,255,0.15)',
                                    color: tema.trimester === t ? '#fff' : 'rgba(255,255,255,0.5)',
                                  }}>
                                  T{t}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Sections */}
                          <div style={{ padding: '4px 0' }}>
                            {tema.sections.map((sec, secIdx) => (
                              <div key={sec.globalNum}>
                                <div style={{
                                  padding: '9px 12px 9px 14px',
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  fontSize: 13,
                                }}>
                                  <span style={{
                                    color: 'var(--ion-color-medium)', fontSize: 12, fontWeight: 600,
                                    minWidth: 22, flexShrink: 0,
                                  }}>
                                    {sec.chapterNumber}.{secIdx + 1}
                                  </span>
                                  <span style={{ flex: 1, color: 'var(--ion-text-color)', lineHeight: 1.3 }}>
                                    {sec.title}
                                  </span>
                                </div>

                                {/* Split handle — between sections within same tema */}
                                {secIdx < tema.sections.length - 1 && (
                                  <div
                                    onClick={() => {
                                      const before = tema.sections.slice(0, secIdx + 1);
                                      const after = tema.sections.slice(secIdx + 1);
                                      const newTemas = [...editableTemas];
                                      newTemas[temaIdx] = { ...tema, sections: before };
                                      newTemas.splice(temaIdx + 1, 0, {
                                        name: after[0]?.chapterTitle || `Tema ${editableTemas.length + 1}`,
                                        sections: after,
                                        trimester: tema.trimester,
                                      });
                                      setEditableTemas(newTemas);
                                    }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 6,
                                      padding: '0 16px', cursor: 'pointer',
                                      height: 20, opacity: 0.35, transition: 'opacity 0.15s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.35')}
                                  >
                                    <div style={{ flex: 1, height: 1, borderTop: '1px dashed var(--ion-color-step-300, #CBD5E1)' }} />
                                    <span style={{
                                      fontSize: 10, color: 'var(--ion-color-step-450, #94A3B8)', padding: '0 4px',
                                      userSelect: 'none', whiteSpace: 'nowrap',
                                    }}>
                                      cortar aqui
                                    </span>
                                    <div style={{ flex: 1, height: 1, borderTop: '1px dashed var(--ion-color-step-300, #CBD5E1)' }} />
                                  </div>
                                )}
                              </div>
                            ))}
                            {tema.sections.length === 0 && (
                              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--ion-color-medium)', fontStyle: 'italic' }}>
                                Sin secciones
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Merge zone between tema cards ── */}
                        {temaIdx < editableTemas.length - 1 && (
                          <div
                            onClick={() => {
                              const newTemas = [...editableTemas];
                              newTemas[temaIdx] = {
                                ...tema,
                                sections: [...tema.sections, ...editableTemas[temaIdx + 1].sections],
                              };
                              newTemas.splice(temaIdx + 1, 1);
                              setEditableTemas(newTemas);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              gap: 6, padding: '6px 0', cursor: 'pointer',
                              opacity: 0.45, transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.45')}
                          >
                            <div style={{ width: 28, height: 1, background: 'var(--ion-color-step-300, #CBD5E1)' }} />
                            <span style={{
                              fontSize: 11, color: 'var(--ion-color-primary, #15665E)', fontWeight: 600,
                              userSelect: 'none', display: 'flex', alignItems: 'center', gap: 3,
                            }}>
                              <span style={{ fontSize: 15, lineHeight: 1 }}>&#8597;</span> unir
                            </span>
                            <div style={{ width: 28, height: 1, background: 'var(--ion-color-step-300, #CBD5E1)' }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Bottom actions */}
                  <div style={{ marginTop: 16 }}>
                    <IonButton
                      expand="block"
                      onClick={handleConfirmTemas}
                      disabled={validTemaCount === 0}
                      style={{ '--border-radius': '10px', '--background': 'var(--ion-color-primary, #15665E)', fontWeight: 600, marginBottom: 8 }}
                    >
                      <IonIcon icon={checkmarkCircleOutline} slot="start" />
                      Crear {validTemaCount} {validTemaCount === 1 ? 'tema' : 'temas'}
                    </IonButton>
                    <IonButton fill="clear" expand="block" size="small" color="medium" onClick={handleDividirEnTemas}>
                      <IonIcon icon={refreshOutline} slot="start" />
                      Reiniciar agrupacion
                    </IonButton>
                  </div>
                </div>
              )}

              {/* Phase: confirming */}
              {temaPhase === 'confirming' && (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <IonSpinner name="crescent" style={{ color: 'var(--ion-color-primary, #15665E)', width: 32, height: 32 }} />
                  <div style={{ fontSize: 14, color: 'var(--ion-color-medium)', marginTop: 8 }}>Creando temas...</div>
                </div>
              )}

              {/* Phase: done */}
              {temaPhase === 'done' && (
                <div style={{
                  padding: '16px', borderRadius: 12,
                  background: 'rgba(5, 150, 105, 0.08)',
                  border: '1px solid rgba(5, 150, 105, 0.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <IonIcon icon={checkmarkCircleOutline} style={{ color: '#059669', fontSize: 22, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: '#059669', fontWeight: 600 }}>
                      {validTemaCount} {validTemaCount === 1 ? 'tema creado' : 'temas creados'} con contenido
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--ion-color-medium)', margin: '0 0 12px', lineHeight: 1.4 }}>
                    Cada tema tiene su propio contenido y PDF. Los PDFs se estan compilando en segundo plano.
                    Puedes editar cada tema con IA desde la vista de detalle.
                  </p>
                  <IonButton
                    expand="block" size="small"
                    style={{ '--border-radius': '8px', '--background': '#059669', fontWeight: 600 }}
                    onClick={onClose}
                  >
                    Volver al temario
                  </IonButton>
                </div>
              )}
            </div>
          )}

          <IonButton expand="block" fill="outline" color="danger" onClick={() => setShowDeleteAlert(true)} disabled={deleting} style={{ marginTop: 8, '--border-radius': '10px' }}>
            {deleting ? (<><IonSpinner name="crescent" style={{ marginRight: 6 }} /> Eliminando...</>) : (<><IonIcon icon={trashOutline} slot="start" /> Eliminar contenido</>)}
          </IonButton>
        </IonContent>
      </IonModal>

      <IonAlert
        isOpen={showDeleteAlert}
        onDidDismiss={() => setShowDeleteAlert(false)}
        header="Eliminar contenido"
        message="Se eliminará este contenido y su PDF asociado. Esta acción no se puede deshacer."
        buttons={[
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Eliminar', role: 'destructive', handler: handleDelete },
        ]}
      />

      {/* PDF Preview Modal */}
      <IonModal
        isOpen={!!previewUrl}
        onDidDismiss={() => { if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
      >
        <IonHeader>
          <IonToolbar>
            <IonTitle style={{ fontSize: 16 }}>Vista previa</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setPreviewUrl(null)}>
                <IonIcon icon={closeOutline} />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent style={{ '--background': '#000' }}>
          {previewUrl && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: 8 }}>
              <iframe
                src={previewUrl}
                title="Vista previa"
                style={{ width: '100%', height: 'calc(100vh - 80px)', border: 'none', borderRadius: 4, background: 'white' }}
              />
            </div>
          )}
        </IonContent>
      </IonModal>
    </>
  );
};

export default TextbookDetailModal;
