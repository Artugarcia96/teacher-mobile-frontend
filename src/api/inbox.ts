/** Bandeja "Evaluar". Backend: GET /api/inbox (slice C). */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { CourseRef } from './types';

export interface InboxActivity { id: string; title: string; date: string; term: number }
export interface Inbox {
  to_review: { activity: InboxActivity; course: CourseRef; suggested: number; unmatched: number; remaining: number }[];
  to_grade: { activity: InboxActivity; course: CourseRef; missing: number }[];
  evaluations: { course: CourseRef; term: number; graded_students: number; total_students: number; comments_missing: number; final_set: number }[];
  next_evaluation_event: { date: string; title: string } | null;
  count: number;
}

export const inboxKeys = { all: ['inbox'] as const };

export function useInbox(enabled = true) {
  return useQuery({ queryKey: inboxKeys.all, queryFn: () => api.get<Inbox>('/inbox'), enabled, staleTime: 30_000 });
}

/** Pending items for the "Evaluar" badge (exams to review + activities to grade). */
export function useInboxCount(): number {
  const { loggedIn } = useAuth();
  return useInbox(loggedIn).data?.count ?? 0;
}
