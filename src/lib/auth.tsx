import { useQueryClient } from '@tanstack/react-query';
import { createContext, startTransition, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, type Path } from 'react-router-dom';
import type { Me, Teacher } from '../api/types';
import { useMe } from '../api/core';
import { api, setUnauthorizedHandler, tokens, type Tokens } from './api';

interface AuthCtx {
  me: Me | undefined;
  loggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(() => !!tokens.get());
  const meQuery = useMe(loggedIn);

  // `from`: the screen the session expired on, to go back to it after signing in again.
  const signOut = useCallback((from?: Partial<Path>) => {
    tokens.set(null);
    qc.clear();
    navigate('/entrar', { replace: true, state: from ? { from } : undefined });
    // In the router's own transition: no screen renders signed out on its way to /entrar (RequireAuth would take it
    // as the one to come back to).
    startTransition(() => setLoggedIn(false));
  }, [qc, navigate]);
  const logout = useCallback(() => signOut(), [signOut]);

  useEffect(() => setUnauthorizedHandler(() => {
    const { pathname, search, hash } = window.location;
    // Several requests fail at once: the first one has already gone to /entrar with the screen to come back to.
    if (pathname !== '/entrar') signOut({ pathname, search, hash });
  }), [signOut]);

  const accept = (t: Tokens & { teacher: Teacher }) => {
    tokens.set(t);
    qc.clear();
    setLoggedIn(true);
  };

  const login = async (email: string, password: string) => accept(await api.post('/auth/login', { email, password }));
  const register = async (name: string, email: string, password: string) => accept(await api.post('/auth/register', { name, email, password }));

  return <Ctx.Provider value={{ me: meQuery.data, loggedIn, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}

/** After signing in: the screen that was asked for without a session (RequireAuth) or where the session expired, if
 *  it is one of the app's own; otherwise Hoy. */
export function returnPath(state: unknown): string {
  const from = (state as { from?: Partial<Path> } | null)?.from;
  const pathname = from?.pathname ?? '';
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname === '/entrar') return '/hoy';
  return `${pathname}${from?.search ?? ''}${from?.hash ?? ''}`;
}

/** Server "today" (Europe/Madrid, can be frozen for demos). Falls back to the device date. */
export function useToday(): string {
  const { me } = useAuth();
  if (me?.today) return me.today;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
