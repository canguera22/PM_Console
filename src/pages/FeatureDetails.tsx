import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, FileText, Layers3, Link2, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageShell } from '@/components/PageShell';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import {
  fetchFeatureArtifactLinks,
  fetchFeatureDocumentLinks,
  fetchProjectArtifacts,
  fetchProjectContextDocuments,
  fetchProjectFeature,
  linkFeatureArtifact,
  linkFeatureDocument,
  unlinkFeatureArtifact,
  unlinkFeatureDocument,
  updateProjectFeature,
} from '@/lib/projectFeatures';
import type { ProjectArtifact } from '@/types/project-artifacts';
import type {
  FeatureArtifactLink,
  FeatureDocumentLink,
  FeatureLinkRole,
  ProjectContextDocument,
  ProjectFeature,
} from '@/types/project-features';

const roleLabels: Record<FeatureLinkRole, string> = {
  source: 'Source',
  reference: 'Reference',
  background: 'Background',
};

const priorityLabels: Record<ProjectFeature['priority'], string> = {
  low: 'Low priority',
  medium: 'Medium priority',
  high: 'High priority',
};

const artifactTypeLabels: Record<string, string> = {
  meeting_intelligence: 'Project Notes',
  product_documentation: 'Product Documentation',
  release_communications: 'Release Communications',
  prioritization: 'Discovery',
};

export default function FeatureDetails() {
  const { featureId } = useParams<{ featureId: string }>();
  const { activeProject } = useActiveProject();
  const navigate = useNavigate();
  const [feature, setFeature] = useState<ProjectFeature | null>(null);
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([]);
  const [documents, setDocuments] = useState<ProjectContextDocument[]>([]);
  const [artifactLinks, setArtifactLinks] = useState<FeatureArtifactLink[]>([]);
  const [documentLinks, setDocumentLinks] = useState<FeatureDocumentLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOverview, setIsSavingOverview] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState('');
  const [artifactToLink, setArtifactToLink] = useState('');
  const [documentToLink, setDocumentToLink] = useState('');
  const [artifactRole, setArtifactRole] = useState<FeatureLinkRole>('reference');
  const [documentRole, setDocumentRole] = useState<FeatureLinkRole>('reference');

  const linkedArtifactIds = useMemo(
    () => new Set(artifactLinks.map((link) => link.artifact_id)),
    [artifactLinks]
  );

  const linkedDocumentIds = useMemo(
    () => new Set(documentLinks.map((link) => link.document_id)),
    [documentLinks]
  );

  const availableArtifacts = useMemo(
    () => artifacts.filter((artifact) => !linkedArtifactIds.has(artifact.id)),
    [artifacts, linkedArtifactIds]
  );

  const availableDocuments = useMemo(
    () => documents.filter((document) => !linkedDocumentIds.has(document.id)),
    [documents, linkedDocumentIds]
  );

  const loadFeatureWorkspace = useCallback(async () => {
    if (!featureId || !activeProject) return;

    setIsLoading(true);
    try {
      const [featureRow, artifactRows, documentRows, featureArtifactLinks, featureDocumentLinks] =
        await Promise.all([
          fetchProjectFeature(featureId),
          fetchProjectArtifacts(activeProject.id),
          fetchProjectContextDocuments(activeProject.id),
          fetchFeatureArtifactLinks(featureId),
          fetchFeatureDocumentLinks(featureId),
        ]);

      if (!featureRow || featureRow.status !== 'active') {
        toast.error('Feature not found');
        navigate('/features');
        return;
      }

      if (featureRow.project_id !== activeProject.id) {
        toast.error('This feature belongs to a different project');
        navigate('/features');
        return;
      }

      setFeature(featureRow);
      setOverviewDraft(featureRow.description ?? '');
      setArtifacts(artifactRows);
      setDocuments(documentRows);
      setArtifactLinks(featureArtifactLinks);
      setDocumentLinks(featureDocumentLinks);
    } catch (error: unknown) {
      toast.error('Failed to load feature workspace', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeProject, featureId, navigate]);

  useEffect(() => {
    void loadFeatureWorkspace();
  }, [loadFeatureWorkspace]);

  async function saveOverview() {
    if (!feature) return;

    setIsSavingOverview(true);
    try {
      const updated = await updateProjectFeature(feature.id, {
        description: overviewDraft.trim() || null,
      });
      setFeature(updated);
      toast.success('Feature overview updated');
    } catch (error: unknown) {
      toast.error('Failed to update overview', {
        description: getErrorMessage(error),
      });
    } finally {
      setIsSavingOverview(false);
    }
  }

  async function addArtifactLink() {
    if (!activeProject || !feature || !artifactToLink) return;

    try {
      await linkFeatureArtifact(activeProject.id, feature.id, artifactToLink, artifactRole);
      setArtifactToLink('');
      setArtifactRole('reference');
      const links = await fetchFeatureArtifactLinks(feature.id);
      setArtifactLinks(links);
      toast.success('Artifact linked');
    } catch (error: unknown) {
      toast.error('Failed to link artifact', {
        description: getErrorMessage(error),
      });
    }
  }

  async function addDocumentLink() {
    if (!activeProject || !feature || !documentToLink) return;

    try {
      await linkFeatureDocument(activeProject.id, feature.id, documentToLink, documentRole);
      setDocumentToLink('');
      setDocumentRole('reference');
      const links = await fetchFeatureDocumentLinks(feature.id);
      setDocumentLinks(links);
      toast.success('Context doc linked');
    } catch (error: unknown) {
      toast.error('Failed to link context doc', {
        description: getErrorMessage(error),
      });
    }
  }

  async function removeArtifactLink(link: FeatureArtifactLink) {
    try {
      await unlinkFeatureArtifact(link.feature_id, link.artifact_id);
      setArtifactLinks((prev) => prev.filter((item) => item.artifact_id !== link.artifact_id));
      toast.success('Artifact unlinked');
    } catch (error: unknown) {
      toast.error('Failed to unlink artifact', {
        description: getErrorMessage(error),
      });
    }
  }

  async function removeDocumentLink(link: FeatureDocumentLink) {
    try {
      await unlinkFeatureDocument(link.feature_id, link.document_id);
      setDocumentLinks((prev) => prev.filter((item) => item.document_id !== link.document_id));
      toast.success('Context doc unlinked');
    } catch (error: unknown) {
      toast.error('Failed to unlink context doc', {
        description: getErrorMessage(error),
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!feature) return null;

  return (
    <PageShell
      eyebrow="Feature Workspace"
      title={feature.name}
      icon={Layers3}
      description={
        <span>
          {priorityLabels[feature.priority]} inside {activeProject?.name ?? 'the active project'}.
        </span>
      }
      action={
        <Button variant="outline" className="gap-2" onClick={() => navigate('/features')}>
          <ArrowLeft className="h-4 w-4" />
          Features
        </Button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.6fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="m-0 text-lg font-semibold text-slate-950">Overview</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Keep the feature intent current for later build brief generation.
                </p>
              </div>
              <Button onClick={() => void saveOverview()} disabled={isSavingOverview}>
                {isSavingOverview ? 'Saving...' : 'Save Overview'}
              </Button>
            </div>
            <Textarea
              value={overviewDraft}
              onChange={(event) => setOverviewDraft(event.target.value)}
              className="mt-4 min-h-[180px]"
              placeholder="Summarize the capability, user value, boundaries, and product intent."
            />
          </section>

          <FeatureLinkSection
            title="Linked Artifacts"
            description="Generated outputs explicitly attached to this feature."
            icon={FileText}
            addControls={
              <LinkControls
                selectLabel="Artifact"
                role={artifactRole}
                selectedId={artifactToLink}
                emptyLabel="No more artifacts to link"
                options={availableArtifacts.map((artifact) => ({
                  id: artifact.id,
                  label: getArtifactName(artifact),
                  meta: artifactTypeLabels[artifact.artifact_type] ?? artifact.artifact_type,
                }))}
                onSelect={setArtifactToLink}
                onRoleChange={setArtifactRole}
                onAdd={() => void addArtifactLink()}
              />
            }
          >
            {artifactLinks.length === 0 ? (
              <EmptyLinkState copy="No artifacts linked to this feature yet." />
            ) : (
              <div className="divide-y divide-slate-100">
                {artifactLinks.map((link) => (
                  <LinkedItem
                    key={link.artifact_id}
                    title={getArtifactName(link.artifact)}
                    meta={`${artifactTypeLabels[link.artifact?.artifact_type ?? ''] ?? link.artifact?.artifact_type ?? 'Artifact'} · ${roleLabels[link.role]}`}
                    onRemove={() => void removeArtifactLink(link)}
                  />
                ))}
              </div>
            )}
          </FeatureLinkSection>

          <FeatureLinkSection
            title="Linked Context Docs"
            description="Project documents selected as focused feature context."
            icon={BookOpen}
            addControls={
              <LinkControls
                selectLabel="Context doc"
                role={documentRole}
                selectedId={documentToLink}
                emptyLabel="No more docs to link"
                options={availableDocuments.map((document) => ({
                  id: document.id,
                  label: document.name,
                  meta: document.document_type ?? document.doc_type ?? 'Context doc',
                }))}
                onSelect={setDocumentToLink}
                onRoleChange={setDocumentRole}
                onAdd={() => void addDocumentLink()}
              />
            }
          >
            {documentLinks.length === 0 ? (
              <EmptyLinkState copy="No context docs linked to this feature yet." />
            ) : (
              <div className="divide-y divide-slate-100">
                {documentLinks.map((link) => (
                  <LinkedItem
                    key={link.document_id}
                    title={link.document?.name ?? 'Untitled document'}
                    meta={`${link.document?.document_type ?? link.document?.doc_type ?? 'Context doc'} · ${roleLabels[link.role]}`}
                    onRemove={() => void removeDocumentLink(link)}
                  />
                ))}
              </div>
            )}
          </FeatureLinkSection>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="m-0 text-lg font-semibold text-slate-950">Inherited Project Context</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Project-wide context remains available to this feature. Linked items above mark the focused context set for future build briefs.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <ContextCount label="Project artifacts" value={artifacts.length} />
              <ContextCount label="Project context docs" value={documents.length} />
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="m-0 text-lg font-semibold text-slate-950">Build Briefs</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  This feature is ready to support generated implementation prompts once the Build Brief flow is added.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}

function FeatureLinkSection({
  title,
  description,
  icon: Icon,
  addControls,
  children,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  addControls: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="m-0 text-lg font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>
        <div className="mt-4">{addControls}</div>
      </div>
      {children}
    </section>
  );
}

function LinkControls({
  selectLabel,
  role,
  selectedId,
  emptyLabel,
  options,
  onSelect,
  onRoleChange,
  onAdd,
}: {
  selectLabel: string;
  role: FeatureLinkRole;
  selectedId: string;
  emptyLabel: string;
  options: Array<{ id: string; label: string; meta: string }>;
  onSelect: (id: string) => void;
  onRoleChange: (role: FeatureLinkRole) => void;
  onAdd: () => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_auto]">
      <div className="space-y-2">
        <Label>{selectLabel}</Label>
        <Select value={selectedId} onValueChange={onSelect}>
          <SelectTrigger>
            <SelectValue placeholder={options.length === 0 ? emptyLabel : `Choose ${selectLabel.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label} · {option.meta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(value) => onRoleChange(value as FeatureLinkRole)}>
          <SelectTrigger>
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="source">Source</SelectItem>
            <SelectItem value="reference">Reference</SelectItem>
            <SelectItem value="background">Background</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end">
        <Button className="w-full gap-2" onClick={onAdd} disabled={!selectedId}>
          <Link2 className="h-4 w-4" />
          Link
        </Button>
      </div>
    </div>
  );
}

function LinkedItem({
  title,
  meta,
  onRemove,
}: {
  title: string;
  meta: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <h3 className="m-0 truncate text-sm font-semibold text-slate-950">{title}</h3>
        <p className="m-0 mt-1 text-xs text-slate-500">{meta}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 shrink-0 p-0 text-slate-500 hover:text-red-700"
        title="Unlink"
        aria-label="Unlink"
        onClick={onRemove}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmptyLinkState({ copy }: { copy: string }) {
  return (
    <div className="p-5">
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
        {copy}
      </div>
    </div>
  );
}

function ContextCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="m-0 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="m-0 mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function getArtifactName(artifact?: ProjectArtifact | null): string {
  if (!artifact) return 'Untitled artifact';

  if (artifact.artifact_type === 'prioritization') {
    const input = artifact.input_data as
      | { input?: { problem_area?: string }; problem_area?: string }
      | null;
    return (
      artifact.artifact_name ||
      input?.input?.problem_area?.trim?.() ||
      input?.problem_area?.trim?.() ||
      'Untitled Discovery Brief'
    );
  }

  return artifact.artifact_name || artifact.artifact_type;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}
