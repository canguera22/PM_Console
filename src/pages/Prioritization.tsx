import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import {
  ArrowRight,
  Compass,
  Copy,
  Lightbulb,
  Loader2,
  Search,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { ArtifactActions } from '@/components/ArtifactActions';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { FeatureAssociationSelect } from '@/components/FeatureAssociationSelect';
import { SessionHistoryCard } from '@/components/history/SessionHistoryCard';
import { PageShell } from '@/components/PageShell';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { reviseArtifactWithAdvisor } from '@/lib/artifact-revision';
import { DISCOVERY_OUTPUTS, DISCOVERY_TYPES } from '@/lib/discovery-definitions';
import { fetchContextArtifacts, callPMAdvisorAgent, saveAdvisorReview } from '@/lib/pm-advisor';
import { linkFeatureArtifact } from '@/lib/projectFeatures';
import { generateDiscovery } from '@/lib/prioritization-agent';
import { supabaseFetch } from '@/lib/supabase';
import type { DiscoveryOutputType, DiscoveryRequestInput, DiscoveryType } from '@/types/discovery';
import { OUTPUT_LANGUAGE_OPTIONS, type OutputLanguage } from '@/types/output-language';
import type { ProjectArtifact } from '@/types/project-artifacts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type ResultsTab = 'current' | 'advisor' | 'history';

type DiscoveryArtifactSession = ProjectArtifact & {
  metadata: Record<string, any> | null;
  input_data: Record<string, any> | null;
};

const DEFAULT_OUTPUTS: DiscoveryOutputType[] = [
  'Executive Summary',
  'Key Themes',
  'Pain Points',
  'Opportunity Areas',
  'Open Questions',
  'Recommended Next Steps',
];

const DISCOVERY_TYPE_BADGE_STYLES: Record<DiscoveryType, string> = {
  customer_interview: 'border-blue-200 bg-blue-50 text-blue-700',
  support_feedback: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sales_feedback: 'border-violet-200 bg-violet-50 text-violet-700',
  market_research: 'border-amber-200 bg-amber-50 text-amber-800',
  opportunity_sizing: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  general_discovery: 'border-slate-200 bg-slate-100 text-slate-700',
};

function discoveryTypeLabel(value?: string | null) {
  return DISCOVERY_TYPES.find((item) => item.value === value)?.label ?? 'General Discovery';
}

function artifactDisplayName(artifact: DiscoveryArtifactSession) {
  const nestedInput = (artifact.input_data?.input ?? {}) as Record<string, any>;
  return (
    artifact.artifact_name ||
    nestedInput.problem_area ||
    nestedInput.research_goal ||
    nestedInput.discovery_topic ||
    'Untitled Discovery Brief'
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export default function Discovery() {
  const { activeProject } = useActiveProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const artifactIdFromUrl = searchParams.get('artifact');

  const [discoveryType, setDiscoveryType] = useState<DiscoveryType>('general_discovery');
  const [problemArea, setProblemArea] = useState('');
  const [targetSegment, setTargetSegment] = useState('');
  const [researchGoal, setResearchGoal] = useState('');
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [notesContext, setNotesContext] = useState('');
  const [signalFocus, setSignalFocus] = useState('');
  const [selectedOutputs, setSelectedOutputs] = useState<DiscoveryOutputType[]>(DEFAULT_OUTPUTS);
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('english');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  const [sessions, setSessions] = useState<DiscoveryArtifactSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentOutput, setCurrentOutput] = useState('');
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [currentArtifactName, setCurrentArtifactName] = useState<string | null>(null);
  const [currentArtifactCreatedAt, setCurrentArtifactCreatedAt] = useState<string | null>(null);
  const [currentArtifactInput, setCurrentArtifactInput] = useState<Record<string, any> | null>(null);
  const [currentArtifactVersion, setCurrentArtifactVersion] = useState<number>(1);

  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('current');
  const [advisorOutput, setAdvisorOutput] = useState('');
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [isRunningAdvisor, setIsRunningAdvisor] = useState(false);
  const [isRevising, setIsRevising] = useState(false);

  const selectedDiscoveryType = useMemo(
    () => DISCOVERY_TYPES.find((item) => item.value === discoveryType) ?? DISCOVERY_TYPES[DISCOVERY_TYPES.length - 1],
    [discoveryType]
  );

  const sourceMaterialWordCount = useMemo(() => {
    const trimmed = sourceMaterial.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [sourceMaterial]);

  const loadSessions = useCallback(async () => {
    if (!activeProject) {
      setSessions([]);
      setIsLoadingSessions(false);
      return;
    }

    try {
      setIsLoadingSessions(true);
      const data = await supabaseFetch<DiscoveryArtifactSession[]>(
        `/project_artifacts?project_id=eq.${activeProject.id}&artifact_type=eq.prioritization&status=eq.active&order=created_at.desc&limit=24`
      );
      setSessions(data ?? []);
    } catch (loadError) {
      console.error('Error loading discovery sessions:', loadError);
      toast.error('Failed to load discovery history');
    } finally {
      setIsLoadingSessions(false);
    }
  }, [activeProject]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadSession = useCallback((artifact: DiscoveryArtifactSession) => {
    const nestedInput = (artifact.input_data?.input ?? {}) as Record<string, any>;
    const legacyInput = (artifact.input_data ?? {}) as Record<string, any>;

    const nextSelectedOutputs = (
      asStringArray(artifact.input_data?.selected_outputs).length
        ? asStringArray(artifact.input_data?.selected_outputs)
        : asStringArray(nestedInput.selected_outputs ?? legacyInput.selected_outputs)
    ).filter((item): item is DiscoveryOutputType => DISCOVERY_OUTPUTS.includes(item as DiscoveryOutputType));

    setDiscoveryType(
      (nestedInput.discovery_type ?? legacyInput.discovery_type ?? 'general_discovery') as DiscoveryType
    );
    setProblemArea(
      String(nestedInput.problem_area ?? legacyInput.problem_area ?? nestedInput.initiative_name ?? '')
    );
    setTargetSegment(String(nestedInput.target_segment ?? legacyInput.target_segment ?? ''));
    setResearchGoal(String(nestedInput.research_goal ?? legacyInput.research_goal ?? ''));
    setSourceMaterial(String(nestedInput.source_material ?? legacyInput.source_material ?? ''));
    setNotesContext(String(nestedInput.notes_context ?? legacyInput.notes_context ?? ''));
    setSignalFocus(String(nestedInput.signal_focus ?? legacyInput.signal_focus ?? ''));
    setSelectedOutputs(nextSelectedOutputs.length > 0 ? nextSelectedOutputs : DEFAULT_OUTPUTS);
    setOutputLanguage(
      (artifact.metadata?.output_language as OutputLanguage | undefined) ??
        (artifact.input_data?.output_language as OutputLanguage | undefined) ??
        'english'
    );

    setCurrentOutput(artifact.output_data ?? '');
    setCurrentArtifactId(artifact.id);
    setCurrentArtifactName(artifactDisplayName(artifact));
    setCurrentArtifactCreatedAt(artifact.created_at);
    setCurrentArtifactInput(nestedInput);
    setCurrentArtifactVersion(typeof artifact.metadata?.version === 'number' ? artifact.metadata.version : 1);
    setAdvisorOutput('');
    setAdvisorError(null);
    setActiveResultsTab('current');
  }, []);

  useEffect(() => {
    if (!artifactIdFromUrl || sessions.length === 0) return;
    const matching = sessions.find((session) => session.id === artifactIdFromUrl);
    if (matching) {
      loadSession(matching);
    }
  }, [artifactIdFromUrl, loadSession, sessions]);

  const toggleOutput = (output: DiscoveryOutputType) => {
    setSelectedOutputs((current) =>
      current.includes(output)
        ? current.filter((item) => item !== output)
        : [...current, output]
    );
  };

  const resetDraft = () => {
    setDiscoveryType('general_discovery');
    setProblemArea('');
    setTargetSegment('');
    setResearchGoal('');
    setSourceMaterial('');
    setNotesContext('');
    setSignalFocus('');
    setSelectedOutputs(DEFAULT_OUTPUTS);
    setOutputLanguage('english');
    setCurrentOutput('');
    setCurrentArtifactId(null);
    setCurrentArtifactName(null);
    setCurrentArtifactCreatedAt(null);
    setCurrentArtifactInput(null);
    setCurrentArtifactVersion(1);
    setAdvisorOutput('');
    setAdvisorError(null);
    setError(null);
    setActiveResultsTab('current');
    setSearchParams({});
  };

  const handleGenerate = async () => {
    setError(null);
    setAdvisorError(null);

    if (!activeProject) {
      setError('Choose an active project before generating discovery output.');
      return;
    }

    if (!sourceMaterial.trim()) {
      setError('Add source material so Discovery has something real to synthesize.');
      return;
    }

    if (selectedOutputs.length === 0) {
      setError('Choose at least one output to shape the discovery brief.');
      return;
    }

    const artifactName = problemArea.trim()
      ? `${problemArea.trim()} Discovery Brief`
      : `${selectedDiscoveryType.label} Discovery Brief`;

    const payload: DiscoveryRequestInput = {
      project_id: activeProject.id,
      project_name: activeProject.name,
      artifact_name: artifactName,
      discovery_type: discoveryType,
      source_material: sourceMaterial,
      problem_area: problemArea || undefined,
      target_segment: targetSegment || undefined,
      research_goal: researchGoal || undefined,
      notes_context: notesContext || undefined,
      signal_focus: signalFocus || undefined,
      selected_outputs: selectedOutputs,
      output_language: outputLanguage,
    };

    try {
      setIsGenerating(true);
      const result = await callAgentWithLogging(
        'Discovery',
        'prioritization',
        payload,
        () => generateDiscovery(payload)
      );

      setCurrentOutput(result.output);
      setCurrentArtifactId(result.artifact_id ?? null);
      setCurrentArtifactName(artifactName);
      setCurrentArtifactCreatedAt(new Date().toISOString());
      setCurrentArtifactInput(payload);
      setCurrentArtifactVersion(1);
      setActiveResultsTab('current');
      setAdvisorOutput('');
      setSearchParams(result.artifact_id ? { artifact: result.artifact_id } : {});
      if (selectedFeatureId && result.artifact_id) {
        try {
          await linkFeatureArtifact(activeProject.id, selectedFeatureId, result.artifact_id, 'source');
        } catch (linkError: unknown) {
          toast.warning('Discovery brief generated, but feature linking failed', {
            description:
              linkError instanceof Error
                ? linkError.message
                : 'You can still link this artifact from the feature workspace.',
          });
        }
      }
      await loadSessions();
      toast.success('Discovery brief generated');
    } catch (generationError: any) {
      console.error('Discovery generation failed:', generationError);
      setError(parseErrorMessage(generationError));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!currentOutput.trim()) return;
    await navigator.clipboard.writeText(currentOutput);
    toast.success('Discovery output copied');
  };

  const handleRunAdvisor = async () => {
    if (!activeProject || !currentOutput.trim()) {
      setAdvisorError('Generate or load a discovery brief first.');
      return;
    }

    try {
      setIsRunningAdvisor(true);
      setAdvisorError(null);

      const contextArtifacts = await fetchContextArtifacts(activeProject.id);
      const result = await callPMAdvisorAgent({
        artifact_output: currentOutput,
        artifact_id: currentArtifactId ?? undefined,
        module_type: 'prioritization',
        artifact_type: 'prioritization',
        project_id: activeProject.id,
        project_name: activeProject.name,
        artifact_name: currentArtifactName ?? undefined,
        source_session_table: 'project_artifacts',
        source_session_id: currentArtifactId,
        selected_outputs: selectedOutputs,
        context_artifacts: contextArtifacts,
      });

      setAdvisorOutput(result.output);
      setActiveResultsTab('advisor');

      await saveAdvisorReview(
        activeProject.id,
        activeProject.name,
        'discovery',
        'project_artifacts',
        currentArtifactId,
        'prioritization',
        currentArtifactInput,
        currentOutput,
        result.output,
        {
          artifact_id: currentArtifactId,
          output_language: outputLanguage,
          selected_outputs: selectedOutputs,
        }
      );

      toast.success('PM Advisor reviewed this discovery brief');
    } catch (advisorRunError: any) {
      console.error('Discovery advisor failed:', advisorRunError);
      setAdvisorError(parseErrorMessage(advisorRunError));
    } finally {
      setIsRunningAdvisor(false);
    }
  };

  const handleReviseOutput = async () => {
    if (!activeProject || !currentArtifactId || !currentOutput.trim() || !advisorOutput.trim()) {
      setAdvisorError('Run PM Advisor on an active discovery artifact before revising.');
      return;
    }

    try {
      setIsRevising(true);
      setAdvisorError(null);

      const result = await reviseArtifactWithAdvisor({
        project_id: activeProject.id,
        project_name: activeProject.name,
        artifact_id: currentArtifactId,
        artifact_name: currentArtifactName,
        module_type: 'prioritization',
        artifact_type: 'prioritization',
        original_input: currentArtifactInput,
        original_output: currentOutput,
        advisor_feedback: advisorOutput,
        selected_outputs: selectedOutputs,
        output_language: outputLanguage,
      });

      setCurrentOutput(result.output);
      setCurrentArtifactVersion((version) => version + 1);
      setActiveResultsTab('current');
      toast.success('Discovery brief revised with PM Advisor');
    } catch (revisionError: any) {
      console.error('Discovery revision failed:', revisionError);
      setAdvisorError(parseErrorMessage(revisionError));
    } finally {
      setIsRevising(false);
    }
  };

  const currentTimestampLabel = currentArtifactCreatedAt
    ? new Date(currentArtifactCreatedAt).toLocaleString()
    : null;

  return (
    <PageShell
      eyebrow="Discovery"
      title="Turn raw signals into a usable point of view"
      icon={Compass}
      description="Bring in feedback, notes, research, or interview scraps and turn them into a grounded discovery brief you can actually work from."
    >
      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <Card className="overflow-hidden border-slate-200 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)]">
            <CardHeader className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_42%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Badge variant="outline" className={DISCOVERY_TYPE_BADGE_STYLES[discoveryType]}>
                    {selectedDiscoveryType.label}
                  </Badge>
                  <CardTitle className="text-[22px] text-slate-950">Discovery Setup</CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
                    {selectedDiscoveryType.description}
                  </CardDescription>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-white/80 px-3 py-2 text-right shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Signal Load
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{sourceMaterialWordCount}</p>
                  <p className="text-xs text-slate-500">words in source</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="space-y-2">
                <Label htmlFor="discovery-type">Discovery Type</Label>
                <Select value={discoveryType} onValueChange={(value) => setDiscoveryType(value as DiscoveryType)}>
                  <SelectTrigger id="discovery-type">
                    <SelectValue placeholder="Choose a discovery lens" />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCOVERY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <Label htmlFor="problem-area">Problem Area</Label>
                  <Input
                    id="problem-area"
                    placeholder="Example: Monthly file pickup timing"
                    value={problemArea}
                    onChange={(event) => setProblemArea(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="target-segment">Customer / Segment</Label>
                  <Input
                    id="target-segment"
                    placeholder="Example: Operations team"
                    value={targetSegment}
                    onChange={(event) => setTargetSegment(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="research-goal">What are we trying to learn?</Label>
                <Textarea
                  id="research-goal"
                  placeholder="Example: Understand whether current timing introduces avoidable ops delay."
                  value={researchGoal}
                  onChange={(event) => setResearchGoal(event.target.value)}
                  className="min-h-[96px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source-material">Source Material</Label>
                <Textarea
                  id="source-material"
                  placeholder="Paste interview notes, support tickets, research findings, Slack snippets, or mixed discovery inputs here."
                  value={sourceMaterial}
                  onChange={(event) => setSourceMaterial(event.target.value)}
                  className="min-h-[220px]"
                />
                <p className="text-xs text-slate-500">
                  Best results come from raw evidence, not already-polished conclusions.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discovery-context">Known Constraints / Context</Label>
                <Textarea
                  id="discovery-context"
                  placeholder="Optional: existing constraints, known business rules, or anything the synthesis should respect."
                  value={notesContext}
                  onChange={(event) => setNotesContext(event.target.value)}
                  className="min-h-[110px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signal-focus">Signal Focus</Label>
                <Textarea
                  id="signal-focus"
                  placeholder="Optional: tell Discovery what to pay special attention to, like churn risk, workflow friction, launch readiness, or adoption blockers."
                  value={signalFocus}
                  onChange={(event) => setSignalFocus(event.target.value)}
                  className="min-h-[96px]"
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Output Blueprint</p>
                    <p className="text-xs text-slate-500">
                      Choose what the brief should lean into.
                    </p>
                  </div>
                  <div className="w-[150px]">
                    <Label htmlFor="discovery-output-language" className="sr-only">
                      Output language
                    </Label>
                    <Select
                      value={outputLanguage}
                      onValueChange={(value) => setOutputLanguage(value as OutputLanguage)}
                    >
                      <SelectTrigger id="discovery-output-language">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        {OUTPUT_LANGUAGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <FeatureAssociationSelect
                  projectId={activeProject?.id}
                  value={selectedFeatureId}
                  onChange={setSelectedFeatureId}
                  disabled={isGenerating}
                />

                <div className="grid gap-2">
                  {DISCOVERY_OUTPUTS.map((output) => {
                    const checked = selectedOutputs.includes(output);
                    return (
                      <button
                        key={output}
                        type="button"
                        onClick={() => toggleOutput(output)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          checked
                            ? 'border-blue-200 bg-white shadow-sm'
                            : 'border-slate-200 bg-white/70 hover:border-slate-300'
                        }`}
                      >
                        <Checkbox checked={checked} className="pointer-events-none" />
                        <span className="text-sm font-medium text-slate-700">{output}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !activeProject}
                  className="min-w-[170px] gap-2"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Generate Discovery
                </Button>
                <Button variant="outline" onClick={resetDraft}>
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {error ? <ErrorDisplay message={error} /> : null}

          <Card className="overflow-hidden border-slate-200 shadow-[0_20px_60px_-44px_rgba(15,23,42,0.4)]">
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      Discovery Workspace
                    </Badge>
                    {currentArtifactVersion > 1 ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        v{currentArtifactVersion}
                      </Badge>
                    ) : null}
                  </div>
                  <CardTitle className="text-[24px] text-slate-950">
                    {currentArtifactName ?? 'Latest output'}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
                    {currentTimestampLabel
                      ? `Last generated ${currentTimestampLabel}`
                      : 'Generate a discovery brief or load one from history.'}
                  </CardDescription>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCopyOutput}
                    disabled={!currentOutput.trim()}
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                  <ArtifactActions
                    title={currentArtifactName ?? 'Discovery Brief'}
                    content={currentOutput}
                    projectName={activeProject?.name}
                    moduleLabel="Discovery"
                    createdAt={currentArtifactCreatedAt}
                    className="border-slate-200"
                  />
                  <Button
                    variant="outline"
                    onClick={handleRunAdvisor}
                    disabled={isRunningAdvisor || !currentOutput.trim()}
                    className="gap-2"
                  >
                    {isRunningAdvisor ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lightbulb className="h-4 w-4" />
                    )}
                    Run PM Advisor
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-5">
              <Tabs value={activeResultsTab} onValueChange={(value) => setActiveResultsTab(value as ResultsTab)}>
                <TabsList className="mb-5 grid w-full grid-cols-3">
                  <TabsTrigger value="current">Current Output</TabsTrigger>
                  <TabsTrigger value="advisor">PM Advisor</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="current" className="space-y-4">
                  {currentOutput.trim() ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className={DISCOVERY_TYPE_BADGE_STYLES[discoveryType]}>
                          {selectedDiscoveryType.label}
                        </Badge>
                        {selectedOutputs.map((output) => (
                          <Badge key={output} variant="secondary" className="bg-slate-100 text-slate-700">
                            {output}
                          </Badge>
                        ))}
                      </div>
                      <ScrollArea className="h-[780px] rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6">
                        <div className="prose prose-slate max-w-none prose-headings:text-slate-950 prose-p:text-slate-700 prose-li:text-slate-700">
                          <ReactMarkdown>{currentOutput}</ReactMarkdown>
                        </div>
                      </ScrollArea>
                    </>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-950">Ready to synthesize</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Discovery works best when we give it real evidence and a crisp question to answer.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="advisor" className="space-y-4">
                  {advisorError ? <ErrorDisplay message={advisorError} /> : null}
                  {advisorOutput.trim() ? (
                    <>
                      <div className="flex flex-wrap justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                        <div>
                          <p className="text-sm font-semibold text-amber-900">PM Advisor feedback</p>
                          <p className="mt-1 text-sm text-amber-800">
                            Use this second pass to tighten evidence quality and sharpen the story.
                          </p>
                        </div>
                        <Button
                          onClick={handleReviseOutput}
                          disabled={isRevising}
                          className="gap-2 bg-slate-950 text-white hover:bg-slate-800"
                        >
                          {isRevising ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                          Revise Output
                        </Button>
                      </div>
                      <ScrollArea className="h-[720px] rounded-3xl border border-slate-200 bg-white p-6">
                        <div className="prose prose-slate max-w-none prose-headings:text-slate-950 prose-p:text-slate-700 prose-li:text-slate-700">
                          <ReactMarkdown>{advisorOutput}</ReactMarkdown>
                        </div>
                      </ScrollArea>
                    </>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                        <Lightbulb className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-950">PM Advisor is standing by</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Run a review once you have a discovery brief and we’ll tighten it before it moves downstream.
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                  {isLoadingSessions ? (
                    <div className="flex items-center justify-center py-16 text-slate-500">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading discovery history...
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center">
                      <h3 className="text-lg font-semibold text-slate-950">No discovery briefs yet</h3>
                      <p className="mt-2 text-sm text-slate-600">
                        Your generated briefs will show up here with their context and output focus.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {sessions.map((session) => {
                        const nestedInput = (session.input_data?.input ?? {}) as Record<string, any>;
                        const outputBadges = asStringArray(session.input_data?.selected_outputs)
                          .concat(asStringArray(nestedInput.selected_outputs))
                          .filter((value, index, array) => array.indexOf(value) === index);

                        return (
                          <SessionHistoryCard
                            key={session.id}
                            title={artifactDisplayName(session)}
                            timestamp={new Date(session.created_at).toLocaleString()}
                            description={nestedInput.research_goal ?? nestedInput.problem_area ?? undefined}
                            metaLine={nestedInput.target_segment ? `Segment: ${nestedInput.target_segment}` : undefined}
                            badges={[discoveryTypeLabel(nestedInput.discovery_type), ...outputBadges].slice(0, 5)}
                            rightBadge={
                              typeof session.metadata?.version === 'number' && session.metadata.version > 1
                                ? `v${session.metadata.version}`
                                : undefined
                            }
                            onClick={() => {
                              setSearchParams({ artifact: session.id });
                              loadSession(session);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]">
            <CardHeader>
              <CardTitle className="text-lg text-slate-950">How Discovery should think</CardTitle>
              <CardDescription>
                This module is designed to be upstream of docs and tasks, so it should stay grounded in evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">Start with evidence</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Raw interview notes, support patterns, or research scraps are better than pre-baked conclusions.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">Separate fact from interpretation</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Discovery should call out what is known, what is inferred, and what still needs validation.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-950">Leave a clean handoff</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  The best output gives you a clear bridge into docs, tasks, or follow-up research without overreaching.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
