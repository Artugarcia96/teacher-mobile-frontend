import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: number;
  className?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ size = 24, className }) => {
  return <Loader2 size={size} className={cn('animate-spin text-primary', className)} />;
};

export default Spinner;
