import type { SessionMaterial, TodaySession } from '../../api/today';
import { Chip } from '../../ui';
import { MaterialIcon } from '../units/kinds';
import { useOpenMaterial } from './open';
import './materials.css';

/** "Ahora" card: one compact row with the current unit's materials. Slides open straight in presentation mode. */
export function MaterialChips({ session }: { session: TodaySession }) {
  const open = useOpenMaterial();
  const mats: SessionMaterial[] = session.materials ?? [];
  if (!mats.length) return null;
  return (
    <div className="chip-row now-materials" aria-label="Materiales de la unidad">
      {mats.map((m) => (
        <Chip key={m.id} tone="outline" icon={<MaterialIcon kind={m.kind} size={15} />}
          onClick={() => open(m, session.course.id, { present: true })}>
          <span>{m.title}</span>
        </Chip>
      ))}
    </div>
  );
}
