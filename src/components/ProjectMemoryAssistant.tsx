import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, ExternalLink, MessageSquare, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { queryProjectMemory, type ProjectMemoryCitation } from '@/lib/projectMemory';

interface ActiveProjectLike {
  id: string;
  name: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ProjectMemoryCitation[];
}

interface ProjectMemoryAssistantProps {
  activeProject: ActiveProjectLike | null;
  title?: string;
  description?: string;
  samplePrompts?: string[];
  bodyHeightClass?: string;
  emptyStateCopy?: string;
  scopeOptions?: Array<{ id: string; label: string; featureId?: string }>;
  selectedScopeId?: string;
  onSelectedScopeChange?: (scopeId: string) => void;
  embedded?: boolean;
}

export function ProjectMemoryAssistant({
  activeProject,
  title = 'Ask Project Memory',
  description = 'Search across context docs, generated artifacts, open work, and saved decisions.',
  samplePrompts = [],
  bodyHeightClass = 'h-[660px]',
  emptyStateCopy = 'Ask anything about this project. I will answer from saved project material and show where the answer came from.',
  scopeOptions = [],
  selectedScopeId,
  onSelectedScopeChange,
  embedded = false,
}: ProjectMemoryAssistantProps) {
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const hasActiveProject = Boolean(activeProject);

  const selectedScope = useMemo(
    () => scopeOptions.find((scope) => scope.id === selectedScopeId),
    [scopeOptions, selectedScopeId]
  );

  const scopeLabel = selectedScope?.label ?? 'All Project';

  useEffect(() => {
    setMessages([
      {
        id: `intro-${activeProject?.id ?? 'none'}-${selectedScopeId ?? 'project'}`,
        role: 'assistant',
        content: hasActiveProject
          ? selectedScope?.featureId
            ? `${emptyStateCopy}\n\nCurrent scope: ${scopeLabel}.`
            : emptyStateCopy
          : 'Choose an active project to search project memory.',
      },
    ]);
    setChatInput('');
  }, [activeProject?.id, emptyStateCopy, hasActiveProject, scopeLabel, selectedScope?.featureId, selectedScopeId]);

  const promptCountLabel = useMemo(() => {
    if (!activeProject) return 'No project selected';
    return `${samplePrompts.length || 0} prompt ideas`;
  }, [activeProject, samplePrompts.length]);

  async function handleAskQuestion() {
    const question = chatInput.trim();
    if (!question || !activeProject || isSubmitting) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setIsSubmitting(true);

    try {
      const result = await queryProjectMemory({
        project_id: activeProject.id,
        project_name: activeProject.name,
        query: question,
        feature_id: selectedScope?.featureId,
        feature_name: selectedScope?.featureId ? selectedScope.label : undefined,
      });

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: unknown) {
      toast.error('Project memory could not answer that yet', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content:
            'I hit an issue while searching this project. Please try again in a moment.',
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className={embedded ? 'overflow-hidden bg-white' : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'}>
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <h2 className="m-0 text-lg font-semibold text-slate-950">{title}</h2>
              <p className="text-sm text-slate-600">{description}</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            {selectedScope?.featureId ? `Feature: ${scopeLabel}` : promptCountLabel}
          </span>
        </div>
        {scopeOptions.length > 1 && onSelectedScopeChange ? (
          <div className="mt-4 max-w-sm">
            <Select value={selectedScopeId ?? 'project'} onValueChange={onSelectedScopeChange}>
              <SelectTrigger className="border-slate-200 bg-white">
                <SelectValue placeholder="Choose scope" />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((scope) => (
                  <SelectItem key={scope.id} value={scope.id}>
                    {scope.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <div className={`flex flex-col ${bodyHeightClass}`}>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === 'user'
                  ? 'ml-auto bg-blue-600 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-800'
              }`}
            >
              <p className="whitespace-pre-line">{message.content}</p>
              {message.citations && message.citations.length > 0 ? (
                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  {message.citations.map((citation) => (
                    <div
                      key={`${message.id}-${citation.id}`}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-800">{citation.title}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                              {citation.badgeLabel ?? citation.kind}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                              Relevance {citation.score}
                            </span>
                          </div>
                        </div>
                        {citation.route ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-2 px-3 text-xs"
                            onClick={() => navigate(citation.route!)}
                          >
                            {citation.routeLabel}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                      <p className="mt-2 border-l-2 border-blue-200 pl-3 text-slate-600">
                        "{citation.quote}"
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}

          {isSubmitting ? (
            <div className="max-w-[92%] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Searching project memory...
            </div>
          ) : null}
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {samplePrompts.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setChatInput(sample)}
                disabled={!activeProject || isSubmitting}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sample}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleAskQuestion();
                  }
                }}
                placeholder="Ask anything about this project..."
                disabled={!activeProject || isSubmitting}
                className="pl-9"
              />
            </div>
            <Button
              onClick={() => void handleAskQuestion()}
              disabled={!chatInput.trim() || !activeProject || isSubmitting}
              className="shrink-0 gap-2"
            >
              {isSubmitting ? (
                <>
                  <MessageSquare className="h-4 w-4" />
                  Thinking
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Ask
                </>
              )}
            </Button>
          </div>
          {!activeProject ? (
            <p className="mt-2 text-xs text-slate-500">
              Select a project to query its saved memory.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
