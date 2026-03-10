import './SepiaIcon.css';

/**
 * SEPIA Education app icon: your squid.svg with brand colors.
 * Used as favicon, app icon, and brand mark (header, login).
 */
interface SepiaIconProps {
  size?: number;
  className?: string;
  variant?: 'default' | 'white';
  responsive?: boolean;
}

const SepiaIcon: React.FC<SepiaIconProps> = ({ 
  size = 48, 
  className = '', 
  variant = 'default',
  responsive = true 
}) => {
  const iconSrc = variant === 'white' ? '/squid-white-no-hex.svg' : '/squid_no_hex.svg';
  
  const classes = [
    'sepia-icon',
    responsive && 'sepia-icon--responsive',
    className
  ].filter(Boolean).join(' ');
  
  return (
    <img
      src={iconSrc}
      alt=""
      width={size}
      height={size}
      className={classes}
      aria-hidden
    />
  );
};

export default SepiaIcon;
