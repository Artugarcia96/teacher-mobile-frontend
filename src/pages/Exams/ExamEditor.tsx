import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonIcon,
  IonSpinner, IonToggle, IonCheckbox, IonTextarea, IonBadge, IonSegment, IonSegmentButton,
  IonAlert, IonChip, IonList, IonAccordion, IonAccordionGroup,
} from '@ionic/react';
import {
  cloudUploadOutline, documentOutline, checkmarkCircleOutline, sparklesOutline,
  downloadOutline, documentTextOutline, trashOutline, refreshOutline, timeOutline,
  createOutline, chevronForwardOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useClassesStore } from '../../store/classesStore';
import { useTopicsStore } from '../../store/topicsStore';
import { exams as examsApi, classes as classesApi, subjects as subjectsApi } from '../../services/api';
import { Lecture, ExamIterationHistoryItem, SubjectWithTopics } from '../../types';
import ExerciseGeneratorModal from '../../components/ExerciseGeneratorModal';
import ClassSubjectPicker from '../../components/ClassSubjectPicker';
import './ExamEditor.css';

const ExamEditor: React.FC = () => {
  const { examId, classId: urlClassId, subjectId: urlSubjectId } = useParams<{ examId: string; classId?: string; subjectId?: string }>();
  const history = useHistory();
  // isNew if examId is 'new' OR undefined (when coming from /tabs/classes/:classId/exams/new route)
  const isNew = examId === 'new' || examId === undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  const allExams = useExamsStore((s) => s.exams);
  const examsLoading = useExamsStore((s) => s.loading);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const exam = useMemo(() => (isNew ? null : allExams.find((e) => e.id === examId)), [allExams, examId, isNew]);
  const addExam = useExamsStore((s) => s.addExam);
  const generateExam = useExamsStore((s) => s.generateExam);
  const updateExam = useExamsStore((s) => s.updateExam);
  const assignExam = useExamsStore((s) => s.assignExam);
  const deleteExam = useExamsStore((s) => s.deleteExam);

  const topicsLoading = useTopicsStore((s) => s.loading);
  const [topicsBySubject, setTopicsBySubject] = useState<SubjectWithTopics[]>([]);

  // Class-subject pairs for combined dropdown
  interface ClassSubjectPair { classId: string; className: string; subjectId: string; subjectName: string; }
  const [classPairs, setClassPairs] = useState<ClassSubjectPair[]>([]);
  const [pairsLoading, setPairsLoading] = useState(false);

  // Shared fields
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [lectureId, setLectureId] = useState('');
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [lecturesLoading, setLecturesLoading] = useState(false);
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
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
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [numQuestions, setNumQuestions] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');
  const [refinement, setRefinement] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showExerciseModal, setShowExerciseModal] = useState(false);

  // Phase 4: Deadline and iteration
  const [correctionDeadline, setCorrectionDeadline] = useState('');
  const [blankPagesCount, setBlankPagesCount] = useState(0);
  const [iterationInstruction, setIterationInstruction] = useState('');
  const [iterating, setIterating] = useState(false);
  const [iterationError, setIterationError] = useState('');
  const iterateExam = useExamsStore((s) => s.iterateExam);

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

  const [topicsFetching, setTopicsFetching] = useState(false);

  const filteredTopics = useMemo(() => {
    if (!selectedSubjectId) return [];
    const subj = topicsBySubject.find((s) => s.subjectId === selectedSubjectId);
    return subj?.topics || [];
  }, [topicsBySubject, selectedSubjectId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId),
    [classes, classId]
  );

  // Combined class|subject value for the single dropdown
  const comboValue = classId && selectedSubjectId ? `${classId}|${selectedSubjectId}` : '';

  const handleComboChange = (value: string) => {
    if (!value) {
      setClassId('');
      setSelectedSubjectId('');
      setLectureId('');
      return;
    }
    const [cId, sId] = value.split('|');
    if (cId !== classId) {
      setLectureId('');
    }
    setClassId(cId);
    setSelectedSubjectId(sId);
  };

  useEffect(() => { fetchClasses(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch class-subject pairs for combined dropdown
  useEffect(() => {
    setPairsLoading(true);
    subjectsApi.classPairs()
      .then((res) => {
        setClassPairs(res.data.map((p: any) => ({
          classId: p.class_id,
          className: p.class_name,
          subjectId: p.subject_id,
          subjectName: p.subject_name,
        })));
      })
      .catch(() => setClassPairs([]))
      .finally(() => setPairsLoading(false));
  }, []);
  
  useEffect(() => {
    if (!isNew && examId) {
      fetchExams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, examId]);

  // Redirect if exam not found after loading (only for edit mode with specific examId)
  useEffect(() => {
    if (!isNew && examId && examId !== 'new' && !examsLoading && allExams.length > 0 && !exam) {
      console.error('Exam not found, redirecting to create new exam');
      history.replace('/tabs/exams/new');
    }
  }, [isNew, examId, examsLoading, allExams, exam, history]);

  useEffect(() => {
    if (exam) {
      setName(exam.name);
      setClassId(exam.classId || '');
      setLectureId(exam.lectureId || '');
      setDate(exam.date);
      setMaxScore(exam.maxScore);
      setIsPersonalized(exam.isPersonalized || false);
      setCorrectionDeadline(exam.correctionDeadline || '');
      setBlankPagesCount(exam.blankPagesCount || 0);
    } else if (isNew) {
      if (urlClassId) setClassId(urlClassId);
      if (urlSubjectId) setSelectedSubjectId(urlSubjectId);
    }
  }, [exam, isNew, urlClassId, urlSubjectId]);

  // Auto-set correction deadline to 7 days after exam date if not set
  useEffect(() => {
    if (isNew && date && !correctionDeadline) {
      const examDate = new Date(date);
      examDate.setDate(examDate.getDate() + 7);
      const deadlineStr = `${examDate.getFullYear()}-${String(examDate.getMonth() + 1).padStart(2, '0')}-${String(examDate.getDate()).padStart(2, '0')}`;
      setCorrectionDeadline(deadlineStr);
    }
  }, [date, isNew, correctionDeadline]);

  useEffect(() => {
    if (classId) {
      setTopicsFetching(true);
      subjectsApi.topicsForClass(classId)
        .then((res) => {
          const grouped: SubjectWithTopics[] = res.data.map((s: any) => ({
            subjectId: s.subject_id,
            subjectName: s.subject_name,
            topics: (s.topics || []).map((t: any) => ({
              id: t.id,
              subjectId: s.subject_id,
              subjectName: s.subject_name,
              name: t.name,
              order: t.order,
              materialCount: t.material_count || 0,
            })),
          }));
          setTopicsBySubject(grouped);
          // Pre-select subject if coming from a subject-scoped route
          if (urlSubjectId && grouped.some(s => s.subjectId === urlSubjectId)) {
            setSelectedSubjectId(urlSubjectId);
          }
        })
        .catch(() => setTopicsBySubject([]))
        .finally(() => setTopicsFetching(false));
      fetchLectures(classId);
    } else {
      setLectures([]);
      setTopicsBySubject([]);
    }
    if (!urlSubjectId) {
      setSelectedSubjectId('');
    }
    setSelectedTopicIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

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
    if (!isNew && !exam) return; // Should not happen due to redirect effect
    
    setSaving(true);
    try {
      if (isNew) {
        const id = await addExam({
          name: name.trim(),
          classId: classId || undefined,
          lectureId: lectureId || undefined,
          subjectId: selectedSubjectId || undefined,
          date,
          maxScore,
          isPersonalized,
          blankPagesCount: isPersonalized ? blankPagesCount : 0,
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
      if (urlClassId) {
        history.replace(`/tabs/classes/${urlClassId}`);
      } else {
        history.replace('/tabs/classes');
      }
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
        subject_id: selectedSubjectId || undefined,
        topic_ids: selectedTopicIds,
        name: name.trim(),
        exam_date: date,
        num_questions: numQuestions,
        max_score: maxScore,
        difficulty,
        refinement_prompt: refinement || undefined,
        is_personalized: isPersonalized,
        correction_deadline: correctionDeadline || undefined,
        blank_pages_count: blankPagesCount,
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

  const handleIterate = async () => {
    if (!exam || !iterationInstruction.trim()) return;
    setIterating(true);
    setIterationError('');
    try {
      await iterateExam(exam.id, { instruction: iterationInstruction.trim() });
      setIterationInstruction('');
    } catch (err: any) {
      setIterationError(err.response?.data?.detail || 'Error al ajustar el examen');
    } finally {
      setIterating(false);
    }
  };

  const applyQuickIteration = (instruction: string) => {
    setIterationInstruction(instruction);
  };

  const getDeadlineStatusColor = (status?: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'ok': return 'success';
      case 'soon': return 'warning';
      case 'urgent': return 'danger';
      case 'overdue': return 'danger';
      default: return 'medium';
    }
  };

  const getDeadlineStatusText = (status?: string) => {
    switch (status) {
      case 'completed': return 'Corregido';
      case 'ok': return 'A tiempo';
      case 'soon': return 'Próximo';
      case 'urgent': return 'Urgente';
      case 'overdue': return 'Atrasado';
      default: return '';
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={urlClassId ? `/tabs/classes/${urlClassId}` : '/tabs/classes'} text="" />
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
              {/* Combined class + subject selector */}
              <div className="form-item-standalone">
                <label className="form-item-label">Clase y asignatura</label>
                <ClassSubjectPicker
                  pairs={urlClassId ? classPairs.filter(p => p.classId === urlClassId) : classPairs}
                  loading={pairsLoading}
                  value={classId && selectedSubjectId ? { classId, subjectId: selectedSubjectId } : null}
                  onChange={(cId, sId) => {
                    if (cId !== classId) setLectureId('');
                    setClassId(cId);
                    setSelectedSubjectId(sId);
                    setSelectedTopicIds([]);
                  }}
                />
              </div>

              {/* Topics selection - only for selected subject */}
              {selectedSubjectId && (
                <div className="gen-topics">
                  <span className="gen-topics__label">
                    Temas del examen
                    {selectedTopicIds.length > 0 && (
                      <IonBadge color="primary" className="gen-topics__count">{selectedTopicIds.length}</IonBadge>
                    )}
                  </span>
                  {filteredTopics.length === 0 ? (
                    <div className="gen-topics__empty">
                      <p>No hay temas en esta asignatura.</p>
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
                      {filteredTopics.map((topic) => (
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

                  {/* Correction deadline */}
                  <IonItem lines="none" className="form-item">
                    <IonInput
                      type="date"
                      value={correctionDeadline}
                      onIonInput={(e) => setCorrectionDeadline(e.detail.value ?? '')}
                      label="Plazo corrección"
                      labelPlacement="stacked"
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
                <div className="form-item-standalone">
                  <label className="form-item-label">Clase y asignatura</label>
                  <ClassSubjectPicker
                    pairs={urlClassId ? classPairs.filter(p => p.classId === urlClassId) : classPairs}
                    loading={pairsLoading}
                    value={classId && selectedSubjectId ? { classId, subjectId: selectedSubjectId } : null}
                    onChange={(cId, sId) => {
                      if (cId !== classId) setLectureId('');
                      setClassId(cId);
                      setSelectedSubjectId(sId);
                    }}
                  />
                </div>
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
                <>
                  <div className="gen-personalize__info">
                    <IonIcon icon={sparklesOutline} />
                    <span>
                      Se generará 1 copia por alumno ({selectedClass.studentCount} alumnos) con su código impreso.
                      Al corregir con subida masiva, la IA detectará los códigos automáticamente.
                    </span>
                  </div>
                  <IonItem lines="none" className="form-item">
                    <IonLabel position="stacked">Hojas en blanco por alumno</IonLabel>
                    <IonSelect value={blankPagesCount} onIonChange={(e) => setBlankPagesCount(e.detail.value)} interface="popover">
                      <IonSelectOption value={0}>Ninguna</IonSelectOption>
                      <IonSelectOption value={1}>1 hoja</IonSelectOption>
                      <IonSelectOption value={2}>2 hojas</IonSelectOption>
                      <IonSelectOption value={3}>3 hojas</IonSelectOption>
                    </IonSelect>
                  </IonItem>
                </>
              )}
            </div>
          )}

          {/* ─── DEADLINE STATUS (existing exams) ─── */}
          {exam && !isNew && exam.correctionDeadline && (
            <div className="exam-deadline-section">
              <div className="exam-deadline-header">
                <IonIcon icon={timeOutline} />
                <span>Plazo de corrección: {new Date(exam.correctionDeadline).toLocaleDateString('es-ES')}</span>
                {exam.deadlineStatus && (
                  <IonBadge color={getDeadlineStatusColor(exam.deadlineStatus)}>
                    {getDeadlineStatusText(exam.deadlineStatus)}
                  </IonBadge>
                )}
              </div>
            </div>
          )}

          {/* ─── DOWNLOAD SECTION (existing exams with documents) ─── */}
          {exam && !isNew && (exam.documentUrl || exam.hasGeneratedQuestions) && (
            <div className="exam-downloads">
              <span className="exam-downloads__label">Descargas disponibles</span>
              <div className="exam-downloads__buttons">
                <IonButton
                  fill="outline"
                  size="small"
                  onClick={() => handleDownload(examsApi.downloadExamUrl)}
                >
                  <IonIcon icon={downloadOutline} slot="start" />
                  {exam.isPersonalized 
                    ? 'PDF Personalizado (todos los alumnos)' 
                    : exam.hasGeneratedQuestions 
                      ? 'Examen (IA)' 
                      : 'Documento PDF'}
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
                  El PDF personalizado contiene una copia por alumno con su código impreso para detección automática al corregir.
                </p>
              )}
              {exam.hasGeneratedQuestions && !exam.isPersonalized && (
                <p className="exam-downloads__hint">
                  Examen generado por IA con solucionario incluido.
                </p>
              )}
            </div>
          )}

          {/* ─── ITERATION SECTION (AI-generated exams) ─── */}
          {exam && !isNew && exam.hasGeneratedQuestions && exam.status !== 'corrected' && (
            <div className="exam-iteration-section">
              <div className="exam-iteration-header">
                <IonIcon icon={createOutline} />
                <span>Ajustar examen</span>
              </div>
              <p className="exam-iteration-description">
                Describe los cambios que quieres hacer y la IA ajustará el examen manteniendo la estructura.
              </p>
              
              <div className="exam-iteration-quick">
                <IonChip outline onClick={() => applyQuickIteration('Simplifica las preguntas')}>
                  Simplificar
                </IonChip>
                <IonChip outline onClick={() => applyQuickIteration('Añade una pregunta más del mismo estilo')}>
                  +1 pregunta
                </IonChip>
                <IonChip outline onClick={() => applyQuickIteration('Convierte algunas preguntas a tipo test')}>
                  Tipo test
                </IonChip>
              </div>

              <IonItem lines="none" className="form-item">
                <IonTextarea
                  value={iterationInstruction}
                  onIonInput={(e) => setIterationInstruction(e.detail.value ?? '')}
                  placeholder="Ej: Haz la pregunta 3 más fácil, añade más problemas de geometría..."
                  rows={3}
                />
              </IonItem>

              {iterationError && <p className="gen-error">{iterationError}</p>}

              <IonButton
                expand="block"
                fill="outline"
                onClick={handleIterate}
                disabled={iterating || !iterationInstruction.trim()}
              >
                {iterating ? (
                  <><IonSpinner name="crescent" /> Aplicando cambios...</>
                ) : (
                  <><IonIcon icon={refreshOutline} slot="start" /> Aplicar cambios</>
                )}
              </IonButton>

              {/* Version history */}
              {exam.iterationHistory && exam.iterationHistory.length > 0 && (
                <IonAccordionGroup className="exam-iteration-history">
                  <IonAccordion value="history">
                    <IonItem slot="header" lines="none">
                      <IonLabel>
                        Historial de versiones ({exam.iterationHistory.length + 1} versiones)
                      </IonLabel>
                    </IonItem>
                    <div slot="content" className="iteration-history-content">
                      {exam.iterationHistory.map((item: ExamIterationHistoryItem, idx: number) => (
                        <div key={idx} className="iteration-history-item">
                          <div className="iteration-history-version">
                            <IonBadge color="medium">v{item.version}</IonBadge>
                            <span className="iteration-history-time">
                              {new Date(item.timestamp).toLocaleString('es-ES')}
                            </span>
                          </div>
                          <p className="iteration-history-instruction">{item.instruction}</p>
                          {item.changes_made && item.changes_made.length > 0 && (
                            <ul className="iteration-history-changes">
                              {item.changes_made.map((change: string, cidx: number) => (
                                <li key={cidx}>{change}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </IonAccordion>
                </IonAccordionGroup>
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
              disabled={!name.trim() || !selectedSubjectId || saving}
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
