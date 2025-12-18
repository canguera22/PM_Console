import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
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
import { generateReleaseDocumentation } from '@/lib/release-agent';
import { supabaseFetch } from '@/lib/supabase';
import { ReleaseSession, OUTPUT_TYPES, OutputType, ParsedCSV } from '@/types/release';
import { ActiveProjectSelector } from '@/components/ActiveProjectSelector';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import ReactMarkdown from 'react-markdown';
import { callPMAdvisorAgent, fetchContextArtifacts, saveAdvisorReview } from '@/lib/pm-advisor';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';

export default function ReleaseCommunications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeProject } = useActiveProject();

  // File upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string>('');
  const [parsedCsv, setParsedCsv] = useState<ParsedCSV | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Form state
  const [releaseName, setReleaseName] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [knownRisks, setKnownRisks] = useState('');
  const [selectedOutputs, setSelectedOutputs] = useState<OutputType[]>([]);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentOutput, setCurrentOutput] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ReleaseSession[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // PM Advisor state
  const [advisorOutput, setAdvisorOutput] = useState<string>('');
  const [isRunningAdvisor, setIsRunningAdvisor] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  // Load session history when active project changes
  useEffect(() => {
    if (activeProject) {
      loadSessions();
    }
  }, [activeProject]);

  const loadSessions = async () => {
    if (!activeProject) return;
    try {
      setIsLoadingSessions(true);
      const data = await supabaseFetch<ReleaseSession[]>(
        `/release_sessions?project_id=eq.${activeProject.id}&order=created_at.desc&limit=20`
      );
      setSessions(data);
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load session history',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setCsvFile(null);
      setCsvData('');
      setParsedCsv(null);
      setParseError(null);
      return;
    }

    if (!file.name.endsWith('.csv')) {
      setParseError('Please upload a CSV file');
      toast({
        title: 'Invalid File',
        description: 'Please upload a .csv file',
        variant: 'destructive',
      });
      return;
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setParseError('File too large (max 10MB)');
      toast({
        title: 'File Too Large',
        description: 'Please upload a CSV file smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    setCsvFile(file);
    setParseError(null);

    // Read and parse CSV
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvData(text);

      // Parse CSV with Papa Parse
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: '',
        complete: (results) => {
          if (results.errors.length > 0) {
            const errorMsg = results.errors[0].message;
            setParseError(`CSV parsing error: ${errorMsg}`);
            toast({
              title: 'CSV Parsing Error',
              description: errorMsg,
              variant: 'destructive',
            });
            return;
          }

          const headers = results.meta.fields || [];
          const rows = results.data;

          setParsedCsv({
            headers,
            rows,
            rowCount: rows.length,
          });

          // Show warning for large files
          if (rows.length > 100) {
            toast({
              title: 'Large CSV Detected',
              description: `Processing ${rows.length} issues. This may take a moment.`,
            });
          }
        },
        error: (error) => {
          setParseError(`Failed to parse CSV: ${error.message}`);
          toast({
            title: 'Error',
            description: 'Failed to parse CSV file',
            variant: 'destructive',
          });
        },
      });
    };

    reader.onerror = () => {
      setParseError('Failed to read file');
      toast({
        title: 'Error',
        description: 'Failed to read CSV file',
        variant: 'destructive',
      });
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
    if (files.length > 0) {
      handleFileChange(files[0]);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileChange(files[0]);
    }
  };

  const clearFile = () => {
    handleFileChange(null);
  };

  const toggleOutput = (output: OutputType) => {
    setSelectedOutputs((prev) =>
      prev.includes(output)
        ? prev.filter((o) => o !== output)
        : [...prev, output]
    );
  };

  const handleGenerate = async () => {
    // Clear previous error
    setError(null);

    if (!csvData) {
      const errorMsg = 'Please upload a CSV file';
      setError(errorMsg);
      toast({
        title: 'Validation Error',
        description: errorMsg,
        variant: 'destructive',
      });
      return;
    }

    if (selectedOutputs.length === 0) {
      const errorMsg = 'Please select at least one output type';
      setError(errorMsg);
      toast({
        title: 'Validation Error',
        description: errorMsg,
        variant: 'destructive',
      });
      return;
    }

    if (!activeProject) {
      const errorMsg = 'No active project selected';
      setError(errorMsg);
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    console.log('👤 [User Action] Clicked "Generate Release Notes" button');
    console.log('📝 [Input Data]', {
      csvFilename: csvFile?.name,
      csvRowCount: parsedCsv?.rowCount,
      selectedOutputs,
      releaseName,
      targetAudience,
      projectId: activeProject.id,
    });

    try {
      // Call the release agent with logging
      const result = await callAgentWithLogging(
        'Release Communications',
        'release-communications',
        {
          csv_data: csvData,
          selected_outputs: selectedOutputs,
          release_name: releaseName || undefined,
          target_audience: targetAudience || undefined,
          known_risks: knownRisks || undefined,
        },
        () => generateReleaseDocumentation({
          csv_data: csvData,
          selected_outputs: selectedOutputs,
          release_name: releaseName || undefined,
          target_audience: targetAudience || undefined,
          known_risks: knownRisks || undefined,
        })
      );

      console.log('✨ [Success] Received AI-generated release documentation', { outputLength: result.output.length });

      // Save to database with project_id
      console.log('💾 [Database] Saving to release_sessions table...');
      const savedSessions = await supabaseFetch<ReleaseSession[]>('/release_sessions', {
        method: 'POST',
        body: JSON.stringify({
          release_name: releaseName || null,
          target_audience: targetAudience || null,
          known_risks: knownRisks || null,
          csv_filename: csvFile?.name || null,
          csv_row_count: parsedCsv?.rowCount || null,
          selected_outputs: selectedOutputs,
          output: result.output,
          project_id: activeProject.id,
          module_type: 'release_communications',
          metadata: {},
        }),
      });
      console.log('💾 [Database] Saved successfully');

      setCurrentOutput(result.output);
      // Store the session ID for advisor review
      if (savedSessions && savedSessions.length > 0) {
        setCurrentSessionId(savedSessions[0].id);
      }

      // Refresh session history
      await loadSessions();

      toast({
        title: 'Success',
        description: 'Release documentation generated successfully',
      });
    } catch (error: any) {
      console.error('💥 [Error Handler] Caught error:', error);
      const errorMessage = parseErrorMessage(error);
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsGenerating(false);
      console.log('🏁 [Complete] Release generation finished');
    }
  };

  const handleRunAdvisorReview = async () => {
    // Clear previous error
    setAdvisorError(null);

    if (!currentOutput) {
      const errorMsg = 'No release notes to review. Generate release notes first.';
      setAdvisorError(errorMsg);
      toast({
        title: 'Validation Error',
        description: errorMsg,
        variant: 'destructive',
      });
      return;
    }

    if (!activeProject) {
      const errorMsg = 'No active project selected';
      setAdvisorError(errorMsg);
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
      return;
    }

    setIsRunningAdvisor(true);
    console.log('👤 [User Action] Clicked "Run PM Advisor Review" button');

    try {
      // Fetch context artifacts from other modules
      console.log('🔍 [Context] Fetching context artifacts from other modules...');
      const contextArtifacts = await fetchContextArtifacts(activeProject.id);

      // Call PM Advisor agent with logging
      const advisorResult = await callAgentWithLogging(
        'PM Advisor (Release Review)',
        'pm-advisor',
        {
          artifact_output: currentOutput,
          module_type: 'release_communications',
          project_id: activeProject.id,
          project_name: activeProject.name,
          source_session_table: 'release_sessions',
          source_session_id: currentSessionId,
          artifact_type: 'Customer Release Notes',
          selected_outputs: selectedOutputs,
          context_artifacts: contextArtifacts,
        },
        () => callPMAdvisorAgent({
          artifact_output: currentOutput,
          module_type: 'release_communications',
          project_id: activeProject.id,
          project_name: activeProject.name,
          source_session_table: 'release_sessions',
          source_session_id: currentSessionId,
          artifact_type: 'Customer Release Notes',
          selected_outputs: selectedOutputs,
          context_artifacts: contextArtifacts,
        })
      );

      console.log('✨ [Success] Received PM Advisor review', { outputLength: advisorResult.output.length });
      setAdvisorOutput(advisorResult.output);

      // Save advisor review to database
      console.log('💾 [Database] Saving PM Advisor review...');
      await saveAdvisorReview(
        activeProject.id,
        activeProject.name,
        'release_communications',
        'release_sessions',
        currentSessionId,
        'Customer Release Notes',
        { selected_outputs: selectedOutputs, reviewed_at: new Date().toISOString() },
        currentOutput,
        advisorResult.output,
        {
          context_available: {
            documentation: !!contextArtifacts.documentation_sessions,
            meeting: !!contextArtifacts.meeting_sessions,
            prioritization: !!contextArtifacts.prioritization_sessions,
            release: !!contextArtifacts.release_sessions,
          },
        }
      );
      console.log('💾 [Database] PM Advisor review saved successfully');

      toast({
        title: 'Success',
        description: 'PM Advisor review complete',
      });
    } catch (error: any) {
      console.error('💥 [Error Handler] Caught error:', error);
      const errorMessage = parseErrorMessage(error);
      setAdvisorError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
        duration: 5000,
      });
    } finally {
      setIsRunningAdvisor(false);
      console.log('🏁 [Complete] PM Advisor review finished');
    }
  };

  const handleCopyToClipboard = async () => {
    if (!currentOutput) return;

    try {
      await navigator.clipboard.writeText(currentOutput);
      setCopiedToClipboard(true);
      toast({
        title: 'Copied!',
        description: 'Release documentation copied to clipboard',
      });
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const loadSession = (session: ReleaseSession) => {
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

  const canGenerate = csvFile && !parseError && selectedOutputs.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Separator orientation="vertical" className="h-6" />
              <div>
                <h1 className="text-xl font-semibold">Release Communications</h1>
                <p className="text-sm text-muted-foreground">
                  Generate release documentation from Jira CSV exports
                </p>
              </div>
            </div>
            <ActiveProjectSelector />
          </div>
        </div>
      </div>

      {/* Active Project Indicator */}
      {activeProject && (
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 py-2 sm:px-6 lg:px-8">
            <p className="text-xs text-muted-foreground">
              Project: <span className="font-medium">{activeProject.name}</span>
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[2fr_1.5fr_2fr] lg:px-8">
        {/* Left Panel - CSV Upload & Inputs */}
        <div className="space-y-6">
          {/* Error Display */}
          <ErrorDisplay error={error} onDismiss={() => setError(null)} />
          <ErrorDisplay error={advisorError} onDismiss={() => setAdvisorError(null)} />

          <Card>
            <CardHeader>
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
                              <p className="font-medium mt-2">Optional (but helpful):</p>
                              <ul className="list-disc pl-4 space-y-0.5">
                                <li>Labels</li>
                                <li>Components</li>
                                <li>Fix Version / Affected Version</li>
                                <li>Priority</li>
                                <li>Acceptance Criteria</li>
                                <li>Story Points</li>
                                <li>Created Date / Resolved Date</li>
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
            </CardHeader>
            <CardContent className="space-y-4">
              {/* CSV Upload Dropzone */}
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
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileInputChange}
                  className="absolute inset-0 z-10 cursor-pointer opacity-0"
                  id="csv-upload"
                />
                <div className="flex flex-col items-center justify-center p-8 text-center">
                  {csvFile ? (
                    <>
                      <FileText className="h-12 w-12 text-primary mb-3" />
                      <div className="space-y-1">
                        <p className="font-medium">{csvFile.name}</p>
                        {parsedCsv && (
                          <p className="text-sm text-muted-foreground">
                            {parsedCsv.rowCount} issues loaded
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearFile();
                        }}
                        className="mt-3 gap-2"
                      >
                        <X className="h-4 w-4" />
                        Remove
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 text-muted-foreground mb-3" />
                      <p className="font-medium">Drop CSV file here</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        or click to browse
                      </p>
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

              {/* Optional Inputs */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="release-name" className="text-sm font-medium text-[#111827]">Release Name (Optional)</Label>
                  <Input
                    id="release-name"
                    placeholder="e.g., v2.5.0, Sprint 42"
                    value={releaseName}
                    onChange={(e) => setReleaseName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target-audience" className="text-sm font-medium text-[#111827]">Target Audience (Optional)</Label>
                  <Input
                    id="target-audience"
                    placeholder="e.g., Internal stakeholders, Sales, External users"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="known-risks" className="text-sm font-medium text-[#111827]">Known Risks / Limitations (Optional)</Label>
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

        {/* Middle Panel - Output Selection */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-[#111827]">Select Documentation Types</CardTitle>
              <CardDescription>
                Choose one or more output formats
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    />
                    <label
                      htmlFor={output}
                      className="flex-1 cursor-pointer text-sm font-medium leading-tight"
                    >
                      {output}
                    </label>
                  </div>
                ))}
              </div>

              <Separator />

              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating release documentation...
                  </>
                ) : (
                  'Generate Release Notes'
                )}
              </Button>

              {/* PM Advisor Review Button */}
              <Button
                variant="outline"
                onClick={handleRunAdvisorReview}
                disabled={!currentOutput || isRunningAdvisor}
                className="w-full mt-3"
                size="lg"
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

              {!csvFile && (
                <p className="text-center text-xs text-muted-foreground">
                  Upload CSV to continue
                </p>
              )}
              {csvFile && selectedOutputs.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Select at least one output type
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Results Display */}
        <div className="space-y-6">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-[#111827]">Release Documentation</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="current" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="current">Current Release Notes</TabsTrigger>
                  <TabsTrigger value="advisor">Advisor Review</TabsTrigger>
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
                      <div className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-6 dark:prose-invert max-h-[600px] overflow-y-auto">
                        <ReactMarkdown>{currentOutput}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">
                          Upload CSV and generate release notes to see results.
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="advisor" className="mt-4 space-y-4">
                  {/* Advisor Error Display */}
                  <ErrorDisplay error={advisorError} onDismiss={() => setAdvisorError(null)} />

                  {advisorOutput ? (
                    <>
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(advisorOutput);
                              toast({
                                title: 'Copied!',
                                description: 'PM Advisor review copied to clipboard',
                              });
                            } catch (error) {
                              toast({
                                title: 'Error',
                                description: 'Failed to copy to clipboard',
                                variant: 'destructive',
                              });
                            }
                          }}
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Copy to Clipboard
                        </Button>
                      </div>
                      <div className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-6 dark:prose-invert max-h-[600px] overflow-y-auto">
                        <ReactMarkdown>{advisorOutput}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                      <div className="text-center">
                        <Lightbulb className="mx-auto h-12 w-12 mb-3 text-muted-foreground opacity-50" />
                        <p className="text-sm text-muted-foreground">
                          Run PM Advisor Review to receive feedback on the current output.
                        </p>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <div className="space-y-3">
                    {isLoadingSessions ? (
                      <div className="flex min-h-[400px] items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : sessions.length === 0 ? (
                      <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">
                            No sessions yet. Generate your first release notes to get started.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="max-h-[600px] space-y-3 overflow-y-auto">
                        {sessions.map((session) => (
                          <Card
                            key={session.id}
                            className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
                            onClick={() => loadSession(session)}
                          >
                            <CardContent className="p-4">
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-xs text-muted-foreground">
                                    {formatDate(session.created_at)}
                                  </p>
                                </div>
                                {session.release_name && (
                                  <p className="font-medium">{session.release_name}</p>
                                )}
                                {session.csv_filename && (
                                  <p className="text-sm text-muted-foreground">
                                    {session.csv_filename}
                                    {session.csv_row_count && ` • ${session.csv_row_count} issues`}
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-1">
                                  {session.selected_outputs.slice(0, 3).map((output) => (
                                    <Badge key={output} variant="secondary" className="text-xs">
                                      {output.split(' / ')[0]}
                                    </Badge>
                                  ))}
                                  {session.selected_outputs.length > 3 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{session.selected_outputs.length - 3}
                                    </Badge>
                                  )}
                                </div>
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