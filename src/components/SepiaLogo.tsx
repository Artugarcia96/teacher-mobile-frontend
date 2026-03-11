import SepiaIcon from './SepiaIcon';

interface SepiaLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  variant?: 'default' | 'white' | 'colored';
  responsive?: boolean;
}

const SepiaLogo: React.FC<SepiaLogoProps> = ({ 
  size = 56, 
  className = '', 
  showText = false, 
  variant = 'default',
  responsive = true 
}) => {
  return (
    <div className={`sepia-logo ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <SepiaIcon size={size} variant={variant} responsive={responsive} />
      {showText && (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{
            fontSize: size * 0.45,
            fontWeight: 700,
            color: variant === 'white' ? '#ffffff' : '#15665E',
            letterSpacing: '-0.02em'
          }}>
            SEPIA
          </span>
          <span style={{
            fontSize: size * 0.22,
            fontWeight: 500,
            color: variant === 'white' ? 'rgba(255, 255, 255, 0.7)' : '#64748B',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            Education
          </span>
        </div>
      )}
    </div>
  );
};

export default SepiaLogo;
