import { checkmarkCircle, closeCircle, alertCircle, helpCircle } from 'ionicons/icons';

export const questionStatusConfig = {
  correct: { icon: checkmarkCircle, color: 'success', label: 'Correcto', symbol: '✓' },
  partial: { icon: alertCircle, color: 'warning', label: 'Parcial', symbol: '~' },
  incorrect: { icon: closeCircle, color: 'danger', label: 'Incorrecto', symbol: '✗' },
  blank: { icon: helpCircle, color: 'medium', label: 'Sin respuesta', symbol: '—' },
} as const;

export const chartColors = {
  correct: 'var(--chart-correct, #10B981)',
  partial: 'var(--chart-partial, #F59E0B)',
  incorrect: 'var(--chart-incorrect, #EF4444)',
  blank: 'var(--chart-blank, #CBD5E1)',
} as const;

export type QuestionStatus = keyof typeof questionStatusConfig;
