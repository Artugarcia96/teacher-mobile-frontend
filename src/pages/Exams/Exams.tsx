import { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  IonIcon, IonSearchbar, IonSpinner, IonAlert, IonBadge,
  IonAccordionGroup, IonAccordion, IonItem, IonLabel,
} from '@ionic/react';
import {
  addOutline, chevronDownOutline, schoolOutline, bookOutline,
  documentTextOutline, trashOutline,
} from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useClassesStore } from '../../store/classesStore';
import { Exam } from '../../types';
import EmptyState from '../../components/EmptyState';
import './Exams.css';

const statusConfig: Record<string, { label: string; colorClass: string }> = {
  uploaded: { label: 'Subido', colorClass: 'exam-status--uploaded' },
  assigned: { label: 'Por corregir', colorClass: 'exam-status--assigned' },
  corrected: { label: 'Corregido', colorClass: 'exam-status--corrected' },
};

type StatusFilter = 'all' | 'assigned' | 'corrected';

interface ExamStructure {
  classId: string;
  className: string;
  classSubject: string;
  lectures: {
    lectureId: string;
    lectureName: string;
    exams: Exam[];
    pendingCount: number;
  }[];
  totalExams: number;
  pendingCount: number;
}

const Exams: React.FC = () => {
  const history = useHistory();
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const deleteExam = useExamsStore((s) => s.deleteExam);
  const loading = useExamsStore((s) => s.loading);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedClasses, setExpandedClasses] = useState<string[]>([]);
  const [expandedLectures, setExpandedLectures] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  useEffect(() => {
    fetchClasses();
    fetchExams();
  }, [fetchClasses, fetchExams]);

  // Stats
  const stats = useMemo(() => ({
    total: allExams.length,
    pending: allExams.filter((e) => e.status === 'assigned').length,
    corrected: allExams.filter((e) => e.status === 'corrected').length,
  }), [allExams]);

  // Filter exams
  const filtered = useMemo(() => {
    let result = allExams;
    
    if (search) {
      const term = search.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(term));
    }
    
    if (statusFilter !== 'all') {
      result = result.filter((e) => e.status === statusFilter);
    }
    
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allExams, search, statusFilter]);

  // Build hierarchical structure: Class > Lecture > Exams
  const structure = useMemo(() => {
    const result: ExamStructure[] = [];
    
    // Group exams by class
    const byClass = new Map<string, typeof filtered>();
    filtered.forEach((exam) => {
      const key = exam.classId || '__global__';
      if (!byClass.has(key)) {
        byClass.set(key, []);
      }
      byClass.get(key)!.push(exam);
    });
    
    // Build structure for each class
    byClass.forEach((classExams, classId) => {
      const cls = classId === '__global__' ? null : classes.find((c) => c.id === classId);
      
      // Group exams by lecture within this class
      const byLecture = new Map<string, typeof classExams>();
      classExams.forEach((exam) => {
        const lectureKey = exam.lectureId || '__none__';
        if (!byLecture.has(lectureKey)) {
          byLecture.set(lectureKey, []);
        }
        byLecture.get(lectureKey)!.push(exam);
      });
      
      const lectures: ExamStructure['lectures'] = [];
      byLecture.forEach((lectureExams, lectureId) => {
        const lectureName = lectureId === '__none__' 
          ? 'Sin asignatura' 
          : lectureExams[0]?.lectureName || 'Asignatura';
        
        lectures.push({
          lectureId,
          lectureName,
          exams: lectureExams,
          pendingCount: lectureExams.filter((e) => e.status === 'assigned').length,
        });
      });
      
      // Sort lectures: named ones first, then "__none__"
      lectures.sort((a, b) => {
        if (a.lectureId === '__none__') return 1;
        if (b.lectureId === '__none__') return -1;
        return a.lectureName.localeCompare(b.lectureName);
      });
      
      result.push({
        classId,
        className: cls?.name || 'Global',
        classSubject: cls?.subject || 'Exámenes transversales',
        lectures,
        totalExams: classExams.length,
        pendingCount: classExams.filter((e) => e.status === 'assigned').length,
      });
    });
    
    // Sort: Global first if exists, then by class name
    result.sort((a, b) => {
      if (a.classId === '__global__') return -1;
      if (b.classId === '__global__') return 1;
      return a.className.localeCompare(b.className);
    });
    
    return result;
  }, [filtered, classes]);

  const toggleClass = (classId: string) => {
    setExpandedClasses((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const toggleLecture = (lectureId: string) => {
    setExpandedLectures((prev) =>
      prev.includes(lectureId) ? prev.filter((id) => id !== lectureId) : [...prev, lectureId]
    );
  };

  const expandAll = () => {
    setExpandedClasses(structure.map((s) => s.classId));
    setExpandedLectures(structure.flatMap((s) => s.lectures.map((l) => l.lectureId)));
  };

  const collapseAll = () => {
    setExpandedClasses([]);
    setExpandedLectures([]);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteExam(deleteTarget.id);
    } catch (err) {
      console.error(err);
    }
    setDeleteTarget(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  const getExamRoute = (exam: typeof allExams[0]) => {
    if (exam.status === 'assigned' || exam.status === 'corrected') {
      return `/correction/${exam.id}`;
    }
    return `/tabs/exams/${exam.id}`;
  };

  const hasExpandedItems = expandedClasses.length > 0 || expandedLectures.length > 0;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Exámenes</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => history.push('/tabs/exams/new')}>
              <IonIcon icon={addOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <div className="exams-controls">
          <IonSearchbar
            value={search}
            onIonInput={(e) => setSearch(e.detail.value ?? '')}
            placeholder="Buscar exámenes..."
            className="exams-search"
          />

          {/* Stats - tappable filters */}
          <div className="exams-stats">
            <button 
              className={`exams-stat ${statusFilter === 'all' ? 'exams-stat--active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              <span className="exams-stat__value">{stats.total}</span>
              <span className="exams-stat__label">Total</span>
            </button>
            <button 
              className={`exams-stat exams-stat--warning ${statusFilter === 'assigned' ? 'exams-stat--active' : ''}`}
              onClick={() => setStatusFilter('assigned')}
            >
              <span className="exams-stat__value">{stats.pending}</span>
              <span className="exams-stat__label">Pendientes</span>
            </button>
            <button 
              className={`exams-stat exams-stat--success ${statusFilter === 'corrected' ? 'exams-stat--active' : ''}`}
              onClick={() => setStatusFilter('corrected')}
            >
              <span className="exams-stat__value">{stats.corrected}</span>
              <span className="exams-stat__label">Corregidos</span>
            </button>
          </div>

          {/* Expand/Collapse */}
          {structure.length > 0 && (
            <div className="exams-toolbar">
              <span className="exams-count">
                {structure.length} {structure.length === 1 ? 'clase' : 'clases'}
              </span>
              <button className="exams-expand-btn" onClick={hasExpandedItems ? collapseAll : expandAll}>
                {hasExpandedItems ? 'Colapsar todo' : 'Expandir todo'}
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="exams-loading"><IonSpinner color="primary" /></div>
        )}

        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon="📄"
            title={allExams.length === 0 ? "Aún no hay exámenes" : "Sin resultados"}
            subtitle={allExams.length === 0 ? "Crea tu primer examen" : "Prueba con otros filtros"}
            actionLabel={allExams.length === 0 ? "Nuevo examen" : undefined}
            onAction={allExams.length === 0 ? () => history.push('/tabs/exams/new') : undefined}
          />
        ) : (
          <div className="exams-accordion-container">
            <IonAccordionGroup multiple value={expandedClasses}>
              {structure.map((classData) => (
                <IonAccordion
                  key={classData.classId}
                  value={classData.classId}
                  className="exams-class-accordion"
                  toggleIcon={chevronDownOutline}
                  toggleIconSlot="end"
                >
                  <IonItem
                    slot="header"
                    className="exams-class-header"
                    onClick={() => toggleClass(classData.classId)}
                  >
                    <div className="exams-class-icon" slot="start">
                      <IonIcon icon={classData.classId === '__global__' ? documentTextOutline : schoolOutline} />
                    </div>
                    <IonLabel>
                      <h2 className="exams-class-name">{classData.className}</h2>
                      <p className="exams-class-subject">{classData.classSubject}</p>
                    </IonLabel>
                    {classData.pendingCount > 0 && (
                      <IonBadge color="warning" className="exams-pending-badge">
                        {classData.pendingCount}
                      </IonBadge>
                    )}
                    <IonBadge slot="end" color="primary" className="exams-count-badge">
                      {classData.totalExams}
                    </IonBadge>
                  </IonItem>

                  <div slot="content" className="exams-lectures-container">
                    {classData.lectures.length === 1 && classData.lectures[0].lectureId === '__none__' ? (
                      // No lectures, show exams directly
                      <div className="exams-direct-list">
                        {classData.lectures[0].exams.map((exam) => (
                          <ExamRow
                            key={exam.id}
                            exam={exam}
                            onNavigate={() => history.push(getExamRoute(exam))}
                            onDelete={() => setDeleteTarget({ id: exam.id, name: exam.name })}
                            formatDate={formatDate}
                          />
                        ))}
                      </div>
                    ) : (
                      // Has lectures, show nested accordions
                      <IonAccordionGroup multiple value={expandedLectures}>
                        {classData.lectures.map((lecture) => (
                          <IonAccordion
                            key={lecture.lectureId}
                            value={lecture.lectureId}
                            className="exams-lecture-accordion"
                            toggleIcon={chevronDownOutline}
                            toggleIconSlot="end"
                          >
                            <IonItem
                              slot="header"
                              className="exams-lecture-header"
                              onClick={() => toggleLecture(lecture.lectureId)}
                            >
                              <div className="exams-lecture-icon" slot="start">
                                <IonIcon icon={bookOutline} />
                              </div>
                              <IonLabel>
                                <h3 className="exams-lecture-name">{lecture.lectureName}</h3>
                              </IonLabel>
                              {lecture.pendingCount > 0 && (
                                <IonBadge color="warning" className="exams-pending-badge-sm">
                                  {lecture.pendingCount}
                                </IonBadge>
                              )}
                              <IonBadge slot="end" color="medium" className="exams-count-badge-sm">
                                {lecture.exams.length}
                              </IonBadge>
                            </IonItem>

                            <div slot="content" className="exams-items-container">
                              {lecture.exams.map((exam) => (
                                <ExamRow
                                  key={exam.id}
                                  exam={exam}
                                  onNavigate={() => history.push(getExamRoute(exam))}
                                  onDelete={() => setDeleteTarget({ id: exam.id, name: exam.name })}
                                  formatDate={formatDate}
                                />
                              ))}
                            </div>
                          </IonAccordion>
                        ))}
                      </IonAccordionGroup>
                    )}
                  </div>
                </IonAccordion>
              ))}
            </IonAccordionGroup>
          </div>
        )}

        <IonAlert
          isOpen={!!deleteTarget}
          onDidDismiss={() => setDeleteTarget(null)}
          header="Eliminar examen"
          message={`¿Eliminar "${deleteTarget?.name}"? También se eliminarán las correcciones asociadas.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Eliminar', role: 'destructive', handler: handleDeleteConfirm }
          ]}
        />
      </IonContent>
    </IonPage>
  );
};

// Exam row component
interface ExamRowProps {
  exam: Exam;
  onNavigate: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
}

const ExamRow: React.FC<ExamRowProps> = ({ exam, onNavigate, onDelete, formatDate }) => {
  const status = statusConfig[exam.status] || statusConfig.uploaded;
  
  return (
    <div className="exam-row" onClick={onNavigate}>
      <div className="exam-row__info">
        <span className="exam-row__name">{exam.name}</span>
        <span className="exam-row__meta">
          {formatDate(exam.date)} · {exam.maxScore} pts
        </span>
      </div>
      <span className={`exam-row__status ${status.colorClass}`}>
        {status.label}
      </span>
      <button 
        className="exam-row__delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Eliminar"
      >
        <IonIcon icon={trashOutline} />
      </button>
    </div>
  );
};

export default Exams;
