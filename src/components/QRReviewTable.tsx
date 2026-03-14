import { IonSelect, IonSelectOption, IonBadge, IonIcon, IonSpinner } from '@ionic/react';
import { checkmarkCircle, warningOutline, expandOutline, documentOutline, downloadOutline } from 'ionicons/icons';
import './QRReviewTable.css';

export interface QRReviewItem {
  correctionId: string;
  detectedCode: string | null;
  reason: string;
  isAutoMatched?: boolean;
}

export interface StudentOption {
  id: string;
  name: string;
  studentId?: string;
}

interface Props {
  items: QRReviewItem[];
  /** Label shown for each row (e.g. "Examen", "Ejercicio") */
  itemLabel: string;
  /** Map correctionId -> selected studentId */
  assignments: Record<string, string>;
  /** Available students for each dropdown */
  students: StudentOption[];
  /** Set of already-assigned student IDs to filter out */
  assignedStudentIds: Set<string>;
  /** Map correctionId -> thumbnail URL (image preview) */
  thumbnails?: Record<string, string>;
  /** Map correctionId -> full paper URL */
  paperUrls?: Record<string, string>;
  /** Whether thumbnails are still loading */
  thumbsLoading?: boolean;
  onAssign: (correctionId: string, studentId: string) => void;
  onPreview?: (url: string) => void;
  onDownload?: (url: string) => void;
}

const reasonTexts: Record<string, string> = {
  'no_code': 'Sin código detectado',
  'partial_code': 'Código parcial',
  'no_match': 'Sin coincidencia',
  'duplicate_code': 'Código duplicado',
  'already_assigned': 'Ya asignado',
  'ai_error': 'Error IA',
  'wrong_exercise': 'Otro ejercicio',
  'wrong_class_exercise': 'Otra clase',
  'no_exercise_detected': 'Sin ejercicio',
  'no_qr_found': 'Sin QR',
  'auto_matched': 'Auto detectado',
};

function getReasonText(reason: string): string {
  return reasonTexts[reason] || reason;
}

const QRReviewTable: React.FC<Props> = ({
  items, itemLabel, assignments, students, assignedStudentIds,
  thumbnails, paperUrls, thumbsLoading,
  onAssign, onPreview, onDownload,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="qrt">
      <div className="qrt__header">
        <span className="qrt__header-label">Asignación manual</span>
        <span className="qrt__header-count">{items.length}</span>
      </div>

      <div className="qrt__list">
        {items.map((item, idx) => {
          const thumbUrl = thumbnails?.[item.correctionId];
          const paperUrl = paperUrls?.[item.correctionId];
          const isImage = paperUrl && /\.(png|jpg|jpeg|webp)$/i.test(paperUrl);
          const assigned = assignments[item.correctionId] || '';

          return (
            <div
              key={item.correctionId}
              className={`qrt__row ${item.isAutoMatched ? 'qrt__row--auto' : ''} ${assigned ? 'qrt__row--assigned' : ''}`}
            >
              {/* Thumbnail / doc icon */}
              <div
                className="qrt__thumb"
                onClick={() => {
                  const url = thumbUrl || paperUrl;
                  if (url && onPreview) onPreview(url);
                }}
              >
                {thumbUrl || (isImage && paperUrl) ? (
                  <img src={thumbUrl || paperUrl} alt={`${itemLabel} ${idx + 1}`} />
                ) : thumbsLoading ? (
                  <IonSpinner name="crescent" className="qrt__thumb-spinner" />
                ) : (
                  <IonIcon icon={documentOutline} className="qrt__thumb-icon" />
                )}
                {(thumbUrl || paperUrl) && onPreview && (
                  <div className="qrt__thumb-overlay">
                    <IonIcon icon={expandOutline} />
                  </div>
                )}
              </div>

              {/* Info column */}
              <div className="qrt__info">
                <div className="qrt__meta">
                  <span className="qrt__index">{itemLabel} {idx + 1}</span>
                  {item.detectedCode && (
                    <span className="qrt__code">{item.detectedCode}</span>
                  )}
                  {item.isAutoMatched ? (
                    <IonBadge color="success" className="qrt__badge">
                      <IonIcon icon={checkmarkCircle} />
                      Auto
                    </IonBadge>
                  ) : (
                    <span className="qrt__reason">
                      <IonIcon icon={warningOutline} />
                      {getReasonText(item.reason)}
                    </span>
                  )}
                </div>

                <IonSelect
                  interface="popover"
                  placeholder="Seleccionar alumno"
                  value={assigned}
                  onIonChange={(e) => onAssign(item.correctionId, e.detail.value)}
                  className="qrt__select"
                >
                  {students
                    .filter((s) => !assignedStudentIds.has(s.id) || assigned === s.id)
                    .map((s) => (
                      <IonSelectOption key={`${item.correctionId}-${s.id}`} value={s.id}>
                        {s.name} {s.studentId ? `(${s.studentId})` : ''}
                      </IonSelectOption>
                    ))}
                  <IonSelectOption key={`${item.correctionId}-none`} value="">— Sin asignar —</IonSelectOption>
                </IonSelect>
              </div>

              {/* Download button */}
              {paperUrl && onDownload && (
                <button
                  className="qrt__download"
                  onClick={() => onDownload(paperUrl)}
                  title="Descargar"
                  type="button"
                >
                  <IonIcon icon={downloadOutline} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QRReviewTable;
