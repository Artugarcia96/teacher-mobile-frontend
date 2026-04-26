import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Trash2, Download,
  CheckCircle, Sparkles,
  FileText, User, RefreshCw, X,
  Users, BarChart3, Eye, Cross,
  File, CheckSquare,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useClassesStore } from '../../store/classesStore';
import { fetchRegistry } from '../../store/fetchRegistry';
import api, { exercises as exercisesApi, exerciseCorrections as ecApi, authenticatedFetch } from '../../services/api';
import { getFullPaperUrl } from '../../utils/examUrls';
import CorrectionReviewCard from '../../components/CorrectionReviewCard';
import ExerciseCorrectionPanel from '../../components/ExerciseCorrectionPanel';
import EmptyState from '../../components/EmptyState';
import { GradeDonut } from '../../components/charts';
import { ExerciseIterationHistoryItem } from '../../types';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import PageShell from '@/components/shared/PageShell';
import Modal from '@/components/shared/Modal';
import AlertConfirm from '@/components/shared/AlertConfirm';
import Spinner from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

import './ExerciseDetail.css';

const statusConfig: Record<string, { color: string; label: string; bg: string }> = {
  null: { color: '#64748B', label: 'Pendiente', bg: 'rgba(100, 116, 139, 0.1)' },
  in_progress: { color: '#D97706', label: 'En correccion', bg: 'rgba(217, 119, 6, 0.1)' },
  corrected: { color: '#059669', label: 'Corregido', bg: 'rgba(5, 150, 105, 0.1)' },
};

const ExerciseDetail: React.FC = () => {
  const { classId, exerciseId, subjectId } = useParams() as { classId: string; exerciseId: string; subjectId?: string };
  const navigate = useNavigate();

  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const deleteExercise = useExercisesStore((s) => s.deleteExercise);
  const iterateExercise = useExercisesStore((s) => s.iterateExercise);

  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);

  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showIterateModal, setShowIterateModal] = useState(false);
  const [iterateInstruction, setIterateInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState<Record<string, boolean>>({});
  const exercise = useMemo(() => allExercises.find((e) => e.id === exerciseId), [allExercises, exerciseId]);
  const classGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);
  const students = useMemo(() => allStudents.filter((st) => st.classId === classId), [allStudents, classId]);

  const siblingExercises = useMemo(() => {
    if (!exercise) return [];
    const exerciseName = exercise.name || exercise.weakAreas?.join(', ') || 'Ejercicio';
    const studentIds = new Set(students.map(s => s.id));
    return allExercises.filter(e => {
      if (!studentIds.has(e.studentId)) return false;
      const eName = e.name || e.weakAreas?.join(', ') || 'Ejercicio';
      return eName === exerciseName;
    });
  }, [exercise, allExercises, students]);

  const allExerciseCorrections = useMemo(() => {
    const sibIds = new Set(siblingExercises.map(e => e.id));
    return corrections.filter(c => sibIds.has(c.exerciseId));
  }, [corrections, siblingExercises]);

  const stats = useMemo(() => {
    const gradedCorrections = allExerciseCorrections.filter(c => c.grade !== null && c.grade !== undefined);
    const totalGraded = gradedCorrections.length;
    const totalPapers = allExerciseCorrections.length;
    if (totalGraded === 0) {
      return { average: null, passRate: null, totalGraded: 0, totalPapers, totalStudents: siblingExercises.length };
    }
    const maxScore = exercise?.maxScore || 10;
    const sum = gradedCorrections.reduce((acc, c) => acc + (c.grade || 0), 0);
    const average = sum / totalGraded;
    const passed = gradedCorrections.filter(c => (c.grade || 0) >= maxScore * 0.5).length;
    const passRate = (passed / totalGraded) * 100;
    return { average, passRate, totalGraded, totalPapers, totalStudents: siblingExercises.length };
  }, [allExerciseCorrections, siblingExercises.length, exercise?.maxScore]);

  const gradeDistribution = useMemo(() => {
    const dist = { excellent: 0, good: 0, borderline: 0, fail: 0 };
    const maxScore = exercise?.maxScore || 10;
    allExerciseCorrections.forEach((c) => {
      if (c.grade === null || c.grade === undefined) return;
      const pct = c.grade / maxScore;
      if (pct >= 0.8) dist.excellent++;
      else if (pct >= 0.6) dist.good++;
      else if (pct >= 0.5) dist.borderline++;
      else dist.fail++;
    });
    return dist;
  }, [allExerciseCorrections, exercise?.maxScore]);

  const classWeakAreas = useMemo(() => {
    const areaCount: Record<string, number> = {};
    siblingExercises.forEach(ex => { (ex.weakAreas || []).forEach((area: string) => { areaCount[area] = (areaCount[area] || 0) + 1; }); });
    allExerciseCorrections.forEach((c) => { const areas = c.weakAreas || c.aiAnalysis?.weakAreas || []; areas.forEach((area: string) => { areaCount[area] = (areaCount[area] || 0) + 1; }); });
    return Object.entries(areaCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([area, count]) => ({ area, count }));
  }, [siblingExercises, allExerciseCorrections]);

  const correctionsList = useMemo(() => {
    return allExerciseCorrections.map(c => {
      const corrStudent = allStudents.find(s => s.id === c.studentId);
      return { ...c, studentName: corrStudent?.name || 'Sin asignar' };
    }).sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [allExerciseCorrections, allStudents]);

  const groupStatus = useMemo(() => {
    const correctedCount = siblingExercises.filter(e => e.correctionStatus === 'corrected').length;
    if (correctedCount === siblingExercises.length && siblingExercises.length > 0) return 'corrected';
    if (correctedCount > 0) return 'in_progress';
    return 'null';
  }, [siblingExercises]);

  useEffect(() => {
    fetchClasses(); fetchExercises(); fetchStudents(classId);
    if (classId && fetchRegistry.isStale(`classSubjects-${classId}`, 60_000)) { fetchClassSubjects(classId); fetchRegistry.register(`classSubjects-${classId}`); }
    if (exerciseId) { fetchCorrections(exerciseId); }
  }, [classId, exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const siblingIds = useMemo(() => siblingExercises.map(e => e.id).sort().join(','), [siblingExercises]);
  useEffect(() => { siblingIds.split(',').filter(Boolean).forEach(id => { if (id !== exerciseId) fetchCorrections(id); }); }, [siblingIds, exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async () => {
    try { for (const ex of siblingExercises) { await deleteExercise(ex.id); } const backPath = subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}/exercises` : `/tabs/classes/${classId}/exercises`; navigate(backPath, { replace: true }); } catch (err) { console.error('Failed to delete exercise:', err); }
    setShowDeleteAlert(false);
  };

  const handleDownload = async (type: 'exercises' | 'solutions') => {
    if (!exercise) return;
    setDownloading(true);
    try {
      const ids = siblingExercises.map(e => e.id);
      if (ids.length > 1) { const res = await exercisesApi.batchDownload(ids, type === 'solutions'); const blob = new Blob([res.data], { type: 'application/pdf' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${exercise.name || 'Ejercicios'}${type === 'solutions' ? '_soluciones' : ''}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }
      else { const path = type === 'exercises' ? `/exercises/${exerciseId}/pdf/exercises` : `/exercises/${exerciseId}/pdf/solutions`; const res = await api.get(path, { responseType: 'blob' }); const blob = new Blob([res.data], { type: 'application/pdf' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${exercise.name || 'Ejercicios'}${type === 'solutions' ? '_soluciones' : ''}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }
    } catch (err) { console.error('Failed to download:', err); } finally { setDownloading(false); }
  };

  const handlePreview = async (type: 'exercises' | 'solutions') => {
    if (!exercise) return;
    try { const path = type === 'exercises' ? `/exercises/${exerciseId}/pdf/exercises` : `/exercises/${exerciseId}/pdf/solutions`; const res = await api.get(path, { responseType: 'blob' }); const blob = new Blob([res.data], { type: 'application/pdf' }); const blobUrl = window.URL.createObjectURL(blob); setPreviewUrl(blobUrl + '#.pdf'); } catch (err) { console.error('Failed to preview:', err); }
  };

  const handleIterate = async () => {
    if (!iterateInstruction.trim()) return; setIterating(true);
    try { await iterateExercise(exerciseId, iterateInstruction); setShowIterateModal(false); setIterateInstruction(''); } catch (err) { console.error('Failed to iterate:', err); } finally { setIterating(false); }
  };

  const quickIterations = ['Hazlo mas facil', 'Hazlo mas dificil', 'Anade mas ejercicios', 'Mas contexto practico'];


  const handleDownloadPaper = (paperUrl: string, studentName?: string) => {
    const fullUrl = getFullPaperUrl(paperUrl); if (!fullUrl) return;
    authenticatedFetch(fullUrl).then((res) => { if (!res.ok) throw new Error('Download failed'); return res.blob(); }).then((blob) => { const ext = paperUrl.toLowerCase().includes('.pdf') ? 'pdf' : 'jpg'; const fileName = `${exercise?.name || 'Ejercicio'}_${studentName || 'alumno'}.${ext}`; const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }).catch((err) => console.error('Download error:', err));
  };

  const handleGradeChange = async (correctionId: string, newGrade: number) => {
    setSavingGrade((prev) => ({ ...prev, [correctionId]: true }));
    try { await ecApi.update(correctionId, { grade: newGrade }); fetchCorrections(exerciseId); } catch (err) { console.error('Failed to update grade:', err); } finally { setSavingGrade((prev) => ({ ...prev, [correctionId]: false })); }
  };

  if (!exercise) { return (<PageShell><div className="exd-loading"><Spinner /></div></PageShell>); }

  const exerciseName = exercise.name || exercise.weakAreas?.join(', ') || 'Ejercicio';
  const status = statusConfig[groupStatus] || statusConfig.null;
  const backPath = subjectId ? `/tabs/classes/${classId}/subjects/${subjectId}/exercises` : `/tabs/classes/${classId}/exercises`;
  const effectiveSubjectId = subjectId || exercise.subjectId;
  const subjectColor = effectiveSubjectId ? classSubjects[classId]?.find(s => s.subjectId === effectiveSubjectId)?.subjectColor : undefined;

  return (
    <PageShell noPadding contentClassName="exd-content">
      <div style={subjectThemeStyle(subjectColor)}>
        <div className="exd-hero" style={subjectColor ? { background: subjectColor } : undefined}>
          <div className="exd-hero__nav">
            <button onClick={() => navigate(backPath)} className="flex items-center justify-center w-8 h-8 rounded-lg text-white/90 hover:bg-white/10 transition-colors"><X size={20} /></button>
            <div className="exd-hero__center">
              <h1 className="exd-hero__title">{exerciseName}</h1>
              {classGroup && (<p className="exd-hero__subtitle">{classGroup.name}{exercise.exerciseType === 'recovery' && (<span className="exd-hero__type-badge"><Cross size={11} />Repaso</span>)}</p>)}
            </div>
            <div className="exd-hero__actions">
              <button className="flex items-center justify-center w-8 h-8 rounded-lg text-white/90 hover:bg-white/10 transition-colors" onClick={() => setShowIterateModal(true)}><RefreshCw size={18} /></button>
              <button className="flex items-center justify-center w-8 h-8 rounded-lg text-red-300/90 hover:bg-white/10 transition-colors" onClick={() => setShowDeleteAlert(true)}><Trash2 size={18} /></button>
            </div>
          </div>
        </div>

        <div className="exd-ribbon">
          <div className="exd-ribbon__item"><span className="exd-ribbon__value">{new Date(exercise.assignedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span><span className="exd-ribbon__label">Asignado</span></div>
          <div className="exd-ribbon__divider" />
          <div className="exd-ribbon__item"><span className="exd-ribbon__value">{exercise.maxScore}</span><span className="exd-ribbon__label">Max.</span></div>
          <div className="exd-ribbon__divider" />
          <div className="exd-ribbon__item"><span className="exd-ribbon__status" style={{ color: status.color, background: status.bg }}>{status.label}</span></div>
          {siblingExercises.length > 1 && (<><div className="exd-ribbon__divider" /><div className="exd-ribbon__item"><span className="exd-ribbon__value"><Users size={14} className="exd-ribbon__icon" />{siblingExercises.length}</span><span className="exd-ribbon__label">Alumnos</span></div></>)}
          {siblingExercises.length <= 1 && exercise.studentId && (<><div className="exd-ribbon__divider" /><div className="exd-ribbon__item"><span className="exd-ribbon__value"><User size={14} className="exd-ribbon__icon" />{students.find(s => s.id === exercise.studentId)?.name || '--'}</span></div></>)}
        </div>

        {classWeakAreas.length > 0 && (<div className="exd-areas-section"><h3 className="exd-section-title">Areas de refuerzo</h3><div className="exd-areas-list">{classWeakAreas.map(({ area }, i) => (<Badge key={i} variant="outline">{area}</Badge>))}</div></div>)}

        <div className="exd-stats">
          <div className="exd-stat-card"><div className="exd-stat-icon"><FileText size={18} /></div><div className="exd-stat-content"><span className="exd-stat-value">{stats.totalPapers}</span><span className="exd-stat-label">Entregas</span></div></div>
          <div className="exd-stat-card"><div className="exd-stat-icon exd-stat-icon--success"><CheckCircle size={18} /></div><div className="exd-stat-content"><span className="exd-stat-value">{stats.totalGraded}</span><span className="exd-stat-label">Corregidos</span></div></div>
          {stats.average !== null && (<div className="exd-stat-card"><div className="exd-stat-icon exd-stat-icon--primary"><BarChart3 size={18} /></div><div className="exd-stat-content"><span className="exd-stat-value">{stats.average.toFixed(1)}</span><span className="exd-stat-label">Media</span></div></div>)}
          {stats.passRate !== null && (<div className="exd-stat-card"><div className="exd-stat-icon exd-stat-icon--warning"><Users size={18} /></div><div className="exd-stat-content"><span className="exd-stat-value">{stats.passRate.toFixed(0)}%</span><span className="exd-stat-label">Aprobados</span></div></div>)}
        </div>

        {stats.totalStudents > 0 && (<div className="exd-progress-section"><div className="exd-progress-header"><span>Progreso de correccion</span><span>{stats.totalGraded}/{stats.totalStudents}</span></div><Progress value={stats.totalStudents > 0 ? (stats.totalGraded / stats.totalStudents) * 100 : 0} className={`h-1.5 ${groupStatus === 'corrected' ? '[&>div]:bg-green-600' : ''}`} /></div>)}

        {stats.totalGraded > 0 && (<div className="exd-performance"><div className="exd-performance__charts"><GradeDonut distribution={[{ label: 'Excelente', count: gradeDistribution.excellent, color: 'var(--chart-excellent, #10B981)' }, { label: 'Bien', count: gradeDistribution.good, color: 'var(--chart-good, #3B82F6)' }, { label: 'Suficiente', count: gradeDistribution.borderline, color: 'var(--chart-borderline, #F59E0B)' }, { label: 'Suspenso', count: gradeDistribution.fail, color: 'var(--chart-fail, #EF4444)' }]} centerLabel={stats.average !== null ? stats.average.toFixed(1) : '--'} centerSubLabel="Promedio" size={140} /></div>{classWeakAreas.length > 0 && (<div className="exd-performance__weak-tags">{classWeakAreas.map(({ area, count }) => (<span key={area} className="exd-weak-tag">{area} <span className="exd-weak-count">{count}</span></span>))}</div>)}</div>)}

        <div className="exd-actions">
          <div className="exd-downloads-section">
            <span className="exd-section-label">Documentos{exercise?.iterationHistory && exercise.iterationHistory.length > 0 && (<Badge className="ml-2 align-middle">v{exercise.iterationHistory.length + 1} -- ultima version</Badge>)}</span>
            <div className="exd-doc-list">
              <div className="exd-doc-item"><div className="exd-doc-info"><File size={18} className="exd-doc-icon" /><span className="exd-doc-name">Ejercicios</span></div><div className="exd-doc-actions"><button className="exd-doc-btn" onClick={() => handlePreview('exercises')} title="Ver"><Eye size={18} /></button><button className="exd-doc-btn" onClick={() => handleDownload('exercises')} disabled={downloading} title="Descargar"><Download size={18} /></button></div></div>
              <div className="exd-doc-item"><div className="exd-doc-info"><CheckSquare size={18} className="exd-doc-icon" /><span className="exd-doc-name">Soluciones</span></div><div className="exd-doc-actions"><button className="exd-doc-btn" onClick={() => handlePreview('solutions')} title="Ver"><Eye size={18} /></button><button className="exd-doc-btn" onClick={() => handleDownload('solutions')} disabled={downloading} title="Descargar"><Download size={18} /></button></div></div>
            </div>
          </div>
          <Button className="w-full" variant="outline" onClick={() => setShowIterateModal(true)}><RefreshCw size={16} />Ajustar ejercicios</Button>

          {exercise?.iterationHistory && exercise.iterationHistory.length > 0 && (
            <Accordion type="single" collapsible className="exd-iteration-history">
              <AccordionItem value="history">
                <AccordionTrigger>Historial de versiones ({exercise.iterationHistory.length + 1} versiones)</AccordionTrigger>
                <AccordionContent>
                  <div className="exd-history-content">
                    <div className="exd-history-item" style={{ border: '1px solid var(--color-primary)', background: 'rgba(21, 102, 94, 0.05)' }}>
                      <div className="exd-history-version"><Badge>v{exercise.iterationHistory.length + 1}</Badge><span className="exd-history-label">Version actual</span><Button variant="ghost" size="sm" onClick={() => handleDownload('exercises')} title="Descargar esta version"><Download size={16} /></Button></div>
                      <p className="exd-history-instruction">{exercise.iterationHistory[exercise.iterationHistory.length - 1].instruction}</p>
                      {exercise.iterationHistory[exercise.iterationHistory.length - 1].changes_made && exercise.iterationHistory[exercise.iterationHistory.length - 1].changes_made!.length > 0 && (<ul className="exd-history-changes">{exercise.iterationHistory[exercise.iterationHistory.length - 1].changes_made!.map((change: string, cidx: number) => (<li key={cidx}>{change}</li>))}</ul>)}
                    </div>
                    {[...exercise.iterationHistory].slice(0, -1).reverse().map((item: ExerciseIterationHistoryItem, idx: number) => (<div key={idx} className="exd-history-item"><div className="exd-history-version"><Badge variant="secondary">v{item.version}</Badge><span className="exd-history-time">{new Date(item.timestamp).toLocaleString('es-ES')}</span></div><p className="exd-history-instruction">{item.instruction}</p>{item.changes_made && item.changes_made.length > 0 && (<ul className="exd-history-changes">{item.changes_made.map((change: string, cidx: number) => (<li key={cidx}>{change}</li>))}</ul>)}</div>))}
                    <div className="exd-history-item"><div className="exd-history-version"><Badge variant="secondary">v1</Badge><span className="exd-history-label" style={{ color: '#94A3B8' }}>Version original</span></div><p className="exd-history-instruction">Generacion inicial de ejercicios</p></div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>

        <div className="exd-corrections-section">
          {groupStatus === 'corrected' ? (
            <><div className="exd-corrections-header"><h2 className="exd-section-title">Correcciones ({correctionsList.length})</h2></div><div className="correction-review-list">{correctionsList.map((correction, i) => (<CorrectionReviewCard key={correction.id} index={i} studentName={correction.studentName} grade={correction.grade} maxScore={exercise.maxScore} teacherComments={correction.teacherComments} weakAreas={correction.weakAreas} aiAnalysis={correction.aiAnalysis} aiProcessed={!!correction.aiAnalysis} paperUrl={getFullPaperUrl(correction.paperUrl) || undefined} onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined} onDownloadPaper={correction.paperUrl ? () => handleDownloadPaper(correction.paperUrl!, correction.studentName) : undefined} onGradeChange={(newGrade) => handleGradeChange(correction.id, newGrade)} savingGrade={savingGrade[correction.id]} />))}</div></>
          ) : (
            <ExerciseCorrectionPanel
              classId={classId}
              exerciseIds={siblingExercises.map(e => e.id)}
              exerciseName={exercise.name || exerciseName}
              maxScore={exercise.maxScore}
              /* Standalone mode: the exercise was generated without a student
                 (teacher-owned generic ficha). Every correction uploaded is
                 anonymous and labelled by the teacher. */
              standalone={!exercise.studentId}
              onFinished={() => { fetchExercises(); siblingExercises.forEach(e => fetchCorrections(e.id)); }}
            />
          )}
        </div>

        <Modal open={!!previewUrl} onClose={() => { if (previewUrl?.startsWith('blob:')) window.URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} title="Vista previa" sheetHeight="full">
          <div className="paper-preview-content">{previewUrl && (<div className="paper-preview-container">{previewUrl.toLowerCase().endsWith('.pdf') ? (<iframe src={previewUrl} title="Ejercicio" className="paper-preview-pdf" />) : (<img src={previewUrl} alt="Ejercicio" className="paper-preview-img" />)}</div>)}</div>
        </Modal>

        <AlertConfirm open={showDeleteAlert} onClose={() => setShowDeleteAlert(false)} header="Eliminar ejercicios" message={`Eliminar "${exerciseName}"${siblingExercises.length > 1 ? ` (${siblingExercises.length} alumnos)` : ''}? Tambien se eliminaran las correcciones asociadas. Esta accion no se puede deshacer.`} confirmText="Eliminar" onConfirm={handleDelete} variant="destructive" />

        <Modal open={showIterateModal} onClose={() => { setShowIterateModal(false); setIterateInstruction(''); }} title="Ajustar ejercicios" sheetHeight="md">
          <div className="p-4 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground leading-relaxed">Describe como quieres modificar los ejercicios. La IA regenerara las preguntas segun tus instrucciones.</p>
            <div className="flex flex-wrap gap-2">{quickIterations.map((opt, i) => (<button key={i} className={`inline-flex items-center px-3 py-1 rounded-full border text-xs cursor-pointer transition-colors ${iterateInstruction === opt ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-accent'}`} onClick={() => setIterateInstruction(opt)}>{opt}</button>))}</div>
            <Textarea value={iterateInstruction} onChange={(e) => setIterateInstruction(e.target.value)} placeholder="Ej: Anade mas ejercicios de fracciones y reduce la dificultad..." rows={4} />
            <Button className="w-full" onClick={handleIterate} disabled={!iterateInstruction.trim() || iterating}>{iterating ? (<Spinner size={18} />) : (<><Sparkles size={16} />Aplicar cambios</>)}</Button>
          </div>
        </Modal>
      </div>
    </PageShell>
  );
};

export default ExerciseDetail;
