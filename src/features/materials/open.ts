import { useNavigate } from 'react-router-dom';
import type { MaterialKind } from '../../api/units';
import { api, fileUrl } from '../../lib/api';
import { useFeedback } from '../../ui';
import { openSigned } from '../papers/openDoc';

type Openable = { id: string; kind: MaterialKind; unit_id: string | null };

/** Open a material: files and links in a new tab (signed URL), Sepia's own materials in their page.
 *  `present` opens slides straight in presentation mode (MaterialPage handles ?presentar=1). */
export function useOpenMaterial() {
  const navigate = useNavigate();
  const { toast } = useFeedback();
  return (m: Openable, courseId: string, opts?: { present?: boolean }) => {
    if (m.kind === 'upload' || m.kind === 'link' || !m.unit_id) {
      void openSigned(() => api.get<{ url: string }>(`/materials/${m.id}/file`), (msg) => toast(msg, { tone: 'error' }));
      return;
    }
    const q = opts?.present && m.kind === 'slides' ? '?presentar=1' : '';
    navigate(`/clases/${courseId}/unidades/${m.unit_id}/materiales/${m.id}${q}`);
  };
}

/** Origin students use to reach the API (the app's own origin, or VITE_API_URL in the native app). */
export function publicOrigin(): string {
  return new URL(fileUrl('/') ?? '/', window.location.href).origin;
}

/** "sepia.es/api/s/Ab3dE…" — the URL without protocol, to read aloud or type. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
