/**
 * TopicRow — fila/card de un tema dentro del Temario.
 *
 * Vista compacta por defecto (nombre + meta + chip de estado + contador de
 * materiales). Al expandir muestra los materiales del tema (PDFs, generados)
 * con acciones para añadir o subir.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, ChevronRight, FileText, Loader2, Plus, Presentation as PresentationIcon,
  Sparkles, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTopicsStore } from '../../store/topicsStore';
import { useTallerStore } from '../../store/tallerStore';
import type { TopicListItem } from '../../types';

interface Props {
  topic: TopicListItem;
  classId: string;
  subjectId: string;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Borrador', className: 'tr-chip tr-chip--draft' },
  ready: { label: 'Listo', className: 'tr-chip tr-chip--ready' },
  taught: { label: 'Impartido', className: 'tr-chip tr-chip--taught' },
};

const TopicRow: React.FC<Props> = ({ topic, classId, subjectId }) => {
  const navigate = useNavigate();
  const openTaller = useTallerStore((s) => s.openTaller);
  const fetchTopic = useTopicsStore((s) => s.fetchTopic);
  const currentTopic = useTopicsStore((s) => s.currentTopic);
  const uploadMaterial = useTopicsStore((s) => s.uploadMaterial);
  const deleteMaterial = useTopicsStore((s) => s.deleteMaterial);
  const deleteTopic = useTopicsStore((s) => s.deleteTopic);

  const [expanded, setExpanded] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch de detalles cuando se expande por primera vez (evita payload grande
  // cuando el profe solo quiere ver la lista).
  useEffect(() => {
    if (!expanded) return;
    if (currentTopic?.id === topic.id) return;
    setLoadingDetail(true);
    fetchTopic(topic.id).finally(() => setLoadingDetail(false));
  }, [expanded, topic.id, currentTopic?.id, fetchTopic]);

  const detailed = currentTopic?.id === topic.id ? currentTopic : null;
  const materials = detailed?.materials || [];
  const status = STATUS_META[topic.status] || STATUS_META.draft;

  const handleUpload = async (file: File) => {
    try {
      await uploadMaterial(topic.id, file);
      toast.success('Material añadido');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo subir');
    }
  };

  const handleDeleteMaterial = async (materialId: string) => {
    if (!confirm('¿Eliminar este material?')) return;
    try {
      await deleteMaterial(topic.id, materialId);
      toast.success('Material eliminado');
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const handleDeleteTopic = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar el tema "${topic.name}"? Se borrarán también sus materiales.`)) return;
    try {
      await deleteTopic(topic.id);
      toast.success('Tema eliminado');
    } catch {
      toast.error('No se pudo eliminar el tema');
    }
  };

  const handleGenerate = (kind: 'presentation' | 'textbook') => {
    const labels: Record<'presentation' | 'textbook', string> = {
      presentation: 'Presentación',
      textbook: 'Apuntes',
    };
    openTaller({
      limitTo: 'content',
      defaultType: kind,
      classId,
      subjectId,
      topicId: topic.id,
      topicName: topic.name,
      promptHint: `${labels[kind]} sobre ${topic.name}`,
    });
  };

  return (
    <li className={`tr ${expanded ? 'tr--expanded' : ''}`}>
      <button
        type="button"
        className="tr-head"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="tr-order" aria-hidden>{topic.order || '·'}</span>
        <div className="tr-main">
          <div className="tr-title-row">
            <h3 className="tr-title">{topic.name}</h3>
            <span className={status.className}>{status.label}</span>
          </div>
          {topic.description && (
            <p className="tr-desc">{topic.description}</p>
          )}
          <div className="tr-meta">
            {topic.materialCount > 0 ? (
              <span className="tr-meta-item">
                <FileText size={11} />
                {topic.materialCount} {topic.materialCount === 1 ? 'material' : 'materiales'}
              </span>
            ) : (
              <span className="tr-meta-item tr-meta-item--muted">Sin materiales</span>
            )}
            {topic.hasContent && topic.pageCount ? (
              <span className="tr-meta-item">
                <PresentationIcon size={11} />
                {topic.pageCount} {topic.pageCount === 1 ? 'página' : 'páginas'}
              </span>
            ) : null}
          </div>

          {/* Preview compacto de material generado: muestra los primeros 2-3
              títulos para que el profesor vea de un vistazo qué hay sin
              tener que expandir el tema. */}
          {(((topic.presentations?.length ?? 0) + (topic.textbooks?.length ?? 0)) > 0) && (
            <ul className="tr-preview">
              {(topic.presentations || []).slice(0, 3).map((p) => (
                <li key={`pp-${p.id}`} className="tr-preview-item">
                  <PresentationIcon size={10} />
                  <span className="tr-preview-name">{p.title}</span>
                  {(p.status === 'generating' || p.status === 'pending') && (
                    <span className="tr-preview-status">Generando…</span>
                  )}
                </li>
              ))}
              {(topic.textbooks || []).slice(0, 3 - Math.min(3, topic.presentations?.length ?? 0)).map((tb) => (
                <li key={`tt-${tb.id}`} className="tr-preview-item">
                  <BookOpen size={10} />
                  <span className="tr-preview-name">{tb.title}</span>
                  {(tb.status === 'pending' || tb.status === 'generating') && (
                    <span className="tr-preview-status">Generando…</span>
                  )}
                </li>
              ))}
              {(((topic.presentations?.length ?? 0) + (topic.textbooks?.length ?? 0)) > 3) && (
                <li className="tr-preview-item tr-preview-item--more">
                  +{(topic.presentations?.length ?? 0) + (topic.textbooks?.length ?? 0) - 3} más
                </li>
              )}
            </ul>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`tr-chevron ${expanded ? 'tr-chevron--open' : ''}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="tr-drawer">
          {loadingDetail ? (
            <div className="tr-drawer-loading">
              <Loader2 size={16} className="animate-spin" />
              Cargando materiales…
            </div>
          ) : (
            <>
              {(materials.length > 0 || (topic.presentations && topic.presentations.length > 0) || (topic.textbooks && topic.textbooks.length > 0)) ? (
                <ul className="tr-materials">
                  {/* Presentaciones generadas (vinculadas al tema vía topic_id) */}
                  {(topic.presentations || []).map((p) => (
                    <li key={`pres-${p.id}`} className="tr-material">
                      <PresentationIcon size={13} className="tr-material-icon" />
                      <button
                        type="button"
                        className="tr-material-name tr-material-link"
                        title={p.title}
                        onClick={() => navigate(`/tabs/presentations/${p.id}`)}
                      >
                        {p.title}
                      </button>
                      <span className="tr-material-tag">IA</span>
                    </li>
                  ))}
                  {/* Libros/apuntes generados */}
                  {(topic.textbooks || []).map((tb) => (
                    <li key={`tb-${tb.id}`} className="tr-material">
                      <BookOpen size={13} className="tr-material-icon" />
                      {tb.pdf_url ? (
                        <a
                          href={tb.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tr-material-name tr-material-link"
                          title={tb.title}
                        >
                          {tb.title}
                        </a>
                      ) : (
                        <span className="tr-material-name" title={tb.title}>
                          {tb.title}
                        </span>
                      )}
                      <span className="tr-material-tag">
                        {tb.status === 'pending' || tb.status === 'generating' ? 'Generando…' : 'IA'}
                      </span>
                    </li>
                  ))}
                  {/* Materiales subidos (PDFs, imágenes) */}
                  {materials.map((m) => (
                    <li key={m.id} className="tr-material">
                      <FileText size={13} className="tr-material-icon" />
                      <span className="tr-material-name" title={m.name}>{m.name}</span>
                      {m.isGenerated && (
                        <span className="tr-material-tag">IA</span>
                      )}
                      <button
                        type="button"
                        className="tr-material-del"
                        onClick={(e) => { e.stopPropagation(); handleDeleteMaterial(m.id); }}
                        title="Eliminar material"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tr-no-materials">
                  Aún no hay materiales en este tema. Añade el primero abajo.
                </p>
              )}

              <div className="tr-actions">
                <button
                  type="button"
                  className="tr-action"
                  onClick={() => handleGenerate('presentation')}
                >
                  <Sparkles size={13} />
                  <span>Presentación</span>
                </button>
                <button
                  type="button"
                  className="tr-action"
                  onClick={() => handleGenerate('textbook')}
                >
                  <BookOpen size={13} />
                  <span>Apuntes</span>
                </button>
                <button
                  type="button"
                  className="tr-action"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={13} />
                  <span>Subir</span>
                </button>
                <button
                  type="button"
                  className="tr-action tr-action--ghost"
                  onClick={() => navigate(
                    `/tabs/classes/${classId}/subjects/${subjectId}/topics/${topic.id}`,
                  )}
                >
                  <Plus size={13} />
                  <span>Más</span>
                </button>
                <button
                  type="button"
                  className="tr-action tr-action--danger"
                  onClick={handleDeleteTopic}
                  title="Eliminar tema"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.ppt,.pptx,.doc,.docx,image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = '';
                }}
              />
            </>
          )}
        </div>
      )}
    </li>
  );
};

export default TopicRow;
