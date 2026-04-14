import { useState, useRef, useEffect } from 'react';
import { CheckCircle, Sparkles, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import { Switch } from '@/components/ui/switch';
import { useCoursePlanStore } from '../store/coursePlanStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { useAcademicConfigStore } from '../store/academicConfigStore';
import { coursePlans as coursePlansApi } from '../services/api';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { getPeriodNumbers, getPeriodLabel } from '../utils/periodConfig';
import './CoursePlanCreatorModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  classId: string;
  educationLevel: string;
  onPlanReady?: (planId: string) => void;
}

const CoursePlanCreatorModal: React.FC<Props> = ({
  isOpen, onClose, subjectId, subjectName, classId, educationLevel, onPlanReady,
}) => {
  const createPlan = useCoursePlanStore((s) => s.createPlan);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);
  const isDesktop = useIsDesktop();
  const acConfig = useAcademicConfigStore((s) => s.configs[classId]);
  const periodMode = acConfig?.periodMode;

  const [activeTrimesters, setActiveTrimesters] = useState<number[]>(getPeriodNumbers(periodMode));
  const [sessionsPerTri, setSessionsPerTri] = useState<Record<string, number>>({});
  const [guidePdfs, setGuidePdfs] = useState<File[]>([]);
  const [reviewSessions, setReviewSessions] = useState(true);
  const [bufferSessions, setBufferSessions] = useState(2);
  const [priorityNotes, setPriorityNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (classId) useAcademicConfigStore.getState().fetchConfig(classId);
  }, [classId]);

  useEffect(() => {
    if (isOpen && subjectId && classId) {
      coursePlansApi.detectTrimesters(subjectId, classId).then((res) => {
        setActiveTrimesters(res.data.trimesters);
        setSessionsPerTri(res.data.sessions_per_trimester || {});
      }).catch(() => {});
    }
  }, [isOpen, subjectId, classId]);

  const resetState = () => {
    setGuidePdfs([]); setReviewSessions(true); setBufferSessions(2);
    setPriorityNotes(''); setLoading(false); setError('');
  };

  const handleClose = () => { resetState(); onClose(); };

  const toggleTrimester = (t: number) => {
    setActiveTrimesters((prev) => {
      if (prev.includes(t)) {
        const next = prev.filter((x) => x !== t);
        return next.length > 0 ? next : prev;
      }
      return [...prev, t].sort();
    });
  };

  const totalSessions = activeTrimesters.reduce((acc, t) => acc + (sessionsPerTri[String(t)] || 0), 0);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await createPlan({
        subject_id: subjectId,
        class_id: classId,
        enfoque: 'practico',
        active_trimesters: activeTrimesters,
        priority_notes: priorityNotes.trim() || undefined,
        exams_per_trimester: 99,
        review_sessions: reviewSessions,
        exercises_frequency: 'per_unit',
        buffer_sessions: bufferSessions,
        guide_pdfs: guidePdfs.length > 0 ? guidePdfs : undefined,
      });
      const createdPlanId = result.id;
      const jobId = result.batchJobId;

      addBackgroundTask({
        type: 'textbook',
        label: `Planificación: ${subjectName}`,
        description: 'Analizando currículo y generando planificación con fechas, exámenes y sesiones.',
        batchJobId: jobId,
        expectedResultUrl: `/tabs/classes/${classId}/topics`,
        execute: async () => {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          let interval = 4000;
          while (true) {
            await sleep(interval);
            const res = await (await import('../services/api')).batch.getJobProgress(jobId);
            if (res.data.status === 'completed') break;
            if (res.data.status === 'failed' || res.data.status === 'cancelled')
              throw new Error('Error generando planificación');
            interval = Math.min(interval + 1000, 10000);
          }
          onPlanReady?.(createdPlanId);
          return `/tabs/classes/${classId}/topics`;
        },
      });
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Error al generar');
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={handleClose} sheetHeight="lg">
      <div className="cpc">

        {/* ── Header ── */}
        <div className="cpc__hero">
          <h2 className="cpc__hero-title">Planificar curso</h2>
          <p className="cpc__hero-sub">{subjectName} · {educationLevel}</p>
        </div>

        {/* ── PDF Upload (primary action) ── */}
        <input type="file" ref={fileInputRef} accept=".pdf" multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) setGuidePdfs((p) => [...p, ...files]);
            e.target.value = '';
          }} />

        {guidePdfs.length === 0 ? (
          <button className="cpc__upload" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} className="cpc__upload-icon" />
            <span className="cpc__upload-title">Sube la programación del curso</span>
            <span className="cpc__upload-hint">PDF con el temario oficial</span>
          </button>
        ) : (
          <div className="cpc__files">
            <div className="cpc__files-header">
              <CheckCircle size={18} />
              <span>{guidePdfs.length} PDF{guidePdfs.length > 1 ? 's' : ''} cargado{guidePdfs.length > 1 ? 's' : ''}</span>
              <button className="cpc__files-add" onClick={() => fileInputRef.current?.click()}>+ Añadir</button>
            </div>
            {guidePdfs.map((f, i) => (
              <div key={i} className="cpc__file-tag">
                <span>{f.name}</span>
                <button onClick={() => setGuidePdfs((p) => p.filter((_, j) => j !== i))}>
                  <XCircle size={18} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Trimesters ── */}
        <div className="cpc__section">
          <div className="cpc__tri-row">
            {getPeriodNumbers(periodMode).map((t) => {
              const sessions = sessionsPerTri[String(t)] || 0;
              const isActive = activeTrimesters.includes(t);
              return (
                <button key={t}
                  className={`cpc__tri ${isActive ? 'cpc__tri--on' : ''} ${sessions === 0 ? 'cpc__tri--empty' : ''}`}
                  onClick={() => toggleTrimester(t)}>
                  <span className="cpc__tri-num">{getPeriodLabel(periodMode, t)}</span>
                  <span className="cpc__tri-sessions">{sessions > 0 ? `${sessions} ses.` : 'sin clases'}</span>
                </button>
              );
            })}
          </div>
          {totalSessions > 0 && (
            <span className="cpc__tri-total">{totalSessions} sesiones en total</span>
          )}
        </div>

        {/* ── Options ── */}
        <div className="cpc__options">
          <div className="cpc__opt-row">
            <span>Repaso antes de exámenes</span>
            <Switch checked={reviewSessions} onChange={(e) => setReviewSessions((e.target as HTMLInputElement).checked)} />
          </div>
          <div className="cpc__opt-row">
            <span>Margen por trimestre</span>
            <div className="cpc__stepper">
              <button disabled={bufferSessions <= 0} onClick={() => setBufferSessions(Math.max(0, bufferSessions - 1))}>-</button>
              <span>{bufferSessions}</span>
              <button disabled={bufferSessions >= 5} onClick={() => setBufferSessions(Math.min(5, bufferSessions + 1))}>+</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Textarea value={priorityNotes} onChange={(e) => setPriorityNotes(e.target.value)} placeholder="Notas para la IA: ej. dedicar más tiempo a fracciones, saltar combinatoria..." rows={2} />
          </div>
        </div>

        {/* ── Error ── */}
        {error && <div className="cpc__error"><XCircle size={18} />{error}</div>}

        {/* ── Action ── */}
        <Button className="w-full cpc__btn" onClick={handleGenerate} disabled={loading || !guidePdfs.length}>
          {loading ? (
            <><Spinner size={16} className="mr-2" />Generando...</>
          ) : (
            <><Sparkles size={18} />Generar planificación</>
          )}
        </Button>

      </div>
    </Modal>
  );
};

export default CoursePlanCreatorModal;
