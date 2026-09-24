import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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

  const logout = useCallback(() => {
    tokens.set(null);
    setLoggedIn(false);
    qc.clear();
    navigate('/entrar', { replace: true });
  }, [qc, navigate]);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

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

/** Server "today" (Europe/Madrid, can be frozen for demos). Falls back to the device date. */
export function useToday(): string {
  const { me } = useAuth();
  if (me?.today) return me.today;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
