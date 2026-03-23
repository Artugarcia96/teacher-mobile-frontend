import { create } from 'zustand';
import { attendance as attendanceApi } from '../services/api';
import { AttendanceRecord, AttendanceSummary, AttendanceTaken } from '../types';

interface AttendanceState {
  records: AttendanceRecord[];
  summaries: AttendanceSummary[];
  takenList: AttendanceTaken[];
  loading: boolean;
  fetchRecords: (params?: { class_id?: string; date?: string; event_id?: string; subject_id?: string }) => Promise<void>;
  fetchSummary: (classId: string, subjectId?: string, startDate?: string, endDate?: string) => Promise<void>;
  saveBulk: (classId: string, date: string, records: Array<{ student_id: string; status: string }>, eventId?: string, subjectId?: string) => Promise<void>;
  fetchStudentHistory: (studentId: string, classId?: string, subjectId?: string) => Promise<AttendanceRecord[]>;
  fetchTaken: (startDate: string, endDate: string) => Promise<void>;
  isAttendanceTaken: (classId: string, date: string, subjectId?: string) => boolean;
  markTaken: (classId: string, date: string, subjectId?: string, eventId?: string) => void;
  uploadJustification: (attendanceId: string, file: File) => Promise<AttendanceRecord>;
  deleteJustification: (attendanceId: string) => Promise<AttendanceRecord>;
}

const mapRecord = (r: any): AttendanceRecord => ({
  id: r.id,
  studentId: r.student_id,
  classId: r.class_id,
  subjectId: r.subject_id,
  eventId: r.event_id,
  date: r.date,
  status: r.status,
  note: r.note,
  justificationUrl: r.justification_url,
  studentName: r.student_name,
  subjectName: r.subject_name,
});

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  records: [],
  summaries: [],
  takenList: [],
  loading: false,
  fetchRecords: async (params) => {
    set({ loading: true });
    try {
      const res = await attendanceApi.list(params);
      set({
        records: (res.data || []).map(mapRecord),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
  fetchSummary: async (classId, subjectId, startDate, endDate) => {
    set({ loading: true });
    try {
      const res = await attendanceApi.getSummary(classId, subjectId, startDate, endDate);
      set({
        summaries: (res.data || []).map((s: any) => ({
          studentId: s.student_id,
          studentName: s.student_name,
          totalSessions: s.total_sessions,
          present: s.present,
          absent: s.absent,
          late: s.late,
          justified: s.justified,
          attendanceRate: s.attendance_rate,
        })),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
  saveBulk: async (classId, date, records, eventId, subjectId) => {
    await attendanceApi.bulkCreate({
      class_id: classId,
      date,
      event_id: eventId,
      subject_id: subjectId,
      records,
    });
  },
  fetchStudentHistory: async (studentId, classId?, subjectId?) => {
    const res = await attendanceApi.getStudentHistory(studentId, classId, subjectId);
    return (res.data || []).map(mapRecord);
  },
  fetchTaken: async (startDate, endDate) => {
    try {
      const res = await attendanceApi.getTaken(startDate, endDate);
      set({
        takenList: (res.data || []).map((t: any) => ({
          classId: t.class_id,
          subjectId: t.subject_id,
          date: t.date,
          eventId: t.event_id,
        })),
      });
    } catch {
      // silently fail
    }
  },
  isAttendanceTaken: (classId, date, subjectId?) => {
    const { takenList } = get();
    return takenList.some(t =>
      t.classId === classId &&
      t.date === date &&
      (subjectId ? t.subjectId === subjectId : true)
    );
  },
  markTaken: (classId, date, subjectId?, eventId?) => {
    set(state => ({
      takenList: [
        ...state.takenList,
        { classId, date, subjectId, eventId },
      ],
    }));
  },
  uploadJustification: async (attendanceId, file) => {
    const res = await attendanceApi.uploadJustification(attendanceId, file);
    return mapRecord(res.data);
  },
  deleteJustification: async (attendanceId) => {
    const res = await attendanceApi.deleteJustification(attendanceId);
    return mapRecord(res.data);
  },
}));
