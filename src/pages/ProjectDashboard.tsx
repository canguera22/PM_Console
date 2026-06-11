import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  FileText,
  MessageSquare,
  Sparkles,
  TrendingUp,
  ChevronRight,
  Filter,
  Search,
  FileArchive,
  type LucideIcon
} from 'lucide-react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/PageShell';
import { ArtifactActions } from '@/components/ArtifactActions';




interface ProjectArtifact {
  id: string;
  created_at: string;
  project_id: string;
  project_name: string;
  artifact_type: string;
  artifact_name: string;
  created_by_email?: string | null;
  output_data: string;
  input_data?: {
    initiative_name?: string;
    [key: string]: any;
  };
  metadata: any;
  advisor_feedback: string | null;
  advisor_reviewed_at: string | null;
  status: string;
}

const MODULE_ROUTE_BY_TYPE: Record<string, string> = {
  meeting_intelligence: '/meetings',
  product_documentation: '/documentation',
  release_communications: '/releases',
  prioritization: '/prioritization',
};




const ARTIFACT_TYPE_CONFIG: Record<string, any> = {
  meeting_intelligence: {
    label: 'Project Notes',
    icon: MessageSquare,
    color: 'blue',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700'
  },
  product_documentation: {
    label: 'Product Documentation',
    icon: FileText,
    color: 'purple',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700'
  },
  release_communications: {
    label: 'Release Communications',
    icon: Sparkles,
    color: 'green',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700'
  },
  prioritization: {
    label: 'Backlog Prioritization',
    icon: TrendingUp,
    color: 'orange',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-700'
  },
};
  const getArtifactDisplayName = (artifact: ProjectArtifact) => {
  if (artifact.artifact_type === 'prioritization') {
    return (
      artifact.input_data?.initiative_name?.trim() ||
      'Untitled Backlog'
    );
  }

  return artifact.artifact_name;
};


export default function ProjectDashboard() {
  const { activeProject, isLoading: projectLoading } = useActiveProject();
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([]);
  const getActivityMeta = (type?: string) => {
  const now = new Date();
  const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    const relevant = type
      ? artifacts.filter(a => a.artifact_type === type)
      : artifacts;

    if (relevant.length === 0) {
      return { deltaLabel: 'No activity yet' };
    }

    const recentCount = relevant.filter(
      a => new Date(a.created_at) >= sevenDaysAgo
    ).length;

    const latest = relevant.reduce((latest, a) =>
      new Date(a.created_at) > new Date(latest.created_at) ? a : latest
    );

    const daysAgo = Math.floor(
      (now.getTime() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    return {
      deltaLabel:
        recentCount > 0
          ? `+${recentCount} this week`
          : daysAgo === 0
            ? 'Last activity: today'
            : `Last activity: ${daysAgo}d ago`,
    };
  };
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();


  useEffect(() => {
  if (!activeProject) return;

  fetchArtifacts();

}, [activeProject]);


  const fetchArtifacts = async () => {
    if (!activeProject) return;
    
    setLoading(true);
    console.log('🔍 [Dashboard] Fetching artifacts for project', activeProject.id);
    
    try {
      const { data, error } = await supabase
        .from('project_artifacts')
        .select('*')
        .eq('project_id', activeProject.id)
        .eq('status', 'active')
        .not('artifact_type', 'eq', 'pm_advisor_feedback')
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('✅ [Dashboard] Fetched artifacts', { count: data?.length });
      setArtifacts(data || []);

      // Initialize all artifact sections as collapsed
      setCollapsedSections((prev) => {
      // Only initialize once
      if (Object.keys(prev).length > 0) return prev;

      const initial: Record<string, boolean> = {};
      (data || []).forEach((a) => {
        initial[a.artifact_type] = true;
      });
      return initial;
    });


    } catch (error: any) {
      console.error('❌ [Dashboard Error]', error);
      toast.error('Failed to load artifacts', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

const toggleSection = (type: string) => {
  setCollapsedSections(prev => ({
    ...prev,
    [type]: !prev[type]
  }));
};

const handleStatClick = (type: string) => {
  if (type === 'all') {
    setFilterType('all');
    setCollapsedSections((prev) => {
      const next = { ...prev };
      Object.keys(ARTIFACT_TYPE_CONFIG).forEach((artifactType) => {
        next[artifactType] = false;
      });
      artifacts.forEach((artifact) => {
        next[artifact.artifact_type] = false;
      });
      return next;
    });
  } else {
    setFilterType(type);
    setCollapsedSections((prev) => ({
      ...prev,
      [type]: false,
    }));
  }

  window.requestAnimationFrame(() => {
    document.getElementById('artifacts-section')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
};


  // Filter artifacts
  const filteredArtifacts = artifacts.filter(artifact => {
    // Filter by type
    if (filterType !== 'all' && artifact.artifact_type !== filterType) {
      return false;
    }
    // Filter by search query
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      return (
        getArtifactDisplayName(artifact).toLowerCase().includes(searchLower) ||
        artifact.output_data.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  // Group artifacts by type
  const groupedArtifacts = filteredArtifacts.reduce((acc, artifact) => {
    if (!acc[artifact.artifact_type]) {
      acc[artifact.artifact_type] = [];
    }
    acc[artifact.artifact_type].push(artifact);
    return acc;
  }, {} as Record<string, ProjectArtifact[]>);

  // Get stats
  const stats = {
    total: artifacts.length,
    meeting_intelligence: artifacts.filter(a => a.artifact_type === 'meeting_intelligence').length,
    product_documentation: artifacts.filter(a => a.artifact_type === 'product_documentation').length,
    release_communications: artifacts.filter(a => a.artifact_type === 'release_communications').length,
    prioritization: artifacts.filter(a => a.artifact_type === 'prioritization').length
  };

  const statItems = [
    {
      type: 'all',
      label: 'Total Outputs',
      value: stats.total,
      color: 'gray',
      meta: getActivityMeta().deltaLabel,
      icon: FileArchive,
    },
    {
      type: 'meeting_intelligence',
      label: 'Notes',
      value: stats.meeting_intelligence,
      color: 'blue',
      meta: getActivityMeta('meeting_intelligence').deltaLabel,
      icon: MessageSquare,
    },
    {
      type: 'product_documentation',
      label: 'PRDs',
      value: stats.product_documentation,
      color: 'purple',
      meta: getActivityMeta('product_documentation').deltaLabel,
      icon: FileText,
    },
    {
      type: 'release_communications',
      label: 'Releases',
      value: stats.release_communications,
      color: 'green',
      meta: getActivityMeta('release_communications').deltaLabel,
      icon: Sparkles,
    },
    {
      type: 'prioritization',
      label: 'Prioritization',
      value: stats.prioritization,
      color: 'orange',
      meta: getActivityMeta('prioritization').deltaLabel,
      icon: TrendingUp,
    },
  ];

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3B82F6]"></div>
      </div>
    );
  }

  return (
    <PageShell
      eyebrow="Project Memory"
      title="Generated Outputs"
      icon={FileArchive}
      description={`Search and revisit every artifact generated for ${activeProject?.name || 'the active project'}.`}
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {statItems.map((item) => (
            <StatCard
              key={item.type}
              label={item.label}
              value={item.value}
              color={item.color}
              meta={item.meta}
              icon={item.icon}
              active={filterType === item.type || (item.type === 'all' && filterType === 'all')}
              onClick={() => handleStatClick(item.type)}
            />
          ))}
        </div>
      </div>

      <div id="artifacts-section" className="mt-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="m-0 text-xl font-bold tracking-tight text-slate-950">
              Artifact Library
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Browse by module, search generated text, and open any saved output.
            </p>
          </div>
          <div className="text-sm text-slate-500">
            Showing {filteredArtifacts.length} of {artifacts.length}
          </div>
        </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 md:flex-row">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search artifacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="meeting_intelligence">Project Notes</option>
                <option value="product_documentation">Product Documentation</option>
                <option value="release_communications">Release Communications</option>
                <option value="prioritization">Backlog Prioritization</option>
              </select>
            </div>
        </div>
      </div>
      </div>

      {/* Artifacts List */}
      <div className="mt-5 pb-12">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3B82F6]"></div>
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center">
            <FileText className="w-12 h-12 text-[#9CA3AF] mx-auto mb-4" />

            <h3 className="text-lg font-medium text-[#111827] mb-2">
              No artifacts yet —
              <button
                onClick={() => navigate('/')}
                className="ml-1 text-[#3B82F6] hover:underline font-semibold"
              >
                add your first document now
              </button>
              !
            </h3>

            <p className="text-sm text-[#6B7280]">
              Start creating artifacts in the modules above
            </p>
          </div>

        ) : (
                   <div className="space-y-4">
            {Object.entries(groupedArtifacts).map(([type, typeArtifacts]) => (
              <div key={type} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {/* Section Header (Accordion Toggle) */}
                <button
                  onClick={() => toggleSection(type)}
                  className="group flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                  {(() => {
                    const Icon = ARTIFACT_TYPE_CONFIG[type]?.icon || FileText;
                    return (
                      <span className={`${ARTIFACT_TYPE_CONFIG[type]?.bgColor} flex h-10 w-10 items-center justify-center rounded-lg`}>
                        <Icon className={`w-5 h-5 ${ARTIFACT_TYPE_CONFIG[type]?.textColor}`} />
                      </span>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-950">
                        {ARTIFACT_TYPE_CONFIG[type]?.label || type}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {typeArtifacts.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {getActivityMeta(type).deltaLabel}
                    </p>
                  </div>
                  <ChevronRight
                    className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${
                      collapsedSections[type] ? '' : 'rotate-90'
                    }`}
                  />
                </button>

                {/* Collapsible Content */}
                {collapsedSections[type] === false && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {typeArtifacts.map(artifact => (
                      <ArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        config={ARTIFACT_TYPE_CONFIG[artifact.artifact_type]}
                        projectName={activeProject?.name}
                        onClick={() => {
                          const route = MODULE_ROUTE_BY_TYPE[artifact.artifact_type];
                          if (!route) return;

                          navigate(`${route}?artifact=${artifact.id}`);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div> 
        )}         
      </div>       
    </PageShell>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  color,
  meta,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  meta?: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}) {
  const colorClasses: Record<string, { icon: string; accent: string; active: string }> = {
    gray: {
      icon: 'bg-slate-100 text-slate-700',
      accent: 'text-slate-500',
      active: 'border-slate-400 ring-slate-200',
    },
    blue: {
      icon: 'bg-blue-50 text-blue-600',
      accent: 'text-blue-600',
      active: 'border-blue-300 ring-blue-100',
    },
    purple: {
      icon: 'bg-violet-50 text-violet-600',
      accent: 'text-violet-600',
      active: 'border-violet-300 ring-violet-100',
    },
    green: {
      icon: 'bg-emerald-50 text-emerald-600',
      accent: 'text-emerald-600',
      active: 'border-emerald-300 ring-emerald-100',
    },
    orange: {
      icon: 'bg-amber-50 text-amber-700',
      accent: 'text-amber-700',
      active: 'border-amber-300 ring-amber-100',
    },
  };
  const tone = colorClasses[color] || colorClasses.gray;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group rounded-2xl border bg-white p-4 text-left shadow-sm transition-all duration-200
        hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
        ${active ? `ring-2 ${tone.active}` : 'border-slate-200'}
      `}
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold leading-none text-slate-950">{value}</span>
            <span className="truncate text-sm font-semibold text-slate-700">{label}</span>
          </div>

          {meta && (
            <div className={`mt-1 truncate text-xs ${tone.accent}`}>
              {meta}
            </div>
          )}
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>
    </button>
  );
}

// Artifact Card Component
function ArtifactCard({ artifact, config, projectName, onClick }: {
  artifact: ProjectArtifact;
  config: any;
  projectName?: string | null;
  onClick: () => void;
}) {
  const Icon = config?.icon || FileText;
  
  return (
    <button
      onClick={onClick}
      className="group w-full bg-white p-4 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-start gap-3">
        <span className={`${config?.bgColor} flex h-10 w-10 shrink-0 items-center justify-center rounded-xl`}>
          <Icon className={`w-5 h-5 ${config?.textColor}`} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 line-clamp-1 text-sm font-semibold text-slate-950">
              {getArtifactDisplayName(artifact)}
            </h3>
            {artifact.advisor_feedback ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                Reviewed
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              {new Date(artifact.created_at).toLocaleDateString()} at {new Date(artifact.created_at).toLocaleTimeString()}
            </span>
            <span>Created by {artifact.created_by_email ?? 'Unknown'}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ArtifactActions
            title={getArtifactDisplayName(artifact)}
            content={artifact.output_data}
            projectName={projectName ?? artifact.project_name}
            moduleLabel={config?.label ?? artifact.artifact_type}
            createdAt={artifact.created_at}
          />
          <span className="flex items-center gap-2 text-xs font-semibold text-blue-700">
            Open
            <ChevronRight className="w-4 h-4 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-blue-600" />
          </span>
        </div>
      </div>
    </button>
  );
}
