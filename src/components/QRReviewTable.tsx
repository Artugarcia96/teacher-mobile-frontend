import './QRReviewTable.css';
import { AlertTriangle, CheckCircle, Download, File, Maximize2, Trash2 } from 'lucide-react';
import Spinner from '@/components/shared/Spinner';

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
  onDelete?: (correctionId: string) => void;
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
  onAssign, onPreview, onDownload, onDelete,
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
                  <Spinner size={16} />
                ) : (
                  <File size={18} className="qrt__thumb-icon" />
                )}
                {(thumbUrl || paperUrl) && onPreview && (
                  <div className="qrt__thumb-overlay">
                    <Maximize2 size={18} />
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
                    <span color="success" className="qrt__badge">
                      <CheckCircle size={18} />
                      Auto
                    </span>
                  ) : (
                    <span className="qrt__reason">
                      <AlertTriangle size={18} />
                      {getReasonText(item.reason)}
                    </span>
                  )}
                </div>

                <select
                  value={assigned}
                  onChange={(e) => onAssign(item.correctionId, e.target.value)}
                  className="qrt__select"
                >
                  {students
                    .filter((s) => !assignedStudentIds.has(s.id) || assigned === s.id)
                    .map((s) => (
                      <option key={`${item.correctionId}-${s.id}`} value={s.id}>
                        {s.name} {s.studentId ? `(${s.studentId})` : ''}
                      </option>
                    ))}
                  <option key={`${item.correctionId}-none`} value="">— Sin asignar —</option>
                </select>
              </div>

              {/* Action buttons */}
              <div className="qrt__actions">
                {paperUrl && onDownload && (
                  <button
                    className="qrt__action-btn"
                    onClick={() => onDownload(paperUrl)}
                    title="Descargar"
                    type="button"
                  >
                    <Download size={18} />
                  </button>
                )}
                {onDelete && (
                  <button
                    className="qrt__action-btn qrt__action-btn--danger"
                    onClick={() => onDelete(item.correctionId)}
                    title="Eliminar examen"
                    type="button"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default QRReviewTable;
