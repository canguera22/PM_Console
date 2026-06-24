import { useEffect, useState } from 'react';
import { Layers3 } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchProjectFeatures } from '@/lib/projectFeatures';
import type { ProjectFeature } from '@/types/project-features';

const PROJECT_WIDE_VALUE = 'project-wide';

export function FeatureAssociationSelect({
  projectId,
  value,
  onChange,
  disabled,
  label = 'Associate with Feature',
  description = 'Optional. Generated artifacts linked here become feature context.',
}: {
  projectId?: string | null;
  value: string | null;
  onChange: (featureId: string | null) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}) {
  const [features, setFeatures] = useState<ProjectFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setFeatures([]);
      onChange(null);
      return;
    }

    let isMounted = true;

    async function loadFeatures() {
      setIsLoading(true);
      try {
        const rows = await fetchProjectFeatures(projectId);
        if (!isMounted) return;
        setFeatures(rows);
        if (value && !rows.some((feature) => feature.id === value)) {
          onChange(null);
        }
      } catch (error: unknown) {
        toast.error('Failed to load feature options', {
          description: error instanceof Error ? error.message : 'Artifacts can still be generated project-wide.',
        });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadFeatures();

    return () => {
      isMounted = false;
    };
  }, [onChange, projectId, value]);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-start gap-2">
        <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <Label className="text-[13px] font-medium text-slate-700">{label}</Label>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <Select
        value={value ?? PROJECT_WIDE_VALUE}
        disabled={disabled || !projectId || isLoading}
        onValueChange={(nextValue) =>
          onChange(nextValue === PROJECT_WIDE_VALUE ? null : nextValue)
        }
      >
        <SelectTrigger className="bg-white">
          <SelectValue placeholder={isLoading ? 'Loading features...' : 'Project-wide'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PROJECT_WIDE_VALUE}>Project-wide / No feature</SelectItem>
          {features.map((feature) => (
            <SelectItem key={feature.id} value={feature.id}>
              {feature.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
