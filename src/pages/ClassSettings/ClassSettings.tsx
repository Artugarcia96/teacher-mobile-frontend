import { useState, useEffect, useMemo, useRef } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton,
  IonButton, IonIcon, IonList, IonItem, IonLabel, IonInput, IonModal, IonSelect,
  IonSelectOption, IonSpinner, IonAlert, IonItemSliding, IonItemOptions, IonItemOption,
  IonSegment, IonSegmentButton, IonCheckbox, IonSearchbar, IonProgressBar,
} from '@ionic/react';
import { addOutline, timeOutline, trashOutline, closeOutline, checkboxOutline, squareOutline, personAddOutline, chevronDownOutline, chevronUpOutline, warningOutline, createOutline, cloudUploadOutline } from 'ionicons/icons';
import { useParams, useHistory } from 'react-router-dom';
import { classes as classesApi, lectures as lecturesApi, subjects as subjectsApi, academicConfig as academicConfigApi } from '../../services/api';
import { Lecture, ScheduleSlot, EducationLevel } from '../../types';
import { useClassesStore, DeletePreview } from '../../store/classesStore';
import { useStudentsStore, StudentPoolEntry } from '../../store/studentsStore';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { PALETTE_COLORS } from '../../utils/avatarColors';
import { useAcademicConfigStore, AcademicConfigData } from '../../store/academicConfigStore';
import { getPeriodFullLabel } from '../../utils/periodConfig';
import type { PeriodMode } from '../../utils/periodConfig';
import './ClassSettings.css';

const WEEK_DAYS = [
  { key: 'monday', label: 'Lunes', short: 'L' },
  { key: 'tuesday', label: 'Martes', short: 'M' },
  { key: 'wednesday', label: 'Miércoles', short: 'X' },
  { key: 'thursday', label: 'Jueves', short: 'J' },
  { key: 'friday', label: 'Viernes', short: 'V' },
];

function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) {
    for (const m of [0, 30]) {
      if (h === 21 && m > 0) break;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatSchedule(schedule: ScheduleSlot[]): string {
  if (!schedule || schedule.length === 0) return 'Horario pendiente';
  return schedule.map(slot => {
    const day = WEEK_DAYS.find(d => d.key === slot.day);
    return `${day?.short || slot.day} ${slot.start_time}-${slot.end_time}`;
  }).join(', ');
}

const EDUCATION_LEVELS: [EducationLevel, string, string][] = [
  ['infantil', 'Infantil', '3-5'],
  ['primaria_lower', 'Primaria Inf.', '6-8'],
  ['primaria_upper', 'Primaria Sup.', '9-11'],
  ['secundaria', 'Secundaria', '12-15'],
  ['bachillerato', 'Bachillerato', '16-17'],
  ['universidad', 'Universidad', '18+'],
];

interface ClassDetail {
  id: string;
  name: string;
  year: string;
  educationLevel: EducationLevel;
  lectures: Lecture[];
}

const ClassSettings: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const history = useHistory();
  const isDesktop = useIsDesktop();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline editing for name & year
  const [editingField, setEditingField] = useState<'name' | 'year' | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEditing = (field: 'name' | 'year') => {
    setEditingField(field);
    setEditValue(classData?.[field] || '');
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveField = async () => {
    if (!editingField || !classData) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === classData[editingField]) {
      cancelEditing();
      return;
    }
    try {
      await classesApi.update(classId, { [editingField]: trimmed });
      setClassData((prev) => prev ? { ...prev, [editingField]: trimmed } : prev);
      fetchClasses();
    } catch (err) {
      console.error(`Failed to update ${editingField}:`, err);
    }
    cancelEditing();
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveField();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const [showLectureModal, setShowLectureModal] = useState(false);
  const [editingLecture, setEditingLecture] = useState<Lecture | null>(null);
  const [lectureName, setLectureName] = useState('');
  const [lectureSchedule, setLectureSchedule] = useState<ScheduleSlot[]>([]);
  const [lectureAula, setLectureAula] = useState('');
  const [lectureColor, setLectureColor] = useState('#15665E');
  const [classSubjectsList, setClassSubjectsList] = useState<{id: string; name: string}[]>([]);
  const [aulaBySubject, setAulaBySubject] = useState<Record<string, string>>({});
  const [colorBySubject, setColorBySubject] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [allSchedules, setAllSchedules] = useState<Array<{ id: string; class_id: string; class_name: string; name: string; schedule: ScheduleSlot[] }>>([]);

  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const fetchClassSubjects = useClassesStore((s) => s.fetchClassSubjects);
  const deleteClassPermanently = useClassesStore((s) => s.deleteClassPermanently);
  const getDeletePreview = useClassesStore((s) => s.getDeletePreview);
  const importStudentsToClass = useClassesStore((s) => s.importStudents);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Selection mode for lectures
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Students (inline config)
  const allStudents = useStudentsStore((s) => s.students);
  const fetchStudents = useStudentsStore((s) => s.fetchStudents);
  const bulkAddStudents = useStudentsStore((s) => s.bulkAddStudents);
  const addExistingToClass = useStudentsStore((s) => s.addExistingToClass);
  const fetchPoolNotInClass = useStudentsStore((s) => s.fetchPoolNotInClass);
  const removeFromClass = useStudentsStore((s) => s.removeFromClass);
  const studentsLoading = useStudentsStore((s) => s.loading);
  const poolLoading = useStudentsStore((s) => s.poolLoading);

  const students = useMemo(() => allStudents.filter((s) => s.classId === classId), [allStudents, classId]);

  const [showAddStudents, setShowAddStudents] = useState(false);
  const [addStudentsTab, setAddStudentsTab] = useState<'new' | 'existing'>('new');
  const [studentInputs, setStudentInputs] = useState<string[]>(['']);
  const [availableStudents, setAvailableStudents] = useState<StudentPoolEntry[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [addSearch, setAddSearch] = useState('');
  const [addClassFilter, setAddClassFilter] = useState('');
  const [studentsSaving, setStudentsSaving] = useState(false);
  const [studentsProgress, setStudentsProgress] = useState('');
  const [removeStudentTarget, setRemoveStudentTarget] = useState<{ id: string; name: string } | null>(null);
  const [importAlert, setImportAlert] = useState<{ header: string; message: string; color?: string } | null>(null);

  // Delete class
  const [showDeleteClassModal, setShowDeleteClassModal] = useState(false);
  const [deleteClassPreview, setDeleteClassPreview] = useState<DeletePreview | null>(null);
  const [loadingDeletePreview, setLoadingDeletePreview] = useState(false);
  const [deletingClass, setDeletingClass] = useState(false);

  // Academic calendar
  const acStore = useAcademicConfigStore();
  const [calPeriodMode, setCalPeriodMode] = useState<PeriodMode>('trimester');
  const [calDates, setCalDates] = useState<Record<string, string>>({});
  const [calSaving, setCalSaving] = useState(false);
  const [calLoaded, setCalLoaded] = useState(false);

  const calComplete = (() => {
    const t1ok = !!(calDates.t1_start && calDates.t1_end);
    const t2ok = !!(calDates.t2_start && calDates.t2_end);
    if (calPeriodMode === 'cuatrimester') return t1ok && t2ok;
    return t1ok && t2ok && !!(calDates.t3_start && calDates.t3_end);
  })();

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const firstId = Array.from(selectedIds)[0];
    const lectureToDelete = classData?.lectures.find(l => l.id === firstId);
    if (lectureToDelete) {
      setDeleteTarget({ id: lectureToDelete.id, name: lectureToDelete.name });
    }
  };

  const loadClass = async () => {
    setLoading(true);
    try {
      const res = await classesApi.get(classId);
      setClassData({
        id: res.data.id,
        name: res.data.name,
        year: res.data.year,
        educationLevel: res.data.education_level || 'secundaria',
        lectures: (res.data.lectures || []).map((l: any) => ({
          id: l.id,
          classId: l.class_id,
          name: l.name,
          subjectId: l.subject_id || undefined,
          subjectName: l.subject_name || undefined,
          schedule: l.schedule || [],
        })),
      });
    } catch (err) {
      console.error('Failed to load class:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClass();
  }, [classId]);

  // Load academic calendar (wait for classData to have year for pre-fill)
  useEffect(() => {
    if (!classId || !classData) return;
    academicConfigApi.get(classId).then((res) => {
      const d = res.data;
      setCalPeriodMode(d.period_mode || 'trimester');
      setCalDates({
        t1_start: d.trimester_1_start || '',
        t1_end: d.trimester_1_end || '',
        t2_start: d.trimester_2_start || '',
        t2_end: d.trimester_2_end || '',
        t3_start: d.trimester_3_start || '',
        t3_end: d.trimester_3_end || '',
      });
      setCalLoaded(true);
    }).catch(() => {
      // No config yet — pre-fill with typical trimester dates AND auto-save
      const yearStr = classData?.year || '';
      const yearMatch = yearStr.match(/(\d{4})/);
      const y1 = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      const y2 = y1 + 1;
      const defaults = {
        t1_start: `${y1}-09-01`, t1_end: `${y1}-12-31`,
        t2_start: `${y2}-01-07`, t2_end: `${y2}-03-31`,
        t3_start: `${y2}-04-01`, t3_end: `${y2}-07-15`,
      };
      setCalDates(defaults);
      setCalLoaded(true);
      // Auto-save the defaults so they persist
      saveCalendar('trimester', defaults);
    });
  }, [classId, classData]);

  useEffect(() => {
    if (classId) fetchStudents(classId);
  }, [classId, fetchStudents]);

  useEffect(() => {
    // Fetch ALL teacher subjects so the dropdown always shows available options
    subjectsApi.list().then(res => {
      setClassSubjectsList(res.data.map((s: any) => ({ id: s.id, name: s.name })));
    }).catch(() => setClassSubjectsList([]));
  }, [classId]);

  // Load aula and color per subject for this class
  const loadAulas = async () => {
    if (!classId) return;
    try {
      const res = await classesApi.getSubjectsSummary(classId);
      const aulaMap: Record<string, string> = {};
      const colorMap: Record<string, string> = {};
      for (const s of res.data) {
        if (s.aula) aulaMap[s.subject_id] = s.aula;
        if (s.subject_color) colorMap[s.subject_id] = s.subject_color;
      }
      setAulaBySubject(aulaMap);
      setColorBySubject(colorMap);
    } catch {}
  };

  useEffect(() => {
    loadAulas();
  }, [classId]);

  const saveCalendar = async (mode: PeriodMode, dates: Record<string, string>) => {
    if (!classData) return;
    const t1ok = dates.t1_start && dates.t1_end;
    const t2ok = dates.t2_start && dates.t2_end;
    const t3ok = mode === 'trimester' ? dates.t3_start && dates.t3_end : true;
    if (!t1ok || !t2ok || !t3ok) return; // incomplete — don't save yet
    setCalSaving(true);
    try {
      await academicConfigApi.save({
        class_id: classId,
        year: classData.year,
        period_mode: mode,
        trimester_1_start: dates.t1_start,
        trimester_1_end: dates.t1_end,
        trimester_2_start: dates.t2_start,
        trimester_2_end: dates.t2_end,
        trimester_3_start: mode === 'trimester' ? dates.t3_start : null,
        trimester_3_end: mode === 'trimester' ? dates.t3_end : null,
      });
      // Update store cache
      acStore.setConfig(classId, null); // invalidate so next fetch gets fresh data
    } catch (err) {
      console.error('Failed to save calendar:', err);
    } finally {
      setCalSaving(false);
    }
  };

  const handleCalDateChange = (key: string, value: string) => {
    const next = { ...calDates, [key]: value };
    setCalDates(next);
    saveCalendar(calPeriodMode, next);
  };

  const handleCalModeChange = (mode: PeriodMode) => {
    setCalPeriodMode(mode);
    // Pre-fill with typical dates based on academic year
    const yearStr = classData?.year || '';
    const yearMatch = yearStr.match(/(\d{4})/);
    const y1 = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
    const y2 = y1 + 1;

    let next: Record<string, string>;
    if (mode === 'trimester') {
      next = {
        t1_start: `${y1}-09-01`, t1_end: `${y1}-12-31`,
        t2_start: `${y2}-01-07`, t2_end: `${y2}-03-31`,
        t3_start: `${y2}-04-01`, t3_end: `${y2}-07-15`,
      };
    } else {
      next = {
        t1_start: `${y1}-09-01`, t1_end: `${y2}-02-01`,
        t2_start: `${y2}-02-02`, t2_end: `${y2}-06-01`,
        t3_start: '', t3_end: '',
      };
    }
    setCalDates(next);
    saveCalendar(mode, next);
  };

  useEffect(() => {
    if (showAddStudents && addStudentsTab === 'existing' && classId) {
      fetchPoolNotInClass(classId).then(setAvailableStudents);
    }
  }, [showAddStudents, addStudentsTab, classId, fetchPoolNotInClass]);

  // Fetch all schedules when lecture modal opens
  const fetchAllSchedules = async () => {
    try {
      const res = await lecturesApi.allSchedules();
      setAllSchedules(res.data);
    } catch {
      setAllSchedules([]);
    }
  };

  const openNewLecture = () => {
    setEditingLecture(null);
    setLectureName('');
    setLectureSchedule([]);
    setLectureAula('');
    setLectureColor('#15665E');
    fetchAllSchedules();
    setShowLectureModal(true);
  };

  const openEditLecture = (lecture: Lecture) => {
    setEditingLecture(lecture);
    setLectureName(lecture.name);
    setLectureSchedule([...lecture.schedule]);
    setLectureAula(lecture.subjectId ? (aulaBySubject[lecture.subjectId] || '') : '');
    setLectureColor(lecture.subjectId ? (colorBySubject[lecture.subjectId] || '#15665E') : '#15665E');
    fetchAllSchedules();
    setShowLectureModal(true);
  };

  const addScheduleSlot = () => {
    const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    setLectureSchedule(prev => {
      const usedDays = new Set(prev.map(s => s.day));
      const nextDay = allDays.find(d => !usedDays.has(d)) || allDays[(prev.length) % allDays.length];
      const lastSlot = prev[prev.length - 1];
      const startTime = lastSlot?.start_time || '09:00';
      const endTime = lastSlot?.end_time || '10:00';
      return [...prev, { day: nextDay, start_time: startTime, end_time: endTime }];
    });
  };

  const updateScheduleSlot = (index: number, field: keyof ScheduleSlot, value: string) => {
    setLectureSchedule(prev => {
      const updated = [...prev];
      const slot = updated[index];

      if (field === 'start_time') {
        // Auto-adjust end_time: keep the same duration
        const oldStart = timeToMinutes(slot.start_time);
        const oldEnd = timeToMinutes(slot.end_time);
        const duration = oldEnd > oldStart ? oldEnd - oldStart : 60; // default 1h
        const newStart = timeToMinutes(value);
        const newEnd = Math.min(newStart + duration, 21 * 60); // cap at 21:00
        updated[index] = { ...slot, start_time: value, end_time: minutesToTime(newEnd) };
      } else {
        updated[index] = { ...slot, [field]: value };
      }

      return updated;
    });
  };

  const removeScheduleSlot = (index: number) => {
    setLectureSchedule(prev => prev.filter((_, i) => i !== index));
  };

  // Conflict detection: check each slot against other slots in same lecture AND other lectures
  const scheduleConflicts = useMemo(() => {
    const conflicts: Map<number, { lectureName: string; className: string }> = new Map();
    if (lectureSchedule.length === 0) return conflicts;

    // First: check for overlaps within the same lecture being edited
    for (let i = 0; i < lectureSchedule.length; i++) {
      const slot = lectureSchedule[i];
      if (!slot.day || !slot.start_time || !slot.end_time) continue;
      for (let j = i + 1; j < lectureSchedule.length; j++) {
        const other = lectureSchedule[j];
        if (!other.day || !other.start_time || !other.end_time) continue;
        if (other.day !== slot.day) continue;
        if (slot.start_time < other.end_time && other.start_time < slot.end_time) {
          conflicts.set(i, { lectureName: lectureName || 'esta asignatura', className: '' });
          conflicts.set(j, { lectureName: lectureName || 'esta asignatura', className: '' });
        }
      }
    }

    // Then: check against other lectures across all classes
    if (allSchedules.length > 0) {
      const otherLectures = allSchedules.filter(l => !editingLecture || l.id !== editingLecture.id);

      for (let i = 0; i < lectureSchedule.length; i++) {
        if (conflicts.has(i)) continue;
        const slot = lectureSchedule[i];
        if (!slot.day || !slot.start_time || !slot.end_time) continue;

        for (const other of otherLectures) {
          for (const otherSlot of other.schedule) {
            if (otherSlot.day !== slot.day) continue;
            if (slot.start_time < otherSlot.end_time && otherSlot.start_time < slot.end_time) {
              conflicts.set(i, { lectureName: other.name, className: other.class_name });
              break;
            }
          }
          if (conflicts.has(i)) break;
        }
      }
    }
    return conflicts;
  }, [lectureSchedule, allSchedules, editingLecture, lectureName]);

  const hasConflicts = scheduleConflicts.size > 0;

  const handleSaveLecture = async () => {
    if (!lectureName.trim() || hasConflicts) return;
    setSaving(true);
    try {
      let savedLecture: any;
      if (editingLecture) {
        savedLecture = await lecturesApi.update(classId, editingLecture.id, {
          name: lectureName.trim(),
          schedule: lectureSchedule,
        });
      } else {
        savedLecture = await lecturesApi.create(classId, {
          name: lectureName.trim(),
          schedule: lectureSchedule,
        });
      }
      // Save aula on the class-subject link + color on the subject
      const subjectId = savedLecture?.data?.subject_id || editingLecture?.subjectId;
      if (subjectId) {
        try {
          await Promise.all([
            subjectsApi.updateClassLink(subjectId, classId, { aula: lectureAula.trim() || '' }),
            subjectsApi.update(subjectId, { color: lectureColor }),
          ]);
        } catch {}
      }
      await loadClass();
      await loadAulas();
      // Refresh global stores so class cards update immediately
      await Promise.all([
        fetchClasses(),
        fetchClassSubjects(classId),
      ]);
      setShowLectureModal(false);
    } catch (err) {
      console.error('Failed to save lecture:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLecture = async () => {
    if (!deleteTarget) return;
    try {
      await lecturesApi.delete(classId, deleteTarget.id);
      await loadClass();
      await Promise.all([fetchClasses(), fetchClassSubjects(classId)]);
    } catch (err) {
      console.error('Failed to delete lecture:', err);
    }
    setDeleteTarget(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // ——— Students (inline config) ———
  const handleStudentInputChange = (index: number, value: string) => {
    setStudentInputs((prev) => {
      const u = [...prev];
      u[index] = value;
      return u;
    });
  };
  const handleAddStudentRow = () => setStudentInputs((prev) => [...prev, '']);
  const handleRemoveStudentRow = (index: number) => {
    if (studentInputs.length <= 1) return;
    setStudentInputs((prev) => prev.filter((_, i) => i !== index));
  };
  const validNewNames = studentInputs.filter((n) => n.trim().length > 0);

  const uniqueClassesForFilter = useMemo(() => Array.from(
    new Map(availableStudents.flatMap((s) => s.classes).map((c) => [c.class_id, c])).values()
  ).sort((a, b) => a.class_name.localeCompare(b.class_name)), [availableStudents]);

  const filteredAvailableStudents = useMemo(() => availableStudents.filter((s) => {
    const matchSearch = !addSearch || s.name.toLowerCase().includes(addSearch.toLowerCase());
    const matchClass = !addClassFilter || s.classes.some((c) => c.class_id === addClassFilter);
    return matchSearch && matchClass;
  }), [availableStudents, addSearch, addClassFilter]);

  const toggleAddStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllAddStudents = () => {
    if (selectedStudentIds.size === filteredAvailableStudents.length) setSelectedStudentIds(new Set());
    else setSelectedStudentIds(new Set(filteredAvailableStudents.map((s) => s.id)));
  };

  const handleAddNewStudents = async () => {
    const names = validNewNames;
    if (names.length === 0) return;
    setStudentsSaving(true);
    setStudentsProgress(`Añadiendo ${names.length} alumnos...`);
    try {
      await bulkAddStudents(classId, names);
      setStudentInputs(['']);
      await fetchStudents(classId);
    } catch (err) {
      console.error('Failed to add students:', err);
    } finally {
      setStudentsSaving(false);
      setStudentsProgress('');
    }
  };

  const handleAddExistingStudents = async () => {
    if (selectedStudentIds.size === 0) return;
    setStudentsSaving(true);
    setStudentsProgress(`Añadiendo ${selectedStudentIds.size} alumnos...`);
    try {
      await addExistingToClass(classId, Array.from(selectedStudentIds));
      setSelectedStudentIds(new Set());
      // Refresh both the class students and available students lists
      await fetchStudents(classId);
      const updatedPool = await fetchPoolNotInClass(classId);
      setAvailableStudents(updatedPool);
    } catch (err) {
      console.error('Failed to add existing students:', err);
    } finally {
      setStudentsSaving(false);
      setStudentsProgress('');
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStudentsSaving(true);
    setStudentsProgress('Importando alumnos...');
    try {
      const count = await importStudentsToClass(classId, file);
      await fetchStudents(classId);
      setImportAlert({ header: 'Importación completada', message: `Se importaron ${count} alumnos.` });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Error al importar el archivo.';
      setImportAlert({ header: 'Error al importar', message: detail, color: 'danger' });
    } finally {
      setStudentsSaving(false);
      setStudentsProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveStudentFromClass = async () => {
    if (!removeStudentTarget) return;
    try {
      await removeFromClass(classId, removeStudentTarget.id);
      await fetchStudents(classId);
    } catch (err) {
      console.error('Failed to remove student:', err);
    }
    setRemoveStudentTarget(null);
  };

  const handleStartDeleteClass = async () => {
    setShowDeleteClassModal(true);
    setLoadingDeletePreview(true);
    try {
      const preview = await getDeletePreview(classId);
      setDeleteClassPreview(preview);
    } catch (err) {
      console.error('Failed to get delete preview:', err);
    } finally {
      setLoadingDeletePreview(false);
    }
  };

  const handleDeleteClassConfirm = async () => {
    setDeletingClass(true);
    try {
      await deleteClassPermanently(classId);
      await fetchClasses();
      history.replace('/tabs/classes');
    } catch (err) {
      console.error('Failed to delete class:', err);
    } finally {
      setDeletingClass(false);
      setShowDeleteClassModal(false);
      setDeleteClassPreview(null);
    }
  };

  const handleCancelDeleteClass = () => {
    setShowDeleteClassModal(false);
    setDeleteClassPreview(null);
  };

  if (loading) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start">
              <IonBackButton defaultHref="/tabs/classes" />
            </IonButtons>
            <IonTitle>Configuración</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <div className="settings-loading"><IonSpinner color="primary" /></div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/tabs/classes/${classId}`} />
          </IonButtons>
          <IonTitle>{classData?.name || 'Clase'}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="settings-content">
        {/* Class Info */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Información</h2>
          </div>
          <div className="settings-info-card">
            <div className="settings-info-row settings-info-row--editable" onClick={() => editingField !== 'name' && startEditing('name')}>
              <span className="settings-info-label">Nombre</span>
              {editingField === 'name' ? (
                <input
                  className="settings-info-inline-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={saveField}
                  onKeyDown={handleEditKeyDown}
                  autoFocus
                  maxLength={100}
                />
              ) : (
                <span className="settings-info-value settings-info-value--editable">
                  {classData?.name}
                  <IonIcon icon={createOutline} className="settings-info-edit-icon" />
                </span>
              )}
            </div>
            <div className="settings-info-row settings-info-row--editable" onClick={() => editingField !== 'year' && startEditing('year')}>
              <span className="settings-info-label">Curso</span>
              {editingField === 'year' ? (
                <input
                  className="settings-info-inline-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={saveField}
                  onKeyDown={handleEditKeyDown}
                  autoFocus
                  maxLength={20}
                />
              ) : (
                <span className="settings-info-value settings-info-value--editable">
                  {classData?.year}
                  <IonIcon icon={createOutline} className="settings-info-edit-icon" />
                </span>
              )}
            </div>
            <div className="settings-info-row settings-info-row--vertical">
              <span className="settings-info-label">Nivel educativo</span>
              <div className="education-level-chips">
                {EDUCATION_LEVELS.map(([value, label, ages]) => (
                  <button
                    key={value}
                    type="button"
                    className={`education-level-chip ${classData?.educationLevel === value ? 'education-level-chip--active' : ''}`}
                    onClick={async () => {
                      if (value === classData?.educationLevel) return;
                      try {
                        await classesApi.update(classId, { education_level: value });
                        setClassData((prev) => prev ? { ...prev, educationLevel: value } : prev);
                        fetchClasses();
                      } catch (err) {
                        console.error('Failed to update education level:', err);
                      }
                    }}
                  >
                    <span className="education-level-chip__label">{label}</span>
                    <span className="education-level-chip__ages">{ages}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Academic Calendar */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Calendario académico</h2>
            {calSaving && <IonSpinner name="crescent" style={{ width: 16, height: 16 }} />}
          </div>
          {!calLoaded ? (
            <div style={{ textAlign: 'center', padding: 16 }}><IonSpinner name="crescent" /></div>
          ) : (
            <div className="settings-info-card">
              {/* Period mode selector */}
              <div className="settings-info-row settings-info-row--vertical">
                <span className="settings-info-label">Tipo de periodo</span>
                <div className="education-level-chips">
                  <button type="button"
                    className={`education-level-chip ${calPeriodMode === 'trimester' ? 'education-level-chip--active' : ''}`}
                    onClick={() => handleCalModeChange('trimester')}>
                    <span className="education-level-chip__label">3 Trimestres</span>
                    <span className="education-level-chip__ages">Sep–Jun</span>
                  </button>
                  <button type="button"
                    className={`education-level-chip ${calPeriodMode === 'cuatrimester' ? 'education-level-chip--active' : ''}`}
                    onClick={() => handleCalModeChange('cuatrimester')}>
                    <span className="education-level-chip__label">2 Cuatrimestres</span>
                    <span className="education-level-chip__ages">Sep–Jun</span>
                  </button>
                </div>
              </div>

              {/* Date pickers per period */}
              {(calPeriodMode === 'trimester' ? [1, 2, 3] : [1, 2]).map((n) => (
                <div key={n} className="settings-info-row settings-info-row--vertical cal-period-row">
                  <span className="settings-info-label">{getPeriodFullLabel(calPeriodMode, n)}</span>
                  <div className="cal-date-pair">
                    <input type="date" className="cal-date-input"
                      value={calDates[`t${n}_start`] || ''}
                      onChange={(e) => handleCalDateChange(`t${n}_start`, e.target.value)}
                    />
                    <span className="cal-date-sep">→</span>
                    <input type="date" className="cal-date-input"
                      value={calDates[`t${n}_end`] || ''}
                      onChange={(e) => handleCalDateChange(`t${n}_end`, e.target.value)}
                    />
                  </div>
                </div>
              ))}

            </div>
          )}
        </div>


        {/* Lectures — hidden until calendar is complete */}
        {(!calLoaded || calComplete) && (
        <>
        {/* Lectures */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Asignaturas</h2>
            <div className="settings-section__actions">
              {selectionMode ? (
                <>
                  <IonButton fill="clear" size="small" onClick={exitSelectionMode}>
                    <IonIcon icon={closeOutline} slot="icon-only" />
                  </IonButton>
                  <IonButton 
                    fill="clear" 
                    size="small" 
                    color="danger" 
                    onClick={handleDeleteSelected}
                    disabled={selectedIds.size === 0}
                  >
                    <IonIcon icon={trashOutline} slot="icon-only" />
                  </IonButton>
                </>
              ) : (
                <>
                  {classData?.lectures && classData.lectures.length > 0 && (
                    <IonButton fill="clear" size="small" onClick={() => setSelectionMode(true)}>
                      <IonIcon icon={trashOutline} slot="icon-only" />
                    </IonButton>
                  )}
                  <IonButton fill="clear" size="small" onClick={openNewLecture}>
                    <IonIcon icon={addOutline} slot="start" />
                    Añadir
                  </IonButton>
                </>
              )}
            </div>
          </div>

          {classData?.lectures && classData.lectures.length > 0 ? (
            <div className="settings-lectures">
              {classData.lectures.map(lecture => {
                const isSelected = selectedIds.has(lecture.id);
                return (
                  <IonItemSliding key={lecture.id} disabled={selectionMode}>
                    <div
                      className={`lecture-card ${selectionMode ? 'lecture-card--selectable' : ''} ${isSelected ? 'lecture-card--selected' : ''}`}
                      onClick={() => {
                        if (selectionMode) {
                          toggleSelection(lecture.id);
                        } else {
                          openEditLecture(lecture);
                        }
                      }}
                    >
                      {selectionMode && (
                        <div className="lecture-card__checkbox">
                          <IonIcon 
                            icon={isSelected ? checkboxOutline : squareOutline} 
                            color={isSelected ? 'primary' : 'medium'}
                          />
                        </div>
                      )}
                      <div className="lecture-card__main">
                        <span className="lecture-card__name">
                          {lecture.name}
                          {lecture.subjectId && aulaBySubject[lecture.subjectId] && (
                            <span className="lecture-card__aula"> · {aulaBySubject[lecture.subjectId]}</span>
                          )}
                        </span>
                        {lecture.subjectName && (
                          <span className="lecture-card__subject">{lecture.subjectName}</span>
                        )}
                        <span className="lecture-card__schedule">
                          <IonIcon icon={timeOutline} />
                          {formatSchedule(lecture.schedule)}
                        </span>
                      </div>
                    </div>
                    <IonItemOptions side="end">
                      <IonItemOption
                        color="danger"
                        onClick={() => setDeleteTarget({ id: lecture.id, name: lecture.name })}
                      >
                        Eliminar
                      </IonItemOption>
                    </IonItemOptions>
                  </IonItemSliding>
                );
              })}
            </div>
          ) : (
            <div className="settings-empty">
              <p>No hay asignaturas configuradas</p>
              <IonButton fill="outline" size="small" onClick={openNewLecture}>
                <IonIcon icon={addOutline} slot="start" />
                Añadir asignatura
              </IonButton>
            </div>
          )}
        </div>

        {/* Students - configure inline */}
        <div className="settings-section">
          <div className="settings-section__header">
            <h2 className="settings-section__title">Alumnos</h2>
            <span className="settings-section__count">{students.length}</span>
          </div>

          {studentsLoading ? (
            <div className="settings-students-loading"><IonSpinner color="primary" /></div>
          ) : (
            <>
              <div className="settings-add-students-block">
                <button
                  type="button"
                  className="settings-add-students-toggle"
                  onClick={() => setShowAddStudents((v) => !v)}
                >
                  <IonIcon icon={addOutline} />
                  <span>Añadir alumnos</span>
                  <IonIcon icon={showAddStudents ? chevronUpOutline : chevronDownOutline} />
                </button>

                {showAddStudents && (
                  <div className="settings-add-students-form">
                    {studentsSaving && (
                      <div className="settings-add-students-progress">
                        <IonProgressBar type="indeterminate" />
                        <span>{studentsProgress}</span>
                      </div>
                    )}

                    <IonSegment value={addStudentsTab} onIonChange={(e) => setAddStudentsTab(e.detail.value as 'new' | 'existing')}>
                      <IonSegmentButton value="new">
                        <IonLabel>Nuevos</IonLabel>
                      </IonSegmentButton>
                      <IonSegmentButton value="existing">
                        <IonLabel>Existentes</IonLabel>
                      </IonSegmentButton>
                    </IonSegment>

                    {addStudentsTab === 'new' && (
                      <div className="settings-add-new">
                        <p className="settings-add-hint">
                          Introduce los nombres de los nuevos alumnos para {classData?.name}
                        </p>
                        <IonList className="settings-add-input-list">
                          {studentInputs.map((value, index) => (
                            <IonItem key={index}>
                              <IonInput
                                value={value}
                                placeholder={`Nombre del alumno ${index + 1}`}
                                onIonInput={(e) => handleStudentInputChange(index, e.detail.value ?? '')}
                              />
                              {studentInputs.length > 1 && (
                                <IonButton fill="clear" slot="end" onClick={() => handleRemoveStudentRow(index)}>
                                  <IonIcon icon={trashOutline} color="danger" />
                                </IonButton>
                              )}
                            </IonItem>
                          ))}
                        </IonList>
                        <IonButton fill="clear" expand="block" onClick={handleAddStudentRow}>
                          <IonIcon icon={addOutline} slot="start" />
                          Añadir otro
                        </IonButton>
                        <IonButton
                          expand="block"
                          onClick={handleAddNewStudents}
                          disabled={studentsSaving || validNewNames.length === 0}
                        >
                          {studentsSaving ? <IonSpinner name="crescent" /> : `Añadir ${validNewNames.length || ''} alumnos`}
                        </IonButton>

                        <div className="settings-csv-divider">
                          <span>o importar desde archivo</span>
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          style={{ display: 'none' }}
                          accept=".csv,.txt"
                          onChange={handleImportFile}
                        />
                        <IonButton
                          expand="block"
                          fill="outline"
                          onClick={handleImportClick}
                          disabled={studentsSaving}
                        >
                          <IonIcon icon={cloudUploadOutline} slot="start" />
                          Importar CSV
                        </IonButton>
                        <p className="settings-csv-hint">
                          Un nombre por línea, sin encabezado. Máximo 50 alumnos.
                        </p>
                      </div>
                    )}

                    {addStudentsTab === 'existing' && (
                      <div className="settings-add-existing">
                        {availableStudents.length === 0 && !poolLoading ? (
                          <div className="settings-add-empty">
                            <IonIcon icon={personAddOutline} />
                            <p>No hay alumnos de otras clases para añadir.</p>
                          </div>
                        ) : (
                          <>
                            <IonSearchbar
                              value={addSearch}
                              onIonInput={(e) => setAddSearch(e.detail.value ?? '')}
                              placeholder="Buscar alumnos..."
                              className="settings-add-search"
                            />
                            {uniqueClassesForFilter.length > 0 && (
                              <IonSelect
                                value={addClassFilter}
                                onIonChange={(e) => setAddClassFilter(e.detail.value)}
                                interface="popover"
                                placeholder="Todas las clases"
                                className="settings-add-class-filter"
                              >
                                <IonSelectOption value="">Todas las clases</IonSelectOption>
                                {uniqueClassesForFilter.map((c) => (
                                  <IonSelectOption key={c.class_id} value={c.class_id}>{c.class_name}</IonSelectOption>
                                ))}
                              </IonSelect>
                            )}
                            {poolLoading ? (
                              <div className="settings-add-loading"><IonSpinner /></div>
                            ) : (
                              <>
                                <div className="settings-add-select-all">
                                  <IonCheckbox
                                    checked={selectedStudentIds.size === filteredAvailableStudents.length && filteredAvailableStudents.length > 0}
                                    indeterminate={selectedStudentIds.size > 0 && selectedStudentIds.size < filteredAvailableStudents.length}
                                    onIonChange={toggleAllAddStudents}
                                  />
                                  <span>Seleccionar todos ({filteredAvailableStudents.length})</span>
                                </div>
                                <IonList className="settings-add-existing-list">
                                  {filteredAvailableStudents.map((st) => (
                                    <IonItem key={st.id} button onClick={() => toggleAddStudent(st.id)}>
                                      <IonCheckbox slot="start" checked={selectedStudentIds.has(st.id)} />
                                      <IonLabel>
                                        <h2>{st.name}</h2>
                                        {st.classes.length > 0 && (
                                          <p>En: {st.classes.map((c) => c.class_name).join(', ')}</p>
                                        )}
                                      </IonLabel>
                                    </IonItem>
                                  ))}
                                </IonList>
                                <IonButton
                                  expand="block"
                                  onClick={handleAddExistingStudents}
                                  disabled={studentsSaving || selectedStudentIds.size === 0}
                                >
                                  {studentsSaving ? <IonSpinner name="crescent" /> : `Añadir ${selectedStudentIds.size || ''} seleccionados`}
                                </IonButton>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {students.length > 0 ? (
                <div className="settings-students-list">
                  {students.map((s) => (
                    <div key={s.id} className="settings-student-row">
                      <div className="settings-student-info">
                        <span className="settings-student-name">{s.name}</span>
                        {s.studentId && (
                          <span className="settings-student-code">{s.studentId}</span>
                        )}
                      </div>
                      <IonButton
                        fill="clear"
                        size="small"
                        color="danger"
                        onClick={() => setRemoveStudentTarget({ id: s.id, name: s.name })}
                      >
                        <IonIcon icon={trashOutline} slot="icon-only" />
                      </IonButton>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="settings-students-empty">Aún no hay alumnos en esta clase.</p>
              )}
            </>
          )}
        </div>
        </>
        )}
        {/* Class Actions */}
        <div className="settings-actions">
          <IonButton
            expand="block"
            onClick={() => history.push(`/tabs/classes/${classId}`)}
            className="settings-actions__save"
            disabled={calLoaded && !calComplete}
          >
            Guardar clase
          </IonButton>
          <IonButton
            expand="block"
            fill="outline"
            color="danger"
            onClick={handleStartDeleteClass}
            className="settings-actions__delete"
          >
            <IonIcon icon={trashOutline} slot="start" />
            Eliminar clase
          </IonButton>
        </div>
      </IonContent>

      {/* Delete Class Modal */}
      <IonModal
        isOpen={showDeleteClassModal}
        onDidDismiss={handleCancelDeleteClass}
        initialBreakpoint={isDesktop ? 1 : 0.5}
        breakpoints={isDesktop ? [0, 1] : [0, 0.5, 0.75]}
      >
        <div className="modal-sheet">
          <h2 className="modal-sheet__title">Eliminar clase</h2>
          <p className="modal-sheet__subtitle">
            ¿Seguro que quieres eliminar "{classData?.name}"?
          </p>

          {loadingDeletePreview ? (
            <div className="delete-preview-loading">
              <IonSpinner color="primary" />
              <span>Calculando elementos...</span>
            </div>
          ) : deleteClassPreview && (
            <div className="delete-preview">
              <p className="delete-preview__warning">
                <IonIcon icon={warningOutline} /> Se eliminarán permanentemente:
              </p>
              <ul className="delete-preview__list">
                {deleteClassPreview.counts.students > 0 && (
                  <li>{deleteClassPreview.counts.students} alumno{deleteClassPreview.counts.students !== 1 ? 's' : ''}</li>
                )}
                {deleteClassPreview.counts.lectures > 0 && (
                  <li>{deleteClassPreview.counts.lectures} asignatura{deleteClassPreview.counts.lectures !== 1 ? 's' : ''}</li>
                )}
                {deleteClassPreview.counts.exams > 0 && (
                  <li>{deleteClassPreview.counts.exams} examen{deleteClassPreview.counts.exams !== 1 ? 'es' : ''}</li>
                )}
                {deleteClassPreview.counts.corrections > 0 && (
                  <li>{deleteClassPreview.counts.corrections} corrección{deleteClassPreview.counts.corrections !== 1 ? 'es' : ''}</li>
                )}
                {deleteClassPreview.counts.exercises > 0 && (
                  <li>{deleteClassPreview.counts.exercises} ejercicio{deleteClassPreview.counts.exercises !== 1 ? 's' : ''}</li>
                )}
                {deleteClassPreview.counts.calendar_events > 0 && (
                  <li>{deleteClassPreview.counts.calendar_events} evento{deleteClassPreview.counts.calendar_events !== 1 ? 's' : ''} del calendario</li>
                )}
                {deleteClassPreview.counts.notes > 0 && (
                  <li>{deleteClassPreview.counts.notes} comentario{deleteClassPreview.counts.notes !== 1 ? 's' : ''}</li>
                )}
              </ul>
              <p className="delete-preview__note">
                Esta acción no se puede deshacer.
              </p>
            </div>
          )}

          <div className="delete-modal-buttons">
            <IonButton expand="block" fill="outline" onClick={handleCancelDeleteClass}>
              Cancelar
            </IonButton>
            <IonButton
              expand="block"
              color="danger"
              onClick={handleDeleteClassConfirm}
              disabled={loadingDeletePreview || deletingClass}
            >
              {deletingClass ? <IonSpinner name="crescent" /> : 'Eliminar permanentemente'}
            </IonButton>
          </div>
        </div>
      </IonModal>

      {/* Lecture Modal */}
      <IonModal
        isOpen={showLectureModal}
        onDidDismiss={() => setShowLectureModal(false)}
        initialBreakpoint={isDesktop ? 1 : 0.75}
        breakpoints={isDesktop ? [0, 1] : [0, 0.75, 0.95]}
      >
        <div className="modal-sheet modal-sheet--scrollable">
          <h2 className="modal-sheet__title">
            {editingLecture ? 'Editar asignatura' : 'Nueva asignatura'}
          </h2>

          <IonList>
            <IonItem>
              <IonLabel position="stacked">Nombre de la asignatura</IonLabel>
              <IonInput
                value={lectureName}
                onIonInput={(e) => setLectureName(e.detail.value || '')}
                placeholder="ej. Matemáticas"
              />
            </IonItem>
            {classSubjectsList.length > 0 && !editingLecture && (
              <div className="subject-name-suggestions">
                <span className="subject-name-suggestions__label">Sugerencias:</span>
                <div className="subject-name-suggestions__list">
                  {classSubjectsList
                    .filter(s => !lectureName || s.name.toLowerCase().includes(lectureName.toLowerCase()))
                    .slice(0, 5)
                    .map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className={`subject-name-suggestion ${lectureName === s.name ? 'subject-name-suggestion--active' : ''}`}
                        onClick={() => setLectureName(s.name)}
                      >
                        {s.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
            <IonItem>
              <IonLabel position="stacked">Aula</IonLabel>
              <IonInput
                value={lectureAula}
                onIonInput={(e) => setLectureAula(e.detail.value || '')}
                placeholder="ej. A51"
              />
            </IonItem>
          </IonList>

          <div className="color-picker-section">
            <span className="color-picker-section__label">Color</span>
            <div className="color-picker-dots">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-picker-dot ${lectureColor === c ? 'color-picker-dot--active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setLectureColor(c)}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className="schedule-section">
            <div className="schedule-section__header">
              <h3>Horario semanal</h3>
              <IonButton fill="clear" size="small" onClick={addScheduleSlot}>
                <IonIcon icon={addOutline} slot="start" />
                Añadir
              </IonButton>
            </div>

            {lectureSchedule.length === 0 ? (
              <p className="schedule-empty">Sin horario configurado</p>
            ) : (
              <div className="schedule-slots">
                {lectureSchedule.map((slot, index) => {
                  const conflict = scheduleConflicts.get(index);
                  return (
                    <div key={index}>
                      <div className={`schedule-slot ${conflict ? 'schedule-slot--conflict' : ''}`}>
                        <IonSelect
                          value={slot.day}
                          onIonChange={(e) => updateScheduleSlot(index, 'day', e.detail.value)}
                          interface="popover"
                          className="schedule-slot__day"
                        >
                          {WEEK_DAYS.map(d => (
                            <IonSelectOption key={d.key} value={d.key}>{d.label}</IonSelectOption>
                          ))}
                        </IonSelect>
                        <IonSelect
                          value={slot.start_time}
                          onIonChange={(e) => updateScheduleSlot(index, 'start_time', e.detail.value)}
                          interface="popover"
                          className="schedule-slot__time"
                        >
                          {TIME_SLOTS.map(t => (
                            <IonSelectOption key={t} value={t}>{t}</IonSelectOption>
                          ))}
                        </IonSelect>
                        <span className="schedule-slot__separator">-</span>
                        <IonSelect
                          value={slot.end_time}
                          onIonChange={(e) => updateScheduleSlot(index, 'end_time', e.detail.value)}
                          interface="popover"
                          className="schedule-slot__time"
                        >
                          {TIME_SLOTS.map(t => (
                            <IonSelectOption key={t} value={t}>{t}</IonSelectOption>
                          ))}
                        </IonSelect>
                        <IonButton
                          fill="clear"
                          color="danger"
                          size="small"
                          onClick={() => removeScheduleSlot(index)}
                        >
                          <IonIcon icon={trashOutline} slot="icon-only" />
                        </IonButton>
                      </div>
                      {conflict && (
                        <p className="schedule-slot__conflict-msg">
                          Conflicto con {conflict.lectureName}{conflict.className ? ` (${conflict.className})` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {hasConflicts && (
              <p className="schedule-conflict-warning">
                Resuelve los conflictos de horario antes de guardar
              </p>
            )}
          </div>

          <IonButton
            expand="block"
            onClick={handleSaveLecture}
            disabled={saving || !lectureName.trim() || hasConflicts}
            className="ion-margin-top"
          >
            {saving ? <IonSpinner name="crescent" /> : (editingLecture ? 'Guardar cambios' : 'Crear asignatura')}
          </IonButton>
          
          <p className="schedule-note">
            <small>El horario es opcional y se puede configurar más tarde</small>
          </p>
        </div>
      </IonModal>

      {/* Delete Lecture Alert */}
      <IonAlert
        isOpen={!!deleteTarget}
        header="Eliminar asignatura"
        message={`¿Seguro que quieres eliminar "${deleteTarget?.name}"? Se eliminará la asignatura y su horario asociado.`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
          { text: 'Eliminar', role: 'destructive', handler: handleDeleteLecture }
        ]}
        onDidDismiss={() => setDeleteTarget(null)}
      />

      {/* Remove Student from Class Alert */}
      <IonAlert
        isOpen={!!removeStudentTarget}
        header="Quitar de la clase"
        message={`¿Quitar a "${removeStudentTarget?.name}" de esta clase? El alumno seguirá existiendo en otras clases si está asignado.`}
        buttons={[
          { text: 'Cancelar', role: 'cancel', handler: () => setRemoveStudentTarget(null) },
          { text: 'Quitar', role: 'destructive', handler: handleRemoveStudentFromClass }
        ]}
        onDidDismiss={() => setRemoveStudentTarget(null)}
      />

      {/* Import CSV feedback */}
      <IonAlert
        isOpen={!!importAlert}
        header={importAlert?.header || ''}
        message={importAlert?.message || ''}
        buttons={['OK']}
        onDidDismiss={() => setImportAlert(null)}
      />
    </IonPage>
  );
};

export default ClassSettings;
