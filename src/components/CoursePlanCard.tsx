import { IonIcon, IonSpinner, IonChip, IonLabel } from '@ionic/react';
import {
  calendarOutline, checkmarkCircleOutline, alertCircleOutline,
  timeOutline, sparkles, trashOutline,
} from 'ionicons/icons';
import type { CoursePlanListItem } from '../types';
import './CoursePlanCard.css';

interface Props {
  plan: CoursePlanListItem;
  subjectName?: string;
  className?: string;
  onClick?: () => void;
  onDelete?: () => void;
}

const statusConfig: Record<string, { icon: string; label: string; color: string }> = {
  pending: { icon: timeOutline, label: 'Pendiente', color: 'medium' },
  analyzing: { icon: sparkles, label: 'Analizando...', color: 'warning' },
  generating: { icon: sparkles, label: 'Generando...', color: 'warning' },
  completed: { icon: checkmarkCircleOutline, label: 'Completada', color: 'success' },
  failed: { icon: alertCircleOutline, label: 'Error', color: 'danger' },
};

const CoursePlanCard: React.FC<Props> = ({ plan, subjectName, className, onClick, onDelete }) => {
  const status = statusConfig[plan.status] || statusConfig.pending;
  const isProcessing = plan.status === 'analyzing' || plan.status === 'generating';

  return (
    <div className={`cplan-card ${className || ''}`} onClick={onClick} role="button" tabIndex={0}>
      <div className="cplan-card__header">
        <div className="cplan-card__title-row">
          <IonIcon icon={calendarOutline} className="cplan-card__icon" />
          <span className="cplan-card__title">
            {plan.title || (subjectName ? `Planificación ${subjectName}` : 'Planificación del curso')}
          </span>
        </div>
        <IonChip color={status.color} className="cplan-card__status">
          {isProcessing ? (
            <IonSpinner name="crescent" style={{ width: 14, height: 14 }} />
          ) : (
            <IonIcon icon={status.icon} />
          )}
          <IonLabel>{status.label}</IonLabel>
        </IonChip>
      </div>

      <div className="cplan-card__meta">
        {plan.totalSessions && (
          <span className="cplan-card__meta-item">
            <IonIcon icon={calendarOutline} />
            {plan.totalSessions} sesiones
          </span>
        )}
        <span className="cplan-card__meta-item">
          {plan.enfoque === 'teorico' ? '📖 Teórico' : '🔧 Práctico'}
        </span>
        {plan.topicsCreated && (
          <span className="cplan-card__meta-item cplan-card__meta-item--success">
            <IonIcon icon={checkmarkCircleOutline} />
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
          <IonIcon icon={trashOutline} />
        </button>
      )}
    </div>
  );
};

export default CoursePlanCard;
