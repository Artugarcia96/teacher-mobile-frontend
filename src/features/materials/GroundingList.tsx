import { useGrounding, type GroundingSource } from '../../api/units';
import { plural } from '../../lib/format';
import { Callout, Skeleton } from '../../ui';
import { MaterialIcon } from '../units/kinds';
import './materials.css';

const SHOWN = 5;

function usage(s: GroundingSource): string | null {
  if (s.used >= s.chars) return null;
  if (s.used === 0) return 'no cabe';
  return `una parte (${Math.max(1, Math.round((s.used / s.chars) * 100))} %)`;
}

/** "Crear con IA" / "Generar examen": which of the teacher's materials the AI will read (own ones first), which only
 *  in part, and a warning while files are still being read. Backend: GET /grounding (`ownOnly`: a material reads
 *  only the teacher's own files). */
export function GroundingList({ unitIds, what, ownOnly = false, label = 'Material que usará la IA' }: {
  unitIds: string[]; what: string; ownOnly?: boolean; label?: string;
}) {
  const g = useGrounding(unitIds, ownOnly);
  if (!unitIds.length) return null;
  if (g.isLoading) return <div className="field"><span className="field__label">{label}</span><Skeleton h={18} w="60%" /></div>;
  if (!g.data) return null;
  const { sources, reading } = g.data;
  const partial = sources.some((s) => s.used < s.chars);
  const one = unitIds.length === 1;

  return (
    <div className="field grounding">
      <span className="field__label">{label}</span>
      {sources.length === 0 ? (
        <p className="field__hint">
          {one ? 'Esta unidad aún no tiene' : 'Estas unidades aún no tienen'} archivos ni fotos con texto: la IA partirá del
          {ownOnly ? ' temario y del título. ' : ' título. '}
          Sube el tema del libro o tus apuntes para que {what} se base en ellos.
        </p>
      ) : (
        <>
          <ul className="grounding__list">
            {sources.slice(0, SHOWN).map((s) => (
              <li key={s.id} className={s.used === 0 ? 'grounding__item grounding__item--out' : 'grounding__item'}>
                <MaterialIcon kind={s.kind} filename={s.filename ?? ''} size={16} />
                <span className="grounding__title">{s.title}</span>
                {usage(s) && <span className="grounding__usage">{usage(s)}</span>}
              </li>
            ))}
            {sources.length > SHOWN && <li className="grounding__more">y {plural(sources.length - SHOWN, 'material más', 'materiales más')}</li>}
          </ul>
          <p className="field__hint">
            Primero tus archivos y fotos, en el orden de la unidad; los enlaces no se leen.
            {partial ? ' De los materiales largos solo cabe una parte: pon primero en la unidad lo más importante.' : ''}
          </p>
        </>
      )}
      {reading.length > 0 && (
        <Callout tone="warn">
          La IA aún está leyendo {reading.length === 1 ? `«${reading[0].title}»` : plural(reading.length, 'archivo', 'archivos')}.
          Si creas ahora, no {reading.length === 1 ? 'lo' : 'los'} tendrá en cuenta.
        </Callout>
      )}
    </div>
  );
}
