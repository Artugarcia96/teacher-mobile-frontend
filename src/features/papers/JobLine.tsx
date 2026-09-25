import type { Job } from '../../api/types';
import { Progress, Spinner } from '../../ui';

/** Inline progress of a background job ("Leyendo nombres… 12/25") or, before it exists, of the upload that starts it
 * (`sent`: fraction sent, "Subiendo las hojas · 34 %"). */
export function JobLine({ job, fallback, sent }: { job: Job | undefined | null; fallback: string; sent?: number }) {
  const uploading = !job && sent !== undefined;
  const pct = Math.round((sent ?? 0) * 100);
  return (
    <div className="job-line paper" role="status">
      <div className="job-line__msg"><Spinner /><span>{job?.message || (uploading ? `${fallback} · ${pct} %` : fallback)}</span></div>
      {uploading ? <Progress value={pct} total={100} /> : <Progress value={job?.progress ?? 0} total={job?.total || 1} />}
    </div>
  );
}
