/** Tiny typed fetch client for the Sepia API (/api/...). Handles auth, token refresh and Spanish errors. */

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKENS_KEY = 'sepia.tokens';

export interface Tokens { access_token: string; refresh_token: string }

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const tokens = {
  get(): Tokens | null {
    try {
      const raw = localStorage.getItem(TOKENS_KEY);
      return raw ? (JSON.parse(raw) as Tokens) : null;
    } catch {
      return null;
    }
  },
  set(t: Tokens | null) {
    try {
      if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token }));
      else localStorage.removeItem(TOKENS_KEY);
    } catch { /* private mode */ }
  },
};

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const t = tokens.get();
  if (!t) return false;
  refreshing ??= fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: t.refresh_token }),
  }).then(async (r) => {
    if (!r.ok) return false;
    tokens.set(await r.json());
    return true;
  }).catch(() => false).finally(() => { refreshing = null; });
  return refreshing;
}

let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

async function toError(r: Response): Promise<ApiError> {
  let message = 'Algo ha fallado. Inténtalo de nuevo.';
  let code: string | undefined;
  try {
    const body = await r.json();
    const d = body?.detail;
    if (typeof d === 'string') message = d;
    else if (d?.message) { message = d.message; code = d.code; }
  } catch { /* not json */ }
  if (r.status >= 500 && r.status !== 503) message = 'El servidor ha fallado. Inténtalo en un momento.';
  return new ApiError(r.status, message, code);
}

type Body = unknown;

/** A JSON request that gets no answer in this time fails instead of spinning forever (school Wi-Fi). */
const TIMEOUT_MS = 20_000;

/** `slow`: the server works while the teacher waits (AI answers, PDFs rendered on the fly), so no timeout. */
export interface RequestOptions { slow?: boolean }

/** Authenticated fetch with token refresh; throws ApiError (Spanish message) on failure.
 *  `timeout` (ms) aborts a request that gets no answer. */
async function send(method: string, path: string, body?: Body, timeout?: number, retry = true): Promise<Response> {
  const headers: Record<string, string> = {};
  const t = tokens.get();
  if (t) headers.Authorization = `Bearer ${t.access_token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let r: Response;
  try {
    r = await fetch(`${BASE}/api${path}`, { method, headers, body: payload, signal: timeout ? AbortSignal.timeout(timeout) : undefined });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError') throw new ApiError(0, 'El servidor no responde. Revisa la conexión y vuelve a intentarlo.', 'timeout');
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu conexión.');
  }
  if (r.status === 401 && retry && t && !path.startsWith('/auth/')) {
    if (await refresh()) return send(method, path, body, timeout, false);
    tokens.set(null);
    onUnauthorized();
  }
  if (!r.ok) throw await toError(r);
  return r;
}

async function request<T>(method: string, path: string, body?: Body, opts?: RequestOptions): Promise<T> {
  const r = await send(method, path, body, opts?.slow || body instanceof FormData ? undefined : TIMEOUT_MS);
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get('content-type') || '';
  return (ct.includes('application/json') ? r.json() : r.blob()) as Promise<T>;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T>(path: string, body?: Body, opts?: RequestOptions) => request<T>('POST', path, body ?? {}, opts),
  put: <T>(path: string, body?: Body) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: Body, opts?: RequestOptions) => request<T>('PATCH', path, body ?? {}, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
  /** Fire-and-forget JSON request that outlives the page (leaving a sheet or the tab mid-save): no refresh, no errors. */
  keepalive: (method: 'PUT' | 'POST', path: string, body: Body) => {
    const t = tokens.get();
    void fetch(`${BASE}/api${path}`, {
      method, keepalive: true, body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t.access_token}` } : {}) },
    }).catch(() => {});
  },
};

/** POST a FormData reporting upload progress (0-1). fetch cannot report it, so this one uses XMLHttpRequest;
 *  same auth, refresh and Spanish errors as `api.upload`. */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (fraction: number) => void, retry = true): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api${path}`);
    const t = tokens.get();
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t.access_token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && e.total) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(new ApiError(0, 'Sin conexión con el servidor. Revisa tu conexión.'));
    xhr.onload = async () => {
      if (xhr.status === 401 && retry && t) {
        if (await refresh()) { uploadWithProgress<T>(path, form, onProgress, false).then(resolve, reject); return; }
        tokens.set(null);
        onUnauthorized();
      }
      const response = new Response(xhr.responseText || null, {
        status: xhr.status, headers: { 'content-type': xhr.getResponseHeader('content-type') ?? '' },
      });
      if (!response.ok) { reject(await toError(response)); return; }
      try { resolve(JSON.parse(xhr.responseText) as T); } catch { resolve(undefined as T); }
    };
    xhr.send(form);
  });
}

/** Absolute URL for signed file links returned by the API (`*_url` fields). */
export function fileUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${BASE}${url}`;
}

/** ASCII-only file name (what the server sends too): "Acta · Física 3º ESO 1.ª" → "Acta - Fisica 3o ESO 1a". */
function asciiName(name: string): string {
  return name.replace(/·/g, '-').replace(/\.?º/g, 'o').replace(/\.?ª/g, 'a')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._()-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'descarga';
}

/** File name from Content-Disposition (RFC 6266: filename* first, then filename). */
function dispositionName(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try { return decodeURIComponent(star[1].trim()); } catch { /* malformed: use filename */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Authenticated download of an API path (CSV, PDF generated on the fly). The name comes from the server
 * (ASCII-safe); `fallback` is used only if the header is missing. Resolves once the browser has the file. */
export async function download(path: string, fallback: string): Promise<string> {
  const r = await send('GET', path);
  const blob = await r.blob();
  const name = asciiName(dispositionName(r.headers.get('content-disposition')) ?? fallback);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return name;
}
