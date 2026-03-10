import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonBadge, IonChip, IonLabel } from '@ionic/react';
import { ClassGroup } from '../types';
import './ClassCard.css';

interface Props {
  classGroup: ClassGroup;
  onClick: () => void;
}

const ClassCard: React.FC<Props> = ({ classGroup, onClick }) => (
  <IonCard className="class-card" button onClick={onClick}>
    <IonCardHeader>
      <div className="class-card-header">
        <IonCardTitle className="class-card-title">{classGroup.name}</IonCardTitle>
        <IonBadge color="primary">{classGroup.studentCount} alumnos</IonBadge>
      </div>
    </IonCardHeader>
    <IonCardContent>
      <IonChip outline className="class-card-chip">
        <IonLabel>{classGroup.subject}</IonLabel>
      </IonChip>
      <span className="class-card-meta">{classGroup.year}</span>
    </IonCardContent>
  </IonCard>
);

export default ClassCard;
