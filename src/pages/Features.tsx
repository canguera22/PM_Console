import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Box, CalendarClock, Edit3, Layers3, Plus, Search, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageShell } from '@/components/PageShell';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import {
  archiveProjectFeature,
  createProjectFeature,
  fetchProjectFeatures,
  updateProjectFeature,
} from '@/lib/projectFeatures';
import type { ProjectFeature, ProjectFeaturePriority } from '@/types/project-features';

const priorityLabels: Record<ProjectFeaturePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const priorityClasses: Record<ProjectFeaturePriority, string> = {
  low: 'border-slate-200 bg-slate-50 text-slate-700',
  medium: 'border-blue-100 bg-blue-50 text-blue-700',
  high: 'border-amber-100 bg-amber-50 text-amber-700',
};

export default function Features() {
  const { activeProject } = useActiveProject();
  const navigate = useNavigate();
  const [features, setFeatures] = useState<ProjectFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState<ProjectFeature | null>(null);

  const filteredFeatures = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return features;

    return features.filter((feature) =>
      `${feature.name} ${feature.description ?? ''}`.toLowerCase().includes(normalized)
    );
  }, [features, query]);

  const loadFeatures = useCallback(async () => {
    if (!activeProject) {
      setFeatures([]);
      return;
    }

    setIsLoading(true);
    try {
      const rows = await fetchProjectFeatures(activeProject.id);
      setFeatures(rows);
    } catch (error: unknown) {
      toast.error('Failed to load features', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    void loadFeatures();
  }, [loadFeatures]);

  function openCreateDialog() {
    setEditingFeature(null);
    setDialogOpen(true);
  }

  function openEditDialog(feature: ProjectFeature) {
    setEditingFeature(feature);
    setDialogOpen(true);
  }

  async function handleArchive(feature: ProjectFeature) {
    try {
      await archiveProjectFeature(feature.id);
      setFeatures((prev) => prev.filter((item) => item.id !== feature.id));
      toast.success('Feature archived');
    } catch (error: unknown) {
      toast.error('Failed to archive feature', {
        description: getErrorMessage(error),
      });
    }
  }

  return (
    <PageShell
      eyebrow="Product Scope"
      title="Features"
      icon={Layers3}
      description={`Organize scoped product capabilities for ${activeProject?.name ?? 'the active project'}.`}
      action={
        <Button className="gap-2" onClick={openCreateDialog} disabled={!activeProject}>
          <Plus className="h-4 w-4" />
          New Feature
        </Button>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <FeatureMetric icon={Box} label="Active features" value={features.length} />
        <FeatureMetric
          icon={CalendarClock}
          label="Recently updated"
          value={features[0] ? new Date(features[0].updated_at).toLocaleDateString() : 'None'}
        />
        <FeatureMetric icon={Layers3} label="Workspace model" value="Project child" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="m-0 text-lg font-semibold text-slate-950">Feature Workspaces</h2>
              <p className="mt-1 text-sm text-slate-600">
                Features inherit project context and collect focused artifacts going forward.
              </p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search features"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="p-5">
          {isLoading ? (
            <p className="text-sm text-slate-600">Loading features...</p>
          ) : filteredFeatures.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <Layers3 className="mx-auto mb-3 h-10 w-10 text-slate-400" />
              <h3 className="m-0 text-base font-semibold text-slate-950">
                No features yet
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
                Create the first scoped workspace when there is a capability worth tracking separately from the overall project.
              </p>
              <Button className="mt-4 gap-2" onClick={openCreateDialog} disabled={!activeProject}>
                <Plus className="h-4 w-4" />
                New Feature
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredFeatures.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => navigate(`/features/${feature.id}`)}
                  className="group rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-slate-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="m-0 line-clamp-2 text-base font-semibold text-slate-950">
                        {feature.name}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                        {feature.description || 'No description yet.'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${priorityClasses[feature.priority]}`}>
                      {priorityLabels[feature.priority]}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-500">
                      Updated {new Date(feature.updated_at).toLocaleDateString()}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="Edit feature"
                        aria-label="Edit feature"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDialog(feature);
                        }}
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-slate-500 hover:text-red-700"
                        title="Archive feature"
                        aria-label="Archive feature"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleArchive(feature);
                        }}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <FeatureDialog
        activeProjectId={activeProject?.id}
        feature={editingFeature}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={(feature) => {
          setFeatures((prev) => {
            const exists = prev.some((item) => item.id === feature.id);
            return exists
              ? prev.map((item) => (item.id === feature.id ? feature : item))
              : [feature, ...prev];
          });
        }}
      />
    </PageShell>
  );
}

function FeatureDialog({
  activeProjectId,
  feature,
  open,
  onOpenChange,
  onSaved,
}: {
  activeProjectId?: string;
  feature: ProjectFeature | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (feature: ProjectFeature) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ProjectFeaturePriority>('medium');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setName(feature?.name ?? '');
    setDescription(feature?.description ?? '');
    setPriority(feature?.priority ?? 'medium');
  }, [feature, open]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!activeProjectId || !trimmedName) {
      toast.error('Feature name is required');
      return;
    }

    setIsSaving(true);
    try {
      const saved = feature
        ? await updateProjectFeature(feature.id, {
            name: trimmedName,
            description: description.trim() || null,
            priority,
          })
        : await createProjectFeature({
            project_id: activeProjectId,
            name: trimmedName,
            description: description.trim() || null,
            priority,
          });

      onSaved(saved);
      onOpenChange(false);
      toast.success(feature ? 'Feature updated' : 'Feature created');
    } catch (error: unknown) {
      toast.error(feature ? 'Failed to update feature' : 'Failed to create feature', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{feature ? 'Edit Feature' : 'New Feature'}</DialogTitle>
          <DialogDescription>
            Create a scoped workspace for a buildable capability inside the active project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="feature-name">Name</Label>
            <Input
              id="feature-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Checkout onboarding"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature-description">Description</Label>
            <Textarea
              id="feature-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What capability does this feature represent?"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature-priority">Priority</Label>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as ProjectFeaturePriority)}
            >
              <SelectTrigger id="feature-priority">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving || !activeProjectId}>
            {isSaving ? 'Saving...' : 'Save Feature'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-xs font-medium uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="m-0 truncate text-lg font-semibold text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
