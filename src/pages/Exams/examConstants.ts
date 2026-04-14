import { Sparkles, ScanLine } from 'lucide-react';
import { createElement } from 'react';
import { EDUCATION_LEVELS_SELECT } from '../../utils/educationLevels';

/**
 * Single source of truth for exam-related display config.
 * Used by ExamsList, ExamsGlobal, ExamDetail, and ExamEditor.
 */

export const EXAM_STATUS_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  pending_validation:  { color: '#8B5CF6', label: 'Pendiente',      bg: 'rgba(139,92,246,0.1)' },
  pending_schedule:    { color: '#2563EB', label: 'Validado',       bg: 'rgba(37,99,235,0.1)'  },
  scheduled:           { color: '#D97706', label: 'Programado',     bg: 'rgba(217,119,6,0.1)'  },
  pending_correction:  { color: '#EA580C', label: 'Sin corregir',   bg: 'rgba(234,88,12,0.1)'  },
  corrected:           { color: '#059669', label: 'Corregido',      bg: 'rgba(5,150,105,0.1)'  },
};

export const EXAM_STATUS_VERBOSE: Record<string, string> = {
  pending_validation:  'Pendiente de validar',
  pending_schedule:    'Validado — pendiente de programar',
  scheduled:           'Programado',
  pending_correction:  'Pendiente de corregir',
  corrected:           'Corregido',
};

export const EXAM_DEADLINE_CONFIG: Record<string, { color: string; label: string }> = {
  ok:        { color: '#059669', label: 'En plazo' },
  soon:      { color: '#D97706', label: 'Próximo' },
  urgent:    { color: '#DC2626', label: 'Urgente' },
  overdue:   { color: '#DC2626', label: 'Vencido' },
  completed: { color: '#059669', label: 'Completado' },
};

export const EXAM_ORIGIN_CONFIG: Record<string, { label: string; color: string; bg: string; icon: 'sparkles' | 'scan' }> = {
  ai_generated: { label: 'Generado IA',  color: '#7C3AED', bg: 'rgba(124,58,237,0.1)', icon: 'sparkles' },
  digitalized:  { label: 'Digitalizado', color: '#2563EB', bg: 'rgba(37,99,235,0.1)',  icon: 'scan' },
};

export type ExamFormat = 'boxes' | 'compact' | 'test';

export const EXAM_FORMAT_OPTIONS: { value: ExamFormat; label: string; desc: string }[] = [
  { value: 'boxes',   label: 'Con cajas',       desc: 'Espacio para escribir' },
  { value: 'compact', label: 'Solo preguntas',  desc: 'Sin espacio de respuesta' },
  { value: 'test',    label: 'Tipo test',       desc: 'Opciones A, B, C, D' },
];

export const EDUCATION_LEVELS = EDUCATION_LEVELS_SELECT;

export const DIFFICULTY_OPTIONS = [
  { value: 'easy',   label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard',   label: 'Difícil' },
] as const;

export const STATUS_FILTER_OPTIONS = [
  { value: 'all' as const,                 label: 'Todos' },
  { value: 'pending_validation' as const,  label: 'Pendientes' },
  { value: 'pending_schedule' as const,    label: 'Validados' },
  { value: 'scheduled' as const,           label: 'Programados' },
  { value: 'pending_correction' as const,  label: 'Sin corregir' },
  { value: 'corrected' as const,           label: 'Corregidos' },
];
