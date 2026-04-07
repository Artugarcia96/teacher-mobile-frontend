import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  IonPage, IonContent, IonButtons, IonBackButton,
  IonSpinner, IonSegment, IonSegmentButton, IonLabel,
  IonSelect, IonSelectOption, IonIcon, IonSearchbar,
  IonActionSheet,
} from '@ionic/react';
import {
  chevronForwardOutline, chevronDownOutline,
  documentTextOutline, cloudUploadOutline,
  eyeOutline, trashOutline, chatbubbleOutline,
} from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { useAttendanceStore } from '../../store/attendanceStore';
import { useClassesStore } from '../../store/classesStore';
import { fetchRegistry } from '../../store/fetchRegistry';
import { classes as classesApi, subjects as subjectsApi } from '../../services/api';
import { ClassGroup, AttendanceRecord } from '../../types';
import GradeDonut from '../../components/charts/GradeDonut';
import EmptyState from '../../components/EmptyState';
import { subjectThemeStyle } from '../../utils/subjectTheme';
import QuickCommentModal from '../../components/QuickCommentModal';
import './AttendanceList.css';

function formatDate(d: string) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${parts[2]}/${parts[1]}`;
}

const AttendanceList: React.FC = () => {
  const { classId, subjectId } = useParams<{ classId: string; subjectId?: string }>();
  const history = useHistory();

  const summaries = useAttendanceStore((s) => s.summaries);
  const fetchSummary = useAttendanceStore((s) => s.fetchSummary);
  const loading = useAttendanceStore((s) => s.loading);
  const fetchStudentHistory = useAttendanceStore((s) => s.fetchStudentHistory);
  const uploadJustification = useAttendanceStore((s) => s.uploadJustification);
  const deleteJustification = useAttendanceStore((s) => s.deleteJustification);

  const allClasses = useClassesStore((s) => s.classes);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const classSubjects = useClassesStore((s) => s.classSubjects);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);

  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [classGroup, setClassGroup] = useState<ClassGroup | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);

  // Justification expansion state
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [studentRecords, setStudentRecords] = useState<Record<string, AttendanceRecord[]>>({});
  const [loadingRecords, setLoadingRecords] = useState<string | null>(null);
  const [justificationActionRecord, setJustificationActionRecord] = useState<AttendanceRecord | null>(null);
  const [uploadingJustification, setUploadingJustification] = useState(false);
  const justificationInputRef = useRef<HTMLInputElement>(null);
  const [commentTarget, setCommentTarget] = useState<{ id: string; name: string } | null>(null);

  const basicClassGroup = useMemo(() => allClasses.find((c) => c.id === classId), [allClasses, classId]);

  const fetchClassDetails = useCallback(async () => {
    if (!classId) return;
    try {
      const response = await classesApi.get(classId);
      setClassGroup(response.data);
    } catch (err) {
      console.error('Failed to fetch class details:', err);
    }
  }, [classId]);

  const fetchSubjectName = useCallback(async () => {
    if (!subjectId) return;
    try {
      const response = await subjectsApi.get(subjectId);
      setSubjectName(response.data.name);
    } catch (err) {
      console.error('Failed to fetch subject:', err);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchClasses();
    fetchClassDetails();
    fetchSubjectName();
    if (classId && fetchRegistry.isStale(`classSubjects-${classId}`, 60_000)) {
      fetchClassSubjects(classId);
      fetchRegistry.register(`classSubjects-${classId}`);
    }

    const effectiveSubject = subjectId || (subjectFilter !== 'all' ? subjectFilter : undefined);
    fetchSummary(classId, effectiveSubject);
  }, [classId, subjectId, subjectFilter, fetchClasses, fetchClassDetails, fetchSubjectName, fetchClassSubjects, fetchSummary]);

  const totals = useMemo(() => {
    const t = { present: 0, late: 0, justified: 0, absent: 0 };
    for (const s of summaries) {
      t.present += s.present;
      t.late += s.late;
      t.justified += s.justified;
      t.absent += s.absent;
    }
    const total = t.present + t.late + t.justified + t.absent;
    const rate = total > 0 ? Math.round(((t.present + t.late) / total) * 100) : 0;
    return { ...t, total, rate };
  }, [summaries]);

  const donutSegments = useMemo(() => [
    { label: 'Presente', count: totals.present, color: '#059669' },
    { label: 'Retraso', count: totals.late, color: '#D97706' },
    { label: 'Justificado', count: totals.justified, color: '#3B82F6' },
    { label: 'Ausente', count: totals.absent, color: '#DC2626' },
  ], [totals]);

  const filteredSummaries = useMemo(() => {
    let list = [...summaries];
    if (filter === 'low') {
      list = list.filter((s) => s.attendanceRate < 0.8);
    }
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      list = list.filter((s) => s.studentName.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.attendanceRate - b.attendanceRate);
  }, [summaries, filter, searchText]);

  const displayClass = classGroup || basicClassGroup;
  const subjects = classSubjects[classId] || [];
  const showSubjectFilter = !subjectId && subjects.length > 1;
  const subjectColor = subjectId ? subjects.find(s => s.subjectId === subjectId)?.subjectColor : undefined;
  const basePath = subjectId
    ? `/tabs/classes/${classId}/subjects/${subjectId}`
    : `/tabs/classes/${classId}`;

  const getRateClass = (rate: number) => {
    if (rate >= 0.9) return 'att-rate--good';
    if (rate >= 0.75) return 'att-rate--warning';
    return 'att-rate--danger';
  };

  const effectiveSubjectId = subjectId || (subjectFilter !== 'all' ? subjectFilter : undefined);

  const handleToggleExpand = async (studentId: string) => {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null);
      return;
    }
    setExpandedStudentId(studentId);
    if (!studentRecords[studentId]) {
      setLoadingRecords(studentId);
      try {
        const records = await fetchStudentHistory(studentId, classId, effectiveSubjectId);
        setStudentRecords((prev) => ({ ...prev, [studentId]: records }));
      } catch (err) { console.error(err); }
      finally { setLoadingRecords(null); }
    }
  };

  const absentRecordsFor = (studentId: string) =>
    (studentRecords[studentId] || []).filter(
      (r) => r.status === 'absent' || r.status === 'justified'
    );

  const handleJustificationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !justificationActionRecord) return;
    setUploadingJustification(true);
    try {
      const updated = await uploadJustification(justificationActionRecord.id, file);
      setStudentRecords((prev) => {
        const sid = updated.studentId;
        return {
          ...prev,
          [sid]: (prev[sid] || []).map((r) => (r.id === updated.id ? updated : r)),
        };
      });
      // Refresh summary to update justified counts
      fetchSummary(classId, effectiveSubjectId);
    } catch (err) { console.error(err); }
    finally {
      setUploadingJustification(false);
      setJustificationActionRecord(null);
      if (justificationInputRef.current) justificationInputRef.current.value = '';
    }
  };

  const handleDeleteJustification = async (record: AttendanceRecord) => {
    try {
      const updated = await deleteJustification(record.id);
      setStudentRecords((prev) => {
        const sid = updated.studentId;
        return {
          ...prev,
          [sid]: (prev[sid] || []).map((r) => (r.id === updated.id ? updated : r)),
        };
      });
      fetchSummary(classId, effectiveSubjectId);
    } catch (err) { console.error(err); }
  };

  const handleViewJustification = (record: AttendanceRecord) => {
    if (record.justificationUrl) {
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      window.open(`${baseUrl}${record.justificationUrl}`, '_blank');
    }
  };

  return (
    <IonPage>
      <IonContent className="att-list-content" scrollY style={subjectThemeStyle(subjectColor)}>
        {/* Hero Header */}
        <div className="att-list-hero" style={subjectColor ? { background: subjectColor } : undefined}>
          <div className="att-list-hero__nav">
            <IonButtons>
              <IonBackButton defaultHref={basePath} text="" color="light" />
            </IonButtons>
            <div className="att-list-hero__center">
              <h1 className="att-list-hero__title">Asistencia</h1>
              {(displayClass || subjectName) && (
                <p className="att-list-hero__subtitle">
                  {displayClass?.name}{subjectName ? ` — ${subjectName}` : ''}
                </p>
              )}
            </div>
            {/* Spacer to balance back button */}
            <div style={{ width: 40 }} />
          </div>
        </div>

        {/* Filters */}
        <div className="att-list-filters">
          <IonSegment
            value={filter}
            onIonChange={(e) => setFilter(e.detail.value as 'all' | 'low')}
            className="att-list-segment"
          >
            <IonSegmentButton value="all"><IonLabel>Todos</IonLabel></IonSegmentButton>
            <IonSegmentButton value="low"><IonLabel>Baja asistencia</IonLabel></IonSegmentButton>
          </IonSegment>

          {showSubjectFilter && (
            <IonSelect
              value={subjectFilter}
              onIonChange={(e) => setSubjectFilter(e.detail.value as string)}
              interface="popover"
              placeholder="Asignatura"
              className="att-list-subject-select"
            >
              <IonSelectOption value="all">Todas las asignaturas</IonSelectOption>
              {subjects.map((s) => (
                <IonSelectOption key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}
                </IonSelectOption>
              ))}
            </IonSelect>
          )}

          <IonSearchbar
            value={searchText}
            onIonInput={(e) => setSearchText(e.detail.value || '')}
            placeholder="Buscar alumno..."
            className="att-list-search"
            debounce={200}
          />
        </div>

        {loading ? (
          <div className="att-list-loading">
            <IonSpinner color="primary" />
          </div>
        ) : summaries.length === 0 ? (
          <div className="att-list-container">
            <EmptyState
              icon="📋"
              title="Sin datos de asistencia"
              subtitle="Pasa lista desde el calendario para ver estadísticas aquí"
            />
          </div>
        ) : (
          <div className="att-list-container">
            {/* Summary Chart */}
            {totals.total > 0 && (
              <div className="att-list-summary">
                <GradeDonut
                  distribution={donutSegments}
                  centerLabel={`${totals.rate}%`}
                  centerSubLabel="asistencia"
                  size={150}
                />
              </div>
            )}

            {/* Student List */}
            <div className="att-list-items">
              {filteredSummaries.map((s) => {
                const isExpanded = expandedStudentId === s.studentId;
                const hasAbsences = s.absent > 0 || s.justified > 0;
                const records = absentRecordsFor(s.studentId);

                return (
                  <div key={s.studentId} className={`att-student-card ${isExpanded ? 'att-student-card--expanded' : ''}`}>
                    <div className="att-student-row">
                      {/* Expandable area: name + bar */}
                      <button
                        className="att-student-row__main"
                        onClick={() => hasAbsences ? handleToggleExpand(s.studentId) : history.push(`/tabs/classes/${classId}/students/${s.studentId}`)}
                      >
                        <div className="att-student-row__info">
                          <div className="att-student-row__name-line">
                            <span className="att-student-row__name">{s.studentName}</span>
                            {s.justified > 0 && (
                              <IonIcon icon={documentTextOutline} className="att-student-row__justified-icon" />
                            )}
                          </div>
                          <div className="att-bar">
                            {s.present > 0 && (
                              <div className="att-bar__seg att-bar__seg--present" style={{ flex: s.present }} />
                            )}
                            {s.late > 0 && (
                              <div className="att-bar__seg att-bar__seg--late" style={{ flex: s.late }} />
                            )}
                            {s.justified > 0 && (
                              <div className="att-bar__seg att-bar__seg--justified" style={{ flex: s.justified }} />
                            )}
                            {s.absent > 0 && (
                              <div className="att-bar__seg att-bar__seg--absent" style={{ flex: s.absent }} />
                            )}
                          </div>
                        </div>
                        <span className={`att-rate ${getRateClass(s.attendanceRate)}`}>
                          {Math.round(s.attendanceRate * 100)}%
                        </span>
                        <IonIcon
                          icon={hasAbsences ? chevronDownOutline : chevronForwardOutline}
                          className={`att-student-row__arrow ${isExpanded ? 'att-student-row__arrow--expanded' : ''}`}
                        />
                      </button>

                      {/* Quick comment */}
                      <button
                        className="att-student-row__nav"
                        onClick={() => setCommentTarget({ id: s.studentId, name: s.studentName })}
                        title="Añadir comentario"
                      >
                        <IonIcon icon={chatbubbleOutline} />
                      </button>

                    </div>

                    {/* Expanded: absent/justified records */}
                    {isExpanded && (
                      <div className="att-expand">
                        {loadingRecords === s.studentId ? (
                          <div className="att-expand__loading">
                            <IonSpinner name="crescent" />
                          </div>
                        ) : records.length === 0 ? (
                          <div className="att-expand__empty">Sin ausencias registradas</div>
                        ) : (
                          <div className="att-expand__list">
                            {records.map((r) => (
                              <div key={r.id} className="att-expand__record">
                                <span className="att-expand__date">{formatDate(r.date)}</span>
                                {r.subjectName && <span className="att-expand__subject">{r.subjectName}</span>}
                                <span className={`att-expand__status att-expand__status--${r.status}`}>
                                  {r.status === 'absent' ? 'Ausente' : 'Justificada'}
                                </span>
                                <button
                                  className={`att-expand__just-btn ${r.justificationUrl ? 'att-expand__just-btn--has-doc' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (r.justificationUrl) {
                                      setJustificationActionRecord(r);
                                    } else {
                                      setJustificationActionRecord(r);
                                      justificationInputRef.current?.click();
                                    }
                                  }}
                                  title={r.justificationUrl ? 'Ver justificante' : 'Subir justificante'}
                                >
                                  <IonIcon icon={r.justificationUrl ? documentTextOutline : cloudUploadOutline} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          className="att-expand__ficha"
                          onClick={() => history.push(`/tabs/classes/${classId}/students/${s.studentId}`)}
                        >
                          Ver ficha del alumno
                          <IonIcon icon={chevronForwardOutline} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {filter === 'low' && filteredSummaries.length === 0 && (
              <div className="att-list-empty-filter">
                Todos los alumnos tienen una asistencia superior al 80%
              </div>
            )}
          </div>
        )}
      </IonContent>

      {/* Hidden file input for justification uploads */}
      <input
        type="file"
        ref={justificationInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handleJustificationUpload}
      />

      {/* Action sheet for existing justification */}
      <IonActionSheet
        isOpen={!!justificationActionRecord?.justificationUrl}
        onDidDismiss={() => setJustificationActionRecord(null)}
        header="Justificante"
        buttons={[
          {
            text: 'Ver justificante',
            icon: eyeOutline,
            handler: () => {
              if (justificationActionRecord) handleViewJustification(justificationActionRecord);
            },
          },
          {
            text: 'Reemplazar documento',
            icon: cloudUploadOutline,
            handler: () => {
              justificationInputRef.current?.click();
            },
          },
          {
            text: 'Eliminar justificante',
            icon: trashOutline,
            role: 'destructive',
            handler: () => {
              if (justificationActionRecord) handleDeleteJustification(justificationActionRecord);
            },
          },
          {
            text: 'Cancelar',
            role: 'cancel',
          },
        ]}
      />

      {/* Quick Comment Modal */}
      <QuickCommentModal
        isOpen={!!commentTarget}
        studentId={commentTarget?.id || ''}
        studentName={commentTarget?.name || ''}
        onDismiss={() => setCommentTarget(null)}
      />

      {/* Upload spinner overlay */}
      {uploadingJustification && (
        <div className="att-justification-overlay">
          <IonSpinner color="primary" />
          <span>Subiendo justificante...</span>
        </div>
      )}
    </IonPage>
  );
};

export default AttendanceList;
