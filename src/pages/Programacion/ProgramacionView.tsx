/**
 * ProgramacionView — el hogar de la programación + planificación de un curso.
 *
 * Reemplaza el flujo basado en modales (CoursePlanCreatorModal/Detail) por una
 * página en dos fases visuales explícitas:
 *
 *   Fase 1 — PROGRAMACIÓN (qué se enseña)
 *     • Subir programación oficial o crear desde cero (Taller IA).
 *     • Revisar el currículo extraído por la IA en secciones editables.
 *     • Validar la programación (acto explícito → habilita Fase 2).
 *
 *   Fase 2 — PLANIFICACIÓN (cuándo y cómo)
 *     • Configurar reparto: trimestres, exámenes, repasos, sesiones comodín.
 *     • Revisar el plan generado (units → sessions → fechas).
 *     • Confirmar planificación → crea topics + sesiones de calendario.
 *     • Una vez confirmado, el operativo del día a día vive en el calendario
 *       y en la vista de Sesiones.
 *
 * Hasta que la programación no esté validada, la planificación está bloqueada.
 * El backend impone el mismo invariante (validate_at, accept guard).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, BookOpen, Calendar as CalendarIcon, CheckCircle, ChevronRight,
  ClipboardList, Loader2, RefreshCw, Sparkles, Upload, X,
} from 'lucide-react';
import SubjectPageHeader from '../../components/SubjectPageHeader';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCoursePlanStore } from '../../store/coursePlanStore';
import { useClassesStore } from '../../store/classesStore';
import { useBackgroundTasksStore } from '../../store/backgroundTasksStore';
import { batch, subjects as subjectsApi } from '../../services/api';
import type { CoursePlan, CurriculumUnit } from '../../types';
import './ProgramacionView.css';

const POLL_INITIAL_MS = 3500;
const POLL_CAP_MS = 9000;

const ProgramacionView: React.FC = () => {
  const { classId, subjectId } = useParams() as { classId: string; subjectId: string };
  const navigate = useNavigate();

  const fetchPlans = useCoursePlanStore((s) => s.fetchPlans);
  const fetchPlan = useCoursePlanStore((s) => s.fetchPlan);
  const createPlan = useCoursePlanStore((s) => s.createPlan);
  const validatePlan = useCoursePlanStore((s) => s.validatePlan);
  const updateCurriculum = useCoursePlanStore((s) => s.updateCurriculum);
  const acceptPlan = useCoursePlanStore((s) => s.acceptPlan);
  const regeneratePlan = useCoursePlanStore((s) => s.regeneratePlan);
  const deletePlan = useCoursePlanStore((s) => s.deletePlan);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);

  const classObj = useClassesStore((s) => Array.isArray(s.classes) ? s.classes.find((c) => c.id === classId) : undefined);
  const classSubjects = useClassesStore((s) => s.classSubjects[classId] || []);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const subject = useMemo(() => classSubjects.find((s) => s.id === subjectId), [classSubjects, subjectId]);

  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [loading, setLoading] = useState(true);
  // Fallback: si la asignatura no aparece en classSubjects (deep-link, race),
  // hacemos un fetch directo a /subjects/:id para mostrar nombre de inmediato.
  const [subjectFallback, setSubjectFallback] = useState<{ id: string; name: string } | null>(null);
  const subjectName = subject?.name || subjectFallback?.name;
  const className = classObj?.name;

  // Carga inicial: si hay plan activo para este subject+class, usarlo.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Asegura clase + asignaturas para resolver el nombre en cabecera.
        await Promise.all([fetchClasses(), fetchClassSubjects(classId)]);
        await fetchPlans(subjectId, classId);
        const list = useCoursePlanStore.getState().plans;
        const active = list.find((p) => p.isActive && p.subjectId === subjectId && p.classId === classId);
        if (active && !cancelled) {
          const detail = await fetchPlan(active.id);
          if (!cancelled) setPlan(detail);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId, subjectId, fetchClasses, fetchClassSubjects, fetchPlans, fetchPlan]);

  // Fallback al endpoint directo si la asignatura no aparece en el join de clase.
  useEffect(() => {
    if (subject || subjectFallback?.id === subjectId) return;
    let cancelled = false;
    subjectsApi.get(subjectId).then((res) => {
      if (!cancelled && res.data) {
        setSubjectFallback({ id: res.data.id, name: res.data.name });
      }
    }).catch(() => { /* silencioso: la cabecera ya tiene fallback genérico */ });
    return () => { cancelled = true; };
  }, [subjectId, subject, subjectFallback]);

  // Polling mientras se genera (analizando + planificando)
  useEffect(() => {
    if (!plan || !plan.batchJobId) return;
    if (plan.status !== 'generating' && plan.status !== 'analyzing' && plan.status !== 'pending') return;

    let cancelled = false;
    let interval = POLL_INITIAL_MS;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await batch.getJobProgress(plan.batchJobId!);
        const s = res.data.status;
        if (s === 'completed' || s === 'failed' || s === 'cancelled') {
          const detail = await fetchPlan(plan.id);
          if (!cancelled) setPlan(detail);
          return;
        }
      } catch { /* sigue */ }
      interval = Math.min(interval + 1500, POLL_CAP_MS);
      window.setTimeout(tick, interval);
    };
    window.setTimeout(tick, interval);
    return () => { cancelled = true; };
  }, [plan?.id, plan?.batchJobId, plan?.status, fetchPlan]);

  /* ── Acciones ────────────────────────────────────────────────── */

  const startCreation = async (params: { guidePdfs?: File[]; priorityNotes?: string }) => {
    try {
      const res = await createPlan({
        subject_id: subjectId,
        class_id: classId,
        enfoque: 'practico',
        guide_pdfs: params.guidePdfs,
        priority_notes: params.priorityNotes,
      });
      const detail = await fetchPlan(res.id);
      setPlan(detail);
      addBackgroundTask({
        type: 'textbook',
        label: `Programación: ${subjectName || 'asignatura'}`,
        description: 'Analizando currículo y montando la programación.',
        batchJobId: res.batchJobId,
        expectedResultUrl: `/tabs/classes/${classId}/subjects/${subjectId}/programacion`,
        execute: async () => `/tabs/classes/${classId}/subjects/${subjectId}/programacion`,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo crear la programación');
    }
  };

  const handleValidate = async () => {
    if (!plan) return;
    try {
      const updated = await validatePlan(plan.id);
      setPlan(updated);
      toast.success('Programación validada. Ya puedes planificar las sesiones.');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo validar');
    }
  };

  const handleSaveCurriculum = async (curriculum: any) => {
    if (!plan) return;
    try {
      const updated = await updateCurriculum(plan.id, curriculum);
      setPlan(updated);
      toast.success('Cambios guardados');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudieron guardar los cambios');
    }
  };

  const handleAccept = async () => {
    if (!plan) return;
    try {
      const res = await acceptPlan(plan.id);
      const detail = await fetchPlan(plan.id);
      setPlan(detail);
      toast.success(`Planificación creada: ${res.topics_created} temas, ${res.events_created} sesiones.`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo confirmar la planificación');
    }
  };

  const handleRegenerate = async () => {
    if (!plan) return;
    try {
      const res = await regeneratePlan(plan.id, {});
      addBackgroundTask({
        type: 'textbook',
        label: `Replanificación: ${subjectName || 'asignatura'}`,
        description: 'Recalculando reparto de sesiones, fechas y exámenes.',
        batchJobId: res.batchJobId,
        expectedResultUrl: `/tabs/classes/${classId}/subjects/${subjectId}/programacion`,
        execute: async () => `/tabs/classes/${classId}/subjects/${subjectId}/programacion`,
      });
      const detail = await fetchPlan(plan.id);
      setPlan(detail);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo replanificar');
    }
  };

  const handleDelete = async () => {
    if (!plan) return;
    if (!window.confirm('¿Eliminar esta programación y su planificación? Las sesiones del calendario también se quitarán.')) return;
    try {
      await deletePlan(plan.id);
      setPlan(null);
      toast.success('Programación eliminada');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  /* ── Render ──────────────────────────────────────────────────── */

  return (
    <div className="prog-shell">
      <SubjectPageHeader
        eyebrow={className || 'Clase'}
        title={`${subjectName || 'Asignatura'} · Programación`}
        backHref={`/tabs/classes/${classId}/subjects/${subjectId}`}
        actions={plan ? (
          <button type="button" onClick={handleDelete}>Eliminar</button>
        ) : undefined}
      />

      {loading ? (
        <div className="prog-empty"><Loader2 size={20} className="animate-spin" /> Cargando programación…</div>
      ) : !plan ? (
        <EmptyState onSubmit={startCreation} subjectName={subjectName || ''} />
      ) : plan.status === 'pending' || plan.status === 'analyzing' || (plan.status === 'generating' && !plan.curriculum) ? (
        <Generating subjectName={subjectName || ''} />
      ) : (
        <PlanWorkspace
          plan={plan}
          subjectName={subjectName || ''}
          onValidate={handleValidate}
          onSaveCurriculum={handleSaveCurriculum}
          onAccept={handleAccept}
          onRegenerate={handleRegenerate}
          onGoToSessions={() => navigate(`/tabs/classes/${classId}/subjects/${subjectId}/sessions`)}
        />
      )}
    </div>
  );
};

/* ─── Empty state: sin plan todavía ────────────────────────────── */

const EmptyState: React.FC<{
  onSubmit: (p: { guidePdfs?: File[]; priorityNotes?: string }) => Promise<void>;
  subjectName: string;
}> = ({ onSubmit, subjectName }) => {
  const [guidePdfs, setGuidePdfs] = useState<File[]>([]);
  const [priorityNotes, setPriorityNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Habilitamos el botón si hay PDF subido o si el profesor escribió algo.
  // Sin nada que enviar la IA no tiene contexto y mostrar "crear" sería mentir.
  const hasInput = guidePdfs.length > 0 || priorityNotes.trim().length >= 10;

  const handleSubmit = async () => {
    if (!hasInput) return;
    setSubmitting(true);
    await onSubmit({
      guidePdfs: guidePdfs.length ? guidePdfs : undefined,
      priorityNotes: priorityNotes.trim() || undefined,
    });
    setSubmitting(false);
  };

  const onPickFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) =>
      /\.(pdf|docx)$/i.test(f.name) || f.type === 'application/pdf' || f.type.includes('officedocument'),
    );
    if (arr.length) setGuidePdfs((p) => [...p, ...arr]);
  };

  const sizeLabel = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="prog-empty-page">
      {/* Hero: contexto + roadmap de tres pasos */}
      <section className="prog-empty-hero">
        <span className="prog-empty-hero-eyebrow">
          <Sparkles size={12} /> Configurar la asignatura
        </span>
        <h2 className="prog-empty-hero-title">
          Empieza por la programación de {subjectName || 'esta asignatura'}
        </h2>
        <p className="prog-empty-hero-text">
          Sube el temario oficial o cuéntanos qué quieres impartir. La IA estructura unidades,
          objetivos y contenidos. Tú revisas, validas y al final tienes el calendario lleno de
          sesiones listas para llevar a clase.
        </p>

        <ol className="prog-empty-roadmap">
          <li className="prog-empty-step">
            <span className="prog-empty-step-icon"><BookOpen size={14} /></span>
            <div className="prog-empty-step-text">
              <span className="prog-empty-step-num">1 · Programación</span>
              <span className="prog-empty-step-desc">Qué se enseña — unidades, objetivos, contenidos</span>
            </div>
          </li>
          <li className="prog-empty-step">
            <span className="prog-empty-step-icon"><CalendarIcon size={14} /></span>
            <div className="prog-empty-step-text">
              <span className="prog-empty-step-num">2 · Planificación</span>
              <span className="prog-empty-step-desc">Cuándo y cómo se reparte en sesiones reales</span>
            </div>
          </li>
          <li className="prog-empty-step">
            <span className="prog-empty-step-icon"><ClipboardList size={14} /></span>
            <div className="prog-empty-step-text">
              <span className="prog-empty-step-num">3 · Sesiones</span>
              <span className="prog-empty-step-desc">Tu calendario con materiales por clase</span>
            </div>
          </li>
        </ol>
      </section>

      {/* Form: dos inputs visibles en paralelo */}
      <section className="prog-empty-form">
        <header className="prog-empty-form-head">
          <h3>De dónde partimos</h3>
          <span className="prog-empty-form-hint">
            Mejor cuanto más contexto le des — pero con cualquiera de los dos basta.
          </span>
        </header>

        <div className="prog-empty-grid">
          {/* Subir programación */}
          <label
            className={`prog-empty-card prog-empty-card--upload ${dragActive ? 'is-drag' : ''} ${guidePdfs.length > 0 ? 'has-files' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              onPickFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept=".pdf,.docx"
              multiple
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <div className="prog-empty-card-icon"><Upload size={18} /></div>
            <h4 className="prog-empty-card-title">Subir programación oficial</h4>
            <p className="prog-empty-card-text">
              Arrastra o pulsa para añadir el PDF/DOCX del temario del centro.
            </p>

            {guidePdfs.length > 0 ? (
              <ul className="prog-empty-files">
                {guidePdfs.map((f, i) => (
                  <li key={i}>
                    <span className="prog-empty-files-name">{f.name}</span>
                    <span className="prog-empty-files-size">{sizeLabel(f.size)}</span>
                    <button
                      type="button"
                      aria-label="Quitar archivo"
                      onClick={(e) => {
                        e.preventDefault();
                        setGuidePdfs((xs) => xs.filter((_, idx) => idx !== i));
                      }}
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="prog-empty-card-chip">PDF · DOCX</span>
            )}
          </label>

          {/* Describir el curso */}
          <div className="prog-empty-card prog-empty-card--describe">
            <div className="prog-empty-card-icon"><PenLine size={18} /></div>
            <h4 className="prog-empty-card-title">Describir el curso</h4>
            <p className="prog-empty-card-text">
              Cuéntanos qué quieres impartir, cómo, y dónde poner el foco. Cuanto más detalle,
              mejor estructura sale.
            </p>

            <Textarea
              rows={5}
              value={priorityNotes}
              onChange={(e) => setPriorityNotes(e.target.value)}
              className="prog-empty-textarea"
              placeholder={[
                `Ej.: ${subjectName || 'Mi asignatura'} para 2º Bach.`,
                'Foco en derivadas e integrales, mucho ejercicio guiado.',
                'El grupo viene flojo de límites — repasar al inicio.',
              ].join('\n')}
            />

            {priorityNotes.trim().length > 0 && priorityNotes.trim().length < 10 && (
              <span className="prog-empty-hint-warn">
                Añade un poco más de detalle (al menos una frase).
              </span>
            )}
          </div>
        </div>

        <div className="prog-empty-cta-row">
          <span className="prog-empty-cta-side">
            {guidePdfs.length > 0 && priorityNotes.trim().length >= 10 ? (
              <><CheckCircle size={13} /> Tenemos PDF y descripción — máximo contexto.</>
            ) : guidePdfs.length > 0 ? (
              <><CheckCircle size={13} /> {guidePdfs.length} {guidePdfs.length === 1 ? 'archivo' : 'archivos'} listos.</>
            ) : priorityNotes.trim().length >= 10 ? (
              <><CheckCircle size={13} /> La IA trabajará desde tu descripción.</>
            ) : (
              <><AlertCircle size={13} /> Sube un PDF o describe el curso para empezar.</>
            )}
          </span>
          <Button
            onClick={handleSubmit}
            disabled={!hasInput || submitting}
            className="prog-empty-cta"
            size="lg"
          >
            {submitting
              ? <><Loader2 size={15} className="animate-spin" /> Iniciando…</>
              : <><Sparkles size={15} /> Crear programación</>}
          </Button>
        </div>
      </section>
    </div>
  );
};

/* ─── Generando ─────────────────────────────────────────────── */

const Generating: React.FC<{ subjectName: string }> = ({ subjectName }) => (
  <div className="prog-empty-page">
    <div className="prog-empty-card prog-empty-card--loading">
      <Loader2 size={24} className="animate-spin prog-loading-icon" />
      <h2>Montando la programación de {subjectName}</h2>
      <p>
        La IA está leyendo la programación oficial y proponiendo unidades, objetivos y contenidos.
        Esto suele tardar 30-60 segundos. Puedes esperar aquí — actualizaremos automáticamente.
      </p>
    </div>
  </div>
);

/* ─── Plan listo ──────────────────────────────────────────── */

const PlanWorkspace: React.FC<{
  plan: CoursePlan;
  subjectName: string;
  onValidate: () => Promise<void>;
  onSaveCurriculum: (c: any) => Promise<void>;
  onAccept: () => Promise<void>;
  onRegenerate: () => Promise<void>;
  onGoToSessions: () => void;
}> = ({ plan, subjectName, onValidate, onSaveCurriculum, onAccept, onRegenerate, onGoToSessions }) => {
  const isValidated = !!plan.validatedAt;
  const isPlanned = !!plan.plannedAt;
  const isRegenerating = plan.status === 'generating';

  return (
    <div className="prog-workspace">
      {/* Stepper visible en cabecera */}
      <ol className="prog-stepper" aria-label="Fases">
        <li className={`prog-step ${!isValidated ? 'prog-step--active' : 'prog-step--done'}`}>
          <span className="prog-step-num">1</span>
          <span className="prog-step-text">
            <span className="prog-step-title">Programación</span>
            <span className="prog-step-sub">{isValidated ? 'Validada' : 'Por validar'}</span>
          </span>
        </li>
        <li className={`prog-step ${isValidated && !isPlanned ? 'prog-step--active' : isPlanned ? 'prog-step--done' : 'prog-step--locked'}`}>
          <span className="prog-step-num">2</span>
          <span className="prog-step-text">
            <span className="prog-step-title">Planificación</span>
            <span className="prog-step-sub">{isPlanned ? 'Confirmada' : isValidated ? 'Por confirmar' : 'Bloqueada'}</span>
          </span>
        </li>
        <li className={`prog-step ${isPlanned ? 'prog-step--active' : 'prog-step--locked'}`}>
          <span className="prog-step-num">3</span>
          <span className="prog-step-text">
            <span className="prog-step-title">Sesiones</span>
            <span className="prog-step-sub">{isPlanned ? 'Listo' : 'Tras planificar'}</span>
          </span>
        </li>
      </ol>

      {/* Fase 1 — Programación (currículo) */}
      <Phase1
        plan={plan}
        onValidate={onValidate}
        onSaveCurriculum={onSaveCurriculum}
      />

      {/* Fase 2 — Planificación. Solo se bloquea hasta validar; tras validar
          tiene tres sub-estados: generando fechas / por confirmar / confirmada. */}
      <Phase2
        plan={plan}
        canPlan={isValidated}
        isRegenerating={isRegenerating}
        onAccept={onAccept}
        onRegenerate={onRegenerate}
        onGoToSessions={onGoToSessions}
      />
    </div>
  );
};

/* ─── Fase 1 ─────────────────────────────────────────────────── */

const Phase1: React.FC<{
  plan: CoursePlan;
  onValidate: () => Promise<void>;
  onSaveCurriculum: (c: any) => Promise<void>;
}> = ({ plan, onValidate, onSaveCurriculum }) => {
  const isValidated = !!plan.validatedAt;
  const curriculum = plan.curriculum;

  if (!curriculum) {
    return (
      <section className="prog-phase">
        <PhaseHeader phase={1} title="Programación" sub="Qué se enseña en el curso" />
        <p className="prog-empty-line">Aún no hay programación analizada. Espera unos segundos.</p>
      </section>
    );
  }

  return (
    <section className="prog-phase">
      <PhaseHeader
        phase={1}
        title="Programación"
        sub="Qué se enseña en el curso"
        chip={isValidated ? { label: 'Validada', tone: 'success' } : { label: 'Por validar', tone: 'warning' }}
      />

      <CurriculumEditor
        curriculum={curriculum}
        readonly={isValidated}
        onSave={onSaveCurriculum}
      />

      <div className="prog-phase-footer">
        {!isValidated ? (
          <Button onClick={onValidate} className="prog-cta">
            <CheckCircle size={14} /> Validar programación
          </Button>
        ) : (
          <span className="prog-validated-note">
            <CheckCircle size={14} /> Validada · si la editas se invalidará y deberás validar de nuevo.
          </span>
        )}
      </div>
    </section>
  );
};

const CurriculumEditor: React.FC<{
  curriculum: any;
  readonly?: boolean;
  onSave: (c: any) => Promise<void>;
}> = ({ curriculum, readonly, onSave }) => {
  const [units, setUnits] = useState<CurriculumUnit[]>(curriculum.units || []);
  const [openUnit, setOpenUnit] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync cuando cambia el plan desde fuera (p.ej. tras revalidar)
  useEffect(() => {
    setUnits(curriculum.units || []);
    setDirty(false);
  }, [curriculum]);

  const update = (next: CurriculumUnit[]) => {
    setUnits(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({ ...curriculum, units });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="prog-curriculum">
      <header className="prog-curriculum-head">
        <div>
          <span className="prog-curriculum-subj">{curriculum.subject || 'Sin asignatura'}</span>
          <span className="prog-curriculum-level">{curriculum.level || ''}</span>
        </div>
        <span className="prog-curriculum-count">
          {units.length} {units.length === 1 ? 'unidad' : 'unidades'} · {curriculum.total_topics || 0} temas
        </span>
      </header>

      <ol className="prog-units">
        {units.map((u, ui) => {
          const isOpen = openUnit === ui;
          return (
            <li key={ui} className={`prog-unit ${isOpen ? 'prog-unit--open' : ''}`}>
              <button
                type="button"
                className="prog-unit-head"
                onClick={() => setOpenUnit(isOpen ? null : ui)}
              >
                <span className="prog-unit-num">U{u.number || ui + 1}</span>
                {readonly ? (
                  <span className="prog-unit-title">{u.title}</span>
                ) : (
                  <input
                    className="prog-unit-input"
                    value={u.title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const next = [...units];
                      next[ui] = { ...u, title: e.target.value };
                      update(next);
                    }}
                  />
                )}
                <span className="prog-unit-count">{u.topics?.length || 0} temas</span>
                <ChevronRight size={16} className="prog-unit-chev" />
              </button>

              {isOpen && (
                <div className="prog-unit-body">
                  {u.description && (
                    <p className="prog-unit-desc">{u.description}</p>
                  )}
                  <ol className="prog-topics">
                    {(u.topics || []).map((t, ti) => (
                      <li key={ti} className="prog-topic">
                        {readonly ? (
                          <span className="prog-topic-title">{t.title}</span>
                        ) : (
                          <input
                            className="prog-topic-input"
                            value={t.title}
                            onChange={(e) => {
                              const next = [...units];
                              next[ui] = {
                                ...u,
                                topics: u.topics.map((x, idx) => idx === ti ? { ...x, title: e.target.value } : x),
                              };
                              update(next);
                            }}
                          />
                        )}
                        {(t.learning_objectives || []).length > 0 && (
                          <ul className="prog-topic-objectives">
                            {t.learning_objectives!.slice(0, 3).map((o, oi) => (
                              <li key={oi}>{o}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {!readonly && dirty && (
        <div className="prog-curriculum-savebar">
          <span className="prog-savebar-text">Hay cambios sin guardar.</span>
          <Button onClick={save} disabled={saving}>
            {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : 'Guardar cambios'}
          </Button>
        </div>
      )}
    </div>
  );
};

/* ─── Fase 2 ─────────────────────────────────────────────────── */

const Phase2: React.FC<{
  plan: CoursePlan;
  canPlan: boolean;
  isRegenerating: boolean;
  onAccept: () => Promise<void>;
  onRegenerate: () => Promise<void>;
  onGoToSessions: () => void;
}> = ({ plan, canPlan, isRegenerating, onAccept, onRegenerate, onGoToSessions }) => {
  const isPlanned = !!plan.plannedAt;
  const data = plan.coursePlan;
  const hasPlan = !!data;

  // Bloqueada hasta validar.
  if (!canPlan) {
    return (
      <section className="prog-phase prog-phase--locked">
        <PhaseHeader
          phase={2}
          title="Planificación"
          sub="Cuándo y cómo se reparte el curso"
          chip={{ label: 'Bloqueada', tone: 'muted' }}
        />
        <div className="prog-locked-line">
          <AlertCircle size={14} />
          Valida la programación para desbloquear el reparto en sesiones.
        </div>
      </section>
    );
  }

  // Validada pero las fechas todavía no se generaron (o se están generando).
  if (!hasPlan) {
    return (
      <section className="prog-phase">
        <PhaseHeader
          phase={2}
          title="Planificación"
          sub="Cuándo y cómo se reparte el curso"
          chip={{ label: 'Generando', tone: 'warning' }}
        />
        <div className="prog-generating-line">
          <Loader2 size={14} className="animate-spin" />
          <span>
            Calculando reparto de sesiones, exámenes y repasos según tu calendario académico.
            Esto suele tardar 20-40 segundos. Actualizamos automáticamente cuando esté.
          </span>
        </div>
        <div className="prog-phase-footer">
          <button
            type="button"
            className="prog-phase-action"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {isRegenerating ? 'Generando…' : 'Reintentar generación'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="prog-phase">
      <PhaseHeader
        phase={2}
        title="Planificación"
        sub="Cuándo y cómo se reparte el curso"
        chip={isPlanned
          ? { label: 'Confirmada', tone: 'success' }
          : { label: 'Por confirmar', tone: 'warning' }}
        action={
          <button type="button" className="prog-phase-action" onClick={onRegenerate} disabled={isRegenerating}>
            {isRegenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Replanificar
          </button>
        }
      />

      <PlanSummary data={data} />

      <div className="prog-phase-footer">
        {!isPlanned ? (
          <Button onClick={onAccept} className="prog-cta">
            <CalendarIcon size={14} /> Confirmar planificación
          </Button>
        ) : (
          <Button onClick={onGoToSessions} className="prog-cta">
            <ClipboardList size={14} /> Ver sesiones del curso
          </Button>
        )}
      </div>
    </section>
  );
};

const PlanSummary: React.FC<{ data: any }> = ({ data }) => {
  const totalSessions = data.total_sessions || 0;
  const totalUnits = (data.trimesters || []).reduce(
    (acc: number, tri: any) => acc + (tri.units || []).length, 0,
  );
  const totalExams = (data.trimesters || []).reduce(
    (acc: number, tri: any) => acc + (tri.units || []).filter((u: any) => u.exam).length + (tri.final_exam ? 1 : 0), 0,
  );

  return (
    <div className="prog-plan-summary">
      <div className="prog-plan-stats">
        <Stat label="Sesiones" value={totalSessions} />
        <Stat label="Unidades" value={totalUnits} />
        <Stat label="Exámenes" value={totalExams} />
        <Stat label="Trimestres" value={(data.trimesters || []).length} />
      </div>

      <ol className="prog-plan-trimesters">
        {(data.trimesters || []).map((tri: any) => (
          <li key={tri.number} className="prog-plan-tri">
            <header>
              <span className="prog-plan-tri-num">Trimestre {tri.number}</span>
              <span className="prog-plan-tri-range">
                {tri.start_date} → {tri.end_date}
              </span>
            </header>
            <ul className="prog-plan-units">
              {(tri.units || []).map((u: any, ui: number) => (
                <li key={ui}>
                  <span className="prog-plan-unit-name">{u.name}</span>
                  <span className="prog-plan-unit-meta">
                    {(u.topics || []).reduce((acc: number, t: any) => acc + (t.sessions_needed || 0), 0)} sesiones
                    {u.exam && ' · examen'}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
};

/* ─── Helpers ─────────────────────────────────────────────────── */

const Stat: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div className="prog-stat">
    <span className="prog-stat-value">{value}</span>
    <span className="prog-stat-label">{label}</span>
  </div>
);

const PhaseHeader: React.FC<{
  phase: 1 | 2;
  title: string;
  sub: string;
  chip?: { label: string; tone: 'success' | 'warning' | 'muted' };
  action?: React.ReactNode;
}> = ({ phase, title, sub, chip, action }) => (
  <header className="prog-phase-header">
    <div>
      <span className="prog-phase-eyebrow">Fase {phase}</span>
      <h2 className="prog-phase-title">{title}</h2>
      <span className="prog-phase-sub">{sub}</span>
    </div>
    <div className="prog-phase-meta">
      {chip && <span className={`prog-chip prog-chip--${chip.tone}`}>{chip.label}</span>}
      {action}
    </div>
  </header>
);

export default ProgramacionView;
