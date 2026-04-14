import { CheckCircle, XCircle, AlertCircle, HelpCircle } from 'lucide-react';

export const questionStatusConfig = {
  correct: { icon: CheckCircle, color: 'success', label: 'Correcto', symbol: '✓' },
  partial: { icon: AlertCircle, color: 'warning', label: 'Parcial', symbol: '~' },
  incorrect: { icon: XCircle, color: 'danger', label: 'Incorrecto', symbol: '✗' },
  blank: { icon: HelpCircle, color: 'medium', label: 'Sin respuesta', symbol: '—' },
} as const;

export const chartColors = {
  correct: 'var(--chart-correct, #10B981)',
  partial: 'var(--chart-partial, #F59E0B)',
  incorrect: 'var(--chart-incorrect, #EF4444)',
  blank: 'var(--chart-blank, #CBD5E1)',
} as const;

export type QuestionStatus = keyof typeof questionStatusConfig;
