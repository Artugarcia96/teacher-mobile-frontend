import { useState, useMemo } from 'react';
import { IonIcon, IonSearchbar, IonSpinner } from '@ionic/react';
import { chevronDownOutline, checkmarkOutline, schoolOutline, bookOutline } from 'ionicons/icons';
import './ClassSubjectPicker.css';

export interface ClassSubjectPair {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
}

interface Props {
  pairs: ClassSubjectPair[];
  loading?: boolean;
  value: { classId: string; subjectId: string } | null;
  onChange: (classId: string, subjectId: string) => void;
  placeholder?: string;
}

const ClassSubjectPicker: React.FC<Props> = ({
  pairs, loading, value, onChange, placeholder = 'Seleccionar clase y asignatura'
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Group pairs by class
  const grouped = useMemo(() => {
    const map = new Map<string, { className: string; subjects: { subjectId: string; subjectName: string }[] }>();
    for (const p of pairs) {
      if (!map.has(p.classId)) {
        map.set(p.classId, { className: p.className, subjects: [] });
      }
      map.get(p.classId)!.subjects.push({ subjectId: p.subjectId, subjectName: p.subjectName });
    }
    return Array.from(map.entries()).map(([classId, data]) => ({ classId, ...data }));
  }, [pairs]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    return grouped
      .map(g => ({
        ...g,
        subjects: g.subjects.filter(
          s => s.subjectName.toLowerCase().includes(q) || g.className.toLowerCase().includes(q)
        ),
      }))
      .filter(g => g.subjects.length > 0);
  }, [grouped, search]);

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    const pair = pairs.find(p => p.classId === value.classId && p.subjectId === value.subjectId);
    return pair ? `${pair.className} — ${pair.subjectName}` : null;
  }, [pairs, value]);

  const isSelected = (classId: string, subjectId: string) =>
    value?.classId === classId && value?.subjectId === subjectId;

  const handleSelect = (classId: string, subjectId: string) => {
    onChange(classId, subjectId);
    setOpen(false);
    setSearch('');
  };

  if (loading) {
    return (
      <div className="csp__trigger csp__trigger--loading">
        <IonSpinner name="dots" />
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="csp__trigger csp__trigger--empty">
        <span>Crea clases y asignaturas primero</span>
      </div>
    );
  }

  return (
    <div className="csp">
      <button className="csp__trigger" onClick={() => setOpen(true)} type="button">
        {selectedLabel ? (
          <span className="csp__trigger-value">{selectedLabel}</span>
        ) : (
          <span className="csp__trigger-placeholder">{placeholder}</span>
        )}
        <IonIcon icon={chevronDownOutline} className="csp__trigger-icon" />
      </button>

      {open && (
        <div className="csp__overlay" onClick={() => { setOpen(false); setSearch(''); }}>
          <div className="csp__sheet" onClick={(e) => e.stopPropagation()}>
            <div className="csp__sheet-handle" />
            <div className="csp__sheet-header">
              <span className="csp__sheet-title">Clase y asignatura</span>
            </div>
            {grouped.length > 4 && (
              <IonSearchbar
                value={search}
                onIonInput={(e) => setSearch(e.detail.value ?? '')}
                placeholder="Buscar..."
                className="csp__search"
                debounce={150}
              />
            )}
            <div className="csp__list">
              {filtered.length === 0 && (
                <div className="csp__empty">Sin resultados</div>
              )}
              {filtered.map((group) => (
                <div key={group.classId} className="csp__group">
                  <div className="csp__group-header">
                    <IonIcon icon={schoolOutline} />
                    <span>{group.className}</span>
                  </div>
                  {group.subjects.map((s) => (
                    <button
                      key={s.subjectId}
                      className={`csp__option ${isSelected(group.classId, s.subjectId) ? 'csp__option--selected' : ''}`}
                      onClick={() => handleSelect(group.classId, s.subjectId)}
                      type="button"
                    >
                      <IonIcon icon={bookOutline} className="csp__option-icon" />
                      <span className="csp__option-label">{s.subjectName}</span>
                      {isSelected(group.classId, s.subjectId) && (
                        <IonIcon icon={checkmarkOutline} className="csp__option-check" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassSubjectPicker;
