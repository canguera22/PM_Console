import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadWordDocument } from '@/lib/wordExport';

interface ArtifactActionsProps {
  title: string;
  content: string;
  projectName?: string | null;
  moduleLabel?: string | null;
  createdAt?: string | null;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}

export function ArtifactActions({
  title,
  content,
  projectName,
  moduleLabel,
  createdAt,
  size = 'sm',
  variant = 'outline',
  className,
}: ArtifactActionsProps) {
  const disabled = !content?.trim();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        downloadWordDocument({
          title,
          content,
          projectName,
          moduleLabel,
          createdAt,
        });
      }}
    >
      <Download className="mr-2 h-4 w-4" />
      Download Word
    </Button>
  );
}
