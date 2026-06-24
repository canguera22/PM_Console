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
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { analyzeMeeting } from '@/lib/agent';
import { supabaseFetch } from '@/lib/supabase';
import {
  ExtractedActionItem,
  ExtractedAssumption,
  ExtractedDecision,
  ExtractedOpenQuestion,
  MeetingInputMode,
  MeetingSession,
  MEETING_TYPES,
  ProjectArtifactRow,
} from '@/types/meeting';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import ReactMarkdown from 'react-markdown';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import { useSearchParams } from 'react-router-dom';
import { SessionHistoryCard } from '@/components/history/SessionHistoryCard';
import { ArtifactActions } from '@/components/ArtifactActions';
import { createProjectTask } from '@/lib/projectTasks';
import { extractActionItemsFromMarkdown, isPlaceholderActionItem } from '@/lib/actionItems';
import { PROJECT_TASK_MODULE_LABELS, ProjectTaskModule } from '@/types/project-tasks';
import { OUTPUT_LANGUAGE_OPTIONS, OutputLanguage } from '@/types/output-language';


export default function MeetingIntelligence() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeProject } = useActiveProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const artifactIdFromUrl = searchParams.get('artifact');


  // Form state
  const [transcript, setTranscript] = useState('');
  const [inputMode, setInputMode] = useState<MeetingInputMode>('notes_cleanup');
  const [meetingType, setMeetingType] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [participants, setParticipants] = useState('');
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>('english');

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [currentOutput, setCurrentOutput] = useState<string>('');
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [actionItems, setActionItems] = useState<ExtractedActionItem[]>([]);
  const [savedActionItemKeys, setSavedActionItemKeys] = useState<Set<string>>(new Set());
  const [isSavingActionItems, setIsSavingActionItems] = useState(false);


// 🔑 MAIN RESULTS TABS CONTROL
type ResultsTab = 'current' | 'history';
const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('current');

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
    const metadata = (a.metadata ?? {}) as Record<string, unknown>;
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
      action_items: Array.isArray(metadata.action_items)
        ? (metadata.action_items as ExtractedActionItem[]).filter(
            (item) => !isPlaceholderActionItem(item)
          )
        : [],
      decisions: Array.isArray(metadata.decisions)
        ? (metadata.decisions as ExtractedDecision[])
        : [],
      open_questions: Array.isArray(metadata.open_questions)
        ? (metadata.open_questions as ExtractedOpenQuestion[])
        : [],
      assumptions: Array.isArray(metadata.assumptions)
        ? (metadata.assumptions as ExtractedAssumption[])
        : [],
      metadata,
      version: typeof metadata.version === 'number' ? metadata.version : 1, 
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
      outputLanguage,
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
          output_language: outputLanguage,
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
            output_language: outputLanguage,
          })
      );

      console.log('✨ [Success] Received AI-generated output', { outputLength: result.output.length });
      const proposedActionItems =
        result.action_items && result.action_items.length > 0
          ? result.action_items.filter((item) => !isPlaceholderActionItem(item))
          : extractActionItemsFromMarkdown(result.output);
      setCurrentOutput(result.output);
      setCurrentArtifactId(result.artifact_id ?? null);
      setActionItems(proposedActionItems);
      setSavedActionItemKeys(new Set());

      console.log('💾 [Database] Saving to project_artifacts table...');
      console.log('💾 [Database] Saved successfully');

      await loadSessions();

      toast({
          title: 'Success',
          description:
          proposedActionItems.length > 0
            ? `Notes analyzed with ${proposedActionItems.length} action item${proposedActionItems.length === 1 ? '' : 's'} ready for review`
            : 'Notes analyzed successfully',
      });
    } catch (err: unknown) {
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
      toast({ title: 'Copied!', description: 'Analysis copied to clipboard' });
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
        }),
      });

      await updateArtifactMetadata({
        version: currentVersion + 1,
        last_modified_by: 'user',
        last_modified_at: new Date().toISOString(),
        action_items: actionItems,
        saved_action_item_keys: Array.from(savedActionItemKeys),
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

  const getActionItemKey = (item: ExtractedActionItem, index: number) =>
    item.id || `action-${index}`;

  const updateArtifactMetadata = async (patch: Record<string, unknown>) => {
    if (!currentArtifactId) return;

    const rows = await supabaseFetch<Array<{ metadata: Record<string, unknown> | null }>>(
      `/project_artifacts?id=eq.${currentArtifactId}&select=metadata`
    );

    const currentMetadata = rows?.[0]?.metadata ?? {};

    await supabaseFetch(`/project_artifacts?id=eq.${currentArtifactId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        metadata: {
          ...currentMetadata,
          ...patch,
        },
      }),
    });
  };

  const persistReviewedActionItems = async (
    nextActionItems: ExtractedActionItem[],
    nextSavedActionItemKeys: Set<string>
  ) => {
    if (!currentArtifactId) return;

    try {
      await updateArtifactMetadata({
        action_items: nextActionItems,
        saved_action_item_keys: Array.from(nextSavedActionItemKeys),
      });
    } catch (error) {
      console.error('Failed to persist reviewed action items:', error);
    }
  };

  const updateActionItem = (
    index: number,
    updates: Partial<ExtractedActionItem>
  ) => {
    const nextActionItems = actionItems.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...updates } : item
    );

    setActionItems(nextActionItems);
    void persistReviewedActionItems(nextActionItems, savedActionItemKeys);
  };

  const removeActionItem = (index: number) => {
    const removedItemKey = actionItems[index]
      ? getActionItemKey(actionItems[index], index)
      : null;
    const nextActionItems = actionItems.filter((_, itemIndex) => itemIndex !== index);
    const nextSavedKeys = new Set(savedActionItemKeys);

    if (removedItemKey) {
      nextSavedKeys.delete(removedItemKey);
    }

    setActionItems(nextActionItems);
    setSavedActionItemKeys(nextSavedKeys);
    void persistReviewedActionItems(nextActionItems, nextSavedKeys);
  };

  const addBlankActionItem = () => {
    const nextActionItems = [
      ...actionItems,
      {
        id: `manual-${Date.now()}`,
        title: '',
        description: null,
        due_date: null,
        owner: null,
        confidence: 'medium',
        context_validation: null,
        source_evidence: null,
        related_module: null,
      },
    ];

    setActionItems(nextActionItems);
    void persistReviewedActionItems(nextActionItems, savedActionItemKeys);
  };

  const handleSaveActionItems = async () => {
    if (!activeProject) {
      toast({ title: 'Error', description: 'No active project selected', variant: 'destructive' });
      return;
    }

    const unsavedItems = actionItems
      .map((item, index) => ({ item, index, key: getActionItemKey(item, index) }))
      .filter(({ item, key }) => item.title.trim() && !savedActionItemKeys.has(key));

    if (unsavedItems.length === 0) {
      toast({ title: 'No new action items', description: 'There are no unsaved action items to add.' });
      return;
    }

    setIsSavingActionItems(true);
    try {
      const savedKeys = new Set(savedActionItemKeys);

      for (const { item, key } of unsavedItems) {
        const descriptionParts = [
          item.description?.trim(),
          item.owner?.trim() ? `Owner: ${item.owner.trim()}` : null,
          item.source_evidence?.trim() ? `Source: ${item.source_evidence.trim()}` : null,
          item.context_validation?.trim()
            ? `Context validation: ${item.context_validation.trim()}`
            : null,
        ].filter(Boolean);

        await createProjectTask({
          project_id: activeProject.id,
          title: item.title.trim(),
          description: descriptionParts.length > 0 ? descriptionParts.join('\n\n') : null,
          due_date: item.due_date || null,
          related_module: toProjectTaskModule(item.related_module),
        });
        savedKeys.add(key);
      }

      setSavedActionItemKeys(savedKeys);
      await persistReviewedActionItems(actionItems, savedKeys);
      toast({
        title: 'Action items saved',
        description: `${unsavedItems.length} item${unsavedItems.length === 1 ? '' : 's'} added to Project Tasks.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to add these items to Project Tasks.';
      toast({
        title: 'Failed to save action items',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSavingActionItems(false);
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
    setActionItems(session.action_items ?? []);
    setSavedActionItemKeys(
      new Set(
        Array.isArray(session.metadata?.saved_action_item_keys)
          ? (session.metadata.saved_action_item_keys as string[])
          : []
      )
    );

    
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
  const inputCardTitle = 'Project Notes';
  const inputCardDescription =
    'Capture raw notes, validate them against project context, and extract reviewable action items.';
  const inputLabel = isNotesCleanupMode ? 'Raw Notes' : 'Meeting Transcript';
  const inputPlaceholder = isNotesCleanupMode
    ? 'Paste your rough notes here. Bullet fragments, shorthand, decisions, and reminders are fine.'
    : 'Paste your meeting transcript here...';
  const runButtonLabel = isNotesCleanupMode ? 'Analyze Notes' : 'Analyze Transcript';
  const runButtonBusyLabel = isNotesCleanupMode
    ? 'Analyzing your notes...'
    : 'Analyzing your transcript...';
  const emptyStateLabel = isNotesCleanupMode
    ? 'No results yet. Enter raw notes and click "Analyze Notes".'
    : 'No analysis yet. Enter a transcript and click "Analyze Transcript".';
  const sessionModeLabel = (mode: MeetingInputMode) =>
    mode === 'notes_cleanup' ? 'Project Notes' : 'Transcript';

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
                <h1 className="text-xl font-semibold text-[#111827]">Project Notes</h1>
                <p className="text-sm text-[#6B7280]">Context-aware notes, action extraction, and task handoff</p>
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
                          <TabsTrigger value="notes_cleanup">Project Notes</TabsTrigger>
                          <TabsTrigger value="transcript">Transcript</TabsTrigger>
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
                          Note Type
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

                      <div className="space-y-2">
                        <Label htmlFor="output-language" className="text-[13px] font-medium text-[#6B7280]">
                          Output Language
                        </Label>
                        <Select
                          value={outputLanguage}
                          onValueChange={(value) => setOutputLanguage(value as OutputLanguage)}
                        >
                          <SelectTrigger id="output-language">
                            <SelectValue placeholder="Select language" />
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
                  Notes Analysis
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
                  <TabsTrigger value="current">Current Notes</TabsTrigger>
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
                              <ArtifactActions
                                title={projectName || activeProject?.name || 'Project Notes'}
                                content={currentOutput}
                                projectName={activeProject?.name}
                                moduleLabel="Project Notes"
                              />
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

                        <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h2 className="text-sm font-semibold text-[#111827]">
                                Proposed Action Items
                              </h2>
                              <p className="mt-1 text-xs text-[#6B7280]">
                                Review, edit, and save the items you want added to Project Tasks.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={addBlankActionItem}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add Item
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => void handleSaveActionItems()}
                                disabled={
                                  isSavingActionItems ||
                                  actionItems.every((item, index) =>
                                    !item.title.trim() ||
                                    savedActionItemKeys.has(getActionItemKey(item, index))
                                  )
                                }
                              >
                                {isSavingActionItems ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Saving
                                  </>
                                ) : (
                                  'Save to Tasks'
                                )}
                              </Button>
                            </div>
                          </div>

                          {actionItems.length === 0 ? (
                            <div className="mt-4 rounded-md border border-dashed border-[#D1D5DB] p-4 text-sm text-[#6B7280]">
                              No action items were identified. Add one manually if the notes imply follow-up work.
                            </div>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {actionItems.map((item, index) => {
                                const itemKey = getActionItemKey(item, index);
                                const isSaved = savedActionItemKeys.has(itemKey);

                                return (
                                  <div
                                    key={itemKey}
                                    className="rounded-md border border-[#E5E7EB] bg-[#F9FAFB] p-3"
                                  >
                                    <div className="flex flex-col gap-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <Input
                                          value={item.title}
                                          onChange={(event) =>
                                            updateActionItem(index, { title: event.target.value })
                                          }
                                          placeholder="Action item title"
                                          disabled={isSaved}
                                          className="bg-white"
                                        />
                                        <div className="flex shrink-0 items-center gap-2">
                                          {isSaved ? (
                                            <Badge variant="secondary">Saved</Badge>
                                          ) : null}
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeActionItem(index)}
                                            disabled={isSaved}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>

                                      <div className="grid gap-3 md:grid-cols-[160px_1fr_220px]">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-[#6B7280]">Due Date</Label>
                                          <Input
                                            type="date"
                                            value={item.due_date ?? ''}
                                            onChange={(event) =>
                                              updateActionItem(index, {
                                                due_date: event.target.value || null,
                                              })
                                            }
                                            disabled={isSaved}
                                            className="bg-white"
                                          />
                                        </div>

                                        <div className="space-y-1">
                                          <Label className="text-xs text-[#6B7280]">Owner</Label>
                                          <Input
                                            value={item.owner ?? ''}
                                            onChange={(event) =>
                                              updateActionItem(index, {
                                                owner: event.target.value || null,
                                              })
                                            }
                                            placeholder="Optional"
                                            disabled={isSaved}
                                            className="bg-white"
                                          />
                                        </div>

                                        <div className="space-y-1">
                                          <Label className="text-xs text-[#6B7280]">Related Module</Label>
                                          <select
                                            value={item.related_module ?? ''}
                                            onChange={(event) =>
                                              updateActionItem(index, {
                                                related_module: event.target.value || null,
                                              })
                                            }
                                            disabled={isSaved}
                                            className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                                          >
                                            <option value="">None</option>
                                            {Object.entries(PROJECT_TASK_MODULE_LABELS).map(([value, label]) => (
                                              <option key={value} value={value}>
                                                {label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </div>

                                      <Textarea
                                        value={item.description ?? ''}
                                        onChange={(event) =>
                                          updateActionItem(index, {
                                            description: event.target.value || null,
                                          })
                                        }
                                        placeholder="Optional task details"
                                        disabled={isSaved}
                                        className="min-h-[80px] bg-white text-sm"
                                      />

                                      <div className="grid gap-3 text-xs text-[#6B7280] md:grid-cols-2">
                                        {item.source_evidence ? (
                                          <div>
                                            <span className="font-medium text-[#374151]">Source: </span>
                                            {item.source_evidence}
                                          </div>
                                        ) : null}
                                        {item.context_validation ? (
                                          <div>
                                            <span className="font-medium text-[#374151]">Context: </span>
                                            {item.context_validation}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

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

function toProjectTaskModule(value?: string | null): ProjectTaskModule | null {
  switch (value) {
    case 'meeting_intelligence':
    case 'product_documentation':
    case 'release_communications':
    case 'prioritization':
      return value;
    default:
      return null;
  }
}
