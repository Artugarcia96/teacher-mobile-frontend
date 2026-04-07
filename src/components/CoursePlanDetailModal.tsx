import { useState, useEffect, useMemo } from 'react';
import {
  IonModal, IonButton, IonSpinner, IonCheckbox,
  IonSegment, IonSegmentButton, IonLabel, IonProgressBar,
} from '@ionic/react';
import { useCoursePlanStore } from '../store/coursePlanStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { useClassesStore } from '../store/classesStore';
import { useTopicsStore } from '../store/topicsStore';
import { batch } from '../services/api';
import type { PlanTrimester } from '../types';
import type { PeriodMode } from '../utils/periodConfig';
import { PERIOD_COLORS, getPeriodFullLabel, getPeriodLabel, getPeriodNumbers } from '../utils/periodConfig';
import './CoursePlanDetailModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  subjectName: string;
  periodMode?: PeriodMode | null;
  onAccept?: () => void;
}

interface TopicEdit {
  lock_trimester?: number;
  sessions_delta?: number;
}

const SESSION_LABELS: Record<string, string> = {
  introduction: 'Intro',
  theory: 'Teoría',
  theory_practice: 'T+Práct',
  practice: 'Práctica',
  deepening: 'Profund.',
  review: 'Repaso',
};

const SESSION_COLORS: Record<string, string> = {
  introduction: '#059669',
  theory: '#2563EB',
  theory_practice: '#7C3AED',
  practice: '#D97706',
  deepening: '#0891B2',
  review: '#64748B',
};

/** Format ISO date (YYYY-MM-DD) as DD-MM for Spanish locale */
const fmtDate = (d: string) => { const p = d.slice(5).split('-'); return `${p[1]}-${p[0]}`; };

const MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
/** Format ISO date as "1 sep" for human-friendly display */
const fmtDateLong = (d: string) => {
  const [,m,day] = d.split('-');
  return `${parseInt(day)} ${MONTH_SHORT[parseInt(m) - 1]}`;
};

const CoursePlanDetailModal: React.FC<Props> = ({
  isOpen, onClose, planId, subjectName, periodMode, onAccept,
}) => {
  const fetchPlan = useCoursePlanStore((s) => s.fetchPlan);
  const fetchProgress = useCoursePlanStore((s) => s.fetchProgress);
  const acceptPlan = useCoursePlanStore((s) => s.acceptPlan);
  const regeneratePlan = useCoursePlanStore((s) => s.regeneratePlan);
  const generateContent = useCoursePlanStore((s) => s.generateContent);
  const currentPlan = useCoursePlanStore((s) => s.currentPlan);
  const progress = useCoursePlanStore((s) => s.progress);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [activeTrimester, setActiveTrimester] = useState('');
  const [expandedUnit, setExpandedUnit] = useState<number | null>(0);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [view, setView] = useState<'timeline' | 'progress'>('timeline');
  const [edits, setEdits] = useState<Record<string, TopicEdit>>({});
  const [showAcceptPreview, setShowAcceptPreview] = useState(false);
  const [examToggles, setExamToggles] = useState<Record<string, boolean>>({});
  const [editingField, setEditingField] = useState<string | null>(null);
  const [generateOnAccept, setGenerateOnAccept] = useState(true);
  const [extraExams, setExtraExams] = useState<{ name: string; date: string }[]>([]);
  const planAccepted = progress && progress.totalTopics > 0;

  useEffect(() => {
    if (isOpen && planId) {
      setLoading(true);
      setEdits({});
      setExpandedSession(null);
      setShowAcceptPreview(false);
      setView('timeline');
      fetchPlan(planId).then((p) => {
        if (p.coursePlan?.trimesters?.length) {
          setActiveTrimester(String(p.coursePlan.trimesters[0].number));
        }
        if (p.status === 'completed') {
          return fetchProgress(planId).catch(() => null);
        }
      }).finally(() => setLoading(false));
    }
  }, [isOpen, planId]);

  const plan = currentPlan;
  const coursePlan = plan?.coursePlan;
  const hasEdits = Object.keys(edits).length > 0;
  const periods = getPeriodNumbers(periodMode);

  // Accept summary
  const acceptSummary = useMemo(() => {
    if (!coursePlan) return null;
    let totalTopics = 0, totalSessions = 0;
    const exams: { key: string; name: string; date: string }[] = [];
    for (const tri of coursePlan.trimesters) {
      for (const unit of tri.units) {
        for (const topic of unit.topics) {
          if (topic.sessions_needed > 0) { totalTopics++; totalSessions += topic.sessions_needed; }
        }
        if (unit.exam?.date) {
          exams.push({ key: unit.name, name: unit.exam.name || `Examen: ${unit.name}`, date: unit.exam.date });
        }
      }
      // Trimester final exam
      const finalExam = (tri as any).final_exam;
      if (finalExam?.date) {
        exams.push({ key: `final-${tri.number}`, name: finalExam.name || `Examen final — Trimestre ${tri.number}`, date: finalExam.date });
      }
    }
    return { totalTopics, totalSessions, exams };
  }, [coursePlan]);

  // Monthly distribution overview
  const monthOverview = useMemo(() => {
    if (!coursePlan) return [];
    const months: Record<string, { sessions: number; exams: number }> = {};
    for (const tri of coursePlan.trimesters) {
      for (const unit of tri.units) {
        for (const topic of unit.topics) {
          for (const d of topic.scheduled_dates || []) {
            const mk = d.slice(0, 7);
            if (!months[mk]) months[mk] = { sessions: 0, exams: 0 };
            months[mk].sessions++;
          }
        }
        if (unit.exam?.date) {
          const mk = unit.exam.date.slice(0, 7);
          if (!months[mk]) months[mk] = { sessions: 0, exams: 0 };
          months[mk].exams++;
        }
      }
      if ((tri as any).final_exam?.date) {
        const mk = (tri as any).final_exam.date.slice(0, 7);
        if (!months[mk]) months[mk] = { sessions: 0, exams: 0 };
        months[mk].exams++;
      }
    }
    const entries = Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
    const maxSes = Math.max(...entries.map(([, d]) => d.sessions), 1);
    return entries.map(([key, data]) => ({
      label: MONTH_SHORT[parseInt(key.slice(5)) - 1],
      ...data,
      pct: data.sessions / maxSes,
    }));
  }, [coursePlan]);

  useEffect(() => {
    if (showAcceptPreview && acceptSummary) {
      const t: Record<string, boolean> = {};
      acceptSummary.exams.forEach((e) => { t[e.key] = true; });
      setExamToggles(t);
      setExtraExams([]);
    }
  }, [showAcceptPreview]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const skipUnits = Object.entries(examToggles).filter(([_, on]) => !on).map(([key]) => key);
      const validExtras = extraExams.filter((e) => e.name.trim() && e.date);
      await acceptPlan(planId, {
        ...(skipUnits.length > 0 ? { skip_exam_units: skipUnits } : {}),
        ...(validExtras.length > 0 ? { extra_exams: validExtras } : {}),
      });
      onAccept?.();

      // Chain content generation if toggle is on
      if (generateOnAccept) {
        try {
          const result = await generateContent(planId);
          const planClassId = plan?.classId;
          addBackgroundTask({
            type: 'textbook',
            label: `Material: ${subjectName}`,
            description: 'Generando contenido teórico y PDFs para cada tema del curso.',
            batchJobId: result.batch_job_id,
            expectedResultUrl: '',
            onComplete: () => {
              if (planClassId) {
                useClassesStore.getState().fetchClassSubjects(planClassId);
                useTopicsStore.getState().fetchTopicsForClass(planClassId);
              }
            },
            execute: async () => {
              const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
              let interval = 5000;
              while (true) {
                await sleep(interval);
                const res = await batch.getJobProgress(result.batch_job_id);
                if (res.data.status === 'completed') break;
                if (res.data.status === 'failed' || res.data.status === 'cancelled')
                  throw new Error('Error generando material');
                interval = Math.min(interval + 2000, 15000);
              }
              return '';
            },
          });
        } catch { /* content generation failed — plan is still accepted */ }
      }

      onClose();
    } catch { /* */ } finally { setAccepting(false); }
  };

  const handleRegenerate = async () => {
    if (!plan) return;
    const annotations = Object.entries(edits).map(([key, edit]) => {
      const [ui, ti] = key.split('-').map(Number);
      const a: any = { unit_index: ui, topic_index: ti };
      if (edit.lock_trimester) a.lock_trimester = edit.lock_trimester;
      if (edit.sessions_delta) {
        const orig = findOrigSessions(ui, ti);
        if (orig > 0) a.time_weight = Math.max(0.5, (orig + edit.sessions_delta) / orig);
      }
      return a;
    });
    try {
      const result = await regeneratePlan(planId, {
        topic_annotations: annotations,
        priority_notes: plan.priorityNotes || undefined,
        exam_strategy: plan.examStrategy || undefined,
        buffer_sessions_per_trimester: plan.bufferSessionsPerTrimester,
      });
      addBackgroundTask({
        type: 'textbook', label: `Regenerar: ${subjectName}`,
        description: 'Regenerando planificación.', batchJobId: result.batchJobId, expectedResultUrl: '',
        execute: async () => {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          let interval = 4000;
          while (true) {
            await sleep(interval);
            const res = await batch.getJobProgress(result.batchJobId);
            if (res.data.status === 'completed') break;
            if (res.data.status === 'failed' || res.data.status === 'cancelled') throw new Error('Error');
            interval = Math.min(interval + 1000, 10000);
          }
          return '';
        },
      });
      onClose();
    } catch { /* */ }
  };



  const findOrigSessions = (ui: number, ti: number): number => {
    if (!coursePlan) return 1;
    for (const tri of coursePlan.trimesters)
      for (const u of tri.units)
        for (const t of u.topics)
          if (t.unit_index === ui && t.topic_index === ti) return t.sessions_needed || 1;
    return 1;
  };

  const updateEdit = (ui: number, ti: number, update: Partial<TopicEdit>) => {
    const key = `${ui}-${ti}`;
    setEdits((prev) => {
      const next = { ...(prev[key] || {}), ...update };
      if (!next.lock_trimester && !next.sessions_delta) { const { [key]: _, ...rest } = prev; return rest; }
      return { ...prev, [key]: next };
    });
  };

  const getEdit = (ui: number, ti: number): TopicEdit => edits[`${ui}-${ti}`] || {};
  const activeTri = coursePlan?.trimesters?.find((t) => String(t.number) === activeTrimester);

  const countSessions = (tri: PlanTrimester): number => {
    let c = 0;
    for (const u of tri.units || []) {
      for (const t of u.topics || []) c += t.sessions_needed || 0;
      if (u.review_session?.date) c++;
      if (u.exam?.date) c++;
    }
    c += (tri.buffer_sessions || []).length;
    return c;
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} className="cpd-modal">
      <div className="cpd">
        {loading ? (
          <div className="cpd__loading"><IonSpinner name="crescent" /><span>Cargando...</span></div>
        ) : !coursePlan ? (
          <div className="cpd__empty"><p>La planificación aún no está lista.</p></div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="cpd__header">
              <h2 className="cpd__title">{coursePlan.title || `Planificación de ${subjectName}`}</h2>
              <div className="cpd__pills">
                <span className="cpd__pill">{coursePlan.total_sessions} sesiones</span>
                {(coursePlan.sessions_per_week ?? 0) > 0 && <span className="cpd__pill">{coursePlan.sessions_per_week}/semana</span>}
                {(plan?.stats?.review_score ?? 0) > 0 && (
                  <span className="cpd__pill cpd__pill--accent">{plan!.stats!.review_score}/10</span>
                )}
              </div>
            </div>


            {/* ── View toggle (only show progress tab if plan is accepted) ── */}
            {planAccepted ? (
              <IonSegment value={view} onIonChange={(e) => setView(e.detail.value as any)} className="cpd__tabs">
                <IonSegmentButton value="timeline"><IonLabel>Planificación</IonLabel></IonSegmentButton>
                <IonSegmentButton value="progress"><IonLabel>Progreso</IonLabel></IonSegmentButton>
              </IonSegment>
            ) : null}

            {/* ── Timeline ── */}
            {view === 'timeline' && (
              <div className="cpd__scroll">
                {/* Trimester selector */}
                <div className="cpd__tri-row">
                  {coursePlan.trimesters.map((tri) => {
                    const active = activeTrimester === String(tri.number);
                    return (
                      <button key={tri.number}
                        className={`cpd__tri ${active ? 'cpd__tri--active' : ''}`}
                        style={{ '--c': PERIOD_COLORS[tri.number] } as any}
                        onClick={() => { setActiveTrimester(String(tri.number)); setExpandedUnit(0); setExpandedSession(null); }}>
                        <strong>{getPeriodFullLabel(periodMode, tri.number)}</strong>
                        <span>{countSessions(tri)} ses.</span>
                      </button>
                    );
                  })}
                </div>

                {activeTri && <p className="cpd__date-range">{fmtDateLong(activeTri.start_date)} → {fmtDateLong(activeTri.end_date)}</p>}

                <p className="cpd__hint">Toca una sesión para ver y editar los títulos, puntos clave y contenidos. Usa los controles de cada tema para ajustar sesiones o moverlo de trimestre.</p>

                {/* ── Month overview strip ── */}
                {monthOverview.length > 0 && (
                  <>
                    <span className="cpd__months-title">Sesiones por mes</span>
                    <div className="cpd__months">
                      {monthOverview.map((m) => (
                        <div key={m.label} className="cpd__month">
                          <span className="cpd__month-label">{m.label}</span>
                          <div className="cpd__month-bar-bg">
                            <div className="cpd__month-bar" style={{ width: `${Math.max(Math.round(m.pct * 100), 20)}%` }}>
                              <span>{m.sessions}</span>
                            </div>
                          </div>
                          {m.exams > 0 && <span className="cpd__month-exam">{m.exams} ex.</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ── Units ── */}
                {(activeTri?.units || []).map((unit, uidx) => (
                  <div key={uidx} className="cpd__unit">
                    <div className="cpd__unit-head" onClick={() => setExpandedUnit(expandedUnit === uidx ? null : uidx)}>
                      <span className="cpd__unit-dot" style={{ background: PERIOD_COLORS[parseInt(activeTrimester)] }} />
                      <span className="cpd__unit-title">{unit.name}</span>
                      <span className="cpd__unit-toggle">{expandedUnit === uidx ? '▴' : '▾'}</span>
                    </div>

                    {expandedUnit === uidx && (
                      <div className="cpd__unit-content">
                        {unit.topics.map((topic, tidx) => {
                          const edit = getEdit(topic.unit_index, topic.topic_index);
                          const count = topic.sessions_needed + (edit.sessions_delta || 0);
                          const moved = edit.lock_trimester;
                          const isMovedAway = moved !== undefined && moved !== parseInt(activeTrimester);

                          return (
                            <div key={tidx} className={`cpd__topic ${isMovedAway ? 'cpd__topic--moved' : ''}`}>
                              {/* Topic name + count */}
                              <div className="cpd__topic-row">
                                <span className="cpd__topic-name">{topic.name}</span>
                                <span className={`cpd__topic-num ${edit.sessions_delta ? 'cpd__topic-num--edited' : ''}`}>{count} ses.</span>
                              </div>

                              {/* Compact edit bar */}
                              <div className="cpd__topic-tools">
                                <div className="cpd__stepper">
                                  <button disabled={count <= 1} onClick={() => updateEdit(topic.unit_index, topic.topic_index, { sessions_delta: (edit.sessions_delta || 0) - 1 })}>−</button>
                                  <span>{count}</span>
                                  <button onClick={() => updateEdit(topic.unit_index, topic.topic_index, { sessions_delta: (edit.sessions_delta || 0) + 1 })}>+</button>
                                </div>
                                <div className="cpd__tri-btns">
                                  {periods.map((p) => (
                                    <button key={p}
                                      className={`cpd__tri-btn ${(moved === p || (!moved && p === parseInt(activeTrimester))) ? 'cpd__tri-btn--on' : ''}`}
                                      style={(moved === p || (!moved && p === parseInt(activeTrimester))) ? { background: PERIOD_COLORS[p], borderColor: PERIOD_COLORS[p], color: '#fff' } : undefined}
                                      onClick={() => updateEdit(topic.unit_index, topic.topic_index, { lock_trimester: p === parseInt(activeTrimester) ? undefined : p })}>
                                      {getPeriodLabel(periodMode, p)}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Moved notice — replaces sessions when topic is moved */}
                              {isMovedAway ? (
                                <div className="cpd__moved-notice">
                                  <span>Se moverá a {getPeriodFullLabel(periodMode, moved!)} al regenerar.</span>
                                  <button onClick={() => updateEdit(topic.unit_index, topic.topic_index, { lock_trimester: undefined })}>Deshacer</button>
                                </div>
                              ) : (
                                <>
                                  {/* Sessions */}
                                  {topic.sessions?.length ? (
                                    <div className="cpd__sessions">
                                      {topic.sessions.map((s) => {
                                        const sKey = `${topic.unit_index}-${topic.topic_index}-${s.index}`;
                                        const open = expandedSession === sKey;
                                        return (
                                          <div key={s.index} className={`cpd__s ${open ? 'cpd__s--open' : ''}`}>
                                            <div className="cpd__s-row" onClick={() => setExpandedSession(open ? null : sKey)}>
                                              <span className="cpd__s-type" style={{ background: SESSION_COLORS[s.session_type] }}>
                                                {SESSION_LABELS[s.session_type]}
                                              </span>
                                              <span className="cpd__s-title">{s.title}</span>
                                              <span className="cpd__s-date">{s.date ? fmtDate(s.date) : ''}</span>
                                            </div>
                                            {open && (
                                              <div className="cpd__s-detail" onClick={(e) => e.stopPropagation()}>
                                                <div className="cpd__s-field">
                                                  <span className="cpd__s-field-label">Título</span>
                                                  <input className="cpd__s-field-input"
                                                    value={s.title}
                                                    onChange={(e) => { s.title = e.target.value; setEditingField(`${sKey}-t-${Date.now()}`); }}
                                                  />
                                                </div>
                                                <div className="cpd__s-field">
                                                  <span className="cpd__s-field-label">Enfoque de la sesión</span>
                                                  <input className="cpd__s-field-input"
                                                    value={s.focus || ''}
                                                    placeholder="Describe el objetivo de esta sesión..."
                                                    onChange={(e) => { s.focus = e.target.value; setEditingField(`${sKey}-f-${Date.now()}`); }}
                                                  />
                                                </div>
                                                <div className="cpd__s-field">
                                                  <span className="cpd__s-field-label">Puntos clave</span>
                                                  {(s.key_points || []).map((kp, ki) => (
                                                    <div key={ki} className="cpd__s-kp-row">
                                                      <span className="cpd__s-kp-bullet">•</span>
                                                      <input className="cpd__s-field-input"
                                                        value={kp}
                                                        onChange={(e) => { s.key_points[ki] = e.target.value; setEditingField(`${sKey}-kp-${ki}-${Date.now()}`); }}
                                                      />
                                                      <button className="cpd__s-kp-remove" onClick={() => {
                                                        s.key_points.splice(ki, 1);
                                                        setEditingField(`${sKey}-rm-${Date.now()}`);
                                                      }}>×</button>
                                                    </div>
                                                  ))}
                                                  <button className="cpd__s-add-kp" onClick={() => {
                                                    if (!s.key_points) s.key_points = [];
                                                    s.key_points.push('');
                                                    setEditingField(`${sKey}-add-${Date.now()}`);
                                                  }}>+ Añadir punto clave</button>
                                                </div>
                                                {s.subtopics?.length > 0 && (
                                                  <div className="cpd__s-tags">
                                                    {s.subtopics.map((st, si) => <span key={si} className="cpd__s-tag">{st}</span>)}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="cpd__dates-flat">
                                      {topic.scheduled_dates.slice(0, 6).map((d, i) => (
                                        <span key={i} className="cpd__date-chip">{fmtDate(d)}</span>
                                      ))}
                                      {topic.scheduled_dates.length > 6 && <span className="cpd__date-chip cpd__date-chip--more">+{topic.scheduled_dates.length - 6}</span>}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}

                        {/* Events: exercise delivery → review → exam */}
                        {(unit as any).exercise_delivery?.date && (
                          <div className="cpd__ev cpd__ev--exercise">
                            <span>Entrega de ejercicios</span><span>{fmtDate((unit as any).exercise_delivery.date)}</span>
                          </div>
                        )}
                        {unit.review_session?.date && (
                          <div className="cpd__ev cpd__ev--review">
                            <span>Repaso</span><span>{fmtDate(unit.review_session.date)}</span>
                          </div>
                        )}
                        {unit.exam?.date && (
                          <div className="cpd__ev cpd__ev--exam">
                            <span>{unit.exam.name || 'Examen'}</span><span>{fmtDate(unit.exam.date)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Trimester final exam */}
                {(activeTri as any)?.final_review?.date && (
                  <div className="cpd__ev cpd__ev--review">
                    <span>Repaso final del trimestre</span>
                    <span>{fmtDate((activeTri as any).final_review.date)}</span>
                  </div>
                )}
                {(activeTri as any)?.final_exam?.date && (
                  <div className="cpd__ev cpd__ev--exam">
                    <span>{(activeTri as any).final_exam.name || 'Examen final'}</span>
                    <span>{fmtDate((activeTri as any).final_exam.date)}</span>
                  </div>
                )}

                {(activeTri?.buffer_sessions || []).length > 0 && (
                  <div className="cpd__ev cpd__ev--buffer">
                    <span>Margen</span>
                    <span>{activeTri!.buffer_sessions!.map((d) => fmtDate(d)).join(', ')}</span>
                  </div>
                )}

              </div>
            )}

            {/* ── Regen bar (sticky at bottom when edits exist) ── */}
            {view === 'timeline' && hasEdits && !showAcceptPreview && (
              <div className="cpd__regen">
                <span>{Object.keys(edits).length} cambio{Object.keys(edits).length !== 1 ? 's' : ''}</span>
                <button onClick={handleRegenerate}>Regenerar plan</button>
              </div>
            )}

            {/* ── Progress (redesigned topic timeline) ── */}
            {view === 'progress' && progress && planAccepted && (
              <div className="cpd__scroll">
                {/* Summary strip */}
                <div className="cpd__prog-summary">
                  <div className="cpd__prog-ring">
                    <svg viewBox="0 0 36 36" className="cpd__prog-svg">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(15,23,42,0.06)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--ion-color-primary)" strokeWidth="3"
                        strokeDasharray={`${(progress.totalTopics > 0 ? progress.taughtTopics / progress.totalTopics : 0) * 97.4} 97.4`}
                        strokeLinecap="round" transform="rotate(-90 18 18)" />
                    </svg>
                    <span className="cpd__prog-ring-num">{progress.totalTopics > 0 ? Math.round((progress.taughtTopics / progress.totalTopics) * 100) : 0}%</span>
                  </div>
                  <div className="cpd__prog-stats">
                    <span className="cpd__prog-stats-main">{progress.taughtTopics} de {progress.totalTopics} temas</span>
                    <span className={`cpd__prog-stats-pace ${progress.sessionsAheadBehind >= 0 ? 'cpd__prog-stats-pace--ahead' : 'cpd__prog-stats-pace--behind'}`}>
                      {progress.sessionsAheadBehind > 0 ? '+' : ''}{progress.sessionsAheadBehind} {progress.sessionsAheadBehind >= 0 ? 'sesiones adelante' : 'sesiones atrás'}
                    </span>
                  </div>
                </div>

                {/* Topic timeline by trimester */}
                {coursePlan && (() => {
                  const upcomingNames = new Set(progress.upcoming.map((u) => u.name));
                  return coursePlan.trimesters.map((tri) => {
                    const triProg = progress.trimesterProgress.find((tp) => tp.trimester === tri.number);
                    const allTopics = tri.units.flatMap((u) => u.topics);
                    return (
                      <div key={tri.number} className="cpd__ptri">
                        <div className="cpd__ptri-head">
                          <span className="cpd__ptri-dot" style={{ background: PERIOD_COLORS[tri.number] }} />
                          <span className="cpd__ptri-label">{getPeriodFullLabel(periodMode, tri.number)}</span>
                          <span className="cpd__ptri-range">{fmtDateLong(tri.start_date)} → {fmtDateLong(tri.end_date)}</span>
                          {triProg && <span className="cpd__ptri-pct" style={{ color: PERIOD_COLORS[tri.number] }}>{triProg.pct}%</span>}
                        </div>
                        <div className="cpd__ptri-line">
                          {allTopics.map((topic) => {
                            const isCurrent = topic.name === progress.currentTopic;
                            const isUpcoming = upcomingNames.has(topic.name);
                            const status = isCurrent ? 'current' : isUpcoming ? 'upcoming' : 'taught';
                            const dates = topic.scheduled_dates || [];
                            const dateStr = dates.length > 0
                              ? dates.length === 1 ? fmtDate(dates[0]) : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`
                              : '';
                            return (
                              <div key={`${topic.unit_index}-${topic.topic_index}`} className={`cpd__ptopic cpd__ptopic--${status}`}>
                                <span className="cpd__ptopic-icon">
                                  {status === 'taught' ? '✓' : status === 'current' ? '▶' : '○'}
                                </span>
                                <span className="cpd__ptopic-name">{topic.name}</span>
                                <span className="cpd__ptopic-meta">
                                  {topic.sessions_needed} ses.{dateStr ? ` · ${dateStr}` : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* ── Actions ── */}
            {plan?.status === 'completed' && !planAccepted && !showAcceptPreview && (
              <div className="cpd__actions">
                <button className="cpd__cta" onClick={() => setShowAcceptPreview(true)} disabled={hasEdits}>
                  Revisar y aceptar
                </button>
              </div>
            )}

            {showAcceptPreview && acceptSummary && (
              <div className="cpd__scroll">
                <div className="cpd__accept">
                  <h3>Resumen</h3>
                  <div className="cpd__accept-nums">
                    <div><strong>{acceptSummary.totalTopics}</strong><span>temas</span></div>
                    <div><strong>{acceptSummary.totalSessions}</strong><span>sesiones</span></div>
                    <div><strong>{acceptSummary.exams.filter(e => examToggles[e.key] !== false).length + extraExams.filter(e => e.name.trim() && e.date).length}</strong><span>exámenes</span></div>
                  </div>

                  {/* Content generation toggle — prominent, above exams */}
                  <label className="cpd__accept-content-toggle cpd__accept-content-toggle--prominent">
                    <IonCheckbox checked={generateOnAccept}
                      onIonChange={() => setGenerateOnAccept(p => !p)} />
                    <div>
                      <span className="cpd__accept-content-title">Generar material para cada tema</span>
                      <span className="cpd__accept-content-desc">
                        Se creará contenido teórico con PDF para cada tema automáticamente (~15 min).
                      </span>
                    </div>
                  </label>

                  {acceptSummary.exams.length > 0 && (
                    <div className="cpd__accept-exams">
                      <span className="cpd__accept-label">EXÁMENES DEL PLAN</span>
                      {acceptSummary.exams.map((exam) => (
                        <label key={exam.key} className="cpd__accept-exam">
                          <IonCheckbox checked={examToggles[exam.key] !== false}
                            onIonChange={() => setExamToggles(p => ({...p, [exam.key]: !(p[exam.key] ?? true)}))} />
                          <span>{exam.name}</span>
                          <span className="cpd__accept-exam-d">{fmtDate(exam.date)}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Extra exams added by the teacher */}
                  <div className="cpd__accept-extras">
                    {extraExams.length > 0 && (
                      <>
                        <span className="cpd__accept-label">EXÁMENES ADICIONALES</span>
                        {extraExams.map((ex, i) => (
                          <div key={i} className="cpd__extra-row">
                            <input className="cpd__extra-input cpd__extra-input--name"
                              placeholder="Nombre del examen"
                              value={ex.name}
                              onChange={(e) => setExtraExams((prev) => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                            />
                            <input className="cpd__extra-input cpd__extra-input--date"
                              type="date"
                              value={ex.date}
                              onChange={(e) => setExtraExams((prev) => prev.map((x, j) => j === i ? { ...x, date: e.target.value } : x))}
                            />
                            <button className="cpd__extra-remove" onClick={() => setExtraExams((prev) => prev.filter((_, j) => j !== i))}>×</button>
                          </div>
                        ))}
                      </>
                    )}
                    <button className="cpd__extra-add-btn" onClick={() => setExtraExams((prev) => [...prev, { name: '', date: '' }])}>
                      + Añadir examen propio
                    </button>
                  </div>

                  <div className="cpd__accept-btns">
                    <button className="cpd__accept-back" onClick={() => setShowAcceptPreview(false)}>Volver</button>
                    <button className="cpd__accept-go" onClick={handleAccept} disabled={accepting}>
                      {accepting ? 'Creando...' : generateOnAccept ? 'Aceptar y generar material' : 'Aceptar planificación'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </IonModal>
  );
};

export default CoursePlanDetailModal;
