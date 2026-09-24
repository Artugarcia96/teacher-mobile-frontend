/** Programación (units) & materials. Backend: app/api/units.py (slice E). Slice E extends this file;
 * keep `Unit`, `unitKeys` and `useUnits` stable — other areas import them. */
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export type UnitStatus = 'pending' | 'current' | 'done';
export interface Unit { id: string; course_id: string; title: string; term: number | null; position: number; status: UnitStatus; summary?: string | null; material_count: number }

export const unitKeys = {
  list: (courseId: string) => ['course', courseId, 'units'] as const,
  one: (unitId: string) => ['unit', unitId] as const,
};

export function useUnits(courseId: string | undefined) {
  return useQuery({ queryKey: unitKeys.list(courseId!), queryFn: () => api.get<Unit[]>(`/courses/${courseId}/units`), enabled: !!courseId });
}
