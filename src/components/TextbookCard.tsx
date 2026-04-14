import { FileText, Clock, Sparkles } from 'lucide-react';
import Spinner from '@/components/shared/Spinner';
import { Badge } from '@/components/ui/badge';
import { Textbook } from '../types';
import './CoursePlanCard.css';

interface TextbookCardProps {
  textbook: Textbook;
  onClick: () => void;
}

const enfoqueConfig: Record<string, { label: string; emoji: string }> = {
  teorico: { label: 'Teórico', emoji: '📖' },
  practico: { label: 'Práctico', emoji: '🔧' },
  examen: { label: 'Examen', emoji: '📝' },
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; isProcessing?: boolean }> = {
  pending: { label: 'Pendiente', variant: 'secondary' },
  processing: { label: 'Generando...', variant: 'outline', isProcessing: true },
  completed: { label: 'Completado', variant: 'default' },
  completed_no_pdf: { label: 'Sin PDF', variant: 'outline' },
  failed: { label: 'Error', variant: 'destructive' },
};

const TextbookCard: React.FC<TextbookCardProps> = ({ textbook, onClick }) => {
  const enfoque = enfoqueConfig[textbook.enfoque] || enfoqueConfig.practico;
  const status = statusConfig[textbook.status] || statusConfig.pending;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const title = textbook.title || textbook.bookPlan?.title || 'Contenido sin titulo';
  const pages = textbook.stats?.estimated_pages;

  return (
    <div className="cplan-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="cplan-card__header">
        <div className="cplan-card__title-row">
          <Sparkles size={20} className="cplan-card__icon" />
          <span className="cplan-card__title">{title}</span>
        </div>
        <Badge variant={status.variant} className="cplan-card__status">
          {status.isProcessing && <Spinner size={14} />}
          <span className={status.isProcessing ? 'ml-1' : ''}>{status.label}</span>
        </Badge>
      </div>

      <div className="cplan-card__meta">
        <span className="cplan-card__meta-item">
          {enfoque.emoji} {enfoque.label}
        </span>
        {(textbook.status === 'completed' || textbook.status === 'completed_no_pdf') && pages != null && (
          <span className="cplan-card__meta-item">
            <FileText size={12} />
            ~{pages} páginas
          </span>
        )}
        <span className="cplan-card__meta-item">
          <Clock size={12} />
          {formatDate(textbook.createdAt)}
        </span>
      </div>
    </div>
  );
};

export default TextbookCard;
