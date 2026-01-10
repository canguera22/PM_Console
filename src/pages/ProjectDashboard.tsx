import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import {
  FileText,
  MessageSquare,
  Sparkles,
  TrendingUp,
  Calendar,
  ChevronRight,
  RefreshCw,
  Filter,
  Search,
  X,
  LayoutDashboard
} from 'lucide-react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { ActiveProjectSelector } from '@/components/ActiveProjectSelector';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';



interface ProjectArtifact {
  id: string;
  created_at: string;
  project_id: string;
  project_name: string;
  artifact_type: string;
  artifact_name: string;
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

const ARTIFACT_TYPE_CONFIG: Record<string, any> = {
  meeting_intelligence: {
    label: 'Meeting Intelligence',
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
  pm_advisor: {
    label: 'PM Advisor',
    icon: Sparkles,
    color: 'pink',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    textColor: 'text-pink-700'
  }
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

type OutputSection = {
  id: string;
  title: string;
  content: string;
};

function splitAgentOutputIntoSections(output: string): OutputSection[] {
  if (!output || !output.trim()) return [];

  const rawSections = output
    .split(/\n\s*---\s*\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  return rawSections.map((content, idx) => {
    const firstLine = content.split('\n')[0]?.trim() ?? '';
    const h1Match = firstLine.match(/^#\s+(.*)$/);

    const title = h1Match?.[1]?.trim() || `Section ${idx + 1}`;

    return {
      id: `${idx}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title,
      content,
    };
  });
}

/**
 * Renders one output as either:
 * - a single markdown document, OR
 * - multiple sections split by "---" with tabs.
 *
 * For release_communications artifacts, we try to name tabs using
 * artifact.input_data.selected_outputs (Customer/Internal/Support etc.)
 */
function ArtifactOutputViewer({
  output,
  selectedOutputs,
}: {
  output: string;
  selectedOutputs?: any;
}) {
  const sections = splitAgentOutputIntoSections(output);

  // Use the user's selected output labels when possible
  const labels: string[] = Array.isArray(selectedOutputs)
    ? selectedOutputs.filter((x) => typeof x === 'string')
    : [];

  const finalSections = sections.map((s, idx) => {
    const labelFromSelections = labels[idx];
    const useLabel =
      labelFromSelections && labelFromSelections.trim().length > 0
        ? labelFromSelections
        : s.title;

    return { ...s, title: useLabel };
  });

  // Single doc fallback
  if (finalSections.length <= 1) {
    return (
      <div className="prose max-w-none mb-6">
        <ReactMarkdown>{output}</ReactMarkdown>
      </div>
    );
  }

  // Multi-tab view
  return (
    <div className="mb-6">
      <Tabs defaultValue={finalSections[0].id} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max gap-1">
            {finalSections.map((sec) => (
              <TabsTrigger key={sec.id} value={sec.id} className="whitespace-nowrap">
                {sec.title}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {finalSections.map((sec) => (
          <TabsContent key={sec.id} value={sec.id} className="mt-4">
            <div className="prose max-w-none">
              <ReactMarkdown>{sec.content}</ReactMarkdown>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}


export default function ProjectDashboard() {
  const { activeProject, isLoading: projectLoading } = useActiveProject();
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArtifact, setSelectedArtifact] = useState<ProjectArtifact | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

const artifactIdFromUrl = searchParams.get('artifact');

  useEffect(() => {
  if (!activeProject) return;

  fetchArtifacts().then(() => {
    if (artifactIdFromUrl) {
      openArtifactById(artifactIdFromUrl);
    }
  });
}, [activeProject, artifactIdFromUrl]);

const closeArtifact = () => {
  setSelectedArtifact(null);
  setSearchParams({});
};

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
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('✅ [Dashboard] Fetched artifacts', { count: data?.length });
      setArtifacts(data || []);
    } catch (error: any) {
      console.error('❌ [Dashboard Error]', error);
      toast.error('Failed to load artifacts', {
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const openArtifactById = async (artifactId: string) => {
  if (!activeProject) return;

  try {
    const { data, error } = await supabase
      .from('project_artifacts')
      .select('*')
      .eq('id', artifactId)
      .eq('project_id', activeProject.id)
      .eq('status', 'active')
      .single();

    if (error || !data) return;

    setSelectedArtifact(data);
  } catch (err) {
    console.warn('Artifact not accessible', err);
  }
};

const toggleSection = (type: string) => {
  setCollapsedSections(prev => ({
    ...prev,
    [type]: !prev[type]
  }));
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
    prioritization: artifacts.filter(a => a.artifact_type === 'prioritization').length,
    pm_advisor: artifacts.filter(a => a.artifact_type === 'pm_advisor').length,
    with_advisor_feedback: artifacts.filter(a => a.advisor_feedback).length
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3B82F6]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="bg-white border-b border-[#E5E7EB]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-start justify-between gap-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <LayoutDashboard className="w-8 h-8 text-[#3B82F6]" />
                <h1 className="text-[28px] font-bold text-[#111827]">Project Dashboard</h1>
              </div>
              <p className="text-sm text-[#6B7280]">
                All artifacts for {activeProject?.name || 'Unknown Project'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ActiveProjectSelector />
              <button
                onClick={fetchArtifacts}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-[#3B82F6] text-white rounded-lg hover:bg-[#2563EB] disabled:bg-[#9CA3AF] transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Artifacts" value={stats.total} color="gray" />
          <StatCard label="Meetings" value={stats.meeting_intelligence} color="blue" />
          <StatCard label="PRDs" value={stats.product_documentation} color="purple" />
          <StatCard label="Releases" value={stats.release_communications} color="green" />
          <StatCard label="Prioritization" value={stats.prioritization} color="orange" />
          <StatCard label="PM Reviews" value={stats.pm_advisor} color="pink" />
        </div>
      </div>

      {/* Filters */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7280]" />
              <input
                type="text"
                placeholder="Search artifacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-[#D1D5DB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
              />
            </div>
            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#6B7280]" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-[#D1D5DB] rounded-lg focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="meeting_intelligence">Meeting Intelligence</option>
                <option value="product_documentation">Product Documentation</option>
                <option value="release_communications">Release Communications</option>
                <option value="prioritization">Backlog Prioritization</option>
                <option value="pm_advisor">PM Advisor</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Artifacts List */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-12">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3B82F6]"></div>
          </div>
        ) : filteredArtifacts.length === 0 ? (
          <div className="bg-white rounded-lg border border-[#E5E7EB] p-12 text-center">
            <FileText className="w-12 h-12 text-[#9CA3AF] mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[#111827] mb-2">No artifacts found</h3>
            <p className="text-sm text-[#6B7280]">
              {searchQuery || filterType !== 'all'
                ? 'Try adjusting your filters'
                : 'Start creating artifacts in the modules above'}
            </p>
          </div>
        ) : (
                   <div className="space-y-8">
            {Object.entries(groupedArtifacts).map(([type, typeArtifacts]) => (
              <div key={type}>
                {/* Section Header (Accordion Toggle) */}
                <button
                  onClick={() => toggleSection(type)}
                  className="flex items-center gap-2 mb-4 w-full text-left group"
                >
                  {(() => {
                    const Icon = ARTIFACT_TYPE_CONFIG[type]?.icon || FileText;
                    return (
                      <Icon className={`w-5 h-5 ${ARTIFACT_TYPE_CONFIG[type]?.textColor}`} />
                    );
                  })()}
                  <h2 className="text-lg font-semibold text-[#111827]">
                    {ARTIFACT_TYPE_CONFIG[type]?.label || type}
                  </h2>
                  <span className="text-sm text-[#6B7280]">
                    ({typeArtifacts.length})
                  </span>

                  <ChevronRight
                    className={`ml-auto w-4 h-4 transition-transform ${
                      collapsedSections[type] ? '' : 'rotate-90'
                    }`}
                  />
                </button>

                {/* Collapsible Content */}
                {!collapsedSections[type] && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {typeArtifacts.map(artifact => (
                      <ArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        config={ARTIFACT_TYPE_CONFIG[artifact.artifact_type]}
                        onClick={() => setSelectedArtifact(artifact)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div> 
        )}         
      </div>       



      {/* Artifact Detail Modal */}
      {selectedArtifact && (
        <ArtifactDetailModal
          artifact={selectedArtifact}
          config={ARTIFACT_TYPE_CONFIG[selectedArtifact.artifact_type]}
          onClose={closeArtifact}
        />
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    gray: 'bg-[#F3F4F6] text-[#374151]',
    blue: 'bg-[#DBEAFE] text-[#1E40AF]',
    purple: 'bg-[#EDE9FE] text-[#6B21A8]',
    green: 'bg-[#D1FAE5] text-[#065F46]',
    orange: 'bg-[#FED7AA] text-[#9A3412]',
    pink: 'bg-[#FCE7F3] text-[#9F1239]'
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color] || colorClasses.gray}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-75">{label}</div>
    </div>
  );
}

// Artifact Card Component
function ArtifactCard({ artifact, config, onClick }: {
  artifact: ProjectArtifact;
  config: any;
  onClick: () => void;
}) {
  const Icon = config?.icon || FileText;
  
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-lg border ${config?.borderColor} ${config?.bgColor} hover:shadow-md transition-all group`}
    >
      <div className="flex items-start justify-between mb-2">
        <Icon className={`w-5 h-5 ${config?.textColor}`} />
        {artifact.advisor_feedback && (
          <span className="text-xs bg-[#FCE7F3] text-[#9F1239] px-2 py-1 rounded-full">
            Reviewed
          </span>
        )}
      </div>
      <h3 className="font-medium text-[#111827] mb-1 line-clamp-1">
        {getArtifactDisplayName(artifact)}
      </h3>
      <p className="text-xs text-[#6B7280] mb-2">
        {new Date(artifact.created_at).toLocaleDateString()} at {new Date(artifact.created_at).toLocaleTimeString()}
      </p>
      <div className="flex items-center justify-between">
        <ChevronRight className="w-4 h-4 text-[#9CA3AF] group-hover:text-[#6B7280] transition-colors" />
      </div>
    </button>
  );
}

// Artifact Detail Modal Component
function ArtifactDetailModal({ artifact, config, onClose }: {
  artifact: ProjectArtifact;
  config: any;
  onClose: () => void;
}) {
  const Icon = config?.icon || FileText;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={`p-6 border-b ${config?.borderColor} ${config?.bgColor}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <Icon className={`w-6 h-6 ${config?.textColor} mt-1`} />
              <div>
                <h2 className="text-xl font-bold text-[#111827] mb-1">
                  {getArtifactDisplayName(artifact)}
                </h2>
                <p className="text-sm text-[#6B7280]">
                  {config?.label} • {new Date(artifact.created_at).toLocaleDateString()} at {new Date(artifact.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Output */}
            <ArtifactOutputViewer
              output={artifact.output_data ?? ''}
              selectedOutputs={artifact.input_data?.selected_outputs}
            />


          
          {/* PM Advisor Feedback */}
          {artifact.advisor_feedback && (
            <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-[#EC4899]" />
                <h3 className="text-lg font-semibold text-[#111827]">PM Advisor Review</h3>
                <span className="text-xs text-[#6B7280]">
                  {new Date(artifact.advisor_reviewed_at!).toLocaleDateString()}
                </span>
              </div>
              <div className="bg-[#FCE7F3] border border-[#F9A8D4] rounded-lg p-4">
                <div className="prose max-w-none">
                  <ReactMarkdown>{artifact.advisor_feedback}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}
          
          {/* Metadata */}
          <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
            <h3 className="text-sm font-semibold text-[#111827] mb-2">Metadata</h3>
            <pre className="text-xs bg-[#F3F4F6] p-4 rounded border border-[#E5E7EB] overflow-x-auto">
              {JSON.stringify(artifact.metadata, null, 2)}
            </pre>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-[#E5E7EB] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#F3F4F6] text-[#374151] rounded-lg hover:bg-[#E5E7EB] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
