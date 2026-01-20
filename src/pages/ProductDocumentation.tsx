import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, CheckCircle2, Loader2, Lightbulb, Upload, X, FileText, AlertCircle } from 'lucide-react';
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
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import ReactMarkdown from 'react-markdown';
import { callPMAdvisorAgent, fetchContextArtifacts, saveAdvisorReview } from '@/lib/pm-advisor';
import { callAgentWithLogging, parseErrorMessage } from '@/lib/agent-logger';
import { ErrorDisplay } from '@/components/ErrorDisplay';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';

// Canonical internal output keys (DO NOT use labels for logic)
const OUTPUT_KEYS = {
  PRD: 'prd',
  EPICS: 'epics',
  EPIC_IMPACT: 'epic_impact',
  USER_STORIES: 'user_stories',
  ACCEPTANCE_CRITERIA: 'acceptance_criteria',
  OUT_OF_SCOPE: 'out_of_scope',
  RISKS: 'risks',
  DEPENDENCIES: 'dependencies',
  KPIS: 'kpis',
} as const;

type OutputKey = typeof OUTPUT_KEYS[keyof typeof OUTPUT_KEYS];

const OUTPUT_LABEL_TO_KEY: Record<string, OutputKey> = {
  'PRD (Product Requirements Document)': OUTPUT_KEYS.PRD,
  'PRD': OUTPUT_KEYS.PRD,

  'Epics': OUTPUT_KEYS.EPICS,

  'Epic Impact Statement': OUTPUT_KEYS.EPIC_IMPACT,
  'Epic Impact Statements': OUTPUT_KEYS.EPIC_IMPACT,

  'User Stories': OUTPUT_KEYS.USER_STORIES,

  'Acceptance Criteria': OUTPUT_KEYS.ACCEPTANCE_CRITERIA,

  'Out of Scope': OUTPUT_KEYS.OUT_OF_SCOPE,

  'Risks & Mitigations': OUTPUT_KEYS.RISKS,
  'Risks / Mitigations': OUTPUT_KEYS.RISKS,

  'Dependencies Mapping': OUTPUT_KEYS.DEPENDENCIES,
  'Dependency Mapping': OUTPUT_KEYS.DEPENDENCIES,

  'Success Metrics / KPIs Draft': OUTPUT_KEYS.KPIS,
  'Success Metrics / KPI Drafts': OUTPUT_KEYS.KPIS,
};

function getOutputKeyFromLabel(label: string): OutputKey | null {
  return OUTPUT_LABEL_TO_KEY[label] ?? null;
}


type InputSection =
  | 'problem'
  | 'goals'
  | 'requirements'
  | 'constraints'
  | 'enhancers';

const OUTPUT_TO_SECTIONS: Record<OutputKey, InputSection[]> = {
  [OUTPUT_KEYS.PRD]: ['problem', 'goals', 'requirements', 'constraints', 'enhancers'],
  [OUTPUT_KEYS.EPICS]: ['problem', 'goals', 'requirements'],
  [OUTPUT_KEYS.EPIC_IMPACT]: ['problem', 'goals'],
  [OUTPUT_KEYS.USER_STORIES]: ['requirements'],
  [OUTPUT_KEYS.ACCEPTANCE_CRITERIA]: ['requirements'],
  [OUTPUT_KEYS.OUT_OF_SCOPE]: ['constraints'],
  [OUTPUT_KEYS.RISKS]: ['constraints'],
  [OUTPUT_KEYS.DEPENDENCIES]: ['constraints'],
  [OUTPUT_KEYS.KPIS]: ['goals'],
};


const SECTION_REQUIRED_FIELDS: Record<InputSection, (keyof DocumentationFormData)[]> = {
  problem: ['problem_statement', 'target_user_persona'],
  goals: ['business_goals'],
  requirements: ['functional_requirements'],
  constraints: ['assumptions_constraints', 'dependencies'],
  enhancers: [], // always optional
};


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

// Input toggle
type InputMode = 'manual' | 'jira_csv';
type ParsedCSV = {
  headers: string[];
  rows: any[];
  rowCount: number;
};

type NormalizedJiraIssue = {
  key: string;
  issueType: string;
  summary: string;
  description: string;
  epicKey: string | null;
  parentKey: string | null;
  status: string;
  priority: string;
  assignee: string;
};

function getFirstString(row: Record<string, any>, candidates: string[]): string {
  for (const c of candidates) {
    const v = row?.[c];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function normalizeJiraRows(rows: any[]): NormalizedJiraIssue[] {
  return (rows || [])
    .map((r) => {
      const key = getFirstString(r, ['Issue key', 'Issue Key', 'Key', 'IssueKey']);
      const issueType = getFirstString(r, ['Issue Type', 'Issue type', 'Type']);
      const summary = getFirstString(r, ['Summary', 'Issue summary', 'Title']);
      const description = getFirstString(r, ['Description', 'Issue description', 'Details']);

      const epicKey =
        getFirstString(r, ['Epic Link', 'Epic Link (Key)', 'Epic key', 'Epic Key']) || null;

      const parentKey =
        getFirstString(r, ['Parent', 'Parent Key', 'Parent key', 'Parent issue']) || null;

      const status = getFirstString(r, ['Status', 'Issue status']);
      const priority = getFirstString(r, ['Priority']);
      const assignee = getFirstString(r, ['Assignee', 'Assignee Name']);

      return {
        key,
        issueType,
        summary,
        description,
        epicKey,
        parentKey,
        status,
        priority,
        assignee,
      };
    })
    .filter((i) => i.key || i.summary);
}

function buildEpicStoryModel(issues: NormalizedJiraIssue[]) {
  const epics = issues.filter((i) => i.issueType.toLowerCase() === 'epic');
  const epicsByKey = new Map(epics.map((e) => [e.key, e]));

  const stories = issues.filter((i) => {
    const t = i.issueType.toLowerCase();
    return t.includes('story') || t.includes('task') || t.includes('bug');
  });

  const storiesWithEpic = stories.map((s) => ({
    ...s,
    epicKey: s.epicKey || s.parentKey || null,
  }));

  const grouped: Record<string, NormalizedJiraIssue[]> = {};
  for (const s of storiesWithEpic) {
    if (!s.epicKey) continue;
    if (!grouped[s.epicKey]) grouped[s.epicKey] = [];
    grouped[s.epicKey].push(s);
  }

  return {
    epics: epics.map((e) => ({
      key: e.key,
      summary: e.summary,
      description: e.description,
      status: e.status,
    })),
    stories: storiesWithEpic.map((s) => ({
      key: s.key,
      issueType: s.issueType,
      summary: s.summary,
      description: s.description,
      epicKey: s.epicKey,
      status: s.status,
      priority: s.priority,
      assignee: s.assignee,
    })),
    storiesByEpicKey: grouped,
    epicKeysFoundInStories: Object.keys(grouped),
    epicKeysMissingFromExport: Object.keys(grouped).filter((k) => !epicsByKey.has(k)),
  };
}


export default function ProductDocumentation() {
  const navigate = useNavigate();
  const { activeProject } = useActiveProject();
  const [searchParams] = useSearchParams();
  const artifactIdFromUrl = searchParams.get('artifact');
  const [inputMode, setInputMode] = useState<InputMode>('manual');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleSaveEdits = async () => {
  if (!currentSessionId || !activeProject) {
    toast.error('No active artifact to save');
    return;
  }

  const nextVersion = currentArtifactVersion + 1;

  try {
    await supabaseFetch(`/project_artifacts?id=eq.${currentSessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        output_data: editableOutput,
        metadata: {
          version_number: nextVersion,
          last_modified_by: 'user',
          last_modified_at: new Date().toISOString(),
        },
      }),
    });

        if (!editingSheet) {
      toast.error('No active output sheet');
      return;
    }

    const updatedOutputs = {
      ...outputByType,
      [editingSheet]: editableOutput,
    };

    // ✅ Update tabbed outputs (this fixes editing)
    setOutputByType(updatedOutputs);

    // ✅ Keep full document in sync (advisor + legacy paths)
    setCurrentOutput(
      Object.values(updatedOutputs).join('\n\n')
    );

    setCurrentArtifactVersion(nextVersion);
    setLastModifiedBy('user');
    setEditingSheet(null);

    toast.success(`Saved version v${nextVersion}`);
    await loadSessionHistory();

  } catch (err) {
    console.error('Save failed:', err);
    toast.error('Failed to save changes');
  }
};

  // Editing + versioning state
const [editingSheet, setEditingSheet] = useState<string | null>(null);
const [editableOutput, setEditableOutput] = useState('');
type EditViewMode = 'edit' | 'preview';
const [editViewMode, setEditViewMode] = useState<EditViewMode>('edit');

const [currentArtifactVersion, setCurrentArtifactVersion] = useState<number>(1);
const [lastModifiedBy, setLastModifiedBy] = useState<'agent' | 'user'>('agent');


  // CSV upload state (for jira_csv mode)
const [csvFile, setCsvFile] = useState<File | null>(null);
const [csvData, setCsvData] = useState<string>('');
const [parsedCsv, setParsedCsv] = useState<ParsedCSV | null>(null);
const [isParsingCsv, setIsParsingCsv] = useState(false);
const [csvError, setCsvError] = useState<string | null>(null);
const [isDragging, setIsDragging] = useState(false);
const [outputByType, setOutputByType] = useState<Record<string, string>>({});
const [activeOutputSheet, setActiveOutputSheet] = useState<string>('');


const resetCsvState = () => {
  setCsvFile(null);
  setCsvData('');
  setParsedCsv(null);
  setCsvError(null);
  setIsParsingCsv(false);
  setIsDragging(false);
};

const handleCsvFileChange = (file: File | null) => {
  if (!file) {
    resetCsvState();
    return;
  }

  if (!file.name.toLowerCase().endsWith('.csv')) {
    setCsvError('Please upload a .csv file');
    toast.error('Please upload a .csv file');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    setCsvError('File too large (max 10MB)');
    toast.error('File too large (max 10MB)');
    return;
  }

  setCsvFile(file);
  setCsvData('');
  setParsedCsv(null);
  setCsvError(null);
  setIsParsingCsv(true);

  const reader = new FileReader();

  reader.onload = (e) => {
    const text = (e.target?.result as string) || '';
    setCsvData(text);

    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          const msg = results.errors[0].message;
          setCsvError(`CSV parsing error: ${msg}`);
          toast.error(`CSV parsing error: ${msg}`);
          setParsedCsv(null);
          setIsParsingCsv(false);
          return;
        }

       const headers = results.meta.fields || [];
      const rows = (results.data as any[]) || [];

      console.log('📎 CSV headers:', headers);
      console.log('📎 CSV sample rows:', rows.slice(0, 5));
        setParsedCsv({ headers, rows, rowCount: rows.length });
        setIsParsingCsv(false);

        toast.success(`CSV loaded: ${rows.length} rows`);
      },
      error: (err) => {
        setCsvError(`Failed to parse CSV: ${err.message}`);
        toast.error(`Failed to parse CSV: ${err.message}`);
        setParsedCsv(null);
        setIsParsingCsv(false);
      },
    });
  };

  

  reader.onerror = () => {
    setCsvError('Failed to read file');
    toast.error('Failed to read CSV file');
    setParsedCsv(null);
    setIsParsingCsv(false);
  };

  reader.readAsText(file);
};

const handleCsvFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) handleCsvFileChange(files[0]);
};

const clearCsvFile = () => handleCsvFileChange(null);

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
  if (files.length > 0) handleCsvFileChange(files[0]);
}, []);


  const [formData, setFormData] = useState<DocumentationFormData>({
    input_name: '',
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

  const [selectedOutputs, setSelectedOutputs] = useState<OutputKey[]>([]);
  const csvAllowed =
  selectedOutputs.length === 1 &&
  selectedOutputs.includes(OUTPUT_KEYS.USER_STORIES);


  const activeInputSections = Array.from(
    new Set(
      selectedOutputs.flatMap(
        (key) => OUTPUT_TO_SECTIONS[key] || []
      )
    )
  );

  const activeRequiredFields = Array.from(
    new Set(
      activeInputSections.flatMap(
        (section) => SECTION_REQUIRED_FIELDS[section] || []
      )
    )
  );

  const [currentOutput, setCurrentOutput] = useState<string>(''); // keep for backward compatibility / history
  const [currentOutputs, setCurrentOutputs] = useState<Record<string, string>>({});
  const [activeOutputName, setActiveOutputName] = useState<string>('');

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

  useEffect(() => {
  if (!artifactIdFromUrl || !activeProject) return;

  // Prevent double-loading if already selected
  if (currentSessionId === artifactIdFromUrl) return;

    void loadArtifactById(artifactIdFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifactIdFromUrl, activeProject]);

  useEffect(() => {
    if (!csvAllowed && inputMode === 'jira_csv') {
      switchToManualMode();
    }
  }, [csvAllowed, inputMode]);



  const artifactToDocumentationSession = (a: ProjectArtifactRow): DocumentationSession => {
    const input = (a.input_data ?? {}) as Record<string, any>;
    const metadata = (a.metadata ?? {}) as Record<string, any>;
    const version = metadata.version_number ?? 1;
    const modifiedBy = metadata.last_modified_by ?? 'agent';


    // The session model your UI expects. We derive it from input_data.
    return {
      id: a.id as any, // in case your DocumentationSession.id is typed as number; better to update it to string later
      created_at: a.created_at,

      input_name: input.input_name ?? '',
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
      version_number: version,
      last_modified_by: modifiedBy,
    } as any;
  };

  const loadSessionHistory = async () => {
    const loadArtifactById = async (artifactId: string) => {
  if (!activeProject) return;

  try {
    const artifacts = await supabaseFetch<ProjectArtifactRow[]>(
      `/project_artifacts?id=eq.${artifactId}&status=eq.active`
    );

    if (!artifacts || artifacts.length === 0) {
      toast.error('Artifact not found');
      return;
    }

    const session = artifactToDocumentationSession(artifacts[0]);
    loadSession(session);
  } catch (err) {
    console.error('Error loading artifact by ID:', err);
    toast.error('Failed to load documentation');
  }
};
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

  const loadArtifactById = async (artifactId: string) => {
  if (!activeProject) return;

  try {
    const rows = await supabaseFetch<ProjectArtifactRow[]>(
      `/project_artifacts?id=eq.${artifactId}` +
        `&project_id=eq.${activeProject.id}` +
        `&artifact_type=eq.product_documentation` +
        `&status=eq.active` +
        `&limit=1`
    );

    if (!rows || rows.length === 0) {
      toast.error('Artifact not found');
      return;
    }

    const session = artifactToDocumentationSession(rows[0]);

    // Load exactly like clicking from history
    loadSession(session);
  } catch (err) {
    console.error('Failed to load artifact by id:', err);
    toast.error('Failed to load documentation session');
  }
};


  const handleInputChange = (field: keyof DocumentationFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleOutput = (label: string) => {
    const key = getOutputKeyFromLabel(label);
    if (!key) return;

    setSelectedOutputs((prev) =>
      prev.includes(key) ? prev.filter((o) => o !== key) : [...prev, key]
    );
  };


function parseOutputsByMarker(raw: string): Record<string, string> {
  const lines = raw.split('\n');
  const sections: Record<string, string> = {};

  let currentName: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentName) sections[currentName] = buf.join('\n').trim();
    buf = [];
  };

  for (const line of lines) {
    const m = line.match(/^<!-- OUTPUT:\s*(.+?)\s*-->$/);
    if (m) {
      flush();
      currentName = m[1].trim();
      continue;
    }
    buf.push(line);
  }
  flush();

  return sections;
}
  const isFormValid = () => {
  if (!formData.input_name.trim() || selectedOutputs.length === 0) return false;

  if (inputMode === 'jira_csv') {
    return (
      !!parsedCsv &&
      parsedCsv.rows.length > 0 &&
      !csvError &&
      !isParsingCsv
    );
  }

  // manual mode
  return activeRequiredFields.every(
    (field) => formData[field]?.trim()
  );
};

const switchToManualMode = () => {
  // Switch mode
  setInputMode('manual');

  // 🔥 Clear CSV-related state
  resetCsvState();
};

const switchToCsvMode = () => {
  // Switch mode
  setInputMode('jira_csv');

  // 🔥 Clear manual-only required fields
  setFormData((prev) => ({
    ...prev,
    problem_statement: '',
    target_user_persona: '',
    business_goals: '',
    assumptions_constraints: '',
    functional_requirements: '',
    dependencies: '',
  }));
};


  const handleGenerate = async () => {
    setError(null);

    if (isGenerating) return;
    setIsGenerating(true);


    if (!isFormValid()) {
      const errorMsg = 'Please fill in all required fields and select at least one output type';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    if (inputMode === 'jira_csv' && isParsingCsv) {
      const msg = 'CSV is still being processed. Please wait and try again.';
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!activeProject) {
      const errorMsg = 'No active project selected';
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

  const basePayload = {
  project_id: activeProject.id,
  project_name: activeProject.name,
  artifact_name: formData.input_name.trim(),
  input_mode: inputMode,
  selected_outputs: selectedOutputs.map((key) => {
  switch (key) {
    case OUTPUT_KEYS.PRD: return 'PRD';
    case OUTPUT_KEYS.EPICS: return 'Epics';
    case OUTPUT_KEYS.EPIC_IMPACT: return 'Epic Impact Statements';
    case OUTPUT_KEYS.USER_STORIES: return 'User Stories';
    case OUTPUT_KEYS.ACCEPTANCE_CRITERIA: return 'Acceptance Criteria';
    case OUTPUT_KEYS.OUT_OF_SCOPE: return 'Out of Scope';
    case OUTPUT_KEYS.RISKS: return 'Risks / Mitigations';
    case OUTPUT_KEYS.DEPENDENCIES: return 'Dependency Mapping';
    case OUTPUT_KEYS.KPIS: return 'Success Metrics / KPI Drafts';
    default: return key;
  }
}),

};

const payload =
  inputMode === 'jira_csv'
    ? {
        ...basePayload,
        csv: {
          filename: csvFile?.name ?? null,
          row_count: parsedCsv?.rowCount ?? null,
          issues: normalizeJiraRows(parsedCsv?.rows ?? []).slice(0, 300),
          epic_model: buildEpicStoryModel(
            normalizeJiraRows(parsedCsv?.rows ?? [])
          ),
        },
      }
    : {
        ...basePayload,
        input: {
          problem_statement: formData.problem_statement,
          target_user_persona: formData.target_user_persona,
          business_goals: formData.business_goals,
          assumptions_constraints: formData.assumptions_constraints,
          functional_requirements: formData.functional_requirements,
          dependencies: formData.dependencies,
          non_functional_requirements: formData.non_functional_requirements || undefined,
          success_metrics: formData.success_metrics || undefined,
        },
      };



    console.log('🚀 [DocGen Payload] keys:', Object.keys(payload));
    console.log('🚀 [DocGen Payload]', {
      input_mode: payload.input_mode,
      has_csv: !!(payload as any).csv,
      csv_rows: (payload as any).csv?.issues?.length ?? 0,
    });


    setIsGenerating(true);
    console.log('👤 [User Action] Clicked "Generate Documentation" button');
    console.log('📝 [Input Data]', {
      problem_statement: formData.problem_statement.substring(0, 100) + '...',
      selectedOutputs,
      projectId: activeProject.id,
    });

console.log('🧪 payload.selected_outputs', payload.selected_outputs);
const hasCsvInputFrontend =
  !!csvData ||
  (Array.isArray(parsedCsv?.rows) && parsedCsv.rows.length > 0);

console.log('🧪 hasCsvInput (frontend)', hasCsvInputFrontend);

    try {
      const result = await callAgentWithLogging(
        'Product Documentation',
        'product-documentation',
        payload,
        async () => {
          const { data, error } = await supabase.functions.invoke(
            'product-documentation',
            { body: payload }
          );

          if (error) throw error;
          return data;
        }
      );

      console.log('✨ [Success] Received AI-generated documentation', {
        outputLength: result.output.length,
      });

      // Save to project_artifacts
      const artifactName = formData.input_name.trim();

      const saved = await supabaseFetch<ProjectArtifactRow[]>('/project_artifacts', {
        method: 'POST',
        body: JSON.stringify({
          project_id: activeProject.id,
          project_name: activeProject.name,
          artifact_type: 'product_documentation',
          artifact_name: artifactName,
          input_data:
            inputMode === 'jira_csv'
              ? {
                  input_name: formData.input_name,
                  input_mode: 'jira_csv',
                  selected_outputs: selectedOutputs,
                  csv: {
                    filename: csvFile?.name ?? null,
                    row_count: parsedCsv?.rowCount ?? null,
                  },
                }
              : {
                  input_name: formData.input_name,
                  input_mode: 'manual',
                  selected_outputs: selectedOutputs,
                  input: { ...formData },
                },
          output_data: result.output,
          metadata: { module_type: 'product_documentation' },
          status: 'active',
        }),
      });

      // Sync outputs
      setCurrentOutput(result.output);

      const parsed = parseOutputsByMarker(result.output);
      const sheetMap =
        Object.keys(parsed).length > 0
          ? parsed
          : { [selectedOutputs[0] || 'Output']: result.output };

      setOutputByType(sheetMap);
      setActiveOutputSheet(Object.keys(sheetMap)[0] || '');

      setAdvisorOutput('');

      if (saved?.length) {
        setCurrentSessionId(saved[0].id);
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

      const outputToReview =
  (activeOutputSheet && outputByType[activeOutputSheet])
    ? outputByType[activeOutputSheet]
    : currentOutput;

      const advisorPayload = {
        artifact_output: outputToReview,
        module_type: 'product_documentation',
        project_id: activeProject.id,
        project_name: activeProject.name,
        source_session_table: 'project_artifacts',
        source_session_id: currentSessionId,
        artifact_type: activeOutputSheet || 'Product Documentation',
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

  const [isOutputsCollapsed, setIsOutputsCollapsed] = useState(false);
  const [isInputsCollapsed, setIsInputsCollapsed] = useState(false);
  const gridTemplateColumns = `
  ${isOutputsCollapsed ? '56px' : '300px'}
  ${isInputsCollapsed ? '56px' : '360px'}
  1fr
`;



  const loadSession = (session: DocumentationSession) => {
    setFormData({
      input_name: session.input_name,
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
    
    const output = (session as any).output || session.output || '';

    setCurrentOutput(output);
    const parsed = parseOutputsByMarker(output);
    setOutputByType(
      Object.keys(parsed).length > 0
        ? parsed
        : { Document: output }
    );
    setActiveOutputSheet(Object.keys(parsed)[0] || 'Document');

    setEditableOutput(output);
    setCurrentSessionId((session as any).id?.toString?.() ?? (session as any).id ?? null);

    // Versioning (safe defaults)
    setCurrentArtifactVersion((session as any).version_number ?? 1);
    setLastModifiedBy((session as any).last_modified_by ?? 'agent');

    setEditingSheet(null);

    setAdvisorOutput('');
    toast.success('Session loaded');
  };


  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="border-b border-[#E5E7EB] bg-white shadow-sm">
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
                <h1 className="text-xl font-semibold text-[#111827]">Product Documentation Generator</h1>
                <p className="text-sm text-[#6B7280]">Generate comprehensive product documentation based on your requirements</p>
              </div>
            </div>
          </div>
      </div>

      {/* Main Content */}
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns }}
          >

          {/* Column 1 - Output Selection */}
            <div className="h-[calc(100vh-180px)]">
              {isOutputsCollapsed ? (
                <div className="h-full flex flex-col items-center pt-3 border rounded-xl bg-muted/30">
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
                      What to Generate
                    </span>
                </div>
              ) : (
                <Card className="h-full">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <CardTitle className="text-base">Outputs</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsOutputsCollapsed(true)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="h-[calc(100%-56px)] overflow-hidden">
                  <div className="space-y-3">
                    {OUTPUT_TYPES
                      .filter((o) => o !== 'Release Notes Draft') 
                      .map((output) => {
                        return (
                          <div
                            key={output}
                            className="rounded-lg border border-[#E5E7EB] p-3 transition-colors hover:bg-[#F9FAFB]"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start space-x-3">
                                <Checkbox
                                  id={output}
                                  checked={(() => {
                                    const key = getOutputKeyFromLabel(output);
                                    return key ? selectedOutputs.includes(key) : false;
                                  })()}
                                  onCheckedChange={() => toggleOutput(output)}
                                />
                                <div>
                                  <Label
                                    htmlFor={output}
                                    className="cursor-pointer text-sm font-medium leading-tight text-[#111827]"
                                  >
                                    {output}
                                  </Label>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* CSV guidance callout */}
                  {inputMode === 'jira_csv' && (
                    <div className="mt-4 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                      <p className="text-xs font-medium text-[#111827]">CSV tip</p>
                      <p className="mt-1 text-xs text-[#6B7280]">
                        Jira CSV works best for <span className="font-medium">User Stories</span> (and also helps with Acceptance Criteria,
                        Dependencies, Risks, and Scope). For <span className="font-medium">PRD</span> and <span className="font-medium">Epics</span>,
                        use Manual Entry.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
              )
            }
           </div>

          {/* Column 2 - Input Form */}
          <div className="h-[calc(100vh-180px)]">
            {isInputsCollapsed ? (
              /* =========================
                COLLAPSED STATE
                ========================= */
              <div className="h-full flex flex-col items-center pt-3 border rounded-xl bg-muted/30">
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
              /* =========================
                EXPANDED STATE
                ========================= */
              <Card className="h-full flex flex-col">
                {/* HEADER */}
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="text-base">
                      Product Information
                    </CardTitle>
                    <CardDescription className="text-sm text-[#6B7280]">
                      Fill in the details about your product. Fields marked with * are required.
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

                {/* BODY */}
                <CardContent className="flex-1 overflow-hidden">
                  <ScrollArea className="h-full px-1">

                    {selectedOutputs.length === 0 ? (
                      <div className="flex h-[300px] items-center justify-center border-2 border-dashed border-[#E5E7EB] rounded-lg">
                        <div className="text-center text-[#9CA3AF] px-4">
                          <p className="text-sm font-medium">Select an output</p>
                          <p className="mt-1 text-xs">
                            Inputs will appear here once you choose what to generate.
                          </p>
                        </div>
                      </div>
                    ) : (
                        <>
                      {/* INPUT MODE TOGGLE */}
                      {csvAllowed && (
                        <div className="mb-6">
                          <Label className="text-[13px] font-medium text-[#6B7280] mb-2 block">
                            Source Information
                          </Label>

                          <div className="flex rounded-lg border border-[#E5E7EB] overflow-hidden">
                            <button
                              type="button"
                              onClick={switchToManualMode}
                              className={`flex-1 px-4 py-2 text-sm font-medium ${
                                inputMode === 'manual'
                                  ? 'bg-[#3B82F6] text-white'
                                  : 'bg-white text-[#374151]'
                              }`}
                            >
                              Manual Entry
                            </button>

                            <button
                              type="button"
                              onClick={switchToCsvMode}
                              className={`flex-1 px-4 py-2 text-sm font-medium ${
                                inputMode === 'jira_csv'
                                  ? 'bg-[#3B82F6] text-white'
                                  : 'bg-white text-[#374151]'
                              }`}
                            >
                              Upload CSV
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ARTIFACT NAME */}
                      <div className="mb-6">
                        <Label htmlFor="input_name">
                          Artifact Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="input_name"
                          value={formData.input_name}
                          onChange={(e) =>
                            handleInputChange('input_name', e.target.value)
                          }
                        />
                      </div>

                      {/* MANUAL MODE */}
                      {inputMode === 'manual' && (
                        <>
                        {activeInputSections.includes('problem') && (
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
                          )}
                    {/* Section 2: Goals & Context */}
                    {activeInputSections.includes('goals') && (
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
                    )}

                    {/* Section 3: Requirements */}
                    {activeInputSections.includes('requirements') && (
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
                    )}

                    {/* Section 4: Constraints & Dependencies */}
                    {activeInputSections.includes('constraints') && (
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
                        )}

                    {/* Section 5: Optional Enhancers */}
                    {activeInputSections.includes('enhancers') && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-[#F9F4FB] p-3 text-left font-semibold text-[#111827] hover:bg-[#F3F4F6] transition-colors">
                          Optional Enhancers
                        </CollapsibleTrigger>

                        <CollapsibleContent className="mt-3 space-y-4">
                          <div>
                            <Label
                              htmlFor="target_timeline"
                              className="text-[13px] font-medium text-[#6B7280]"
                            >
                              Target Release Timeline
                            </Label>
                            <Input
                              id="target_timeline"
                              value={formData.target_timeline}
                              onChange={(e) =>
                                handleInputChange('target_timeline', e.target.value)
                              }
                              placeholder="e.g., Q2 2024"
                              className="mt-1.5"
                            />
                          </div>
                          <div>
                            <Label
                              htmlFor="epic_impact"
                              className="text-[13px] font-medium text-[#6B7280]"
                            >
                              Epic Impact Statement
                            </Label>
                            <Textarea
                              id="epic_impact"
                              value={formData.epic_impact}
                              onChange={(e) =>
                                handleInputChange('epic_impact', e.target.value)
                              }
                              placeholder="High-level impact statement for this epic"
                              className="mt-1.5"
                              rows={3}
                            />
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                      )}
                  </>
                  )}
                      {/* Upload box */}
                      <div
                        className={`relative rounded-lg border-2 border-dashed p-6 transition-colors ${
                          isDragging
                            ? 'border-[#3B82F6] bg-[#3B82F6]/5'
                            : csvError
                            ? 'border-red-400 bg-red-50'
                            : csvFile
                            ? 'border-[#3B82F6] bg-[#3B82F6]/5'
                            : 'border-[#E5E7EB] hover:border-[#D1D5DB]'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        {!csvFile ? (
                          <>
                            <input
                              type="file"
                              accept=".csv"
                              onChange={handleCsvFileInputChange}
                              className="absolute inset-0 cursor-pointer opacity-0"
                            />
                            <div className="flex flex-col items-center justify-center text-center gap-2">
                              <Upload className="h-10 w-10 text-[#6B7280]" />
                              <p className="text-sm font-medium text-[#111827]">Drop CSV here</p>
                              <p className="text-xs text-[#6B7280]">or click to browse</p>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-5 w-5 text-[#3B82F6]" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[#111827] truncate">{csvFile.name}</p>
                                <p className="text-xs text-[#6B7280]">
                                  {isParsingCsv
                                    ? 'Parsing CSV…'
                                    : parsedCsv
                                    ? `${parsedCsv.rowCount} rows loaded`
                                    : 'Ready'}
                                </p>
                              </div>
                            </div>

                            {/* IMPORTANT: This button does NOT reopen file dialog */}
                            <button
                              type="button"
                              onClick={clearCsvFile}
                              className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-800"
                              disabled={isParsingCsv}
                            >
                              <X className="h-4 w-4" />
                              Remove
                            </button>
                          </div>
                        )}
                      </div>

                      {csvError && (
                        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
                          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                          <p className="text-xs text-red-700">{csvError}</p>
                        </div>
                      )}

                      {/* Tiny preview */}
                      {parsedCsv && parsedCsv.headers?.length > 0 && (
                        <div className="rounded-md border border-[#E5E7EB] bg-white p-3">
                          <p className="text-xs font-medium text-[#111827] mb-2">Detected columns</p>
                          <p className="text-xs text-[#6B7280]">
                            {parsedCsv.headers.slice(0, 8).join(', ')}
                            {parsedCsv.headers.length > 8 ? '…' : ''}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  </ScrollArea>
                </CardContent>
              

                  {/* Sticky footer */}
                        <div className="border-t border-[#E5E7EB] p-4">
                          <Button
                            className="w-full"
                            size="lg"
                            onClick={handleGenerate}
                            disabled={!isFormValid() || isGenerating}
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating…
                              </>
                            ) : (
                              'Generate Documentation'
                            )}
                          </Button>

                          {!isFormValid() && (
                            <p className="mt-2 text-center text-xs text-[#9CA3AF]">
                              {selectedOutputs.length === 0
                                ? 'Select at least one output'
                                : 'Complete required inputs'}
                            </p>
                          )}
                        </div>
                      </Card>
                    )}
                  </div>

          {/* Column 3 - Results Display */}
          <div className="h-[calc(100vh-180px)]">
            <Card className="h-[calc(100vh-180px)]">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg font-semibold text-[#111827]">
                    Documentation
                  </CardTitle>

                  <Badge variant="secondary">
                    v{currentArtifactVersion} · {lastModifiedBy === 'user' ? 'Edited' : 'Generated'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="current" className="h-full">
                  <TabsList className="grid w-full grid-cols-3 bg-transparent border-b border-[#E5E7EB] rounded-none h-auto p-0">
                    <TabsTrigger value="current">Current Documentation</TabsTrigger>
                    <TabsTrigger value="advisor">Advisor Review</TabsTrigger>
                    <TabsTrigger value="history">Session History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="current" className="mt-4">
                  {Object.keys(outputByType || {}).length > 0 ? (
                    <div className="space-y-4">
                      {/* Output Sheets Tabs */}
                      <Tabs
                        value={activeOutputSheet || Object.keys(outputByType)[0]}
                        onValueChange={setActiveOutputSheet}
                      >
                        <TabsList className="flex flex-wrap justify-start gap-2 bg-transparent p-0">
                          {Object.keys(outputByType).map((key) => (
                            <TabsTrigger key={key} value={key}>
                              {key}
                            </TabsTrigger>
                          ))}
                        </TabsList>

                        {Object.entries(outputByType).map(([key, md]) => (
                          <TabsContent key={key} value={key} className="mt-4">
                            <div className="flex justify-end gap-2">
                              {editingSheet !== key? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setEditableOutput(md);
                                      setEditingSheet(key);
                                      setEditViewMode('edit');
                                    }}
                                  >
                                    Edit
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigator.clipboard.writeText(md)}
                                  >
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy {key}
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
                                  if (editingSheet) {
                                    setEditableOutput(outputByType[editingSheet] || '');
                                  }
                                  setEditingSheet(null);
                                  setEditViewMode('edit');
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                              )}
                            </div>
                            <ScrollArea className="h-[calc(100vh-420px)]">
                              <div className="prose prose-sm max-w-none pr-4 dark:prose-invert">
                                {editingSheet === key ? (
                                  editViewMode === 'edit' ? (
                                    <Textarea
                                      value={editableOutput}
                                      onChange={(e) => setEditableOutput(e.target.value)}
                                      className="min-h-[500px] w-full font-mono text-sm border-[#E5E7EB]"
                                    />
                                  ) : (
                                    <ReactMarkdown>{editableOutput}</ReactMarkdown>
                                  )
                                ) : (
                                  <ReactMarkdown>{md}</ReactMarkdown>
                                )}
                              </div>
                            </ScrollArea>
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  ) : currentOutput ? (
                    // Backward compatibility: if you still have only a single string output
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
