import { useEffect, useRef } from 'react';
import { IonIcon } from '@ionic/react';
import { checkmarkCircleOutline } from 'ionicons/icons';
import { hapticSuccess } from '../utils/haptics';
import './CelebrationOverlay.css';

interface Props {
  show: boolean;
  onDismiss: () => void;
  message?: string;
}

const CelebrationOverlay: React.FC<Props> = ({
  show,
  onDismiss,
  message,
}) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!show) return;

    hapticSuccess();

    timerRef.current = setTimeout(() => {
      onDismiss();
    }, 2500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, onDismiss]);

  if (!show) return null;

  return (
    <div className="celebration-overlay" onClick={onDismiss}>
      <div className="celebration-overlay__content">
        <IonIcon
          icon={checkmarkCircleOutline}
          className="celebration-overlay__icon"
        />
        <h2 className="celebration-overlay__message">
          {message || '¡Corrección completada!'}
        </h2>
        <p className="celebration-overlay__subtitle">
          Todas las correcciones han sido guardadas
        </p>
      </div>
    </div>
  );
};

export default CelebrationOverlay;
