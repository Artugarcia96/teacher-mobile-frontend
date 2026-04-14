import { useLocation, useNavigate } from 'react-router-dom';
import { useDashboardStore } from '../../store/dashboardStore';
import { NAV_ITEMS, HIDDEN_TAB_BAR_ROUTES } from './navItems';

const MobileTabBar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingCount = useDashboardStore((s) => s.data?.stats?.pendingCorrectionsCount ?? 0);

  const isActive = (href: string) => location.pathname.startsWith(href);

  // Hide on login and standalone correction pages
  const shouldHide = HIDDEN_TAB_BAR_ROUTES.some((route) => location.pathname.startsWith(route));
  if (shouldHide) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-card safe-area-bottom"
      aria-label="Navegación principal"
    >
      {NAV_ITEMS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        return (
          <button
            key={tab.href}
            aria-label={tab.label}
            aria-current={active ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 border-none bg-transparent cursor-pointer transition-colors relative ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
            onClick={() => navigate(tab.href)}
          >
            {/* Active indicator bar */}
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
            )}
            <span className="relative">
              <Icon size={24} />
              {tab.href === '/tabs/calendar' && pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 text-[10px] min-w-[16px] h-4 flex items-center justify-center px-1 rounded-full bg-danger text-white font-bold">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default MobileTabBar;
