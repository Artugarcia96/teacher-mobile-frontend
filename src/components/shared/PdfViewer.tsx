import { useState, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './PdfViewer.css';

// Worker is bundled locally — nginx must serve .mjs with application/javascript MIME type
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfViewerProps {
  /** Blob URL, object URL, or remote URL to the PDF */
  url: string;
  onClose?: () => void;
  /** Title shown in the toolbar */
  title?: string;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const PdfViewer: React.FC<PdfViewerProps> = ({ url, onClose, title = 'Vista previa' }) => {
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setError(true);
    setLoading(false);
  }, []);

  const handleZoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(zoom);
    if (idx < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[idx + 1]);
  };

  const handleZoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(zoom);
    if (idx > 0) setZoom(ZOOM_LEVELS[idx - 1]);
  };

  const pageWidth = containerRef.current
    ? (containerRef.current.clientWidth - 32) * zoom
    : 360 * zoom;

  // Fallback: if react-pdf fails (worker issue, etc), show iframe
  if (error) {
    return (
      <div className="pdf-viewer" ref={containerRef}>
        <div className="pdf-viewer__toolbar">
          <span className="pdf-viewer__title">{title}</span>
          <div className="pdf-viewer__controls" />
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="pdf-viewer__btn">
              <X size={18} />
            </Button>
          )}
        </div>
        <iframe
          src={url}
          title={title}
          style={{ flex: 1, width: '100%', border: 'none', background: 'white' }}
        />
      </div>
    );
  }

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {/* Toolbar */}
      <div className="pdf-viewer__toolbar">
        <span className="pdf-viewer__title">{title}</span>
        <div className="pdf-viewer__controls">
          <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={zoom <= ZOOM_LEVELS[0]} className="pdf-viewer__btn">
            <ZoomOut size={16} />
          </Button>
          <span className="pdf-viewer__zoom">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} className="pdf-viewer__btn">
            <ZoomIn size={16} />
          </Button>
          {numPages > 0 && (
            <span className="pdf-viewer__page-info">{numPages} pág.</span>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose} className="pdf-viewer__btn">
            <X size={18} />
          </Button>
        )}
      </div>

      {/* Pages */}
      <div className="pdf-viewer__pages">
        {loading && (
          <div className="pdf-viewer__loading">
            <div className="pdf-viewer__spinner" />
            <span>Cargando documento...</span>
          </div>
        )}
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
          error={null}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i} className="pdf-viewer__page-wrapper">
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                className="pdf-viewer__page"
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
              <span className="pdf-viewer__page-number">{i + 1} / {numPages}</span>
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
};

export default PdfViewer;
