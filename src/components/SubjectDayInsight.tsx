import { useState } from 'react';
import {
  Sparkles, ChevronDown, ChevronUp, AlertCircle, Trophy, Lightbulb,
  TrendingDown, TrendingUp, MapPin, MessageCircle, BookOpen, Pencil, Calendar,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ClassBreakdown } from '../store/calendarStore';
import './SubjectDayInsight.css';

interface SubjectDayInsightProps {
  breakdown: ClassBreakdown;
  compact?: boolean;
}

/** Collapsible section within the insight card */
const Section: React.FC<{
  icon?: React.FC<{ size?: number; className?: string }>;
  label: string;
  defaultOpen?: boolean;
  variant?: 'alert' | 'grade-alert' | 'positive' | '';
  children: React.ReactNode;
}> = ({ icon: IconComp, label, defaultOpen = false, variant = '', children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const cls = variant ? `sdi__section sdi__section--${variant}` : 'sdi__section';

  return (
    <div className={cls}>
      <button className="sdi__section-toggle" onClick={() => setOpen(!open)}>
        <div className="sdi__section-header">
          {IconComp && <IconComp size={15} />}
          <span>{label}</span>
        </div>
        {open ? <ChevronUp size={14} className="sdi__section-chevron" /> : <ChevronDown size={14} className="sdi__section-chevron" />}
      </button>
      {open && <div className="sdi__section-body">{children}</div>}
    </div>
  );
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  introduction: 'Introducción', theory: 'Teoría', theory_practice: 'Teoría + Práctica',
  practice: 'Práctica', deepening: 'Profundización', review: 'Repaso',
};

const SubjectDayInsight: React.FC<SubjectDayInsightProps> = ({ breakdown, compact = false }) => {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const ps = breakdown.plan_session;
  const upe = breakdown.upcoming_plan_exam;

  const hasAlerts = breakdown.student_alerts && breakdown.student_alerts.length > 0;
  const hasHighlights = breakdown.positive_highlights && breakdown.positive_highlights.length > 0;
  const hasTopics = breakdown.topics_to_cover && breakdown.topics_to_cover.length > 0;
  const hasSuggestions = breakdown.suggestions && breakdown.suggestions.length > 0;
  const hasWeakPoints = breakdown.class_weak_points && breakdown.class_weak_points.length > 0;
  const hasTalkingPoints = breakdown.talking_points && breakdown.talking_points.length > 0;
  const hasGradeAlerts = breakdown.grade_alerts && breakdown.grade_alerts.length > 0;
  const hasRecentComments = breakdown.recent_comments && breakdown.recent_comments.length > 0;

  const hasContent = hasAlerts || hasHighlights || hasTopics || hasSuggestions || hasWeakPoints || hasTalkingPoints || hasGradeAlerts || hasRecentComments || ps || upe;
  if (!hasContent) return null;

  return (
    <div className={`sdi ${compact ? 'sdi--compact' : ''}`}>
      <button className="sdi__header" onClick={() => setExpanded(!expanded)}>
        <div className="sdi__header-left">
          <div className="sdi__icon">
            <Sparkles size={compact ? 15 : 18} className="text-white" />
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
                  <><MapPin size={11} className="sdi__subtitle-icon inline" />{breakdown.aula}</>
                )}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="sdi__chevron" /> : <ChevronDown size={18} className="sdi__chevron" />}
      </button>

      {expanded && (
        <div className="sdi__body">
          {/* Plan session — today's planned class */}
          {ps && (
            <div className="sdi__plan-session">
              <div className="sdi__plan-session-header">
                <Calendar size={16} />
                <span className="sdi__plan-session-topic">{ps.topic_name}</span>
                <span className="sdi__plan-session-type">{SESSION_TYPE_LABELS[ps.session_type] || ps.session_type}</span>
              </div>
              {ps.session_title && <div className="sdi__plan-session-title">{ps.session_title}</div>}
              {ps.focus && <div className="sdi__plan-session-focus">{ps.focus}</div>}
              {ps.key_points && ps.key_points.length > 0 && (
                <div className="sdi__plan-session-tags">
                  {ps.key_points.map((kp, i) => <span key={i} className="sdi__plan-tag">{kp}</span>)}
                </div>
              )}
              {ps.topic_pdf_url && (
                <button className="sdi__action-btn" onClick={() => window.open(`${import.meta.env.VITE_API_URL || ''}/files${ps.topic_pdf_url}`, '_blank')}>
                  <BookOpen size={14} /> Ver material
                </button>
              )}
            </div>
          )}

          {/* Upcoming plan exam */}
          {upe && (
            <div className="sdi__upcoming-exam">
              <div className="sdi__upcoming-exam-header">
                <AlertCircle size={16} />
                <span>{upe.name}</span>
                <span className="sdi__upcoming-exam-days">en {upe.days_until} {upe.days_until === 1 ? 'día' : 'días'}</span>
              </div>
              <div className="sdi__upcoming-exam-topics">{upe.topic_names.join(', ')}</div>
              <div className="sdi__upcoming-exam-actions">
                <button className="sdi__action-btn" onClick={() => {
                  // Navigate to exam creation with pre-selected topics
                  // We'd need topic IDs — for now navigate to the exams list
                  if (breakdown.class_id && breakdown.subject_id) {
                    navigate(`/tabs/classes/${breakdown.class_id}/subjects/${breakdown.subject_id}/exams/new?name=${encodeURIComponent(upe.name)}&date=${upe.date}`);
                  }
                }}>
                  <Pencil size={14} /> Crear examen con IA
                </button>
              </div>
            </div>
          )}

          {/* Topics to cover — open by default */}
          {hasTopics && (
            <Section icon={Lightbulb} label="Temas a reforzar">
              <ul className="sdi__list">
                {breakdown.topics_to_cover!.map((topic, i) => (
                  <li key={i}>{topic}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Student alerts */}
          {hasAlerts && (
            <Section icon={AlertCircle} label="Alumnos que atender" variant="alert">
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
            <Section icon={AlertCircle} label="Alertas de rendimiento" variant="grade-alert">
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
                        alert.trend === 'improving'
                          ? <TrendingUp size={14} className="sdi__trend-icon sdi__trend-icon--improving" />
                          : <TrendingDown size={14} className="sdi__trend-icon sdi__trend-icon--declining" />
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
            <Section icon={Trophy} label="Destacados" variant="positive">
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
            <Section icon={MessageCircle} label="Comentarios recientes">
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
