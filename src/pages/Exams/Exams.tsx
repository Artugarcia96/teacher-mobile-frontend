import { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonButtons,
  IonIcon, IonSearchbar, IonSpinner, IonAlert, IonBadge,
} from '@ionic/react';
import { addOutline, chevronForwardOutline, chevronDownOutline } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { useExamsStore } from '../../store/examsStore';
import { useClassesStore } from '../../store/classesStore';
import EmptyState from '../../components/EmptyState';
import './Exams.css';

const statusDot: Record<string, string> = { uploaded: 'medium', assigned: 'warning', corrected: 'success' };
const statusLabel: Record<string, string> = { uploaded: 'Subido', assigned: 'Por corregir', corrected: 'Corregido' };

type StatusFilter = 'all' | 'uploaded' | 'assigned' | 'corrected';

const Exams: React.FC = () => {
  const history = useHistory();
  const allExams = useExamsStore((s) => s.exams);
  const fetchExams = useExamsStore((s) => s.fetchExams);
  const deleteExam = useExamsStore((s) => s.deleteExam);
  const loading = useExamsStore((s) => s.loading);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);

  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [classFilter, setClassFilter] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  useEffect(() => {
    fetchClasses();
    fetchExams();
  }, [fetchClasses, fetchExams]);

  const filtered = useMemo(() => {
    let result = allExams;
    
    if (search) {
      result = result.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
    }
    
    if (statusFilter !== 'all') {
      result = result.filter((e) => e.status === statusFilter);
    }
    
    if (classFilter) {
      result = result.filter((e) => e.classId === classFilter);
    }
    
    return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allExams, search, statusFilter, classFilter]);

  // Group exams by name, then by class for grouped view
  const groupedExams = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    filtered.forEach((exam) => {
      const key = exam.name;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(exam);
    });
    
    return Array.from(groups.entries()).map(([name, exams]) => {
      // Group exams by class within this exam name
      const byClass = new Map<string, typeof exams>();
      exams.forEach((exam) => {
        const classId = exam.classId;
        if (!byClass.has(classId)) {
          byClass.set(classId, []);
        }
        byClass.get(classId)!.push(exam);
      });
      
      // Create unique class entries with aggregated status
      const uniqueClasses = Array.from(byClass.entries()).map(([classId, classExams]) => {
        const hasAssigned = classExams.some((e) => e.status === 'assigned');
        const hasCorrected = classExams.some((e) => e.status === 'corrected');
        const hasUploaded = classExams.some((e) => e.status === 'uploaded');
        
        // Determine the most important status to show
        let displayStatus: 'assigned' | 'corrected' | 'uploaded' = 'uploaded';
        if (hasAssigned) displayStatus = 'assigned';
        else if (hasCorrected) displayStatus = 'corrected';
        
        // Use the first exam as representative (they share the same name/class)
        const representative = classExams[0];
        
        return {
          classId,
          exams: classExams,
          displayStatus,
          representative,
          studentCount: classExams.length,
        };
      });
      
      return {
        name,
        uniqueClasses,
        classCount: uniqueClasses.length,
        latestDate: exams[0]?.date || '',
        hasAssigned: exams.some((e) => e.status === 'assigned'),
        hasCorrected: exams.some((e) => e.status === 'corrected'),
      };
    });
  }, [filtered]);

  const toggleGroupExpanded = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // Status counts for filter badges
  const statusCounts = useMemo(() => ({
    all: allExams.length,
    uploaded: allExams.filter((e) => e.status === 'uploaded').length,
    assigned: allExams.filter((e) => e.status === 'assigned').length,
    corrected: allExams.filter((e) => e.status === 'corrected').length,
  }), [allExams]);

  // Classes that have exams (for filter)
  const classesWithExams = useMemo(() => {
    const classIds = new Set(allExams.map((e) => e.classId));
    return classes.filter((c) => classIds.has(c.id));
  }, [allExams, classes]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try { await deleteExam(deleteTarget.id); } catch (err) { console.error(err); }
    setDeleteTarget(null);
  };

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

          {/* Status filter chips */}
          <div className="exams-filters">
            <div className="exams-status-chips">
              <button
                className={`exams-status-chip ${statusFilter === 'all' ? 'exams-status-chip--active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                Todos <span className="exams-status-chip__count">{statusCounts.all}</span>
              </button>
              <button
                className={`exams-status-chip exams-status-chip--assigned ${statusFilter === 'assigned' ? 'exams-status-chip--active' : ''}`}
                onClick={() => setStatusFilter('assigned')}
              >
                Por corregir <span className="exams-status-chip__count">{statusCounts.assigned}</span>
              </button>
              <button
                className={`exams-status-chip exams-status-chip--corrected ${statusFilter === 'corrected' ? 'exams-status-chip--active' : ''}`}
                onClick={() => setStatusFilter('corrected')}
              >
                Corregidos <span className="exams-status-chip__count">{statusCounts.corrected}</span>
              </button>
            </div>

            <div className="exams-controls-row">
              {/* Class filter */}
              {classesWithExams.length > 1 && (
                <div className="exams-class-chips">
                  <button
                    className={`exams-class-chip ${!classFilter ? 'exams-class-chip--active' : ''}`}
                    onClick={() => setClassFilter(null)}
                  >
                    Todas
                  </button>
                  {classesWithExams.map((cls) => (
                    <button
                      key={cls.id}
                      className={`exams-class-chip ${classFilter === cls.id ? 'exams-class-chip--active' : ''}`}
                      onClick={() => setClassFilter(cls.id)}
                    >
                      {cls.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {loading && (
          <div className="exams-loading"><IonSpinner color="primary" /></div>
        )}

        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon="📄"
            title={allExams.length === 0 ? "Aún no hay exámenes" : "Sin resultados"}
            subtitle={allExams.length === 0 ? "Sube tu primer examen" : "Prueba con otros filtros"}
            actionLabel={allExams.length === 0 ? "Subir examen" : undefined}
            onAction={allExams.length === 0 ? () => history.push('/tabs/exams/new') : undefined}
          />
        ) : (
          <div className="exams-grouped">
                {groupedExams.map((group) => (
                  <div key={group.name} className="exam-group">
                    <div
                      className="exam-group__header"
                      onClick={() => toggleGroupExpanded(group.name)}
                    >
                      <IonIcon
                        icon={expandedGroups.has(group.name) ? chevronDownOutline : chevronForwardOutline}
                        className="exam-group__chevron"
                      />
                      <span className="exam-group__name">{group.name}</span>
                      <IonBadge color="primary" className="exam-group__count">
                        {group.classCount} {group.classCount === 1 ? 'clase' : 'clases'}
                      </IonBadge>
                      {group.hasAssigned && (
                        <IonBadge color="warning" className="exam-group__badge">Por corregir</IonBadge>
                      )}
                      <span className="exam-group__date">{group.latestDate}</span>
                    </div>
                    {expandedGroups.has(group.name) && (
                      <div className="exam-group__content">
                        {group.uniqueClasses.map((classEntry) => {
                          const cls = allClasses.find((c) => c.id === classEntry.classId);
                          const exam = classEntry.representative;
                          const route = classEntry.displayStatus === 'corrected'
                            ? `/correction/${exam.id}`
                            : `/tabs/exams/${exam.id}`;
                          return (
                            <div key={classEntry.classId} className="exam-card exam-card--compact" onClick={() => history.push(route)}>
                              <div className={`status-dot status-dot--${statusDot[classEntry.displayStatus]}`} />
                              <div className="exam-card__info">
                                <span className="exam-card__name">{cls?.name || 'Sin clase'}</span>
                                <span className="exam-card__meta">{exam.date} · {exam.maxScore} pts</span>
                              </div>
                              <div className="exam-card__right">
                                <span className={`exam-card__status exam-card__status--${classEntry.displayStatus}`}>
                                  {statusLabel[classEntry.displayStatus]}
                                </span>
                                <IonIcon icon={chevronForwardOutline} className="exam-card__arrow" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
          </div>
        )}

        <IonAlert
          isOpen={!!deleteTarget}
          header="Eliminar examen"
          message={`¿Eliminar "${deleteTarget?.name}"? También se eliminarán las correcciones.`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
            { text: 'Eliminar', role: 'destructive', handler: handleDeleteConfirm }
          ]}
          onDidDismiss={() => setDeleteTarget(null)}
        />
      </IonContent>
    </IonPage>
  );
};

export default Exams;
