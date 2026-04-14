import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Force a specific mode regardless of screen size */
  mode?: 'dialog' | 'sheet';
  /** Sheet height on mobile: 'sm' (40%), 'md' (60%), 'lg' (85%), 'full' (95%) */
  sheetHeight?: 'sm' | 'md' | 'lg' | 'full';
}

const SHEET_HEIGHTS = {
  sm: 'h-[40vh]',
  md: 'h-[60vh]',
  lg: 'h-[85vh]',
  full: 'h-[95vh]',
};

const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  className,
  mode,
  sheetHeight = 'lg',
}) => {
  const isDesktop = useIsDesktop();
  const useDialog = mode === 'dialog' || (mode === undefined && isDesktop);

  if (useDialog) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className={cn('max-w-2xl max-h-[85vh] overflow-y-auto', className)}>
          {title && (
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
          )}
          {!title && <DialogDescription className="sr-only">Modal content</DialogDescription>}
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className={cn('rounded-t-2xl', SHEET_HEIGHTS[sheetHeight], className)}>
        {title && (
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        )}
        {!title && <SheetDescription className="sr-only">Modal content</SheetDescription>}
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default Modal;
