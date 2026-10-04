import type { SessionMaterial, TodaySession } from '../../api/today';
import { Chip } from '../../ui';
import { MaterialIcon, shortTitle } from '../units/kinds';
import { useOpenMaterial } from './open';
import './materials.css';

/** «Presentación · S3»: the presentation chip names the lesson it opens (the one the last «Cerrar clase» left next). */
function chipLabel(m: SessionMaterial, unit: string | null | undefined): string {
  const name = shortTitle(m.title, unit);
  return m.kind === 'slides' && m.lesson && (m.lessons ?? 0) > 1 ? `${name} · S${m.lesson}` : name;
}

/** "Ahora" card: one compact row with the current unit's materials, named without the unit («Presentación · S3»,
 *  «Ficha de refuerzo»). A presentation projects at once, at its lesson; «Seguir en la diapositiva 12» says where the
 *  class left it («A medias»). */
export function MaterialChips({ session }: { session: TodaySession }) {
  const open = useOpenMaterial();
  const mats: SessionMaterial[] = session.materials ?? [];
  if (!mats.length) return null;
  const resume = mats.find((m) => m.kind === 'slides' && m.slide);
  return (
    <div className="chip-row now-materials" aria-label="Materiales de la unidad">
      {mats.map((m) => (
        <Chip key={m.id} tone="outline" icon={<MaterialIcon kind={m.kind} filename={m.filename ?? ''} linkKind={m.link_kind} size={15} />}
          onClick={() => open(m, session.course.id, { present: true, lesson: m.lesson, slide: m.slide })}>
          <span>{chipLabel(m, session.unit)}</span>
        </Chip>
      ))}
      {resume && <span className="now-materials__resume">Seguir en la diapositiva {resume.slide}</span>}
    </div>
  );
}
