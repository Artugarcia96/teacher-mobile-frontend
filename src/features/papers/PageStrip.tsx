import type { ScanPage } from '../../api/papers';
import { fileUrl } from '../../lib/api';
import { pageCaption, pageTag } from './pageLabels';

/** Compact row of page thumbnails ("1", "2", "1 rev.", "extra"); tapping one opens it. */
export function PageStrip({ pages, onOpen, label }: { pages: ScanPage[]; onOpen: (index: number) => void; label: string }) {
  return (
    <ul className="page-strip" aria-label={label}>
      {pages.map((p, i) => (
        <li key={p.id}>
          <button type="button" onClick={() => onOpen(i)} aria-label={`Ver ${pageCaption(p)}`}
            className={`page-thumb${p.kind === 'extra_sheet' && !p.back ? ' page-thumb--extra' : ''}`}>
            <img src={fileUrl(p.thumb_url)} alt="" loading="lazy" />
            {pageTag(p) && <span className="page-thumb__tag num">{pageTag(p)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
