import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonIcon,
  IonSpinner, IonToggle, IonCheckbox, IonTextarea, IonBadge, IonSegment, IonSegmentButton,
  IonAlert,
} from '@ionic/react';
import {
  cloudUploadOutline, documentOutline, checkmarkCircleOutline, sparklesOutline,
  downloadOutline, documentTextOutline, trashOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useClassesStore } from '../../store/classesStore';
import { useTopicsStore } from '../../store/topicsStore';
import { exams as examsApi, classes as classesApi } from '../../services/api';
import { Lecture } from '../../types';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import './ExamEditor.css';

const ExamEditor: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const history = useHistory();
  const isNew = examId === 'new';
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  const allExams = useExamsStore((s) => s.exams);
  const exam = useMemo(() => (isNew ? null : allExams.find((e) => e.id === examId)), [allExams, examId, isNew]);
  const addExam = useExamsStore((s) => s.addExam);
  const generateExam = useExamsStore((s) => s.generateExam);
  const updateExam = useExamsStore((s) => s.updateExam);
  const assignExam = useExamsStore((s) => s.assignExam);
  const deleteExam = useExamsStore((s) => s.deleteExam);

  const topicsList = useTopicsStore((s) => s.topics);
  const topicsLoading = useTopicsStore((s) => s.loading);
  const fetchTopics = useTopicsStore((s) => s.fetchTopics);

  // Shared fields
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [lectureId, setLectureId] = useState('');
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [lecturesLoading, setLecturesLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [maxScore, setMaxScore] = useState(10);
  const [saving, setSaving] = useState(false);

  // Mode toggle (new exams only)
  const [mode, setMode] = useState<'upload' | 'generate'>('upload');

  // Upload mode
  const [file, setFile] = useState<File | null>(null);

  // Shared personalization
  const [isPersonalized, setIsPersonalized] = useState(false);

  // Delete confirmation
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);

  // Generate mode
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [refinement, setRefinement] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showExerciseModal, setShowExerciseModal] = useState(false);

  // Fetch lectures when class changes
  const fetchLectures = useCallback(async (cId: string) => {
    if (!cId) {
      setLectures([]);
      return;
    }
    setLecturesLoading(true);
    try {
      const res = await classesApi.get(cId);
      setLectures(res.data.lectures || []);
    } catch (err) {
      console.error('Failed to fetch lectures:', err);
      setLectures([]);
    } finally {
      setLecturesLoading(false);
    }
  }, []);

  const classTopics = useMemo(
    () => topicsList.filter((t) => t.classId === classId),
    [topicsList, classId]
  );

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId),
    [classes, classId]
  );

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  useEffect(() => {
    if (exam) {
      setName(exam.name);
      setClassId(exam.classId || '');
      setLectureId(exam.lectureId || '');
      setDate(exam.date);
      setMaxScore(exam.maxScore);
      setIsPersonalized(exam.isPersonalized || false);
    }
  }, [exam]);

  useEffect(() => {
    if (classId) {
      fetchTopics(classId);
      fetchLectures(classId);
    } else {
      setLectures([]);
    }
  }, [classId, fetchTopics, fetchLectures]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId) ? prev.filter((id) => id !== topicId) : [...prev, topicId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const id = await addExam({ 
          name: name.trim(), 
          classId: classId || undefined, 
          lectureId: lectureId || undefined,
          date, 
          maxScore, 
          isPersonalized 
        }, file || undefined);
        history.replace(`/tabs/exams/${id}`);
      } else if (exam) {
        await updateExam(exam.id, { name, classId: classId || undefined, lectureId: lectureId || undefined, date, maxScore });
        history.goBack();
      }
    } catch (err) {
      console.error('Failed to save exam:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = (urlFn: (id: string) => string) => {
    if (!exam) return;
    const token = localStorage.getItem('access_token');
    const url = urlFn(exam.id);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = exam.name + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => console.error('Download error:', err));
  };

  const handleDelete = async () => {
    if (!exam) return;
    try {
      await deleteExam(exam.id);
      history.replace('/tabs/exams');
    } catch (err) {
      console.error('Failed to delete exam:', err);
    }
  };

  const handleGenerate = async () => {
    if (!name.trim() || selectedTopicIds.length === 0) return;
    setGenerating(true);
    setGenError('');
    try {
      const id = await generateExam({
        class_id: classId || undefined,
        lecture_id: lectureId || undefined,
        topic_ids: selectedTopicIds,
        name: name.trim(),
        exam_date: date,
        num_questions: numQuestions,
        max_score: maxScore,
        difficulty,
        refinement_prompt: refinement || undefined,
        is_personalized: isPersonalized,
      });
      history.replace(`/tabs/exams/${id}`);
    } catch (err: any) {
      setGenError(err.response?.data?.detail || 'Error al generar el examen');
    } finally {
      setGenerating(false);
    }
  };

  const handleStartCorrection = async () => {
    if (exam) {
      if (exam.status === 'uploaded') await assignExam(exam.id);
      history.push(`/correction/${exam.id}`);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/exams" text="" />
          </IonButtons>
          <IonTitle>{isNew ? 'Nuevo examen' : name || 'Editar'}</IonTitle>
          {!isNew && (
            <IonButtons slot="end">
              <IonButton color="danger" onClick={() => setShowDeleteAlert(true)}>
                <IonIcon icon={trashOutline} />
              </IonButton>
            </IonButtons>
          )}
        </IonToolbar>
        {isNew && (
          <IonToolbar>
            <IonSegment value={mode} onIonChange={(e) => setMode(e.detail.value as 'upload' | 'generate')}>
              <IonSegmentButton value="upload"><IonLabel>Subir documento</IonLabel></IonSegmentButton>
              <IonSegmentButton value="generate"><IonLabel>Generar con IA</IonLabel></IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
      </IonHeader>

      <IonContent className="exam-editor-content">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileSelect}
        />

        <div className="exam-editor-form">
          {/* ─── UPLOAD MODE (existing + editing) ─── */}
          {(mode === 'upload' || !isNew) && (
            <IonItem lines="none" className="upload-item" button onClick={handleUploadClick}>
              <IonIcon
                icon={file || exam?.documentUrl ? documentOutline : cloudUploadOutline}
                slot="start"
                className="upload-item-icon"
              />
              <IonLabel>
                <h3>{file?.name || exam?.documentUrl ? (file?.name || 'Documento subido') : 'Subir documento'}</h3>
                <p>{file || exam?.documentUrl ? 'Toca para cambiar' : 'PDF o imagen'}</p>
              </IonLabel>
              {(file || exam?.documentUrl) && (
                <IonIcon icon={checkmarkCircleOutline} slot="end" className="upload-success-icon" />
              )}
            </IonItem>
          )}

          {/* ─── GENERATE MODE ─── */}
          {mode === 'generate' && isNew && (
            <div className="gen-section">
              {/* Class selector */}
              <IonItem lines="none" className="form-item">
                <IonLabel position="stacked">Clase (opcional)</IonLabel>
                <IonSelect
                  value={classId}
                  onIonChange={(e) => { 
                    setClassId(e.detail.value || ''); 
                    setLectureId('');
                    setSelectedTopicIds([]); 
                  }}
                  interface="popover"
                  placeholder="Global / Transversal"
                >
                  <IonSelectOption value="">Global / Transversal</IonSelectOption>
                  {classes.map((c) => (
                    <IonSelectOption key={c.id} value={c.id}>{c.name} — {c.subject}</IonSelectOption>
                  ))}
                </IonSelect>
              </IonItem>

              {/* Lecture selector - only if class is selected */}
              {classId && (
                <IonItem lines="none" className="form-item">
                  <IonLabel position="stacked">Asignatura (opcional)</IonLabel>
                  {lecturesLoading ? (
                    <IonSpinner name="dots" />
                  ) : (
                    <IonSelect
                      value={lectureId}
                      onIonChange={(e) => setLectureId(e.detail.value || '')}
                      interface="popover"
                      placeholder="Todas las asignaturas"
                    >
                      <IonSelectOption value="">Todas las asignaturas</IonSelectOption>
                      {lectures.map((l) => (
                        <IonSelectOption key={l.id} value={l.id}>{l.name}</IonSelectOption>
                      ))}
                    </IonSelect>
                  )}
                </IonItem>
              )}

              {/* Topics selection */}
              {classId && (
                <div className="gen-topics">
                  <span className="gen-topics__label">
                    Temas del examen
                    {selectedTopicIds.length > 0 && (
                      <IonBadge color="primary" className="gen-topics__count">{selectedTopicIds.length}</IonBadge>
                    )}
                  </span>
                  {topicsLoading ? (
                    <div className="gen-topics__loading"><IonSpinner name="dots" /></div>
                  ) : classTopics.length === 0 ? (
                    <div className="gen-topics__empty">
                      <p>No hay temas para esta clase.</p>
                      <IonButton
                        size="small"
                        fill="outline"
                        onClick={() => history.push(`/tabs/classes/${classId}/topics`)}
                      >
                        Añadir temas
                      </IonButton>
                    </div>
                  ) : (
                    <div className="gen-topics__list">
                      {classTopics.map((topic) => (
                        <div
                          key={topic.id}
                          className={`gen-topic-chip ${selectedTopicIds.includes(topic.id) ? 'gen-topic-chip--active' : ''}`}
                          onClick={() => toggleTopic(topic.id)}
                        >
                          <IonCheckbox
                            checked={selectedTopicIds.includes(topic.id)}
                            className="gen-topic-chip__check"
                          />
                          <span className="gen-topic-chip__name">{topic.name}</span>
                          <IonBadge color="medium" className="gen-topic-chip__materials">
                            {topic.materialCount}
                          </IonBadge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Configuration */}
              {selectedTopicIds.length > 0 && (
                <div className="gen-config">
                  <div className="gen-config__row">
                    <IonItem lines="none" className="form-item form-item-half">
                      <IonLabel position="stacked">Preguntas</IonLabel>
                      <IonSelect value={numQuestions} onIonChange={(e) => setNumQuestions(e.detail.value)} interface="popover">
                        {[5, 8, 10, 12, 15, 20].map((n) => (
                          <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                        ))}
                      </IonSelect>
                    </IonItem>
                    <IonItem lines="none" className="form-item form-item-half">
                      <IonLabel position="stacked">Dificultad</IonLabel>
                      <IonSelect value={difficulty} onIonChange={(e) => setDifficulty(e.detail.value)} interface="popover">
                        <IonSelectOption value="easy">Fácil</IonSelectOption>
                        <IonSelectOption value="medium">Media</IonSelectOption>
                        <IonSelectOption value="hard">Difícil</IonSelectOption>
                      </IonSelect>
                    </IonItem>
                  </div>

                  <IonItem lines="none" className="form-item">
                    <IonTextarea
                      value={refinement}
                      onIonInput={(e) => setRefinement(e.detail.value ?? '')}
                      placeholder="Instrucciones adicionales (opcional)"
                      rows={2}
                    />
                  </IonItem>

                </div>
              )}
            </div>
          )}

          {/* ─── SHARED FIELDS (both modes) ─── */}
          {mode === 'upload' && (
            <div className="form-grid">
              <IonItem lines="none" className="form-item">
                <IonInput
                  value={name}
                  onIonInput={(e) => setName(e.detail.value ?? '')}
                  placeholder="Nombre del examen"
                  label="Nombre"
                  labelPlacement="stacked"
                />
              </IonItem>

              {isNew && (
                <>
                  <IonItem lines="none" className="form-item">
                    <IonLabel position="stacked">Clase (opcional)</IonLabel>
                    <IonSelect
                      value={classId}
                      onIonChange={(e) => { 
                        setClassId(e.detail.value || ''); 
                        setLectureId('');
                      }}
                      interface="popover"
                      placeholder="Global / Transversal"
                    >
                      <IonSelectOption value="">Global / Transversal</IonSelectOption>
                      {classes.map((c) => (
                        <IonSelectOption key={c.id} value={c.id}>{c.name} — {c.subject}</IonSelectOption>
                      ))}
                    </IonSelect>
                  </IonItem>

                  {classId && (
                    <IonItem lines="none" className="form-item">
                      <IonLabel position="stacked">Asignatura (opcional)</IonLabel>
                      {lecturesLoading ? (
                        <IonSpinner name="dots" />
                      ) : (
                        <IonSelect
                          value={lectureId}
                          onIonChange={(e) => setLectureId(e.detail.value || '')}
                          interface="popover"
                          placeholder="Todas las asignaturas"
                        >
                          <IonSelectOption value="">Todas las asignaturas</IonSelectOption>
                          {lectures.map((l) => (
                            <IonSelectOption key={l.id} value={l.id}>{l.name}</IonSelectOption>
                          ))}
                        </IonSelect>
                      )}
                    </IonItem>
                  )}
                </>
              )}

              <div className="form-row">
                <IonItem lines="none" className="form-item form-item-half">
                  <IonInput
                    type="date"
                    value={date}
                    onIonInput={(e) => setDate(e.detail.value ?? '')}
                    label="Fecha"
                    labelPlacement="stacked"
                  />
                </IonItem>
                <IonItem lines="none" className="form-item form-item-half">
                  <IonInput
                    type="number"
                    value={maxScore}
                    min={1}
                    onIonInput={(e) => {
                      const v = parseFloat(e.detail.value ?? '');
                      if (!isNaN(v) && v > 0) setMaxScore(v);
                    }}
                    label="Nota máx."
                    labelPlacement="stacked"
                  />
                </IonItem>
              </div>
            </div>
          )}

          {mode === 'generate' && isNew && selectedTopicIds.length > 0 && (
            <div className="form-grid" style={{ marginTop: 'var(--space-md)' }}>
              <IonItem lines="none" className="form-item">
                <IonInput
                  value={name}
                  onIonInput={(e) => setName(e.detail.value ?? '')}
                  placeholder="Nombre del examen"
                  label="Nombre"
                  labelPlacement="stacked"
                />
              </IonItem>
              <div className="form-row">
                <IonItem lines="none" className="form-item form-item-half">
                  <IonInput
                    type="date"
                    value={date}
                    onIonInput={(e) => setDate(e.detail.value ?? '')}
                    label="Fecha"
                    labelPlacement="stacked"
                  />
                </IonItem>
                <IonItem lines="none" className="form-item form-item-half">
                  <IonInput
                    type="number"
                    value={maxScore}
                    min={1}
                    onIonInput={(e) => {
                      const v = parseFloat(e.detail.value ?? '');
                      if (!isNaN(v) && v > 0) setMaxScore(v);
                    }}
                    label="Nota máx."
                    labelPlacement="stacked"
                  />
                </IonItem>
              </div>
            </div>
          )}

          {/* ─── PERSONALIZATION (both modes, new exams only) ─── */}
          {isNew && classId && (
            <div className="gen-personalize">
              <IonItem lines="none" className="gen-personalize__toggle">
                <IonLabel>
                  <h3>Personalizar por alumno</h3>
                  <p>Cada copia lleva el código del alumno impreso para detección automática al corregir</p>
                </IonLabel>
                <IonToggle
                  checked={isPersonalized}
                  onIonChange={(e) => setIsPersonalized(e.detail.checked)}
                  slot="end"
                />
              </IonItem>
              {isPersonalized && selectedClass && (
                <div className="gen-personalize__info">
                  <IonIcon icon={sparklesOutline} />
                  <span>
                    Se generará 1 copia por alumno ({selectedClass.studentCount} alumnos) con su código impreso.
                    Al corregir con subida masiva, la IA detectará los códigos automáticamente.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ─── DOWNLOAD SECTION (existing exams with documents) ─── */}
          {exam && !isNew && (exam.documentUrl || exam.hasGeneratedQuestions) && (
            <div className="exam-downloads">
              <span className="exam-downloads__label">Descargas</span>
              <div className="exam-downloads__buttons">
                <IonButton
                  fill="outline"
                  size="small"
                  onClick={() => handleDownload(examsApi.downloadExamUrl)}
                >
                  <IonIcon icon={downloadOutline} slot="start" />
                  {exam.isPersonalized ? 'Examen personalizado' : 'Examen'}
                </IonButton>

                {exam.hasGeneratedQuestions && (
                  <IonButton
                    fill="outline"
                    size="small"
                    onClick={() => handleDownload(examsApi.downloadSolutionsUrl)}
                  >
                    <IonIcon icon={documentTextOutline} slot="start" />
                    Solucionario
                  </IonButton>
                )}
              </div>
              {exam.isPersonalized && (
                <p className="exam-downloads__hint">
                  Cada copia tiene el código del alumno impreso. Al corregir con subida masiva, la IA los detectará automáticamente.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ─── BOTTOM ACTIONS ─── */}
        <div className="exam-editor-actions">
          {/* Upload mode actions */}
          {mode === 'upload' && (
            <IonButton
              expand="block"
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="save-btn"
            >
              {saving ? <IonSpinner name="crescent" /> : isNew ? 'Crear examen' : 'Guardar cambios'}
            </IonButton>
          )}

          {/* Generate mode actions */}
          {mode === 'generate' && isNew && (
            <>
              {genError && <p className="gen-error">{genError}</p>}

              <IonButton
                expand="block"
                onClick={handleGenerate}
                disabled={generating || !name.trim() || selectedTopicIds.length === 0}
                className="save-btn gen-btn"
              >
                {generating ? (
                  <><IonSpinner name="crescent" /> Generando...</>
                ) : (
                  <><IonIcon icon={sparklesOutline} slot="start" /> Generar examen</>
                )}
              </IonButton>
            </>
          )}

          {/* Existing exam actions (both modes) */}
          {exam && exam.status === 'uploaded' && (
            <IonButton expand="block" color="success" onClick={handleStartCorrection}>
              <IonIcon icon={checkmarkCircleOutline} slot="start" />
              Asignar y corregir
            </IonButton>
          )}
          {exam && exam.status === 'assigned' && (
            <IonButton expand="block" color="success" onClick={handleStartCorrection}>
              <IonIcon icon={checkmarkCircleOutline} slot="start" />
              Continuar corrección
            </IonButton>
          )}
          {exam && exam.status === 'corrected' && (
            <>
              <IonButton expand="block" color="primary" onClick={() => history.push(`/correction/${exam.id}`)}>
                <IonIcon icon={checkmarkCircleOutline} slot="start" />
                Ver correcciones
              </IonButton>
              <IonButton expand="block" fill="outline" onClick={() => setShowExerciseModal(true)}>
                <IonIcon icon={sparklesOutline} slot="start" />
                Generar ejercicios
              </IonButton>
            </>
          )}
        </div>

        {exam && exam.status === 'corrected' && (
          <ExerciseGeneratorModal
            isOpen={showExerciseModal}
            onDismiss={() => setShowExerciseModal(false)}
            classId={exam.classId}
            preselectedExamId={exam.id}
          />
        )}

        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Eliminar examen"
          message={`¿Eliminar "${name}"? También se eliminarán las correcciones asociadas.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDelete }
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

export default ExamEditor;
