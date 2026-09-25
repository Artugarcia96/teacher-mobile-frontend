import type { StudentRef } from '../../api/types';
import { useAssignVersions, type Versions } from '../../api/versions';
import { Row, List, Select, Sheet, useFeedback } from '../../ui';

interface Props {
  open: boolean;
  onClose: () => void;
  activityId: string;
  versions: Versions;
  /** The students of the exam, in list order. */
  students: StudentRef[];
}

/** «Cambiar el reparto»: every student with the version they take; a change is saved at once. */
export default function AssignmentSheet({ open, onClose, activityId, versions, students }: Props) {
  const assign = useAssignVersions(activityId);
  const { toast } = useFeedback();
  const all = [versions.base, ...versions.versions];
  const current = new Map<string, string>();
  all.forEach((v) => v.student_ids.forEach((id) => current.set(id, v.key)));

  const change = (s: StudentRef, key: string) => assign.mutate({ [s.id]: key }, {
    onSuccess: () => toast(`${s.first_name}: ${all.find((v) => v.key === key)?.label ?? key}`),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  return (
    <Sheet open={open} onClose={onClose} side size="large" title="Quién hace cada versión"
      subtitle="Por defecto, A y B alternos por orden de lista; las versiones adaptadas, según las medidas de cada alumno.">
      <List>
        {students.map((s, k) => (
          <Row key={s.id} className="assign-row" title={s.sort_name} lead={<span className="assign-row__n num">{k + 1}</span>} wrapSub
            sub={
              <Select aria-label={`Versión de ${s.name}`} value={current.get(s.id) ?? 'A'} onChange={(e) => change(s, e.target.value)}
                disabled={assign.isPending}>
                {all.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
              </Select>
            } />
        ))}
      </List>
    </Sheet>
  );
}
