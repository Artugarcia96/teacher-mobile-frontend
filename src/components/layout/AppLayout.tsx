import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';

const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col pb-16 lg:pb-0">
        <Outlet />
      </main>
      <MobileTabBar />
    </div>
  );
};

export default AppLayout;
