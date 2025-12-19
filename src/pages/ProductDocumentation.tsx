import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, CheckCircle2, Loader2, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabaseFetch } from '@/lib/supabase';
import { generateDocumentation } from '@/lib/documentation-agent';
import { DocumentationSession, DocumentationFormData, OUTPUT_TYPES } from '@/types/documentation';
import { ActiveProjectSelector } from '@/components/ActiveProjectSelector';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import ReactMarkdown from 'react-markdown';
import { callPMAdvisorAgent, fetchContextArtifacts, saveAdvisorReview } from '@/lib/pm-advisor';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';

// Lightweight row type for project_artifacts
type ProjectArtifactRow = {
  id: string;
  created_at: string;
  project_id: string;
  project_name: string;
  artifact_type: string;
  artifact_name: string | null;
  input_data: Record<string, any> | null;
  output_data: string | null;
  metadata: Record<string, any> | null;
  advisor_feedback: string | null;
  advisor_reviewed_at: string | null;
  status: 'active' | 'archived' | 'deleted';
};

export default function ProductDocumentation() {
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();
  const [isGenerating, setIsGenerating] = useState(false);

  const [formData, setFormData] = useState<DocumentationFormData>({
    problem_statement: '',
    target_user_persona: '',
    business_goals: '',
    assumptions_constraints: '',
    functional_requirements: '',
    dependencies: '',
    non_functional_requirements: '',
    user_pain_points: '',
    competitive_context: '',
    technical_constraints: '',
    success_metrics: '',
    target_timeline: '',
    epic_impact: '',
  });

  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);
  const [currentOutput, setCurrentOutput] = useState<string>('');
  const [sessionHistory, setSessionHistory] = useState<DocumentationSession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // PM Advisor state
  const [advisorOutput, setAdvisorOutput] = useState<string>('');
  const [isRunningAdvisor, setIsRunningAdvisor] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null); // UUID artifact id

  // Error state
  const [error, setError] = useState<string | null>(null);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  // Load session history when active project changes
  useEffect(() => {
    if (activeProject) {
      void loadSessionHistory();
    } else {
      setSessionHistory([]);
      setIsLoadingHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  const artifactToDocumentationSession = (a: ProjectArtifactRow): DocumentationSession => {
    const input = (a.input_data ?? {}) as Record<string, any>;
    const metadata = (a.metadata ?? {}) as Record<string, any>;

    // The session model your UI expects. We derive it from input_data.
    return {
      id: a.id as any, // in case your DocumentationSession.id is typed as number; better to update it to string later
      created_at: a.created_at,

      problem_statement: input.problem_statement ?? '',
      target_user_persona: input.target_user_persona ?? '',
      business_goals: input.business_goals ?? '',
      assumptions_constraints: input.assumptions_constraints ?? '',
      functional_requirements: input.functional_requirements ?? '',
      dependencies: input.dependencies ?? '',

      non_functional_requirements: input.non_functional_requirements ?? '',
      user_pain_points: input.user_pain_points ?? '',
      competitive_context: input.competitive_context ?? '',
      technical_constraints: input.technical_constraints ?? '',
      success_metrics: input.success_metrics ?? '',
      target_timeline: input.target_timeline ?? '',
      epic_impact: input.epic_impact ?? '',

      selected_outputs: input.selected_outputs ?? [],
      output: a.output_data ?? '',
      project_id: a.project_id ?? null,
      module_type: metadata.module_type ?? 'product_documentation',
    } as any;
  };

  const loadSessionHistory = async () => {
    if (!activeProject) return;
    try {
      setIsLoadingHistory(true);

      const artifacts = await supabaseFetch<ProjectArtifactRow[]>(
        `/project_artifacts?project_id=eq.${activeProject.id}` +
          `&artifact_type=eq.product_documentation` +
          `&status=eq.active` +
          `&order=created_at.desc&limit=20`
      );

      setSessionHistory((artifacts ?? []).map(artifactToDocumentationSession));
    } catch (err) {
      console.error('Error loading session history:', err);
      toast.error('Failed to load session history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleInputChange = (field: keyof DocumentationFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleOutput = (output: string) => {
    setSelectedOutputs((prev) => (prev.includes(output) ? prev.filter((o) => o !== output) : [...prev, output]));
  };

  const isFormValid = () => {
    const requiredFields: (keyof DocumentationFormData)[] = [
      'problem_statement',
      'target_user_persona',
      'business_goals',
      'assumptions_constraints',
      'functional_requirements',
      'dependencies',
    ];
    return requiredFields.every((field) => formData[field].trim() !== '') && selectedOutputs.length > 0;
  };

  const handleGenerate = async () => {
    setError(null);

    if (!isFormValid()) {
      const errorMsg = 'Please fill in all required fields and select at least one output type';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!activeProject) {
      const errorMsg = 'No active project selected';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsGenerating(true);
    console.log('👤 [User Action] Clicked "Generate Documentation" button');
    console.log('📝 [Input Data]', {
      problem_statement: formData.problem_statement.substring(0, 100) + '...',
      selectedOutputs,
      projectId: activeProject.id,
    });

    try {
      const payload = {
        project_id: activeProject.id,
        project_name: activeProject.name,
        ...formData,
        selected_outputs: selectedOutputs,
      };

      const result = await callAgentWithLogging(
        'Product Documentation',
        'product-documentation',
        payload,
        () =>
          generateDocumentation({
            // If generateDocumentation input type doesn’t include project_id, update it.
            ...(payload as any),
          })
      );

      console.log('✨ [Success] Received AI-generated documentation', { outputLength: result.output.length });

      // Save to project_artifacts (canonical store)
      console.log('💾 [Database] Saving to project_artifacts table...');
      const artifactName = `PRD: ${formData.problem_statement.slice(0, 60).trim()}${formData.problem_statement.length > 60 ? '…' : ''}`;

      const saved = await supabaseFetch<ProjectArtifactRow[]>('/project_artifacts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: activeProject.id,
          project_name: activeProject.name,
          artifact_type: 'product_documentation',
          artifact_name: artifactName,
          input_data: {
            ...formData,
            selected_outputs: selectedOutputs,
          },
          output_data: result.output,
          metadata: {
            module_type: 'product_documentation',
          },
          status: 'active',
        }),
      });

      console.log('💾 [Database] Saved successfully');

      setCurrentOutput(result.output);
      setAdvisorOutput(''); // reset advisor for the new artifact

      if (saved && saved.length > 0) {
        setCurrentSessionId(saved[0].id); // artifact UUID
      } else {
        setCurrentSessionId(null);
      }

      toast.success('Documentation generated successfully!');
      await loadSessionHistory();
    } catch (err: any) {
      console.error('💥 [Error Handler] Caught error:', err);
      const errorMessage = parseErrorMessage(err);
      setError(errorMessage);
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setIsGenerating(false);
      console.log('🏁 [Complete] Documentation generation finished');
    }
  };

  const handleRunAdvisorReview = async () => {
    setAdvisorError(null);

    if (!currentOutput) {
      const errorMsg = 'No documentation to review. Generate documentation first.';
      setAdvisorError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!activeProject) {
      const errorMsg = 'No active project selected';
      setAdvisorError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsRunningAdvisor(true);
    console.log('👤 [User Action] Clicked "Run PM Advisor Review" button');

    try {
      console.log('🔍 [Context] Fetching context artifacts from other modules...');
      const contextArtifacts = await fetchContextArtifacts(activeProject.id);

      const advisorPayload = {
        artifact_output: currentOutput,
        module_type: 'product_documentation',
        project_id: activeProject.id,
        project_name: activeProject.name,
        source_session_table: 'project_artifacts',
        source_session_id: currentSessionId, // artifact UUID
        artifact_type: 'PRD',
        selected_outputs: selectedOutputs,
        context_artifacts: contextArtifacts,
      };

      const advisorResult = await callAgentWithLogging(
        'PM Advisor (Documentation Review)',
        'pm-advisor',
        advisorPayload,
        () => callPMAdvisorAgent(advisorPayload as any)
      );

      console.log('✨ [Success] Received PM Advisor review', { outputLength: advisorResult.output.length });
      setAdvisorOutput(advisorResult.output);

      console.log('💾 [Database] Saving PM Advisor review...');
      await saveAdvisorReview(
        activeProject.id,
        activeProject.name,
        'product_documentation',
        'project_artifacts',
        currentSessionId,
        'PRD',
        { selected_outputs: selectedOutputs, reviewed_at: new Date().toISOString() },
        currentOutput,
        advisorResult.output,
        {
          context_available: {
            documentation: !!(contextArtifacts as any)?.documentation_sessions,
            meeting: !!(contextArtifacts as any)?.meeting_sessions,
            prioritization: !!(contextArtifacts as any)?.prioritization_sessions,
            release: !!(contextArtifacts as any)?.release_sessions,
          },
        }
      );

      console.log('💾 [Database] PM Advisor review saved successfully');
      toast.success('PM Advisor review complete');
    } catch (err: any) {
      console.error('💥 [Error Handler] Caught error:', err);
      const errorMessage = parseErrorMessage(err);
      setAdvisorError(errorMessage);
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setIsRunningAdvisor(false);
      console.log('🏁 [Complete] PM Advisor review finished');
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(currentOutput);
      toast.success('Copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleCopyAdvisorOutput = async () => {
    try {
      await navigator.clipboard.writeText(advisorOutput);
      toast.success('Advisor review copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy advisor review to clipboard');
    }
  };

  const loadSession = (session: DocumentationSession) => {
    setFormData({
      problem_statement: session.problem_statement,
      target_user_persona: session.target_user_persona,
      business_goals: session.business_goals,
      assumptions_constraints: session.assumptions_constraints,
      functional_requirements: session.functional_requirements,
      dependencies: session.dependencies,
      non_functional_requirements: session.non_functional_requirements || '',
      user_pain_points: session.user_pain_points || '',
      competitive_context: session.competitive_context || '',
      technical_constraints: session.technical_constraints || '',
      success_metrics: session.success_metrics || '',
      target_timeline: session.target_timeline || '',
      epic_impact: session.epic_impact || '',
    });
    setSelectedOutputs((session as any).selected_outputs || session.selected_outputs || []);
    setCurrentOutput((session as any).output || session.output || '');
    setCurrentSessionId((session as any).id?.toString?.() ?? (session as any).id ?? null);
    setAdvisorOutput('');
    toast.success('Session loaded');
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="border-b border-[#E5E7EB] bg-white shadow-sm">
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="mb-3 text-[#6B7280] hover:text-[#111827]"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <h1 className="text-[28px] font-bold tracking-tight text-[#111827]">
                Product Documentation Generator
              </h1>
              <p className="mt-2 text-sm text-[#6B7280]">
                Generate comprehensive product documentation from your requirements
              </p>
            </div>
            <ActiveProjectSelector />
          </div>
        </div>
      </div>

      {/* Active Project Indicator */}
      {activeProject && (
        <div className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
          <div className="container mx-auto px-4 py-2 sm:px-6 lg:px-8">
            <p className="text-xs text-[#6B7280]">
              Project: <span className="font-medium text-[#111827]">{activeProject.name}</span>
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Panel - Input Form */}
          <div className="lg:col-span-4">
            <ErrorDisplay error={error} onDismiss={() => setError(null)} />

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-[#111827]">Product Information</CardTitle>
                <CardDescription className="text-sm text-[#6B7280]">
                  Fill in the details about your product. Fields marked with * are required.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-300px)]">
                  <div className="space-y-4 pr-4">
                    {/* Section 1: Problem Definition */}
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-[#F9F4FB] p-3 text-left font-semibold text-[#111827] hover:bg-[#F3F4F6] transition-colors">
                        Problem Definition
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-4">
                        <div>
                          <Label htmlFor="problem_statement" className="text-[13px] font-medium text-[#6B7280]">
                            Problem Statement *
                          </Label>
                          <Textarea
                            id="problem_statement"
                            value={formData.problem_statement}
                            onChange={(e) => handleInputChange('problem_statement', e.target.value)}
                            placeholder="What problem are we solving?"
                            className="mt-1.5"
                            rows={4}
                          />
                        </div>
                        <div>
                          <Label htmlFor="target_user_persona" className="text-[13px] font-medium text-[#6B7280]">
                            Target User Persona *
                          </Label>
                          <Textarea
                            id="target_user_persona"
                            value={formData.target_user_persona}
                            onChange={(e) => handleInputChange('target_user_persona', e.target.value)}
                            placeholder="Who are we building this for?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label htmlFor="user_pain_points" className="text-[13px] font-medium text-[#6B7280]">
                            User Pain Points / Jobs to Be Done
                          </Label>
                          <Textarea
                            id="user_pain_points"
                            value={formData.user_pain_points}
                            onChange={(e) => handleInputChange('user_pain_points', e.target.value)}
                            placeholder="What specific pain points or jobs to be done?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Section 2: Goals & Context */}
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-[#F9F4FB] p-3 text-left font-semibold text-[#111827] hover:bg-[#F3F4F6] transition-colors">
                        Goals & Context
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-4">
                        <div>
                          <Label htmlFor="business_goals" className="text-[13px] font-medium text-[#6B7280]">
                            Business Goals *
                          </Label>
                          <Textarea
                            id="business_goals"
                            value={formData.business_goals}
                            onChange={(e) => handleInputChange('business_goals', e.target.value)}
                            placeholder="What business outcomes are we driving?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label htmlFor="competitive_context" className="text-[13px] font-medium text-[#6B7280]">
                            Competitive / Market Context
                          </Label>
                          <Textarea
                            id="competitive_context"
                            value={formData.competitive_context}
                            onChange={(e) => handleInputChange('competitive_context', e.target.value)}
                            placeholder="What's the competitive landscape?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label htmlFor="success_metrics" className="text-[13px] font-medium text-[#6B7280]">
                            Success Metrics / KPIs
                          </Label>
                          <Textarea
                            id="success_metrics"
                            value={formData.success_metrics}
                            onChange={(e) => handleInputChange('success_metrics', e.target.value)}
                            placeholder="How will we measure success?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Section 3: Requirements */}
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-[#F9F4FB] p-3 text-left font-semibold text-[#111827] hover:bg-[#F3F4F6] transition-colors">
                        Requirements
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-4">
                        <div>
                          <Label htmlFor="functional_requirements" className="text-[13px] font-medium text-[#6B7280]">
                            Functional Requirements *
                          </Label>
                          <Textarea
                            id="functional_requirements"
                            value={formData.functional_requirements}
                            onChange={(e) => handleInputChange('functional_requirements', e.target.value)}
                            placeholder="What should the product do?"
                            className="mt-1.5"
                            rows={4}
                          />
                        </div>
                        <div>
                          <Label htmlFor="non_functional_requirements" className="text-[13px] font-medium text-[#6B7280]">
                            Non-Functional Requirements
                          </Label>
                          <Textarea
                            id="non_functional_requirements"
                            value={formData.non_functional_requirements}
                            onChange={(e) => handleInputChange('non_functional_requirements', e.target.value)}
                            placeholder="Performance, accessibility, compliance, etc."
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Section 4: Constraints & Dependencies */}
                    <Collapsible defaultOpen>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-[#F9F4FB] p-3 text-left font-semibold text-[#111827] hover:bg-[#F3F4F6] transition-colors">
                        Constraints & Dependencies
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-4">
                        <div>
                          <Label htmlFor="assumptions_constraints" className="text-[13px] font-medium text-[#6B7280]">
                            Assumptions & Constraints *
                          </Label>
                          <Textarea
                            id="assumptions_constraints"
                            value={formData.assumptions_constraints}
                            onChange={(e) => handleInputChange('assumptions_constraints', e.target.value)}
                            placeholder="What are we assuming? What are the constraints?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label htmlFor="technical_constraints" className="text-[13px] font-medium text-[#6B7280]">
                            Technical Constraints
                          </Label>
                          <Textarea
                            id="technical_constraints"
                            value={formData.technical_constraints}
                            onChange={(e) => handleInputChange('technical_constraints', e.target.value)}
                            placeholder="Technical limitations or requirements?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label htmlFor="dependencies" className="text-[13px] font-medium text-[#6B7280]">
                            Dependencies *
                          </Label>
                          <Textarea
                            id="dependencies"
                            value={formData.dependencies}
                            onChange={(e) => handleInputChange('dependencies', e.target.value)}
                            placeholder="What does this depend on?"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    {/* Section 5: Optional Enhancers */}
                    <Collapsible>
                      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-[#F9F4FB] p-3 text-left font-semibold text-[#111827] hover:bg-[#F3F4F6] transition-colors">
                        Optional Enhancers
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3 space-y-4">
                        <div>
                          <Label htmlFor="target_timeline" className="text-[13px] font-medium text-[#6B7280]">
                            Target Release Timeline
                          </Label>
                          <Input
                            id="target_timeline"
                            value={formData.target_timeline}
                            onChange={(e) => handleInputChange('target_timeline', e.target.value)}
                            placeholder="e.g., Q2 2024"
                            className="mt-1.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="epic_impact" className="text-[13px] font-medium text-[#6B7280]">
                            Epic Impact Statement
                          </Label>
                          <Textarea
                            id="epic_impact"
                            value={formData.epic_impact}
                            onChange={(e) => handleInputChange('epic_impact', e.target.value)}
                            placeholder="High-level impact statement for this epic"
                            className="mt-1.5"
                            rows={3}
                          />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Middle Panel - Output Selection */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-[#111827]">Select Outputs to Generate</CardTitle>
                <CardDescription className="text-sm text-[#6B7280]">Choose at least one output type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {OUTPUT_TYPES.map((output) => (
                    <div
                      key={output}
                      className="flex items-start space-x-3 rounded-lg border border-[#E5E7EB] p-3 transition-colors hover:bg-[#F9FAFB]"
                    >
                      <Checkbox
                        id={output}
                        checked={selectedOutputs.includes(output)}
                        onCheckedChange={() => toggleOutput(output)}
                      />
                      <Label htmlFor={output} className="cursor-pointer text-sm font-normal leading-tight text-[#374151]">
                        {output}
                      </Label>
                    </div>
                  ))}
                </div>

                <Separator className="my-6 bg-[#E5E7EB]" />

                <Button className="w-full" size="lg" onClick={handleGenerate} disabled={!isFormValid() || isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating your documentation...
                    </>
                  ) : (
                    'Generate Documentation'
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full mt-3"
                  size="lg"
                  onClick={handleRunAdvisorReview}
                  disabled={!currentOutput || isRunningAdvisor}
                >
                  {isRunningAdvisor ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running PM Advisor Review...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="mr-2 h-4 w-4" />
                      Run PM Advisor Review
                    </>
                  )}
                </Button>

                {advisorError && <ErrorDisplay error={advisorError} onDismiss={() => setAdvisorError(null)} />}

                {!isFormValid() && (
                  <p className="mt-2 text-center text-xs text-[#9CA3AF]">
                    {selectedOutputs.length === 0 ? 'Select at least one output type' : 'Fill in all required fields'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Results Display */}
          <div className="lg:col-span-5">
            <Card className="h-[calc(100vh-180px)]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-[#111827]">Documentation</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="current" className="h-full">
                  <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-[#E5E7EB] rounded-none h-auto p-0">
                    <TabsTrigger value="current">Current Documentation</TabsTrigger>
                    <TabsTrigger value="advisor">Advisor Review</TabsTrigger>
                    <TabsTrigger value="history">Session History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="current" className="mt-4">
                    {currentOutput ? (
                      <div className="space-y-4">
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" onClick={handleCopyToClipboard}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy to Clipboard
                          </Button>
                        </div>
                        <ScrollArea className="h-[calc(100vh-360px)]">
                          <div className="prose prose-sm max-w-none pr-4 dark:prose-invert">
                            <ReactMarkdown>{currentOutput}</ReactMarkdown>
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="flex h-[calc(100vh-360px)] items-center justify-center border-2 border-dashed border-[#E5E7EB] rounded-lg">
                        <div className="text-center text-[#9CA3AF] px-4">
                          <p className="text-sm">Generate documentation to see results</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="advisor" className="mt-4">
                    <ErrorDisplay error={advisorError} onDismiss={() => setAdvisorError(null)} />

                    {advisorOutput ? (
                      <div className="space-y-4">
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" onClick={handleCopyAdvisorOutput}>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Advisor Review
                          </Button>
                        </div>
                        <ScrollArea className="h-[calc(100vh-360px)]">
                          <div className="prose prose-sm max-w-none pr-4 dark:prose-invert">
                            <ReactMarkdown>{advisorOutput}</ReactMarkdown>
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="flex h-[calc(100vh-360px)] items-center justify-center border-2 border-dashed border-[#E5E7EB] rounded-lg">
                        <div className="text-center text-[#9CA3AF] px-4">
                          <p className="text-sm">Run PM Advisor Review to see results</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <ScrollArea className="h-[calc(100vh-320px)]">
                      {isLoadingHistory ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-[#9C6B7280]" />
                        </div>
                      ) : sessionHistory.length === 0 ? (
                        <div className="flex h-[calc(100vh-360px)] items-center justify-center border-2 border-dashed border-[#E5E7EB] rounded-lg">
                          <div className="text-center text-[#9CA3AF] px-4">
                            <p className="text-sm">No sessions yet</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3 pr-4">
                          {sessionHistory.map((session: any) => (
                            <Card
                              key={session.id}
                              className="cursor-pointer transition-all duration-200 hover:border-[#3B82F6] hover:shadow-md"
                              onClick={() => loadSession(session)}
                            >
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                  <CardTitle className="text-sm font-medium text-[#111827]">
                                    {new Date(session.created_at).toLocaleDateString()} at{' '}
                                    {new Date(session.created_at).toLocaleTimeString()}
                                  </CardTitle>
                                  <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                                </div>
                                <CardDescription className="line-clamp-2 text-xs text-[#6B7280]">
                                  {(session.problem_statement || '').slice(0, 80)}...
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="flex flex-wrap gap-1">
                                  {(session.selected_outputs || []).slice(0, 3).map((output: string) => (
                                    <Badge key={output} variant="secondary" className="text-xs">
                                      {output.split(' ')[0]}
                                    </Badge>
                                  ))}
                                  {(session.selected_outputs || []).length > 3 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{(session.selected_outputs || []).length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
