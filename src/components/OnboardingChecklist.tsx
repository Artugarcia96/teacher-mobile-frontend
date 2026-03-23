import { useState, useEffect } from 'react';
import { IonIcon } from '@ionic/react';
import {
  checkmarkCircleOutline,
  ellipseOutline,
  closeOutline,
} from 'ionicons/icons';
import './OnboardingChecklist.css';

interface Props {
  classCount: number;
  hasSubjects: boolean;
  studentCount: number;
  examCount: number;
  hasCorrected: boolean;
}

interface Step {
  label: string;
  done: boolean;
}

const STORAGE_KEY = 'onboarding_dismissed';

const OnboardingChecklist: React.FC<Props> = ({
  classCount,
  hasSubjects,
  studentCount,
  examCount,
  hasCorrected,
}) => {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const steps: Step[] = [
    { label: 'Crear una clase', done: classCount > 0 },
    { label: 'Añadir asignaturas', done: hasSubjects },
    { label: 'Añadir alumnos', done: studentCount > 0 },
    { label: 'Crear un examen', done: examCount > 0 },
    { label: 'Corregir un examen', done: hasCorrected },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;
  const progress = completedCount / steps.length;

  // Auto-check dismissed state if localStorage changes externally
  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="onboarding-checklist">
      <div className="onboarding-checklist__progress-bar">
        <div
          className="onboarding-checklist__progress-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      <div className="onboarding-checklist__header">
        <div>
          <h3 className="onboarding-checklist__title">Primeros pasos</h3>
          <span className="onboarding-checklist__count">
            {completedCount}/{steps.length} completados
          </span>
        </div>
        <button className="onboarding-checklist__dismiss" onClick={handleDismiss}>
          <IonIcon icon={closeOutline} />
        </button>
      </div>

      {allDone ? (
        <div className="onboarding-checklist__done">
          <IonIcon icon={checkmarkCircleOutline} />
          <p>
            ¡Todo listo! Ya puedes aprovechar todas las funcionalidades.
          </p>
        </div>
      ) : (
        <ul className="onboarding-checklist__steps">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className={`onboarding-checklist__step stagger-item ${step.done ? 'onboarding-checklist__step--done' : ''}`}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <IonIcon
                icon={step.done ? checkmarkCircleOutline : ellipseOutline}
                className="onboarding-checklist__step-icon"
              />
              <span className="onboarding-checklist__step-label">{step.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default OnboardingChecklist;
