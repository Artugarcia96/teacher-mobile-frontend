import { useState, useRef } from 'react';
import { CheckCircle, FileText, Sparkles, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import { useTextbooksStore } from '../store/textbooksStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
import { useClassesStore } from '../store/classesStore';
import { useTopicsStore } from '../store/topicsStore';
import { batch } from '../services/api';
import { useIsDesktop } from '../hooks/useIsDesktop';
import './ContentCreatorModal.css';

interface ContentCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  classId: string;
  educationLevel: string;
  teacherName?: string;
  topicCount: number;
}

const educationLevelLabels: Record<string, string> = {
  infantil: 'Infantil',
  primaria_lower: 'Primaria (1-3)',
  primaria_upper: 'Primaria (4-6)',
  secundaria: 'ESO',
  bachillerato: 'Bachillerato',
  universidad: 'Universidad',
};

const ContentCreatorModal: React.FC<ContentCreatorModalProps> = ({
  isOpen, onClose, subjectId, subjectName, classId, educationLevel, teacherName, topicCount,
}) => {
  const generateTextbook = useTextbooksStore((s) => s.generateTextbook);
  const fetchTextbooks = useTextbooksStore((s) => s.fetchTextbooks);
  const addBackgroundTask = useBackgroundTasksStore((s) => s.addTask);
  const isDesktop = useIsDesktop();

  const [title, setTitle] = useState('');
  const [enfoque, setEnfoque] = useState<string>('practico');
  const [notas, setNotas] = useState('');
  const [guidePdfs, setGuidePdfs] = useState<File[]>([]);
  const [targetPages, setTargetPages] = useState(80);
  const [exercisesPerChapter, setExercisesPerChapter] = useState(15);
  const [examplesPerSection, setExamplesPerSection] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setTitle('');
    setEnfoque('practico');
    setNotas('');
    setGuidePdfs([]);
    setTargetPages(80);
    setExercisesPerChapter(15);
    setExamplesPerSection(2);
    setGenerating(false);
    setError('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setGuidePdfs((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await generateTextbook({
        subject_id: subjectId,
        class_id: classId,
        title: title.trim() || undefined,
        enfoque,
        notas: notas.trim() || undefined,
        target_pages: targetPages,
        exercises_per_chapter: exercisesPerChapter,
        examples_per_section: examplesPerSection,
        guide_pdfs: guidePdfs.length > 0 ? guidePdfs : undefined,
      });

      const jobId = result.batchJobId;
      const capturedSubjectId = subjectId;
      const capturedSubjectName = subjectName;

      addBackgroundTask({
        type: 'textbook',
        label: capturedSubjectName,
        description: 'La IA estructura el temario por capítulos, redacta explicaciones con ejemplos y ejercicios, y genera el PDF.',
        batchJobId: jobId,
        expectedResultUrl: `/tabs/classes/${classId}/subjects/${capturedSubjectId}/syllabus`,
        onComplete: () => {
          fetchTextbooks(capturedSubjectId);
          useClassesStore.getState().fetchClassSubjects(classId);
          useTopicsStore.getState().fetchTopicsForClass(classId);
        },
        execute: async () => {
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          let interval = 5000;
          while (true) {
            await sleep(interval);
            const res = await batch.getJobProgress(jobId);
            const status = res.data.status;
            if (status === 'completed') break;
            if (status === 'failed' || status === 'cancelled') {
              throw new Error('Error generando contenido');
            }
            interval = Math.min(interval + 1000, 10000);
          }
          await fetchTextbooks(capturedSubjectId);
          return `/tabs/classes/${classId}/subjects/${capturedSubjectId}/syllabus`;
        },
      });

      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al generar contenido');
      setGenerating(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={handleClose} sheetHeight="lg">
      <div className="ccm">
        {/* Header */}
        <div className="ccm__header">
          <h2 className="ccm__title">Generar contenido teórico</h2>
          <p className="ccm__subtitle">{subjectName}</p>
        </div>

        {/* Context chips */}
        <div className="ccm__context">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium">
            <FileText size={18} />
            <span>{educationLevelLabels[educationLevel] || educationLevel}</span>
          </span>
          {topicCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium">
              <span>{topicCount} temas</span>
            </span>
          )}
        </div>

        {/* Title */}
        <div className="ccm__field">
          <div className="flex items-center gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre del documento (opcional)" />
          </div>
        </div>

        {/* Enfoque */}
        <div className="ccm__enfoque">
          <span className="ccm__enfoque-label">Enfoque del contenido</span>
          <div className="flex rounded-lg bg-muted p-1">
            <button onClick={() => setEnfoque('teorico')} className={`flex-1 px-3 py-2 rounded-md text-center transition-colors ${enfoque === 'teorico' ? 'bg-background shadow-sm' : ''}`}>
              <span className="text-sm font-medium block">Teórico</span>
              <span className="text-[11px] text-muted-foreground block">Explicaciones y conceptos</span>
            </button>
            <button onClick={() => setEnfoque('practico')} className={`flex-1 px-3 py-2 rounded-md text-center transition-colors ${enfoque === 'practico' ? 'bg-background shadow-sm' : ''}`}>
              <span className="text-sm font-medium block">Práctico</span>
              <span className="text-[11px] text-muted-foreground block">Ejercicios y ejemplos</span>
            </button>
          </div>
        </div>

        {/* Configuration */}
        <div className="ccm__config">
          <span className="ccm__config-label">Configuración</span>

          <div className="ccm__config-item">
            <div className="ccm__config-item-label">
              <span>Páginas objetivo</span>
            </div>
            <Select value={String(targetPages)} onValueChange={(v) => setTargetPages(Number(v))}>
              <SelectTrigger className="w-24 text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="40">40</SelectItem>
                <SelectItem value="60">60</SelectItem>
                <SelectItem value="80">80</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="120">120</SelectItem>
                <SelectItem value="150">150</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ccm__config-row">
            <div className="ccm__config-item">
              <div className="ccm__config-item-label">
                <span>Ejerc./capítulo</span>
              </div>
              <Select value={String(exercisesPerChapter)} onValueChange={(v) => setExercisesPerChapter(Number(v))}>
                <SelectTrigger className="w-20 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="15">15</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ccm__config-item">
              <div className="ccm__config-item-label">
                <span>Ejemplos/sección</span>
              </div>
              <Select value={String(examplesPerSection)} onValueChange={(v) => setExamplesPerSection(Number(v))}>
                <SelectTrigger className="w-20 text-sm h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* PDF upload */}
        <div className="ccm__upload">
          <span className="ccm__enfoque-label">PDFs de referencia (opcional)</span>
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            className={`ccm__upload-btn ${guidePdfs.length > 0 ? 'ccm__upload-btn--has-file' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            {guidePdfs.length > 0 ? <CheckCircle size={18} /> : <Upload size={18} />}
            <span className="ccm__upload-name">
              {guidePdfs.length > 0 ? `${guidePdfs.length} archivo${guidePdfs.length > 1 ? 's' : ''}` : 'Subir PDFs guía'}
            </span>
          </button>
          {guidePdfs.length > 0 && (
            <div className="ccm__upload-files">
              {guidePdfs.map((file, idx) => (
                <div key={idx} className="ccm__upload-file-chip">
                  <span className="ccm__upload-file-name">{file.name}</span>
                  <button
                    className="ccm__upload-file-remove"
                    onClick={() => setGuidePdfs((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <XCircle size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="ccm__notes">
          <span className="ccm__enfoque-label">Instrucciones adicionales (opcional)</span>
          <div className="flex items-center gap-2">
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: Mis alumnos tienen dificultades con..." rows={3} />
          </div>
        </div>

        {/* Pre-generation summary */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-sm">Resumen</p>
          <p>Textbook de ~{targetPages} páginas, enfoque {enfoque === 'practico' ? 'práctico' : 'teórico'}, {exercisesPerChapter} ejercicios/capítulo, {examplesPerSection} ejemplos/sección.</p>
          {guidePdfs.length > 0 && <p>{guidePdfs.length} PDF{guidePdfs.length > 1 ? 's' : ''} de referencia.</p>}
          <p>Tiempo estimado: 5-15 minutos. Se procesa en segundo plano.</p>
        </div>

        {/* Error */}
        {error && (
          <div className="ccm__error">
            <XCircle size={18} />
            {error}
          </div>
        )}

        {/* Generate button */}
        <Button className="w-full ccm__generate" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <>
              <Spinner size={16} className="mr-2" />
              Generando...
            </>
          ) : (
            <>
              <Sparkles size={18} />
              Generar contenido
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default ContentCreatorModal;
