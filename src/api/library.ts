/** Biblioteca: every material of the teacher across classes. Backend: app/api/library.py. */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CourseRef } from './types';
import type { Audience, Material, MaterialKind } from './units';

export interface LibraryItem extends Material {
  course: CourseRef;
  unit: { id: string; title: string } | null;
  /** Where the search matched the material's text (extracted or read by the AI). */
  snippet?: string | null;
}

export interface LibraryFilters { q?: string; courseId?: string; kinds?: MaterialKind[]; audience?: Audience }

export const libraryKeys = { list: (f: LibraryFilters) => ['library', f] as const };

export function useLibrary(filters: LibraryFilters) {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.courseId) params.set('course_id', filters.courseId);
  if (filters.kinds?.length) params.set('kind', filters.kinds.join(','));
  if (filters.audience) params.set('audience', filters.audience);
  return useQuery({
    queryKey: libraryKeys.list(filters),
    queryFn: () => api.get<LibraryItem[]>(`/library?${params}`),
    placeholderData: (prev) => prev,
  });
}
