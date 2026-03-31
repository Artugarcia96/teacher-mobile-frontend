import { useState, useEffect, useMemo, useRef } from 'react';
import {
  IonModal, IonButton, IonSpinner, IonCheckbox,
  IonSegment, IonSegmentButton, IonLabel, IonProgressBar,
} from '@ionic/react';
import { useCoursePlanStore } from '../store/coursePlanStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { batch } from '../services/api';
import { useIsDesktop } from '../hooks/useIsDesktop';
import type { PlanTrimester, PlanSession } from '../types';
import type { PeriodMode } from '../utils/periodConfig';
import { PERIOD_COLORS, getPeriodFullLabel, getPeriodLabel, getPeriodNumbers } from '../utils/periodConfig';
import PlanProgressChart from './charts/PlanProgressChart';
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
  const isDesktop = useIsDesktop();

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
  const editInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (showAcceptPreview && acceptSummary) {
      const t: Record<string, boolean> = {};
      acceptSummary.exams.forEach((e) => { t[e.key] = true; });
      setExamToggles(t);
    }
  }, [showAcceptPreview]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const skipUnits = Object.entries(examToggles).filter(([_, on]) => !on).map(([key]) => key);
      await acceptPlan(planId, skipUnits.length > 0 ? { skip_exam_units: skipUnits } : undefined);
      onAccept?.();

      // Chain content generation if toggle is on
      if (generateOnAccept) {
        try {
          const result = await generateContent(planId);
          addBackgroundTask({
            type: 'textbook',
            label: `Material: ${subjectName}`,
            description: 'Generando contenido teórico y PDFs para cada tema del curso.',
            batchJobId: result.batch_job_id,
            expectedResultUrl: '',
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
                {coursePlan.sessions_per_week > 0 && <span className="cpd__pill">{coursePlan.sessions_per_week}/semana</span>}
                {plan?.stats?.review_score > 0 && (
                  <span className="cpd__pill cpd__pill--accent">{plan.stats.review_score}/10</span>
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

                {activeTri && <p className="cpd__date-range">{activeTri.start_date} → {activeTri.end_date}</p>}

                <p className="cpd__hint">Toca una sesión para ver y editar los títulos, puntos clave y contenidos. Usa los controles de cada tema para ajustar sesiones o moverlo de trimestre.</p>

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

                          return (
                            <div key={tidx} className={`cpd__topic ${moved ? 'cpd__topic--moved' : ''}`}>
                              {/* Topic name + count */}
                              <div className="cpd__topic-row">
                                <span className="cpd__topic-name">
                                  {topic.name}
                                  {moved && moved !== parseInt(activeTrimester) && (
                                    <span className="cpd__topic-badge-moved">→ {getPeriodLabel(periodMode, moved)}</span>
                                  )}
                                </span>
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

                              {/* Sessions */}
                              {topic.sessions?.length ? (
                                <div className="cpd__sessions">
                                  {topic.sessions.map((s) => {
                                    const sKey = `${topic.unit_index}-${topic.topic_index}-${s.index}`;
                                    const open = expandedSession === sKey;
                                    const isEditingTitle = editingField === `${sKey}-title`;
                                    const isEditingKp = editingField?.startsWith(`${sKey}-kp-`);
                                    return (
                                      <div key={s.index} className={`cpd__s ${open ? 'cpd__s--open' : ''}`}>
                                        <div className="cpd__s-row" onClick={() => setExpandedSession(open ? null : sKey)}>
                                          <span className="cpd__s-type" style={{ background: SESSION_COLORS[s.session_type] }}>
                                            {SESSION_LABELS[s.session_type]}
                                          </span>
                                          <span className="cpd__s-title">{s.title}</span>
                                          <span className="cpd__s-date">{s.date?.slice(5)}</span>
                                        </div>
                                        {open && (
                                          <div className="cpd__s-detail" onClick={(e) => e.stopPropagation()}>
                                            {/* Editable title */}
                                            <div className="cpd__s-field">
                                              <span className="cpd__s-field-label">Título</span>
                                              <input className="cpd__s-field-input"
                                                value={s.title}
                                                onChange={(e) => { s.title = e.target.value; setEditingField(`${sKey}-t-${Date.now()}`); }}
                                              />
                                            </div>

                                            {/* Editable focus */}
                                            <div className="cpd__s-field">
                                              <span className="cpd__s-field-label">Enfoque de la sesión</span>
                                              <input className="cpd__s-field-input"
                                                value={s.focus || ''}
                                                placeholder="Describe el objetivo de esta sesión..."
                                                onChange={(e) => { s.focus = e.target.value; setEditingField(`${sKey}-f-${Date.now()}`); }}
                                              />
                                            </div>

                                            {/* Editable key points */}
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
                                    <span key={i} className="cpd__date-chip">{d.slice(5)}</span>
                                  ))}
                                  {topic.scheduled_dates.length > 6 && <span className="cpd__date-chip cpd__date-chip--more">+{topic.scheduled_dates.length - 6}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Events: exercise delivery → review → exam */}
                        {(unit as any).exercise_delivery?.date && (
                          <div className="cpd__ev cpd__ev--exercise">
                            <span>Entrega de ejercicios</span><span>{(unit as any).exercise_delivery.date.slice(5)}</span>
                          </div>
                        )}
                        {unit.review_session?.date && (
                          <div className="cpd__ev cpd__ev--review">
                            <span>Repaso</span><span>{unit.review_session.date.slice(5)}</span>
                          </div>
                        )}
                        {unit.exam?.date && (
                          <div className="cpd__ev cpd__ev--exam">
                            <span>{unit.exam.name || 'Examen'}</span><span>{unit.exam.date.slice(5)}</span>
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
                    <span>{(activeTri as any).final_review.date.slice(5)}</span>
                  </div>
                )}
                {(activeTri as any)?.final_exam?.date && (
                  <div className="cpd__ev cpd__ev--exam">
                    <span>{(activeTri as any).final_exam.name || 'Examen final'}</span>
                    <span>{(activeTri as any).final_exam.date.slice(5)}</span>
                  </div>
                )}

                {(activeTri?.buffer_sessions || []).length > 0 && (
                  <div className="cpd__ev cpd__ev--buffer">
                    <span>Margen</span>
                    <span>{activeTri!.buffer_sessions!.map((d) => d.slice(5)).join(', ')}</span>
                  </div>
                )}

                {/* Regen */}
                {hasEdits && (
                  <div className="cpd__regen">
                    <span>{Object.keys(edits).length} cambio{Object.keys(edits).length !== 1 ? 's' : ''}</span>
                    <button onClick={handleRegenerate}>Regenerar plan</button>
                  </div>
                )}
              </div>
            )}

            {/* ── Progress (only after acceptance) ── */}
            {view === 'progress' && progress && planAccepted && (
              <div className="cpd__scroll">
                <div className="cpd__prog-header">
                  <span>Progreso general</span>
                  <span className="cpd__prog-pct">{progress.totalTopics > 0 ? Math.round((progress.taughtTopics / progress.totalTopics) * 100) : 0}%</span>
                </div>
                <IonProgressBar value={progress.totalTopics > 0 ? progress.taughtTopics / progress.totalTopics : 0} color="primary" className="cpd__prog-ion-bar" />
                <span className="cpd__prog-sub">{progress.taughtTopics} de {progress.totalTopics} temas</span>

                <div className={`cpd__pace ${progress.sessionsAheadBehind > 0 ? 'cpd__pace--ahead' : progress.sessionsAheadBehind < 0 ? 'cpd__pace--behind' : ''}`}>
                  <span className="cpd__pace-num">{progress.sessionsAheadBehind > 0 ? '+' : ''}{progress.sessionsAheadBehind}</span>
                  <span>{progress.sessionsAheadBehind >= 0 ? 'sesiones por delante' : 'sesiones de retraso'}</span>
                </div>

                <PlanProgressChart trimesterProgress={progress.trimesterProgress} periodMode={periodMode} />

                {progress.currentTopic && (
                  <div className="cpd__current">
                    <span className="cpd__current-label">TEMA ACTUAL</span>
                    <span className="cpd__current-name">{progress.currentTopic}</span>
                  </div>
                )}

                {progress.upcoming.length > 0 && (
                  <div className="cpd__upcoming">
                    <span className="cpd__upcoming-title">PRÓXIMOS</span>
                    {progress.upcoming.map((item, i) => (
                      <div key={i} className="cpd__upcoming-row">
                        <span>{item.name}</span>
                        <span className="cpd__upcoming-meta">{getPeriodLabel(periodMode, item.trimester)} · {item.sessions} ses.</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Actions ── */}
            <div className="cpd__actions">
              {plan?.status === 'completed' && !planAccepted && !showAcceptPreview && (
                <button className="cpd__cta" onClick={() => setShowAcceptPreview(true)} disabled={hasEdits}>
                  Revisar y aceptar
                </button>
              )}

              {showAcceptPreview && acceptSummary && (
                <div className="cpd__accept">
                  <h3>Resumen</h3>
                  <div className="cpd__accept-nums">
                    <div><strong>{acceptSummary.totalTopics}</strong><span>temas</span></div>
                    <div><strong>{acceptSummary.totalSessions}</strong><span>sesiones</span></div>
                    <div><strong>{acceptSummary.exams.filter(e => examToggles[e.key] !== false).length}</strong><span>exámenes</span></div>
                  </div>
                  {acceptSummary.exams.length > 0 && (
                    <div className="cpd__accept-exams">
                      <span className="cpd__accept-label">EXÁMENES</span>
                      {acceptSummary.exams.map((exam) => (
                        <label key={exam.key} className="cpd__accept-exam">
                          <IonCheckbox checked={examToggles[exam.key] !== false}
                            onIonChange={() => setExamToggles(p => ({...p, [exam.key]: !(p[exam.key] ?? true)}))} />
                          <span>{exam.name}</span>
                          <span className="cpd__accept-exam-d">{exam.date.slice(5)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {/* Content generation toggle */}
                  <label className="cpd__accept-content-toggle">
                    <IonCheckbox checked={generateOnAccept}
                      onIonChange={() => setGenerateOnAccept(p => !p)} />
                    <div>
                      <span className="cpd__accept-content-title">Generar material para cada tema</span>
                      <span className="cpd__accept-content-desc">
                        Se creara contenido teorico con PDF para cada tema automaticamente (~15 min).
                      </span>
                    </div>
                  </label>

                  <div className="cpd__accept-btns">
                    <button className="cpd__accept-back" onClick={() => setShowAcceptPreview(false)}>Volver</button>
                    <button className="cpd__accept-go" onClick={handleAccept} disabled={accepting}>
                      {accepting ? 'Creando...' : generateOnAccept ? 'Aceptar y generar material' : 'Aceptar planificacion'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </IonModal>
  );
};

export default CoursePlanDetailModal;
