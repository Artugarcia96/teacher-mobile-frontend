import { useState, useEffect } from 'react';
import { Plus, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Spinner from '@/components/shared/Spinner';
import Modal from '@/components/shared/Modal';
import Searchbar from '@/components/shared/Searchbar';
import { Progress } from '@/components/ui/progress';
import { useStudentsStore, StudentPoolEntry } from '../store/studentsStore';
import './AddStudentsModal.css';

interface AddStudentsModalProps {
  isOpen: boolean;
  classId: string;
  className: string;
  onDismiss: () => void;
  onStudentsAdded: () => void;
}

const AddStudentsModal: React.FC<AddStudentsModalProps> = ({
  isOpen, classId, className, onDismiss, onStudentsAdded
}) => {
  const bulkAddStudents = useStudentsStore((s) => s.bulkAddStudents);
  const addExistingToClass = useStudentsStore((s) => s.addExistingToClass);
  const fetchPoolNotInClass = useStudentsStore((s) => s.fetchPoolNotInClass);
  const poolLoading = useStudentsStore((s) => s.poolLoading);

  const [tab, setTab] = useState<'new' | 'existing'>('new');
  const [studentInputs, setStudentInputs] = useState<string[]>(['']);
  const [availableStudents, setAvailableStudents] = useState<StudentPoolEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('');
  const [classFilterOpen, setClassFilterOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (isOpen && tab === 'existing') {
      loadAvailableStudents();
    }
  }, [isOpen, tab, classId]);

  const loadAvailableStudents = async () => {
    const students = await fetchPoolNotInClass(classId);
    setAvailableStudents(students);
  };

  const handleInputChange = (index: number, value: string) => {
    setStudentInputs((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAddRow = () => {
    setStudentInputs((prev) => [...prev, '']);
  };

  const handleRemoveRow = (index: number) => {
    if (studentInputs.length <= 1) return;
    setStudentInputs((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAll = () => {
    const filtered = filteredAvailable;
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  const handleAddNew = async () => {
    const names = studentInputs.filter((n) => n.trim().length > 0).map((n) => n.trim());
    if (names.length === 0) return;

    setSaving(true);
    setProgress(`Añadiendo ${names.length} alumnos...`);
    try {
      await bulkAddStudents(classId, names);
      setStudentInputs(['']);
      onStudentsAdded();
      onDismiss();
    } catch (err) {
      console.error('Failed to add students:', err);
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  const handleAddExisting = async () => {
    if (selectedIds.size === 0) return;

    setSaving(true);
    setProgress(`Añadiendo ${selectedIds.size} alumnos existentes...`);
    try {
      await addExistingToClass(classId, Array.from(selectedIds));
      setSelectedIds(new Set());
      onStudentsAdded();
      onDismiss();
    } catch (err) {
      console.error('Failed to add existing students:', err);
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  // Get unique classes for the filter dropdown
  const uniqueClasses = Array.from(
    new Map(
      availableStudents
        .flatMap((s) => s.classes)
        .map((c) => [c.class_id, c])
    ).values()
  ).sort((a, b) => a.class_name.localeCompare(b.class_name));

  const filteredAvailable = availableStudents.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchesClass = !classFilter || s.classes.some((c) => c.class_id === classFilter);
    return matchesSearch && matchesClass;
  });

  const validNewNames = studentInputs.filter((n) => n.trim().length > 0);

  const handleDismiss = () => {
    setStudentInputs(['']);
    setSelectedIds(new Set());
    setSearch('');
    setClassFilter('');
    setTab('new');
    onDismiss();
  };

  return (
    <Modal open={isOpen} onClose={handleDismiss} sheetHeight="lg">
      <div className="flex items-center justify-between p-4 border-b">
        
          <div className="flex items-center gap-1">
            <Button onClick={handleDismiss}>
              <X size={18} />
            </Button>
          </div>
          <h2 className="text-base font-semibold">Añadir alumnos</h2>
        
        
          <div className="flex rounded-lg bg-muted p-1">
            <button onClick={() => setTab('new')} className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'new' ? 'bg-background shadow-sm' : ''}`}>
              <span>Nuevos</span>
            </button>
            <button onClick={() => setTab('existing')} className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'existing' ? 'bg-background shadow-sm' : ''}`}>
              <span>Existentes</span>
            </button>
          </div>
        
      </div>

      <div>
        {saving && (
          <div className="add-students__progress">
            <Progress />
            <span>{progress}</span>
          </div>
        )}

        {tab === 'new' && (
          <div className="add-students__new">
            <p className="add-students__hint">
              Introduce los nombres de los nuevos alumnos para {className}
            </p>
            <div className="flex flex-col">
              {studentInputs.map((value, index) => (
                <div className="flex items-center gap-2">
                  <Input value={value} onChange={(e) => handleInputChange(index, e.target.value)} />
                  {studentInputs.length > 1 && (
                    <Button variant="ghost" onClick={() => handleRemoveRow(index)}>
                      <Trash2 size={18} />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button variant="ghost" className="w-full" onClick={handleAddRow}>
              <Plus size={18} />
              Añadir otro
            </Button>

            <div className="add-students__actions">
              <Button className="w-full" onClick={handleAddNew} disabled={saving || validNewNames.length === 0}>
                {saving ? <Spinner size={18} /> : `Añadir ${validNewNames.length || ''} alumnos`}
              </Button>
            </div>
          </div>
        )}

        {tab === 'existing' && (
          <div className="add-students__existing">
            {availableStudents.length === 0 && !poolLoading ? (
              <div className="add-students__empty">
                <UserPlus size={18} />
                <h3>No hay alumnos disponibles</h3>
                <p>Todos tus alumnos ya están en esta clase, o aún no has creado ninguno.</p>
              </div>
            ) : (
              <>
                <div className="add-students__filters">
                  <Searchbar value={search} onChange={(v) => setSearch(v ?? '')} placeholder="Buscar alumnos..." className="add-students__searchbar" />
                  {uniqueClasses.length > 0 && (
                    <div className="add-students__class-filter-wrap">
                      <button
                        className="add-students__class-filter-btn"
                        onClick={() => setClassFilterOpen((o) => !o)}
                      >
                        <span>{classFilter ? (uniqueClasses.find((c) => c.class_id === classFilter)?.class_name ?? 'Todas las clases') : 'Todas las clases'}</span>
                        <svg className={`add-students__class-filter-caret${classFilterOpen ? ' add-students__class-filter-caret--open' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {classFilterOpen && (
                        <>
                          <div className="add-students__class-filter-backdrop" onClick={() => setClassFilterOpen(false)} />
                          <div className="add-students__class-filter-dropdown">
                            {[{ class_id: '', class_name: 'Todas las clases' }, ...uniqueClasses].map((c) => (
                              <button
                                key={c.class_id}
                                className={`add-students__class-filter-option${classFilter === c.class_id ? ' add-students__class-filter-option--active' : ''}`}
                                onClick={() => { setClassFilter(c.class_id); setClassFilterOpen(false); }}
                              >
                                {c.class_name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {poolLoading ? (
                  <div className="add-students__loading">
                    <Spinner size={18} />
                  </div>
                ) : (
                  <>
                    <div className="add-students__select-all">
                      <input type="checkbox" checked={selectedIds.size === filteredAvailable.length && filteredAvailable.length > 0}
                        ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredAvailable.length; }}
                        onChange={toggleAll} />
                      <span>Seleccionar todos ({filteredAvailable.length})</span>
                    </div>

                    <div className="flex flex-col">
                      {filteredAvailable.map((student) => (
                        <div className="flex items-center gap-2" onClick={() => toggleStudent(student.id)}>
                          <input type="checkbox" slot="start"
                            checked={selectedIds.has(student.id)} />
                          <span>
                            <h2>{student.name}</h2>
                            {student.classes.length > 0 && (
                              <p>
                                En: {student.classes.map((c) => c.class_name).join(', ')}
                              </p>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="add-students__actions">
                  <Button className="w-full" onClick={handleAddExisting} disabled={saving || selectedIds.size === 0}>
                    {saving ? <Spinner size={18} /> : `Añadir ${selectedIds.size || ''} seleccionados`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AddStudentsModal;
