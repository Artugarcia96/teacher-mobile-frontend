import { Books, CheckSquareOffset, GearSix, MagnifyingGlass, SunHorizon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useCourses } from '../api/core';
import { useInboxCount } from '../api/inbox';
import { JobWatcher } from '../features/materials/watch';
import { SearchSheet } from '../features/students/StudentSearch';
import { useAuth } from '../lib/auth';
import { courseLabel, courseShortLabel } from '../lib/format';
import { Avatar, Dot, Logo } from '../ui';
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

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** "/" (outside text fields) or Ctrl/⌘+K opens the search sheet from anywhere. */
function useSearchShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never on top of another sheet: one Esc would close both, and the one below may hold unsaved edits.
      if (document.querySelector('[role="dialog"]')) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const ctrlK = (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey);
      const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (ctrlK || slash) { e.preventDefault(); open(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
}

/** App frame: glass sidebar on desktop, floating glass tab capsule on phones. */
export function Shell() {
  const { me } = useAuth();
  const courses = useCourses();
  const inbox = useInboxCount();
  const { pathname } = useLocation();
  const focusMode = /\/revisar$/.test(pathname);
  const [searching, setSearching] = useState(false);
  const openSearch = useCallback(() => setSearching(true), []);
  useSearchShortcut(openSearch);

  return (
    <div className={`shell${focusMode ? ' shell--focus' : ''}`}>
      <div className="ambient" />
      <JobWatcher />
      <aside className="sidebar glass" aria-label="Navegación">
        <div className="brand">
          <Logo size={28} />
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
          <button type="button" className="side-link side-search" onClick={openSearch}>
            <MagnifyingGlass size={20} />
            <span>Buscar</span>
            <kbd className="side-search__kbd">{MAC ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
        </nav>
        {!!courses.data?.length && (
          <div className="sidebar__classes">
            <div className="sidebar__label">Mis clases</div>
            {courses.data.map((c) => (
              <NavLink key={c.id} to={`/clases/${c.id}`} className="side-class" title={courseLabel(c)}>
                <Dot color={c.color} />
                <span>{courseShortLabel(c)}</span>
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
      <SearchSheet open={searching} onClose={() => setSearching(false)} />
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
