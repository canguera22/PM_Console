import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  FileText,
  Files,
  MessageSquare,
  Quote,
  Search,
  Send,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageShell } from '@/components/PageShell';
import { uploadProjectDocument } from '@/lib/projectDocuments';
import { supabase } from '@/lib/supabase';
import { useActiveProject } from '@/contexts/ActiveProjectContext';

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
}

interface SearchResult {
  documentId: string;
  documentName: string;
  quote: string;
  score: number;
}

export default function ContextDocs() {
  const { activeProject } = useActiveProject();
  const [documents, setDocuments] = useState<ContextDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'Ask a question about the uploaded context documents. I will only use text extracted from those documents.',
    },
  ]);

  useEffect(() => {
    if (!activeProject) {
      setDocuments([]);
      return;
    }

    void loadDocuments();
  }, [activeProject?.id]);

  const searchableDocuments = useMemo(
    () =>
      documents.filter((doc) => (doc.extracted_text ?? '').trim().length > 0),
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

  function handleAskQuestion() {
    const question = chatInput.trim();
    if (!question) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    const results = searchContextDocuments(question, searchableDocuments);
    const answer =
      results.length > 0
        ? buildAnswer(question, results)
        : 'I could not find a matching answer in the uploaded context documents. Try different terms, or upload a document that contains this information.';

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: answer,
      sources: results,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setChatInput('');
  }

  return (
    <PageShell
      eyebrow="Project Knowledge"
      title="Context Docs"
      icon={BookOpen}
      description={`Upload source material and search only the extracted text for ${activeProject?.name ?? 'the active project'}.`}
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
          label="Answer mode"
          value={searchableDocuments.length > 0 ? 'Cited' : 'Waiting'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="m-0 text-lg font-semibold text-slate-950">
                  Documents
                </h2>
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

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <MessageSquare className="h-5 w-5" />
                </span>
              <div>
                <h2 className="m-0 text-lg font-semibold text-slate-950">
                  Ask the Knowledge Base
                </h2>
                <p className="text-sm text-slate-600">
                  Answers stay grounded in uploaded document text and show citations.
                </p>
              </div>
              </div>
              <BadgeLike>{searchableDocuments.length} sources ready</BadgeLike>
            </div>
          </div>

          <div className="flex h-[660px] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'ml-auto bg-blue-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  <p className="whitespace-pre-line">{message.content}</p>
                  {message.sources && message.sources.length > 0 ? (
                    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                      {message.sources.map((source) => (
                        <div
                          key={`${message.id}-${source.documentId}`}
                          className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-slate-800">
                              {source.documentName}
                            </p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                              Relevance {source.score}
                            </span>
                          </div>
                          <p className="mt-2 border-l-2 border-blue-200 pl-3 text-slate-600">
                            "{source.quote}"
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  'What timing or cadence is mentioned?',
                  'What implementation constraints are listed?',
                  'Which documents mention reporting?',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setChatInput(sample)}
                    disabled={searchableDocuments.length === 0}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sample}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleAskQuestion();
                    }
                  }}
                  placeholder="Ask about an uploaded context document..."
                  disabled={searchableDocuments.length === 0}
                />
                <Button
                  onClick={handleAskQuestion}
                  disabled={!chatInput.trim() || searchableDocuments.length === 0}
                  className="shrink-0 gap-2"
                >
                  <Send className="h-4 w-4" />
                  Ask
                </Button>
              </div>
              {searchableDocuments.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Upload a supported document with extractable text to enable document Q&A.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function searchContextDocuments(
  question: string,
  documents: ContextDocument[]
): SearchResult[] {
  const terms = tokenize(question);
  if (terms.length === 0) return [];

  const matches = documents
    .flatMap((doc) => {
      const text = doc.extracted_text ?? '';
      const chunks = chunkText(text, 900);
      return chunks.map((chunk) => ({
        documentId: doc.id,
        documentName: doc.name,
        quote: makeQuote(chunk, terms),
        score: scoreText(chunk, terms),
      }));
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestByDocument = new Map<string, SearchResult>();
  for (const match of matches) {
    if (!bestByDocument.has(match.documentId)) {
      bestByDocument.set(match.documentId, match);
    }
  }

  return Array.from(bestByDocument.values()).slice(0, 3);
}

function buildAnswer(_question: string, results: SearchResult[]) {
  const primary = results[0];
  if (!primary) {
    return 'I could not find a matching answer in the uploaded context documents.';
  }

  return `The strongest match is in ${primary.documentName}. I found the relevant passage below, with supporting references when available.`;
}

function tokenize(value: string) {
  const stopWords = new Set([
    'about',
    'after',
    'again',
    'also',
    'and',
    'are',
    'can',
    'for',
    'from',
    'how',
    'the',
    'this',
    'that',
    'what',
    'when',
    'where',
    'with',
    'you',
    'your',
  ]);

  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

function scoreText(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => {
    const matches = normalized.split(term).length - 1;
    return score + matches;
  }, 0);
}

function chunkText(text: string, size: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: string[] = [];
  for (let index = 0; index < clean.length; index += size) {
    chunks.push(clean.slice(index, index + size));
  }
  return chunks;
}

function makeQuote(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const scoredSentences = sentences
    .map((sentence) => ({
      sentence,
      score: scoreText(sentence, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredSentences.length > 0) {
    const quote = scoredSentences
      .slice(0, 2)
      .map((item) => item.sentence)
      .join(' ');
    return quote.length > 420 ? `${quote.slice(0, 417).trim()}...` : quote;
  }

  const firstMatch = terms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  const start = Math.max(0, (firstMatch ?? 0) - 120);
  const quote = text.slice(start, start + 320).trim();
  return `${start > 0 ? '...' : ''}${quote}${start + 320 < text.length ? '...' : ''}`;
}

function BadgeLike({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
      {children}
    </span>
  );
}

function ContextMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-bold leading-none text-slate-950">
            {value}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

function getDocumentTypeLabel(doc: ContextDocument) {
  const value = doc.document_type ?? doc.doc_type ?? '';
  if (value) {
    return value
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  const extension = doc.name.split('.').pop();
  return extension ? extension.toUpperCase() : 'Document';
}
