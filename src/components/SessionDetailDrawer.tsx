/**
 * SessionDetailDrawer — hub operativo de una sesión.
 *
 * Una sola superficie con todo lo que el profesor hace alrededor de una clase
 * concreta: ver y editar el tema, generar/adjuntar materiales, pasar lista,
 * tomar notas. Reemplaza navegar por varias páginas.
 *
 * Se abre desde:
 *  - SessionsView (timeline de sesiones por asignatura)
 *  - Calendar (día/mes/semana, click en evento class_session)
 *
 * El binding sesión↔material se persiste en `Presentation.calendar_event_id`,
 * `Exam.calendar_event_id`, `Exercise.calendar_event_id`. Tras generar desde
 * el Taller (que recibe context.calendarEventId) refrescamos el detalle.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, FileText, Loader2, PenLine,
  Presentation as PresentationIcon, Sparkles, StickyNote, Upload, UserCheck, X,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/shared/Modal';
import { useSessionsStore } from '../store/sessionsStore';
import { useTallerStore } from '../store/tallerStore';
import { useTopicsStore } from '../store/topicsStore';
import { useCalendarStore } from '../store/calendarStore';
import AttendanceSheet from './AttendanceSheet';
import type { SessionMaterial } from '../types';
import './SessionDetailDrawer.css';

interface Props {
  /** Id de la sesión = id del CalendarEvent. */
  eventId: string | null;
  open: boolean;
  onClose: () => void;
}

const MATERIAL_ICONS: Record<SessionMaterial['type'], typeof FileText> = {
  presentation: PresentationIcon,
  exam: FileText,
  exercise: PenLine,
  textbook: BookOpen,
};

const MATERIAL_KIND_LABEL: Record<string, string> = {
  presentation: 'Presentación',
  exam: 'Examen',
  exercise: 'Ejercicio',
  textbook: 'Apuntes',
};

const SessionDetailDrawer: React.FC<Props> = ({ eventId, open, onClose }) => {
  const navigate = useNavigate();
  const detail = useSessionsStore((s) => (eventId ? s.byId[eventId] : null));
  const loading = useSessionsStore((s) => (eventId ? s.loading[eventId] : false));
  const fetchSession = useSessionsStore((s) => s.fetchSession);
  const updateNotes = useSessionsStore((s) => s.updateNotes);
  const detachMaterial = useSessionsStore((s) => s.detach);
  const openTaller = useTallerStore((s) => s.openTaller);
  const updateTopic = useTopicsStore((s) => s.updateTopic);
  const uploadMaterial = useTopicsStore((s) => s.uploadMaterial);
  const updateEvent = useCalendarStore((s) => s.updateEvent);

  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recarga al abrir (también si el id cambia entre aperturas).
  useEffect(() => {
    if (open && eventId) {
      fetchSession(eventId).catch(() => {
        toast.error('No se pudo cargar la sesión');
      });
    }
  }, [open, eventId, fetchSession]);

  useEffect(() => {
    if (detail) {
      setTitleDraft(detail.topicName || detail.title || '');
      setNotesDraft(detail.notes || '');
    }
  }, [detail]);

  const dateLabel = useMemo(() => {
    if (!detail) return '';
    return new Date(detail.eventDate + 'T00:00:00').toLocaleDateString('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }, [detail]);

  const timeRange = detail?.startTime
    ? `${detail.startTime.slice(0, 5)}${detail.endTime ? ` – ${detail.endTime.slice(0, 5)}` : ''}`
    : null;

  const isClass = detail?.eventType === 'class_session';

  const commitTitle = async () => {
    if (!detail) return;
    const v = titleDraft.trim();
    setEditingTitle(false);
    if (!v || v === (detail.topicName || detail.title)) return;
    try {
      if (detail.topicId) {
        await updateTopic(detail.topicId, { name: v });
      } else {
        await updateEvent(detail.id, { title: v });
      }
      // Refresca el detalle para mostrar el nuevo nombre
      await fetchSession(detail.id);
    } catch {
      toast.error('No se pudo guardar el cambio');
    }
  };

  const saveNotes = async () => {
    if (!detail || notesDraft === (detail.notes || '')) return;
    setSavingNotes(true);
    try {
      await updateNotes(detail.id, notesDraft);
      toast.success('Notas guardadas');
    } catch {
      toast.error('No se pudieron guardar las notas');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleGenerate = (type: 'presentation' | 'exam' | 'exercise' | 'textbook') => {
    if (!detail) return;
    openTaller({
      defaultType: type,
      classId: detail.classId || undefined,
      subjectId: detail.subjectId || undefined,
      subjectName: detail.subjectName || undefined,
      topicName: detail.topicName || undefined,
      topicId: detail.topicId || undefined,
      date: detail.eventDate,
      promptHint: detail.topicName ? `${MATERIAL_KIND_LABEL[type]} para ${detail.topicName}` : undefined,
      calendarEventId: detail.id,
      limitTo: type === 'presentation' || type === 'textbook' ? 'content' : 'assessment',
    });
  };

  const handleUpload = async (file: File) => {
    if (!detail) return;
    if (!detail.topicId) {
      toast.error('Asigna un tema a esta sesión antes de adjuntar material.');
      return;
    }
    try {
      await uploadMaterial(detail.topicId, file);
      toast.success('Material adjuntado');
      await fetchSession(detail.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo subir el archivo');
    }
  };

  const handleDetach = async (m: SessionMaterial) => {
    if (!detail) return;
    try {
      await detachMaterial(detail.id, m.type, m.id);
      toast.success('Material desvinculado de la sesión');
    } catch {
      toast.error('No se pudo desvincular');
    }
  };

  const openMaterial = (m: SessionMaterial) => {
    if (m.external) {
      // PDF generado (textbook): abrir en nueva pestaña.
      if (m.href && m.href !== '#') window.open(m.href, '_blank', 'noopener,noreferrer');
      return;
    }
    onClose();
    navigate(m.href);
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} sheetHeight="full" dialogSize="lg" flush>
      <div className="sd-shell">
        {!detail || loading ? (
          <div className="sd-empty">
            <Loader2 size={20} className="animate-spin" />
            <span>Cargando sesión…</span>
          </div>
        ) : (
          <>
            <header className="sd-header">
              <div className="sd-header-meta">
                <span className="sd-eyebrow">
                  {detail.className && <span>{detail.className}</span>}
                  {detail.subjectName && <span> · {detail.subjectName}</span>}
                </span>
                {editingTitle ? (
                  <input
                    autoFocus
                    className="sd-title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                      if (e.key === 'Escape') {
                        setTitleDraft(detail.topicName || detail.title || '');
                        setEditingTitle(false);
                      }
                    }}
                  />
                ) : (
                  <h2
                    className="sd-title"
                    onClick={() => setEditingTitle(true)}
                    title="Haz clic para editar el tema"
                  >
                    {detail.topicName || detail.title || 'Sesión sin tema'}
                  </h2>
                )}
                <span className="sd-when">
                  {dateLabel}
                  {timeRange && <span className="sd-when-time"> · {timeRange}</span>}
                  {detail.isCancelled && <span className="sd-cancel-pill">Cancelada</span>}
                </span>
              </div>
              <button type="button" className="sd-close" onClick={onClose} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>

            <div className="sd-body">
              {/* Materiales */}
              <section className="sd-section">
                <h3 className="sd-section-title">Materiales de la sesión</h3>
                {detail.materials.length > 0 ? (
                  <ul className="sd-materials">
                    {detail.materials.map((m) => {
                      const Icon = MATERIAL_ICONS[m.type];
                      return (
                        <li key={`${m.type}-${m.id}`} className="sd-material">
                          <button
                            type="button"
                            className="sd-material-main"
                            onClick={() => openMaterial(m)}
                          >
                            <span className="sd-material-icon"><Icon size={14} /></span>
                            <span className="sd-material-text">
                              <span className="sd-material-title">{m.title}</span>
                              <span className="sd-material-kind">
                                {MATERIAL_KIND_LABEL[m.type]}
                                {m.status && <span className="sd-material-status"> · {m.status}</span>}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="sd-material-detach"
                            onClick={() => handleDetach(m)}
                            title="Desvincular de esta sesión"
                          >
                            <X size={14} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="sd-empty-line">
                    Aún no has vinculado materiales a esta sesión. Genera uno desde abajo.
                  </p>
                )}

                <div className="sd-quick-actions">
                  <button
                    type="button"
                    className="sd-action sd-action--primary"
                    onClick={() => handleGenerate('presentation')}
                  >
                    <Sparkles size={14} /> Presentación
                  </button>
                  <button
                    type="button"
                    className="sd-action"
                    onClick={() => handleGenerate('textbook')}
                  >
                    <BookOpen size={14} /> Apuntes
                  </button>
                  <button
                    type="button"
                    className="sd-action"
                    onClick={() => handleGenerate('exercise')}
                  >
                    <PenLine size={14} /> Ejercicios
                  </button>
                  <button
                    type="button"
                    className="sd-action"
                    onClick={() => handleGenerate('exam')}
                  >
                    <FileText size={14} /> Examen
                  </button>
                  <button
                    type="button"
                    className="sd-action sd-action--ghost"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={14} /> Subir
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sd-file-input"
                    accept=".pdf,.ppt,.pptx,.doc,.docx,image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </section>

              {/* Pasar lista */}
              {isClass && detail.classId && (
                <section className="sd-section">
                  <h3 className="sd-section-title">Asistencia</h3>
                  <button
                    type="button"
                    className="sd-attendance-btn"
                    onClick={() => setAttendanceOpen(true)}
                  >
                    <UserCheck size={16} />
                    <span>Pasar lista</span>
                    <span className="sd-attendance-hint">{dateLabel}</span>
                  </button>
                </section>
              )}

              {/* Notas inline */}
              <section className="sd-section">
                <h3 className="sd-section-title">
                  <StickyNote size={14} /> Notas de la sesión
                </h3>
                <textarea
                  className="sd-notes"
                  rows={4}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Apuntes para esta clase: lo que quieres no olvidar, cómo enlazarla con la siguiente, atención especial a algún alumno…"
                />
                {savingNotes && (
                  <span className="sd-saving">
                    <Loader2 size={11} className="animate-spin" /> Guardando…
                  </span>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      {detail?.classId && (
        <AttendanceSheet
          isOpen={attendanceOpen}
          classId={detail.classId}
          date={detail.eventDate}
          eventId={detail.id}
          subjectId={detail.subjectId || undefined}
          onDismiss={() => setAttendanceOpen(false)}
        />
      )}
    </Modal>
  );
};

export default SessionDetailDrawer;
