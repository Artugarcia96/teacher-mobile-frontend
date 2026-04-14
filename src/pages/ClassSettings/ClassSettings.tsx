import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Clock, Trash2, X, CheckSquare, Square, AlertTriangle, Pencil, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import Modal from '@/components/shared/Modal';
import AlertConfirm from '@/components/shared/AlertConfirm';
import Spinner from '@/components/shared/Spinner';
import Searchbar from '@/components/shared/Searchbar';
import PageShell from '@/components/shared/PageShell';
import { useParams, useNavigate } from 'react-router-dom';
import { classes as classesApi, lectures as lecturesApi, subjects as subjectsApi, academicConfig as academicConfigApi } from '../../services/api';
import { Lecture, ScheduleSlot, EducationLevel } from '../../types';
import { EDUCATION_LEVEL_OPTIONS } from '../../utils/educationLevels';
import { useClassesStore, DeletePreview } from '../../store/classesStore';
import { useStudentsStore, StudentPoolEntry } from '../../store/studentsStore';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { PALETTE_COLORS } from '../../utils/avatarColors';
import { useAcademicConfigStore, AcademicConfigData } from '../../store/academicConfigStore';
import { getPeriodFullLabel, getPeriodLabel } from '../../utils/periodConfig';
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

const EDUCATION_LEVELS = EDUCATION_LEVEL_OPTIONS;

function parseYearDates(yearStr: string): { from: string; to: string } {
  const full = yearStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (full) return { from: `${full[3]}-${full[2]}-${full[1]}`, to: `${full[6]}-${full[5]}-${full[4]}` };
  const yy = yearStr.match(/(\d{4})\s*-\s*(\d{4})/);
  if (yy) return { from: `${yy[1]}-09-01`, to: `${yy[2]}-06-30` };
  const y = new Date().getFullYear();
  return { from: `${y}-09-01`, to: `${y + 1}-06-30` };
}

function formatYearLabel(from: string, to: string): string {
  const f = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  return `${f(from)} - ${f(to)}`;
}

interface ClassDetail {
  id: string;
  name: string;
  year: string;
  educationLevel: EducationLevel;
  lectures: Lecture[];
}

const ClassSettings: React.FC = () => {
  const { classId } = useParams() as { classId: string };
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline editing for name
  const [editingField, setEditingField] = useState<'name' | null>(null);
  const [editValue, setEditValue] = useState('');
  // Year date inputs
  const [yearFromDate, setYearFromDate] = useState('');
  const [yearToDate, setYearToDate] = useState('');

  const startEditing = (field: 'name') => {
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

  // Init year date inputs from classData
  useEffect(() => {
    if (!classData?.year) return;
    const { from, to } = parseYearDates(classData.year);
    setYearFromDate(from);
    setYearToDate(to);
  }, [classData?.year]);

  const handleYearDateChange = async (field: 'from' | 'to', value: string) => {
    const newFrom = field === 'from' ? value : yearFromDate;
    const newTo = field === 'to' ? value : yearToDate;
    if (field === 'from') setYearFromDate(value); else setYearToDate(value);
    if (!newFrom || !newTo) return;
    const newYear = formatYearLabel(newFrom, newTo);
    try {
      await classesApi.update(classId, { year: newYear });
      setClassData((prev) => prev ? { ...prev, year: newYear } : prev);
      fetchClasses();
    } catch (err) {
      console.error('Failed to update year:', err);
    }
  };

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
    const matchClass = !addClassFilter || addClassFilter === '__all__' || s.classes.some((c) => c.class_id === addClassFilter);
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
      navigate('/tabs/classes', { replace: true });
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
      <PageShell title="Configuración" backHref="/tabs/classes">
        <div className="settings-loading"><Spinner /></div>
      </PageShell>
    );
  }

  return (
    <PageShell title={classData?.name || 'Clase'} backHref="/tabs/classes">
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
                <Pencil size={14} className="settings-info-edit-icon" />
              </span>
            )}
          </div>
          <div className="settings-info-row settings-info-row--vertical">
            <span className="settings-info-label">Curso escolar</span>
            <div className="cal-date-pair">
              <input type="date" className="cal-date-input"
                value={yearFromDate}
                onChange={(e) => handleYearDateChange('from', e.target.value)}
              />
              <span className="cal-date-sep">&rarr;</span>
              <input type="date" className="cal-date-input"
                value={yearToDate}
                onChange={(e) => handleYearDateChange('to', e.target.value)}
              />
            </div>
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
          <h2 className="settings-section__title">Periodos</h2>
          {calSaving && <Spinner size={16} />}
        </div>
        {!calLoaded ? (
          <div style={{ textAlign: 'center', padding: 16 }}><Spinner /></div>
        ) : (
          <div className="settings-info-card">
            <div className="cal-mode-toggle">
              <button type="button"
                className={`cal-mode-btn ${calPeriodMode === 'trimester' ? 'cal-mode-btn--active' : ''}`}
                onClick={() => handleCalModeChange('trimester')}>
                Trimestres
              </button>
              <button type="button"
                className={`cal-mode-btn ${calPeriodMode === 'cuatrimester' ? 'cal-mode-btn--active' : ''}`}
                onClick={() => handleCalModeChange('cuatrimester')}>
                Cuatrimestres
              </button>
            </div>

            <div className="cal-periods-compact">
              {(calPeriodMode === 'trimester' ? [1, 2, 3] : [1, 2]).map((n) => (
                <div key={n} className="cal-period-compact">
                  <span className="cal-period-label">{getPeriodLabel(calPeriodMode, n)}</span>
                  <input type="date" className="cal-date-input cal-date-input--compact"
                    value={calDates[`t${n}_start`] || ''}
                    onChange={(e) => handleCalDateChange(`t${n}_start`, e.target.value)}
                  />
                  <span className="cal-date-sep">&rarr;</span>
                  <input type="date" className="cal-date-input cal-date-input--compact"
                    value={calDates[`t${n}_end`] || ''}
                    onChange={(e) => handleCalDateChange(`t${n}_end`, e.target.value)}
                  />
                </div>
              ))}
            </div>
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
                <Button variant="ghost" size="sm" onClick={exitSelectionMode}>
                  <X size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.size === 0}
                >
                  <Trash2 size={16} />
                </Button>
              </>
            ) : (
              <>
                {classData?.lectures && classData.lectures.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectionMode(true)}>
                    <Trash2 size={16} />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={openNewLecture}>
                  <Plus size={16} className="mr-1" />
                  Añadir
                </Button>
              </>
            )}
          </div>
        </div>

        {classData?.lectures && classData.lectures.length > 0 ? (
          <div className="settings-lectures">
            {classData.lectures.map(lecture => {
              const isSelected = selectedIds.has(lecture.id);
              return (
                <div
                  key={lecture.id}
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
                      {isSelected
                        ? <CheckSquare size={24} className="text-primary" />
                        : <Square size={24} className="text-muted-foreground" />
                      }
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
                      <Clock size={14} />
                      {formatSchedule(lecture.schedule)}
                    </span>
                  </div>
                  {!selectionMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive shrink-0 ml-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: lecture.id, name: lecture.name });
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="settings-empty-text">No hay asignaturas configuradas</p>
        )}
      </div>

      {/* Students */}
      <div className="settings-section">
        <div className="settings-section__header">
          <h2 className="settings-section__title">Alumnos</h2>
          <div className="settings-section__actions">
            <span className="settings-section__count">{students.length}</span>
            <Button variant="ghost" size="sm" onClick={() => setShowAddStudents((v) => !v)}>
              {showAddStudents ? <X size={16} className="mr-1" /> : <Plus size={16} className="mr-1" />}
              {showAddStudents ? 'Cerrar' : 'Añadir'}
            </Button>
          </div>
        </div>

        {studentsLoading ? (
          <div className="settings-students-loading"><Spinner /></div>
        ) : (
          <>
            {showAddStudents && (
              <div className="settings-info-card students-add-card">
                {studentsSaving && (
                  <div className="settings-add-students-progress">
                    <Progress value={100} className="animate-pulse" />
                    <span>{studentsProgress}</span>
                  </div>
                )}

                <div className="cal-mode-toggle">
                  <button type="button"
                    className={`cal-mode-btn ${addStudentsTab === 'new' ? 'cal-mode-btn--active' : ''}`}
                    onClick={() => setAddStudentsTab('new')}>
                    Nuevos
                  </button>
                  <button type="button"
                    className={`cal-mode-btn ${addStudentsTab === 'existing' ? 'cal-mode-btn--active' : ''}`}
                    onClick={() => setAddStudentsTab('existing')}>
                    Existentes
                  </button>
                </div>

                {addStudentsTab === 'new' && (
                  <div className="students-add-new-compact">
                    {studentInputs.map((value, index) => (
                      <div key={index} className="student-input-row">
                        <input
                          className="student-input-compact"
                          value={value}
                          placeholder={`Alumno ${index + 1}`}
                          onChange={(e) => handleStudentInputChange(index, e.target.value)}
                        />
                        {studentInputs.length > 1 && (
                          <button type="button" className="student-input-remove" onClick={() => handleRemoveStudentRow(index)}>
                            <X size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="students-add-actions">
                      <button type="button" className="students-add-more" onClick={handleAddStudentRow}>
                        <Plus size={14} /> Otro
                      </button>
                      <button type="button" className="students-import-link" onClick={handleImportClick}>
                        <Upload size={14} /> CSV
                      </button>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      accept=".csv,.txt"
                      onChange={handleImportFile}
                    />
                    <Button
                      className="w-full"
                      size="sm"
                      onClick={handleAddNewStudents}
                      disabled={studentsSaving || validNewNames.length === 0}
                    >
                      {studentsSaving ? <Spinner size={16} /> : `Añadir ${validNewNames.length || ''} alumnos`}
                    </Button>
                  </div>
                )}

                {addStudentsTab === 'existing' && (
                  <div className="students-add-existing-compact">
                    {availableStudents.length === 0 && !poolLoading ? (
                      <p className="settings-empty-text">No hay alumnos de otras clases disponibles.</p>
                    ) : (
                      <>
                        <Searchbar
                          value={addSearch}
                          onChange={setAddSearch}
                          placeholder="Buscar..."
                          className="settings-add-search"
                        />
                        {uniqueClassesForFilter.length > 0 && (
                          <Select
                            value={addClassFilter}
                            onValueChange={setAddClassFilter}
                          >
                            <SelectTrigger className="settings-add-class-filter">
                              <SelectValue placeholder="Todas las clases" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">Todas las clases</SelectItem>
                              {uniqueClassesForFilter.map((c) => (
                                <SelectItem key={c.class_id} value={c.class_id}>{c.class_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {poolLoading ? (
                          <div className="settings-add-loading"><Spinner /></div>
                        ) : (
                          <>
                            <div className="settings-add-select-all">
                              <Checkbox
                                checked={selectedStudentIds.size === filteredAvailableStudents.length && filteredAvailableStudents.length > 0
                                  ? true
                                  : selectedStudentIds.size > 0 && selectedStudentIds.size < filteredAvailableStudents.length
                                    ? 'indeterminate'
                                    : false
                                }
                                onCheckedChange={toggleAllAddStudents}
                              />
                              <span>Todos ({filteredAvailableStudents.length})</span>
                            </div>
                            <div className="students-existing-list">
                              {filteredAvailableStudents.map((st) => (
                                <div key={st.id} className="student-existing-row" onClick={() => toggleAddStudent(st.id)}>
                                  <Checkbox checked={selectedStudentIds.has(st.id)} />
                                  <div className="student-existing-info">
                                    <span>{st.name}</span>
                                    {st.classes.length > 0 && (
                                      <span className="student-existing-classes">{st.classes.map((c) => c.class_name).join(', ')}</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <Button
                              className="w-full"
                              size="sm"
                              onClick={handleAddExistingStudents}
                              disabled={studentsSaving || selectedStudentIds.size === 0}
                            >
                              {studentsSaving ? <Spinner size={16} /> : `Añadir ${selectedStudentIds.size} seleccionados`}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setRemoveStudentTarget({ id: s.id, name: s.name })}
                    >
                      <Trash2 size={16} />
                    </Button>
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
        <Button
          className="w-full"
          onClick={() => navigate('/tabs/classes')}
          disabled={calLoaded && !calComplete}
        >
          Guardar clase
        </Button>
        <Button
          className="w-full"
          variant="outline"
          onClick={handleStartDeleteClass}
        >
          <Trash2 size={16} className="mr-2 text-destructive" />
          <span className="text-destructive">Eliminar clase</span>
        </Button>
      </div>

      {/* Delete Class Modal */}
      <Modal
        open={showDeleteClassModal}
        onClose={handleCancelDeleteClass}
        title="Eliminar clase"
      >
        <p className="text-sm text-muted-foreground">
          ¿Seguro que quieres eliminar &ldquo;{classData?.name}&rdquo;?
        </p>

        {loadingDeletePreview ? (
          <div className="delete-preview-loading">
            <Spinner />
            <span>Calculando elementos...</span>
          </div>
        ) : deleteClassPreview && (
          <div className="delete-preview">
            <p className="delete-preview__warning">
              <AlertTriangle size={16} /> Se eliminarán permanentemente:
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
          <Button variant="outline" className="w-full" onClick={handleCancelDeleteClass}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleDeleteClassConfirm}
            disabled={loadingDeletePreview || deletingClass}
          >
            {deletingClass ? <Spinner size={16} /> : 'Eliminar permanentemente'}
          </Button>
        </div>
      </Modal>

      {/* Lecture Modal */}
      <Modal
        open={showLectureModal}
        onClose={() => setShowLectureModal(false)}
        title={editingLecture ? 'Editar asignatura' : 'Nueva asignatura'}
        sheetHeight="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Nombre de la asignatura</label>
            <Input
              value={lectureName}
              onChange={(e) => setLectureName(e.target.value)}
              placeholder="ej. Matemáticas"
            />
          </div>
          {classSubjectsList.length > 0 && !editingLecture && (
            <div className="subject-name-suggestions">
              <span className="subject-name-suggestions__label">Sugerencias:</span>
              <div className="subject-name-suggestions__list">
                {classSubjectsList
                  .filter(s => !lectureName || s.name.toLowerCase().includes(lectureName.toLowerCase()))
                  .filter((s, i, arr) => arr.findIndex(x => x.name.toLowerCase() === s.name.toLowerCase()) === i)
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
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Aula</label>
            <Input
              value={lectureAula}
              onChange={(e) => setLectureAula(e.target.value)}
              placeholder="ej. A51"
            />
          </div>
        </div>

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
            <Button variant="ghost" size="sm" onClick={addScheduleSlot}>
              <Plus size={16} className="mr-1" />
              Añadir
            </Button>
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
                      <Select
                        value={slot.day}
                        onValueChange={(v) => updateScheduleSlot(index, 'day', v)}
                      >
                        <SelectTrigger className="schedule-slot__day">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEK_DAYS.map(d => (
                            <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={slot.start_time}
                        onValueChange={(v) => updateScheduleSlot(index, 'start_time', v)}
                      >
                        <SelectTrigger className="schedule-slot__time">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="schedule-slot__separator">-</span>
                      <Select
                        value={slot.end_time}
                        onValueChange={(v) => updateScheduleSlot(index, 'end_time', v)}
                      >
                        <SelectTrigger className="schedule-slot__time">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_SLOTS.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeScheduleSlot(index)}
                      >
                        <Trash2 size={14} />
                      </Button>
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

        <Button
          className="w-full mt-4"
          onClick={handleSaveLecture}
          disabled={saving || !lectureName.trim() || hasConflicts}
        >
          {saving ? <Spinner size={16} /> : (editingLecture ? 'Guardar cambios' : 'Crear asignatura')}
        </Button>

        <p className="schedule-note">
          <small>El horario es opcional y se puede configurar más tarde</small>
        </p>
      </Modal>

      {/* Delete Lecture Alert */}
      <AlertConfirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        header="Eliminar asignatura"
        message={`¿Seguro que quieres eliminar "${deleteTarget?.name}"? Se eliminará la asignatura y su horario asociado.`}
        confirmText="Eliminar"
        onConfirm={handleDeleteLecture}
        variant="destructive"
      />

      {/* Remove Student from Class Alert */}
      <AlertConfirm
        open={!!removeStudentTarget}
        onClose={() => setRemoveStudentTarget(null)}
        header="Quitar de la clase"
        message={`¿Quitar a "${removeStudentTarget?.name}" de esta clase? El alumno seguirá existiendo en otras clases si está asignado.`}
        confirmText="Quitar"
        onConfirm={handleRemoveStudentFromClass}
        variant="destructive"
      />

      {/* Import CSV feedback */}
      <AlertConfirm
        open={!!importAlert}
        onClose={() => setImportAlert(null)}
        header={importAlert?.header || ''}
        message={importAlert?.message || ''}
        confirmText="OK"
        onConfirm={() => setImportAlert(null)}
      />
    </PageShell>
  );
};

export default ClassSettings;
