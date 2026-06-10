import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getArtifactRoute } from '@/lib/artifactRouting';
import { supabaseFetch } from '@/lib/supabase';
import { createProjectTask, fetchProjectTasks, updateProjectTask } from '@/lib/projectTasks';
import type { ProjectArtifact } from '@/types/project-artifacts';
import type { ActiveProject } from '@/types/project';
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
}

export function ProjectTaskPanel({
  activeProject,
  compact = false,
  expandableItems = false,
  listMaxHeightClass,
  readOnly = false,
  headerAction,
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
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeProject) {
      setTasks([]);
      setAvailableArtifacts([]);
      return;
    }

    void loadTasks(activeProject.id);
    void loadArtifacts(activeProject.id);
  }, [activeProject?.id]);

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
  const showArtifactLinker = !readOnly;
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

  async function handleLinkExistingArtifact() {
    if (!activeProject || !selectedTaskId || !selectedArtifactId) {
      toast.error('Select a task and an artifact first');
      return;
    }

    const task = tasks.find((row) => row.id === selectedTaskId);
    const artifact = linkableArtifacts.find((row) => row.id === selectedArtifactId);

    if (!task || !artifact) {
      toast.error('The selected task or artifact is no longer available');
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
      setSelectedTaskId('');
      setSelectedArtifactId('');
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

                <div className="flex flex-wrap items-center gap-2">
                  {task.status === 'completed' && linkedArtifactRoute ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(linkedArtifactRoute)}
                    >
                      View Artifact
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : null}
                  {task.related_module && task.status === 'open' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(TASK_MODULE_ROUTES[task.related_module!])}
                    >
                      Open Module
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={task.status === 'completed' ? 'outline' : 'default'}
                    onClick={() => void handleToggleTask(task)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {task.status === 'completed' ? 'Reopen' : 'Complete'}
                  </Button>
                </div>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
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
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {task.status === 'completed' && linkedArtifactRoute ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(linkedArtifactRoute)}
              >
                View Artifact
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
            {task.related_module && task.status === 'open' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(TASK_MODULE_ROUTES[task.related_module!])}
              >
                Open Module
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={task.status === 'completed' ? 'outline' : 'default'}
              onClick={() => void handleToggleTask(task)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {task.status === 'completed' ? 'Reopen' : 'Complete'}
            </Button>
          </div>
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
            {showComposer ? (
              <div className={`grid gap-3 ${isCondensed ? 'grid-cols-[minmax(0,1fr)_44px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]' : 'lg:grid-cols-[minmax(0,1.6fr)_180px_240px_auto]'}`}>
                <div className={`space-y-2 ${isCondensed ? 'sm:col-span-2' : ''}`}>
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

                <div className={`flex items-end ${isCondensed ? 'sm:col-start-3' : ''}`}>
                  <Button
                    onClick={() => void handleCreateTask()}
                    disabled={isSubmitting || !title.trim()}
                    className={isCondensed ? 'h-10 w-10 p-0' : 'w-full'}
                    aria-label="Add task"
                    title="Add task"
                  >
                    {isCondensed ? <Plus className="h-4 w-4" /> : 'Add Task'}
                  </Button>
                </div>

                <div className={`space-y-2 ${isCondensed ? 'col-span-2 sm:col-span-1' : ''}`}>
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

                <div className={`space-y-2 ${isCondensed ? 'col-span-2 sm:col-span-2' : ''}`}>
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
            ) : null}

            {showArtifactLinker && openTasks.length > 0 && linkableArtifacts.length > 0 ? (
              <div className={`grid gap-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-4 ${isCondensed ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]'}`}>
                <div className="space-y-2">
                  <Label htmlFor={compact ? 'dashboard-link-task' : 'project-dashboard-link-task'}>
                    Link Existing Task
                  </Label>
                  <select
                    id={compact ? 'dashboard-link-task' : 'project-dashboard-link-task'}
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    disabled={isLinkingArtifact}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select an open task</option>
                    {openTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={compact ? 'dashboard-link-artifact' : 'project-dashboard-link-artifact'}>
                    Existing Artifact
                  </Label>
                  <select
                    id={compact ? 'dashboard-link-artifact' : 'project-dashboard-link-artifact'}
                    value={selectedArtifactId}
                    onChange={(e) => setSelectedArtifactId(e.target.value)}
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
                    onClick={() => void handleLinkExistingArtifact()}
                    disabled={isLinkingArtifact || !selectedTaskId || !selectedArtifactId}
                    className="w-full"
                  >
                    Link Artifact
                  </Button>
                </div>
              </div>
            ) : null}

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
