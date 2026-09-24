/** Hooks for account, classes, groups and students. Pattern for every area:
 *  - one `keys` object per area
 *  - `useX` = useQuery, `useXMutation` = useMutation that invalidates the right keys. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import type {
  CourseDetail, CourseSummary, GroupOut, Job, Me, SchoolYear, StudentFile, StudentRef, StudentRow, Teacher,
} from './types';

export const keys = {
  me: ['me'] as const,
  courses: ['courses'] as const,
  course: (id: string) => ['course', id] as const,
  groups: ['groups'] as const,
  students: (courseId: string) => ['course', courseId, 'students'] as const,
  student: (id: string) => ['student', id] as const,
  job: (id: string) => ['job', id] as const,
  archivedCourses: ['courses', 'archived'] as const,
  groupStudents: (groupId: string) => ['groups', groupId, 'students'] as const,
  aiUsage: ['me', 'ai-usage'] as const,
};

export interface ParsedStudents { students: { first_name: string; last_name: string }[]; warnings: string[] }
export interface AIUsage { month: string; calls: number; cost_usd: number; by_feature: { feature: string; calls: number; cost_usd: number }[] }

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<Me>('/me'), enabled, staleTime: 60_000 });
}

export function usePatchMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<Teacher, 'name' | 'school' | 'region'>>) => api.patch<Teacher>('/me', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useSaveSchoolYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<SchoolYear, 'id' | 'current_term'>) => api.put<SchoolYear>('/school-year', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useCourses() {
  return useQuery({ queryKey: keys.courses, queryFn: () => api.get<CourseSummary[]>('/courses') });
}

export function useCourse(id: string | undefined) {
  return useQuery({ queryKey: keys.course(id!), queryFn: () => api.get<CourseDetail>(`/courses/${id}`), enabled: !!id });
}

export interface CourseInput {
  subject: string; short?: string | null; color: string; room?: string | null;
  schedule: { weekday: number; start: string; end: string; room?: string | null }[];
  group_id?: string; new_group?: { name: string; stage: string; level?: number | null };
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CourseInput) => api.post<CourseDetail>('/courses', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.courses }); qc.invalidateQueries({ queryKey: keys.groups }); },
  });
}

export function usePatchCourse(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CourseInput> & { categories?: CourseDetail['categories']; archived?: boolean }) =>
      api.patch<CourseDetail>(`/courses/${id}`, body),
    onSuccess: (data) => {
      qc.setQueryData(keys.course(id), data);
      qc.invalidateQueries({ queryKey: keys.courses });
      qc.invalidateQueries({ queryKey: ['course', id] });
    },
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permanent }: { id: string; permanent?: boolean }) => api.delete(`/courses/${id}${permanent ? '?permanent=true' : ''}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.courses }); qc.invalidateQueries({ queryKey: keys.groups }); },
  });
}

export function useGroups() {
  return useQuery({ queryKey: keys.groups, queryFn: () => api.get<GroupOut[]>('/groups') });
}

export function useCourseStudents(courseId: string | undefined) {
  return useQuery({ queryKey: keys.students(courseId!), queryFn: () => api.get<StudentRow[]>(`/courses/${courseId}/students`), enabled: !!courseId });
}

export function useStudentFile(id: string | undefined) {
  return useQuery({ queryKey: keys.student(id!), queryFn: () => api.get<StudentFile>(`/students/${id}`), enabled: !!id });
}

export function useParseStudents() {
  return useMutation({ mutationFn: (text: string) => api.post<ParsedStudents>('/students/parse', { text }) });
}

/** CSV preview (nothing is saved until useAddStudents). */
export function useImportStudentsFile(groupId: string) {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<ParsedStudents>(`/groups/${groupId}/students/import`, form);
    },
  });
}

export function useGroupStudents(groupId: string | undefined) {
  return useQuery({ queryKey: keys.groupStudents(groupId!), queryFn: () => api.get<StudentRef[]>(`/groups/${groupId}/students`), enabled: !!groupId });
}

export function useArchivedCourses(enabled = true) {
  return useQuery({ queryKey: keys.archivedCourses, queryFn: () => api.get<CourseSummary[]>('/courses?archived=true'), enabled });
}

/** Unenroll from any group (the student and their grades are kept). */
export function useUnenroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, studentId }: { groupId: string; studentId: string }) => api.delete(`/groups/${groupId}/students/${studentId}`),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['course'] });
      qc.invalidateQueries({ queryKey: keys.courses });
      qc.invalidateQueries({ queryKey: keys.groups });
      qc.invalidateQueries({ queryKey: keys.student(v.studentId) });
    },
  });
}

/** IA: guion para una tutoría con la familia. */
export function useStudentBrief(id: string) {
  return useMutation({ mutationFn: () => api.post<{ bullets: string[] }>(`/students/${id}/brief`) });
}

export function useAiUsage() {
  return useQuery({ queryKey: keys.aiUsage, queryFn: () => api.get<AIUsage>('/me/ai-usage'), staleTime: 60_000 });
}

export function useSendFeedback() {
  return useMutation({ mutationFn: (text: string) => api.post('/feedback', { text }) });
}

export function useAddStudents(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { students?: { first_name: string; last_name: string }[]; student_ids?: string[] }) =>
      api.post<StudentRef[]>(`/groups/${groupId}/students`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course'] }); qc.invalidateQueries({ queryKey: keys.courses });
      qc.invalidateQueries({ queryKey: keys.groups }); qc.invalidateQueries({ queryKey: ['student'] });
    },
  });
}

export function useRemoveStudent(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => api.delete(`/groups/${groupId}/students/${studentId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course'] }); qc.invalidateQueries({ queryKey: keys.courses }); },
  });
}

export function usePatchStudent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<StudentRef, 'first_name' | 'last_name' | 'support'>> & { notes?: string | null }) => api.patch<StudentRef>(`/students/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: keys.student(id) }); qc.invalidateQueries({ queryKey: ['course'] }); },
  });
}

/** Poll a background job until it finishes. Calls onDone/onFail once. */
export function useJob(jobId: string | null | undefined, opts?: { onDone?: (job: Job) => void; onFail?: (job: Job) => void }) {
  const q = useQuery({
    queryKey: keys.job(jobId!),
    queryFn: () => api.get<Job>(`/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === 'done' || s === 'failed' ? false : 700;
    },
  });
  const status = q.data?.status;
  useEffect(() => {
    if (!q.data) return;
    if (status === 'done') opts?.onDone?.(q.data);
    if (status === 'failed') opts?.onFail?.(q.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  return q.data;
}
