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
import { MeetingInputMode, MeetingSession, MEETING_TYPES, ProjectArtifactRow } from '@/types/meeting';
import { SampleTranscriptDialog } from '@/components/SampleTranscriptDialog';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import ReactMarkdown from 'react-markdown';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { useSearchParams } from 'react-router-dom';
import { SessionHistoryCard } from '@/components/history/SessionHistoryCard';
import { completeMatchingTaskForArtifact } from '@/lib/projectTasks';


export default function MeetingIntelligence() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeProject } = useActiveProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const artifactIdFromUrl = searchParams.get('artifact');


  // Form state
  const [transcript, setTranscript] = useState('');
  const [inputMode, setInputMode] = useState<MeetingInputMode>('transcript');
  const [meetingType, setMeetingType] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [participants, setParticipants] = useState('');

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [currentOutput, setCurrentOutput] = useState<string>('');
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);


// 🔑 MAIN RESULTS TABS CONTROL
type ResultsTab = 'current' | 'history';
const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('current');

  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Versioning
  const [isEditing, setIsEditing] = useState(false);
  const [editedOutput, setEditedOutput] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [lastModifiedBy, setLastModifiedBy] = useState<'agent' | 'user'>('agent');


  //Editing
  type EditViewMode = 'edit' | 'preview';
  const [editViewMode, setEditViewMode] = useState<EditViewMode>('edit');




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
    const nestedInput = (input.input ?? {}) as Record<string, unknown>;
    const metadata = (a.metadata ?? {}) as Record<string, any>;
    const inputMode =
      input.input_mode === 'notes_cleanup' ? 'notes_cleanup' : 'transcript';
    const sourceText =
      (nestedInput.source_text as string) ??
      (input.meeting_transcript as string) ??
      (nestedInput.meeting_transcript as string) ??
      (nestedInput.raw_notes as string) ??
      '';

    return {
      id: a.id,
      created_at: a.created_at,
      artifact_name: a.artifact_name,
      created_by_email: a.created_by_email ?? null,
      input_mode: inputMode,
      meeting_type: (input.meeting_type as string) ?? (nestedInput.meeting_type as string) ?? null,
      project_name: a.project_name ?? null,
      participants: (input.participants as string) ?? (nestedInput.participants as string) ?? null,
      transcript: sourceText,
      output: a.output_data ?? null,
      metadata,
      version: metadata.version ?? 1, 
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
      const msg =
        inputMode === 'notes_cleanup'
          ? 'Please enter your raw notes'
          : 'Please enter a meeting transcript';
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
    const artifactName = `${effectiveProjectName} – ${new Date().toLocaleDateString()}`;

    console.log('👤 [User Action] Clicked "Analyze Meeting" button');
    console.log('📝 [Input Data]', {
      inputMode,
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
          artifact_name: artifactName,
          meeting_transcript: transcript,
          input_mode: inputMode,
          meeting_type: meetingType || undefined,
          participants: participants || undefined,
          persist_artifact: true,
        },
        () =>
          analyzeMeeting({
            project_id: activeProject.id,
            project_name: effectiveProjectName || undefined,
            meeting_transcript: transcript,
            input_mode: inputMode,
            meeting_type: meetingType || undefined,
            participants: participants || undefined,
            artifact_name: artifactName,
          })
      );

      console.log('✨ [Success] Received AI-generated output', { outputLength: result.output.length });
      setCurrentOutput(result.output);
      setCurrentArtifactId(result.artifact_id ?? null);

      if (result.artifact_id) {
        try {
          await completeMatchingTaskForArtifact(
            activeProject.id,
            'meeting_intelligence',
            result.artifact_id
          );
        } catch (taskError) {
          console.warn('Failed to auto-complete matching meeting task', taskError);
        }
      }

      console.log('💾 [Database] Saving to project_artifacts table...');
      console.log('💾 [Database] Saved successfully');

      await loadSessions();

      toast({
        title: 'Success',
        description:
          inputMode === 'notes_cleanup'
            ? 'Notes cleaned up successfully'
            : 'Meeting analyzed successfully',
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
  const handleSaveEdit = async () => {
    if (!editedOutput || !currentOutput || !activeProject) return;

    try {
      const newVersion = currentVersion + 1;

      if (!currentArtifactId) {
        toast({
          title: 'Error',
          description: 'No active session to save',
          variant: 'destructive',
        });
        return;
      }

      await supabaseFetch(`/project_artifacts?id=eq.${currentArtifactId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          output_data: editedOutput,
          metadata: {
            version: currentVersion + 1,
            last_modified_by: 'user',
            last_modified_at: new Date().toISOString(),
          },
        }),
      });

      setCurrentOutput(editedOutput);
      setCurrentVersion(newVersion);
      setLastModifiedBy('user');
      setIsEditing(false);
      setEditedOutput(null);
      setEditViewMode('edit');

      await loadSessions();

      toast({
        title: 'Saved',
        description: `Saved as version ${newVersion}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save edited version',
        variant: 'destructive',
      });
    }
  };


  const loadSession = (session: MeetingSession) => {
    setCurrentArtifactId(session.id); 
    setCurrentOutput(session.output ?? '');
    setTranscript(session.transcript ?? '');
    setInputMode(session.input_mode);
    setMeetingType(session.meeting_type ?? '');
    setProjectName(session.artifact_name ?? session.project_name ?? '');
    setParticipants(session.participants ?? '');

    
    // Reset editing state
    setEditedOutput(null);
    setIsEditing(false);
    setEditViewMode('edit');

    // Versioning
    setCurrentVersion(session.version ?? 1);
    setLastModifiedBy(
      session.metadata?.last_modified_by === 'user' ? 'user' : 'agent'
    );

    // 🔥 CRITICAL: force visible navigation
    setActiveResultsTab('current');
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

  const isNotesCleanupMode = inputMode === 'notes_cleanup';
  const inputCardTitle = isNotesCleanupMode ? 'Note Cleanup' : 'Meeting Transcript';
  const inputCardDescription = isNotesCleanupMode
    ? 'Paste rough meeting notes and the agent will clean them into organized notes'
    : 'Paste your meeting transcript and provide optional context';
  const inputLabel = isNotesCleanupMode ? 'Raw Notes' : 'Meeting Transcript';
  const inputPlaceholder = isNotesCleanupMode
    ? 'Paste your rough notes here. Bullet fragments and shorthand are fine.'
    : 'Paste your meeting transcript here...';
  const runButtonLabel = isNotesCleanupMode ? 'Clean Up Notes' : 'Analyze Meeting';
  const runButtonBusyLabel = isNotesCleanupMode
    ? 'Cleaning up your notes...'
    : 'Analyzing your meeting...';
  const emptyStateLabel = isNotesCleanupMode
    ? 'No results yet. Enter raw notes and click "Clean Up Notes".'
    : 'No analysis yet. Enter a transcript and click "Analyze Meeting".';
  const sessionModeLabel = (mode: MeetingInputMode) =>
    mode === 'notes_cleanup' ? 'Notes Cleanup' : 'Transcript';

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
                onClick={() => navigate('/dashboard')}
                className="gap-2 text-[#6B7280] hover:text-[#111827]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="text-xl font-semibold text-[#111827]">Meeting Intelligence</h1>
                <p className="text-sm text-[#6B7280]">AI-powered meeting analysis and note cleanup</p>
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
                      {inputCardTitle}
                    </CardTitle>
                    <CardDescription className="mt-1.5 text-sm text-[#6B7280]">
                      {inputCardDescription}
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
                      <Label className="text-[13px] font-medium text-[#6B7280]">
                        Input Mode
                      </Label>
                      <Tabs
                        value={inputMode}
                        onValueChange={(value) => setInputMode(value as MeetingInputMode)}
                      >
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="transcript">Meeting Transcript</TabsTrigger>
                          <TabsTrigger value="notes_cleanup">Notes Cleanup</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transcript" className="text-[13px] font-medium text-[#6B7280]">
                        {inputLabel} <span className="text-[#EF4444]">*</span>
                      </Label>
                      <Textarea
                        id="transcript"
                        placeholder={inputPlaceholder}
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
                          {runButtonBusyLabel}
                        </>
                      ) : (
                        runButtonLabel
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>
              )}
            </div>

        {/* 2nd Column - Output Display */}
        <div className="space-y-6">
          <Card className="lg:sticky lg:top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg font-semibold text-[#111827]">
                  Analysis Results
                </CardTitle>

                <Badge variant="secondary">
                  v{currentVersion} · {lastModifiedBy === 'user' ? 'Edited' : 'Generated'}
                </Badge>
              </div>
            </CardHeader>


            <CardContent>
              <Tabs
                value={activeResultsTab}
                onValueChange={(val) => setActiveResultsTab(val as ResultsTab)}
                className="h-full"
              >
                <TabsList className="grid w-full grid-cols-2 bg-transparent border-b border-[#E5E7EB] rounded-none h-auto p-0">
                  <TabsTrigger value="current">Current Analysis</TabsTrigger>
                  <TabsTrigger value="history">Session History</TabsTrigger>
                </TabsList>

                {/* CURRENT ANALYSIS TAB */}
                  <TabsContent value="current" className="mt-4 space-y-4">
                    {currentOutput ? (
                      <>
                        {/* ACTION BAR */}
                        {!isEditing ? (
                          /* VIEW MODE */
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditedOutput(currentOutput);
                                setIsEditing(true);
                                setEditViewMode('edit');
                              }}
                            >
                              Edit
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCopyToClipboard}
                            >
                              Copy to Clipboard
                            </Button>
                          </div>
                        ) : (
                          /* EDIT MODE */
                          <div className="flex items-center justify-between">
                            {/* LEFT */}
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={editViewMode === 'edit' ? 'default' : 'outline'}
                                onClick={() => setEditViewMode('edit')}
                              >
                                Edit
                              </Button>

                              <Button
                                size="sm"
                                variant={editViewMode === 'preview' ? 'default' : 'outline'}
                                onClick={() => setEditViewMode('preview')}
                              >
                                Preview
                              </Button>
                            </div>

                            {/* RIGHT */}
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={handleSaveEdit}>
                                Save
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditedOutput(currentOutput);
                                  setIsEditing(false);
                                  setEditViewMode('edit');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* OUTPUT */}
                        <div className="prose prose-sm max-w-none rounded-lg border border-[#E5E7EB] bg-white p-6 dark:prose-invert max-h-[600px] overflow-y-auto">
                          {isEditing ? (
                            editViewMode === 'edit' ? (
                              <Textarea
                                value={editedOutput ?? ''}
                                onChange={(e) => setEditedOutput(e.target.value)}
                                className="min-h-[500px] font-mono text-sm"
                              />
                            ) : (
                              <ReactMarkdown>{editedOutput}</ReactMarkdown>
                            )
                          ) : (
                            <ReactMarkdown>{currentOutput}</ReactMarkdown>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-[400px] items-center justify-center rounded-lg border-2 border-dashed border-[#E5E7EB]">
                        <p className="text-sm text-[#9CA3AF]">
                          {emptyStateLabel}
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* HISTORY TAB */}
                  <TabsContent value="history" className="mt-4">
                    <div className="space-y-3">
                      {isLoadingSessions ? (
                        <div className="flex min-h-[400px] items-center justify-center">
                          <Loader2 className="h-6 w-6 animate-spin text-[#9CA3AF]" />
                        </div>
                      ) : sessions.length === 0 ? (
                        <div className="flex min-h-[400px] items-center justify-center rounded-lg border-2 border-dashed border-[#E5E7EB]">
                          <p className="text-sm text-[#9CA3AF]">
                            No sessions yet for this project.
                          </p>
                        </div>
                      ) : (
                      <div className="max-h-[600px] space-y-3 overflow-y-auto">
                        {sessions.map((session) => (
                          <SessionHistoryCard
                            key={session.id}
                            title={session.artifact_name || session.project_name || 'Meeting Analysis'}
                            timestamp={formatDate(session.created_at)}
                            description={session.transcript ? `${session.transcript.substring(0, 100)}...` : undefined}
                            metaLine={`Created by: ${session.created_by_email ?? 'Unknown'}`}
                            badges={[sessionModeLabel(session.input_mode), ...(session.meeting_type ? [session.meeting_type] : [])]}
                            rightBadge={session.version > 1 ? `v${session.version} · Edited` : undefined}
                            onClick={() => {
                              setSearchParams({ artifact: session.id });
                              loadSession(session);
                            }}
                          />
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
