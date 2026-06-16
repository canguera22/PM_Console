import { useEffect, useState } from 'react';
import { getArtifactRoute } from '@/lib/artifactRouting';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Megaphone,
  Compass,
  ArrowRight,
  Brain,
  MessageSquareText,
  Activity,
  ArrowUpRight,
  Clock3,
  FolderKanban,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { supabaseFetch } from '@/lib/supabase';
import { ProjectArtifact } from '@/types/project-artifacts';
import { fetchProjects } from '@/lib/projects';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { Project } from '@/types/project';
import { ProjectTaskPanel } from '@/components/ProjectTaskPanel';
import { PageShell } from '@/components/PageShell';
import { ProjectMemoryAssistant } from '@/components/ProjectMemoryAssistant';

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject, setActiveProject } = useActiveProject();

  const [recentArtifacts, setRecentArtifacts] = useState<ProjectArtifact[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [hasAutoOpenedCreateModal, setHasAutoOpenedCreateModal] = useState(false);

  const modules = [
    {
      id: 'meetings',
      title: 'Project Notes',
      description:
        'Capture raw notes, validate context, and turn follow-ups into project tasks',
      icon: MessageSquareText,
      path: '/meetings',
      hasPMAdvisor: false,
      eyebrow: 'Notes to action',
      accent: 'blue',
      cta: 'Clean up notes',
    },
    {
      id: 'documentation',
      title: 'Product Documentation',
      description:
        'Generate PRDs, epics, and structured documentation from inputs and specs',
      icon: FileText,
      path: '/documentation',
      hasPMAdvisor: true,
      eyebrow: 'Specs and stories',
      accent: 'violet',
      cta: 'Draft docs',
    },
    {
      id: 'releases',
      title: 'Release Communications',
      description:
        'Create customer-facing release notes and internal comms',
      icon: Megaphone,
      path: '/releases',
      hasPMAdvisor: true,
      eyebrow: 'Launch messaging',
      accent: 'emerald',
      cta: 'Write release comms',
    },
    {
      id: 'prioritization',
      title: 'Discovery',
      description:
        'Synthesize feedback, research, and raw signals into themes, opportunities, and next moves',
      icon: Compass,
      path: '/prioritization',
      hasPMAdvisor: true,
      eyebrow: 'Signal synthesis',
      accent: 'amber',
      cta: 'Shape discovery',
    },
  ];

  const moduleAccentClasses: Record<string, {
    icon: string;
    panel: string;
    text: string;
    border: string;
    glow: string;
  }> = {
    blue: {
      icon: 'bg-blue-50 text-blue-600 ring-blue-100',
      panel: 'bg-blue-50/70',
      text: 'text-blue-700',
      border: 'hover:border-blue-200',
      glow: 'group-hover:shadow-blue-100/80',
    },
    violet: {
      icon: 'bg-violet-50 text-violet-600 ring-violet-100',
      panel: 'bg-violet-50/70',
      text: 'text-violet-700',
      border: 'hover:border-violet-200',
      glow: 'group-hover:shadow-violet-100/80',
    },
    emerald: {
      icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
      panel: 'bg-emerald-50/70',
      text: 'text-emerald-700',
      border: 'hover:border-emerald-200',
      glow: 'group-hover:shadow-emerald-100/80',
    },
    amber: {
      icon: 'bg-amber-50 text-amber-700 ring-amber-100',
      panel: 'bg-amber-50/70',
      text: 'text-amber-700',
      border: 'hover:border-amber-200',
      glow: 'group-hover:shadow-amber-100/80',
    },
  };

  // -----------------------------
  // Shared display name helper
  // -----------------------------
  const getArtifactDisplayName = (artifact: ProjectArtifact) => {
    if (artifact.artifact_type === 'prioritization') {
      return (
        artifact.artifact_name ||
        (artifact.input_data?.input as Record<string, any> | undefined)?.problem_area?.trim?.() ||
        artifact.input_data?.problem_area?.trim?.() ||
        'Untitled Discovery Brief'
      );
    }

    return artifact.artifact_name || 'Untitled';
  };

  // -----------------------------
  // Load Recent Activity
  // -----------------------------
  useEffect(() => {
    if (!activeProject) {
      setRecentArtifacts([]);
      return;
    }

    const loadRecentActivity = async () => {
      setIsLoadingActivity(true);

      try {
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const data = await supabaseFetch<ProjectArtifact[]>(
          `/project_artifacts?project_id=eq.${activeProject.id}` +
            `&status=eq.active` +
            `&created_at=gte.${fourteenDaysAgo.toISOString()}` +
            `&order=created_at.desc`
        );

        // Limit to one artifact per module (most recent)
        const byModule = new Map<string, ProjectArtifact>();
        for (const artifact of data) {
          if (!byModule.has(artifact.artifact_type)) {
            byModule.set(artifact.artifact_type, artifact);
          }
        }

        setRecentArtifacts(Array.from(byModule.values()));
      } finally {
        setIsLoadingActivity(false);
      }
    };

    loadRecentActivity();
  }, [activeProject]);

  useEffect(() => {
    const loadProjectsForOnboarding = async () => {
      try {
        const projects = await fetchProjects();
        const hasNonAdHocProject = projects.some((project: Project) => project.name !== 'Ad-hoc');
        setShowOnboarding(!hasNonAdHocProject);
      } catch (error) {
        console.error('Error loading projects for onboarding:', error);
      }
    };

    void loadProjectsForOnboarding();
  }, []);

  useEffect(() => {
    if (showOnboarding && !hasAutoOpenedCreateModal) {
      setIsCreateProjectModalOpen(true);
      setHasAutoOpenedCreateModal(true);
    }
  }, [showOnboarding, hasAutoOpenedCreateModal]);

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatArtifactType = (artifactType: string) =>
    artifactType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <PageShell
      eyebrow="Product Workbench"
      title="What do you want to move forward?"
      icon={Sparkles}
      description="Start with a creation module, review open work, or jump into the project's saved outputs."
      action={
        <Button
          variant="outline"
          onClick={() => navigate('/dashboard')}
          className="w-full justify-center gap-2 border-slate-200 bg-white sm:w-auto"
        >
          <FolderKanban className="h-4 w-4" />
          View Artifacts
        </Button>
      }
    >
        {showOnboarding && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-xl text-blue-950">
                Welcome to Product Workbench
              </CardTitle>
              <CardDescription className="text-blue-800">
                To get started, create a project. All generated artifacts are project-based, and context builds over
                time. You can also add project context documents, and those documents plus generated artifacts are used
                to improve future outputs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsCreateProjectModalOpen(true)}>
                Create New Project
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="mb-6">
          <ProjectMemoryAssistant
            activeProject={activeProject ? { id: activeProject.id, name: activeProject.name } : null}
            title="Ask Project Memory"
            description="Pull answers from this project's docs, artifacts, tasks, and extracted decisions without hunting around the workspace."
            bodyHeightClass="h-[440px]"
            samplePrompts={[
              'Show me all user stories we generated',
              'What decisions have we made about California subscribers?',
              'Which open tasks are tied to release communications?',
            ]}
            emptyStateCopy="Ask anything about this project. I will search saved notes, artifacts, tasks, and decisions, then point you to the source."
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.78fr)_minmax(520px,1.22fr)] xl:items-start">
          {/* ================= MODULE LAUNCHER ================= */}
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Choose a Module
                  </h2>
                  <p className="text-sm text-slate-600">
                    Pick the artifact you want to create or improve next.
                  </p>
                </div>
                <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-600">
                  {activeProject?.name ?? 'No project selected'}
                </Badge>
              </div>

              <div className="mt-5 grid gap-3">
                {modules.map((module) => {
                  const Icon = module.icon;
                  const accent = moduleAccentClasses[module.accent];

                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => navigate(module.path)}
                      className={`group w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${accent.border} ${accent.glow}`}
                    >
                      <div className="flex min-h-[132px] flex-col gap-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${accent.icon}`}>
                              <Icon className="h-6 w-6" />
                            </div>
                            <div className="min-w-0">
                              <span className={`block text-xs font-semibold uppercase tracking-wide ${accent.text}`}>
                                {module.eyebrow}
                              </span>
                              <h3 className="m-0 mt-1 line-clamp-1 text-base font-semibold text-slate-950">
                                {module.title}
                              </h3>
                            </div>
                          </div>

                          <div className={`flex w-[150px] shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${accent.panel} ${accent.text}`}>
                          <span>{module.cta}</span>
                          <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </div>
                        </div>

                        <div className="grid flex-1 gap-3 pl-0 sm:grid-cols-[48px_minmax(0,1fr)]">
                          <div className="hidden sm:block" />
                          <div className="min-w-0">
                            <p className="m-0 min-h-[48px] max-w-2xl text-sm leading-6 text-slate-600">
                              {module.description}
                            </p>
                            <div className="mt-3 h-6">
                              {module.hasPMAdvisor ? (
                                <Badge
                                  variant="outline"
                                  className="border-violet-200 bg-violet-50 text-violet-700"
                                >
                                  <Brain className="mr-1 h-3 w-3" />
                                  PM Advisor
                                </Badge>
                              ) : (
                                <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500">
                                  Core module
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6">
            <ProjectTaskPanel
              activeProject={activeProject}
              compact
              readOnly
              headerAction={
                <Button
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => navigate('/tasks')}
                  aria-label="Open tasks page to create a task"
                  title="Create task"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              }
            />

            {/* ================= RECENT ACTIVITY ================= */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                      <Activity className="h-5 w-5 text-blue-600" />
                      Recent Activity
                    </CardTitle>
                    <CardDescription>
                      Latest outputs across modules in this project
                    </CardDescription>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/dashboard')}
                    className="hidden shrink-0 gap-1 text-slate-600 hover:text-slate-950 sm:flex"
                  >
                    View Artifacts
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {isLoadingActivity && (
                  <div className="space-y-3">
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                    ))}
                  </div>
                )}

                {!isLoadingActivity && recentArtifacts.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                    No recent activity yet. Start with a module and generated artifacts will appear here.
                  </div>
                )}

                {recentArtifacts.map((artifact) => {
                  const route = getArtifactRoute(
                    artifact.artifact_type,
                    artifact.id
                  );

                  return (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => {
                        if (route) navigate(route);
                      }}
                      className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="line-clamp-2 text-sm font-semibold text-slate-950">
                            {getArtifactDisplayName(artifact)}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <span>{formatArtifactType(artifact.artifact_type)}</span>
                            <span className="text-slate-300">/</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatRelativeTime(artifact.created_at)}
                            </span>
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            Created by {artifact.created_by_email ?? 'Unknown'}
                          </p>
                        </div>

                        {artifact.advisor_feedback ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-violet-200 bg-violet-50 text-violet-700"
                          >
                            Reviewed
                          </Badge>
                        ) : (
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                        )}
                      </div>
                    </button>
                  );
                })}

                <Button
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  className="flex w-full items-center justify-center gap-2 sm:hidden"
                >
                  View Artifacts
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>

      <CreateProjectModal
        open={isCreateProjectModalOpen}
        onOpenChange={setIsCreateProjectModalOpen}
        onProjectCreated={(project) => {
          setActiveProject(project);
          setShowOnboarding(false);
          setIsCreateProjectModalOpen(false);
        }}
      />
    </PageShell>
  );
}
