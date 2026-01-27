import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Copy,
  CheckCircle2,
  Upload,
  X,
  Info,
  FileText,
  AlertCircle,
  Lightbulb,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import { generateReleaseDocumentation } from '@/lib/release-agent';
import { supabaseFetch } from '@/lib/supabase';
import { OUTPUT_TYPES, OutputType, ParsedCSV } from '@/types/release';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';
///import { fetchContextArtifacts } from '@/lib/context-artifacts';
import { callPMAdvisorAgent } from '@/lib/pm-advisor';


// project_artifacts row shape (based on your schema)
type ProjectArtifact = {
  id: string;
  created_at: string;
  updated_at: string;
  project_id: string;
  project_name: string;
  artifact_type: string;
  artifact_name: string | null;
  input_data: any; // jsonb
  output_data: string | null;
  metadata: Record<string, any> | null;
  status: string | null;
    advisor_feedback: string | null;
  advisor_reviewed_at: string | null;
};

type OutputSection = {
  id: string;        // stable key for React
  title: string;     // extracted from "# ..."
  content: string;   // markdown for that section
};

function splitAgentOutputIntoSections(
  output: string,
  preferredTitles: string[] = []
): OutputSection[] {
  if (!output || !output.trim()) return [];

  // Split on H1 headers, preserving them
  const matches = [...output.matchAll(/^#\s+.+$/gm)];

  // If there are no H1s, treat entire output as one section
  if (matches.length === 0) {
    return [
      {
        id: '0',
        title: preferredTitles[0] ?? 'Output',
        content: output.trim(),
      },
    ];
  }

  const sections: OutputSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index!;
    const end = matches[i + 1]?.index ?? output.length;

    const block = output.slice(start, end).trim();
    const firstLine = block.split('\n')[0];
    const title = firstLine.replace(/^#\s+/, '').trim();

    sections.push({
      id: String(i),
      title,
      content: block,
    });
  }

  return sections;
}





// Helper: ensure values from DB are valid OutputType values
function coerceSelectedOutputs(values: any): OutputType[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set<string>(OUTPUT_TYPES as unknown as string[]);
  return values.filter((v) => typeof v === 'string' && allowed.has(v)) as OutputType[];
}

const ARTIFACT_TYPE = 'release_communications';

export default function ReleaseCommunications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeProject } = useActiveProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const artifactIdFromUrl = searchParams.get('artifact');


  // File upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string>('');
  const [parsedCsv, setParsedCsv] = useState<ParsedCSV | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsingCsv, setIsParsingCsv] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  

  // Form state
  const [releaseName, setReleaseName] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [knownRisks, setKnownRisks] = useState('');
  const [selectedOutputs, setSelectedOutputs] = useState<OutputType[]>([]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentOutput, setCurrentOutput] = useState<string>('');
  type ResultsTab = 'current' | 'advisor' | 'history';
  const [activeResultsTab, setActiveResultsTab] = useState<ResultsTab>('current');

  const [outputSections, setOutputSections] = useState<OutputSection[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ProjectArtifact[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Editing state (mirrors Product Documentation)
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editableOutput, setEditableOutput] = useState('');
  type EditViewMode = 'edit' | 'preview';
  const [editViewMode, setEditViewMode] = useState<EditViewMode>('edit');

  
  // Canonical versioning (matches Product Documentation)
  const [currentArtifactVersion, setCurrentArtifactVersion] = useState<number>(1);
  const [lastModifiedBy, setLastModifiedBy] = useState<'agent' | 'user'>('agent');

  // Column collapse state 
  const [isOutputsCollapsed, setIsOutputsCollapsed] = useState(false);
  const [isInputsCollapsed, setIsInputsCollapsed] = useState(false);
  const gridTemplateColumns = `
    ${isInputsCollapsed ? '56px' : '360px'}
    ${isOutputsCollapsed ? '56px' : '300px'}
    1fr
  `;


  // PM Advisor state
  const [advisorOutput, setAdvisorOutput] = useState<string>('');
  const [isRunningAdvisor, setIsRunningAdvisor] = useState(false);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  useEffect(() => {
  if (activeProject) loadSessions();
  else {
    setSessions([]);
    setCurrentOutput(null);
    setCurrentArtifactId(null);
    setAdvisorOutput('');
    setAdvisorError(null);
    setError(null);
    setOutputSections([]);    
    setActiveSectionId(null);   
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeProject?.id]);


      useEffect(() => {
        if (!currentOutput) {
          setOutputSections([]);
          setActiveSectionId(null);
          return;
        }

        const sections = splitAgentOutputIntoSections(currentOutput);
        setOutputSections(sections);
        setActiveSectionId((prev) => {
          if (prev && sections.some((s) => s.id === prev)) return prev;
          return sections[0]?.id ?? null;
        });
      }, [currentOutput]);

      useEffect(() => {
        if (!artifactIdFromUrl || sessions.length === 0) return;

        const match = sessions.find((s) => s.id === artifactIdFromUrl);

        if (match) {
          loadSession(match);
        }
      }, [artifactIdFromUrl, sessions]);

  const loadSessions = async () => {
  if (!activeProject) return;

  try {
    setIsLoadingSessions(true);

    const data = await supabaseFetch<ProjectArtifact[]>(
      `/project_artifacts?project_id=eq.${activeProject.id}` +
      `&artifact_type=eq.${ARTIFACT_TYPE}` +
      `&status=eq.active` +
      `&order=created_at.desc&limit=20`
    );

    setSessions(data);

    // ❌ Do NOT auto-load latest session
    if (artifactIdFromUrl) {
      const match = data.find((s) => s.id === artifactIdFromUrl);
      if (match) loadSession(match);
    }



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


  const resetCsvState = () => {
    setCsvFile(null);
    setCsvData('');
    setParsedCsv(null);
    setParseError(null);
    setIsParsingCsv(false);
  };

  const handleFileChange = (file: File | null) => {
    if (!file) {
      resetCsvState();
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a CSV file');
      toast({ title: 'Invalid File', description: 'Please upload a .csv file', variant: 'destructive' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setParseError('File too large (max 10MB)');
      toast({ title: 'File Too Large', description: 'Please upload a CSV smaller than 10MB', variant: 'destructive' });
      return;
    }

    setCsvFile(file);
    setCsvData('');
    setParsedCsv(null);
    setParseError(null);
    setIsParsingCsv(true);
    setSelectedOutputs([]);
    setCurrentOutput(null);
    setAdvisorOutput('');
    setCurrentArtifactId(null);
    setOutputSections([]);
    setActiveSectionId(null);

    const reader = new FileReader();

    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      setCsvData(text);

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            const errorMsg = results.errors[0].message;
            setParseError(`CSV parsing error: ${errorMsg}`);
            toast({ title: 'CSV Parsing Error', description: errorMsg, variant: 'destructive' });
            setParsedCsv(null);
            setIsParsingCsv(false);
            return;
          }

          const headers = results.meta.fields || [];
          const rows = results.data as any[];

          setParsedCsv({ headers, rows, rowCount: rows.length });

          if (rows.length > 100) {
            toast({ title: 'Large CSV Detected', description: `Processing ${rows.length} issues. This may take a moment.` });
          }

          setIsParsingCsv(false);
        },
        error: (err) => {
          setParseError(`Failed to parse CSV: ${err.message}`);
          toast({ title: 'Error', description: 'Failed to parse CSV file', variant: 'destructive' });
          setParsedCsv(null);
          setIsParsingCsv(false);
        },
      });
    };

    reader.onerror = () => {
      setParseError('Failed to read file');
      toast({ title: 'Error', description: 'Failed to read CSV file', variant: 'destructive' });
      setParsedCsv(null);
      setIsParsingCsv(false);
    };

    reader.readAsText(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFileChange(files[0]);
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFileChange(files[0]);
  };

  const clearFile = () => handleFileChange(null);

  const toggleOutput = (output: OutputType) => {
    setSelectedOutputs((prev) => (prev.includes(output) ? prev.filter((o) => o !== output) : [...prev, output]));
  };

  const handleGenerate = async () => {
    setSearchParams({});
    setError(null);
    setAdvisorError(null);


    if (!activeProject) {
      const msg = 'No active project selected';
      setError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return;
    }

    if (isParsingCsv) {
      const msg = 'CSV is still being processed. Please wait a moment and try again.';
      setError(msg);
      toast({ title: 'Please Wait', description: msg, variant: 'destructive' });
      return;
    }

    if (!csvData) {
      const msg = 'Please upload a CSV file';
      setError(msg);
      toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      return;
    }

    if (selectedOutputs.length === 0) {
      const msg = 'Please select at least one output type';
      setError(msg);
      toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      return;
    }

    setIsGenerating(true);

    try {
      // Log metadata only; invoke with full payload
      const logPayload = {
        project_id: activeProject.id,
        project_name: activeProject.name,
        csv_filename: csvFile?.name ?? null,
        csv_row_count: parsedCsv?.rowCount ?? null,
        selected_outputs: selectedOutputs,
        release_name: releaseName || null,
        target_audience: targetAudience || null,
        has_known_risks: !!knownRisks,
      };

      const invokePayload = {
      csv_data: csvData,
      selected_outputs: selectedOutputs,
      release_name: releaseName || undefined,
      target_audience: targetAudience || undefined,
      known_risks: knownRisks || undefined,
      project_id: activeProject.id,
      project_name: activeProject.name,
    };


      const result = await callAgentWithLogging(
        'Release Communications',
        'release-communications',
        logPayload,
        () => generateReleaseDocumentation(invokePayload)
      );

      // Persist to project_artifacts
      const artifactName =
        (releaseName && releaseName.trim()) ||
        (csvFile?.name ? `Release Notes • ${csvFile.name}` : 'Release Notes');

      const inputData = {
        csv_filename: csvFile?.name ?? null,
        csv_row_count: parsedCsv?.rowCount ?? null,
        selected_outputs: selectedOutputs,
        release_name: releaseName || null,
        target_audience: targetAudience || null,
        known_risks: knownRisks || null,
      };

      const created = await supabaseFetch<ProjectArtifact[]>('/project_artifacts', {
      method: 'POST',
      body: JSON.stringify({
        project_id: activeProject.id,
        project_name: activeProject.name,
        artifact_type: ARTIFACT_TYPE,
        artifact_name: artifactName,
        input_data: inputData,
        output_data: result.output,
        metadata: {
          version_number: 1,
          last_modified_by: 'agent',
        },
        status: 'active',
        advisor_feedback: null,
        advisor_reviewed_at: null,
      }),
    });



      setCurrentOutput(result.output);
      setAdvisorOutput('');

      if (created && created[0]?.id) setCurrentArtifactId(created[0].id);
      else setCurrentArtifactId(null);

      await loadSessions();

      toast({ title: 'Success', description: 'Release documentation generated successfully' });
    } catch (err: any) {
      const errorMessage = parseErrorMessage(err);
      setError(errorMessage);
      toast({ title: 'Error', description: errorMessage, variant: 'destructive'});
    } finally {
      setIsGenerating(false);
    }
  };
  

  const handleRunAdvisorReview = async () => {
    setAdvisorError(null);

    if (!activeProject) {
      const msg = 'No active project selected';
      setAdvisorError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      return;
    }

    if (!currentOutput) {
      const msg = 'No release notes to review. Generate or load a session first.';
      setAdvisorError(msg);
      toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      return;
    }

    if (!currentArtifactId) {
      const msg = 'No artifact selected. Generate release notes or load a session from history first.';
      setAdvisorError(msg);
      toast({ title: 'Validation Error', description: msg, variant: 'destructive' });
      return;
    }

    setIsRunningAdvisor(true);

    try {
      ///const contextArtifacts = await fetchContextArtifacts(activeProject.id);

      const advisorResult = await callAgentWithLogging(
        'PM Advisor (Release Review)',
        'pm-advisor',
        {
          project_id: activeProject.id,
          project_name: activeProject.name,
          artifact_type: ARTIFACT_TYPE,
          source_session_table: 'project_artifacts',
          source_session_id: currentArtifactId,
          selected_outputs: selectedOutputs,
        },
        () =>
          callPMAdvisorAgent({
            artifact_output: currentOutput,
            module_type: ARTIFACT_TYPE,
            project_id: activeProject.id,
            project_name: activeProject.name,
            source_session_table: 'project_artifacts',
            source_session_id: currentArtifactId,
            artifact_type: 'Customer Release Notes',
            selected_outputs: selectedOutputs,
            context_artifacts: {
              documentation_sessions: [],
              meeting_sessions: [],
              prioritization_sessions: [],
              release_sessions: [],
            },
          })
      );
        // Save advisor feedback onto the same artifact
await supabaseFetch(`/project_artifacts?id=eq.${currentArtifactId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    advisor_feedback: advisorResult.output,
    advisor_reviewed_at: new Date().toISOString(),
  }),
});

  setAdvisorOutput(advisorResult.output);
await loadSessions();

      toast({ title: 'Success', description: 'PM Advisor review complete' });
    } catch (err: any) {
      const errorMessage = parseErrorMessage(err);
      setAdvisorError(errorMessage);
      toast({ title: 'Error', description: errorMessage, variant: 'destructive'});
    } finally {
      setIsRunningAdvisor(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!currentArtifactId || !activeProject || !editingSectionId) {
      toast({ title: 'Error', description: 'No active section to save', variant: 'destructive' });
      return;
    }

    // Rebuild full document from sections
    const updatedSections = outputSections.map((s) =>
      s.id === editingSectionId ? { ...s, content: editableOutput } : s
    );

    const rebuiltOutput = updatedSections.map((s) => s.content).join('\n\n');

    try {
      const nextVersion = currentArtifactVersion + 1;

      await supabaseFetch(`/project_artifacts?id=eq.${currentArtifactId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          output_data: rebuiltOutput,
          metadata: {
            version_number: nextVersion,
            last_modified_by: 'user',
            last_modified_at: new Date().toISOString(),
          },
        }),
      });

      // ✅ Sync UI immediately
      setCurrentArtifactVersion(nextVersion);
      setLastModifiedBy('user');


      // Sync local state 
      setOutputSections(updatedSections);
      setCurrentOutput(rebuiltOutput);
      setEditingSectionId(null);
      setEditViewMode('edit');

      toast({ title: 'Saved', description: 'Edits saved successfully' });
      await loadSessions();
    } catch (err) {
      console.error('Save failed:', err);
      toast({ title: 'Error', description: 'Failed to save edits', variant: 'destructive' });
    }
  };

  
  const handleCopyToClipboard = async () => {
  if (!currentOutput) return;

  try {
    const active = outputSections.find((s) => s.id === activeSectionId);
    const textToCopy = active?.content ?? currentOutput;

    await navigator.clipboard.writeText(textToCopy);
    setCopiedToClipboard(true);
    toast({ title: 'Copied!', description: 'Release documentation copied to clipboard' });
    setTimeout(() => setCopiedToClipboard(false), 2000);
  } catch {
    toast({ title: 'Error', description: 'Failed to copy to clipboard', variant: 'destructive' });
  }
};


    const loadSession = (session: ProjectArtifact) => {
    // --- Core artifact state
    setCurrentArtifactId(session.id);

    const output = session.output_data ?? '';
    setCurrentOutput(output);
    setAdvisorOutput(session.advisor_feedback ?? '');

    // --- Restore inputs
    const input = session.input_data || {};
    setReleaseName(input.release_name ?? '');
    setTargetAudience(input.target_audience ?? '');
    setKnownRisks(input.known_risks ?? '');
    setSelectedOutputs(coerceSelectedOutputs(input.selected_outputs));

    // --- Versioning (source of truth = metadata)
    const metadata = session.metadata ?? {};
    setCurrentArtifactVersion(metadata.version_number ?? 1);
    setLastModifiedBy(metadata.last_modified_by ?? 'agent');

    // --- 🔥 CRITICAL UX FIXES (mirror Doc Agent)
    const sections = splitAgentOutputIntoSections(output);
    setOutputSections(sections);

    setActiveSectionId(sections[0]?.id ?? null);

    setEditingSectionId(null);
    setEditableOutput('');
    setEditViewMode('edit');

    // 👉 FORCE user into Current tab
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

  const canGenerate =
    !!activeProject &&
    !!csvData &&
    !!parsedCsv &&
    !parseError &&
    !isParsingCsv &&
    selectedOutputs.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="text-xl font-semibold">Release Communications</h1>
                <p className="text-sm text-muted-foreground">Generate release documentation from Jira CSV exports</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div
        className="container mx-auto grid gap-6 px-4 py-6 sm:px-6 lg:px-8"
        style={{ gridTemplateColumns }}
        >
        {/* Column 1 Inputs */}
        <div className="h-[calc(100vh-180px)]">
          {isInputsCollapsed ? (
            /* COLLAPSED STATE */
            <div
              className="h-full flex flex-col items-center justify-start
                        pt-3 border rounded-xl bg-muted/30
                        overflow-hidden"
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
                className="mt-2 text-xs"
                style={{ writingMode: 'vertical-rl' }}
              >
                Inputs
              </span>
            </div>
          ) : (
            /* EXPANDED STATE */
            <div className="space-y-6 h-full overflow-hidden flex flex-col">
              <ErrorDisplay error={error} onDismiss={() => setError(null)} />
              <ErrorDisplay error={advisorError} onDismiss={() => setAdvisorError(null)} />

              <Card className="h-full flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-[#111827]">
                      CSV & Release Inputs
                    </CardTitle>
                    <CardDescription>
                      Upload Jira data and add contextual information
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

                    <div className="px-6 pt-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-lg font-semibold text-[#111827]">CSV Upload</CardTitle>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <div className="space-y-2">
                                    <p className="font-semibold">CSV fields for optimal output:</p>
                                    <div className="space-y-1 text-sm">
                                      <p className="font-medium">Required:</p>
                                      <ul className="list-disc pl-4 space-y-0.5">
                                        <li>Issue Key</li>
                                        <li>Issue Type</li>
                                        <li>Summary</li>
                                        <li>Description</li>
                                        <li>Status</li>
                                      </ul>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <CardDescription>Upload Jira CSV export</CardDescription>
                        </div>
                      </div>
                    </div>

                    <CardContent className="space-y-4 overflow-y-auto flex-1">
                      <div
                        className={`relative rounded-lg border-2 border-dashed transition-colors ${
                          isDragging
                            ? 'border-primary bg-primary/5'
                            : parseError
                            ? 'border-destructive bg-destructive/5'
                            : csvFile
                            ? 'border-primary bg-primary/5'
                            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                      >
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleFileInputChange}
                          className={`absolute inset-0 z-10 cursor-pointer opacity-0 ${
                            csvFile ? 'pointer-events-none' : ''
                          }`}
                          id="csv-upload"
                        />

                        <div className="flex flex-col items-center justify-center p-8 text-center">
                          {csvFile ? (
                            <>
                              <FileText className="h-12 w-12 text-primary mb-3" />
                              <div className="space-y-1">
                                <p className="font-medium">{csvFile.name}</p>
                                {isParsingCsv ? (
                                  <p className="text-sm text-muted-foreground">Parsing CSV…</p>
                                ) : parsedCsv ? (
                                  <p className="text-sm text-muted-foreground">{parsedCsv.rowCount} issues loaded</p>
                                ) : null}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  clearFile();
                                }}
                                className="mt-3 gap-2"
                                disabled={isParsingCsv}
                              >
                                <X className="h-4 w-4" />
                                Remove
                              </Button>
                            </>
                          ) : (
                            <>
                              <Upload className="h-12 w-12 text-muted-foreground mb-3" />
                              <p className="font-medium">Drop CSV file here</p>
                              <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                              <Button variant="outline" size="sm" className="mt-3" asChild>
                                <label htmlFor="csv-upload" className="cursor-pointer">
                                  Browse Files
                                </label>
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {parseError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{parseError}</AlertDescription>
                        </Alert>
                      )}

                      <Separator />

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="release-name" className="text-sm font-medium text-[#111827]">
                            Release Name (Optional)
                          </Label>
                          <Input
                            id="release-name"
                            placeholder="e.g., v2.5.0, Sprint 42"
                            value={releaseName}
                            onChange={(e) => setReleaseName(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="target-audience" className="text-sm font-medium text-[#111827]">
                            Target Audience (Optional)
                          </Label>
                          <Input
                            id="target-audience"
                            placeholder="e.g., Internal stakeholders, Sales, External users"
                            value={targetAudience}
                            onChange={(e) => setTargetAudience(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="known-risks" className="text-sm font-medium text-[#111827]">
                            Known Risks / Limitations (Optional)
                          </Label>
                          <Textarea
                            id="known-risks"
                            placeholder="Optional: Note any known issues or limitations"
                            value={knownRisks}
                            onChange={(e) => setKnownRisks(e.target.value)}
                            rows={3}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                )}
             </div>

        {/* Column 2 – Outputs */}
      <div className="h-[calc(100vh-180px)]">
        {isOutputsCollapsed ? (
            <div
              className="h-full flex flex-col items-center justify-start
                        pt-3 border rounded-xl bg-muted/30
                        overflow-hidden flex-shrink-0"
              style={{ width: '56px' }}
            >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOutputsCollapsed(false)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>

            <span
              className="mt-2 text-xs"
              style={{ writingMode: 'vertical-rl' }}
            >
              Outputs
            </span>
          </div>
        ) : (
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-[#111827]">
                  Outputs
                </CardTitle>
                <CardDescription>
                  Select documentation types and generate
                </CardDescription>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOutputsCollapsed(true)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </CardHeader>

            <CardContent className="flex-1 overflow-auto space-y-4">
              <div className="space-y-3">
                {OUTPUT_TYPES.map((output) => (
                  <div
                    key={output}
                    className="flex items-start space-x-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Checkbox
                      id={output}
                      checked={selectedOutputs.includes(output)}
                      onCheckedChange={() => toggleOutput(output)}
                      disabled={isGenerating || isParsingCsv}
                    />
                    <label htmlFor={output} className="flex-1 cursor-pointer text-sm font-medium leading-tight">
                      {output}
                    </label>
                  </div>
                ))}
              </div>

              <Separator />

              <Button onClick={handleGenerate} disabled={!canGenerate || isGenerating} className="w-full" size="lg">
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating release documentation...
                  </>
                ) : isParsingCsv ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing CSV…
                  </>
                ) : (
                  'Generate Release Notes'
                )}
              </Button>
            </CardContent>
          </Card>
        )}
        </div>

        {/* Column 3 Output */}
        <div className="space-y-6">
          <Card className="lg:sticky lg:top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                {/* Left: title + version */}
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg font-semibold text-[#111827]">
                    Release Documentation
                  </CardTitle>

                  <Badge variant="secondary">
                    v{currentArtifactVersion} · {lastModifiedBy === 'user' ? 'Edited' : 'Generated'}
                  </Badge>
                </div>

                {/* Right: PM Advisor */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRunAdvisorReview}
                  disabled={!currentOutput || !currentArtifactId || isRunningAdvisor}
                  className="flex items-center gap-2"
                >
                  {isRunningAdvisor ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Reviewing…
                    </>
                  ) : (
                    <>
                      <Lightbulb className="w-4 h-4" />
                      Run PM Advisor
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeResultsTab}
                onValueChange={(val) => setActiveResultsTab(val as ResultsTab)}
                className="h-full"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="current">Current Release Notes</TabsTrigger>
                  <TabsTrigger value="advisor">Advisor Review</TabsTrigger>
                  <TabsTrigger value="history">Session History</TabsTrigger>
                </TabsList>

                <TabsContent value="current" className="mt-4 space-y-4">
                  {currentOutput ? (
                    <>

                      {/* If we have multiple sections (Customer/Internal/Support), show section tabs */}
                      {outputSections.length > 1 ? (
                        <div className="space-y-3">
                          <Tabs
                            value={activeSectionId ?? outputSections[0]?.id}
                            onValueChange={(val) => setActiveSectionId(val)}
                            className="w-full"
                          >
                            {/* Scrollable tab row to prevent overlap */}
                            <div className="overflow-x-auto">
                              <TabsList className="inline-flex w-max gap-1">
                                {outputSections.map((sec) => (
                                  <TabsTrigger
                                    key={sec.id}
                                    value={sec.id}
                                    title={sec.title}
                                    className={`
                                      whitespace-nowrap
                                      px-3 py-1.5
                                      rounded-md
                                      border
                                      data-[state=active]:bg-blue-600
                                      data-[state=active]:text-white
                                      data-[state=active]:border-blue-600
                                      data-[state=active]:shadow-sm
                                      data-[state=inactive]:bg-white
                                      data-[state=inactive]:text-blue-600
                                      data-[state=inactive]:border-blue-200
                                      hover:bg-blue-50
                                    `}
                                  >
                                    {sec.title}
                                  </TabsTrigger>
                                ))}
                              </TabsList>
                            </div>

                            {outputSections.map((sec) => (
                              <TabsContent key={sec.id} value={sec.id} className="mt-3">
                                <div className="space-y-3">
                                  {/* Action row */}
                                  <div className="flex justify-end gap-2">
                                    {editingSectionId !== sec.id ? (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setEditableOutput(sec.content);
                                            setEditingSectionId(sec.id);
                                            setEditViewMode('edit');
                                          }}
                                        >
                                          Edit
                                        </Button>

                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => navigator.clipboard.writeText(sec.content)}
                                        >
                                          <Copy className="mr-2 h-4 w-4" />
                                          Copy to Clipboard
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        {/* Edit / Preview toggle */}
                                        <div className="flex items-center gap-2 mr-auto">
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

                                        <Button size="sm" onClick={handleSaveEdits}>
                                          Save
                                        </Button>

                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setEditingSectionId(null);
                                            setEditableOutput('');
                                            setEditViewMode('edit');
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                      </>
                                    )}
                                  </div>

                                  {/* Content */}
                                  <div className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-6 dark:prose-invert max-h-[600px] overflow-y-auto">
                                    {editingSectionId === sec.id ? (
                                      editViewMode === 'edit' ? (
                                        <Textarea
                                          value={editableOutput}
                                          onChange={(e) => setEditableOutput(e.target.value)}
                                          className="min-h-[400px] w-full font-mono text-sm"
                                        />
                                      ) : (
                                        <ReactMarkdown>{editableOutput}</ReactMarkdown>
                                      )
                                    ) : (
                                      <ReactMarkdown>{sec.content}</ReactMarkdown>
                                    )}
                                  </div>
                                </div>

                              </TabsContent>
                            ))}
                          </Tabs>
                        </div>
                      ) : (
                        <div className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-6 dark:prose-invert max-h-[600px] overflow-y-auto">
                          <ReactMarkdown>{currentOutput}</ReactMarkdown>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                      <p className="text-sm text-muted-foreground">Upload CSV and generate release notes to see results.</p>
                    </div>
                  )}
                </TabsContent>


                <TabsContent value="advisor" className="mt-4 space-y-4">
                  {advisorOutput ? (
                    <div className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-6 dark:prose-invert max-h-[600px] overflow-y-auto">
                      <ReactMarkdown>{advisorOutput}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                      <div className="text-center">
                        <Lightbulb className="mx-auto h-12 w-12 mb-3 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">Run PM Advisor Review to receive feedback.</p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  {isLoadingSessions ? (
                    <div className="flex min-h-[400px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                      <p className="text-sm text-muted-foreground">No sessions yet. Generate your first release notes.</p>
                    </div>
                  ) : (
                    <div className="max-h-[600px] space-y-3 overflow-y-auto">
                      {sessions.map((s) => (
                        <Card
                          key={s.id}
                          className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
                          onClick={() => {
                            loadSession(s);
                            setSearchParams({ artifact: s.id });
                            setEditingSectionId(null);
                            setEditableOutput('');
                            setEditViewMode('edit');
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
                              <p className="font-medium">{s.artifact_name || 'Release Notes'}</p>

                              <div className="flex flex-wrap gap-1">
                                {coerceSelectedOutputs(s.input_data?.selected_outputs).slice(0, 3).map((o) => (
                                  <Badge key={o} variant="secondary" className="text-xs">
                                    {o}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
