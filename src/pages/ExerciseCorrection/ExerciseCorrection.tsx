import { useState, useMemo, useEffect, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton,
  IonIcon, IonProgressBar, IonBadge, IonSpinner, IonModal,
} from '@ionic/react';
import { closeOutline, cloudUploadOutline, checkmarkCircleOutline, sparkles } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExercisesStore } from '../../store/exercisesStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useExerciseCorrectionStore } from '../../store/exerciseCorrectionStore';
import { exerciseCorrections as ecApi } from '../../services/api';
import ScanCard from '../../components/ScanCard';
import EmptyState from '../../components/EmptyState';
import './ExerciseCorrection.css';

const ExerciseCorrection: React.FC = () => {
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const history = useHistory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const allExercises = useExercisesStore((s) => s.exercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  
  const corrections = useExerciseCorrectionStore((s) => s.corrections);
  const fetchCorrections = useExerciseCorrectionStore((s) => s.fetchCorrections);
  const updateCorrection = useExerciseCorrectionStore((s) => s.updateCorrection);
  const processAI = useExerciseCorrectionStore((s) => s.processAI);
  const finishCorrection = useExerciseCorrectionStore((s) => s.finishCorrection);
  const loading = useExerciseCorrectionStore((s) => s.loading);

  const exercise = useMemo(() => allExercises.find((e) => e.id === exerciseId), [allExercises, exerciseId]);
  const exerciseStudent = useMemo(() => allStudents.find((s) => s.id === exercise?.studentId), [allStudents, exercise?.studentId]);
  const students = useMemo(() => {
    if (!exerciseStudent) return [];
    return allStudents.filter((st) => st.classId === exerciseStudent.classId);
  }, [allStudents, exerciseStudent]);
  
  const exerciseCorrections = useMemo(() => corrections.filter((c) => c.exerciseId === exerciseId), [corrections, exerciseId]);

  const [localGrades, setLocalGrades] = useState<Record<string, { grade: number | null; notes: string; studentId: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [aiProcessing, setAiProcessing] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (exercise?.studentId) {
      fetchExercises(exercise.studentId);
    }
  }, [exercise?.studentId, fetchExercises]);

  useEffect(() => {
    if (exerciseStudent?.classId) {
      fetchStudents(exerciseStudent.classId);
    }
    if (exerciseId) {
      fetchCorrections(exerciseId);
    }
  }, [exerciseStudent?.classId, exerciseId, fetchStudents, fetchCorrections]);

  useEffect(() => {
    setLocalGrades((prev) => {
      const next = { ...prev };
      exerciseCorrections.forEach((c) => {
        if (!next[c.id]) {
          next[c.id] = { grade: c.grade, notes: c.teacherNotes || '', studentId: c.studentId || '' };
        } else if (!next[c.id].studentId && c.studentId) {
          next[c.id] = { ...next[c.id], studentId: c.studentId };
        }
      });
      return next;
    });
  }, [exerciseCorrections]);

  if (!exercise) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newCorrections: string[] = [];
      for (const file of Array.from(files)) {
        const response = await ecApi.upload(exerciseId, file);
        newCorrections.push(response.data.id);
      }
      await fetchCorrections(exerciseId);
      for (const cId of newCorrections) {
        handleProcessAI(cId);
      }
    } catch (err) {
      console.error('Failed to upload paper:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const getFullPaperUrl = (paperUrl?: string) => {
    if (!paperUrl) return null;
    if (paperUrl.startsWith('http')) return paperUrl;
    let baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    baseUrl = baseUrl.replace(/\/+$/, '');
    if (paperUrl.startsWith('/uploads/')) {
      return `${baseUrl}/files${paperUrl.replace('/uploads', '')}`;
    }
    return `${baseUrl}${paperUrl}`;
  };

  const handleStudentChange = (correctionId: string, studentId: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], studentId } }));
  };

  const handleGradeChange = (correctionId: string, grade: number) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], grade } }));
  };

  const handleNotesChange = (correctionId: string, notes: string) => {
    setLocalGrades((prev) => ({ ...prev, [correctionId]: { ...prev[correctionId], notes } }));
  };

  const handleSavePaper = async (correctionId: string) => {
    const local = localGrades[correctionId];
    if (!local || local.grade === null) return;
    
    setSaving((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const correction = exerciseCorrections.find((c) => c.id === correctionId);
      const weakAreas = correction?.aiAnalysis?.weakAreas || [];
      
      await updateCorrection(correctionId, {
        student_id: local.studentId || undefined,
        grade: local.grade,
        teacher_notes: local.notes,
        weak_areas: weakAreas,
      });
    } catch (err) {
      console.error('Failed to save correction:', err);
    } finally {
      setSaving((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const handleProcessAI = async (correctionId: string) => {
    setAiErrors((prev) => ({ ...prev, [correctionId]: '' }));
    setAiProcessing((prev) => ({ ...prev, [correctionId]: true }));
    try {
      const result = await processAI(correctionId);
      
      if (result?.suggestedStudentName) {
        const nameLower = result.suggestedStudentName.toLowerCase();
        const matchedStudent = students.find((s) => 
          s.name.toLowerCase() === nameLower ||
          s.name.toLowerCase().includes(nameLower) ||
          nameLower.includes(s.name.toLowerCase())
        );
        if (matchedStudent) {
          setLocalGrades((prev) => ({
            ...prev,
            [correctionId]: { ...prev[correctionId], studentId: matchedStudent.id }
          }));
        }
      }
      
      await fetchCorrections(exerciseId);
    } catch (err: any) {
      console.error('AI processing failed:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Error desconocido';
      setAiErrors((prev) => ({ ...prev, [correctionId]: errorMsg }));
    } finally {
      setAiProcessing((prev) => ({ ...prev, [correctionId]: false }));
    }
  };

  const handleFinish = async () => {
    try {
      await finishCorrection(exerciseId);
      history.goBack();
    } catch (err) {
      console.error('Failed to finish:', err);
    }
  };

  const savedCount = exerciseCorrections.filter((c) => c.savedAt).length;
  const totalPapers = exerciseCorrections.length || 1;
  const progress = totalPapers > 0 ? savedCount / totalPapers : 0;
  const allSaved = savedCount === exerciseCorrections.length && exerciseCorrections.length > 0;
  const totalPoints = exercise.questions?.reduce((sum, q) => sum + (q.points || 0), 0) || 10;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => history.goBack()}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle>
            {exerciseStudent?.name || 'Alumno'} — {exercise.name || 'Ejercicio'}
          </IonTitle>
          <IonButtons slot="end">
            <IonBadge color={progress >= 1 ? 'success' : 'primary'} className="progress-badge">
              {savedCount}/{totalPapers}
            </IonBadge>
          </IonButtons>
        </IonToolbar>
        <IonProgressBar value={progress} color={progress >= 1 ? 'success' : 'primary'} />
      </IonHeader>

      <IonContent className="exercise-correction-content">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".jpg,.jpeg,.png,.pdf"
          multiple
          onChange={handleFilesSelected}
        />

        <div className="exercise-correction-toolbar">
          <IonButton size="small" fill="outline" onClick={handleUploadClick} disabled={uploading}>
            {uploading ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} slot="start" /> Subir examen</>}
          </IonButton>

          {exerciseCorrections.filter(c => !c.aiAnalysis && c.paperUrl).length > 0 && (
            <IonButton
              size="small"
              color="tertiary"
              onClick={() => {
                exerciseCorrections
                  .filter(c => !c.aiAnalysis && c.paperUrl)
                  .forEach(c => handleProcessAI(c.id));
              }}
            >
              <IonIcon icon={sparkles} slot="start" />
              Analizar con IA
            </IonButton>
          )}
          
          {allSaved && (
            <IonButton size="small" color="success" onClick={handleFinish}>
              <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar
            </IonButton>
          )}
        </div>

        {loading && exerciseCorrections.length === 0 && (
          <div className="exercise-correction-loading"><IonSpinner /></div>
        )}

        {exerciseCorrections.length === 0 && !loading && (
          <EmptyState
            icon="📝"
            title="Sin correcciones"
            subtitle={`Sube el ejercicio de ${exerciseStudent?.name || 'este alumno'}`}
            actionLabel="Subir"
            onAction={handleUploadClick}
          />
        )}

        <div className="exercise-correction-scans">
          {exerciseCorrections.map((correction, i) => {
            const local = localGrades[correction.id] || { grade: correction.grade, notes: '', studentId: correction.studentId || '' };
            const isSaved = !!correction.savedAt;
            return (
              <ScanCard
                key={correction.id}
                index={i}
                aiAnalysis={correction.aiAnalysis}
                selectedStudentId={local.studentId}
                students={students}
                maxScore={totalPoints}
                grade={local.grade}
                teacherNotes={local.notes}
                saved={isSaved}
                paperUrl={getFullPaperUrl(correction.paperUrl) || undefined}
                onStudentChange={(sid) => handleStudentChange(correction.id, sid)}
                onGradeChange={(g) => handleGradeChange(correction.id, g)}
                onNotesChange={(n) => handleNotesChange(correction.id, n)}
                onSave={() => handleSavePaper(correction.id)}
                onProcessAI={() => handleProcessAI(correction.id)}
                onPreviewPaper={correction.paperUrl ? () => setPreviewUrl(getFullPaperUrl(correction.paperUrl)!) : undefined}
                saving={saving[correction.id]}
                aiProcessing={aiProcessing[correction.id]}
                aiError={aiErrors[correction.id]}
              />
            );
          })}
        </div>

        {!allSaved && exerciseCorrections.length > 0 && (
          <div className="exercise-correction-finish">
            <IonButton expand="block" color="success" onClick={handleFinish}>
              <IonIcon icon={checkmarkCircleOutline} slot="start" /> Finalizar corrección
            </IonButton>
          </div>
        )}

        <IonModal isOpen={!!previewUrl} onDidDismiss={() => setPreviewUrl(null)} className="paper-preview-modal">
          <IonHeader>
            <IonToolbar>
              <IonTitle>Vista previa</IonTitle>
              <IonButtons slot="end">
                <IonButton onClick={() => setPreviewUrl(null)}>
                  <IonIcon icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent className="paper-preview-content">
            {previewUrl && (
              <div className="paper-preview-container">
                <img src={previewUrl} alt="Ejercicio" className="paper-preview-img" />
              </div>
            )}
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default ExerciseCorrection;
