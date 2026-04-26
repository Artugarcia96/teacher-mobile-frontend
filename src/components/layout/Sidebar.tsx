import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTallerStore } from '../../store/tallerStore';
import SepiaLogo from '../SepiaLogo';
import { NAV_ITEMS } from './navItems';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingCount = useDashboardStore((s) => s.data?.stats?.pendingCorrectionsCount ?? 0);
  const openTaller = useTallerStore((s) => s.openTaller);

  const isActive = (href: string) => location.pathname.startsWith(href);
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) return null;

  return (
    <aside className="hidden lg:flex flex-col w-[260px] border-r border-border bg-card shrink-0">
      <div className="px-5 py-6 border-b border-border">
        <SepiaLogo size={36} showText variant="colored" />
      </div>

      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => openTaller({ limitTo: 'content', defaultType: 'presentation' })}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Sparkles size={16} />
          Crear material
        </button>
      </div>

      <nav className="flex flex-col gap-1 p-3" aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <button
              key={item.tab}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border-none text-[0.9375rem] font-medium cursor-pointer w-full text-left transition-colors ${
                active
                  ? 'bg-primary/15 text-primary font-semibold border-l-[3px] border-l-primary'
                  : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              onClick={() => navigate(item.href)}
            >
              <Icon size={22} className="shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.tab === 'calendar' && pendingCount > 0 && (
                <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-danger text-white font-semibold">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
