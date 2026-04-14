import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Download, Eye, Sparkles, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import AlertConfirm from '@/components/shared/AlertConfirm';
import { Textbook } from '../types';
import { useTextbooksStore } from '../store/textbooksStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { textbooks as textbooksApi, authenticatedFetch } from '../services/api';

interface TextbookDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  textbook: Textbook | null;
}

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
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState<string | null>(null);

  // Reset state when textbook changes or modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setExpandedChapter(null);
      setIterationInstruction('');
      setIterationError('');
      setAssigning(false);
      setAssignResult(null);
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


  const handleAssignToPlanTopics = async () => {
    setAssigning(true);
    setAssignResult(null);
    try {
      const res = await textbooksApi.assignToPlanTopics(textbook.id);
      setAssignResult(`Contenido asignado a ${res.data.assigned} de ${res.data.total_topics} temas`);
    } catch (err: any) {
      setAssignResult(err.response?.data?.detail || 'Error al asignar contenido');
    } finally {
      setAssigning(false);
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

  return (
    <>
      <Modal open={isOpen} onClose={onClose} sheetHeight="lg">
        <div className="flex items-center justify-between p-4 border-b">
          
            <h2 className="text-base font-semibold">{title}</h2>
            <div className="flex items-center gap-1">
              <Button onClick={onClose}>
                <X size={18} />
              </Button>
            </div>
          
        </div>

        <div>

          {/* ─── SECTION 1: Summary ─── */}
          {textbook.pdfUrl && textbook.status === 'completed' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <Button className="w-full" onClick={handlePreview}>
                <Eye size={18} />
                Ver PDF
              </Button>
              <Button variant="outline" className="w-full" onClick={handleDownload}>
                <Download size={18} />
                Descargar
              </Button>
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

          {/* ═══ Chapters — Edit content ═══ */}
          {chapters.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: 'var(--ion-text-color)' }}>
                Contenido ({chapters.length} capitulos)
              </h3>

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
                      {/* icon: isExpanded ? chevronUpOutline : chevronDownOutline */}
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
                              <Sparkles size={13} />
                              Editar con IA
                            </div>
                            <Textarea value={iterationInstruction} onChange={(e) => setIterationInstruction(e.target.value)} placeholder="Ej: Simplifica las explicaciones, añade ejemplos practicos..." rows={2} />

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

                            <Button size="sm" className="w-full" onClick={() => handleIterate(chapter.number)}
                              disabled={iterating || !iterationInstruction.trim()}
                              style={{ borderRadius: '8px', background: 'var(--ion-color-primary, #15665E)', fontWeight: 600, fontSize: 13 }}
                            >
                              {iterating
                                ? <><Spinner size={14} className="mr-1.5" /> Editando...</>
                                : <><Sparkles size={18} /> Aplicar cambios</>
                              }
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}


          {/* Assign content to plan topics — only for standalone textbooks */}
          {isCompleted && !textbook.coursePlanId && (
            <div style={{ marginBottom: 16 }}>
              {assignResult && (
                <div style={{
                  padding: '10px 14px', marginBottom: 10, borderRadius: 8, fontSize: 13,
                  background: assignResult.startsWith('Error') ? 'var(--ion-color-danger-tint)' : 'rgba(5, 150, 105, 0.08)',
                  color: assignResult.startsWith('Error') ? 'var(--ion-color-danger-shade)' : '#059669',
                }}>
                  {assignResult}
                </div>
              )}
              <Button className="w-full" onClick={handleAssignToPlanTopics} disabled={assigning || !!assignResult?.startsWith('Contenido')}>
                {assigning ? (
                  <><Spinner size={18} className="mr-2" /> Asignando...</>
                ) : (
                  'Asignar contenido a temas del plan'
                )}
              </Button>
            </div>
          )}

          <Button variant="destructive" className="w-full" onClick={() => setShowDeleteAlert(true)} disabled={deleting} style={{ marginTop: 8, borderRadius: '10px' }}>
            {deleting ? (<><Spinner size={16} className="mr-1.5" /> Eliminando...</>) : (<><Trash2 size={18} /> Eliminar contenido</>)}
          </Button>
        </div>
      </Modal>

      <AlertConfirm open={showDeleteAlert}
        onClose={() => setShowDeleteAlert(false)}
        header="Eliminar contenido"
        message="Se eliminará este contenido y su PDF asociado. Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        confirmText="Eliminar"
        variant="destructive"
      />

      {/* PDF Preview Modal */}
      <Modal open={!!previewUrl} onClose={() => { if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} sheetHeight="lg">
        <div className="flex items-center justify-between p-4 border-b">
          
            <h2 className="text-base font-semibold">Vista previa</h2>
            <div className="flex items-center gap-1">
              <Button onClick={() => setPreviewUrl(null)}>
                <X size={18} />
              </Button>
            </div>
          
        </div>
        <div>
          {previewUrl && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: 8 }}>
              <iframe
                src={previewUrl}
                title="Vista previa"
                style={{ width: '100%', height: 'calc(100vh - 80px)', border: 'none', borderRadius: 4, background: 'white' }}
              />
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default TextbookDetailModal;
