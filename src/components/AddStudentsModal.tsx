import { useState, useEffect } from 'react';
import {
  IonModal, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonSegment, IonSegmentButton, IonLabel, IonList, IonItem, IonInput,
  IonCheckbox, IonSearchbar, IonSpinner, IonIcon, IonProgressBar,
} from '@ionic/react';
import { closeOutline, addOutline, trashOutline, personAddOutline } from 'ionicons/icons';
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
    <IonModal isOpen={isOpen} onDidDismiss={handleDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={handleDismiss}>
              <IonIcon icon={closeOutline} />
            </IonButton>
          </IonButtons>
          <IonTitle>Añadir alumnos</IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as 'new' | 'existing')}>
            <IonSegmentButton value="new">
              <IonLabel>Nuevos</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="existing">
              <IonLabel>Existentes</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        {saving && (
          <div className="add-students__progress">
            <IonProgressBar type="indeterminate" />
            <span>{progress}</span>
          </div>
        )}

        {tab === 'new' && (
          <div className="add-students__new">
            <p className="add-students__hint">
              Introduce los nombres de los nuevos alumnos para {className}
            </p>
            <IonList>
              {studentInputs.map((value, index) => (
                <IonItem key={index}>
                  <IonInput
                    value={value}
                    placeholder={`Nombre del alumno ${index + 1}`}
                    onIonInput={(e) => handleInputChange(index, e.detail.value ?? '')}
                  />
                  {studentInputs.length > 1 && (
                    <IonButton fill="clear" slot="end" onClick={() => handleRemoveRow(index)}>
                      <IonIcon icon={trashOutline} color="danger" />
                    </IonButton>
                  )}
                </IonItem>
              ))}
            </IonList>

            <IonButton fill="clear" expand="block" onClick={handleAddRow}>
              <IonIcon icon={addOutline} slot="start" />
              Añadir otro
            </IonButton>

            <div className="add-students__actions">
              <IonButton
                expand="block"
                onClick={handleAddNew}
                disabled={saving || validNewNames.length === 0}
              >
                {saving ? <IonSpinner name="crescent" /> : `Añadir ${validNewNames.length || ''} alumnos`}
              </IonButton>
            </div>
          </div>
        )}

        {tab === 'existing' && (
          <div className="add-students__existing">
            {availableStudents.length === 0 && !poolLoading ? (
              <div className="add-students__empty">
                <IonIcon icon={personAddOutline} />
                <h3>No hay alumnos disponibles</h3>
                <p>Todos tus alumnos ya están en esta clase, o aún no has creado ninguno.</p>
              </div>
            ) : (
              <>
                <div className="add-students__filters">
                  <IonSearchbar
                    value={search}
                    onIonInput={(e) => setSearch(e.detail.value ?? '')}
                    placeholder="Buscar alumnos..."
                    className="add-students__searchbar"
                  />
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
                    <IonSpinner />
                  </div>
                ) : (
                  <>
                    <div className="add-students__select-all">
                      <IonCheckbox
                        checked={selectedIds.size === filteredAvailable.length && filteredAvailable.length > 0}
                        indeterminate={selectedIds.size > 0 && selectedIds.size < filteredAvailable.length}
                        onIonChange={toggleAll}
                      />
                      <span>Seleccionar todos ({filteredAvailable.length})</span>
                    </div>

                    <IonList>
                      {filteredAvailable.map((student) => (
                        <IonItem key={student.id} onClick={() => toggleStudent(student.id)} button>
                          <IonCheckbox
                            slot="start"
                            checked={selectedIds.has(student.id)}
                          />
                          <IonLabel>
                            <h2>{student.name}</h2>
                            {student.classes.length > 0 && (
                              <p>
                                En: {student.classes.map((c) => c.class_name).join(', ')}
                              </p>
                            )}
                          </IonLabel>
                        </IonItem>
                      ))}
                    </IonList>
                  </>
                )}

                <div className="add-students__actions">
                  <IonButton
                    expand="block"
                    onClick={handleAddExisting}
                    disabled={saving || selectedIds.size === 0}
                  >
                    {saving ? <IonSpinner name="crescent" /> : `Añadir ${selectedIds.size || ''} seleccionados`}
                  </IonButton>
                </div>
              </>
            )}
          </div>
        )}
      </IonContent>
    </IonModal>
  );
};

export default AddStudentsModal;
