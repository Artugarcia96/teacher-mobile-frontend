import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn } from '@/lib/utils';

/** CSS puro para ocultar un elemento visualmente pero dejarlo accesible a
 *  lectores de pantalla — equivalente a @radix-ui/react-visually-hidden sin
 *  añadir una dependencia nueva. Radix exige un DialogTitle presente aunque
 *  visualmente no lo queramos; esto nos deja cumplir sin ruido visual. */
const SR_ONLY_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

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
  /** Desktop dialog size preset (max-width). */
  dialogSize?: 'md' | 'lg' | 'xl';
  /** Strip the default p-6 padding on the DialogContent so the child can own its own padding. */
  flush?: boolean;
}

const SHEET_HEIGHTS = {
  sm: 'h-[40vh]',
  md: 'h-[60vh]',
  lg: 'h-[85vh]',
  full: 'h-[95vh]',
};

const DIALOG_SIZES = {
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-3xl',
  xl: 'sm:max-w-4xl',
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
  dialogSize = 'md',
  flush = false,
}) => {
  const isDesktop = useIsDesktop();
  const useDialog = mode === 'dialog' || (mode === undefined && isDesktop);

  if (useDialog) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent
          className={cn(
            'max-h-[85vh]',
            flush
              ? 'overflow-hidden flex flex-col gap-0 p-0'
              : 'overflow-y-auto',
            DIALOG_SIZES[dialogSize],
            className
          )}
        >
          {title ? (
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
          ) : (
            // Radix requiere SIEMPRE un DialogTitle para accesibilidad. Si el
            // caller no da uno, lo ponemos visualmente oculto — cumple con
            // los lectores de pantalla y elimina el warning de consola.
            <DialogHeader style={SR_ONLY_STYLE}>
              <DialogTitle>Ventana de diálogo</DialogTitle>
              <DialogDescription>Modal content</DialogDescription>
            </DialogHeader>
          )}
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className={cn('rounded-t-2xl', flush && 'gap-0', SHEET_HEIGHTS[sheetHeight], className)}
      >
        {title ? (
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
        ) : (
          <SheetHeader style={SR_ONLY_STYLE}>
            <SheetTitle>Ventana de diálogo</SheetTitle>
            <SheetDescription>Modal content</SheetDescription>
          </SheetHeader>
        )}
        <div
          className={
            flush
              ? 'overflow-hidden flex-1 min-h-0 flex flex-col'
              : 'overflow-y-auto flex-1'
          }
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default Modal;
