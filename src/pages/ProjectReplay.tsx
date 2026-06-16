import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronsRight,
  CircleDot,
  Clock3,
  FileText,
  Filter,
  GitBranch,
  HelpCircle,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Search,
  Sparkles,
  SplitSquareVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageShell } from '@/components/PageShell';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { supabase } from '@/lib/supabase';
import { getArtifactRoute } from '@/lib/artifactRouting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectTask } from '@/types/project-tasks';

type ArtifactRow = {
  id: string;
  created_at: string;
  artifact_type: string;
  artifact_name: string | null;
  output_data: string | null;
  created_by_email?: string | null;
  metadata?: Record<string, unknown> | null;
};

type DecisionRow = {
  id: string;
  created_at: string;
  decision_text: string;
  decision_summary: string | null;
  decision_maker: string | null;
  source_evidence: string | null;
  source_artifact_id: string | null;
  source_artifact_type: string | null;
  source_artifact_name: string | null;
};

type MemoryItemRow = {
  id: string;
  created_at: string;
  item_type: 'open_question' | 'assumption';
  title: string;
  detail: string | null;
  owner_or_source: string | null;
  source_evidence: string | null;
  source_artifact_id: string | null;
  source_artifact_type: string | null;
  source_artifact_name: string | null;
};

type ReplayLens = 'all' | 'artifacts' | 'decisions' | 'open-loops' | 'delivery';
type SnapshotPreset = 'selected' | 'current' | 'custom';

type ReplayEventType =
  | 'artifact'
  | 'decision'
  | 'open_question'
  | 'assumption'
  | 'task_created'
  | 'task_completed';

type ReplayEvent = {
  id: string;
  timestamp: string;
  type: ReplayEventType;
  title: string;
  summary: string;
  detail?: string | null;
  badge: string;
  route: string | null;
  routeLabel: string;
  moduleLabel?: string | null;
  actorLabel?: string | null;
  evidence?: string | null;
  sourceLabel?: string | null;
  impactNote: string;
  metadata?: Record<string, unknown> | null;
};

type SnapshotState = {
  timestamp: string;
  decisions: ReplayEvent[];
  openQuestions: ReplayEvent[];
  assumptions: ReplayEvent[];
  artifacts: ReplayEvent[];
  tasksOpen: ReplayEvent[];
  tasksCompleted: ReplayEvent[];
};

type ChangeRelation =
  | 'new'
  | 'confirmed'
  | 'refined'
  | 'contradiction'
  | 'coexists'
  | 'resolved'
  | 'persisting';

type ClassifiedChange = {
  event: ReplayEvent;
  relation: ChangeRelation;
  reason: string;
};

const ARTIFACT_LABELS: Record<string, string> = {
  meeting_intelligence: 'Project Notes',
  product_documentation: 'Product Documentation',
  release_communications: 'Release Communications',
  prioritization: 'Discovery',
};

const EVENT_STYLES: Record<
  ReplayEventType,
  {
    icon: typeof MessageSquareText;
    accent: string;
    badgeClass: string;
    ringClass: string;
    surfaceClass: string;
  }
> = {
  artifact: {
    icon: FileText,
    accent: 'text-blue-700',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
    ringClass: 'ring-blue-100',
    surfaceClass: 'bg-blue-50 text-blue-700',
  },
  decision: {
    icon: GitBranch,
    accent: 'text-violet-700',
    badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
    ringClass: 'ring-violet-100',
    surfaceClass: 'bg-violet-50 text-violet-700',
  },
  open_question: {
    icon: HelpCircle,
    accent: 'text-amber-700',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    ringClass: 'ring-amber-100',
    surfaceClass: 'bg-amber-50 text-amber-700',
  },
  assumption: {
    icon: Lightbulb,
    accent: 'text-emerald-700',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    ringClass: 'ring-emerald-100',
    surfaceClass: 'bg-emerald-50 text-emerald-700',
  },
  task_created: {
    icon: ListChecks,
    accent: 'text-slate-700',
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    ringClass: 'ring-slate-100',
    surfaceClass: 'bg-slate-50 text-slate-700',
  },
  task_completed: {
    icon: CheckCircle2,
    accent: 'text-green-700',
    badgeClass: 'border-green-200 bg-green-50 text-green-700',
    ringClass: 'ring-green-100',
    surfaceClass: 'bg-green-50 text-green-700',
  },
};

export default function ProjectReplay() {
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();
  const [loading, setLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [memoryItems, setMemoryItems] = useState<MemoryItemRow[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [lens, setLens] = useState<ReplayLens>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [baselinePreset, setBaselinePreset] = useState<SnapshotPreset>('selected');
  const [comparisonPreset, setComparisonPreset] = useState<SnapshotPreset>('current');
  const [baselineCustomDate, setBaselineCustomDate] = useState('');
  const [comparisonCustomDate, setComparisonCustomDate] = useState('');

  useEffect(() => {
    if (!activeProject) {
      setArtifacts([]);
      setDecisions([]);
      setMemoryItems([]);
      setTasks([]);
      setSelectedEventId(null);
      return;
    }

    void loadReplayData(activeProject.id);
  }, [activeProject?.id]);

  async function loadReplayData(projectId: string) {
    setLoading(true);
    try {
      const [artifactsResult, decisionsResult, memoryItemsResult, tasksResult] = await Promise.all([
        supabase
          .from('project_artifacts')
          .select('id, created_at, artifact_type, artifact_name, output_data, created_by_email, metadata')
          .eq('project_id', projectId)
          .eq('status', 'active')
          .neq('artifact_type', 'pm_advisor_feedback')
          .order('created_at', { ascending: false }),
        supabase
          .from('project_decisions')
          .select('id, created_at, decision_text, decision_summary, decision_maker, source_evidence, source_artifact_id, source_artifact_type, source_artifact_name')
          .eq('project_id', projectId)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('project_memory_items')
          .select('id, created_at, item_type, title, detail, owner_or_source, source_evidence, source_artifact_id, source_artifact_type, source_artifact_name')
          .eq('project_id', projectId)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
        supabase
          .from('project_tasks')
          .select('*')
          .eq('project_id', projectId)
          .in('status', ['open', 'completed'])
          .order('updated_at', { ascending: false }),
      ]);

      if (artifactsResult.error || decisionsResult.error || memoryItemsResult.error || tasksResult.error) {
        throw new Error(
          artifactsResult.error?.message ||
            decisionsResult.error?.message ||
            memoryItemsResult.error?.message ||
            tasksResult.error?.message ||
            'Failed to load replay data'
        );
      }

      setArtifacts((artifactsResult.data ?? []) as ArtifactRow[]);
      setDecisions((decisionsResult.data ?? []) as DecisionRow[]);
      setMemoryItems((memoryItemsResult.data ?? []) as MemoryItemRow[]);
      setTasks((tasksResult.data ?? []) as ProjectTask[]);
    } catch (error: any) {
      toast.error('Failed to load project replay', {
        description: error?.message ?? 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  const replayEvents = useMemo(() => {
    const artifactEvents: ReplayEvent[] = artifacts.map((artifact) => {
      const metadata = artifact.metadata ?? {};
      const moduleLabel = ARTIFACT_LABELS[artifact.artifact_type] ?? 'Artifact';
      const actionCount = Array.isArray(metadata.action_items) ? metadata.action_items.length : 0;
      const decisionCount = Array.isArray(metadata.decisions) ? metadata.decisions.length : 0;
      const openQuestionCount = Array.isArray(metadata.open_questions) ? metadata.open_questions.length : 0;
      const assumptionCount = Array.isArray(metadata.assumptions) ? metadata.assumptions.length : 0;
      const impactParts = [
        actionCount > 0 ? `${actionCount} action item${actionCount === 1 ? '' : 's'}` : null,
        decisionCount > 0 ? `${decisionCount} decision${decisionCount === 1 ? '' : 's'}` : null,
        openQuestionCount > 0 ? `${openQuestionCount} open question${openQuestionCount === 1 ? '' : 's'}` : null,
        assumptionCount > 0 ? `${assumptionCount} assumption${assumptionCount === 1 ? '' : 's'}` : null,
      ].filter(Boolean);

      return {
        id: `artifact-${artifact.id}`,
        timestamp: artifact.created_at,
        type: 'artifact',
        title: artifactDisplayName(artifact),
        summary: excerptFromText(artifact.output_data, 180),
        detail: artifact.output_data,
        badge: moduleLabel,
        route: getArtifactRoute(artifact.artifact_type, artifact.id),
        routeLabel: 'Open Artifact',
        moduleLabel,
        actorLabel: artifact.created_by_email ?? null,
        evidence: null,
        sourceLabel: null,
        impactNote:
          impactParts.length > 0
            ? `This moment produced ${impactParts.join(', ')}.`
            : 'This moment added a new artifact to the project record.',
        metadata,
      };
    });

    const decisionEvents: ReplayEvent[] = decisions.map((decision) => ({
      id: `decision-${decision.id}`,
      timestamp: decision.created_at,
      type: 'decision',
      title: decision.decision_summary || decision.decision_text,
      summary: decision.decision_text,
      detail: null,
      badge: 'Decision',
      route:
        decision.source_artifact_id && decision.source_artifact_type
          ? getArtifactRoute(decision.source_artifact_type, decision.source_artifact_id)
          : null,
      routeLabel: 'Open Source Note',
      moduleLabel: decision.source_artifact_name ?? 'Captured from project notes',
      actorLabel: decision.decision_maker,
      evidence: decision.source_evidence,
      sourceLabel: decision.source_artifact_name,
      impactNote: 'A previously discussed topic became a confirmed project decision.',
      metadata: null,
    }));

    const memoryEvents: ReplayEvent[] = memoryItems.map((item) => {
      const type = item.item_type;
      return {
        id: `${type}-${item.id}`,
        timestamp: item.created_at,
        type,
        title: item.title,
        summary: item.detail || item.title,
        detail: item.detail,
        badge: type === 'assumption' ? 'Assumption' : 'Open Question',
        route:
          item.source_artifact_id && item.source_artifact_type
            ? getArtifactRoute(item.source_artifact_type, item.source_artifact_id)
            : null,
        routeLabel: 'Open Source Note',
        moduleLabel: item.source_artifact_name ?? 'Captured from project notes',
        actorLabel: item.owner_or_source,
        evidence: item.source_evidence,
        sourceLabel: item.source_artifact_name,
        impactNote:
          type === 'assumption'
            ? 'This captures a condition the project is currently relying on.'
            : 'This preserves an unresolved gap so it does not disappear between meetings.',
        metadata: null,
      };
    });

    const taskEvents: ReplayEvent[] = tasks.flatMap((task) => {
      const createdEvent: ReplayEvent = {
        id: `task-created-${task.id}`,
        timestamp: task.created_at,
        type: 'task_created',
        title: task.title,
        summary: task.description || 'Task created for follow-through.',
        detail: task.description,
        badge: 'Task Created',
        route: '/tasks',
        routeLabel: 'Open Tasks',
        moduleLabel: task.related_module ? ARTIFACT_LABELS[task.related_module] : 'General Task',
        actorLabel: task.created_by_email ?? null,
        evidence: null,
        sourceLabel: null,
        impactNote: 'An idea or obligation moved into tracked delivery work.',
        metadata: null,
      };

      const completedEvent: ReplayEvent[] =
        task.completed_at
          ? [
              {
                id: `task-completed-${task.id}`,
                timestamp: task.completed_at,
                type: 'task_completed',
                title: task.title,
                summary: task.description || 'Task marked complete.',
                detail: task.description,
                badge: 'Task Completed',
                route: '/tasks',
                routeLabel: 'Open Tasks',
                moduleLabel: task.related_module ? ARTIFACT_LABELS[task.related_module] : 'General Task',
                actorLabel: task.updated_by_email ?? task.created_by_email ?? null,
                evidence: null,
                sourceLabel: null,
                impactNote: 'A tracked piece of execution closed the loop on earlier planning.',
                metadata: null,
              },
            ]
          : [];

      return [createdEvent, ...completedEvent];
    });

    return [...artifactEvents, ...decisionEvents, ...memoryEvents, ...taskEvents].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [artifacts, decisions, memoryItems, tasks]);

  const filteredEvents = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();

    return replayEvents.filter((event) => {
      const matchesLens =
        lens === 'all'
          ? true
          : lens === 'artifacts'
            ? event.type === 'artifact'
            : lens === 'decisions'
              ? event.type === 'decision' || event.type === 'assumption'
              : lens === 'open-loops'
                ? event.type === 'open_question' || event.type === 'assumption'
                : event.type === 'task_created' || event.type === 'task_completed';

      if (!matchesLens) return false;

      if (!normalized) return true;

      const haystack = [
        event.title,
        event.summary,
        event.badge,
        event.moduleLabel,
        event.actorLabel,
        event.evidence,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [lens, replayEvents, searchQuery]);

  useEffect(() => {
    if (!filteredEvents.length) {
      setSelectedEventId(null);
      return;
    }

    if (!selectedEventId || !filteredEvents.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(filteredEvents[0].id);
    }
  }, [filteredEvents, selectedEventId]);

  const selectedEvent = filteredEvents.find((event) => event.id === selectedEventId) ?? null;

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce<Record<string, ReplayEvent[]>>((acc, event) => {
      const key = new Date(event.timestamp).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
  }, [filteredEvents]);

  const selectedEventTimestamp = selectedEvent?.timestamp ?? replayEvents[0]?.timestamp ?? null;

  useEffect(() => {
    if (!selectedEventTimestamp) return;
    if (!baselineCustomDate) {
      setBaselineCustomDate(toDateTimeLocalValue(selectedEventTimestamp));
    }
    if (!comparisonCustomDate) {
      setComparisonCustomDate(toDateTimeLocalValue(replayEvents[0]?.timestamp ?? selectedEventTimestamp));
    }
  }, [comparisonCustomDate, baselineCustomDate, selectedEventTimestamp, replayEvents]);

  const baselineTimestamp = resolveSnapshotTimestamp(
    baselinePreset,
    selectedEventTimestamp,
    replayEvents[0]?.timestamp ?? null,
    baselineCustomDate
  );
  const comparisonTimestamp = resolveSnapshotTimestamp(
    comparisonPreset,
    selectedEventTimestamp,
    replayEvents[0]?.timestamp ?? null,
    comparisonCustomDate
  );

  const baselineState = useMemo(
    () => (baselineTimestamp ? buildSnapshotState(replayEvents, baselineTimestamp) : null),
    [baselineTimestamp, replayEvents]
  );
  const comparisonState = useMemo(
    () => (comparisonTimestamp ? buildSnapshotState(replayEvents, comparisonTimestamp) : null),
    [comparisonTimestamp, replayEvents]
  );

  const comparisonSummary = useMemo(
    () =>
      baselineState && comparisonState
        ? compareSnapshotStates(baselineState, comparisonState)
        : null,
    [baselineState, comparisonState]
  );

  const replayStats = useMemo(() => {
    const openQuestionCount = memoryItems.filter((item) => item.item_type === 'open_question').length;
    const assumptionCount = memoryItems.filter((item) => item.item_type === 'assumption').length;
    const completedTaskCount = tasks.filter((task) => task.status === 'completed').length;

    return [
      {
        label: 'Artifacts',
        value: artifacts.length,
        meta: `${artifacts.filter((artifact) => artifact.artifact_type === 'meeting_intelligence').length} project notes captured`,
        icon: FileText,
        accent: 'text-blue-700',
        surface: 'bg-blue-50',
      },
      {
        label: 'Decisions',
        value: decisions.length,
        meta: `${assumptionCount} assumptions tracked`,
        icon: GitBranch,
        accent: 'text-violet-700',
        surface: 'bg-violet-50',
      },
      {
        label: 'Open Loops',
        value: openQuestionCount + tasks.filter((task) => task.status === 'open').length,
        meta: `${openQuestionCount} open questions still unresolved`,
        icon: HelpCircle,
        accent: 'text-amber-700',
        surface: 'bg-amber-50',
      },
      {
        label: 'Completed Work',
        value: completedTaskCount,
        meta: `${tasks.length} total tracked tasks`,
        icon: CheckCircle2,
        accent: 'text-emerald-700',
        surface: 'bg-emerald-50',
      },
    ];
  }, [artifacts, decisions, memoryItems, tasks]);

  return (
    <PageShell
      eyebrow="Project Memory"
      title="Project Replay"
      icon={Sparkles}
      description={`Replay how ${activeProject?.name ?? 'this project'} evolved across notes, decisions, assumptions, open questions, and delivery work.`}
      action={
        <Button
          variant="outline"
          className="gap-2 border-slate-200 bg-white"
          onClick={() => navigate('/context')}
        >
          Open Memory Assistant
          <ArrowRight className="h-4 w-4" />
        </Button>
      }
    >
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {replayStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="border-slate-200 shadow-sm">
              <CardContent className="flex items-start gap-4 p-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${stat.surface} ${stat.accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{stat.value}</p>
                  <p className="mt-1 text-sm text-slate-600">{stat.meta}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.98fr)_minmax(340px,0.72fr)] xl:items-start">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-4 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl text-slate-950">Replay Timeline</CardTitle>
                <CardDescription>
                  A chronological record of what the project knew, decided, questioned, and completed.
                </CardDescription>
              </div>
              <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-600">
                {filteredEvents.length} visible moments
              </Badge>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <ToggleGroup
                type="single"
                value={lens}
                onValueChange={(value) => value && setLens(value as ReplayLens)}
                className="flex flex-wrap justify-start"
              >
                <ToggleGroupItem value="all" aria-label="Show all replay moments">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="artifacts" aria-label="Show artifact moments">
                  Artifacts
                </ToggleGroupItem>
                <ToggleGroupItem value="decisions" aria-label="Show decision moments">
                  Decisions
                </ToggleGroupItem>
                <ToggleGroupItem value="open-loops" aria-label="Show unresolved moments">
                  Open Loops
                </ToggleGroupItem>
                <ToggleGroupItem value="delivery" aria-label="Show delivery moments">
                  Delivery
                </ToggleGroupItem>
              </ToggleGroup>

              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search replay moments"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)]">
              <SnapshotSelector
                title="Baseline Snapshot"
                description="What the project believed before the comparison point."
                preset={baselinePreset}
                onPresetChange={setBaselinePreset}
                customDate={baselineCustomDate}
                onCustomDateChange={setBaselineCustomDate}
                resolvedTimestamp={baselineTimestamp}
              />

              <div className="hidden items-center justify-center lg:flex">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm">
                  <ChevronsRight className="h-5 w-5" />
                </span>
              </div>

              <SnapshotSelector
                title="Comparison Snapshot"
                description="The later state you want to compare against."
                preset={comparisonPreset}
                onPresetChange={setComparisonPreset}
                customDate={comparisonCustomDate}
                onCustomDateChange={setComparisonCustomDate}
                resolvedTimestamp={comparisonTimestamp}
              />
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                No replay moments match the current filters yet.
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-320px)] pr-3">
                <div className="space-y-8">
                  {Object.entries(groupedEvents).map(([dateLabel, events]) => (
                    <div key={dateLabel}>
                      <div className="mb-3 flex items-center gap-3">
                        <div className="h-px flex-1 bg-slate-200" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {dateLabel}
                        </span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>

                      <div className="space-y-3">
                        {events.map((event) => {
                          const style = EVENT_STYLES[event.type];
                          const Icon = style.icon;
                          const isSelected = selectedEventId === event.id;

                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => setSelectedEventId(event.id)}
                              className={`group relative flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-all ${
                                isSelected
                                  ? 'border-slate-900 bg-slate-50 shadow-sm'
                                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                              }`}
                            >
                              <div className="relative flex flex-col items-center">
                                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ring-1 ${style.surfaceClass} ${style.ringClass}`}>
                                  <Icon className="h-5 w-5" />
                                </span>
                                <span className="mt-2 h-full w-px bg-slate-200 group-last:hidden" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className={style.badgeClass}>
                                        {event.badge}
                                      </Badge>
                                      {event.moduleLabel ? (
                                        <span className="text-xs font-medium text-slate-500">
                                          {event.moduleLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                    <h3 className="mt-2 text-base font-semibold text-slate-950">
                                      {event.title}
                                    </h3>
                                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                                      {event.summary}
                                    </p>
                                  </div>

                                  <div className="shrink-0 text-right">
                                    <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                                      <Clock3 className="h-3.5 w-3.5" />
                                      {formatTimestamp(event.timestamp)}
                                    </p>
                                  </div>
                                </div>

                                <p className="mt-3 text-xs font-medium text-slate-500">
                                  {event.impactNote}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6 xl:sticky xl:top-6">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                  <SplitSquareVertical className="h-5 w-5 text-blue-600" />
                  Snapshot Compare
                </CardTitle>
                <CardDescription>
                  Compare project state between two replay cutoffs instead of guessing from one artifact.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {!comparisonSummary || !baselineState || !comparisonState ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                Pick valid snapshot dates to compare project state.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniDetailCard
                    label="Baseline"
                    value={formatTimestamp(baselineState.timestamp)}
                    icon={Clock3}
                  />
                  <MiniDetailCard
                    label="Comparison"
                    value={formatTimestamp(comparisonState.timestamp)}
                    icon={ArrowRight}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniDetailCard
                    label="What changed"
                    value={`${comparisonSummary.totalChanges} meaningful shifts detected`}
                    icon={Sparkles}
                  />
                  <MiniDetailCard
                    label="Still unresolved"
                    value={`${comparisonState.openQuestions.length} open question${comparisonState.openQuestions.length === 1 ? '' : 's'} active at the comparison snapshot`}
                    icon={HelpCircle}
                  />
                </div>

                <SnapshotDeltaSection
                  title="New Since Baseline"
                  emptyLabel="No new tracked state appeared between these snapshots."
                  items={comparisonSummary.newItems}
                  tone="blue"
                />

                <SnapshotDeltaSection
                  title="Resolved or Removed"
                  emptyLabel="Nothing previously tracked disappeared or resolved in this window."
                  items={comparisonSummary.resolvedItems}
                  tone="emerald"
                />

                <SnapshotDeltaSection
                  title="Still True"
                  emptyLabel="No persistent tracked items were shared between the snapshots."
                  items={comparisonSummary.persistingItems}
                  tone="slate"
                  limit={4}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-slate-950">Selected Moment</CardTitle>
                <CardDescription>
                  Inspect what changed here and jump back to the source artifact or work item.
                </CardDescription>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                <Filter className="h-5 w-5" />
              </span>
            </div>
          </CardHeader>

          <CardContent>
            {!selectedEvent ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                Select a replay moment to inspect its context.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={EVENT_STYLES[selectedEvent.type].badgeClass}>
                      {selectedEvent.badge}
                    </Badge>
                    {selectedEvent.moduleLabel ? (
                      <Badge variant="secondary">{selectedEvent.moduleLabel}</Badge>
                    ) : null}
                  </div>

                  <h3 className="mt-3 text-xl font-semibold text-slate-950">
                    {selectedEvent.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {selectedEvent.summary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{formatTimestamp(selectedEvent.timestamp)}</span>
                    {selectedEvent.actorLabel ? <span>Actor: {selectedEvent.actorLabel}</span> : null}
                    {selectedEvent.sourceLabel ? <span>Source: {selectedEvent.sourceLabel}</span> : null}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniDetailCard
                    label="Why this matters"
                    value={selectedEvent.impactNote}
                    icon={CircleDot}
                  />
                  <MiniDetailCard
                    label="Replay signal"
                    value={replaySignalLabel(selectedEvent.type)}
                    icon={Sparkles}
                  />
                </div>

                {selectedEvent.evidence ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Source Evidence
                    </p>
                    <p className="mt-2 border-l-2 border-blue-200 pl-3 text-sm leading-6 text-slate-600">
                      "{selectedEvent.evidence}"
                    </p>
                  </div>
                ) : null}

                {selectedEvent.detail ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Detail Snapshot
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                      {excerptFromText(selectedEvent.detail, 900)}
                    </p>
                  </div>
                ) : null}

                {selectedEvent.route ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate(selectedEvent.route!)}
                  >
                    {selectedEvent.routeLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </PageShell>
  );
}

function artifactDisplayName(artifact: ArtifactRow) {
  if (artifact.artifact_type === 'prioritization') {
    return (
      artifact.artifact_name ||
      ((artifact.metadata?.problem_area as string | undefined)?.trim?.() ??
        (artifact.metadata?.research_goal as string | undefined)?.trim?.()) ||
      'Untitled Discovery Brief'
    );
  }

  return artifact.artifact_name || ARTIFACT_LABELS[artifact.artifact_type] || 'Untitled Artifact';
}

function stripMarkdown(text: string) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptFromText(text: string | null | undefined, maxLength: number) {
  const clean = stripMarkdown(text || '');
  if (!clean) return 'No summary available yet.';
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trim()}...` : clean;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function replaySignalLabel(type: ReplayEventType) {
  switch (type) {
    case 'artifact':
      return 'Creation moment';
    case 'decision':
      return 'Decision lock-in';
    case 'open_question':
      return 'Unresolved gap';
    case 'assumption':
      return 'Operating assumption';
    case 'task_created':
      return 'Execution kickoff';
    case 'task_completed':
      return 'Execution closure';
    default:
      return 'Replay event';
  }
}

function formatRelationLabel(relation: ChangeRelation) {
  switch (relation) {
    case 'new':
      return 'New';
    case 'confirmed':
      return 'Confirmed';
    case 'refined':
      return 'Refined';
    case 'contradiction':
      return 'Potential Conflict';
    case 'coexists':
      return 'Coexists';
    case 'resolved':
      return 'Resolved';
    case 'persisting':
      return 'Still True';
    default:
      return 'Changed';
  }
}

function resolveSnapshotTimestamp(
  preset: SnapshotPreset,
  selectedEventTimestamp: string | null,
  currentTimestamp: string | null,
  customDate: string
) {
  if (preset === 'selected') return selectedEventTimestamp;
  if (preset === 'current') return currentTimestamp;
  return customDate ? new Date(customDate).toISOString() : null;
}

function normalizeComparisonKey(event: ReplayEvent) {
  const normalizedTitle = event.title.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${event.type}:${normalizedTitle}`;
}

function normalizeTopicKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|and|for|with|from|that|this|into|will|have|has)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTopicTokens(value: string) {
  return normalizeTopicKey(value)
    .split(' ')
    .filter((token) => token.length > 2);
}

function areLikelySameTopic(left: ReplayEvent, right: ReplayEvent) {
  const leftKey = normalizeTopicKey(left.title);
  const rightKey = normalizeTopicKey(right.title);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) return true;

  const leftTokens = getTopicTokens(left.title);
  const rightTokens = getTopicTokens(right.title);
  const sharedCount = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return sharedCount >= Math.min(2, Math.min(leftTokens.length, rightTokens.length));
}

function normalizedDetail(event: ReplayEvent) {
  return normalizeTopicKey([event.summary, event.detail, event.evidence].filter(Boolean).join(' '));
}

function hasMeaningfulDifference(left: ReplayEvent, right: ReplayEvent) {
  const leftDetail = normalizedDetail(left);
  const rightDetail = normalizedDetail(right);
  if (!leftDetail || !rightDetail) return false;
  return leftDetail !== rightDetail;
}

function extractSignalTokens(value: string) {
  const text = String(value || '');
  const matches = text.match(
    /\b(?:\d{1,2}(?:st|nd|rd|th)?|\d{4}-\d{2}-\d{2}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|business day|day)\b/gi
  );
  return (matches ?? []).map((match) => match.toLowerCase());
}

function hasPossibleContradiction(left: ReplayEvent, right: ReplayEvent) {
  const leftSignals = extractSignalTokens([left.title, left.summary, left.detail].filter(Boolean).join(' '));
  const rightSignals = extractSignalTokens([right.title, right.summary, right.detail].filter(Boolean).join(' '));
  if (leftSignals.length === 0 || rightSignals.length === 0) return false;
  return leftSignals.join('|') !== rightSignals.join('|');
}

function buildSnapshotState(events: ReplayEvent[], timestamp: string): SnapshotState {
  const cutoff = new Date(timestamp).getTime();
  const visible = events.filter((event) => new Date(event.timestamp).getTime() <= cutoff);

  const latestByKey = new Map<string, ReplayEvent>();
  const openTaskByTitle = new Map<string, ReplayEvent>();
  const completedTaskByTitle = new Map<string, ReplayEvent>();

  for (const event of visible) {
    if (event.type === 'task_created') {
      openTaskByTitle.set(event.title.toLowerCase(), event);
    }
    if (event.type === 'task_completed') {
      completedTaskByTitle.set(event.title.toLowerCase(), event);
      openTaskByTitle.delete(event.title.toLowerCase());
    }
    if (event.type !== 'task_created' && event.type !== 'task_completed') {
      latestByKey.set(normalizeComparisonKey(event), event);
    }
  }

  const staticEvents = Array.from(latestByKey.values());

  return {
    timestamp,
    decisions: staticEvents.filter((event) => event.type === 'decision'),
    openQuestions: staticEvents.filter((event) => event.type === 'open_question'),
    assumptions: staticEvents.filter((event) => event.type === 'assumption'),
    artifacts: staticEvents.filter((event) => event.type === 'artifact'),
    tasksOpen: Array.from(openTaskByTitle.values()),
    tasksCompleted: Array.from(completedTaskByTitle.values()),
  };
}

function compareSnapshotStates(baseline: SnapshotState, comparison: SnapshotState) {
  const baselineItems = flattenSnapshotState(baseline);
  const comparisonItems = flattenSnapshotState(comparison);

  const baselineMap = new Map(baselineItems.map((item) => [normalizeComparisonKey(item), item]));
  const comparisonMap = new Map(comparisonItems.map((item) => [normalizeComparisonKey(item), item]));

  const newItems: ClassifiedChange[] = comparisonItems
    .filter((item) => !baselineMap.has(normalizeComparisonKey(item)))
    .map((item) => classifyComparisonChange(item, baselineItems));

  const resolvedItems: ClassifiedChange[] = baselineItems
    .filter((item) => !comparisonMap.has(normalizeComparisonKey(item)))
    .map((item) => classifyResolvedChange(item, comparisonItems));

  const persistingItems: ClassifiedChange[] = comparisonItems
    .filter((item) => baselineMap.has(normalizeComparisonKey(item)))
    .map((item) => {
      const baselineItem = baselineMap.get(normalizeComparisonKey(item))!;
      if (hasMeaningfulDifference(item, baselineItem)) {
        return {
          event: item,
          relation: 'refined' as const,
          reason: 'The topic persisted, but the supporting detail or framing changed.',
        };
      }

      return {
        event: item,
        relation: 'persisting' as const,
        reason: 'This topic appears to have remained active across both snapshots.',
      };
    });

  return {
    totalChanges: newItems.length + resolvedItems.length,
    newItems,
    resolvedItems,
    persistingItems,
  };
}

function flattenSnapshotState(state: SnapshotState) {
  return [
    ...state.decisions,
    ...state.openQuestions,
    ...state.assumptions,
    ...state.artifacts,
    ...state.tasksOpen,
    ...state.tasksCompleted,
  ];
}

function classifyComparisonChange(event: ReplayEvent, baselineItems: ReplayEvent[]): ClassifiedChange {
  const related = baselineItems.filter((candidate) => areLikelySameTopic(event, candidate));

  if (related.length === 0) {
    return {
      event,
      relation: 'new',
      reason: 'No closely related topic was present in the baseline snapshot.',
    };
  }

  if (
    event.type === 'decision' &&
    related.some((candidate) => candidate.type === 'open_question' || candidate.type === 'assumption')
  ) {
    return {
      event,
      relation: 'confirmed',
      reason: 'This looks like a previously uncertain topic that became a confirmed decision.',
    };
  }

  if (related.some((candidate) => candidate.type === event.type && hasMeaningfulDifference(event, candidate))) {
    return {
      event,
      relation: 'refined',
      reason: 'The same kind of project state existed before, but its wording or details shifted.',
    };
  }

  if (related.some((candidate) => hasPossibleContradiction(event, candidate))) {
    return {
      event,
      relation: 'contradiction',
      reason: 'The topic overlaps with an earlier state, but the timing or factual signal looks different.',
    };
  }

  return {
    event,
    relation: 'coexists',
    reason: 'This appears related to an earlier topic, but it likely adds a parallel operating state rather than replacing it.',
  };
}

function classifyResolvedChange(event: ReplayEvent, comparisonItems: ReplayEvent[]): ClassifiedChange {
  const related = comparisonItems.filter((candidate) => areLikelySameTopic(event, candidate));

  if (
    event.type === 'open_question' &&
    related.some((candidate) => candidate.type === 'decision' || candidate.type === 'assumption')
  ) {
    return {
      event,
      relation: 'resolved',
      reason: 'This open question likely resolved into a clearer decision or operating assumption.',
    };
  }

  if (
    event.type === 'assumption' &&
    related.some((candidate) => candidate.type === 'decision')
  ) {
    return {
      event,
      relation: 'resolved',
      reason: 'A former assumption appears to have been replaced by an explicit decision.',
    };
  }

  return {
    event,
    relation: 'resolved',
    reason: 'This tracked state no longer appears in the later snapshot.',
  };
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function SnapshotSelector({
  title,
  description,
  preset,
  onPresetChange,
  customDate,
  onCustomDateChange,
  resolvedTimestamp,
}: {
  title: string;
  description: string;
  preset: SnapshotPreset;
  onPresetChange: (value: SnapshotPreset) => void;
  customDate: string;
  onCustomDateChange: (value: string) => void;
  resolvedTimestamp: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>

      <div className="mt-3 space-y-3">
        <Select value={preset} onValueChange={(value) => onPresetChange(value as SnapshotPreset)}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Choose snapshot mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="selected">Selected timeline moment</SelectItem>
            <SelectItem value="current">Current project state</SelectItem>
            <SelectItem value="custom">Custom date & time</SelectItem>
          </SelectContent>
        </Select>

        {preset === 'custom' ? (
          <Input
            type="datetime-local"
            value={customDate}
            onChange={(event) => onCustomDateChange(event.target.value)}
          />
        ) : null}

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Resolved snapshot: {resolvedTimestamp ? formatTimestamp(resolvedTimestamp) : 'Not available yet'}
        </div>
      </div>
    </div>
  );
}

function SnapshotDeltaSection({
  title,
  emptyLabel,
  items,
  tone,
  limit = 6,
}: {
  title: string;
  emptyLabel: string;
  items: ClassifiedChange[];
  tone: 'blue' | 'emerald' | 'slate';
  limit?: number;
}) {
  const toneClasses: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50/70 text-blue-800',
    emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {items.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {items.slice(0, limit).map((item) => (
            <div
              key={item.event.id}
              className={`rounded-xl border px-3 py-3 ${toneClasses[tone]}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-white/80">
                  {item.event.badge}
                </Badge>
                <Badge variant="secondary" className="bg-white/80">
                  {formatRelationLabel(item.relation)}
                </Badge>
                {item.event.moduleLabel ? (
                  <span className="text-xs font-medium">{item.event.moduleLabel}</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm font-semibold">{item.event.title}</p>
              <p className="mt-1 text-sm leading-6 opacity-90">{item.event.summary}</p>
              <p className="mt-2 text-xs leading-5 opacity-80">{item.reason}</p>
            </div>
          ))}
          {items.length > limit ? (
            <p className="text-xs text-slate-500">
              +{items.length - limit} more item{items.length - limit === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MiniDetailCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Sparkles;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-600">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}
