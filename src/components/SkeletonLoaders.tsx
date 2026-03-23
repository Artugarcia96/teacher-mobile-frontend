import { IonSkeletonText } from '@ionic/react';
import './SkeletonLoaders.css';

export const SkeletonClassCard: React.FC = () => (
  <div className="skel-class-card">
    <div className="skel-avatar"><IonSkeletonText animated /></div>
    <div className="skel-class-info">
      <IonSkeletonText animated style={{ width: '60%', height: '16px' }} />
      <IonSkeletonText animated style={{ width: '40%', height: '12px', marginTop: '6px' }} />
    </div>
  </div>
);

export const SkeletonExamCard: React.FC = () => (
  <div className="skel-exam-card">
    <IonSkeletonText animated style={{ width: '70%', height: '16px' }} />
    <IonSkeletonText animated style={{ width: '50%', height: '12px', marginTop: '8px' }} />
    <IonSkeletonText animated style={{ width: '30%', height: '12px', marginTop: '4px' }} />
  </div>
);

export const SkeletonStudentRow: React.FC = () => (
  <div className="skel-student-row">
    <div className="skel-avatar skel-avatar--sm"><IonSkeletonText animated /></div>
    <div className="skel-student-info">
      <IonSkeletonText animated style={{ width: '55%', height: '14px' }} />
      <IonSkeletonText animated style={{ width: '35%', height: '11px', marginTop: '4px' }} />
    </div>
  </div>
);

export const SkeletonGradeTable: React.FC = () => (
  <div className="skel-grade-table">
    <div className="skel-grade-header">
      <IonSkeletonText animated style={{ width: '100%', height: '36px' }} />
    </div>
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="skel-grade-row">
        <IonSkeletonText animated style={{ width: '30%', height: '14px' }} />
        <IonSkeletonText animated style={{ width: '12%', height: '14px' }} />
        <IonSkeletonText animated style={{ width: '12%', height: '14px' }} />
        <IonSkeletonText animated style={{ width: '12%', height: '14px' }} />
      </div>
    ))}
  </div>
);

export const SkeletonDashboard: React.FC = () => (
  <div className="skel-dashboard">
    <div className="skel-dash-hero">
      <IonSkeletonText animated style={{ width: '50%', height: '24px' }} />
      <IonSkeletonText animated style={{ width: '70%', height: '14px', marginTop: '8px' }} />
    </div>
    <div className="skel-dash-section">
      <IonSkeletonText animated style={{ width: '40%', height: '16px' }} />
      <div className="skel-dash-cards">
        {[1, 2, 3].map(i => (
          <div key={i} className="skel-dash-card">
            <IonSkeletonText animated style={{ width: '80%', height: '14px' }} />
            <IonSkeletonText animated style={{ width: '60%', height: '12px', marginTop: '6px' }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const SkeletonSubjectCard: React.FC = () => (
  <div className="skel-subject-card">
    <div className="skel-subject-avg"><IonSkeletonText animated /></div>
    <div className="skel-subject-info">
      <IonSkeletonText animated style={{ width: '55%', height: '15px' }} />
      <IonSkeletonText animated style={{ width: '40%', height: '12px', marginTop: '6px' }} />
    </div>
  </div>
);
