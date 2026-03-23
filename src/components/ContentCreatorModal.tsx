import { useState, useRef } from 'react';
import {
  IonModal, IonButton, IonIcon, IonSpinner, IonChip, IonTextarea, IonItem, IonInput,
  IonLabel, IonSegment, IonSegmentButton, IonRange,
} from '@ionic/react';
import { sparkles, cloudUploadOutline, checkmarkCircleOutline, documentTextOutline, closeCircleOutline } from 'ionicons/icons';
import { useTextbooksStore } from '../store/textbooksStore';
import { useBackgroundTasksStore } from '../store/backgroundTasksStore';
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
        expectedResultUrl: `/tabs/classes/${classId}/subjects/${capturedSubjectId}/topics`,
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
          return `/tabs/classes/${classId}/subjects/${capturedSubjectId}/topics`;
        },
      });

      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al generar contenido');
      setGenerating(false);
    }
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={handleClose}
      initialBreakpoint={isDesktop ? 1 : 0.85}
      breakpoints={isDesktop ? [0, 1] : [0, 0.5, 0.85, 1]}
      className="content-creator-modal"
    >
      <div className="ccm">
        {/* Header */}
        <div className="ccm__header">
          <h2 className="ccm__title">Generar contenido teórico</h2>
          <p className="ccm__subtitle">{subjectName}</p>
        </div>

        {/* Context chips */}
        <div className="ccm__context">
          <IonChip color="primary" outline>
            <IonIcon icon={documentTextOutline} />
            <IonLabel>{educationLevelLabels[educationLevel] || educationLevel}</IonLabel>
          </IonChip>
          {topicCount > 0 && (
            <IonChip color="medium" outline>
              <IonLabel>{topicCount} temas</IonLabel>
            </IonChip>
          )}
        </div>

        {/* Title */}
        <div className="ccm__field">
          <IonItem lines="none" className="ccm__input">
            <IonInput
              value={title}
              onIonInput={(e) => setTitle(e.detail.value ?? '')}
              placeholder="Nombre del documento (opcional)"
            />
          </IonItem>
        </div>

        {/* Enfoque */}
        <div className="ccm__enfoque">
          <span className="ccm__enfoque-label">Enfoque del contenido</span>
          <IonSegment
            value={enfoque}
            onIonChange={(e) => setEnfoque(e.detail.value as string)}
          >
            <IonSegmentButton value="teorico">
              <IonLabel>Teórico</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="practico">
              <IonLabel>Práctico</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </div>

        {/* Configuration */}
        <div className="ccm__config">
          <span className="ccm__config-label">Configuración</span>

          {/* Target pages */}
          <div className="ccm__config-item">
            <div className="ccm__config-item-label">
              <span>Páginas objetivo</span>
              <span className="ccm__config-item-value">{targetPages}</span>
            </div>
            <IonRange
              min={2} max={200} step={1}
              value={targetPages}
              onIonInput={(e) => setTargetPages(e.detail.value as number)}
            />
          </div>

          <div className="ccm__config-row">
            {/* Exercises per chapter */}
            <div className="ccm__config-item">
              <div className="ccm__config-item-label">
                <span>Ejerc./cap.</span>
                <span className="ccm__config-item-value">{exercisesPerChapter}</span>
              </div>
              <IonRange
                min={3} max={30} step={1}
                value={exercisesPerChapter}
                onIonInput={(e) => setExercisesPerChapter(e.detail.value as number)}
              />
            </div>

            {/* Examples per section */}
            <div className="ccm__config-item">
              <div className="ccm__config-item-label">
                <span>Ejemplos/sec.</span>
                <span className="ccm__config-item-value">{examplesPerSection}</span>
              </div>
              <IonRange
                min={0} max={5} step={1}
                value={examplesPerSection}
                onIonInput={(e) => setExamplesPerSection(e.detail.value as number)}
              />
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
            <IonIcon icon={guidePdfs.length > 0 ? checkmarkCircleOutline : cloudUploadOutline} />
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
                    <IonIcon icon={closeCircleOutline} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="ccm__notes">
          <span className="ccm__enfoque-label">Instrucciones adicionales (opcional)</span>
          <IonItem lines="none" className="ccm__notes-item">
            <IonTextarea
              value={notas}
              onIonInput={(e) => setNotas(e.detail.value ?? '')}
              placeholder="Ej: Mis alumnos tienen dificultades con..."
              rows={3}
              autoGrow
            />
          </IonItem>
        </div>

        {/* Error */}
        {error && (
          <div className="ccm__error">
            <IonIcon icon={closeCircleOutline} />
            {error}
          </div>
        )}

        {/* Generate button */}
        <IonButton
          expand="block"
          color="primary"
          onClick={handleGenerate}
          disabled={generating}
          className="ccm__generate"
        >
          {generating ? (
            <>
              <IonSpinner name="crescent" style={{ marginRight: 8 }} />
              Generando...
            </>
          ) : (
            <>
              <IonIcon icon={sparkles} slot="start" />
              Generar contenido
            </>
          )}
        </IonButton>
      </div>
    </IonModal>
  );
};

export default ContentCreatorModal;
