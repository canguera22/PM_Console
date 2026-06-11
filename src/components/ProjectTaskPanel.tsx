import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ChevronDown, ClipboardList, ExternalLink, Loader2, Plus, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getArtifactRoute } from '@/lib/artifactRouting';
import { supabaseFetch } from '@/lib/supabase';
import { createProjectTask, fetchProjectTasks, updateProjectTask } from '@/lib/projectTasks';
import { exportProjectTasksToNotion, fetchTaskNotionMappings } from '@/lib/notion';
import type { ProjectArtifact } from '@/types/project-artifacts';
import type { ActiveProject } from '@/types/project';
import type { NotionSyncMapping } from '@/types/notion';
import {
  PROJECT_TASK_MODULE_LABELS,
  PROJECT_TASK_MODULES,
  ProjectTask,
  ProjectTaskModule,
} from '@/types/project-tasks';

const TASK_MODULE_ROUTES: Record<ProjectTaskModule, string> = {
  meeting_intelligence: '/meetings',
  product_documentation: '/documentation',
  release_communications: '/releases',
  prioritization: '/prioritization',
};

interface ProjectTaskPanelProps {
  activeProject: ActiveProject | null;
  compact?: boolean;
  expandableItems?: boolean;
  listMaxHeightClass?: string;
  readOnly?: boolean;
  headerAction?: React.ReactNode;
  refreshKey?: number;
}

export function ProjectTaskPanel({
  activeProject,
  compact = false,
  expandableItems = false,
  listMaxHeightClass,
  readOnly = false,
  headerAction,
  refreshKey = 0,
}: ProjectTaskPanelProps) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkingArtifact, setIsLinkingArtifact] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [relatedModule, setRelatedModule] = useState<string>('');
  const [availableArtifacts, setAvailableArtifacts] = useState<ProjectArtifact[]>([]);
  const [notionMappings, setNotionMappings] = useState<Record<string, NotionSyncMapping>>({});
  const [selectedArtifactByTaskId, setSelectedArtifactByTaskId] = useState<Record<string, string>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [exportingTaskIds, setExportingTaskIds] = useState<Set<string>>(new Set());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    if (!activeProject) {
      setTasks([]);
      setAvailableArtifacts([]);
      setNotionMappings({});
      setSelectedArtifactByTaskId({});
      setIsCreateDialogOpen(false);
      return;
    }

    void loadTasks(activeProject.id);
    void loadArtifacts(activeProject.id);
    void loadNotionMappings(activeProject.id);
    setSelectedArtifactByTaskId({});
    setIsCreateDialogOpen(false);
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject || refreshKey === 0) return;
    void loadNotionMappings(activeProject.id);
  }, [refreshKey, activeProject?.id]);

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === 'open'),
    [tasks]
  );
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === 'completed'),
    [tasks]
  );

  const isCondensed = compact || expandableItems;
  const showComposer = !readOnly;
  const visibleTasks = compact && !expandableItems ? openTasks.slice(0, 5) : tasks;
  const linkableArtifacts = useMemo(
    () =>
      availableArtifacts.filter(
        (artifact) =>
          artifact.status === 'active' &&
          artifact.artifact_type !== 'pm_advisor_feedback'
      ),
    [availableArtifacts]
  );

  async function loadTasks(projectId: string) {
    setIsLoading(true);
    try {
      const rows = await fetchProjectTasks(projectId);
      setTasks(rows);
    } catch (error: any) {
      toast.error('Failed to load tasks', {
        description: error?.message ?? 'Unable to fetch project tasks.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function loadArtifacts(projectId: string) {
    try {
      const rows = await supabaseFetch<ProjectArtifact[]>(
        `/project_artifacts?project_id=eq.${projectId}&status=eq.active&order=created_at.desc`
      );
      setAvailableArtifacts(rows ?? []);
    } catch (error: any) {
      toast.error('Failed to load artifacts', {
        description: error?.message ?? 'Unable to fetch project artifacts.',
      });
    }
  }

  async function loadNotionMappings(projectId: string) {
    try {
      const rows = await fetchTaskNotionMappings(projectId);
      setNotionMappings(rows);
    } catch (error: any) {
      toast.error('Failed to load Notion sync status', {
        description: error?.message ?? 'Unable to fetch Notion mappings.',
      });
    }
  }

  async function handleExportTask(task: ProjectTask) {
    if (!activeProject) return;

    setExportingTaskIds((prev) => new Set(prev).add(task.id));
    try {
      const result = await exportProjectTasksToNotion(activeProject.id, [task.id]);
      await loadNotionMappings(activeProject.id);

      if (result.failures.length > 0) {
        toast.error('Notion export failed', {
          description: result.failures[0]?.error ?? 'Unable to export this task.',
        });
      } else {
        toast.success('Task exported to Notion', {
          description: result.updated > 0 ? 'Existing Notion task updated.' : 'New Notion task created.',
        });
      }
    } catch (error: any) {
      toast.error('Failed to export task to Notion', {
        description: error?.message ?? 'Check the project Notion settings and try again.',
      });
    } finally {
      setExportingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  }

  async function handleCreateTask() {
    if (!activeProject) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Task title is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const task = await createProjectTask({
        project_id: activeProject.id,
        title: trimmedTitle,
        due_date: dueDate || null,
        related_module: relatedModule
          ? (relatedModule as ProjectTaskModule)
          : null,
      });

      setTasks((prev) => sortTasks([task, ...prev]));
      setTitle('');
      setDueDate('');
      setRelatedModule('');
      setIsCreateDialogOpen(false);
      toast.success('Task created');
    } catch (error: any) {
      toast.error('Failed to create task', {
        description: error?.message ?? 'Unable to save the task.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleTask(task: ProjectTask) {
    const nextStatus = task.status === 'completed' ? 'open' : 'completed';

    try {
      const updated = await updateProjectTask(task.id, {
        status: nextStatus,
        completed_at: nextStatus === 'completed' ? new Date().toISOString() : null,
        completed_artifact_id: nextStatus === 'completed' ? task.completed_artifact_id ?? null : null,
        completed_artifact_type: nextStatus === 'completed' ? task.completed_artifact_type ?? null : null,
      });

      setTasks((prev) =>
        sortTasks(prev.map((row) => (row.id === task.id ? updated : row)))
      );
      toast.success(nextStatus === 'completed' ? 'Task completed' : 'Task reopened');
    } catch (error: any) {
      toast.error('Failed to update task', {
        description: error?.message ?? 'Unable to update task status.',
      });
    }
  }

  async function handleLinkExistingArtifact(task: ProjectTask) {
    const selectedArtifactId = selectedArtifactByTaskId[task.id];

    if (!activeProject || !selectedArtifactId) {
      toast.error('Select an artifact first');
      return;
    }

    const artifact = linkableArtifacts.find((row) => row.id === selectedArtifactId);

    if (!artifact) {
      toast.error('The selected artifact is no longer available');
      return;
    }

    const artifactModule = toProjectTaskModule(artifact.artifact_type);
    if (!artifactModule) {
      toast.error('That artifact type cannot be linked to a task');
      return;
    }

    setIsLinkingArtifact(true);
    try {
      const updated = await updateProjectTask(task.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_artifact_id: artifact.id,
        completed_artifact_type: artifactModule,
        related_module: task.related_module ?? artifactModule,
      });

      setTasks((prev) =>
        sortTasks(prev.map((row) => (row.id === task.id ? updated : row)))
      );
      setSelectedArtifactByTaskId((prev) => ({ ...prev, [task.id]: '' }));
      toast.success('Task linked to artifact');
    } catch (error: any) {
      toast.error('Failed to link artifact', {
        description: error?.message ?? 'Unable to update the task.',
      });
    } finally {
      setIsLinkingArtifact(false);
    }
  }

  function renderTask(task: ProjectTask) {
    const moduleLabel = task.related_module
      ? PROJECT_TASK_MODULE_LABELS[task.related_module]
      : null;
    const dueLabel = task.due_date
      ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString()
      : null;
    const linkedArtifactRoute =
      task.completed_artifact_id && task.completed_artifact_type
        ? getArtifactRoute(task.completed_artifact_type, task.completed_artifact_id)
        : null;
    const linkedArtifactLabel =
      task.completed_artifact_type
        ? PROJECT_TASK_MODULE_LABELS[task.completed_artifact_type]
        : null;
    const isExpanded = expandedTaskIds.has(task.id);
    const notionMapping = notionMappings[task.id];
    const isExportingTask = exportingTaskIds.has(task.id);
    const selectedArtifactId = selectedArtifactByTaskId[task.id] ?? '';
    const canLinkArtifact = !readOnly && task.status === 'open' && linkableArtifacts.length > 0;
    const toggleExpanded = () => {
      setExpandedTaskIds((prev) => {
        const next = new Set(prev);
        if (next.has(task.id)) {
          next.delete(task.id);
        } else {
          next.add(task.id);
        }
        return next;
      });
    };
    const artifactLinker = canLinkArtifact ? (
      <div className="rounded-lg border border-[#D7E3F8] bg-[#F8FBFF] p-3">
        <div className="mb-3">
          <p className="text-sm font-medium text-[#111827]">Link existing artifact</p>
          <p className="text-xs text-[#6B7280]">
            Mark this task complete by connecting it to a generated artifact.
          </p>
        </div>
        <div className={`grid gap-3 ${isCondensed ? 'lg:grid-cols-1' : 'sm:grid-cols-[minmax(0,1fr)_160px]'}`}>
          <div className="space-y-2">
            <Label htmlFor={`${task.id}-link-artifact`}>Existing Artifact</Label>
            <select
              id={`${task.id}-link-artifact`}
              value={selectedArtifactId}
              onChange={(event) =>
                setSelectedArtifactByTaskId((prev) => ({
                  ...prev,
                  [task.id]: event.target.value,
                }))
              }
              disabled={isLinkingArtifact}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select an artifact</option>
              {linkableArtifacts.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {getArtifactDisplayLabel(artifact)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              onClick={() => void handleLinkExistingArtifact(task)}
              disabled={isLinkingArtifact || !selectedArtifactId}
              className="w-full"
            >
              {isLinkingArtifact ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Linking...
                </>
              ) : (
                'Link Artifact'
              )}
            </Button>
          </div>
        </div>
      </div>
    ) : null;
    const actions = (
      <TaskActionStack>
        {task.status === 'completed' && linkedArtifactRoute ? (
          <TaskActionButton onClick={() => navigate(linkedArtifactRoute)}>
            View Artifact
            <ArrowRight className="ml-2 h-4 w-4" />
          </TaskActionButton>
        ) : null}
        {task.related_module && task.status === 'open' ? (
          <TaskActionButton onClick={() => navigate(TASK_MODULE_ROUTES[task.related_module!])}>
            Open Module
            <ArrowRight className="ml-2 h-4 w-4" />
          </TaskActionButton>
        ) : null}
        <TaskActionButton
          variant={task.status === 'completed' ? 'outline' : 'default'}
          onClick={() => void handleToggleTask(task)}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {task.status === 'completed' ? 'Reopen' : 'Complete'}
        </TaskActionButton>
        <TaskActionButton
          onClick={() => void handleExportTask(task)}
          disabled={isExportingTask}
        >
          {isExportingTask ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="mr-2 h-4 w-4" />
          )}
          {notionMapping?.last_sync_status === 'success' ? 'Update Notion' : 'Add to Notion'}
        </TaskActionButton>
        {notionMapping?.notion_url && notionMapping.last_sync_status === 'success' ? (
          <Button asChild variant="outline" size="sm" className="h-9 w-full justify-between">
            <a href={notionMapping.notion_url} target="_blank" rel="noreferrer">
              Open Notion Task
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </TaskActionStack>
    );

    if (expandableItems) {
      return (
        <div
          key={task.id}
          className="rounded-lg border border-[#E5E7EB] bg-white"
        >
          <button
            type="button"
            onClick={toggleExpanded}
            className="flex w-full items-start justify-between gap-3 p-3 text-left transition hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2"
            aria-expanded={isExpanded}
          >
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-[#6B7280] line-through' : 'text-[#111827]'}`}>
                  {task.title}
                </p>
                <Badge variant={task.status === 'completed' ? 'secondary' : 'outline'}>
                  {task.status === 'completed' ? 'Completed' : 'Open'}
                </Badge>
                {moduleLabel ? (
                  <Badge variant="outline" className="bg-[#EFF6FF] text-[#1D4ED8]">
                    {moduleLabel}
                  </Badge>
                ) : null}
                <NotionStatusBadge mapping={notionMapping} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B7280]">
                {dueLabel ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Due {dueLabel}
                  </span>
                ) : (
                  <span>No due date</span>
                )}
                {task.status === 'completed' && linkedArtifactLabel ? (
                  <span>Completed via: {linkedArtifactLabel}</span>
                ) : null}
                {notionMapping?.last_sync_status === 'success' ? (
                  <span>Synced {new Date(notionMapping.last_synced_at).toLocaleDateString()}</span>
                ) : null}
              </div>
            </div>
            <ChevronDown
              className={`mt-1 h-4 w-4 shrink-0 text-[#9CA3AF] transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isExpanded ? (
            <div className="border-t border-[#E5E7EB] p-3">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B7280]">
                  <span>Created by: {task.created_by_email ?? 'Unknown'}</span>
                  <span>Updated by: {task.updated_by_email ?? task.created_by_email ?? 'Unknown'}</span>
                </div>

                {task.description ? (
                  <p className="whitespace-pre-line rounded-md bg-[#F9FAFB] p-3 text-sm text-[#374151]">
                    {task.description}
                  </p>
                ) : null}

                {artifactLinker}
                {actions}
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className="rounded-lg border border-[#E5E7EB] bg-white p-4"
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px] md:items-start">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-[#6B7280] line-through' : 'text-[#111827]'}`}>
                {task.title}
              </p>
              <Badge variant={task.status === 'completed' ? 'secondary' : 'outline'}>
                {task.status === 'completed' ? 'Completed' : 'Open'}
              </Badge>
              {moduleLabel ? (
                <Badge variant="outline" className="bg-[#EFF6FF] text-[#1D4ED8]">
                  {moduleLabel}
                </Badge>
              ) : null}
              <NotionStatusBadge mapping={notionMapping} />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B7280]">
              {dueLabel ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Due {dueLabel}
                </span>
              ) : (
                <span>No due date</span>
              )}
              <span>Created by: {task.created_by_email ?? 'Unknown'}</span>
              <span>Updated by: {task.updated_by_email ?? task.created_by_email ?? 'Unknown'}</span>
              {task.status === 'completed' && linkedArtifactLabel ? (
                <span>
                  Completed via: {linkedArtifactLabel}
                </span>
              ) : null}
              {notionMapping?.last_sync_status === 'success' ? (
                <span>Synced {new Date(notionMapping.last_synced_at).toLocaleDateString()}</span>
              ) : null}
            </div>

            {artifactLinker}
          </div>

          {actions}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-[#3B82F6]" />
              Project Tasks
            </CardTitle>
            <CardDescription>
              {readOnly
                ? 'Review open and completed work tied to this project.'
                : 'Track PM admin work and tie it to the module that will produce the deliverable.'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#6B7280]">
            <Badge variant="outline">{openTasks.length} open</Badge>
            {!compact || expandableItems ? <Badge variant="secondary">{completedTasks.length} completed</Badge> : null}
            {showComposer ? (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    disabled={!activeProject}
                    className="ml-1 gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add new task
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Add new task</DialogTitle>
                    <DialogDescription>
                      Capture the next piece of work and optionally tie it to a Product Workbench module.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={compact ? 'dashboard-task-title' : 'project-dashboard-task-title'}>
                        Task or note
                      </Label>
                      <Input
                        id={compact ? 'dashboard-task-title' : 'project-dashboard-task-title'}
                        placeholder="Capture the next thing to move forward"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={compact ? 'dashboard-task-due' : 'project-dashboard-task-due'}>
                          Due Date
                        </Label>
                        <Input
                          id={compact ? 'dashboard-task-due' : 'project-dashboard-task-due'}
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={compact ? 'dashboard-task-module' : 'project-dashboard-task-module'}>
                          Related Module
                        </Label>
                        <select
                          id={compact ? 'dashboard-task-module' : 'project-dashboard-task-module'}
                          value={relatedModule}
                          onChange={(e) => setRelatedModule(e.target.value)}
                          disabled={isSubmitting}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">None</option>
                          {PROJECT_TASK_MODULES.map((module) => (
                            <option key={module} value={module}>
                              {PROJECT_TASK_MODULE_LABELS[module]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => void handleCreateTask()}
                      disabled={isSubmitting || !title.trim()}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        'Add task'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
            {headerAction}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!activeProject ? (
          <div className="rounded-md border border-dashed border-[#D1D5DB] p-4 text-sm text-[#6B7280]">
            Select a project to manage tasks.
          </div>
        ) : (
          <>
            {isLoading ? (
              <p className="text-sm text-[#6B7280]">Loading tasks…</p>
            ) : visibleTasks.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#D1D5DB] p-4 text-sm text-[#6B7280]">
                {compact
                  ? 'No open tasks yet. Add one above to anchor your next deliverable.'
                  : 'No tasks yet for this project.'}
              </div>
            ) : (
              <div className={`space-y-3 ${listMaxHeightClass ? `${listMaxHeightClass} overflow-y-auto pr-1` : ''}`}>
                {visibleTasks.map(renderTask)}
                {compact && openTasks.length > visibleTasks.length ? (
                  <p className="text-xs text-[#6B7280]">
                    {openTasks.length - visibleTasks.length} more open task(s) available in the project dashboard.
                  </p>
                ) : null}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function sortTasks(tasks: ProjectTask[]): ProjectTask[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'open' ? -1 : 1;
    }

    const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) {
      return aDue - bDue;
    }

    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

function toProjectTaskModule(value: string): ProjectTaskModule | null {
  switch (value) {
    case 'meeting_intelligence':
    case 'product_documentation':
    case 'release_communications':
    case 'prioritization':
      return value;
    default:
      return null;
  }
}

function getArtifactDisplayLabel(artifact: ProjectArtifact): string {
  const module = toProjectTaskModule(artifact.artifact_type);
  const prefix = module ? PROJECT_TASK_MODULE_LABELS[module] : artifact.artifact_type;
  const name = artifact.artifact_name || 'Untitled';
  const createdAt = new Date(artifact.created_at).toLocaleDateString();
  return `${prefix}: ${name} (${createdAt})`;
}

function NotionStatusBadge({ mapping }: { mapping?: NotionSyncMapping }) {
  if (!mapping) {
    return (
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
        Not exported
      </Badge>
    );
  }

  if (mapping.last_sync_status === 'failed') {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
        Notion failed
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
      Exported to Notion
    </Badge>
  );
}

function TaskActionStack({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-2 md:w-[180px]">
      {children}
    </div>
  );
}

function TaskActionButton({
  children,
  variant = 'outline',
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'outline';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={disabled}
      onClick={onClick}
      className="h-9 w-full justify-between"
    >
      {children}
    </Button>
  );
}
