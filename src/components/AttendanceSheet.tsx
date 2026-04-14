import { useState, useEffect, useRef } from 'react';
import React from 'react';
import { CheckCircle, Clock, Paperclip, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import { useAttendanceStore } from '../store/attendanceStore';
import { useStudentsStore } from '../store/studentsStore';
import { hapticLight, hapticSuccess } from '../utils/haptics';
import { useIsDesktop } from '../hooks/useIsDesktop';
import './AttendanceSheet.css';

interface AttendanceSheetProps {
  isOpen: boolean;
  classId: string;
  date: string;
  eventId?: string;
  subjectId?: string;
  onDismiss: () => void;
}

type Status = 'present' | 'absent' | 'late' | 'justified';

const STATUS_CONFIG: Record<Status, { icon: React.FC<{ size?: number; className?: string }>; label: string; color: string }> = {
  present: { icon: CheckCircle, label: 'P', color: '#059669' },
  absent: { icon: XCircle, label: 'A', color: '#DC2626' },
  late: { icon: Clock, label: 'R', color: '#D97706' },
  justified: { icon: ShieldCheck, label: 'J', color: '#2563EB' },
};

const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  isOpen, classId, date, eventId, subjectId, onDismiss
}) => {
  const isDesktop = useIsDesktop();
  const students = useStudentsStore(s => s.students)
    .filter(s => s.classId === classId)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const fetchStudents = useStudentsStore(s => s.fetchStudents);
  const { records, fetchRecords, saveBulk, markTaken, uploadJustification } = useAttendanceStore();

  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [justificationFiles, setJustificationFiles] = useState<Record<string, File>>({});
  const [activeFileStudentId, setActiveFileStudentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && classId) {
      fetchStudents(classId);
      fetchRecords({ class_id: classId, date, subject_id: subjectId });
    }
  }, [isOpen, classId, date, subjectId]);

  // Initialize statuses from existing records or default to 'present'
  useEffect(() => {
    const initial: Record<string, Status> = {};
    students.forEach(s => {
      const existing = records.find(r => r.studentId === s.id && r.date === date);
      initial[s.id] = existing ? existing.status as Status : 'present';
    });
    setStatuses(initial);
    setSaved(false);
  }, [students.length, records.length, date]);

  const toggleStatus = (studentId: string) => {
    hapticLight();
    const current = statuses[studentId] || 'present';
    // Cycle: present → late → absent → present; justified is set automatically via attachment
    let next: Status;
    if (current === 'present') {
      next = 'late';
    } else if (current === 'late') {
      next = 'absent';
    } else {
      next = 'present';
      // If switching away from absent/justified, remove any attached file
      if (justificationFiles[studentId]) {
        setJustificationFiles(prev => {
          const updated = { ...prev };
          delete updated[studentId];
          return updated;
        });
      }
    }
    setStatuses(prev => ({ ...prev, [studentId]: next }));
    setSaved(false);
  };

  const setAllPresent = () => {
    const all: Record<string, Status> = {};
    students.forEach(s => { all[s.id] = 'present'; });
    setStatuses(all);
    setSaved(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeFileStudentId) {
      setJustificationFiles(prev => ({ ...prev, [activeFileStudentId]: file }));
      // Automatically change status to justified when a file is attached
      setStatuses(prev => ({ ...prev, [activeFileStudentId]: 'justified' }));
      setSaved(false);
    }
    setActiveFileStudentId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const recs = Object.entries(statuses).map(([student_id, status]) => ({
        student_id,
        status,
      }));
      await saveBulk(classId, date, recs, eventId, subjectId);
      markTaken(classId, date, subjectId, eventId);

      // Upload justification files for justified students
      if (Object.keys(justificationFiles).length > 0) {
        // Re-fetch records to get the IDs
        await fetchRecords({ class_id: classId, date, subject_id: subjectId });
        const freshRecords = useAttendanceStore.getState().records;
        for (const [studentId, file] of Object.entries(justificationFiles)) {
          const record = freshRecords.find(r => r.studentId === studentId && r.date === date);
          if (record) {
            try {
              await uploadJustification(record.id, file);
            } catch (err) {
              console.error('Failed to upload justification for', studentId, err);
            }
          }
        }
        setJustificationFiles({});
      }

      hapticSuccess();
      setSaved(true);
      setTimeout(() => onDismiss(), 800);
    } catch (err) {
      console.error('Failed to save attendance:', err);
    } finally {
      setSaving(false);
    }
  };

  const presentCount = Object.values(statuses).filter(s => s === 'present').length;
  const lateCount = Object.values(statuses).filter(s => s === 'late').length;
  const absentCount = Object.values(statuses).filter(s => s === 'absent').length;

  return (
    <Modal open={isOpen} onClose={onDismiss} sheetHeight="lg">
      <div className="att-sheet">
        <div className="att-sheet__header">
          <h2 className="att-sheet__title">Pasar lista</h2>
          <p className="att-sheet__date">{new Date(date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <div className="att-sheet__summary">
            <span className="att-sheet__count att-sheet__count--present">{presentCount} presentes</span>
            {lateCount > 0 && <span className="att-sheet__count att-sheet__count--late">{lateCount} retrasos</span>}
            <span className="att-sheet__count att-sheet__count--absent">{absentCount} ausentes</span>
          </div>
          <button className="att-sheet__all-present" onClick={setAllPresent}>
            Todos presentes
          </button>
        </div>

        <div className="att-sheet__list">
          {students.map((student, i) => {
            const status = statuses[student.id] || 'present';
            const config = STATUS_CONFIG[status];
            const hasFile = !!justificationFiles[student.id];
            return (
              <div
                key={student.id}
                className="att-student pressable"
                style={{ animationDelay: `${i * 25}ms` }}
              >
                <span className="att-student__name" onClick={() => toggleStatus(student.id)}>
                  {student.name}
                </span>
                <div className="att-student__actions">
                  {(status === 'absent' || status === 'justified') && (
                    <button
                      className={`att-student__attach ${hasFile || status === 'justified' ? 'att-student__attach--has-file' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveFileStudentId(student.id);
                        fileInputRef.current?.click();
                      }}
                      title={hasFile ? justificationFiles[student.id].name : 'Adjuntar justificante'}
                    >
                      <Paperclip size={18} />
                      {(hasFile || status === 'justified') && <span className="att-student__file-dot" />}
                    </button>
                  )}
                  <div
                    className="att-student__status"
                    style={{ background: config.color, color: '#fff' }}
                    onClick={() => toggleStatus(student.id)}
                  >
                    {/* icon: config.icon */}
                    <span>{config.label}</span>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="att-sheet__save">
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size={18} /> : saved ? '✓ Guardado' : 'Guardar asistencia'}
            </Button>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileSelect}
        />
      </div>
    </Modal>
  );
};

export default AttendanceSheet;
