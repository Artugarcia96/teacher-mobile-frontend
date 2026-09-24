import { fileUrl } from '../../lib/api';

/** Open a signed file URL that is fetched asynchronously, without the popup blocker eating it. */
export async function openSigned(get: () => Promise<{ url: string }>, onError: (msg: string) => void) {
  const win = window.open('', '_blank');
  try {
    const { url } = await get();
    const abs = fileUrl(url)!;
    if (win) win.location.href = abs;
    else window.location.assign(abs);
  } catch (e) {
    win?.close();
    onError(e instanceof Error ? e.message : 'No se ha podido abrir el documento.');
  }
}
