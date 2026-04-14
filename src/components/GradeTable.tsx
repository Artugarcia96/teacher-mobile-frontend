import { useMemo, useState, useCallback, useRef } from 'react';
import { Check, ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import { Student, Exam, Exercise, ExerciseCorrectionResult } from '../types';
import { useCorrectionStore } from '../store/correctionStore';
import { hapticLight } from '../utils/haptics';
import './GradeTable.css';

type ViewMode = 'summary' | 'exams' | 'exercises';

interface ExerciseGroup {
  name: string;
  exercisesByStudent: Map<string, Exercise>;
  firstExerciseId: string;
  maxScore: number;
  weight: number;
}

interface Props {
  students: Student[];
  exams: Exam[];
  exercises?: Exercise[];
  exerciseCorrections?: ExerciseCorrectionResult[];
  examWeightPct?: number;
  onStudentClick: (studentId: string) => void;
  onExamClick: (examId: string) => void;
  onExerciseClick?: (exerciseId: string) => void;
  onGradeEdit?: (examId: string, studentId: string, newGrade: number) => void;
  onExamWeightChange?: (examId: string, weight: number) => void;
  onExerciseWeightChange?: (exerciseId: string, weight: number) => void;
  onCategoryWeightChange?: (examWeightPct: number) => void;
}

function gradeColor(grade: number | null, maxScore: number): string {
  if (grade === null) return '';
  const pct = grade / maxScore;
  if (pct >= 0.6) return 'grade-pass';
  if (pct >= 0.4) return 'grade-borderline';
  return 'grade-fail';
}

function formatGrade(grade: number | null): string {
  if (grade === null) return '—';
  return Number.isInteger(grade) ? String(grade) : grade.toFixed(1);
}

/** Convert raw weights to display percentages (rounded, summing to 100) */
function weightsToPercentages(items: { id: string; weight: number }[]): Record<string, number> {
  if (items.length === 0) return {};
  if (items.length === 1) return { [items[0].id]: 100 };
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total === 0) {
    // Equal distribution
    const each = Math.round(100 / items.length);
    const result: Record<string, number> = {};
    items.forEach((item, idx) => {
      result[item.id] = idx === items.length - 1 ? 100 - each * (items.length - 1) : each;
    });
    return result;
  }
  // Check if weights are already percentages (sum close to 100)
  const isAlreadyPct = Math.abs(total - 100) < 1;
  if (isAlreadyPct) {
    const result: Record<string, number> = {};
    items.forEach(item => { result[item.id] = Math.round(item.weight); });
    return result;
  }
  // Convert from relative weights to percentages
  const result: Record<string, number> = {};
  let assigned = 0;
  items.forEach((item, idx) => {
    if (idx === items.length - 1) {
      result[item.id] = 100 - assigned;
    } else {
      const pct = Math.round((item.weight / total) * 100);
      result[item.id] = pct;
      assigned += pct;
    }
  });
  return result;
}

const GradeTable: React.FC<Props> = ({
  students, exams, exercises = [], exerciseCorrections = [],
  examWeightPct: examWeightPctProp,
  onStudentClick, onExamClick, onExerciseClick, onGradeEdit,
  onExamWeightChange, onExerciseWeightChange, onCategoryWeightChange,
}) => {
  const examCorrections = useCorrectionStore((s) => s.corrections);
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [localWeightExams, setLocalWeightExams] = useState(examWeightPctProp ?? 70);
  const [editingCell, setEditingCell] = useState<{ id: string; studentId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  // Weight editing mode
  const [weightEditMode, setWeightEditMode] = useState<'exam' | 'exercise' | null>(null);
  const [editPcts, setEditPcts] = useState<Record<string, number>>({});
  const [savingWeights, setSavingWeights] = useState(false);

  // Sync local state when prop changes
  const prevPropRef = useRef(examWeightPctProp);
  if (examWeightPctProp !== undefined && examWeightPctProp !== prevPropRef.current) {
    prevPropRef.current = examWeightPctProp;
    setLocalWeightExams(examWeightPctProp);
  }

  const categoryWeightExams = localWeightExams;
  const categoryWeightExercises = 100 - categoryWeightExams;

  // Group exercises by name
  const exerciseGroups = useMemo<ExerciseGroup[]>(() => {
    const groups = new Map<string, ExerciseGroup>();
    for (const ex of exercises) {
      const key = ex.name || ex.id;
      if (!groups.has(key)) {
        groups.set(key, {
          name: key,
          exercisesByStudent: new Map(),
          firstExerciseId: ex.id,
          maxScore: ex.maxScore || 10,
          weight: ex.weight ?? 1,
        });
      }
      const g = groups.get(key)!;
      g.exercisesByStudent.set(ex.studentId, ex);
    }
    return Array.from(groups.values());
  }, [exercises]);

  const hasExams = exams.length > 0;
  const hasExercises = exerciseGroups.length > 0;
  const hasBothCategories = hasExams && hasExercises;

  // Compute display percentages
  const examPcts = useMemo(() =>
    weightsToPercentages(exams.map(e => ({ id: e.id, weight: e.weight ?? 1 }))),
  [exams]);

  const exercisePcts = useMemo(() =>
    weightsToPercentages(exerciseGroups.map(g => ({ id: g.firstExerciseId, weight: g.weight }))),
  [exerciseGroups]);

  // Weight editing helpers
  const editTotal = useMemo(() =>
    Object.values(editPcts).reduce((a, b) => a + b, 0),
  [editPcts]);
  const editIsValid = editTotal === 100;

  const startEditWeights = (mode: 'exam' | 'exercise') => {
    hapticLight();
    setWeightEditMode(mode);
    setEditPcts(mode === 'exam' ? { ...examPcts } : { ...exercisePcts });
  };

  const cancelEditWeights = () => {
    setWeightEditMode(null);
    setEditPcts({});
  };

  const saveWeights = async () => {
    if (!editIsValid || savingWeights) return;
    setSavingWeights(true);
    try {
      for (const [id, pct] of Object.entries(editPcts)) {
        if (weightEditMode === 'exam') {
          await onExamWeightChange?.(id, pct);
        } else {
          await onExerciseWeightChange?.(id, pct);
        }
      }
    } finally {
      setSavingWeights(false);
      setWeightEditMode(null);
      setEditPcts({});
    }
  };

  const updateEditPct = (id: string, value: string) => {
    const num = parseInt(value, 10);
    setEditPcts(prev => ({ ...prev, [id]: isNaN(num) ? 0 : num }));
  };

  // Grade lookups
  const getExamGrade = useCallback((examId: string, studentId: string): number | null => {
    const c = examCorrections.find((c) => c.examId === examId && c.studentId === studentId);
    return c?.grade ?? null;
  }, [examCorrections]);

  const getExerciseGrade = useCallback((group: ExerciseGroup, studentId: string): number | null => {
    const exercise = group.exercisesByStudent.get(studentId);
    if (!exercise) return null;
    const correction = exerciseCorrections.find(c => c.exerciseId === exercise.id);
    return correction?.grade ?? null;
  }, [exerciseCorrections]);

  // Weighted average within exams for a student
  const getExamCategoryAvg = useCallback((studentId: string): number | null => {
    let totalWeight = 0, weightedSum = 0;
    for (const exam of exams) {
      const g = getExamGrade(exam.id, studentId);
      if (g !== null) {
        const w = exam.weight ?? 1;
        weightedSum += ((g / exam.maxScore) * 10) * w;
        totalWeight += w;
      }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }, [exams, getExamGrade]);

  // Weighted average within exercises for a student (normalized to 0-10 scale)
  const getExerciseCategoryAvg = useCallback((studentId: string): number | null => {
    let totalWeight = 0, weightedSum = 0;
    for (const group of exerciseGroups) {
      const g = getExerciseGrade(group, studentId);
      if (g !== null) {
        const w = group.weight;
        weightedSum += ((g / group.maxScore) * 10) * w;
        totalWeight += w;
      }
    }
    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }, [exerciseGroups, getExerciseGrade]);

  // Overall average: category split applied only when both exist
  const getOverallAvg = useCallback((studentId: string): number | null => {
    const examAvg = getExamCategoryAvg(studentId);
    const exAvg = getExerciseCategoryAvg(studentId);

    if (!hasBothCategories) return examAvg ?? exAvg;

    if (examAvg !== null && exAvg !== null) {
      return (examAvg * categoryWeightExams + exAvg * categoryWeightExercises) / 100;
    }
    return examAvg ?? exAvg;
  }, [getExamCategoryAvg, getExerciseCategoryAvg, categoryWeightExams, categoryWeightExercises, hasBothCategories]);

  // Class averages
  const classExamAvg = useMemo(() => {
    const avgs = students.map(s => getExamCategoryAvg(s.id)).filter((v): v is number => v !== null);
    return avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  }, [students, getExamCategoryAvg]);

  const classExerciseAvg = useMemo(() => {
    const avgs = students.map(s => getExerciseCategoryAvg(s.id)).filter((v): v is number => v !== null);
    return avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  }, [students, getExerciseCategoryAvg]);

  const classOverallAvg = useMemo(() => {
    const avgs = students.map(s => getOverallAvg(s.id)).filter((v): v is number => v !== null);
    return avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  }, [students, getOverallAvg]);

  // Sort students by name
  const sortedStudents = useMemo(() =>
    [...students].sort((a, b) => a.name.localeCompare(b.name)),
  [students]);

  if (!hasExams && !hasExercises) return null;

  const isEditingExamWeights = weightEditMode === 'exam';
  const isEditingExerciseWeights = weightEditMode === 'exercise';

  return (
    <div className="gt">
      {/* ── Category weight slider (only when both categories exist) ── */}
      {hasBothCategories && (
        <div className="gt-cat-weights">
          <div className="gt-cat-slider-row">
            <div className="gt-cat-end">
              <span className="gt-dot gt-dot--exam"></span>
              <span className="gt-cat-label">Exámenes</span>
              <span className="gt-cat-pct">{categoryWeightExams}%</span>
            </div>
            <input
              type="range"
              min={0} max={100} step={5}
              value={categoryWeightExams}
              onChange={(e) => {
                const v = Number(e.target.value);
                setLocalWeightExams(v);
              }}
              onMouseUp={() => onCategoryWeightChange?.(localWeightExams)}
              onTouchEnd={() => onCategoryWeightChange?.(localWeightExams)}
              className="gt-cat-slider"
              style={{ background: `linear-gradient(to right, #2563EB ${categoryWeightExams}%, #059669 ${categoryWeightExams}%)` }}
            />
            <div className="gt-cat-end">
              <span className="gt-cat-pct">{categoryWeightExercises}%</span>
              <span className="gt-cat-label">Ejercicios</span>
              <span className="gt-dot gt-dot--exercise"></span>
            </div>
          </div>
        </div>
      )}

      {/* ── View mode tabs ── */}
      <div className="gt-view-tabs">
        <div className="flex rounded-lg bg-muted p-1 gt-segment">
          <button onClick={() => { setViewMode('summary'); setExpandedStudent(null); cancelEditWeights(); }} className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'summary' ? 'bg-background shadow-sm' : ''}`}><span>Resumen</span></button>
          {hasExams && <button onClick={() => { setViewMode('exams'); setExpandedStudent(null); cancelEditWeights(); }} className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'exams' ? 'bg-background shadow-sm' : ''}`}><span>Exámenes</span></button>}
          {hasExercises && <button onClick={() => { setViewMode('exercises'); setExpandedStudent(null); cancelEditWeights(); }} className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'exercises' ? 'bg-background shadow-sm' : ''}`}><span>Ejercicios</span></button>}
        </div>
      </div>

      {/* ── Class average bar ── */}
      <div className="gt-class-avg">
        {classOverallAvg !== null && (
          <div className="gt-class-avg-item">
            <span className="gt-class-avg-label">Media clase</span>
            <span className={`gt-class-avg-value ${gradeColor(classOverallAvg, 10)}`}>
              {classOverallAvg.toFixed(1)}
            </span>
          </div>
        )}
        {hasBothCategories && classExamAvg !== null && (
          <div className="gt-class-avg-item">
            <span className="gt-dot gt-dot--exam"></span>
            <span className="gt-class-avg-label">Ex</span>
            <span className="gt-class-avg-value-sm">{classExamAvg.toFixed(1)}</span>
          </div>
        )}
        {hasBothCategories && classExerciseAvg !== null && (
          <div className="gt-class-avg-item">
            <span className="gt-dot gt-dot--exercise"></span>
            <span className="gt-class-avg-label">Ej</span>
            <span className="gt-class-avg-value-sm">{classExerciseAvg.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* ════════════ SUMMARY VIEW ════════════ */}
      {viewMode === 'summary' && (
        <div className="gt-summary">
          {sortedStudents.map((student) => {
            const overall = getOverallAvg(student.id);
            const examAvg = getExamCategoryAvg(student.id);
            const exAvg = getExerciseCategoryAvg(student.id);
            const isExpanded = expandedStudent === student.id;

            return (
              <div key={student.id} className="gt-student-row">
                <div
                  className="gt-student-main"
                  onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                >
                  <span className="gt-student-name" onClick={(e) => { e.stopPropagation(); onStudentClick(student.id); }}>
                    {student.name}
                  </span>
                  <div className="gt-student-grades">
                    {hasBothCategories && examAvg !== null && (
                      <span className="gt-mini-grade">
                        <span className="gt-dot gt-dot--exam"></span>
                        {examAvg.toFixed(1)}
                      </span>
                    )}
                    {hasBothCategories && exAvg !== null && (
                      <span className="gt-mini-grade">
                        <span className="gt-dot gt-dot--exercise"></span>
                        {exAvg.toFixed(1)}
                      </span>
                    )}
                    <span className={`gt-avg-badge ${gradeColor(overall, 10)}`}>
                      {overall !== null ? overall.toFixed(1) : '—'}
                    </span>
                  </div>
                  {/* icon: isExpanded ? chevronUpOutline : chevronDownOutline */}
                </div>

                {isExpanded && (
                  <div className="gt-student-detail">
                    {hasExams && (
                      <div className="gt-detail-section">
                        <div className="gt-detail-header">
                          <span className="gt-dot gt-dot--exam"></span>
                          <span>Exámenes</span>
                          {examAvg !== null && <span className="gt-detail-avg">{examAvg.toFixed(1)}</span>}
                        </div>
                        <div className="gt-detail-items">
                          {exams.map((exam) => {
                            const g = getExamGrade(exam.id, student.id);
                            const pct = examPcts[exam.id];
                            return (
                              <div key={exam.id} className="gt-detail-item" onClick={() => onExamClick(exam.id)}>
                                <span className="gt-detail-item-name">
                                  {exam.name}
                                  {exams.length > 1 && <span className="gt-detail-pct">{pct}%</span>}
                                </span>
                                <span className={`gt-detail-item-grade ${gradeColor(g, exam.maxScore)}`}>
                                  {g !== null ? `${formatGrade(g)}/${exam.maxScore}` : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {hasExercises && (
                      <div className="gt-detail-section">
                        <div className="gt-detail-header">
                          <span className="gt-dot gt-dot--exercise"></span>
                          <span>Ejercicios</span>
                          {exAvg !== null && <span className="gt-detail-avg">{exAvg.toFixed(1)}</span>}
                        </div>
                        <div className="gt-detail-items">
                          {exerciseGroups.map((group) => {
                            const g = getExerciseGrade(group, student.id);
                            const pct = exercisePcts[group.firstExerciseId];
                            return (
                              <div
                                key={group.name}
                                className="gt-detail-item"
                                onClick={() => onExerciseClick?.(group.firstExerciseId)}
                              >
                                <span className="gt-detail-item-name">
                                  {group.name}
                                  {exerciseGroups.length > 1 && <span className="gt-detail-pct">{pct}%</span>}
                                </span>
                                <span className={`gt-detail-item-grade ${gradeColor(g, group.maxScore)}`}>
                                  {g !== null ? `${formatGrade(g)}/${group.maxScore}` : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════ EXAMS TABLE VIEW ════════════ */}
      {viewMode === 'exams' && hasExams && (
        <div className="gt-category-view">
          {/* Weight editing panel */}
          {exams.length > 1 && (
            <div className={`gt-weight-panel ${isEditingExamWeights ? 'gt-weight-panel--editing' : ''}`}>
              <div className="gt-weight-panel-header">
                <span className="gt-weight-panel-title">Ponderación</span>
                {!isEditingExamWeights ? (
                  <button className="gt-weight-edit-btn" onClick={() => startEditWeights('exam')}>
                    <Pencil size={18} />
                    <span>Editar</span>
                  </button>
                ) : (
                  <div className="gt-weight-edit-actions">
                    <button className="gt-weight-cancel-btn" onClick={cancelEditWeights}>
                      <X size={18} />
                    </button>
                    <button
                      className={`gt-weight-save-btn ${editIsValid ? '' : 'gt-weight-save-btn--disabled'}`}
                      onClick={saveWeights}
                      disabled={!editIsValid || savingWeights}
                    >
                      <Check size={18} />
                      <span>Guardar</span>
                    </button>
                  </div>
                )}
              </div>
              {isEditingExamWeights ? (
                <div className="gt-weight-edit-list">
                  {exams.map(exam => (
                    <div key={exam.id} className="gt-weight-edit-row">
                      <span className="gt-weight-edit-name">{exam.name}</span>
                      <div className="gt-weight-edit-input-wrap">
                        <input
                          type="number"
                          min={0} max={100} step={1}
                          className="gt-weight-pct-input"
                          value={editPcts[exam.id] ?? 0}
                          onChange={(e) => updateEditPct(exam.id, e.target.value)}
                        />
                        <span className="gt-weight-pct-symbol">%</span>
                      </div>
                    </div>
                  ))}
                  <div className={`gt-weight-total-row ${editIsValid ? 'gt-weight-total--valid' : 'gt-weight-total--invalid'}`}>
                    <span className="gt-weight-total-label">Total</span>
                    <span className="gt-weight-total-value">{editTotal}%</span>
                  </div>
                  {!editIsValid && (
                    <div className="gt-weight-error">
                      La suma debe ser exactamente 100%
                    </div>
                  )}
                </div>
              ) : (
                <div className="gt-weight-display">
                  {exams.map(exam => (
                    <span key={exam.id} className="gt-weight-chip">
                      {exam.name}: <strong>{examPcts[exam.id]}%</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="gt-table-wrap">
            <table className="gt-table">
              <thead>
                <tr>
                  <th className="gt-th-student">Alumno</th>
                  {exams.map((exam) => (
                    <th key={exam.id} className="gt-th-item">
                      <span className="gt-th-name" onClick={() => onExamClick(exam.id)}>{exam.name}</span>
                      <span className="gt-th-max">/{exam.maxScore}</span>
                      {exams.length > 1 && (
                        <span className="gt-pct-badge">{examPcts[exam.id]}%</span>
                      )}
                    </th>
                  ))}
                  <th className="gt-th-avg">Media</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((student) => {
                  const avg = getExamCategoryAvg(student.id);
                  return (
                    <tr key={student.id}>
                      <td className="gt-td-student" onClick={() => onStudentClick(student.id)}>{student.name}</td>
                      {exams.map((exam) => {
                        const g = getExamGrade(exam.id, student.id);
                        const isEditing = editingCell?.id === exam.id && editingCell?.studentId === student.id;
                        const canEdit = !!onGradeEdit;
                        return (
                          <td
                            key={exam.id}
                            className={`gt-td-grade ${gradeColor(g, exam.maxScore)} ${canEdit && !isEditing ? 'gt-td-editable' : ''}`}
                            onClick={() => {
                              if (canEdit && !isEditing) {
                                hapticLight();
                                setEditingCell({ id: exam.id, studentId: student.id });
                                setEditValue(String(g ?? ''));
                              }
                            }}
                          >
                            {isEditing ? (
                              <input
                                className="gt-cell-input"
                                type="number" min={0} max={exam.maxScore} step={0.5} autoFocus
                                value={editValue}
                                onChange={(ev) => setEditValue(ev.target.value)}
                                onBlur={() => {
                                  const p = parseFloat(editValue);
                                  if (!isNaN(p) && onGradeEdit) onGradeEdit(exam.id, student.id, p);
                                  setEditingCell(null);
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === 'Enter') {
                                    const p = parseFloat(editValue);
                                    if (!isNaN(p) && onGradeEdit) onGradeEdit(exam.id, student.id, p);
                                    setEditingCell(null);
                                  } else if (ev.key === 'Escape') setEditingCell(null);
                                }}
                              />
                            ) : (
                              formatGrade(g)
                            )}
                          </td>
                        );
                      })}
                      <td className={`gt-td-avg ${gradeColor(avg, 10)}`}>{avg !== null ? avg.toFixed(1) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════ EXERCISES TABLE VIEW ════════════ */}
      {viewMode === 'exercises' && hasExercises && (
        <div className="gt-category-view">
          {/* Weight editing panel */}
          {exerciseGroups.length > 1 && (
            <div className={`gt-weight-panel ${isEditingExerciseWeights ? 'gt-weight-panel--editing' : ''}`}>
              <div className="gt-weight-panel-header">
                <span className="gt-weight-panel-title">Ponderación</span>
                {!isEditingExerciseWeights ? (
                  <button className="gt-weight-edit-btn" onClick={() => startEditWeights('exercise')}>
                    <Pencil size={18} />
                    <span>Editar</span>
                  </button>
                ) : (
                  <div className="gt-weight-edit-actions">
                    <button className="gt-weight-cancel-btn" onClick={cancelEditWeights}>
                      <X size={18} />
                    </button>
                    <button
                      className={`gt-weight-save-btn ${editIsValid ? '' : 'gt-weight-save-btn--disabled'}`}
                      onClick={saveWeights}
                      disabled={!editIsValid || savingWeights}
                    >
                      <Check size={18} />
                      <span>Guardar</span>
                    </button>
                  </div>
                )}
              </div>
              {isEditingExerciseWeights ? (
                <div className="gt-weight-edit-list">
                  {exerciseGroups.map(group => (
                    <div key={group.firstExerciseId} className="gt-weight-edit-row">
                      <span className="gt-weight-edit-name">{group.name}</span>
                      <div className="gt-weight-edit-input-wrap">
                        <input
                          type="number"
                          min={0} max={100} step={1}
                          className="gt-weight-pct-input"
                          value={editPcts[group.firstExerciseId] ?? 0}
                          onChange={(e) => updateEditPct(group.firstExerciseId, e.target.value)}
                        />
                        <span className="gt-weight-pct-symbol">%</span>
                      </div>
                    </div>
                  ))}
                  <div className={`gt-weight-total-row ${editIsValid ? 'gt-weight-total--valid' : 'gt-weight-total--invalid'}`}>
                    <span className="gt-weight-total-label">Total</span>
                    <span className="gt-weight-total-value">{editTotal}%</span>
                  </div>
                  {!editIsValid && (
                    <div className="gt-weight-error">
                      La suma debe ser exactamente 100%
                    </div>
                  )}
                </div>
              ) : (
                <div className="gt-weight-display">
                  {exerciseGroups.map(group => (
                    <span key={group.firstExerciseId} className="gt-weight-chip">
                      {group.name}: <strong>{exercisePcts[group.firstExerciseId]}%</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="gt-table-wrap">
            <table className="gt-table">
              <thead>
                <tr>
                  <th className="gt-th-student">Alumno</th>
                  {exerciseGroups.map((group) => (
                    <th
                      key={group.name}
                      className="gt-th-item gt-th-item--exercise"
                    >
                      <span className="gt-th-name" onClick={() => onExerciseClick?.(group.firstExerciseId)}>{group.name}</span>
                      <span className="gt-th-max">/{group.maxScore}</span>
                      {exerciseGroups.length > 1 && (
                        <span className="gt-pct-badge gt-pct-badge--exercise">{exercisePcts[group.firstExerciseId]}%</span>
                      )}
                    </th>
                  ))}
                  <th className="gt-th-avg">Media</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((student) => {
                  const avg = getExerciseCategoryAvg(student.id);
                  return (
                    <tr key={student.id}>
                      <td className="gt-td-student" onClick={() => onStudentClick(student.id)}>{student.name}</td>
                      {exerciseGroups.map((group) => {
                        const g = getExerciseGrade(group, student.id);
                        return (
                          <td key={group.name} className={`gt-td-grade ${gradeColor(g, group.maxScore)}`}>
                            {g !== null ? `${formatGrade(g)}/${group.maxScore}` : '—'}
                          </td>
                        );
                      })}
                      <td className={`gt-td-avg ${gradeColor(avg, 10)}`}>{avg !== null ? avg.toFixed(1) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default GradeTable;
