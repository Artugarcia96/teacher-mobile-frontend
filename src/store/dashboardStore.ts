import { create } from 'zustand';
import { dashboard as dashboardApi } from '../services/api';
import { DashboardData } from '../types';

interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  fetchDashboard: async () => {
    if (!get().data) set({ loading: true, error: null });
    try {
      const res = await dashboardApi.get();
      const d = res.data;
      set({
        data: {
          pendingCorrections: (d.pending_corrections || []).map((c: any) => ({
            examId: c.exam_id,
            examName: c.exam_name,
            classId: c.class_id,
            className: c.class_name,
            subjectName: c.subject_name,
            pendingCount: c.pending_count,
            totalCount: c.total_count,
            deadline: c.deadline,
            deadlineStatus: c.deadline_status,
          })),
          pendingExerciseCorrections: (d.pending_exercise_corrections || []).map((c: any) => ({
            exerciseId: c.exercise_id,
            exerciseName: c.exercise_name,
            studentName: c.student_name,
            className: c.class_name,
          })),
          upcomingExams: (d.upcoming_exams || []).map((e: any) => ({
            examId: e.exam_id,
            examName: e.exam_name,
            classId: e.class_id,
            className: e.class_name,
            date: e.date,
            daysUntil: e.days_until,
          })),
          studentsAtRisk: (d.students_at_risk || []).map((s: any) => ({
            studentId: s.student_id,
            studentName: s.student_name,
            classId: s.class_id,
            className: s.class_name,
            avgGrade: s.avg_grade,
            riskLevel: s.risk_level,
            factors: s.factors || [],
          })),
          recentActivity: (d.recent_activity || []).map((a: any) => ({
            type: a.type,
            description: a.description,
            timestamp: a.timestamp,
            link: a.link,
          })),
          todayBriefingSummary: d.today_briefing_summary,
          stats: {
            totalClasses: d.stats?.total_classes || 0,
            totalStudents: d.stats?.total_students || 0,
            examsThisTrimester: d.stats?.exams_this_trimester || 0,
            pendingCorrectionsCount: d.stats?.pending_corrections_count || 0,
          },
        },
        loading: false,
      });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },
}));
