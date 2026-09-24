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

async function request<T>(method: string, path: string, body?: Body, retry = true): Promise<T> {
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
    r = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Sin conexión con el servidor. Revisa tu conexión.');
  }
  if (r.status === 401 && retry && t && !path.startsWith('/auth/')) {
    if (await refresh()) return request<T>(method, path, body, false);
    tokens.set(null);
    onUnauthorized();
  }
  if (!r.ok) throw await toError(r);
  if (r.status === 204) return undefined as T;
  const ct = r.headers.get('content-type') || '';
  return (ct.includes('application/json') ? r.json() : r.blob()) as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: Body) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: Body) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Absolute URL for signed file links returned by the API (`*_url` fields). */
export function fileUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${BASE}${url}`;
}

/** Authenticated download of an API path (CSV, PDF generated on the fly). */
export async function download(path: string, filename: string) {
  const blob = await request<Blob>('GET', path);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
