import { useEffect, useState } from 'react';
import { FolderOpen, Loader2, Save, ShieldCheck, Waypoints } from 'lucide-react';
import { toast } from 'sonner';
import { PageShell } from '@/components/PageShell';
import { ManageProjectAccessDialog } from '@/components/ManageProjectAccessDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { fetchProjectNotionConfig, saveProjectNotionConfig } from '@/lib/notion';
import { fetchProjectById, updateProject } from '@/lib/projects';
import type { Project } from '@/types/project';
import type { ProjectNotionConfig } from '@/types/notion';

export default function ProjectDetails() {
  const { activeProject, setActiveProject } = useActiveProject();
  const [project, setProject] = useState<Project | null>(null);
  const [notionConfig, setNotionConfig] = useState<ProjectNotionConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isSavingNotion, setIsSavingNotion] = useState(false);
  const [isAccessOpen, setIsAccessOpen] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notionParentPageId, setNotionParentPageId] = useState('');
  const [notionTasksDataSourceId, setNotionTasksDataSourceId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);

  useEffect(() => {
    if (!activeProject) {
      setProject(null);
      setNotionConfig(null);
      return;
    }

    void loadProjectDetails(activeProject.id);
  }, [activeProject?.id]);

  async function loadProjectDetails(projectId: string) {
    setIsLoading(true);
    try {
      const [projectRow, configRow] = await Promise.all([
        fetchProjectById(projectId),
        fetchProjectNotionConfig(projectId),
      ]);

      setProject(projectRow);
      setNotionConfig(configRow);
      setName(projectRow?.name ?? activeProject?.name ?? '');
      setDescription(projectRow?.description ?? activeProject?.description ?? '');
      setNotionParentPageId(configRow?.notion_parent_page_id ?? '');
      setNotionTasksDataSourceId(configRow?.notion_tasks_data_source_id ?? '');
      setSyncEnabled(Boolean(configRow?.sync_enabled));
    } catch (error: any) {
      toast.error('Failed to load project details', {
        description: error?.message ?? 'Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveProject() {
    if (!activeProject) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Project name is required');
      return;
    }

    setIsSavingProject(true);
    try {
      const updated = await updateProject(activeProject.id, {
        name: trimmedName,
        description: description.trim() || null,
      });
      setProject(updated);
      setActiveProject({
        id: updated.id,
        name: updated.name,
        description: updated.description,
      });
      toast.success('Project details saved');
    } catch (error: any) {
      toast.error('Failed to save project', {
        description: error?.message ?? 'Please try again.',
      });
    } finally {
      setIsSavingProject(false);
    }
  }

  async function handleSaveNotion() {
    if (!activeProject) return;

    setIsSavingNotion(true);
    try {
      const saved = await saveProjectNotionConfig({
        project_id: activeProject.id,
        notion_parent_page_id: notionParentPageId,
        notion_tasks_data_source_id: notionTasksDataSourceId,
        sync_enabled: syncEnabled,
      });
      setNotionConfig(saved);
      setNotionParentPageId(saved.notion_parent_page_id ?? '');
      setNotionTasksDataSourceId(saved.notion_tasks_data_source_id ?? '');
      setSyncEnabled(saved.sync_enabled);
      toast.success('Notion connection saved');
    } catch (error: any) {
      toast.error('Failed to save Notion connection', {
        description: error?.message ?? 'Please try again.',
      });
    } finally {
      setIsSavingNotion(false);
    }
  }

  return (
    <PageShell
      eyebrow="Project"
      title="Project Details"
      icon={FolderOpen}
      description={`Manage workspace details and integrations for ${activeProject?.name ?? 'the active project'}.`}
      action={
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setIsAccessOpen(true)}
          disabled={!activeProject}
        >
          <ShieldCheck className="h-4 w-4" />
          Manage Access
        </Button>
      }
    >
      {!activeProject ? (
        <Card>
          <CardContent className="p-6 text-sm text-slate-600">
            Select a project to manage details and integrations.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex h-56 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="notion">Notion</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card className="max-w-3xl">
              <CardHeader>
                <CardTitle>Overview</CardTitle>
                <CardDescription>
                  Keep the active project name and description clear for generated outputs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g., DMF Implementation"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-description">Description</Label>
                  <Textarea
                    id="project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    placeholder="Short context for this project"
                  />
                </div>
                <Button
                  className="gap-2"
                  onClick={() => void handleSaveProject()}
                  disabled={isSavingProject}
                >
                  {isSavingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Project
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notion">
            <Card className="max-w-4xl">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Waypoints className="h-5 w-5 text-blue-600" />
                      Notion Collaboration Layer
                    </CardTitle>
                    <CardDescription>
                      Product Workbench remains the source of truth. Notion receives one-way exports for collaboration.
                    </CardDescription>
                  </div>
                  <Badge variant={syncEnabled ? 'default' : 'secondary'}>
                    {syncEnabled ? 'Enabled' : 'Paused'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  Store only Notion destination IDs here. The Notion token stays in Supabase secrets as
                  <span className="font-semibold"> NOTION_TOKEN</span>.
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="notion-parent-page-id">Notion Parent Page ID</Label>
                    <Input
                      id="notion-parent-page-id"
                      value={notionParentPageId}
                      onChange={(event) => setNotionParentPageId(event.target.value)}
                      placeholder="37c8f01a-9a97-806d-854b-d4a6505e73ba"
                    />
                    <p className="text-xs text-slate-500">
                      The main Notion page for this project.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notion-tasks-data-source-id">Tasks Data Source ID</Label>
                    <Input
                      id="notion-tasks-data-source-id"
                      value={notionTasksDataSourceId}
                      onChange={(event) => setNotionTasksDataSourceId(event.target.value)}
                      placeholder="37c8f01a-9a97-80eb-aa43-000b2f1b93a4"
                    />
                    <p className="text-xs text-slate-500">
                      The Notion task table/data source that receives exported tasks.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        Enable Notion export for this project
                      </p>
                      <p className="text-xs text-slate-600">
                        When enabled, task export buttons can create or update Notion rows.
                      </p>
                    </div>
                    <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} />
                  </div>
                </div>

                <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
                  <DetailStat label="Last Export" value={formatDate(notionConfig?.last_exported_at)} />
                  <DetailStat label="Status" value={notionConfig?.last_export_status ?? 'Not exported'} />
                  <DetailStat label="Last Error" value={notionConfig?.last_export_error ?? 'None'} />
                </div>

                <Button
                  className="gap-2"
                  onClick={() => void handleSaveNotion()}
                  disabled={isSavingNotion}
                >
                  {isSavingNotion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Notion Connection
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="access">
            <Card className="max-w-3xl">
              <CardHeader>
                <CardTitle>Access</CardTitle>
                <CardDescription>
                  Manage who can view and work in this Product Workbench project.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="gap-2" onClick={() => setIsAccessOpen(true)}>
                  <ShieldCheck className="h-4 w-4" />
                  Open Access Manager
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <ManageProjectAccessDialog
        open={isAccessOpen}
        onOpenChange={setIsAccessOpen}
        activeProject={activeProject}
      />
    </PageShell>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-slate-900">
        {value}
      </p>
    </div>
  );
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}
