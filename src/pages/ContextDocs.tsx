import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BookOpen, FileText, Files, Quote, Search, Upload, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { PageShell } from '@/components/PageShell';
import { uploadProjectDocument } from '@/lib/projectDocuments';
import { supabase } from '@/lib/supabase';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { ProjectMemoryAssistant } from '@/components/ProjectMemoryAssistant';

interface ContextDocument {
  id: string;
  project_id: string;
  name: string;
  doc_type?: string | null;
  document_type?: string | null;
  storage_path: string;
  extracted_text?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  status: 'active' | 'archived' | 'deleted';
}

export default function ContextDocs() {
  const { activeProject } = useActiveProject();
  const [documents, setDocuments] = useState<ContextDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!activeProject) {
      setDocuments([]);
      return;
    }

    void loadDocuments();
  }, [activeProject?.id]);

  const searchableDocuments = useMemo(
    () => documents.filter((doc) => (doc.extracted_text ?? '').trim().length > 0),
    [documents]
  );

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;

    return documents.filter((doc) => {
      const haystack = `${doc.name} ${doc.extracted_text ?? ''}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [documents, query]);

  async function loadDocuments() {
    if (!activeProject) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', activeProject.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments((data ?? []) as ContextDocument[]);
    } catch (error: any) {
      toast.error('Failed to load context documents', {
        description: error?.message ?? 'Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!activeProject || !files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadProjectDocument(activeProject.id, file);
      }
      toast.success(files.length === 1 ? 'Document uploaded' : 'Documents uploaded');
      await loadDocuments();
    } catch (error: any) {
      toast.error('Upload failed', {
        description: error?.message ?? 'Could not upload one or more files.',
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function removeDocument(docId: string) {
    const { error } = await supabase
      .from('project_documents')
      .update({ status: 'archived' })
      .eq('id', docId);

    if (error) {
      toast.error('Failed to remove document', {
        description: error.message,
      });
      return;
    }

    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    toast.success('Document removed');
  }

  return (
    <PageShell
      eyebrow="Project Knowledge"
      title="Context Docs"
      icon={BookOpen}
      description={`Upload source material, then ask project-wide questions for ${activeProject?.name ?? 'the active project'}.`}
      action={
        <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700">
          <Upload className="h-4 w-4" />
          {isUploading ? 'Uploading...' : 'Upload Docs'}
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.txt,.md,.csv,.doc,.docx,.xlsx,.xls,.pptx"
            disabled={isUploading || !activeProject}
            onChange={(event) => {
              void handleUpload(event.target.files);
              event.currentTarget.value = '';
            }}
          />
        </label>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <ContextMetric icon={Files} label="Active docs" value={documents.length} />
        <ContextMetric icon={Search} label="Searchable docs" value={searchableDocuments.length} />
        <ContextMetric
          icon={Quote}
          label="Assistant scope"
          value={activeProject ? 'Project-wide' : 'Waiting'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="m-0 text-lg font-semibold text-slate-950">Documents</h2>
                <p className="text-sm text-slate-600">
                  {documents.length} active document{documents.length === 1 ? '' : 's'}
                </p>
              </div>
              <BadgeLike>{searchableDocuments.length} searchable</BadgeLike>
            </div>

            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search document names and extracted text"
                className="pl-9"
              />
            </div>
          </div>

          <div className="max-h-[620px] overflow-y-auto p-5">
            {isLoading ? (
              <p className="text-sm text-slate-600">Loading documents...</p>
            ) : filteredDocuments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                No matching context documents.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-100 hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-slate-950">
                            {doc.name}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>Uploaded {new Date(doc.created_at).toLocaleDateString()}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                              {getDocumentTypeLabel(doc)}
                            </span>
                            {(doc.extracted_text ?? '').trim() ? (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                                Searchable
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                                No text found
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void removeDocument(doc.id)}
                        className="shrink-0 text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <ProjectMemoryAssistant
          activeProject={activeProject ? { id: activeProject.id, name: activeProject.name } : null}
          title="Ask Project Memory"
          description="Search context docs, generated artifacts, tasks, and saved decisions with citations."
          bodyHeightClass="h-[660px]"
          samplePrompts={[
            'Show me all user stories we generated',
            'What decisions have we made about launch timing?',
            'Which open tasks are related to release communications?',
          ]}
          emptyStateCopy="Ask anything about this project. I will answer from context docs, saved artifacts, tasks, and extracted decisions."
        />
      </div>
    </PageShell>
  );
}

function getDocumentTypeLabel(doc: ContextDocument) {
  return doc.document_type ?? doc.doc_type ?? 'Context';
}

function ContextMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

function BadgeLike({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
      {children}
    </span>
  );
}
