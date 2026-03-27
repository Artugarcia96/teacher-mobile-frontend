import { useState } from 'react';
import { IonIcon } from '@ionic/react';
import {
  sparklesOutline,
  chevronDownOutline,
  chevronUpOutline,
  alertCircleOutline,
  trophyOutline,
  bulbOutline,
  trendingDownOutline,
  trendingUpOutline,
  locationOutline,
  chatbubbleOutline,
} from 'ionicons/icons';
import { ClassBreakdown } from '../store/calendarStore';
import './SubjectDayInsight.css';

interface SubjectDayInsightProps {
  breakdown: ClassBreakdown;
  compact?: boolean;
}

/** Collapsible section within the insight card */
const Section: React.FC<{
  icon?: string;
  label: string;
  defaultOpen?: boolean;
  variant?: 'alert' | 'grade-alert' | 'positive' | '';
  children: React.ReactNode;
}> = ({ icon, label, defaultOpen = false, variant = '', children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const cls = variant ? `sdi__section sdi__section--${variant}` : 'sdi__section';

  return (
    <div className={cls}>
      <button className="sdi__section-toggle" onClick={() => setOpen(!open)}>
        <div className="sdi__section-header">
          {icon && <IonIcon icon={icon} />}
          <span>{label}</span>
        </div>
        <IonIcon icon={open ? chevronUpOutline : chevronDownOutline} className="sdi__section-chevron" />
      </button>
      {open && <div className="sdi__section-body">{children}</div>}
    </div>
  );
};

const SubjectDayInsight: React.FC<SubjectDayInsightProps> = ({ breakdown, compact = false }) => {
  const [expanded, setExpanded] = useState(false);

  const hasAlerts = breakdown.student_alerts && breakdown.student_alerts.length > 0;
  const hasHighlights = breakdown.positive_highlights && breakdown.positive_highlights.length > 0;
  const hasTopics = breakdown.topics_to_cover && breakdown.topics_to_cover.length > 0;
  const hasSuggestions = breakdown.suggestions && breakdown.suggestions.length > 0;
  const hasWeakPoints = breakdown.class_weak_points && breakdown.class_weak_points.length > 0;
  const hasTalkingPoints = breakdown.talking_points && breakdown.talking_points.length > 0;
  const hasGradeAlerts = breakdown.grade_alerts && breakdown.grade_alerts.length > 0;
  const hasRecentComments = breakdown.recent_comments && breakdown.recent_comments.length > 0;

  const hasContent = hasAlerts || hasHighlights || hasTopics || hasSuggestions || hasWeakPoints || hasTalkingPoints || hasGradeAlerts || hasRecentComments;
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
            {!compact && (breakdown.start_time || breakdown.aula) && (
              <span className="sdi__subtitle">
                {breakdown.start_time && `Clase a las ${breakdown.start_time}`}
                {breakdown.start_time && breakdown.aula && ' · '}
                {breakdown.aula && (
                  <><IonIcon icon={locationOutline} className="sdi__subtitle-icon" />{breakdown.aula}</>
                )}
              </span>
            )}
          </div>
        </div>
        <IonIcon icon={expanded ? chevronUpOutline : chevronDownOutline} className="sdi__chevron" />
      </button>

      {expanded && (
        <div className="sdi__body">
          {/* Topics to cover — open by default */}
          {hasTopics && (
            <Section icon={bulbOutline} label="Temas a reforzar">
              <ul className="sdi__list">
                {breakdown.topics_to_cover!.map((topic, i) => (
                  <li key={i}>{topic}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Student alerts */}
          {hasAlerts && (
            <Section icon={alertCircleOutline} label="Alumnos que atender" variant="alert">
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
            </Section>
          )}

          {/* Grade alerts */}
          {hasGradeAlerts && (
            <Section icon={alertCircleOutline} label="Alertas de rendimiento" variant="grade-alert">
              <div className="sdi__grade-alerts">
                {breakdown.grade_alerts!.map((alert, i) => (
                  <div key={i} className="sdi__grade-alert-item">
                    <div className="sdi__grade-alert-top">
                      <span className="sdi__alert-name">{alert.student_name}</span>
                      {alert.avg_grade != null && (
                        <span className={`sdi__grade-badge ${alert.avg_grade < 5 ? 'sdi__grade-badge--danger' : 'sdi__grade-badge--ok'}`}>
                          {alert.avg_grade.toFixed(1)}
                        </span>
                      )}
                      {alert.trend && alert.trend !== 'stable' && (
                        <IonIcon
                          icon={alert.trend === 'improving' ? trendingUpOutline : trendingDownOutline}
                          className={`sdi__trend-icon sdi__trend-icon--${alert.trend}`}
                        />
                      )}
                    </div>
                    <span className="sdi__alert-issue">{alert.issue}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Positive highlights */}
          {hasHighlights && (
            <Section icon={trophyOutline} label="Destacados" variant="positive">
              <div className="sdi__highlights">
                {breakdown.positive_highlights!.map((h, i) => (
                  <div key={i} className="sdi__highlight-item">
                    <span className="sdi__highlight-name">{h.name}</span>
                    <span className="sdi__highlight-text">{h.achievement}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Weak points as tags */}
          {hasWeakPoints && (
            <Section label="Puntos débiles">
              <div className="sdi__tags">
                {breakdown.class_weak_points!.map((point, i) => (
                  <span key={i} className="sdi__tag">{point}</span>
                ))}
              </div>
            </Section>
          )}

          {/* Suggestions */}
          {hasSuggestions && !compact && (
            <Section label="Sugerencias">
              <ul className="sdi__list sdi__list--suggestions">
                {breakdown.suggestions!.map((sug, i) => (
                  <li key={i}>{sug}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Talking points */}
          {hasTalkingPoints && !compact && (
            <Section label="Puntos a comentar">
              <ul className="sdi__list">
                {breakdown.talking_points!.map((tp, i) => (
                  <li key={i}>{tp}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Recent comments */}
          {hasRecentComments && (
            <Section icon={chatbubbleOutline} label="Comentarios recientes">
              <ul className="sdi__list">
                {breakdown.recent_comments!.map((comment, i) => (
                  <li key={i}>{comment}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
};

export default SubjectDayInsight;
