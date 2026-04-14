import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  title?: string;
  backHref?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}

const PageShell: React.FC<PageShellProps> = ({
  title,
  backHref,
  headerActions,
  children,
  className,
  contentClassName,
  noPadding,
}) => {
  const navigate = useNavigate();

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)}>
      {(title || backHref || headerActions) && (
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-6 h-14 bg-card border-b border-border shrink-0">
          {backHref && (
            <button
              onClick={() => navigate(backHref)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent transition-colors -ml-1"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          {title && (
            <h1 className="text-lg font-semibold truncate flex-1">{title}</h1>
          )}
          {headerActions && (
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {headerActions}
            </div>
          )}
        </header>
      )}
      <div className={cn(
        'flex-1 overflow-y-auto',
        !noPadding && 'px-4 lg:px-6 py-4 pb-8',
        contentClassName
      )}>
        {children}
      </div>
    </div>
  );
};

export default PageShell;
