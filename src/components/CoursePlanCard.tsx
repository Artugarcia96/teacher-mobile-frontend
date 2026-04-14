import { Calendar, CheckCircle, AlertCircle, Clock, Sparkles, Trash2 } from 'lucide-react';
import Spinner from '@/components/shared/Spinner';
import { Badge } from '@/components/ui/badge';
import type { CoursePlanListItem } from '../types';
import './CoursePlanCard.css';

interface Props {
  plan: CoursePlanListItem;
  subjectName?: string;
  className?: string;
  onClick?: () => void;
  onDelete?: () => void;
}

const statusConfig: Record<string, { icon: React.FC<{ size?: number }>; label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; colorClass: string }> = {
  pending: { icon: Clock, label: 'Pendiente', variant: 'secondary', colorClass: 'text-muted-foreground' },
  analyzing: { icon: Sparkles, label: 'Analizando...', variant: 'outline', colorClass: 'text-yellow-600' },
  generating: { icon: Sparkles, label: 'Generando...', variant: 'outline', colorClass: 'text-yellow-600' },
  completed: { icon: CheckCircle, label: 'Completada', variant: 'default', colorClass: 'text-emerald-600' },
  failed: { icon: AlertCircle, label: 'Error', variant: 'destructive', colorClass: 'text-red-600' },
};

const CoursePlanCard: React.FC<Props> = ({ plan, subjectName, className, onClick, onDelete }) => {
  const status = statusConfig[plan.status] || statusConfig.pending;
  const isProcessing = plan.status === 'analyzing' || plan.status === 'generating';
  const StatusIcon = status.icon;

  return (
    <div className={`cplan-card ${className || ''}`} onClick={onClick} role="button" tabIndex={0}>
      <div className="cplan-card__header">
        <div className="cplan-card__title-row">
          <Calendar size={20} className="cplan-card__icon" />
          <span className="cplan-card__title">
            {plan.title || (subjectName ? `Planificación ${subjectName}` : 'Planificación del curso')}
          </span>
        </div>
        <Badge variant={status.variant} className="cplan-card__status">
          {isProcessing ? (
            <Spinner size={14} />
          ) : (
            <StatusIcon size={12} />
          )}
          <span className="ml-1">{status.label}</span>
        </Badge>
      </div>

      <div className="cplan-card__meta">
        {plan.totalSessions && (
          <span className="cplan-card__meta-item">
            <Calendar size={12} />
            {plan.totalSessions} sesiones
          </span>
        )}
        <span className="cplan-card__meta-item">
          {plan.enfoque === 'teorico' ? '📖 Teórico' : '🔧 Práctico'}
        </span>
        {plan.topicsCreated && (
          <span className="cplan-card__meta-item cplan-card__meta-item--success">
            <CheckCircle size={12} />
            Temas creados
          </span>
        )}
      </div>

      {plan.isActive && (
        <div className="cplan-card__active-badge">Activa</div>
      )}
      {onDelete && (
        <button className="cplan-card__delete" onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Eliminar planificación">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
};

export default CoursePlanCard;
