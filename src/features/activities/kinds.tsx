import { ClipboardText, DotsThreeCircle, Exam, FileText, Microphone, Notebook, UserFocus, type IconProps } from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import type { ActivityKind } from '../../api/activities';
import type { SchoolYear } from '../../api/types';

export const KINDS: { value: ActivityKind; label: string }[] = [
  { value: 'exam', label: 'Examen' },
  { value: 'worksheet', label: 'Ficha' },
  { value: 'task', label: 'Trabajo' },
  { value: 'oral', label: 'Oral' },
  { value: 'notebook', label: 'Cuaderno' },
  { value: 'attitude', label: 'Actitud' },
  { value: 'other', label: 'Otra' },
];

const ICONS: Record<ActivityKind, ComponentType<IconProps>> = {
  exam: Exam, worksheet: FileText, task: ClipboardText, oral: Microphone, notebook: Notebook, attitude: UserFocus, other: DotsThreeCircle,
};

export function KindIcon({ kind, size = 14 }: { kind: ActivityKind; size?: number }) {
  const Icon = ICONS[kind] ?? DotsThreeCircle;
  return <Icon size={size} aria-hidden />;
}

/** Term a date belongs to, as the server derives it (dates in gaps go to the next term). Only used for hints. */
export function termForDate(year: SchoolYear | undefined, iso: string): number | null {
  if (!year?.terms?.length || !iso) return null;
  const terms = [...year.terms].sort((a, b) => a.n - b.n);
  for (const t of terms) if (iso <= t.end) return t.n;
  return terms[terms.length - 1].n;
}
