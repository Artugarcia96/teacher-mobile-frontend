import { useState, useMemo, useEffect } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonSearchbar, IonModal, IonItem, IonLabel, IonInput, IonList,
  IonButtons, IonIcon, IonSpinner, IonItemSliding, IonItemOptions, IonItemOption,
  IonAlert,
} from '@ionic/react';
import { addOutline, swapVerticalOutline } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import { useClassesStore } from '../../store/classesStore';
import EmptyState from '../../components/EmptyState';
import './Classes.css';

const AVATAR_COLORS = [
  '#15665E', '#1E8A7F', '#059669', '#0891B2', '#E87A1C',
  '#DC2626', '#2563EB', '#7C3AED', '#DB2777', '#4F46E5',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const Classes: React.FC = () => {
  const history = useHistory();
  const allClasses = useClassesStore((s) => s.classes);
  const addClass = useClassesStore((s) => s.addClass);
  const archiveClass = useClassesStore((s) => s.archiveClass);
  const fetchClasses = useClassesStore((s) => s.fetchClasses);
  const loading = useClassesStore((s) => s.loading);
  const classes = useMemo(() => allClasses.filter((c) => !c.archived), [allClasses]);

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'subject' | 'students'>('name');

  // Class creation fields
  const [newName, setNewName] = useState('');
  const [yearFrom, setYearFrom] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${y}-09-01`;
  });
  const [yearTo, setYearTo] = useState(() => {
    const now = new Date();
    const y = now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
    return `${y}-06-30`;
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  const filtered = useMemo(() => {
    let result = classes.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.subject.toLowerCase().includes(search.toLowerCase())
    );
    
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'subject':
          return a.subject.localeCompare(b.subject);
        case 'students':
          return (b.studentCount || 0) - (a.studentCount || 0);
        default:
          return 0;
      }
    });
    
    return result;
  }, [classes, search, sortBy]);

  const yearLabel = `${yearFrom.slice(0, 4)}-${yearTo.slice(0, 4)}`;

  const resetModal = () => {
    setNewName('');
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await addClass({ name: newName.trim(), year: yearLabel });
      resetModal();
      setShowModal(false);
      history.push(`/tabs/classes/${id}/settings`);
    } catch (err) {
      console.error('Failed to create class:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try { await archiveClass(deleteTarget.id); } catch (err) { console.error(err); }
    setDeleteTarget(null);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Clases</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => setShowModal(true)}>
              <IonIcon icon={addOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="classes-controls">
          <IonSearchbar
            value={search}
            onIonInput={(e) => setSearch(e.detail.value ?? '')}
            placeholder="Buscar clases..."
            className="classes-search"
          />
          
          {classes.length > 1 && (
            <div className="classes-sort">
              <IonIcon icon={swapVerticalOutline} className="classes-sort__icon" />
              <div className="classes-sort__chips">
                <button
                  className={`classes-sort__chip ${sortBy === 'name' ? 'classes-sort__chip--active' : ''}`}
                  onClick={() => setSortBy('name')}
                >
                  Nombre
                </button>
                <button
                  className={`classes-sort__chip ${sortBy === 'subject' ? 'classes-sort__chip--active' : ''}`}
                  onClick={() => setSortBy('subject')}
                >
                  Asignatura
                </button>
                <button
                  className={`classes-sort__chip ${sortBy === 'students' ? 'classes-sort__chip--active' : ''}`}
                  onClick={() => setSortBy('students')}
                >
                  Alumnos
                </button>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="classes-loading"><IonSpinner color="primary" /></div>
        )}

        {!loading && filtered.length === 0 ? (
          <EmptyState
            icon="📚"
            title="Aún no hay clases"
            subtitle="Crea tu primera clase para empezar"
            actionLabel="Nueva clase"
            onAction={() => setShowModal(true)}
          />
        ) : (
          <div className="classes-grid">
            {filtered.map((c) => (
              <IonItemSliding key={c.id}>
                <div
                  className="class-card"
                  onClick={() => history.push(`/tabs/classes/${c.id}`)}
                >
                  <div className="class-card__avatar" style={{ background: avatarColor(c.name) }}>
                    {c.name.charAt(0)}
                  </div>
                  <div className="class-card__info">
                    <span className="class-card__name">{c.name}</span>
                    <span className="class-card__meta">
                      {c.lectureCount > 0 
                        ? `${c.lectureCount} ${c.lectureCount === 1 ? 'asignatura' : 'asignaturas'}`
                        : c.subject || 'Sin asignaturas'
                      }
                    </span>
                  </div>
                  <div className="class-card__stats">
                    <div className="class-card__stat">
                      <span className="class-card__stat-value">{c.studentCount}</span>
                      <span className="class-card__stat-label">alumnos</span>
                    </div>
                  </div>
                </div>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => setDeleteTarget({ id: c.id, name: c.name })}>
                    Eliminar
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            ))}
          </div>
        )}

        <IonAlert
          isOpen={!!deleteTarget}
          header="Eliminar clase"
          message={`¿Seguro que quieres eliminar "${deleteTarget?.name}"?`}
          buttons={[
            { text: 'Cancelar', role: 'cancel', handler: () => setDeleteTarget(null) },
            { text: 'Eliminar', role: 'destructive', handler: handleDeleteConfirm }
          ]}
          onDidDismiss={() => setDeleteTarget(null)}
        />

        {/* Create class modal - simplified */}
        <IonModal
          isOpen={showModal}
          onDidDismiss={() => { setShowModal(false); resetModal(); }}
          initialBreakpoint={0.45}
          breakpoints={[0, 0.45, 0.6]}
        >
          <div className="modal-sheet">
            <h2 className="modal-sheet__title">Nueva clase</h2>
            <IonList>
              <IonItem>
                <IonLabel position="stacked">Nombre de la clase</IonLabel>
                <IonInput value={newName} onIonInput={(e) => setNewName(e.detail.value ?? '')} placeholder="ej. 1A, 2B, 3ESO..." />
              </IonItem>
            </IonList>

            <div className="curso-dates">
              <span className="curso-dates__label">Curso escolar</span>
              <div className="curso-dates__row">
                <IonItem lines="none" className="curso-dates__field">
                  <IonLabel position="stacked">Desde</IonLabel>
                  <IonInput type="date" value={yearFrom} onIonInput={(e) => setYearFrom(e.detail.value ?? '')} />
                </IonItem>
                <IonItem lines="none" className="curso-dates__field">
                  <IonLabel position="stacked">Hasta</IonLabel>
                  <IonInput type="date" value={yearTo} onIonInput={(e) => setYearTo(e.detail.value ?? '')} />
                </IonItem>
              </div>
            </div>

            <p className="modal-hint">Después de crear la clase podrás añadir asignaturas, horarios y alumnos.</p>

            <IonButton
              expand="block"
              onClick={handleCreate}
              className="ion-margin-top"
              disabled={creating || !newName.trim()}
            >
              {creating ? <IonSpinner name="crescent" /> : 'Crear clase'}
            </IonButton>
          </div>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Classes;
