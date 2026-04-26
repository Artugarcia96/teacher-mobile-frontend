/**
 * SessionsView — home por asignatura.
 *
 * Reemplaza TopicsList con una timeline editorial tipo agenda: cada sesión es
 * una tarjeta inline editable con tema, materiales y una barra de slash
 * commands. Cero wizards, cero modales batch — el profe cae en su calendario
 * de clases y actúa en línea.
 *
 * Datos:
 *  - "Sesión" = CalendarEvent con eventType === 'class_session'.
 *  - Si la sesión tiene topicId, resolvemos el Topic correspondiente para
 *    mostrar el nombre del tema y sus materiales adjuntos.
 *  - No hay entidad nueva en backend — el mapeo es sólo de UI.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarRange, Loader2, Search } from 'lucide-react';
import { useCalendarStore } from '../../store/calendarStore';
import { useClassesStore } from '../../store/classesStore';
import { useTopicsStore } from '../../store/topicsStore';
import type { CalendarEvent, Topic } from '../../types';
import SubjectPageHeader from '../../components/SubjectPageHeader';
import SessionCard from './SessionCard';
import SessionDetailDrawer from '../../components/SessionDetailDrawer';
import './SessionsView.css';

/** Rango razonable: 120 días atrás (para ver sesiones ya impartidas) y 9
 *  meses adelante (para cubrir el curso). Gamma-level UX: evita scroll infinito
 *  y paginación — el profe ve su curso completo de una vez. */
const LOOKBACK_DAYS = 120;
const LOOKAHEAD_DAYS = 270;

const SessionsView: React.FC = () => {
  const { classId, subjectId } = useParams() as { classId: string; subjectId: string };
  const navigate = useNavigate();

  const events = useCalendarStore((s) => s.events);
  const loading = useCalendarStore((s) => s.loading);
  const fetchEvents = useCalendarStore((s) => s.fetchEvents);

  const classes = useClassesStore((s) => s.classes);
  // classSubjects es Record<classId, ClassSubjectSummary[]>; indexamos con fallback.
  const classSubjectsForClass = useClassesStore((s) => s.classSubjects[classId] || []);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const topicsBySubject = useTopicsStore((s) => s.topicsBySubject);
  const fetchTopicsForClass = useTopicsStore((s) => s.fetchTopicsForClass);

  const [query, setQuery] = useState('');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const classObj = useMemo(
    () => (Array.isArray(classes) ? classes.find((c) => c.id === classId) : undefined),
    [classes, classId],
  );
  const subject = useMemo(
    () => classSubjectsForClass.find((s) => s.id === subjectId),
    [classSubjectsForClass, subjectId],
  );

  // Carga inicial — eventos del rango + temas de la clase
  useEffect(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - LOOKBACK_DAYS);
    const to = new Date(today);
    to.setDate(to.getDate() + LOOKAHEAD_DAYS);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    fetchEvents(iso(from), iso(to), classId);
    fetchClassSubjects(classId);
    fetchTopicsForClass(classId);
  }, [classId, fetchEvents, fetchClassSubjects, fetchTopicsForClass]);

  // Índice rápido: topicId → Topic (tomando todos los temas del subject actual)
  const topicsById = useMemo(() => {
    const map = new Map<string, Topic>();
    if (!Array.isArray(topicsBySubject)) return map;
    for (const group of topicsBySubject) {
      if (group.subjectId !== subjectId) continue;
      for (const t of (group.topics || [])) {
        map.set(t.id, t as unknown as Topic);
      }
    }
    return map;
  }, [topicsBySubject, subjectId]);

  // Sesiones = CalendarEvents de clase, filtrados por subject (vía topic o
  // via subject_id directo en el evento).
  const sessions = useMemo<CalendarEvent[]>(() => {
    return events
      .filter((e) => e.eventType === 'class_session' && e.classId === classId)
      .filter((e) => {
        // Incluir sólo si coincide con el subject seleccionado:
        // - el evento trae subjectId explícito, o
        // - su topicId pertenece a un Topic de este subject
        if (e.subjectId === subjectId) return true;
        if (e.topicId && topicsById.has(e.topicId)) return true;
        return false;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [events, classId, subjectId, topicsById]);

  // Filtro por búsqueda: nombre de tema, título del evento, trimestre
  const filtered = useMemo(() => {
    if (!query.trim()) return sessions;
    const q = query.trim().toLowerCase();
    return sessions.filter((e) => {
      const topic = e.topicId ? topicsById.get(e.topicId) : null;
      return (
        (topic?.name || '').toLowerCase().includes(q) ||
        (e.title || '').toLowerCase().includes(q) ||
        (e.topicName || '').toLowerCase().includes(q)
      );
    });
  }, [sessions, query, topicsById]);

  // Agrupamos por trimestre si los topics lo tienen; si no, por mes.
  const groups = useMemo(() => groupSessions(filtered, topicsById), [filtered, topicsById]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="sv-shell">
      <SubjectPageHeader
        eyebrow={classObj?.name || 'Clase'}
        title={`${subject?.name || 'Asignatura'} · Sesiones`}
        sub={(
          <>
            <CalendarRange size={12} />
            {sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'}
          </>
        )}
        backHref={`/tabs/classes/${classId}/subjects/${subjectId}`}
        actions={(
          <div className="sv-search">
            <Search size={14} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por tema o fecha…"
            />
          </div>
        )}
      />

      {loading && sessions.length === 0 ? (
        <div className="sv-empty">
          <Loader2 size={20} className="animate-spin" />
          <span>Cargando sesiones…</span>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState classId={classId} subjectId={subjectId} />
      ) : (
        <div className="sv-timeline">
          {groups.map((g) => (
            <section key={g.key} className="sv-group">
              <header className="sv-group-header">
                <span className="sv-group-label">{g.label}</span>
                <span className="sv-group-count">{g.sessions.length}</span>
              </header>
              <ul className="sv-group-list">
                {g.sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    topic={session.topicId ? topicsById.get(session.topicId) : undefined}
                    isToday={session.date === today}
                    onOpen={setOpenSessionId}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <SessionDetailDrawer
        eventId={openSessionId}
        open={!!openSessionId}
        onClose={() => setOpenSessionId(null)}
      />
    </div>
  );
};

/* ─── Agrupación ─────────────────────────────────────────────────── */

interface Group {
  key: string;
  label: string;
  sessions: CalendarEvent[];
}

function groupSessions(sessions: CalendarEvent[], topicsById: Map<string, Topic>): Group[] {
  // Si todas las sesiones tienen topic con trimester, agrupamos por trimestre;
  // si no, caemos a grupos por mes (más legible que por semana para el profe
  // que ojea el curso entero).
  const useTrimesters = sessions.some((e) => {
    const t = e.topicId ? topicsById.get(e.topicId) : null;
    return t?.trimester != null;
  });

  const bucket = new Map<string, CalendarEvent[]>();
  const order: string[] = [];

  for (const e of sessions) {
    let key: string;
    if (useTrimesters) {
      const t = e.topicId ? topicsById.get(e.topicId) : null;
      key = t?.trimester ? `tri-${t.trimester}` : 'tri-0';
    } else {
      const d = new Date(e.date + 'T00:00:00');
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!bucket.has(key)) {
      bucket.set(key, []);
      order.push(key);
    }
    bucket.get(key)!.push(e);
  }

  return order.map((key) => ({
    key,
    label: labelForGroup(key, useTrimesters),
    sessions: bucket.get(key) || [],
  }));
}

function labelForGroup(key: string, useTrimesters: boolean): string {
  if (useTrimesters) {
    if (key === 'tri-0') return 'Sin trimestre asignado';
    return `Trimestre ${key.split('-')[1]}`;
  }
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

/* ─── Empty state ────────────────────────────────────────────────── */

const EmptyState: React.FC<{ classId: string; subjectId: string }> = ({ classId, subjectId }) => {
  const navigate = useNavigate();
  return (
    <div className="sv-empty-hero">
      <div className="sv-empty-hero-inner">
        <div className="sv-empty-mark" aria-hidden>
          <CalendarRange size={22} />
        </div>
        <h2>Tu curso, sesión a sesión</h2>
        <p>
          Cuando generes una planificación o añadas clases al calendario, aparecerán aquí como
          tarjetas editables. Desde cada una podrás preparar la sesión en un click.
        </p>
        <div className="sv-empty-actions">
          <button
            type="button"
            className="sv-empty-primary"
            onClick={() => navigate(`/tabs/classes/${classId}/subjects/${subjectId}/programacion`)}
          >
            Crear programación
          </button>
          <button
            type="button"
            className="sv-empty-secondary"
            onClick={() => navigate('/tabs/calendar')}
          >
            Ir al calendario
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionsView;
