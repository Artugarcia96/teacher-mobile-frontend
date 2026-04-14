import { Skeleton } from '@/components/ui/skeleton';
import './SkeletonLoaders.css';

export const SkeletonClassCard: React.FC = () => (
  <div className="skel-class-card">
    <div className="skel-avatar"><Skeleton className="w-full h-full rounded-full" /></div>
    <div className="skel-class-info">
      <Skeleton className="w-[60%] h-4" />
      <Skeleton className="w-[40%] h-3 mt-1.5" />
    </div>
  </div>
);

export const SkeletonExamCard: React.FC = () => (
  <div className="skel-exam-card">
    <Skeleton className="w-[70%] h-4" />
    <Skeleton className="w-[50%] h-3 mt-2" />
    <Skeleton className="w-[30%] h-3 mt-1" />
  </div>
);

export const SkeletonStudentRow: React.FC = () => (
  <div className="skel-student-row">
    <div className="skel-avatar skel-avatar--sm"><Skeleton className="w-full h-full rounded-full" /></div>
    <div className="skel-student-info">
      <Skeleton className="w-[55%] h-3.5" />
      <Skeleton className="w-[35%] h-2.5 mt-1" />
    </div>
  </div>
);

export const SkeletonGradeTable: React.FC = () => (
  <div className="skel-grade-table">
    <div className="skel-grade-header">
      <Skeleton className="w-full h-9" />
    </div>
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="skel-grade-row">
        <Skeleton className="w-[30%] h-3.5" />
        <Skeleton className="w-[12%] h-3.5" />
        <Skeleton className="w-[12%] h-3.5" />
        <Skeleton className="w-[12%] h-3.5" />
      </div>
    ))}
  </div>
);

export const SkeletonDashboard: React.FC = () => (
  <div className="skel-dashboard">
    <div className="skel-dash-hero">
      <Skeleton className="w-[50%] h-6" />
      <Skeleton className="w-[70%] h-3.5 mt-2" />
    </div>
    <div className="skel-dash-section">
      <Skeleton className="w-[40%] h-4" />
      <div className="skel-dash-cards">
        {[1, 2, 3].map(i => (
          <div key={i} className="skel-dash-card">
            <Skeleton className="w-[80%] h-3.5" />
            <Skeleton className="w-[60%] h-3 mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/** Inline skeleton matching the small subject-chip pills inside class cards. */
export const SkeletonSubjectChip: React.FC = () => (
  <span className="skel-subject-chip">
    <Skeleton className="w-[72px] h-2.5" />
  </span>
);

export const SkeletonSubjectCard: React.FC = () => (
  <div className="skel-subject-card">
    <div className="skel-subject-avg"><Skeleton className="w-full h-full" /></div>
    <div className="skel-subject-info">
      <Skeleton className="w-[55%] h-4" />
      <Skeleton className="w-[40%] h-3 mt-1.5" />
    </div>
  </div>
);
