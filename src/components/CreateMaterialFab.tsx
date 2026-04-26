import { useLocation, useMatch } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useTallerStore } from '../store/tallerStore';

/* El FAB es contextual: según la ruta actual, abre el Taller con limitTo y
   defaultType apropiados. Así la acción "+" en móvil lleva al flujo correcto
   sin que el profesor tenga que pensar en qué está creando. */

interface FabConfig {
  limitTo?: 'content' | 'assessment';
  defaultType?: 'presentation' | 'exam' | 'exercise';
}

const CreateMaterialFab: React.FC = () => {
  const location = useLocation();
  const openTaller = useTallerStore((s) => s.openTaller);

  // Dentro del Temario de una asignatura, el FAB crea material con la
  // asignatura pre-rellenada. En otras rutas el Taller abre sin contexto.
  const syllabusMatch = useMatch('/tabs/classes/:classId/subjects/:subjectId/syllabus');
  const sessionsMatch = useMatch('/tabs/classes/:classId/subjects/:subjectId/sessions');
  const subjectMatch = syllabusMatch || sessionsMatch;

  const config = getConfigFor(location.pathname, !!subjectMatch);
  if (!config) return null;

  const handleClick = () => {
    if (subjectMatch?.params) {
      const { classId, subjectId } = subjectMatch.params as { classId: string; subjectId: string };
      openTaller({
        limitTo: 'content',
        defaultType: 'presentation',
        classId,
        subjectId,
      });
    } else {
      openTaller(config);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Crear material"
      className="lg:hidden fixed right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      style={{ bottom: 'calc(4.25rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <Plus size={26} strokeWidth={2.5} />
    </button>
  );
};

function getConfigFor(pathname: string, inSubject: boolean): FabConfig | null {
  if (inSubject) return { limitTo: 'content', defaultType: 'presentation' };
  if (pathname === '/tabs/calendar') return {}; // todos los tipos
  if (pathname === '/tabs/classes') return {};  // todos los tipos
  // En /tabs/exams y /tabs/exercises cada tab tiene su propio botón +,
  // el FAB no añade valor — lo ocultamos para no competir.
  return null;
}

export default CreateMaterialFab;
