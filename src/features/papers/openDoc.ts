import { fileUrl } from '../../lib/api';

/** Open a signed file URL that is fetched asynchronously, without the popup blocker eating it. */
export async function openSigned(get: () => Promise<{ url: string; notice?: string | null }>, onError: (msg: string) => void,
  onNotice?: (msg: string) => void) {
  const win = window.open('', '_blank');
  try {
    const { url, notice } = await get();
    const abs = fileUrl(url)!;
    if (notice) onNotice?.(notice);
    if (win) win.location.href = abs;
    else window.location.assign(abs);
  } catch (e) {
    win?.close();
    onError(e instanceof Error ? e.message : 'No se ha podido abrir el documento.');
  }
}
