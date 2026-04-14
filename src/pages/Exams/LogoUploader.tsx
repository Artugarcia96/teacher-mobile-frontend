import { useRef } from 'react';
import { Upload, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/shared/Spinner';

interface LogoUploaderProps {
  logoUrl: string | null;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const LogoUploader: React.FC<LogoUploaderProps> = ({ logoUrl, uploading, onUpload }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onUpload}
      />
      <div
        className={`exam-logo-card${logoUrl ? ' exam-logo-card--has-logo' : ''}`}
        onClick={() => !logoUrl && inputRef.current?.click()}
      >
        {logoUrl ? (
          <>
            <img
              src={`${import.meta.env.VITE_API_URL || ''}/files${logoUrl.replace('/uploads', '')}`}
              alt="Logo"
              className="exam-logo-card__img"
            />
            <div className="exam-logo-card__info">
              <span className="text-xs font-medium">Logo del centro</span>
              <span className="text-[11px] text-muted-foreground">Cabecera del examen</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="text-xs"
            >
              <Pencil size={12} className="mr-1" /> Cambiar
            </Button>
          </>
        ) : (
          <>
            <div className="exam-logo-card__placeholder">
              {uploading ? <Spinner size={16} /> : <Upload size={16} />}
            </div>
            <div className="exam-logo-card__info">
              <span className="text-xs font-medium">{uploading ? 'Subiendo...' : 'Subir logo del centro'}</span>
              <span className="text-[11px] text-muted-foreground">Aparece en la cabecera del examen</span>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default LogoUploader;
