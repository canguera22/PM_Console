import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  Loader2,
  Plus,
  UploadCloud,
} from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
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

export type TaskViewMode = 'list' | 'kanban' | 'calendar';

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
  viewMode?: TaskViewMode;
  onViewModeChange?: (viewMode: TaskViewMode) => void;
}

export function ProjectTaskPanel({
  activeProject,
  compact = false,
  expandableItems = false,
  listMaxHeightClass,
  readOnly = false,
  headerAction,
  refreshKey = 0,
  viewMode,
  onViewModeChange,
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
  const [internalTaskViewMode, setInternalTaskViewMode] = useState<TaskViewMode>('list');
  const [selectedTaskDetailId, setSelectedTaskDetailId] = useState<string | null>(null);
  const [calendarAnchorDate, setCalendarAnchorDate] = useState(() => new Date());
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});
  const [savingDescriptionIds, setSavingDescriptionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeProject) {
      setTasks([]);
      setAvailableArtifacts([]);
      setNotionMappings({});
      setSelectedArtifactByTaskId({});
      setDescriptionDrafts({});
      setIsCreateDialogOpen(false);
      setSelectedTaskDetailId(null);
      return;
    }

    void loadTasks(activeProject.id);
    void loadArtifacts(activeProject.id);
    void loadNotionMappings(activeProject.id);
    setSelectedArtifactByTaskId({});
    setDescriptionDrafts({});
    setIsCreateDialogOpen(false);
    setSelectedTaskDetailId(null);
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
  const selectedTaskDetail = useMemo(
    () => tasks.find((task) => task.id === selectedTaskDetailId) ?? null,
    [selectedTaskDetailId, tasks]
  );
  const showViewSwitcher = !readOnly && expandableItems;
  const taskViewMode = viewMode ?? internalTaskViewMode;
  const setTaskViewMode = onViewModeChange ?? setInternalTaskViewMode;
  const showInternalViewSwitcher = showViewSwitcher && !viewMode;

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

  async function handleSaveTaskDescription(task: ProjectTask) {
    const nextDescription = (descriptionDrafts[task.id] ?? task.description ?? '').trim();
    const currentDescription = task.description ?? '';

    if (nextDescription === currentDescription) {
      return;
    }

    setSavingDescriptionIds((prev) => new Set(prev).add(task.id));
    try {
      const updated = await updateProjectTask(task.id, {
        description: nextDescription || null,
      });

      setTasks((prev) =>
        sortTasks(prev.map((row) => (row.id === task.id ? updated : row)))
      );
      setDescriptionDrafts((prev) => ({ ...prev, [task.id]: updated.description ?? '' }));
      toast.success('Task notes updated');
    } catch (error: any) {
      toast.error('Failed to update task notes', {
        description: error?.message ?? 'Unable to save the notes.',
      });
    } finally {
      setSavingDescriptionIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
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

  function renderTaskDescriptionEditor(task: ProjectTask) {
    const currentDescription = task.description ?? '';
    const draft = descriptionDrafts[task.id] ?? currentDescription;
    const isSaving = savingDescriptionIds.has(task.id);
    const hasChanges = draft.trim() !== currentDescription;

    return (
      <div className="space-y-2 rounded-lg border border-[#E5E7EB] bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${task.id}-description`} className="text-sm font-medium text-[#111827]">
            Notes / Description
          </Label>
          {hasChanges ? (
            <span className="text-xs text-[#6B7280]">Unsaved changes</span>
          ) : null}
        </div>
        <Textarea
          id={`${task.id}-description`}
          value={draft}
          onChange={(event) =>
            setDescriptionDrafts((prev) => ({
              ...prev,
              [task.id]: event.target.value,
            }))
          }
          placeholder="Add additional context, notes, acceptance hints, or follow-up details for this task."
          disabled={isSaving}
          className="min-h-[110px] resize-y"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDescriptionDrafts((prev) => ({
                ...prev,
                [task.id]: currentDescription,
              }))
            }
            disabled={isSaving || !hasChanges}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSaveTaskDescription(task)}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save notes'
            )}
          </Button>
        </div>
      </div>
    );
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
    const descriptionEditor = renderTaskDescriptionEditor(task);
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
          <TaskActionButton
            label="View Artifact"
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={() => navigate(linkedArtifactRoute)}
          />
        ) : null}
        {task.related_module && task.status === 'open' ? (
          <TaskActionButton
            label="Open Module"
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={() => navigate(TASK_MODULE_ROUTES[task.related_module!])}
          />
        ) : null}
        <TaskActionButton
          label={task.status === 'completed' ? 'Reopen' : 'Complete'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          variant={task.status === 'completed' ? 'outline' : 'default'}
          onClick={() => void handleToggleTask(task)}
        />
        <TaskActionButton
          label={notionMapping?.last_sync_status === 'success' ? 'Update Notion' : 'Add to Notion'}
          icon={
            isExportingTask ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )
          }
          onClick={() => void handleExportTask(task)}
          disabled={isExportingTask}
        />
        {notionMapping?.notion_url && notionMapping.last_sync_status === 'success' ? (
          <Button asChild variant="outline" size="sm" className="h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3">
            <a href={notionMapping.notion_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Open Notion Task</span>
            </a>
          </Button>
        ) : null}
      </TaskActionStack>
    );
    const detailsContent = (
      <div className="space-y-4">
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
            <span>Completed via: {linkedArtifactLabel}</span>
          ) : null}
          {notionMapping?.last_sync_status === 'success' ? (
            <span>Synced {new Date(notionMapping.last_synced_at).toLocaleDateString()}</span>
          ) : null}
        </div>

        {descriptionEditor}
        {artifactLinker}
        {actions}
      </div>
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
              {detailsContent}
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
        <div className={`${compact ? 'space-y-3' : 'grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start'}`}>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`min-w-0 flex-1 text-sm font-medium ${task.status === 'completed' ? 'text-[#6B7280] line-through' : 'text-[#111827]'}`}>
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

            <div className={`flex text-xs text-[#6B7280] ${compact ? 'flex-col gap-1' : 'flex-wrap items-center gap-3'}`}>
              {dueLabel ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Due {dueLabel}
                </span>
              ) : (
                <span>No due date</span>
              )}
              {!compact ? (
                <>
                  <span>Created by: {task.created_by_email ?? 'Unknown'}</span>
                  <span>Updated by: {task.updated_by_email ?? task.created_by_email ?? 'Unknown'}</span>
                </>
              ) : null}
              {task.status === 'completed' && linkedArtifactLabel ? (
                <span>
                  Completed via: {linkedArtifactLabel}
                </span>
              ) : null}
              {notionMapping?.last_sync_status === 'success' ? (
                <span>Synced {new Date(notionMapping.last_synced_at).toLocaleDateString()}</span>
              ) : null}
            </div>

          </div>

          <div className={compact ? 'pt-1' : ''}>
            {actions}
          </div>
        </div>
      </div>
    );
  }

  function renderTaskTicket(task: ProjectTask) {
    const moduleLabel = task.related_module
      ? PROJECT_TASK_MODULE_LABELS[task.related_module]
      : null;
    const dueLabel = task.due_date
      ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString()
      : 'No due date';

    return (
      <button
        key={task.id}
        type="button"
        onClick={() => setSelectedTaskDetailId(task.id)}
        className={`w-full rounded-lg border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2 ${
          task.status === 'completed'
            ? 'border-emerald-200 bg-emerald-50/70'
            : 'border-[#D7E3F8] bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-[#065F46] line-through' : 'text-[#111827]'}`}>
            {task.title}
          </p>
          <Badge variant={task.status === 'completed' ? 'secondary' : 'outline'}>
            {task.status === 'completed' ? 'Done' : 'Open'}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6B7280]">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {dueLabel}
          </span>
          {moduleLabel ? <span>{moduleLabel}</span> : null}
        </div>
      </button>
    );
  }

  function renderKanbanView() {
    const columns = [
      { key: 'open', title: 'Open', items: openTasks },
      { key: 'completed', title: 'Completed', items: completedTasks },
    ];

    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {columns.map((column) => (
          <section
            key={column.key}
            className="min-h-[320px] rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#111827]">{column.title}</h3>
              <Badge variant={column.key === 'open' ? 'outline' : 'secondary'}>
                {column.items.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {column.items.length > 0 ? (
                column.items.map(renderTaskTicket)
              ) : (
                <div className="rounded-lg border border-dashed border-[#CBD5E1] bg-white/70 p-4 text-sm text-[#64748B]">
                  No {column.title.toLowerCase()} tasks.
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    );
  }

  function renderCalendarView() {
    const year = calendarAnchorDate.getFullYear();
    const month = calendarAnchorDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: Math.ceil((startOffset + daysInMonth) / 7) * 7 }, (_, index) => {
      const dayNumber = index - startOffset + 1;
      return dayNumber >= 1 && dayNumber <= daysInMonth ? dayNumber : null;
    });
    const tasksByDate = tasks.reduce<Record<string, ProjectTask[]>>((acc, task) => {
      if (!task.due_date) return acc;
      acc[task.due_date] = [...(acc[task.due_date] ?? []), task];
      return acc;
    }, {});
    const monthLabel = calendarAnchorDate.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });

    return (
      <div className="rounded-xl border border-[#E5E7EB] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[#111827]">{monthLabel}</h3>
            <p className="text-xs text-[#6B7280]">Open tasks are blue. Completed tasks are green.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCalendarAnchorDate(new Date(year, month - 1, 1))}
              aria-label="Previous month"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCalendarAnchorDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCalendarAnchorDate(new Date(year, month + 1, 1))}
              aria-label="Next month"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-[#E5E7EB] bg-[#F8FAFC] text-center text-xs font-medium text-[#64748B]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="px-2 py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((dayNumber, index) => {
            const dateKey = dayNumber
              ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
              : null;
            const dayTasks = dateKey ? tasksByDate[dateKey] ?? [] : [];

            return (
              <div
                key={`${dayNumber ?? 'blank'}-${index}`}
                className="min-h-[118px] border-b border-r border-[#E5E7EB] p-2 last:border-r-0"
              >
                {dayNumber ? (
                  <>
                    <div className="mb-2 text-xs font-medium text-[#64748B]">{dayNumber}</div>
                    <div className="space-y-1.5">
                      {dayTasks.slice(0, 3).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setSelectedTaskDetailId(task.id)}
                          className={`block w-full truncate rounded-md px-2 py-1 text-left text-xs font-medium ${
                            task.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                          title={task.title}
                        >
                          {task.title}
                        </button>
                      ))}
                      {dayTasks.length > 3 ? (
                        <p className="text-xs text-[#64748B]">+{dayTasks.length - 3} more</p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderTaskDetailModal(task: ProjectTask | null) {
    if (!task) return null;

    const moduleLabel = task.related_module
      ? PROJECT_TASK_MODULE_LABELS[task.related_module]
      : null;
    const dueLabel = task.due_date
      ? new Date(`${task.due_date}T00:00:00`).toLocaleDateString()
      : 'No due date';
    const linkedArtifactLabel = task.completed_artifact_type
      ? PROJECT_TASK_MODULE_LABELS[task.completed_artifact_type]
      : null;

    return (
      <Dialog open={!!selectedTaskDetailId} onOpenChange={(open) => !open && setSelectedTaskDetailId(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{task.title}</DialogTitle>
            <DialogDescription>
              Task detail for this project workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={task.status === 'completed' ? 'secondary' : 'outline'}>
                {task.status === 'completed' ? 'Completed' : 'Open'}
              </Badge>
              {moduleLabel ? (
                <Badge variant="outline" className="bg-[#EFF6FF] text-[#1D4ED8]">
                  {moduleLabel}
                </Badge>
              ) : null}
              <NotionStatusBadge mapping={notionMappings[task.id]} />
            </div>

            <div className="grid gap-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm text-[#4B5563] sm:grid-cols-2">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#64748B]" />
                {dueLabel}
              </span>
              <span>Created by: {task.created_by_email ?? 'Unknown'}</span>
              <span>Updated by: {task.updated_by_email ?? task.created_by_email ?? 'Unknown'}</span>
              {linkedArtifactLabel ? <span>Completed via: {linkedArtifactLabel}</span> : null}
            </div>

            {renderTaskDescriptionEditor(task)}
          </div>
        </DialogContent>
      </Dialog>
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
            {showInternalViewSwitcher ? (
              <div className="flex rounded-lg border border-[#E5E7EB] bg-white p-1">
                {[
                  { value: 'list' as const, label: 'List', icon: ClipboardList },
                  { value: 'kanban' as const, label: 'Kanban', icon: ClipboardList },
                  { value: 'calendar' as const, label: 'Calendar', icon: CalendarDays },
                ].map((view) => {
                  const Icon = view.icon;
                  const isActive = taskViewMode === view.value;
                  return (
                    <Button
                      key={view.value}
                      type="button"
                      size="sm"
                      variant={isActive ? 'default' : 'ghost'}
                      onClick={() => setTaskViewMode(view.value)}
                      className="h-8 gap-1.5 px-2"
                      aria-label={`${view.label} view`}
                      title={`${view.label} view`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden lg:inline">{view.label}</span>
                    </Button>
                  );
                })}
              </div>
            ) : null}
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
            ) : showViewSwitcher && taskViewMode === 'kanban' ? (
              renderKanbanView()
            ) : showViewSwitcher && taskViewMode === 'calendar' ? (
              renderCalendarView()
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
            {renderTaskDetailModal(selectedTaskDetail)}
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
    <div className="flex w-full flex-wrap items-center gap-2 md:justify-end">
      {children}
    </div>
  );
}

function TaskActionButton({
  label,
  icon,
  variant = 'outline',
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
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
      title={label}
      aria-label={label}
      className="h-9 w-9 shrink-0 px-0 sm:w-auto sm:px-3"
    >
      <span className="sm:mr-2">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
