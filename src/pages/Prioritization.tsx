import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, Copy, CheckCircle2, Upload, X, Download, Info, Plus, Trash2 } from 'lucide-react';
import { calculateWSJF } from '@/lib/prioritization-agent';
import { supabaseFetch } from '@/lib/supabase';
import { ProjectArtifact } from '@/types/project-artifacts';
import { ActiveProjectSelector } from '@/components/ActiveProjectSelector';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import ReactMarkdown from 'react-markdown';
import Papa from 'papaparse';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import {
  PRIORITIZATION_MODELS,
  OUTPUT_TYPES,
  RICE_OUTPUT_TYPES,
  MOSCOW_OUTPUT_TYPES,
  VALUE_EFFORT_OUTPUT_TYPES,
  CUSTOM_OUTPUT_TYPES,
} from '@/lib/prioritization-definitions';

import type {
  PrioritizationModel,
  OutputType,
  RICEConfig,
  MoSCoWConfig,
  ValueEffortConfig,
  CustomScoringConfig,
  CustomFactor,
  RICEOutputType,
  MoSCoWOutputType,
  ValueEffortOutputType,
  CustomOutputType,
} from '@/types/prioritization';

import { Lightbulb } from 'lucide-react';
import { callPMAdvisorAgent } from '@/lib/pm-advisor';


export default function Prioritization() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeProject } = useActiveProject();

  // Model Selection State
  const [selectedModel, setSelectedModel] = useState<PrioritizationModel>('WSJF');

  // CSV Upload State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [csvRowCount, setCsvRowCount] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // Form State
  const [initiativeName, setInitiativeName] = useState('');
  const [defaultEffortScale, setDefaultEffortScale] = useState('');
  const [notesContext, setNotesContext] = useState('');
  
  // WSJF Configuration State
  const [effortFieldName, setEffortFieldName] = useState('Job Size');
  const [maxScorePerFactor, setMaxScorePerFactor] = useState(10);
  const [normalizeScores, setNormalizeScores] = useState(true);
  const [topNItems, setTopNItems] = useState(10);
  const [selectedOutputs, setSelectedOutputs] = useState<OutputType[]>([]);

  const REQUIRED_WSJF_FIELDS = [
  'business value',
  'time criticality',
  'risk reduction',
  'job size',
];


  // RICE Configuration State
  const [riceConfig, setRiceConfig] = useState<RICEConfig>({
    reachColumn: '',
    impactColumn: '',
    confidenceColumn: '',
    effortColumn: '',
    normalizeScores: true,
    selectedOutputs: [],
    topNItems: 10,
  });

  // MoSCoW Configuration State
  const [moscowConfig, setMoscowConfig] = useState<MoSCoWConfig>({
    moscowColumn: 'MoSCoW',
    categoryMapping: {
      must: 'Must',
      should: 'Should',
      could: 'Could',
      wont: 'Won\'t',
    },
    selectedOutputs: [],
  });

  // Value/Effort Configuration State
  const [valueEffortConfig, setValueEffortConfig] = useState<ValueEffortConfig>({
    valueColumn: '',
    effortColumn: '',
    invertRanking: false,
    normalizeScores: true,
    selectedOutputs: [],
    topNItems: 10,
  });

  // Custom Scoring Configuration State
  const [customConfig, setCustomConfig] = useState<CustomScoringConfig>({
    factors: [
      { id: '1', factorName: '', csvColumn: '', weight: 1.0 },
      { id: '2', factorName: '', csvColumn: '', weight: 1.0 },
      { id: '3', factorName: '', csvColumn: '', weight: 1.0 },
    ],
    normalizeScores: true,
    selectedOutputs: [],
    topNItems: 10,
  });


// Analysis State
const [isCalculating, setIsCalculating] = useState(false);
const [currentOutput, setCurrentOutput] = useState<string | null>(null);
const [sessions, setSessions] = useState<ProjectArtifact[]>([]);
const [isLoadingSessions, setIsLoadingSessions] = useState(true);
const [copiedToClipboard, setCopiedToClipboard] = useState(false);

// Tabs state (controls Current / Advisor / History)
  const [activeTab, setActiveTab] = useState<'current' | 'advisor' | 'history'>('current');

// 🔑 PM Advisor state
const [advisorOutput, setAdvisorOutput] = useState<string>('');
const [isRunningAdvisor, setIsRunningAdvisor] = useState(false);
const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
const [advisorError, setAdvisorError] = useState<string | null>(null);


// Error state
const [error, setError] = useState<string | null>(null);

// Load session history
const loadSessions = async () => {
  if (!activeProject) return;

  try {
    setIsLoadingSessions(true);

    const data = await supabaseFetch<ProjectArtifact[]>(
      `/project_artifacts?project_id=eq.${activeProject.id}` +
      `&artifact_type=eq.prioritization&status=eq.active&order=created_at.desc&limit=20`
    );

    setSessions(data);

  } finally {
    setIsLoadingSessions(false);
  }
};


// React to active project changes
useEffect(() => {
  if (activeProject) {
    loadSessions();
  } else {
    setSessions([]);
    setCurrentOutput(null);
    setError(null);
  }
}, [activeProject]);


  // CSV Upload Handlers
  const handleFileChange = (file: File | null) => {
    if (!file) return;

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }

    setCsvFile(file);

    // Read and parse CSV
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCsvContent(content);

      // Parse CSV to count rows and validate
      Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setCsvRowCount(results.data.length);
          
          // Check for required columns based on selected model
          const headers = results.meta.fields?.map(h => h.toLowerCase()) || [];
          
          if (selectedModel === 'WSJF') {
            const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
            const missingFields = REQUIRED_WSJF_FIELDS.filter(field =>
              !headers.some(h => normalize(h).includes(normalize(field)))
            );

            if (missingFields.length > 0) {
              toast({
                title: 'Warning: Missing Columns',
                description: `CSV may be missing: ${missingFields.join(', ')}`,
                variant: 'destructive',
              });
            }
          }
        },
        error: (error) => {
          toast({
            title: 'CSV Parse Error',
            description: error.message,
            variant: 'destructive',
          });
        },
      });
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  };

  const clearFile = () => {
    setCsvFile(null);
    setCsvContent('');
    setCsvRowCount(0);
  };

  // Download CSV Template
  const downloadTemplate = () => {
    const templateContent = `ID,Title,Business Value,Time Criticality,Risk Reduction,Job Size,Type,Component,Status,Owner
FEAT-001,User Authentication System,9,8,7,5,Feature,Auth,In Progress,Engineering Team
FEAT-002,Mobile App Dark Mode,6,4,3,2,Feature,UI,Backlog,Design Team
BUG-003,Fix Login Performance Issue,7,9,6,3,Bug,Auth,To Do,Backend Team`;

    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'wsjf-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: 'Template Downloaded',
      description: 'WSJF CSV template downloaded successfully',
    });
  };

  // Output Selection - WSJF
  const toggleOutput = (output: OutputType) => {
    setSelectedOutputs(prev =>
      prev.includes(output)
        ? prev.filter(o => o !== output)
        : [...prev, output]
    );
  };

  // Output Selection - RICE
  const toggleRiceOutput = (output: RICEOutputType) => {
    setRiceConfig(prev => ({
      ...prev,
      selectedOutputs: prev.selectedOutputs.includes(output)
        ? prev.selectedOutputs.filter(o => o !== output)
        : [...prev, output],
    }));
  };

  // Output Selection - MoSCoW
  const toggleMoscowOutput = (output: MoSCoWOutputType) => {
    setMoscowConfig(prev => ({
      ...prev,
      selectedOutputs: prev.selectedOutputs.includes(output)
        ? prev.selectedOutputs.filter(o => o !== output)
        : [...prev, output],
    }));
  };

  // Output Selection - Value/Effort
  const toggleValueEffortOutput = (output: ValueEffortOutputType) => {
    setValueEffortConfig(prev => ({
      ...prev,
      selectedOutputs: prev.selectedOutputs.includes(output)
        ? prev.selectedOutputs.filter(o => o !== output)
        : [...prev, output],
    }));
  };

  // Output Selection - Custom
  const toggleCustomOutput = (output: CustomOutputType) => {
    setCustomConfig(prev => ({
      ...prev,
      selectedOutputs: prev.selectedOutputs.includes(output)
        ? prev.selectedOutputs.filter(o => o !== output)
        : [...prev, output],
    }));
  };

  // Custom Scoring - Add Factor
  const addCustomFactor = () => {
    setCustomConfig(prev => ({
      ...prev,
      factors: [
        ...prev.factors,
        { id: Date.now().toString(), factorName: '', csvColumn: '', weight: 1.0 },
      ],
    }));
  };

  // Custom Scoring - Remove Factor
  const removeCustomFactor = (id: string) => {
    if (customConfig.factors.length <= 1) {
      toast({
        title: 'Cannot Remove',
        description: 'At least one factor is required',
        variant: 'destructive',
      });
      return;
    }
    setCustomConfig(prev => ({
      ...prev,
      factors: prev.factors.filter(f => f.id !== id),
    }));
  };

  // Custom Scoring - Update Factor
  const updateCustomFactor = (id: string, field: keyof CustomFactor, value: string | number) => {
    setCustomConfig(prev => ({
      ...prev,
      factors: prev.factors.map(f =>
        f.id === id ? { ...f, [field]: value } : f
      ),
    }));
  };

  // Get action button label based on selected model
  const getActionButtonLabel = () => {
    switch (selectedModel) {
      case 'WSJF':
        return 'Calculate WSJF & Rank Backlog';
      case 'RICE':
        return 'Calculate RICE Score & Rank Backlog';
      case 'MoSCoW':
        return 'Apply MoSCoW Prioritization';
      case 'Value/Effort':
        return 'Calculate Value/Effort & Rank Backlog';
      case 'Custom':
        return 'Calculate Custom Score & Rank Backlog';
      default:
        return 'Calculate & Rank Backlog';
    }
  };

  // Calculate WSJF or show placeholder for other models
  const handleCalculate = async () => {
    // Clear previous error
    setError(null);
    
    if (!csvContent) {
      const errorMsg = 'Please upload a CSV file';
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

    // Check if outputs are selected based on model
    const hasOutputs = selectedModel === 'WSJF' 
      ? selectedOutputs.length > 0
      : selectedModel === 'RICE'
      ? riceConfig.selectedOutputs.length > 0
      : selectedModel === 'MoSCoW'
      ? moscowConfig.selectedOutputs.length > 0
      : selectedModel === 'Value/Effort'
      ? valueEffortConfig.selectedOutputs.length > 0
      : customConfig.selectedOutputs.length > 0;

    if (!hasOutputs) {
      const errorMsg = 'Please select at least one output type';
      setError(errorMsg);
      toast({
        title: 'Validation Error',
        description: errorMsg,
        variant: 'destructive',
      });
      return;
    }

    // Only WSJF is functional for now
    if (selectedModel !== 'WSJF') {
      toast({
        title: 'Model not yet active',
        description: `${selectedModel} scoring is configured but not enabled yet.`,
      });
      return;
    }

    setIsCalculating(true);
    console.log('👤 [User Action] Clicked "Calculate WSJF & Rank Backlog" button');
    console.log('📝 [Input Data]', {
      csvFilename: csvFile?.name,
      csvRowCount,
      selectedModel,
      selectedOutputs,
      effortFieldName,
      maxScorePerFactor,
      normalizeScores,
      topNItems,
      projectId: activeProject.id,
    });

    try {
      // Call the agent with logging
      const result = await callAgentWithLogging(
        'Prioritization (WSJF)',
        'prioritization',
        {
          project_id: activeProject.id,
          project_name: activeProject.name,
          csv_row_count: csvRowCount,
          selected_outputs: selectedOutputs,
        },
        () => calculateWSJF({
          csv_content: csvContent,
          project_id: activeProject.id,
          project_name: activeProject.name,
          initiative_name: initiativeName || undefined,
          default_effort_scale: defaultEffortScale || undefined,
          notes_context: notesContext || undefined,
          effort_field_name: effortFieldName,
          max_score_per_factor: maxScorePerFactor,
          normalize_scores: normalizeScores,
          top_n_items: topNItems,
          selected_outputs: selectedOutputs,
        })
      );

      console.log('✨ [Success] Received WSJF calculation results', { outputLength: result.output.length });
      setCurrentOutput(result.output);
      setAdvisorOutput('');
      setActiveTab('current');


      // Save to database with project_id
      console.log('💾 [Database] Saving to project_artifacts...');
      setCurrentArtifactId(result.artifact_id ?? null);


      console.log('💾 [Database] Saved successfully');

      // Refresh session history
      await loadSessions();

      toast({
        title: 'Success',
        description: 'WSJF scores calculated successfully',
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
      setIsCalculating(false);
      console.log('🏁 [Complete] WSJF calculation finished');
    }
  };

  // Copy to Clipboard
  const handleCopyToClipboard = async () => {
    if (!currentOutput) return;

    try {
      await navigator.clipboard.writeText(currentOutput);
      setCopiedToClipboard(true);
      toast({
        title: 'Copied!',
        description: 'Results copied to clipboard',
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

  const buildAdvisorContext = () => currentOutput;


  const handleRunAdvisorReview = async () => {
  setAdvisorError(null);

  if (!currentOutput || !currentArtifactId || !activeProject) {
    setAdvisorError('Generate or load a prioritization first.');
    return;
  }

  setIsRunningAdvisor(true);

  try {
    const advisorResult = await callPMAdvisorAgent({
      artifact_output: buildAdvisorContext(),
      module_type: 'prioritization',
      project_id: activeProject.id,
      project_name: activeProject.name,
      source_session_table: 'project_artifacts',
      source_session_id: currentArtifactId,
      artifact_type: 'WSJF Prioritization',
      selected_outputs,
      context_artifacts: [],
    });

    await supabaseFetch(`/project_artifacts?id=eq.${currentArtifactId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        advisor_feedback: advisorResult.output,
        advisor_reviewed_at: new Date().toISOString(),
      }),
    });

    setAdvisorOutput(advisorResult.output);
    setActiveTab('advisor');
    await loadSessions();

  } catch (err: any) {
    setAdvisorError(parseErrorMessage(err));
  } finally {
    setIsRunningAdvisor(false);
  }
};

  // Load Session
  const loadSession = (session: ProjectArtifact) => {
  setCurrentArtifactId(session.id);
  setCurrentOutput(session.output_data ?? null);
  setAdvisorOutput(session.advisor_feedback ?? '');
};



  // Format Date
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
                <h1 className="text-xl font-semibold">Backlog Prioritization</h1>
                <p className="text-sm text-muted-foreground">
                  Calculate priority scores and rank your backlog using multiple models
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

      {/* Main Content - Three Column Layout */}
      <div className="container mx-auto grid gap-6 px-4 py-6 sm:px-6 lg:grid-cols-3 lg:px-8">
        {/* Left Panel - CSV Upload & Inputs */}
        <div className="space-y-6 lg:col-span-1">
          {/* Error Display */}
          <ErrorDisplay error={error} onDismiss={() => setError(null)} />
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                CSV Upload & Inputs
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="right">
                      <div className="space-y-2 text-sm">
                        <p className="font-semibold">Required CSV columns:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>ID / Issue Key</li>
                          <li>Title / Summary</li>
                          <li>Business Value</li>
                          <li>Time Criticality</li>
                          <li>Risk Reduction / Opportunity Enablement</li>
                          <li>Job Size / Effort</li>
                        </ul>
                        <p className="font-semibold mt-2">Optional columns:</p>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>Type (Feature, Bug, etc.)</li>
                          <li>Component / Area</li>
                          <li>Status</li>
                          <li>Owner / Team</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>
                Upload your backlog CSV and provide optional context
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* CSV Upload Area */}
              <div className="space-y-2">
                <Label htmlFor="csv-upload" className="text-[13px] font-medium text-[#6B7280]">Upload Backlog CSV</Label>
                {!csvFile ? (
                  <div
                    className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragging
                        ? 'border-primary bg-primary/5'
                        : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">
                      Drag and drop your CSV file here
                    </p>
                    <p className="text-xs text-muted-foreground">or</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => document.getElementById('csv-upload')?.click()}
                    >
                      Browse Files
                    </Button>
                    <input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{csvFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {csvRowCount} items
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFile}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <Button
                  variant="link"
                  size="sm"
                  onClick={downloadTemplate}
                  className="h-auto p-0 text-xs"
                >
                  <Download className="mr-1 h-3 w-3" />
                  Download WSJF CSV template
                </Button>
              </div>

              <Separator />

              {/* Optional Global Inputs */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="initiative" className="text-[13px] font-medium text-[#6B7280]">Initiative / Backlog Name</Label>
                  <Input
                    id="initiative"
                    placeholder="e.g., Q1 2024 Backlog, Platform Roadmap"
                    value={initiativeName}
                    onChange={(e) => setInitiativeName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="effort-scale" className="text-[13px] font-medium text-[#6B7280]">Default Effort Scale</Label>
                  <Input
                    id="effort-scale"
                    placeholder="e.g., 1-8, 1-10, Fibonacci"
                    value={defaultEffortScale}
                    onChange={(e) => setDefaultEffortScale(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-[13px] font-medium text-[#6B7280]">Notes / Context</Label>
                  <Textarea
                    id="notes"
                    placeholder="Optional: Add context, constraints, or strategic notes"
                    value={notesContext}
                    onChange={(e) => setNotesContext(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Center Panel - Model Selection & Configuration */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Prioritization Model & Configuration</CardTitle>
              <CardDescription>
                Select a prioritization model and configure its parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Model Selection */}
              <div className="space-y-2">
                <Label htmlFor="model-select" className="text-[13px] font-medium text-[#6B7280]">Prioritization Model</Label>
                <Select value={selectedModel} onValueChange={(value) => setSelectedModel(value as PrioritizationModel)}>
                  <SelectTrigger id="model-select">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIZATION_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* WSJF Configuration */}
              {selectedModel === 'WSJF' && (
                <>
                  <div className="space-y-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm font-medium">WSJF Formula:</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        WSJF = (Business Value + Time Criticality + Risk Reduction) ÷ Job Size
                      </p>
                    </div>

                    <h3 className="text-sm font-semibold">Configuration</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="effort-field" className="text-[13px] font-medium text-[#6B7280]">Effort Field Name</Label>
                      <Input
                        id="effort-field"
                        placeholder="Job Size, Effort, Story Points, etc."
                        value={effortFieldName}
                        onChange={(e) => setEffortFieldName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-score" className="text-[13px] font-medium text-[#6B7280]">Max Score Per Factor</Label>
                      <Input
                        id="max-score"
                        type="number"
                        min={1}
                        max={100}
                        value={maxScorePerFactor}
                        onChange={(e) => setMaxScorePerFactor(parseInt(e.target.value) || 10)}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="normalize"
                        checked={normalizeScores}
                        onCheckedChange={(checked) => setNormalizeScores(checked as boolean)}
                      />
                      <Label
                        htmlFor="normalize"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Normalize scores if out of range
                      </Label>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Output Types</h3>
                    <div className="space-y-3">
                      {OUTPUT_TYPES.map((output) => (
                        <div key={output} className="flex items-start space-x-2">
                          <Checkbox
                            id={output}
                            checked={selectedOutputs.includes(output)}
                            onCheckedChange={() => toggleOutput(output)}
                          />
                          <Label
                            htmlFor={output}
                            className="text-sm font-normal cursor-pointer leading-tight"
                          >
                            {output}
                          </Label>
                        </div>
                      ))}
                    </div>

                    {selectedOutputs.includes('Top N Items Summary') && (
                      <div className="ml-6 space-y-2">
                        <Label htmlFor="top-n" className="text-[13px] font-medium text-[#6B7280]">Top N items</Label>
                        <Input
                          id="top-n"
                          type="number"
                          min={1}
                          max={50}
                          value={topNItems}
                          onChange={(e) => setTopNItems(parseInt(e.target.value) || 10)}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* RICE Configuration */}
              {selectedModel === 'RICE' && (
                <>
                  <div className="space-y-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm font-medium">RICE Formula:</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        RICE Score = (Reach × Impact × Confidence) ÷ Effort
                      </p>
                    </div>

                    <h3 className="text-sm font-semibold">Configuration Inputs</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="reach-column" className="text-[13px] font-medium text-[#6B7280]">Reach Column</Label>
                      <Input
                        id="reach-column"
                        placeholder="e.g., Reach, Users Affected, Audience Size"
                        value={riceConfig.reachColumn}
                        onChange={(e) => setRiceConfig(prev => ({ ...prev, reachColumn: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="impact-column" className="text-[13px] font-medium text-[#6B7280]">Impact Column</Label>
                      <Input
                        id="impact-column"
                        placeholder="e.g., Impact, Impact Score"
                        value={riceConfig.impactColumn}
                        onChange={(e) => setRiceConfig(prev => ({ ...prev, impactColumn: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confidence-column" className="text-[13px] font-medium text-[#6B7280]">Confidence Column</Label>
                      <Input
                        id="confidence-column"
                        placeholder="e.g., Confidence, Confidence %"
                        value={riceConfig.confidenceColumn}
                        onChange={(e) => setRiceConfig(prev => ({ ...prev, confidenceColumn: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="rice-effort-column" className="text-[13px] font-medium text-[#6B7280]">Effort Column</Label>
                      <Input
                        id="rice-effort-column"
                        placeholder="e.g., Effort, Work Required, Story Points"
                        value={riceConfig.effortColumn}
                        onChange={(e) => setRiceConfig(prev => ({ ...prev, effortColumn: e.target.value }))}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="rice-normalize"
                        checked={riceConfig.normalizeScores}
                        onCheckedChange={(checked) => setRiceConfig(prev => ({ ...prev, normalizeScores: checked as boolean }))}
                      />
                      <Label
                        htmlFor="rice-normalize"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Normalize scores if out of range
                      </Label>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Output Types</h3>
                    <div className="space-y-3">
                      {RICE_OUTPUT_TYPES.map((output) => (
                        <div key={output} className="flex items-start space-x-2">
                          <Checkbox
                            id={`rice-${output}`}
                            checked={riceConfig.selectedOutputs.includes(output)}
                            onCheckedChange={() => toggleRiceOutput(output)}
                          />
                          <Label
                            htmlFor={`rice-${output}`}
                            className="text-sm font-normal cursor-pointer leading-tight"
                          >
                            {output}
                          </Label>
                        </div>
                      ))}
                    </div>

                    {riceConfig.selectedOutputs.includes('Top N Items Summary') && (
                      <div className="ml-6 space-y-2">
                        <Label htmlFor="rice-top-n" className="text-[13px] font-medium text-[#6B7280]">Top N items</Label>
                        <Input
                          id="rice-top-n"
                          type="number"
                          min={1}
                          max={50}
                          value={riceConfig.topNItems}
                          onChange={(e) => setRiceConfig(prev => ({ ...prev, topNItems: parseInt(e.target.value) || 10 }))}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* MoSCoW Configuration */}
              {selectedModel === 'MoSCoW' && (
                <>
                  <div className="space-y-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm text-muted-foreground">
                        Your CSV must include a MoSCoW category column (Must/Should/Could/Won't).
                      </p>
                    </div>

                    <h3 className="text-sm font-semibold">Configuration Inputs</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="moscow-column" className="text-[13px] font-medium text-[#6B7280]">MoSCoW Column Name</Label>
                      <Input
                        id="moscow-column"
                        placeholder="e.g., MoSCoW, Priority, Category"
                        value={moscowConfig.moscowColumn}
                        onChange={(e) => setMoscowConfig(prev => ({ ...prev, moscowColumn: e.target.value }))}
                      />
                    </div>

                    <Accordion type="single" collapsible className="border rounded-lg">
                      <AccordionItem value="mapping" className="border-0">
                        <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline">
                          Category Remapping (Optional)
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor="must-map" className="text-[13px] font-medium text-[#6B7280]">"Must Have" maps to:</Label>
                            <Input
                              id="must-map"
                              value={moscowConfig.categoryMapping.must}
                              onChange={(e) => setMoscowConfig(prev => ({
                                ...prev,
                                categoryMapping: { ...prev.categoryMapping, must: e.target.value }
                              }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="should-map" className="text-[13px] font-medium text-[#6B7280]">"Should Have" maps to:</Label>
                            <Input
                              id="should-map"
                              value={moscowConfig.categoryMapping.should}
                              onChange={(e) => setMoscowConfig(prev => ({
                                ...prev,
                                categoryMapping: { ...prev.categoryMapping, should: e.target.value }
                              }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="could-map" className="text-[13px] font-medium text-[#6B7280]">"Could Have" maps to:</Label>
                            <Input
                              id="could-map"
                              value={moscowConfig.categoryMapping.could}
                              onChange={(e) => setMoscowConfig(prev => ({
                                ...prev,
                                categoryMapping: { ...prev.categoryMapping, could: e.target.value }
                              }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="wont-map" className="text-[13px] font-medium text-[#6B7280]">"Won't Have" maps to:</Label>
                            <Input
                              id="wont-map"
                              value={moscowConfig.categoryMapping.wont}
                              onChange={(e) => setMoscowConfig(prev => ({
                                ...prev,
                                categoryMapping: { ...prev.categoryMapping, wont: e.target.value }
                              }))}
                            />
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Output Types</h3>
                    <div className="space-y-3">
                      {MOSCOW_OUTPUT_TYPES.map((output) => (
                        <div key={output} className="flex items-start space-x-2">
                          <Checkbox
                            id={`moscow-${output}`}
                            checked={moscowConfig.selectedOutputs.includes(output)}
                            onCheckedChange={() => toggleMoscowOutput(output)}
                          />
                          <Label
                            htmlFor={`moscow-${output}`}
                            className="text-sm font-normal cursor-pointer leading-tight"
                          >
                            {output}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Value/Effort Configuration */}
              {selectedModel === 'Value/Effort' && (
                <>
                  <div className="space-y-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm font-medium">Priority Formula:</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Priority Score = Value ÷ Effort
                      </p>
                    </div>

                    <h3 className="text-sm font-semibold">Configuration Inputs</h3>
                    
                    <div className="space-y-2">
                      <Label htmlFor="value-column" className="text-[13px] font-medium text-[#6B7280]">Value Column</Label>
                      <Input
                        id="value-column"
                        placeholder="e.g., Value, Business Value, ROI"
                        value={valueEffortConfig.valueColumn}
                        onChange={(e) => setValueEffortConfig(prev => ({ ...prev, valueColumn: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ve-effort-column" className="text-[13px] font-medium text-[#6B7280]">Effort Column</Label>
                      <Input
                        id="ve-effort-column"
                        placeholder="e.g., Effort, Job Size, Story Points"
                        value={valueEffortConfig.effortColumn}
                        onChange={(e) => setValueEffortConfig(prev => ({ ...prev, effortColumn: e.target.value }))}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="invert-ranking"
                        checked={valueEffortConfig.invertRanking}
                        onCheckedChange={(checked) => setValueEffortConfig(prev => ({ ...prev, invertRanking: checked as boolean }))}
                      />
                      <Label
                        htmlFor="invert-ranking"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Invert ranking (higher effort = higher priority)
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="ve-normalize"
                        checked={valueEffortConfig.normalizeScores}
                        onCheckedChange={(checked) => setValueEffortConfig(prev => ({ ...prev, normalizeScores: checked as boolean }))}
                      />
                      <Label
                        htmlFor="ve-normalize"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Normalize scores if out of range
                      </Label>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Output Types</h3>
                    <div className="space-y-3">
                      {VALUE_EFFORT_OUTPUT_TYPES.map((output) => (
                        <div key={output} className="flex items-start space-x-2">
                          <Checkbox
                            id={`ve-${output}`}
                            checked={valueEffortConfig.selectedOutputs.includes(output)}
                            onCheckedChange={() => toggleValueEffortOutput(output)}
                          />
                          <Label
                            htmlFor={`ve-${output}`}
                            className="text-sm font-normal cursor-pointer leading-tight"
                          >
                            {output}
                          </Label>
                        </div>
                      ))}
                    </div>

                    {valueEffortConfig.selectedOutputs.includes('Top N Items Summary') && (
                      <div className="ml-6 space-y-2">
                        <Label htmlFor="ve-top-n" className="text-[13px] font-medium text-[#6B7280]">Top N items</Label>
                        <Input
                          id="ve-top-n"
                          type="number"
                          min={1}
                          max={50}
                          value={valueEffortConfig.topNItems}
                          onChange={(e) => setValueEffortConfig(prev => ({ ...prev, topNItems: parseInt(e.target.value) || 10 }))}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Custom Scoring Configuration */}
              {selectedModel === 'Custom' && (
                <>
                  <div className="space-y-4">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-sm text-muted-foreground">
                        Define custom factors and weights to create your own prioritization formula.
                      </p>
                    </div>

                    <h3 className="text-sm font-semibold">Configuration</h3>
                    
                    <div className="space-y-3">
                      {customConfig.factors.map((factor, index) => (
                        <div key={factor.id} className="rounded-lg border p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Factor {index + 1}</span>
                            {customConfig.factors.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCustomFactor(factor.id)}
                                className="h-7 w-7 p-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`factor-name-${factor.id}`} className="text-[13px] font-medium text-[#6B7280]">Factor Name</Label>
                            <Input
                              id={`factor-name-${factor.id}`}
                              placeholder="e.g., Strategic Alignment"
                              value={factor.factorName}
                              onChange={(e) => updateCustomFactor(factor.id, 'factorName', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`csv-column-${factor.id}`} className="text-[13px] font-medium text-[#6B7280]">CSV Column Name</Label>
                            <Input
                              id={`csv-column-${factor.id}`}
                              placeholder="e.g., Strategy Score"
                              value={factor.csvColumn}
                              onChange={(e) => updateCustomFactor(factor.id, 'csvColumn', e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`weight-${factor.id}`} className="text-[13px] font-medium text-[#6B7280]">Weight</Label>
                            <Input
                              id={`weight-${factor.id}`}
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="1.0"
                              value={factor.weight}
                              onChange={(e) => updateCustomFactor(factor.id, 'weight', parseFloat(e.target.value) || 1.0)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addCustomFactor}
                      className="w-full gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Another Factor
                    </Button>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="custom-normalize"
                        checked={customConfig.normalizeScores}
                        onCheckedChange={(checked) => setCustomConfig(prev => ({ ...prev, normalizeScores: checked as boolean }))}
                      />
                      <Label
                        htmlFor="custom-normalize"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Normalize scores if out of range
                      </Label>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">Output Types</h3>
                    <div className="space-y-3">
                      {CUSTOM_OUTPUT_TYPES.map((output) => (
                        <div key={output} className="flex items-start space-x-2">
                          <Checkbox
                            id={`custom-${output}`}
                            checked={customConfig.selectedOutputs.includes(output)}
                            onCheckedChange={() => toggleCustomOutput(output)}
                          />
                          <Label
                            htmlFor={`custom-${output}`}
                            className="text-sm font-normal cursor-pointer leading-tight"
                          >
                            {output}
                          </Label>
                        </div>
                      ))}
                    </div>

                    {customConfig.selectedOutputs.includes('Top N Items Summary') && (
                      <div className="ml-6 space-y-2">
                        <Label htmlFor="custom-top-n" className="text-[13px] font-medium text-[#6B7280]">Top N items</Label>
                        <Input
                          id="custom-top-n"
                          type="number"
                          min={1}
                          max={50}
                          value={customConfig.topNItems}
                          onChange={(e) => setCustomConfig(prev => ({ ...prev, topNItems: parseInt(e.target.value) || 10 }))}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              {/* Action Button */}
              <div className="space-y-2">
                <Button
                  onClick={handleCalculate}
                  disabled={isCalculating || !csvContent}
                  className="w-full"
                  size="lg"
                >
                  {isCalculating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Calculating scores...
                    </>
                  ) : (
                    getActionButtonLabel()
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRunAdvisorReview}
                  disabled={
                      !currentOutput ||
                      !currentArtifactId ||
                      isRunningAdvisor ||
                      advisorOutput.length > 0
                    }
                  className="w-full mt-3"
                  size="lg"
                >
                  {isRunningAdvisor ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running PM Advisor…
                    </>
                  ) : (
                    <>
                      <Lightbulb className="mr-2 h-4 w-4" />
                      Run PM Advisor Review
                    </>
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Upload CSV and select at least one output type
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Prioritization Results */}
        <div className="space-y-6 lg:col-span-1">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Prioritization Results</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'current' | 'advisor' | 'history')}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="current">Current Documentation</TabsTrigger>
                  <TabsTrigger value="advisor">Advisor Review</TabsTrigger>
                  <TabsTrigger value="history">Session History</TabsTrigger>
                </TabsList>

                {/* ================= CURRENT ================= */}
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
                      <p className="text-sm text-muted-foreground">
                        Upload a CSV and calculate prioritization to see results.
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* ================= ADVISOR ================= */}
                <TabsContent value="advisor" className="mt-4 space-y-4">
                  {advisorError && (
                    <div className="rounded-lg border border-destructive bg-destructive/5 p-4 text-sm text-destructive">
                      {advisorError}
                    </div>
                  )}

                  {advisorOutput ? (
                    <div className="prose prose-sm max-w-none rounded-lg border bg-muted/30 p-6 max-h-[600px] overflow-y-auto">
                      <ReactMarkdown>{advisorOutput}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                      <p className="text-sm text-muted-foreground">
                        Run PM Advisor Review to receive feedback.
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* ================= HISTORY ================= */}
                <TabsContent value="history" className="mt-4">
                  {isLoadingSessions ? (
                    <div className="flex min-h-[400px] items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="flex min-h-[400px] items-center justify-center rounded-lg border border-dashed">
                      <p className="text-sm text-muted-foreground">
                        No sessions yet. Calculate your first prioritization to get started.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-[600px] space-y-3 overflow-y-auto">
                      {sessions.map((session) => (
                        <Card
                          key={session.id}
                          className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
                          onClick={() => {
                            loadSession(session);
                            setActiveTab('current'); // 👈 CRITICAL
                          }}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(session.created_at)}
                                </p>

                                {session.metadata?.csv_row_count && (
                                  <Badge variant="secondary" className="text-xs">
                                    {session.metadata.csv_row_count} items
                                  </Badge>
                                )}
                              </div>

                              {session.artifact_name && (
                                <p className="font-medium text-sm">{session.artifact_name}</p>
                              )}

                              {session.metadata?.selected_outputs?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {session.metadata.selected_outputs.slice(0, 3).map((output) => (
                                    <Badge key={output} variant="outline" className="text-xs">
                                      {output}
                                    </Badge>
                                  ))}
                                  {session.input_data.selected_outputs.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{session.input_data.selected_outputs.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              )}
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