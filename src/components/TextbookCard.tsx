import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonIcon } from '@ionic/react';
import { documentTextOutline, timeOutline } from 'ionicons/icons';
import { Textbook } from '../types';

interface TextbookCardProps {
  textbook: Textbook;
  onClick: () => void;
}

const enfoqueConfig: Record<string, { label: string; color: string }> = {
  teorico: { label: 'Teorico', color: '#15665E' },
  practico: { label: 'Practico', color: '#E87A1C' },
  examen: { label: 'Examen', color: '#d33939' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'medium' },
  processing: { label: 'Generando', color: 'warning' },
  completed: { label: 'Completado', color: 'success' },
  completed_no_pdf: { label: 'Sin PDF', color: 'warning' },
  failed: { label: 'Error', color: 'danger' },
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
    <IonCard
      onClick={onClick}
      button
      style={{
        borderRadius: 12,
        margin: '0 0 12px 0',
        cursor: 'pointer',
        '--background': 'var(--ion-card-background, var(--ion-item-background, var(--ion-background-color, #fff)))',
      }}
    >
      <IonCardHeader style={{ paddingBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <IonCardTitle style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>
            {title}
          </IonCardTitle>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: 11,
              fontWeight: 600,
              color: '#fff',
              background: enfoque.color,
              whiteSpace: 'nowrap',
            }}>
              {enfoque.label}
            </span>
            <IonBadge color={status.color} style={{ fontSize: 11 }}>
              {status.label}
            </IonBadge>
          </div>
        </div>
      </IonCardHeader>

      <IonCardContent style={{ paddingTop: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
          color: 'var(--ion-color-medium)',
        }}>
          {(textbook.status === 'completed' || textbook.status === 'completed_no_pdf') && pages != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <IonIcon icon={documentTextOutline} style={{ fontSize: 14 }} />
              ~{pages} paginas
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <IonIcon icon={timeOutline} style={{ fontSize: 14 }} />
            {formatDate(textbook.createdAt)}
          </span>
        </div>
      </IonCardContent>
    </IonCard>
  );
};

export default TextbookCard;
