import type { Job } from '../../api/types';
import { Progress, Spinner } from '../../ui';

/** Inline progress of a background job ("Leyendo nombres… 12/25"). */
export function JobLine({ job, fallback }: { job: Job | undefined | null; fallback: string }) {
  return (
    <div className="job-line paper" role="status">
      <div className="job-line__msg"><Spinner /><span>{job?.message || fallback}</span></div>
      <Progress value={job?.progress ?? 0} total={job?.total || 1} />
    </div>
  );
}
