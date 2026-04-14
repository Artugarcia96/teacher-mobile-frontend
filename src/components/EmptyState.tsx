import { Button } from '@/components/ui/button';
import './EmptyState.css';

interface Props {
  icon?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<Props> = ({ icon, title, subtitle, actionLabel, onAction }) => (
  <div className="empty-state">
    {icon && <span className="empty-state-icon" aria-hidden>{icon}</span>}
    <h3 className="empty-state-title">{title}</h3>
    {subtitle && <p className="empty-state-subtitle">{subtitle}</p>}
    {actionLabel && onAction && (
      <Button onClick={onAction} className="empty-state-action">
        {actionLabel}
      </Button>
    )}
  </div>
);

export default EmptyState;
