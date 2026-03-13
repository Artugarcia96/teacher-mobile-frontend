import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
  sparklesOutline,
  chevronDownOutline,
  chevronUpOutline,
  alertCircleOutline,
  trophyOutline,
  bulbOutline,
} from 'ionicons/icons';
import { ClassBreakdown } from '../store/calendarStore';
import './SubjectDayInsight.css';

interface SubjectDayInsightProps {
  breakdown: ClassBreakdown;
  compact?: boolean;
}

const SubjectDayInsight: React.FC<SubjectDayInsightProps> = ({ breakdown, compact = false }) => {
  const [expanded, setExpanded] = useState(!compact);

  const hasAlerts = breakdown.student_alerts && breakdown.student_alerts.length > 0;
  const hasHighlights = breakdown.positive_highlights && breakdown.positive_highlights.length > 0;
  const hasTopics = breakdown.topics_to_cover && breakdown.topics_to_cover.length > 0;
  const hasSuggestions = breakdown.suggestions && breakdown.suggestions.length > 0;
  const hasWeakPoints = breakdown.class_weak_points && breakdown.class_weak_points.length > 0;
  const hasTalkingPoints = breakdown.talking_points && breakdown.talking_points.length > 0;

  const hasContent = hasAlerts || hasHighlights || hasTopics || hasSuggestions || hasWeakPoints || hasTalkingPoints;
  if (!hasContent) return null;

  return (
    <div className={`sdi ${compact ? 'sdi--compact' : ''}`}>
      <button className="sdi__header" onClick={() => setExpanded(!expanded)}>
        <div className="sdi__header-left">
          <div className="sdi__icon">
            <IonIcon icon={sparklesOutline} />
          </div>
          <div className="sdi__header-text">
            <span className="sdi__title">Preparación del día</span>
            {compact && breakdown.subject && (
              <span className="sdi__subtitle">{breakdown.subject}</span>
            )}
            {!compact && breakdown.start_time && (
              <span className="sdi__subtitle">Clase a las {breakdown.start_time}</span>
            )}
          </div>
        </div>
        <IonIcon icon={expanded ? chevronUpOutline : chevronDownOutline} className="sdi__chevron" />
      </button>

      {expanded && (
        <div className="sdi__body">
          {/* Topics to cover */}
          {hasTopics && (
            <div className="sdi__section">
              <div className="sdi__section-header">
                <IonIcon icon={bulbOutline} />
                <span>Temas a reforzar</span>
              </div>
              <ul className="sdi__list">
                {breakdown.topics_to_cover!.map((topic, i) => (
                  <li key={i}>{topic}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Student alerts */}
          {hasAlerts && (
            <div className="sdi__section sdi__section--alert">
              <div className="sdi__section-header">
                <IonIcon icon={alertCircleOutline} />
                <span>Alumnos que atender</span>
              </div>
              <div className="sdi__alerts">
                {breakdown.student_alerts!.map((alert, i) => (
                  <div key={i} className="sdi__alert-item">
                    <span className="sdi__alert-name">{alert.name}</span>
                    <span className="sdi__alert-issue">{alert.issue}</span>
                    {alert.suggested_action && (
                      <span className="sdi__alert-action">{alert.suggested_action}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Positive highlights */}
          {hasHighlights && (
            <div className="sdi__section sdi__section--positive">
              <div className="sdi__section-header">
                <IonIcon icon={trophyOutline} />
                <span>Destacados</span>
              </div>
              <div className="sdi__highlights">
                {breakdown.positive_highlights!.map((h, i) => (
                  <div key={i} className="sdi__highlight-item">
                    <span className="sdi__highlight-name">{h.name}</span>
                    <span className="sdi__highlight-text">{h.achievement}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weak points as tags */}
          {hasWeakPoints && (
            <div className="sdi__section">
              <div className="sdi__section-header">
                <span>Puntos débiles</span>
              </div>
              <div className="sdi__tags">
                {breakdown.class_weak_points!.map((point, i) => (
                  <span key={i} className="sdi__tag">{point}</span>
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {hasSuggestions && !compact && (
            <div className="sdi__section">
              <div className="sdi__section-header">
                <span>Sugerencias</span>
              </div>
              <ul className="sdi__list sdi__list--suggestions">
                {breakdown.suggestions!.map((sug, i) => (
                  <li key={i}>{sug}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Talking points */}
          {hasTalkingPoints && !compact && (
            <div className="sdi__section">
              <div className="sdi__section-header">
                <span>Puntos a comentar</span>
              </div>
              <ul className="sdi__list">
                {breakdown.talking_points!.map((tp, i) => (
                  <li key={i}>{tp}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SubjectDayInsight;
