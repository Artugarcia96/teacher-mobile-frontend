/** Bandeja "Evaluar". Backend: GET /api/inbox. */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { ActivityCount, ActivityRef } from './evaluation';
import type { CourseRef } from './types';

export interface InboxEvaluation {
  course: CourseRef; term: number; total_students: number;
  /** AI drafts waiting in the term's activities. */
  to_review: ActivityCount[];
  /** Past activities with students without a grade (those who missed an exam are in pending_absent). */
  to_grade: ActivityCount[];
  pending_absent: number;
  /** Without any comment. */
  comments_missing: number;
  /** Written but not final (a comment is done only when final). */
  comments_draft: number;
}
export interface Inbox {
  to_review: { activity: ActivityRef; course: CourseRef; suggested: number; unmatched: number; remaining: number }[];
  to_grade: { activity: ActivityRef; course: CourseRef; missing: number; pending_absent: number }[];
  /** Same order as the class list. */
  evaluations: InboxEvaluation[];
  next_evaluation_event: { date: string; title: string } | null;
  /** Evaluar badge: activities with AI drafts to review. */
  count: number;
}

export const inboxKeys = { all: ['inbox'] as const };

export function useInbox(enabled = true) {
  return useQuery({ queryKey: inboxKeys.all, queryFn: () => api.get<Inbox>('/inbox'), enabled, staleTime: 30_000 });
}

/** Evaluar badge: number of exams (activities) with AI grade drafts to review — the "Por revisar" rows with drafts. */
export function useInboxCount(): number {
  const { loggedIn } = useAuth();
  return useInbox(loggedIn).data?.count ?? 0;
}
