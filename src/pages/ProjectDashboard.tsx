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
  X,
  LayoutDashboard
} from 'lucide-react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useSearchParams } from 'react-router-dom';
import { extractTextFromFile } from '@/lib/documentExtraction';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';




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

interface ProjectDocument {
  id: string;
  project_id: string;
  name: string;
  document_type: string | null;
  storage_path: string;
  created_at: string;
  status: 'active' | 'archived';
}

const MODULE_ROUTE_BY_TYPE: Record<string, string> = {
  meeting_intelligence: '/meetings',
  product_documentation: '/documentation',
  release_communications: '/releases',
  prioritization: '/prioritization',
};




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
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  const [openArtifacts, setOpenArtifacts] = useState<Record<string, boolean>>({});


const artifactIdFromUrl = searchParams.get('artifact');

  useEffect(() => {
  if (!activeProject) return;

  fetchArtifacts();
  fetchProjectDocuments();

}, [activeProject, artifactIdFromUrl]);


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

  const fetchProjectDocuments = async () => {
  if (!activeProject) return;

  setDocumentsLoading(true);

  try {
    const { data, error } = await supabase
      .from('project_documents')
      .select('*')
      .eq('project_id', activeProject.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    setDocuments(data || []);
  } catch (err: any) {
    console.error('❌ Failed to load project documents', err);
    toast.error('Failed to load project documents');
  } finally {
    setDocumentsLoading(false);
  }
};

const handleDocumentUpload = async (file: File) => {
  if (!activeProject) return;

  setUploadingDoc(true);

  try {
    // 1️⃣ Create DB row first
    const { data: doc, error: insertError } = await supabase
      .from('project_documents')
      .insert({
        project_id: activeProject.id,
        name: file.name,
        document_type: file.type || null,
        status: 'active',
      })
      .select()
      .single();

    if (insertError || !doc) throw insertError;

    // 2️⃣ Upload to storage using canonical path
    const storagePath = `projects/${activeProject.id}/${doc.id}/${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(storagePath, file);

    if (uploadError) throw uploadError;

    // 3️⃣ Extract text
    const { text, metadata } = await extractTextFromFile(file);

    // 4️⃣ Update DB with storage + extracted text
    await supabase
      .from('project_documents')
      .update({
        storage_path: storagePath,
        extracted_text: text,
        metadata,
      })
      .eq('id', doc.id);


    //  Update UI
    await fetchProjectDocuments();
    toast.success('Document uploaded');
  } catch (err: any) {
    console.error('❌ Upload failed', err);
    toast.error('Failed to upload document');
  } finally {
    setUploadingDoc(false);
  }
}

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
    prioritization: artifacts.filter(a => a.artifact_type === 'prioritization').length
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
                <LayoutDashboard className="w-7 h-7 text-[#3B82F6]" />
                <h1 className="text-[28px] font-bold text-[#111827]">
                  Project Dashboard
                </h1>
              </div>
              <p className="text-sm text-[#6B7280]">
                All artifacts for the {activeProject?.name || 'Unknown Project'} project are cound here.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
              label="Total Artifacts"
              value={stats.total}
              color="gray"
              meta={getActivityMeta().deltaLabel}
              highlight
            />

            <StatCard
              label="Meetings"
              value={stats.meeting_intelligence}
              color="blue"
              meta={getActivityMeta('meeting_intelligence').deltaLabel}
            />

            <StatCard
              label="PRDs"
              value={stats.product_documentation}
              color="purple"
              meta={getActivityMeta('product_documentation').deltaLabel}
            />

            <StatCard
              label="Releases"
              value={stats.release_communications}
              color="green"
              meta={getActivityMeta('release_communications').deltaLabel}
            />

            <StatCard
              label="Prioritization"
              value={stats.prioritization}
              color="orange"
              meta={getActivityMeta('prioritization').deltaLabel}
            />
        </div>
      </div>

      {/* Project Context Documents */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg border border-[#E5E7EB] p-6 space-y-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[#111827]">
                Project Context Documents
              </h2>
              <p className="text-xs text-[#6B7280] mt-1 max-w-xl">
                Upload PRDs, specs, decks, or notes to give AI agents richer project context.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[#3B82F6] rounded-md cursor-pointer hover:bg-[#2563EB] transition">
              <FileText className="w-4 h-4" />
              {uploadingDoc ? 'Uploading…' : 'Upload document'}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleDocumentUpload(file);
                  e.currentTarget.value = '';
                }}
                disabled={uploadingDoc}
              />
            </label>
          </div>

          {documentsLoading ? (
            <p className="text-sm text-[#6B7280]">Loading documents…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-[#6B7280]">
              No project documents uploaded yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#E5E7EB]">
              {documents.map((doc) => (
                <li key={doc.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-[#3B82F6] mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-[#111827]">
                        {doc.name}
                      </p>
                      <p className="text-xs text-[#6B7280]">
                        Uploaded {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      await supabase
                        .from('project_documents')
                        .update({ status: 'archived' })
                        .eq('id', doc.id);

                      setDocuments((prev) =>
                        prev.filter((d) => d.id !== doc.id)
                      );

                      toast.success('Document removed');
                    }}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </li>

              ))}
            </ul>
          )}
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

                  <span className="ml-2 text-xs text-[#6B7280] italic">
                    — {getActivityMeta(type).deltaLabel}
                  </span>
                  <ChevronRight
                    className={`ml-auto w-4 h-4 transition-transform ${
                      collapsedSections[type] ? '' : 'rotate-90'
                    }`}
                  />
                </button>

                {/* Collapsible Content */}
                {collapsedSections[type] === false && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {typeArtifacts.map(artifact => (
                      <ArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        config={ARTIFACT_TYPE_CONFIG[artifact.artifact_type]}
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
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  color,
  meta,
  highlight = false,
}: {
  label: string;
  value: number;
  color: string;
  meta?: string;
  highlight?: boolean;
}) {
  const colorClasses: Record<string, string> = {
    gray: 'bg-[#F3F4F6] text-[#374151]',
    blue: 'bg-[#DBEAFE] text-[#1E40AF]',
    purple: 'bg-[#EDE9FE] text-[#6B21A8]',
    green: 'bg-[#D1FAE5] text-[#065F46]',
    orange: 'bg-[#FED7AA] text-[#9A3412]',
    pink: 'bg-[#FCE7F3] text-[#9F1239]'
  };

  return (
    <div
      className={`
        rounded-xl p-5 transition-all duration-200
        ${highlight ? 'ring-2 ring-[#3B82F6]/30 shadow-lg' : 'hover:shadow-lg'}
        hover:-translate-y-[2px]
        ${colorClasses[color] || colorClasses.gray}
      `}
    >
      <div className="text-2xl font-bold leading-tight">{value}</div>
      <div className="text-xs mt-1 opacity-80">{label}</div>

      {meta && (
        <div className="mt-1 text-[11px] opacity-70">
          {meta}
        </div>
      )}
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
            Agent Reviewed
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


