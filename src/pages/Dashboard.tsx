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
  ListOrdered,
  ArrowRight,
  Brain,
  MessageSquareText,
} from 'lucide-react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { supabaseFetch } from '@/lib/supabase';
import { ProjectArtifact } from '@/types/project-artifacts';

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();

  const [recentArtifacts, setRecentArtifacts] = useState<ProjectArtifact[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);

  const modules = [
    {
      id: 'meetings',
      title: 'Meeting Intelligence',
      description:
        'Process meeting transcripts into structured outputs with AI-powered analysis',
      icon: MessageSquareText,
      path: '/meetings',
      hasPMAdvisor: false,
    },
    {
      id: 'documentation',
      title: 'Product Documentation',
      description:
        'Generate PRDs, epics, and structured documentation from inputs and specs',
      icon: FileText,
      path: '/documentation',
      hasPMAdvisor: true,
    },
    {
      id: 'releases',
      title: 'Release Communications',
      description:
        'Create customer-facing release notes and internal comms',
      icon: Megaphone,
      path: '/releases',
      hasPMAdvisor: true,
    },
    {
      id: 'prioritization',
      title: 'Backlog Prioritization',
      description:
        'Score and rank your backlog using WSJF and other prioritization models',
      icon: ListOrdered,
      path: '/prioritization',
      hasPMAdvisor: false,
    },
  ];

  // -----------------------------
  // Shared display name helper
  // -----------------------------
  const getArtifactDisplayName = (artifact: ProjectArtifact) => {
    if (artifact.artifact_type === 'prioritization') {
      return (
        artifact.input_data?.initiative_name?.trim() ||
        'Untitled Backlog'
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

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Workspace Header */}
      <div className="border-b border-[#E5E7EB] bg-white">
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[28px] font-bold text-[#111827]">
                Project Workspace
              </h1>
              <p className="text-sm text-[#6B7280]">
                Create new documents using all available modules or reference recent work.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-10">
        {/* ================= RECENT ACTIVITY ================= */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">
                  Recent Activity
                </CardTitle>
                <CardDescription>
                  Latest outputs across modules in this project
                </CardDescription>
              </div>

              <Button
                variant="outline"
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2"
              >
                View Project Dashboard
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {isLoadingActivity && (
              <p className="text-sm text-muted-foreground">
                Loading recent activity…
              </p>
            )}

            {!isLoadingActivity && recentArtifacts.length === 0 && (
              <div className="text-sm text-muted-foreground border rounded-md p-4">
                No recent activity yet. Artifacts you generate will appear here.
              </div>
            )}

            {recentArtifacts.map((artifact) => {
              const route = getArtifactRoute(
                artifact.artifact_type,
                artifact.id
              );

              return (
                <div
                  key={artifact.id}
                  onClick={() => {
                    if (route) navigate(route);
                  }}
                  className="flex items-center justify-between rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {getArtifactDisplayName(artifact)}
                    </p>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="capitalize">
                        {artifact.artifact_type.replace('_', ' ')}
                      </span>
                      <span>•</span>
                      <span>{formatRelativeTime(artifact.created_at)}</span>
                    </div>
                  </div>

                  {artifact.advisor_feedback && (
                    <Badge
                      variant="outline"
                      className="bg-[#DDD6FE] text-[#5B21B6] border-[#DDD6FE]"
                    >
                      Advisor Reviewed
                    </Badge>
                  )}
                </div>
              );
            })}

          </CardContent>
        </Card>

        {/* ================= MODULES ================= */}
        <div>
          <h2 className="text-[22px] font-semibold text-[#1F2937] mb-2">
            Modules
          </h2>
          <p className="text-sm text-[#6B7280] mb-6">
            Choose what you want to work on next
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <Card
                  key={module.id}
                  className="group cursor-pointer transition-all hover:border-[#3B82F6] hover:shadow-md hover:-translate-y-0.5"
                  onClick={() => navigate(module.path)}
                >
                  <CardHeader className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#DBEAFE]">
                        <Icon className="h-7 w-7 text-[#3B82F6]" />
                      </div>
                      {module.hasPMAdvisor && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-[#DDD6FE] text-[#5B21B6] border-[#DDD6FE]"
                        >
                          PM Advisor
                        </Badge>
                      )}
                    </div>

                    <CardTitle className="mt-5 text-lg font-semibold">
                      {module.title}
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm">
                      {module.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="px-6 pb-6">
                    <div className="flex items-center text-sm font-semibold text-[#3B82F6] group-hover:underline">
                      Open module
                      <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
