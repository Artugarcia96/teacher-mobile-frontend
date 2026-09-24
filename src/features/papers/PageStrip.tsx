import type { ScanPage } from '../../api/papers';
import { fileUrl } from '../../lib/api';
import { pageCaption, pageTag } from './pageLabels';

/** Compact row of page thumbnails ("1", "2", "extra"); tapping one opens it. */
export function PageStrip({ pages, onOpen, label }: { pages: ScanPage[]; onOpen: (index: number) => void; label: string }) {
  return (
    <div className="page-strip" role="list" aria-label={label}>
      {pages.map((p, i) => (
        <button key={p.thumb_url.split('?')[0]} type="button" role="listitem" onClick={() => onOpen(i)}
          className={`page-thumb${p.kind === 'extra_sheet' ? ' page-thumb--extra' : ''}`} aria-label={`Ver ${pageCaption(p)}`}>
          <img src={fileUrl(p.thumb_url)} alt="" loading="lazy" />
          {pageTag(p) && <span className="page-thumb__tag num">{pageTag(p)}</span>}
        </button>
      ))}
    </div>
  );
}
