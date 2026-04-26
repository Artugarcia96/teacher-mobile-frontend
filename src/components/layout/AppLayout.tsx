import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';
import TallerDialog from '../TallerDialog';
import CreateMaterialFab from '../CreateMaterialFab';
import { useTallerStore } from '../../store/tallerStore';

const AppLayout: React.FC = () => {
  const tallerOpen = useTallerStore((s) => s.open);
  const closeTaller = useTallerStore((s) => s.closeTaller);
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col pb-16 lg:pb-0">
        <Outlet />
      </main>
      <CreateMaterialFab />
      <MobileTabBar />
      <TallerDialog open={tallerOpen} onClose={closeTaller} />
    </div>
  );
};

export default AppLayout;
