import { useState, useMemo, useEffect } from 'react';
import {
  IonModal, IonButton, IonSelect, IonSelectOption, IonItem, IonLabel,
  IonBadge, IonTextarea, IonSpinner, IonIcon, IonList, IonCheckbox, IonChip,
  IonSearchbar,
} from '@ionic/react';
import { sparkles, chevronDownOutline, chevronUpOutline, peopleOutline, bookOutline } from 'ionicons/icons';
import { useExamsStore } from '../store/examsStore';
import { useStudentsStore } from '../store/studentsStore';
import { useCorrectionStore } from '../store/correctionStore';
import { useExercisesStore } from '../store/exercisesStore';
import { useTopicsStore } from '../store/topicsStore';
import './BulkExerciseGeneratorModal.css';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  classId: string;
  className: string;
}

const BulkExerciseGeneratorModal: React.FC<Props> = ({
  isOpen, onDismiss, classId, className,
}) => {
  const allExams = useExamsStore((s) => s.exams);
  const allStudents = useStudentsStore((s) => s.students);
  const corrections = useCorrectionStore((s) => s.corrections);
  const generateExercises = useExercisesStore((s) => s.generateExercises);
  const fetchExercises = useExercisesStore((s) => s.fetchExercises);
  const topics = useTopicsStore((s) => s.topics);
  const fetchTopics = useTopicsStore((s) => s.fetchTopics);

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [showStudentList, setShowStudentList] = useState(false);
  const [showTopicList, setShowTopicList] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [difficulty, setDifficulty] = useState<'easier' | 'same' | 'harder'>('same');
  const [numQuestions, setNumQuestions] = useState(5);
  const [refinement, setRefinement] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const studentsInClass = useMemo(
    () => allStudents.filter((s) => s.classId === classId),
    [allStudents, classId]
  );

  const correctedExams = useMemo(
    () => allExams.filter((e) => e.classId === classId && e.status === 'corrected'),
    [allExams, classId]
  );

  const allWeakAreas = useMemo(() => {
    const areas = new Map<string, { count: number; studentIds: Set<string> }>();
    corrections
      .filter((c) => {
        const student = allStudents.find((s) => s.id === c.studentId);
        return student?.classId === classId && c.weakAreas?.length;
      })
      .forEach((c) => {
        c.weakAreas?.forEach((area) => {
          const existing = areas.get(area) || { count: 0, studentIds: new Set<string>() };
          existing.count++;
          if (c.studentId) existing.studentIds.add(c.studentId);
          areas.set(area, existing);
        });
      });
    return Array.from(areas.entries())
      .map(([topic, data]) => ({ topic, count: data.count, studentIds: Array.from(data.studentIds) }))
      .sort((a, b) => b.count - a.count);
  }, [corrections, allStudents, classId]);

  const studentIdsWithIssues = useMemo(() => {
    const ids = new Set<string>();
    corrections
      .filter((c) => {
        const student = allStudents.find((s) => s.id === c.studentId);
        return student?.classId === classId && c.weakAreas && c.weakAreas.length > 0;
      })
      .forEach((c) => {
        if (c.studentId) ids.add(c.studentId);
      });
    return ids;
  }, [corrections, allStudents, classId]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch) return studentsInClass;
    const term = studentSearch.toLowerCase();
    return studentsInClass.filter((s) => s.name.toLowerCase().includes(term));
  }, [studentsInClass, studentSearch]);

  useEffect(() => {
    if (isOpen && classId) {
      fetchTopics(classId);
    }
  }, [isOpen, classId, fetchTopics]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedStudentIds([]);
      setSelectedTopics([]);
      setSelectedExamIds([]);
      setShowStudentList(false);
      setShowTopicList(false);
      setShowOptions(false);
      setExerciseName('');
      setRefinement('');
      setError('');
      setSuccess(false);
      setGenerating(false);
      setStudentSearch('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && studentsInClass.length > 0 && selectedStudentIds.length === 0) {
      if (studentIdsWithIssues.size > 0) {
        setSelectedStudentIds(Array.from(studentIdsWithIssues));
      } else {
        setSelectedStudentIds(studentsInClass.map((s) => s.id));
      }
    }
  }, [isOpen, studentsInClass, studentIdsWithIssues, selectedStudentIds.length]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleGenerate = async () => {
    if (selectedStudentIds.length === 0 || !exerciseName.trim()) return;
    setGenerating(true);
    setError('');
    try {
      await generateExercises({
        studentIds: selectedStudentIds,
        name: exerciseName,
        sourceExamIds: selectedExamIds.length > 0 ? selectedExamIds : undefined,
        focusTopics: selectedTopics.length > 0 ? selectedTopics : undefined,
        refinementPrompt: refinement || undefined,
        difficulty,
        numQuestions,
      });
      setSuccess(true);
      await fetchExercises();
      setTimeout(() => onDismiss(), 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Error al generar ejercicios');
    } finally {
      setGenerating(false);
    }
  };

  const selectedStudentNames = useMemo(() => {
    return selectedStudentIds
      .slice(0, 3)
      .map((id) => allStudents.find((s) => s.id === id)?.name)
      .filter(Boolean);
  }, [selectedStudentIds, allStudents]);

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={0.85}
      breakpoints={[0, 0.85, 1]}
      className="bulk-exercise-modal"
    >
      <div className="bulkex">
        <div className="bulkex__header">
          <h2 className="bulkex__title">Generar ejercicios</h2>
          <p className="bulkex__subtitle">{className}</p>
        </div>

        {studentsInClass.length === 0 ? (
          <div className="bulkex__empty">
            <p>No hay alumnos en esta clase.</p>
            <p>Añade alumnos primero para generar ejercicios.</p>
          </div>
        ) : (
          <>
            {/* Exercise name (required) */}
            <IonItem lines="none" className="bulkex__select">
              <IonLabel position="stacked" style={{ fontSize: '13px', marginBottom: '4px' }}>Nombre *</IonLabel>
              <input
                type="text"
                value={exerciseName}
                onChange={(e) => setExerciseName(e.target.value)}
                placeholder="Nombre del ejercicio"
                style={{
                  width: '100%',
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '14px',
                  padding: '8px 0',
                }}
              />
            </IonItem>

            <div 
              className="bulkex__section"
              onClick={() => setShowStudentList(!showStudentList)}
            >
              <div className="bulkex__section-header">
                <IonIcon icon={peopleOutline} />
                <span className="bulkex__section-title">Alumnos</span>
                <span className="bulkex__section-count">
                  <strong>{selectedStudentIds.length}</strong> seleccionados
                </span>
                <IonIcon icon={showStudentList ? chevronUpOutline : chevronDownOutline} />
              </div>
              {!showStudentList && selectedStudentNames.length > 0 && (
                <p className="bulkex__section-preview">
                  {selectedStudentNames.join(', ')}
                  {selectedStudentIds.length > 3 && ` +${selectedStudentIds.length - 3} más`}
                </p>
              )}
            </div>

            {showStudentList && (
              <div className="bulkex__list-panel">
                <div className="bulkex__quick-actions">
                  <IonChip 
                    color={selectedStudentIds.length === studentsInClass.length ? 'primary' : 'medium'}
                    onClick={(e) => { e.stopPropagation(); setSelectedStudentIds(studentsInClass.map((s) => s.id)); }}
                  >
                    Todos ({studentsInClass.length})
                  </IonChip>
                  <IonChip 
                    color={selectedStudentIds.length === studentIdsWithIssues.size && studentIdsWithIssues.size > 0 ? 'warning' : 'medium'}
                    onClick={(e) => { e.stopPropagation(); setSelectedStudentIds(Array.from(studentIdsWithIssues)); }}
                  >
                    Con problemas ({studentIdsWithIssues.size})
                  </IonChip>
                  <IonChip 
                    color={selectedStudentIds.length === 0 ? 'danger' : 'medium'}
                    onClick={(e) => { e.stopPropagation(); setSelectedStudentIds([]); }}
                  >
                    Ninguno
                  </IonChip>
                </div>
                <IonSearchbar
                  value={studentSearch}
                  onIonInput={(e) => setStudentSearch(e.detail.value ?? '')}
                  placeholder="Buscar alumno..."
                  className="bulkex__search"
                />
                <IonList className="bulkex__checklist">
                  {filteredStudents.map((student) => {
                    const hasIssues = studentIdsWithIssues.has(student.id);
                    return (
                      <IonItem key={student.id} lines="none" className="bulkex__check-item">
                        <IonCheckbox 
                          slot="start" 
                          checked={selectedStudentIds.includes(student.id)}
                          onIonChange={() => toggleStudent(student.id)}
                        />
                        <IonLabel>{student.name}</IonLabel>
                        {hasIssues && <IonBadge color="warning" slot="end">!</IonBadge>}
                      </IonItem>
                    );
                  })}
                </IonList>
              </div>
            )}

            <div 
              className="bulkex__section"
              onClick={() => setShowTopicList(!showTopicList)}
            >
              <div className="bulkex__section-header">
                <IonIcon icon={bookOutline} />
                <span className="bulkex__section-title">Temas a reforzar</span>
                <span className="bulkex__section-count">
                  {selectedTopics.length > 0 ? (
                    <><strong>{selectedTopics.length}</strong> seleccionados</>
                  ) : (
                    <span className="bulkex__auto">Automático</span>
                  )}
                </span>
                <IonIcon icon={showTopicList ? chevronUpOutline : chevronDownOutline} />
              </div>
              {!showTopicList && selectedTopics.length > 0 && (
                <div className="bulkex__topic-preview">
                  {selectedTopics.slice(0, 3).map((t) => (
                    <IonBadge key={t} color="warning">{t}</IonBadge>
                  ))}
                  {selectedTopics.length > 3 && (
                    <IonBadge color="medium">+{selectedTopics.length - 3}</IonBadge>
                  )}
                </div>
              )}
            </div>

            {showTopicList && (
              <div className="bulkex__list-panel">
                <p className="bulkex__help-text">
                  Selecciona temas específicos o deja vacío para usar las áreas débiles detectadas de cada alumno.
                </p>
                {allWeakAreas.length > 0 ? (
                  <>
                    <div className="bulkex__quick-actions">
                      <IonChip 
                        color={selectedTopics.length === 0 ? 'primary' : 'medium'}
                        onClick={(e) => { e.stopPropagation(); setSelectedTopics([]); }}
                      >
                        Automático
                      </IonChip>
                      <IonChip 
                        color={selectedTopics.length === allWeakAreas.length ? 'warning' : 'medium'}
                        onClick={(e) => { e.stopPropagation(); setSelectedTopics(allWeakAreas.map((a) => a.topic)); }}
                      >
                        Todos los detectados
                      </IonChip>
                    </div>
                    <IonList className="bulkex__checklist">
                      {allWeakAreas.map((area) => (
                        <IonItem key={area.topic} lines="none" className="bulkex__check-item">
                          <IonCheckbox 
                            slot="start" 
                            checked={selectedTopics.includes(area.topic)}
                            onIonChange={() => toggleTopic(area.topic)}
                          />
                          <IonLabel>
                            <h3>{area.topic}</h3>
                            <p>{area.studentIds.length} alumno{area.studentIds.length !== 1 ? 's' : ''}</p>
                          </IonLabel>
                          <IonBadge color="warning" slot="end">{area.count}</IonBadge>
                        </IonItem>
                      ))}
                    </IonList>
                  </>
                ) : topics.length > 0 ? (
                  <IonList className="bulkex__checklist">
                    {topics.map((topic) => (
                      <IonItem key={topic.id} lines="none" className="bulkex__check-item">
                        <IonCheckbox 
                          slot="start" 
                          checked={selectedTopics.includes(topic.name)}
                          onIonChange={() => toggleTopic(topic.name)}
                        />
                        <IonLabel>{topic.name}</IonLabel>
                      </IonItem>
                    ))}
                  </IonList>
                ) : (
                  <p className="bulkex__empty-text">No hay temas definidos ni áreas débiles detectadas.</p>
                )}
              </div>
            )}

            {correctedExams.length > 0 && (
              <div className="bulkex__field">
                <IonItem lines="none" className="bulkex__select">
                  <IonLabel>Basado en examen (opcional)</IonLabel>
                  <IonSelect
                    value={selectedExamIds[0] || ''}
                    onIonChange={(e) => setSelectedExamIds(e.detail.value ? [e.detail.value] : [])}
                    interface="popover"
                    placeholder="Ninguno"
                  >
                    <IonSelectOption value="">Ninguno</IonSelectOption>
                    {correctedExams.map((exam) => (
                      <IonSelectOption key={exam.id} value={exam.id}>
                        {exam.name}
                      </IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
              </div>
            )}

            <button
              className="bulkex__options-toggle"
              onClick={() => setShowOptions(!showOptions)}
            >
              <span>Opciones avanzadas</span>
              <IonIcon icon={showOptions ? chevronUpOutline : chevronDownOutline} />
            </button>

            {showOptions && (
              <div className="bulkex__options">
                <IonItem lines="none" className="bulkex__select">
                  <IonLabel>Dificultad</IonLabel>
                  <IonSelect value={difficulty} onIonChange={(e) => setDifficulty(e.detail.value)} interface="popover">
                    <IonSelectOption value="easier">Más fácil</IonSelectOption>
                    <IonSelectOption value="same">Mismo nivel</IonSelectOption>
                    <IonSelectOption value="harder">Más difícil</IonSelectOption>
                  </IonSelect>
                </IonItem>
                <IonItem lines="none" className="bulkex__select">
                  <IonLabel>Preguntas</IonLabel>
                  <IonSelect value={numQuestions} onIonChange={(e) => setNumQuestions(e.detail.value)} interface="popover">
                    {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                      <IonSelectOption key={n} value={n}>{n}</IonSelectOption>
                    ))}
                  </IonSelect>
                </IonItem>
                <IonItem lines="none" className="bulkex__textarea-item">
                  <IonTextarea
                    value={refinement}
                    onIonInput={(e) => setRefinement(e.detail.value ?? '')}
                    placeholder="Instrucciones adicionales (opcional)"
                    rows={2}
                  />
                </IonItem>
              </div>
            )}

            {error && (
              <div className="bulkex__error">
                <IonBadge color="danger">{error}</IonBadge>
              </div>
            )}

            {success ? (
              <div className="bulkex__success">
                <span className="bulkex__success-icon">✓</span>
                <span>Ejercicios generados para {selectedStudentIds.length} alumno{selectedStudentIds.length !== 1 ? 's' : ''}</span>
              </div>
            ) : (
              <IonButton
                expand="block"
                className="bulkex__button"
                onClick={handleGenerate}
                disabled={generating || selectedStudentIds.length === 0 || !exerciseName.trim()}
              >
                {generating ? (
                  <><IonSpinner name="crescent" /> Generando...</>
                ) : (
                  <><IonIcon icon={sparkles} slot="start" /> Generar para {selectedStudentIds.length} alumno{selectedStudentIds.length !== 1 ? 's' : ''}</>
                )}
              </IonButton>
            )}
          </>
        )}
      </div>
    </IonModal>
  );
};

export default BulkExerciseGeneratorModal;
