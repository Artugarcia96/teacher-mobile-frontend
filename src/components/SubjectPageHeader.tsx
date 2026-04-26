/**
 * SubjectPageHeader — cabecera unificada para páginas internas de una
 * asignatura (Programación, Temario, Sesiones, Exámenes, Ejercicios,
 * Asistencia, etc.).
 *
 * Mismo fondo, mismo tamaño y mismo layout en todas las páginas. Sin color
 * de asignatura: el color del subject se reserva para chips, gradebook hero
 * y otros elementos decorativos, no para invadir el shell.
 */

import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './SubjectPageHeader.css';

interface Props {
  /** Texto pequeño superior (clase, contexto). */
  eyebrow?: React.ReactNode;
  /** Título principal (asignatura · módulo, p.ej. "Matemáticas · Programación"). */
  title: React.ReactNode;
  /** Subtítulo/meta opcional bajo el título. */
  sub?: React.ReactNode;
  /** Destino del botón "atrás". Si no se pasa usa history(-1). */
  backHref?: string;
  /** Acciones a la derecha (botones secundarios). */
  actions?: React.ReactNode;
}

const SubjectPageHeader: React.FC<Props> = ({ eyebrow, title, sub, backHref, actions }) => {
  const navigate = useNavigate();
  return (
    <header className="sph-header">
      <button
        type="button"
        className="sph-back"
        aria-label="Volver"
        onClick={() => (backHref ? navigate(backHref) : navigate(-1))}
      >
        <ArrowLeft size={18} />
      </button>
      <div className="sph-meta">
        {eyebrow && <span className="sph-eyebrow">{eyebrow}</span>}
        <h1 className="sph-title">{title}</h1>
        {sub && <span className="sph-sub">{sub}</span>}
      </div>
      {actions && <div className="sph-actions">{actions}</div>}
    </header>
  );
};

export default SubjectPageHeader;
