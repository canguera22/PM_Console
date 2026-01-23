import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ArrowRight, Loader2, Copy, CheckCircle2 } from 'lucide-react';
import { analyzeMeeting } from '@/lib/agent';
import { supabaseFetch } from '@/lib/supabase';
import { MeetingSession, MEETING_TYPES, ProjectArtifactRow } from '@/types/meeting';
import { SampleTranscriptDialog } from '@/components/SampleTranscriptDialog';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import ReactMarkdown from 'react-markdown';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { useSearchParams } from 'react-router-dom';


export default function MeetingIntelligence() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeProject } = useActiveProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const artifactIdFromUrl = searchParams.get('artifact');


  // Form state
  const [transcript, setTranscript] = useState('');
  const [meetingType, setMeetingType] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [participants, setParticipants] = useState('');

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentOutput, setCurrentOutput] = useState<string | null>(null);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Column collapse state
  const [isInputsCollapsed, setIsInputsCollapsed] = useState(false);

  const gridTemplateColumns = `
    ${isInputsCollapsed ? '56px' : '360px'}
    1fr
  `;

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Load session history when active project changes
  useEffect(() => {
    if (activeProject) {
      void loadSessions();
    } else {
      setSessions([]);
      setIsLoadingSessions(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  useEffect(() => {
  if (!artifactIdFromUrl || sessions.length === 0) return;

  const matchingSession = sessions.find(
    (s) => s.id === artifactIdFromUrl
  );

  if (matchingSession) {
    loadSession(matchingSession);
  }
}, [artifactIdFromUrl, sessions]);


  const artifactToMeetingSession = (a: ProjectArtifactRow): MeetingSession => {
    const input = a.input_data ?? {};
    return {
      id: a.id,
      created_at: a.created_at,
      meeting_type: (input.meeting_type as string) ?? null,
      project_name: a.project_name ?? null,
      participants: (input.participants as string) ?? null,
      transcript: (input.meeting_transcript as string) ?? '',
      output: a.output_data ?? null,
      metadata: (a.metadata ?? {}) as Record<string, any>,
    };
  };

  const loadSessions = async () => {
    if (!activeProject) return;

    try {
      setIsLoadingSessions(true);

      // Pull meeting history from project_artifacts
      const data = await supabaseFetch<ProjectArtifactRow[]>(
        `/project_artifacts?project_id=eq.${activeProject.id}` +
          `&artifact_type=eq.meeting_intelligence` +
          `&status=eq.active` +
          `&order=created_at.desc` +
          `&limit=20`
      );

      setSessions((data ?? []).map(artifactToMeetingSession));
    } catch (err) {
      console.error('Error loading sessions:', err);
      toast({
        title: 'Error',
        description: 'Failed to load session history',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleLoadSample = (
    sampleTranscript: string,
    sampleType: string,
    sampleProject: string,
    sampleParticipants: string
  ) => {
    setTranscript(sampleTranscript);
    setMeetingType(sampleType);
    setProjectName(sampleProject);
    setParticipants(sampleParticipants);
    toast({
      title: 'Sample Loaded',
      description: 'Sample transcript loaded successfully',
    });
  };

  const handleAnalyze = async () => {
    setSearchParams({});
    setError(null);

    if (!transcript.trim()) {
      const msg = 'Please enter a meeting transcript';
      setError(msg);
      toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      return;
    }

    if (!activeProject) {
      const msg = 'No active project selected';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);

    const effectiveProjectName = projectName?.trim() || activeProject.name;

    console.log('👤 [User Action] Clicked "Analyze Meeting" button');
    console.log('📝 [Input Data]', {
      transcript: transcript.substring(0, 100) + '...',
      transcriptLength: transcript.length,
      meetingType,
      projectName: effectiveProjectName,
      participants,
      projectId: activeProject.id,
    });

    try {
      // Call the edge function (project_id REQUIRED)
      const result = await callAgentWithLogging(
        'Meeting Intelligence',
        'meeting-intelligence',
        {
          project_id: activeProject.id,
          project_name: effectiveProjectName || undefined,
          meeting_transcript: transcript,
          meeting_type: meetingType || undefined,
          participants: participants || undefined,
          persist_artifact: true,
        },
        () =>
          analyzeMeeting({
            project_id: activeProject.id,
            project_name: effectiveProjectName || undefined,
            meeting_transcript: transcript,
            meeting_type: meetingType || undefined,
            participants: participants || undefined,
          })
      );

      console.log('✨ [Success] Received AI-generated output', { outputLength: result.output.length });
      setCurrentOutput(result.output);

      // Save to project_artifacts (new canonical store)
      const artifactName =
        meetingType?.trim()
          ? `Meeting: ${meetingType.trim()}`
          : 'Meeting: Analysis';

      console.log('💾 [Database] Saving to project_artifacts table...');
      console.log('💾 [Database] Saved successfully');

      await loadSessions();

      toast({
        title: 'Success',
        description: 'Meeting analyzed successfully',
      });
    } catch (err: any) {
      console.error('💥 [Error Handler] Caught error:', err);

      const errorMessage = parseErrorMessage(err);
      setError(errorMessage);

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsAnalyzing(false);
      console.log('🏁 [Complete] Analysis request finished');
    }
  };

  const handleCopyToClipboard = async () => {
    if (!currentOutput) return;

    try {
      await navigator.clipboard.writeText(currentOutput);
      setCopiedToClipboard(true);
      toast({ title: 'Copied!', description: 'Analysis copied to clipboard' });
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to copy to clipboard', variant: 'destructive' });
    }
  };

  const loadSession = (session: MeetingSession) => {
    setCurrentOutput(session.output);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="border-b border-[#E5E7EB] bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="gap-2 text-[#6B7280] hover:text-[#111827]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="text-xl font-semibold text-[#111827]">Meeting Intelligence</h1>
                <p className="text-sm text-[#6B7280]">AI-powered meeting analysis</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="container mx-auto grid gap-6 px-4 py-8 sm:px-6 lg:px-8"
        style={{ gridTemplateColumns }}
      >
        {/* Column 1 – Inputs */}
        <div className="h-[calc(100vh-180px)]">
          {isInputsCollapsed ? (
            /* COLLAPSED STATE */
            <div
              className="h-full flex flex-col items-center justify-start
                        pt-3 border rounded-xl bg-muted/30
                        overflow-hidden flex-shrink-0"
              style={{ width: '56px' }}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsInputsCollapsed(false)}
              >
                <ArrowRight className="h-4 w-4" />
              </Button>

              <span
                className="mt-2 text-xs text-muted-foreground"
                style={{ writingMode: 'vertical-rl' }}
              >
                Inputs
              </span>
            </div>
          ) : (
            /* EXPANDED STATE */
            <div className="space-y-6 h-full overflow-hidden">
              <ErrorDisplay error={error} onDismiss={() => setError(null)} />

              <Card className="h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between pb-4">
                  <div>
                    <CardTitle className="text-lg font-semibold text-[#111827]">
                      Meeting Transcript
                    </CardTitle>
                    <CardDescription className="mt-1.5 text-sm text-[#6B7280]">
                      Paste your meeting transcript and provide optional context
                    </CardDescription>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsInputsCollapsed(true)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </CardHeader>

                  <CardContent className="flex-1 overflow-auto space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="transcript" className="text-[13px] font-medium text-[#6B7280]">
                        Meeting Transcript <span className="text-[#EF4444]">*</span>
                      </Label>
                      <Textarea
                        id="transcript"
                        placeholder="Paste your meeting notes or transcript here..."
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        className="min-h-[300px] font-mono text-sm"
                      />
                    </div>

                    <Separator className="bg-[#E5E7EB]" />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="meeting-type" className="text-[13px] font-medium text-[#6B7280]">
                          Meeting Type
                        </Label>
                        <Select value={meetingType} onValueChange={setMeetingType}>
                          <SelectTrigger id="meeting-type">
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {MEETING_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="project-name" className="text-[13px] font-medium text-[#6B7280]">
                          Document Name
                        </Label>
                        <Input
                          id="project-name"
                          placeholder={`Default: ${activeProject?.name ?? 'Select a project'}`}
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="participants" className="text-[13px] font-medium text-[#6B7280]">
                        Participants
                      </Label>
                      <Input
                        id="participants"
                        placeholder="e.g., John, Sarah, Mike"
                        value={participants}
                        onChange={(e) => setParticipants(e.target.value)}
                      />
                    </div>

                    <Button
                      onClick={handleAnalyze}
                      disabled={isAnalyzing || !transcript.trim()}
                      className="w-full"
                      size="lg"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Analyzing your meeting...
                        </>
                      ) : (
                        'Analyze Meeting'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
              )}
            </div>

        {/* Right Panel - Output Display */}
        <div className="space-y-6">
          <Card className="lg:sticky lg:top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold text-[#111827]">Analysis Results</CardTitle>
            </CardHeader>

            <CardContent>
              <Tabs defaultValue="current" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-transparent border-b border-[#E5E7EB] rounded-none h-auto p-0">
                  <TabsTrigger value="current">Current Analysis</TabsTrigger>
                  <TabsTrigger value="history">Session History</TabsTrigger>
                </TabsList>

                <TabsContent value="current" className="mt-4 space-y-4">
                  {currentOutput ? (
                    <>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCopyToClipboard}
                          className="gap-2"
                        >
                          {copiedToClipboard ? (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              Copy to Clipboard
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="prose prose-sm max-w-none rounded-lg border border-[#E5E7EB] bg-white p-6 dark:prose-invert max-h-[600px] overflow-y-auto">
                        <ReactMarkdown>{currentOutput}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border-2 border-dashed border-[#E5E7EB]">
                      <div className="text-center px-4">
                        <p className="text-sm text-[#9CA3AF]">
                          No analysis yet. Enter a transcript and click "Analyze Meeting".
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <div className="space-y-3">
                    {isLoadingSessions ? (
                      <div className="flex min-h-[400px] items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-[#9CA3AF]" />
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="flex min-h-[400px] items-center justify-center rounded-lg border-2 border-dashed border-[#E5E7EB]">
                        <div className="text-center px-4">
                          <p className="text-sm text-[#9CA3AF]">
                            No sessions yet for this project. Analyze your first meeting to get started.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="max-h-[600px] space-y-3 overflow-y-auto">
                        {sessions.map((session) => (
                          <Card
                            key={session.id}
                            className="cursor-pointer transition-all duration-200 hover:border-[#3B82F6] hover:shadow-md"
                            onClick={() => {
                              loadSession(session);
                              setSearchParams({ artifact: session.id });
                            }}
                          >
                            <CardContent className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs text-[#9CA3AF]">
                                    {formatDate(session.created_at)}
                                  </p>
                                  {session.meeting_type && (
                                    <Badge variant="secondary" className="text-xs">
                                      {session.meeting_type}
                                    </Badge>
                                  )}
                                </div>

                                {session.project_name && (
                                  <p className="font-medium text-sm text-[#111827]">
                                    {session.project_name}
                                  </p>
                                )}

                                <p className="line-clamp-2 text-sm text-[#6B7280]">
                                  {(session.transcript || '').substring(0, 100)}...
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
