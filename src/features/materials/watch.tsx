import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useJob } from '../../api/core';
import type { Job } from '../../api/types';
import { plural } from '../../lib/format';
import { useFeedback } from '../../ui';

/** AI work the teacher started and left running (a material, a batch, a rewrite): the app says when it ends, wherever
 *  the teacher is, with «Abrir». In memory only: after a reload the unit and the material show their own state. */
export type Watched =
  | { job: string; kind: 'material'; done: string; failed: string; path: string }
  | { job: string; kind: 'rewrite'; materialId: string; blockId: string; done: string; path: string }
  | { job: string; kind: 'batch'; courseId: string; materials: { id: string; unit_id: string | null; kind: string }[] };

let watched: Watched[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function watchJob(w: Watched) {
  watched = [...watched.filter((x) => x.job !== w.job), w];
  emit();
}

function unwatch(job: string) {
  watched = watched.filter((x) => x.job !== job);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useWatched(): Watched[] {
  return useSyncExternalStore(subscribe, () => watched);
}

/** Mounted once in the shell: polls every watched job and announces its end. */
export function JobWatcher() {
  const list = useWatched();
  return <>{list.map((w) => <WatchOne key={w.job} w={w} />)}</>;
}

function WatchOne({ w }: { w: Watched }) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const refresh = () => {
    for (const key of [['unit'], ['material'], ['course'], ['library'], ['today'], ['grounding']]) qc.invalidateQueries({ queryKey: key });
  };
  const open = (path: string) => (pathname === path ? undefined : { label: 'Abrir', run: () => navigate(path) });
  const end = (job: Job) => {
    refresh();
    unwatch(w.job);
    const ok = job.status === 'done';
    if (w.kind === 'material') toast(ok ? w.done : w.failed, ok ? { action: open(w.path) } : { tone: 'error', action: open(w.path) });
    else if (w.kind === 'rewrite') toast(ok ? w.done : job.error || 'No se ha podido reescribir.', ok ? { action: open(w.path) } : { tone: 'error' });
    else {
      const ready = Number(job.result?.ready ?? 0), failed = Number(job.result?.failed ?? 0);
      if (!ok) toast(job.error || 'No se han podido preparar los materiales.', { tone: 'error' });
      else toast(`Materiales preparados: ${plural(ready, 'listo', 'listos')}${failed ? `, ${failed} sin crear` : ''}`, failed ? { tone: 'error' } : undefined);
    }
  };
  useJob(w.job, { onDone: end, onFail: end });
  return null;
}
