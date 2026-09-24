import { Books, CheckSquareOffset, GearSix, SunHorizon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCourses } from '../api/core';
import { useInboxCount } from '../api/inbox';
import { useAuth } from '../lib/auth';
import { Avatar, Dot } from '../ui';
import './shell.css';

const NAV = [
  { to: '/hoy', label: 'Hoy', icon: SunHorizon },
  { to: '/clases', label: 'Clases', icon: Books },
  { to: '/evaluar', label: 'Evaluar', icon: CheckSquareOffset },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

function Badge({ n }: { n: number }) {
  return n > 0 ? <span className="nav-badge num">{n > 99 ? '99+' : n}</span> : null;
}

/** App frame: glass sidebar on desktop, floating glass tab capsule on phones. */
export function Shell() {
  const { me } = useAuth();
  const courses = useCourses();
  const inbox = useInboxCount();
  const { pathname } = useLocation();
  const focusMode = /\/revisar$/.test(pathname);

  return (
    <div className={`shell${focusMode ? ' shell--focus' : ''}`}>
      <div className="ambient" />
      <aside className="sidebar glass" aria-label="Navegación">
        <div className="brand">
          <img src="/squid.svg" alt="" width={28} height={28} />
          <span className="display">Sepia</span>
        </div>
        <nav className="sidebar__nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="side-link">
              {({ isActive }) => (
                <>
                  <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                  <span>{label}</span>
                  {to === '/evaluar' && <Badge n={inbox} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {!!courses.data?.length && (
          <div className="sidebar__classes">
            <div className="sidebar__label">Mis clases</div>
            {courses.data.map((c) => (
              <NavLink key={c.id} to={`/clases/${c.id}`} className="side-class">
                <Dot color={c.color} />
                <span>{c.subject} · {c.group.name}</span>
              </NavLink>
            ))}
          </div>
        )}
        <NavLink to="/ajustes" className="side-me">
          <Avatar initials={initials(me?.teacher.name ?? '')} />
          <div className="side-me__text">
            <div className="side-me__name">{me?.teacher.name}</div>
            <div className="side-me__school">{me?.teacher.school || 'Ajustes'}</div>
          </div>
          <GearSix size={18} className="faint" />
        </NavLink>
      </aside>
      <main className="shell__main">
        <Outlet />
      </main>
      <nav className="tabcap glass" aria-label="Navegación">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="tabcap__item">
            {({ isActive }) => (
              <>
                <span className="tabcap__icon">
                  <Icon size={23} weight={isActive ? 'fill' : 'regular'} />
                  {to === '/evaluar' && <Badge n={inbox} />}
                </span>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Full-screen centered layout for login / errors. */
export function Bare({ children }: { children: ReactNode }) {
  return (
    <div className="bare">
      <div className="ambient" />
      {children}
    </div>
  );
}
