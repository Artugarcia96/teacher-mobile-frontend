import { useMemo, useState } from 'react';
import { IonButton, IonIcon, IonSelect, IonSelectOption, IonItem, IonLabel } from '@ionic/react';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';
import { Student, Exam } from '../types';
import { useCorrectionStore } from '../store/correctionStore';
import './GradeTable.css';

const MAX_VISIBLE_EXAMS = 5;

interface Props {
  students: Student[];
  exams: Exam[];
  onStudentClick: (studentId: string) => void;
  onExamClick: (examId: string) => void;
}

function gradeClass(grade: number | null, maxScore: number): string {
  if (grade === null) return '';
  const pct = grade / maxScore;
  if (pct >= 0.6) return 'grade-pass';
  if (pct >= 0.4) return 'grade-borderline';
  return 'grade-fail';
}

function getExamCategory(examName: string): 'global' | 'topic' | 'practice' {
  const name = examName.toLowerCase();
  if (name.includes('global') || name.includes('final') || name.includes('trimestre') || name.includes('evaluación')) {
    return 'global';
  }
  if (name.includes('práctica') || name.includes('ejercicio') || name.includes('tarea')) {
    return 'practice';
  }
  return 'topic';
}

const GradeTable: React.FC<Props> = ({ students, exams, onStudentClick, onExamClick }) => {
  const corrections = useCorrectionStore((s) => s.corrections);
  const [showAllExams, setShowAllExams] = useState(false);
  const [selectedExamForList, setSelectedExamForList] = useState<string | null>(null);

  const getGrade = (examId: string, studentId: string) => {
    const c = corrections.find((c) => c.examId === examId && c.studentId === studentId);
    return c?.grade ?? null;
  };

  const hasMoreExams = exams.length > MAX_VISIBLE_EXAMS;
  const visibleExams = showAllExams ? exams : exams.slice(-MAX_VISIBLE_EXAMS);
  const hiddenCount = exams.length - MAX_VISIBLE_EXAMS;

  const selectedExam = selectedExamForList ? exams.find(e => e.id === selectedExamForList) : null;

  return (
    <div className="grade-table-container">
      {/* Exam organization and selector */}
      <div className="grade-table-controls">
        {exams.length > 3 && (
          <div className="grade-table-exam-selector">
            <IonItem lines="none" className="grade-table-exam-select">
              <IonLabel>Ver notas de:</IonLabel>
              <IonSelect
                value={selectedExamForList}
                onIonChange={(e) => setSelectedExamForList(e.detail.value)}
                placeholder="Todos los exámenes"
                interface="popover"
              >
                <IonSelectOption value={null}>Todos (tabla)</IonSelectOption>
                {exams.map((e) => (
                  <IonSelectOption key={e.id} value={e.id}>{e.name}</IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
          </div>
        )}
        
        <div className="exam-categories">
          <div className="exam-legend">
            <span className="legend-item">
              <span className="legend-dot global-exam"></span>
              Exámenes globales
            </span>
            <span className="legend-item">
              <span className="legend-dot topic-exam"></span>
              Por tema
            </span>
            <span className="legend-item">
              <span className="legend-dot practice-exam"></span>
              Práctica
            </span>
          </div>
        </div>
      </div>

      {/* Single exam list view */}
      {selectedExamForList && selectedExam && (
        <div className="grade-table-list-view">
          <div className="grade-table-list-header">
            <span className="grade-table-list-title">{selectedExam.name}</span>
            <button className="grade-table-list-link" onClick={() => onExamClick(selectedExam.id)}>
              Ver correcciones
            </button>
          </div>
          <div className="grade-table-list">
            {students.map((student) => {
              const grade = getGrade(selectedExamForList, student.id);
              return (
                <div 
                  key={student.id} 
                  className="grade-table-list-item"
                  onClick={() => onStudentClick(student.id)}
                >
                  <span className="grade-table-list-name">{student.name}</span>
                  <span className={`grade-table-list-grade ${gradeClass(grade, selectedExam.maxScore)}`}>
                    {grade !== null ? `${grade}/${selectedExam.maxScore}` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table view (default or when "Todos" is selected) */}
      {!selectedExamForList && (
        <>
          {hasMoreExams && !showAllExams && (
            <div className="grade-table-info">
              <span>Mostrando últimos {MAX_VISIBLE_EXAMS} de {exams.length} exámenes</span>
              <IonButton fill="clear" size="small" onClick={() => setShowAllExams(true)}>
                <IonIcon icon={chevronDownOutline} slot="start" />
                Ver todos
              </IonButton>
            </div>
          )}

          <div className="grade-table-wrapper">
            <table className="grade-table">
              <thead>
                <tr>
                  <th className="grade-table-student">Alumno</th>
                  {visibleExams.map((e) => (
                    <th key={e.id} className={`grade-table-exam exam-${getExamCategory(e.name)}`} onClick={() => onExamClick(e.id)}>
                      <div className="exam-header">
                        <span className="exam-name">{e.name}</span>
                        <span className="exam-category-dot"></span>
                      </div>
                    </th>
                  ))}
                  <th className="grade-table-avg">Media</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const allGrades = exams.map((e) => getGrade(e.id, student.id));
                  const visibleGrades = visibleExams.map((e) => getGrade(e.id, student.id));
                  const filled = allGrades.filter((g): g is number => g !== null);
                  const avg = filled.length > 0 ? filled.reduce((a, b) => a + b, 0) / filled.length : null;

                  return (
                    <tr key={student.id}>
                      <td className="grade-table-student-name" onClick={() => onStudentClick(student.id)}>
                        {student.name}
                      </td>
                      {visibleExams.map((e, i) => {
                        const g = visibleGrades[i];
                        return (
                          <td key={e.id} className={`grade-table-cell ${gradeClass(g, e.maxScore)}`}>
                            {g !== null ? g : '—'}
                          </td>
                        );
                      })}
                      <td className="grade-table-cell grade-table-avg-cell">
                        {avg !== null ? avg.toFixed(1) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMoreExams && showAllExams && (
            <div className="grade-table-info grade-table-info--bottom">
              <IonButton fill="clear" size="small" onClick={() => setShowAllExams(false)}>
                <IonIcon icon={chevronUpOutline} slot="start" />
                Mostrar menos
              </IonButton>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GradeTable;
