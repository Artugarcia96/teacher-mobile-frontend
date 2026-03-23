import { useLocation, useHistory } from 'react-router-dom';
import { IonMenu, IonContent, IonIcon, IonBadge } from '@ionic/react';
import { calendarOutline, schoolOutline } from 'ionicons/icons';
import { useDashboardStore } from '../store/dashboardStore';
import SepiaLogo from './SepiaLogo';
import './SideMenu.css';

const NAV_ITEMS = [
  { label: 'Calendario', icon: calendarOutline, href: '/tabs/calendar', tab: 'calendar' },
  { label: 'Clases', icon: schoolOutline, href: '/tabs/classes', tab: 'classes' },
];

const SideMenu: React.FC = () => {
  const location = useLocation();
  const history = useHistory();
  const pendingCount = useDashboardStore((s) => s.data?.stats?.pendingCorrectionsCount ?? 0);

  const isActive = (href: string) => location.pathname.startsWith(href);
  const isLoginPage = location.pathname === '/login';

  return (
    <IonMenu contentId="main" type="overlay" className="side-menu" disabled={isLoginPage}>
      <IonContent>
        <div className="side-menu__brand">
          <SepiaLogo size={36} showText variant="colored" />
        </div>

        <nav className="side-menu__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.tab}
              className={`side-menu__item ${isActive(item.href) ? 'side-menu__item--active' : ''}`}
              onClick={() => history.push(item.href)}
            >
              <IonIcon icon={item.icon} className="side-menu__icon" />
              <span className="side-menu__label">{item.label}</span>
              {item.tab === 'calendar' && pendingCount > 0 && (
                <IonBadge color="danger" className="side-menu__badge">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </IonBadge>
              )}
            </button>
          ))}
        </nav>
      </IonContent>
    </IonMenu>
  );
};

export default SideMenu;
