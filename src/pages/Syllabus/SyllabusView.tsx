/**
 * SyllabusView — el Temario de una asignatura.
 *
 * Hogar único del contenido didáctico por asignatura: una lista de Topics
 * agrupados por trimestre, cada uno con sus materiales dentro (PDFs subidos,
 * presentaciones generadas, documentos). Sin biblioteca paralela, sin tabs
 * que compitan — aquí vive todo lo que el profe lleva a clase.
 *
 * Interacciones clave:
 *  - Añadir tema (botón superior).
 *  - Clic en un tema → drawer con sus materiales, acciones y slash bar.
 *  - Eliminar tema con confirmación.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useClassesStore } from '../../store/classesStore';
import { useTopicsStore } from '../../store/topicsStore';
import SubjectPageHeader from '../../components/SubjectPageHeader';
import TopicRow from './TopicRow';
import AddTopicInline from './AddTopicInline';
import './SyllabusView.css';

const SyllabusView: React.FC = () => {
  const { classId, subjectId } = useParams() as { classId: string; subjectId: string };
  const navigate = useNavigate();

  const classes = useClassesStore((s) => s.classes);
  // classesStore.classSubjects es Record<classId, ClassSubjectSummary[]>;
  // indexamos y fallback a array vacío para que cualquier .find/.map posterior
  // sea siempre seguro aunque el fetch no haya respondido aún.
  const classSubjectsForClass = useClassesStore((s) => s.classSubjects[classId] || []);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const topicsBySubject = useTopicsStore((s) => s.topicsBySubject);
  const loading = useTopicsStore((s) => s.loading);
  const fetchTopicsForClass = useTopicsStore((s) => s.fetchTopicsForClass);
  const createTopic = useTopicsStore((s) => s.createTopic);

  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const classObj = useMemo(
    () => (Array.isArray(classes) ? classes.find((c) => c.id === classId) : undefined),
    [classes, classId],
  );
  const subject = useMemo(
    () => classSubjectsForClass.find((s) => s.id === subjectId),
    [classSubjectsForClass, subjectId],
  );

  useEffect(() => {
    fetchClassSubjects(classId);
    fetchTopicsForClass(classId);
  }, [classId, fetchClassSubjects, fetchTopicsForClass]);

  // Los topics del subject actual, ordenados por trimestre y order.
  const topics = useMemo(() => {
    if (!Array.isArray(topicsBySubject)) return [];
    const group = topicsBySubject.find((g) => g.subjectId === subjectId);
    if (!group || !Array.isArray(group.topics)) return [];
    return [...group.topics].sort((a, b) => {
      const ta = a.trimester ?? 99;
      const tb = b.trimester ?? 99;
      if (ta !== tb) return ta - tb;
      return a.order - b.order;
    });
  }, [topicsBySubject, subjectId]);

  // Filtro por búsqueda en nombre/descripción.
  const filtered = useMemo(() => {
    if (!query.trim()) return topics;
    const q = query.trim().toLowerCase();
    return topics.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q),
    );
  }, [topics, query]);

  // Agrupamos por trimestre.
  const groups = useMemo(() => {
    const bucket = new Map<number | 'none', typeof filtered>();
    const order: Array<number | 'none'> = [];
    for (const t of filtered) {
      const key = (t.trimester ?? 'none') as number | 'none';
      if (!bucket.has(key)) {
        bucket.set(key, []);
        order.push(key);
      }
      bucket.get(key)!.push(t);
    }
    return order.map((key) => ({
      key,
      label: key === 'none' ? 'Sin trimestre' : `Trimestre ${key}`,
      topics: bucket.get(key) || [],
    }));
  }, [filtered]);

  const handleCreate = async (name: string, description: string, trimester: number | null) => {
    if (!name.trim()) return;
    try {
      await createTopic(subjectId, {
        name: name.trim(),
        description: description.trim() || undefined,
        trimester: trimester ?? undefined,
        // Atamos el topic a la (asignatura, clase) actual: si la misma
        // asignatura está enlazada a otra clase, el tema no se cruzará.
        class_id: classId,
      });
      setAdding(false);
      toast.success('Tema añadido');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo crear el tema');
    }
  };

  return (
    <div className="syl-shell">
      <SubjectPageHeader
        eyebrow={classObj?.name || 'Clase'}
        title={`${subject?.name || 'Asignatura'} · Temario`}
        sub={(
          <>
            <BookOpen size={12} />
            {topics.length} {topics.length === 1 ? 'tema' : 'temas'}
          </>
        )}
        backHref={`/tabs/classes/${classId}/subjects/${subjectId}`}
        actions={(
          <div className="syl-search">
            <Search size={14} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar tema…"
            />
          </div>
        )}
      />

      <div className="syl-body">
        <div className="syl-toolbar">
          <button
            type="button"
            className="syl-add-btn"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus size={14} /> {adding ? 'Cancelar' : 'Añadir tema'}
          </button>
          <button
            type="button"
            className="syl-calendar-link"
            onClick={() => navigate(`/tabs/classes/${classId}/subjects/${subjectId}/sessions`)}
            title="Ver sesiones en el calendario"
          >
            Ver calendario →
          </button>
        </div>

        {adding && (
          <AddTopicInline
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
            existingTrimesters={
              Array.from(new Set(topics.map((t) => t.trimester).filter((x): x is number => x != null)))
            }
          />
        )}

        {loading && topics.length === 0 ? (
          <div className="syl-empty">
            <Loader2 size={20} className="animate-spin" />
            <span>Cargando temario…</span>
          </div>
        ) : topics.length === 0 && !adding ? (
          <EmptyState onAdd={() => setAdding(true)} />
        ) : filtered.length === 0 ? (
          <div className="syl-empty">
            <span>No hay temas que coincidan con «{query}»</span>
          </div>
        ) : (
          <div className="syl-groups">
            {groups.map((g) => (
              <section key={String(g.key)} className="syl-group">
                <header className="syl-group-header">
                  <span className="syl-group-label">{g.label}</span>
                  <span className="syl-group-count">{g.topics.length}</span>
                </header>
                <ul className="syl-group-list">
                  {g.topics.map((t) => (
                    <TopicRow
                      key={t.id}
                      topic={t}
                      classId={classId}
                      subjectId={subjectId}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Empty state ────────────────────────────────────────────────── */

const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="syl-empty-hero">
    <div className="syl-empty-hero-inner">
      <div className="syl-empty-mark" aria-hidden>
        <BookOpen size={22} />
      </div>
      <h2>Empieza a construir tu temario</h2>
      <p>
        Añade los temas que darás durante el curso. Cada tema guarda sus
        presentaciones, documentos y archivos en un solo sitio.
      </p>
      <div className="syl-empty-actions">
        <button type="button" className="syl-empty-primary" onClick={onAdd}>
          Añadir primer tema
        </button>
      </div>
    </div>
  </div>
);

export default SyllabusView;
