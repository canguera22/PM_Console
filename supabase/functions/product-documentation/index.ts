import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type OutputKey =
  | 'prd'
  | 'epics'
  | 'epic_impact'
  | 'user_stories'
  | 'acceptance_criteria'
  | 'out_of_scope'
  | 'risks'
  | 'dependencies'
  | 'kpis';

function normalizeOutputName(o: string): OutputKey {
  const key = o.trim().toLowerCase();

  const map: Record<string, OutputKey> = {
    prd: 'prd',
    epics: 'epics',
    epic_impact: 'epic_impact',
    'epic impact': 'epic_impact',

    user_stories: 'user_stories',
    'user stories': 'user_stories',

    acceptance_criteria: 'acceptance_criteria',
    'acceptance criteria': 'acceptance_criteria',

    out_of_scope: 'out_of_scope',
    'out of scope': 'out_of_scope',

    risks: 'risks',
    'risks / mitigations': 'risks',

    dependencies: 'dependencies',
    'dependency mapping': 'dependencies',

    kpis: 'kpis',
    'success metrics / kpi drafts': 'kpis',
  };

  if (!map[key]) {
    throw new Error(`Unknown output type received: "${o}"`);
  }

  return map[key];
}




const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


/**
 * SYSTEM PROMPT (Refined)
 * Goal: Force “build-ready” specs, avoid hallucinations, require explicit workflows/contracts/errors.
 */
const SYSTEM_PROMPT = `You are a Senior Product Lead + Technical Program Manager. Your output must be IMPLEMENTATION-READY.

Your job:
- Produce build-ready PRDs and/or other requested artifacts with explicit workflows, data contracts, API boundaries, error states, and acceptance criteria.
- Do not write generic product fluff. Be specific, deterministic, and actionable.
- If information is missing, DO NOT invent it. Instead:
  1) Add a "Missing Inputs" section listing what’s missing,
  2) Provide a "Reasonable Assumptions" section (clearly labeled),
  3) Add an "Open Questions" section.

Important constraints:
- Output must be in Markdown.
- Use concrete structures: tables, checklists, numbered flows.
- When you specify requirements, include acceptance criteria that a developer can test.
- Always include (when generating a PRD): Core User Flows, Data Model/Contracts, Integration Points, Failure Modes & Error UX, and an MVP scope boundary.

Architecture context you must assume unless overridden:
- Frontend: React (Vite) calling Supabase Edge Functions.
- Persistence: Postgres via Supabase.
- Central artifact storage: project_artifacts table, keyed by project_id (UUID).
- Artifact output is saved to project_artifacts with input_data/output_data/metadata.

INPUT MODES (CRITICAL):
The user may provide inputs via either:
A) manual text fields, OR
B) a Jira CSV upload represented as raw CSV text (csv_data) plus optional metadata like csv_filename and csv_row_count.

When csv_data is present:
- Treat the CSV as a SOURCE OF TRUTH for scope, tickets, and wording.
- Do NOT assume fields that are not present in the CSV.
- You may infer structure (e.g., Epic → Story → Task) ONLY if the CSV contains columns that support it (e.g., Issue Type, Parent, Epic Link, Summary).
- If the CSV lacks key fields required to generate a strong PRD, add them under Missing Inputs / Open Questions.

CSV HANDLING RULES:
1) Start by identifying likely Jira columns (e.g., Issue Key, Issue Type, Summary, Description, Status, Priority, Epic Name, Epic Link, Parent, Labels, Components, Assignee).
2) Produce a short "CSV Interpretation" section that includes:
   - Which columns were detected / used
   - How you interpreted hierarchy (Epics vs Stories)
   - Any filtering you applied (e.g., excluding Done, excluding Sub-tasks) — if you filtered, state it explicitly
3) Convert the CSV into structured requirements:
   - If epics exist: summarize epics, then list stories underneath each epic
   - If no hierarchy exists: group items by labels/components or by inferred themes from Summary/Description (clearly label as inferred)
4) For each epic/story you include, provide:
   - Brief intent (1–2 sentences)
   - Explicit acceptance criteria (Given/When/Then or bullet list)
   - Dependencies/assumptions (only if supported by CSV or clearly labeled as assumptions)
5) Be conservative: if Description is missing, do not fabricate detailed behavior—use Open Questions.
6) Treat epics as the source of truth
7) Generate and break off stories per epic
8) Do not describe CSV upload/import unless an epic is explicitly about that.


Mandatory PRD Sections (always include these headings in this order) IF a PRD is requested:
1) Overview
2) Problem Statement
3) Goals (measurable)
4) Non-Goals / Out of Scope
5) Personas & Primary Use Cases
6) Core User Flows (step-by-step)
7) Functional Requirements (grouped by capability, each with acceptance criteria)
8) Non-Functional Requirements (latency, reliability, security posture, audit/logging)
9) Data Model & Contracts (tables + required fields + enums)
10) Integration Points (Edge Functions, payload contracts, expected responses)
11) Error Handling & Observability (UI states + logging + how to debug)
12) MVP Cutline (what’s in v1 vs later)
13) Epics & User Stories (INVEST style where possible)
14) Risks & Mitigations
15) Open Questions

Additional required sections WHEN csv_data is present and a PRD is requested:
- Insert "CSV Interpretation" immediately after "Provided Inputs" (or after Overview if no Provided Inputs section exists).
- Insert "CSV-Derived Scope" immediately before "Functional Requirements".

When output types are requested (e.g., PRD, Epics, User Stories), generate ONLY those.
- If ONLY "User Stories" is requested: DO NOT output PRD sections, Missing Inputs, Reasonable Assumptions, or Open Questions. Just stories in the required format.
- For "User Stories": Use Epic → Stories structure, and do not invent features not supported by inputs.

Formatting rules:
- Prefer tables for data contracts and mapping.
- Make outputs copy/paste friendly for Confluence/Jira/Linear.
`;

type SourceMode = 'manual_only' | 'csv_only' | 'either';

const OUTPUT_SPECS: Record<OutputKey, {
  source: SourceMode;
  purpose: string;
  format: string;
  rules: string[];
}> = {
  prd: {
    source: 'manual_only',
    purpose: 'Implementation-ready PRD. DO NOT use CSV as source-of-truth for PRD content.',
    format: `
## Required Sections (in order)
1) Overview
2) Problem Statement
3) Goals (measurable)
4) Non-Goals / Out of Scope
5) Personas & Primary Use Cases
6) Core User Flows (step-by-step)
7) Functional Requirements (grouped by capability, each with acceptance criteria)
8) Non-Functional Requirements (latency, reliability, security posture, audit/logging)
9) Data Model & Contracts (tables + required fields + enums)
10) Integration Points (Edge Functions, payload contracts, expected responses)
11) Error Handling & Observability (UI states + logging + how to debug)
12) MVP Cutline
13) Epics & User Stories (traceable to requirements)
14) Risks & Mitigations
15) Open Questions
`.trim(),
    rules: [
      'Be specific, deterministic, testable.',
      'Do not invent missing info. Use Missing Inputs + Assumptions + Open Questions.'
    ]
  },

  epics: {
    source: 'manual_only',
    purpose: 'High-quality epics derived from manual inputs only.',
    format: `
## Output Format
- 4–10 epics
- Each epic includes: Title, 2-4 sentence intent, In/Out, and 2–8 acceptance bullets
`.trim(),
    rules: [
      'Do not use CSV as the primary source for epics.',
      'No generic filler; make epics actionable.'
    ]
  },

  epic_impact: {
    source: 'either',
    purpose: 'Concise “why it matters” statements per epic.',
    format: `
## Output Format
For each epic:
- Epic: <title>
- Impact Statement: 1–2 sentences (business + user impact)
- KPI it should move: 1–3 bullets
`.trim(),
    rules: [
      'Tie impact to actual epic text; don’t invent big new scope.'
    ]
  },

  user_stories: {
  source: 'either',
  purpose: 'INVEST user stories grouped under epics. Output must be structured for direct use in Jira/Linear.',
  format: `
## REQUIRED STRUCTURE (STRICT — FOLLOW EXACTLY)

For EACH epic, use the following structure:

## Epic: <Epic Name>
**Priority:** <High | Medium | Low>
**Tags:** <comma-separated list>

**Intent:**  
<1–2 sentence description of why this epic exists and what outcome it drives>

---

For EACH story under the epic:

### Story: <Short, descriptive story title>

**User Story**  
As a <persona>, I want <capability>, so that <benefit>.

**Acceptance Criteria**

- **Given** <context>  
  **When** <action>  
  **Then** <expected result>

- **Given** <context>  
  **When** <action>  
  **Then** <expected result>

---

### IMPORTANT FORMATTING RULES
- Use Markdown headings exactly as specified (## for Epics, ### for Stories)
- Always include a blank line between Epics and Stories
- Acceptance Criteria MUST be bullet points using Given / When / Then
- "Acceptance Criteria" MUST be on its own line
- There MUST be a blank line before "**Acceptance Criteria**"
- There MUST be a blank line after "**Acceptance Criteria**"
- Acceptance Criteria MUST be expressed as bullet points
- Do NOT inline Acceptance Criteria with the User Story paragraph
- Do NOT merge multiple stories into one block
- Do NOT include any text before the first Epic
`,
  rules: [
    'Stories must be traceable to provided inputs (epics, document, or CSV).',
    'Do not invent scope, features, or personas.',
    'If details are missing, write conservative acceptance criteria.',
    'Optimize for clarity, scannability, and copy/paste into Jira.'
  ]
},


  acceptance_criteria: {
    source: 'either',
    purpose: 'Acceptance criteria packs per epic/story.',
    format: `
## Output Format
For each epic/story:
- Item: <name>
- Acceptance Criteria (Given/When/Then)
- Negative cases
`.trim(),
    rules: [
      'Include edge cases and validation failures.'
    ]
  },

  out_of_scope: {
    source: 'either',
    purpose: 'Clear non-goals based on scope.',
    format: `
## Output Format
- 8–15 bullets grouped by theme
`.trim(),
    rules: ['Do not invent exclusions.']
  },

  risks: {
    source: 'either',
    purpose: 'Risks driven by actual scope.',
    format: `
## Output Format
| Risk | Likelihood | Impact | Signal | Mitigation |
`.trim(),
    rules: ['Concrete risks only.']
  },

  dependencies: {
    source: 'either',
    purpose: 'Dependencies across teams/systems.',
    format: `
## Output Format
| Item | Depends On | Owner | Risk |
`.trim(),
    rules: ['Include internal and external dependencies.']
  },

  kpis: {
    source: 'either',
    purpose: 'Metrics tied to goals and epics.',
    format: `
## Output Format
| Metric | Definition | Target |
`.trim(),
    rules: ['No vanity metrics.']
  },
};



/**
 * Helper: build missing inputs list (for better PRDs even with partial inputs)
 */
function buildMissingInputs(payload: Record<string, unknown>): string[] {
  const missing: string[] = [];

  // These are typically "required" in your UI, but we handle missing gracefully
  const requiredish = [
  { key: 'problem_statement', label: 'Problem Statement (required for PRD)' },
  { key: 'target_user_persona', label: 'Target User Persona' },
  { key: 'business_goals', label: 'Business Goals' },
  { key: 'assumptions_constraints', label: 'Assumptions & Constraints' },
  { key: 'functional_requirements', label: 'Functional Requirements' },
  { key: 'dependencies', label: 'Dependencies' },
];


  for (const item of requiredish) {
    const value = payload[item.key];
    if (item.key === 'selected_outputs') {
      if (!Array.isArray(value) || value.length === 0) missing.push(item.label);
    } else if (isBlank(value)) {
      // allow project_name to be missing but still report
      missing.push(item.label);
    }
  }

  return missing;
}

// -----------------------------
// Canonical "epics" extraction (SOURCE OF TRUTH)
// Prefer body.epics if provided; else derive from CSV rows
// -----------------------------
const normalize = (v: any) => (v === null || v === undefined ? '' : String(v)).trim();

const issueTypeKey = (row: any) =>
  normalize(row['Issue Type'] ?? row['IssueType'] ?? row['Type'] ?? row['type']);

const isEpicRow = (row: any) => /epic/i.test(issueTypeKey(row));

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

serve(async (req) => {
  const startTime = Date.now();
  console.log('📥 [Edge Function] Received request to product-documentation');
  console.log('⏰ [Timestamp]', new Date().toISOString());

  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const body = await req.json();
    // 🔁 Normalize frontend payload shape
    if (body.input) {
      Object.assign(body, body.input);
    }

    if (body.csv?.issues && !body.jira_issues) {
      body.jira_issues = body.csv.issues;
    }

    if (body.artifact_name && !body.input_name) {
      body.input_name = body.artifact_name;
    }


    // -----------------------------
// CSV detection (supports multiple frontend keys)
// -----------------------------
const jiraIssues =
  body?.jira_issues_normalized ??
  body?.jira_issues ??
  body?.parsedCsv ??
  body?.parsed_csv ??
  body?.csv_rows ??
  body?.jiraIssues ??
  null;

const jiraCsvText =
  body?.jira_csv_text ??
  body?.csv_data ??
  body?.csvText ??
  body?.csv_text ??
  null;

const hasCsvIssues = Array.isArray(jiraIssues) && jiraIssues.length > 0;
const hasCsvText =
  typeof jiraCsvText === 'string' &&
  jiraCsvText.split('\n').length > 1 &&
  jiraCsvText.includes(',');
const hasCsvInput = hasCsvIssues || hasCsvText;

// -----------------------------
// Normalize requested outputs
// -----------------------------
const requestedOutputs: OutputKey[] = Array.isArray(body.selected_outputs)
  ? body.selected_outputs.map(normalizeOutputName)
  : [];

const wantsPRD = requestedOutputs.includes('prd');
const wantsUserStories = requestedOutputs.includes('user_stories');

// CSV-only User Stories mode
const csvOnlyUserStories =
  hasCsvInput &&
  requestedOutputs.length === 1 &&
  wantsUserStories;

// 🚫 Absolute rule: PRD can NEVER be generated from CSV
if (hasCsvInput && wantsPRD) {
  return new Response(
    JSON.stringify({
      error: 'Invalid output selection',
      details:
        'PRD generation requires manual inputs. CSV is only supported for User Stories, Acceptance Criteria, Scope, Risks, and Dependencies.',
    }),
    { status: 400, headers: corsHeaders }
  );
}


  const epics = Array.isArray(body?.epics) && body.epics.length > 0
    ? body.epics
    : hasCsvIssues
    ? (jiraIssues as any[])
        .filter(isEpicRow)
        .map((r: any) => ({
          title: normalize(r['Epic Name'] ?? r['Epic Summary'] ?? r['Summary'] ?? r['Epic'] ?? ''),
          summary: normalize(r['Description'] ?? r['Epic Description'] ?? ''),
          priority: normalize(r['Priority'] ?? ''),
          tags: normalize(r['Labels'] ?? r['Components'] ?? ''),
          // optional: keep key for traceability
          key: normalize(r['Issue key'] ?? r['Issue Key'] ?? r['Key'] ?? ''),
        }))
        .filter((e: any) => e.title.length > 0)
    : [];


const hasEpics = Array.isArray(epics) && epics.length > 0;

    // 🔁 Normalize CSV payload from frontend
    if (!body.jira_issues && Array.isArray(body.jira_issues_normalized)) {
      body.jira_issues = body.jira_issues_normalized;
    }

    if (!body.epics && body.epic_story_model?.epics) {
      body.epics = body.epic_story_model.epics;
    }


console.log('🧪 RAW BODY KEYS', Object.keys(body || {}));
console.log('🧪 BODY SAMPLE', JSON.stringify(body, null, 2).slice(0, 2000));


    const {
      problem_statement,
      target_user_persona,
      business_goals,
      assumptions_constraints,
      functional_requirements,
      dependencies,
      non_functional_requirements,
      user_pain_points,
      competitive_context,
      technical_constraints,
      success_metrics,
      target_timeline,
      epic_impact,
      selected_outputs,
      project_id,
      project_name,
      input_name,
    } = body;

    const artifact_name =
      body?.input_name ??
      body?.artifact_name ??
      null;

const resolvedInputName =
  input_name ??
  artifact_name ??
  (hasCsvInput ? 'CSV Upload' : 'Manual Input');

  // =====================================================
// NEW: Fetch project context documents (read-only)
// =====================================================
let projectContextText = '';

try {
  const { data: docs, error: docsError } = await supabase
    .from('project_documents')
    .select('name, extracted_text')
    .eq('project_id', project_id)
    .eq('status', 'active')
    .not('extracted_text', 'is', null);

  if (docsError) {
    console.warn('⚠️ Failed to fetch project documents', docsError);
  } else if (docs && docs.length > 0) {
    projectContextText =
      `\n\nPROJECT CONTEXT DOCUMENTS (REFERENCE ONLY — DO NOT INVENT SCOPE):\n` +
      docs
        .map(
          (d) =>
            `\n---\nDocument: ${d.name}\n${d.extracted_text}`
        )
        .join('\n');
  }
} catch (err) {
  console.warn('⚠️ Project document fetch error', err);
}

if (isBlank(resolvedInputName)) {
  return new Response(
    JSON.stringify({
      error: 'Missing input_name',
      details: 'Unable to infer input_name from request.',
    }),
    { status: 400, headers: corsHeaders }
  );
}
    
    // 🚨 CSV-only short-circuit (NO manual validation allowed)
      if (hasCsvInput && wantsUserStories && !wantsPRD) {
        console.log('✅ CSV-only User Stories mode — skipping manual input validation');
      }

        // 🚫 PRD requires manual input
    
    if (
      wantsPRD &&
      !hasCsvInput &&
      !csvOnlyUserStories &&
      isBlank(problem_statement)
    ) {
      return new Response(
        JSON.stringify({
          error: 'Missing problem statement',
          details: 'PRD generation requires a problem statement.',
        }),
        { status: 400, headers: corsHeaders }
      );
    }




    console.log('📋 [Payload]', {
      selected_outputs,
      project_id,
      project_name,
      has_problem_statement: !!problem_statement,
      has_target_user_persona: !!target_user_persona,
      has_business_goals: !!business_goals,
      problem_statement_length: problem_statement?.length || 0,
    });





console.log('🧱 [Epics Canonical]', {
  hasEpics,
  epicCount: hasEpics ? epics.length : 0,
  firstEpic: hasEpics ? epics[0] : null,
});


console.log('📎 [CSV Detect]', {
  body_keys: Object.keys(body || {}),
  hasCsvIssues,
  csvRowCount: hasCsvIssues ? jiraIssues.length : 0,
  firstRowKeys: hasCsvIssues ? Object.keys(jiraIssues[0] || {}) : [],
  hasCsvText,
  csvTextLength: hasCsvText ? jiraCsvText.length : 0,
});


    // CRITICAL: Validate project_id is a valid UUID
    if (!project_id || !isValidUUID(project_id)) {
      console.warn('⚠️ [Validation Error] Invalid project_id - must be UUID');
      return new Response(
        JSON.stringify({
          error: 'Invalid project_id',
          details: 'project_id must be a valid UUID string',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Check OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error('🔑 [Config Error] OPENAI_API_KEY not set in environment');
      return new Response(
        JSON.stringify({
          error: 'OpenAI API key not configured',
          details:
            'Please set OPENAI_API_KEY in Supabase secrets: supabase secrets set OPENAI_API_KEY=sk-...',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Build Missing Inputs list (prevents hallucination + increases “build-ready” quality)
    // Only enforce Missing Inputs / Assumptions sections when a PRD is requested.
    // For CSV → User Stories only, do not force Missing Inputs (it drags the model into PRD territory).
    const missingInputs =
      wantsPRD && !hasCsvInput
        ? buildMissingInputs(body)
        : [];





    // Build user message (refined: includes contracts, workflow, and required sections)
    let userMessage = ``;


const outputsToGenerate =
  requestedOutputs.length > 0
    ? requestedOutputs
    : hasCsvInput
      ? ['user_stories']
      : ['prd'];

      const includesOnlyCsvSafeOutputs =
  requestedOutputs.length > 0 &&
  requestedOutputs.every(o => {
    const spec = OUTPUT_SPECS[o];
    return spec && spec.source !== 'manual_only';
  });



userMessage += `Requested outputs:\n${outputsToGenerate.map((o) => `- ${o}`).join('\n')}\n\n`;
userMessage += `Project Context:\n- project_id (UUID): ${project_id}\n- project_name: ${project_name || '(not provided)'}\n\n`;
// Append project context documents (if any)
if (projectContextText) {
  userMessage += projectContextText + '\n\n';
}

// Source of truth blocks
if (hasEpics) {
  userMessage += `SOURCE OF TRUTH (Epics):\nUse ONLY the epics below. Do not invent new epics.\n\n`;
  userMessage += `\`\`\`json\n${JSON.stringify(epics, null, 2)}\n\`\`\`\n\n`;
} else if (hasCsvIssues) {
  userMessage += `CSV Upload Detected:\n- Row count: ${jiraIssues.length}\n- Detected columns: ${Object.keys(jiraIssues[0] || {}).join(', ')}\n\n`;
  userMessage += `CSV Rows (first 25):\n\`\`\`json\n${JSON.stringify(jiraIssues.slice(0, 25), null, 2)}\n\`\`\`\n\n`;
} else if (hasCsvText) {
  userMessage += `CSV Upload Detected (raw text):\n- Text length: ${jiraCsvText.length}\n\n`;
  userMessage += `\`\`\`csv\n${jiraCsvText.slice(0, 8000)}\n\`\`\`\n\n`;
}

// Manual inputs (ONLY when not CSV-only User Stories)
if (!csvOnlyUserStories) {
  userMessage += `Manual Inputs (only if present):\n`;
  if (!isBlank(problem_statement)) userMessage += `- Problem Statement: ${problem_statement}\n`;
  if (!isBlank(target_user_persona)) userMessage += `- Target User Persona: ${target_user_persona}\n`;
  if (!isBlank(business_goals)) userMessage += `- Business Goals: ${business_goals}\n`;
  if (!isBlank(functional_requirements)) userMessage += `- Functional Requirements: ${functional_requirements}\n`;
  userMessage += `\n`;
}


// Output-by-output instructions
userMessage += `IMPORTANT OUTPUT RULES:\n`;
userMessage += `- Return Markdown ONLY.\n`;
userMessage += `- You MUST return each output as its own section, preceded by a marker line exactly like:\n`;
userMessage += `  <!-- OUTPUT: <Output Name> -->\n`;
userMessage += `- Do NOT add any content before the first OUTPUT marker.\n`;
userMessage += `- Do NOT merge outputs.\n\n`;

for (const out of outputsToGenerate) {
  const spec = OUTPUT_SPECS[out] ?? null;

  userMessage += `<!-- OUTPUT: ${out} -->\n`;
  userMessage += `# ${out}\n`;

  if (!spec) {
    userMessage += `Generate a high-quality ${out} artifact based ONLY on provided inputs. Keep it specific and testable.\n\n`;
    continue;
  }

  userMessage += `Purpose: ${spec.purpose}\n\n`;

  // Enforce source rules
  if (spec.source === 'manual_only') {
    userMessage += `SOURCE RULE: Use MANUAL INPUTS ONLY. Ignore CSV/Epics blocks unless manual text explicitly includes them.\n\n`;
  } else if (spec.source === 'csv_only') {
    userMessage += `SOURCE RULE: Use CSV/Epics ONLY. Do not invent missing manual context.\n\n`;
  } else {
    userMessage += `SOURCE RULE: Use the best available inputs (Epics preferred if present; else CSV rows; else manual inputs).\n\n`;
  }

  // PRD-only missing inputs behavior
  if (out === 'prd' && missingInputs.length > 0) {
    userMessage += `Missing Inputs (must include these sections in PRD):\n${missingInputs.map((m) => `- ${m}`).join('\n')}\n\n`;
    userMessage += `You MUST include: Missing Inputs, Reasonable Assumptions, Open Questions.\n\n`;
  }

  userMessage += `${spec.format}\n\n`;
  userMessage += `Rules:\n${spec.rules.map((r) => `- ${r}`).join('\n')}\n\n`;
}

userMessage += `Quality bar: 8/10+ (traceability to inputs, crisp structure, testable AC, no invented scope).\n`;
userMessage += `\nOutput in Markdown optimized for Jira/Confluence copy/paste.\n`;

    console.log('🤖 [OpenAI] Calling GPT-4o...');
    console.log('📊 [OpenAI] Message length:', userMessage.length);

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        // Lower temperature = less fluff, more spec-quality
        temperature: 0.2,
        max_tokens: 4500,
      }),
    });

    console.log('📡 [OpenAI Response]', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ [OpenAI Error]', error);
      throw new Error(
        `OpenAI API error: ${error.error?.message || JSON.stringify(error)}`
      );
    }

    const data = await response.json();
    const output = data.choices[0].message.content;
    const duration = Date.now() - startTime;

    console.log('✅ [Success] Generated output', {
      duration: `${duration}ms`,
      output_length: output.length,
      tokens_used: data.usage?.total_tokens || 'N/A',
    });

    // =====================================================
    // Store in project_artifacts table
    // =====================================================
    console.log('💾 [Database] Storing in project_artifacts...');

    const { data: artifact, error: dbError } = await supabase
      .from('project_artifacts')
      .insert({
        project_id: project_id,
        project_name: project_name || 'Unknown Project',
        artifact_type: 'product_documentation',
        artifact_name:
          artifact_name ||
          `${wantsUserStories && !wantsPRD ? 'User Stories' : 'PRD'} - ${new Date().toLocaleDateString()}`,
        input_data: {
          problem_statement,
          target_user_persona,
          business_goals,
          assumptions_constraints,
          functional_requirements,
          dependencies,
          non_functional_requirements,
          user_pain_points,
          competitive_context,
          technical_constraints,
          success_metrics,
          target_timeline,
          epic_impact,
          selected_outputs,
          missing_inputs: missingInputs,
          jira_issues: hasCsvIssues ? jiraIssues : undefined,
          csv_data: hasCsvText ? jiraCsvText : undefined,
        },
        output_data: output,
        metadata: {
          selected_outputs,
          missing_inputs: missingInputs,
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration,
          model: 'gpt-4o',
          temperature: 0.2,
        },
        status: 'active',
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ [Database Error]', dbError);
    } else {
      console.log('✅ [Database] Artifact saved', { artifact_id: artifact?.id });
    }

    return new Response(JSON.stringify({ output, artifact_id: artifact?.id }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('💥 [Error]', {
      error: error.message,
      duration: `${duration}ms`,
      stack: error.stack,
    });

    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: error.toString(),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
