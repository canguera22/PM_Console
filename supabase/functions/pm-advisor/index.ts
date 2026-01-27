import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_VERSION = 'pm-advisor@2025-12-19.2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// UUID validation helper
function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

/**
 * Keep context bounded to avoid token blowups.
 */
function safeSnippet(text: string, max = 600) {
  if (!text) return '';
  const t = String(text);
  return t.length <= max ? t : t.slice(0, max) + '…';
}

/**
 * If a single artifact is huge, include head + tail with a gap note.
 * This preserves conclusions + action items often found at the end.
 */
function compressLargeArtifact(text: string, head = 6000, tail = 3000) {
  const t = String(text || '');
  if (t.length <= head + tail + 200) return t;

  const headPart = t.slice(0, head);
  const tailPart = t.slice(-tail);
  return `${headPart}\n\n[... middle omitted for length (${t.length} chars) ...]\n\n${tailPart}`;
}

/**
 * Pick context artifacts as "best-of by type":
 * - Up to `perType` artifacts per artifact_type (newest first)
 * - Max total `maxTotal`
 */
function pickArtifactsByType(projectArtifacts: any[], perType = 2, maxTotal = 12) {
  if (!Array.isArray(projectArtifacts) || projectArtifacts.length === 0) return [];

  const grouped = new Map<string, any[]>();
  for (const a of projectArtifacts) {
    const type = a?.artifact_type || 'unknown';
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(a);
  }

  const picked: any[] = [];
  for (const [, arr] of grouped.entries()) {
    arr.sort((a, b) => {
      const ta = new Date(a?.created_at || 0).getTime();
      const tb = new Date(b?.created_at || 0).getTime();
      return tb - ta;
    });
    picked.push(...arr.slice(0, perType));
  }

  picked.sort((a, b) => {
    const ta = new Date(a?.created_at || 0).getTime();
    const tb = new Date(b?.created_at || 0).getTime();
    return tb - ta;
  });

  return picked.slice(0, maxTotal);
}

/**
 * Build a compact artifact index the model can cite by artifact_id.
 */
function buildArtifactIndex(artifacts: any[]) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return {
      indexText: '[No other artifacts found for this project]',
      included: [],
    };
  }

  const included = artifacts.map((a: any) => {
    const created = a?.created_at ? new Date(a.created_at).toISOString() : 'unknown';
    const name = a?.artifact_name || '(no name)';
    const type = a?.artifact_type || '(no type)';
    const id = a?.id || '(no id)';
    const excerpt = safeSnippet(a?.output_data || '', 450);
    return { id, type, name, created, excerpt };
  });

  const indexText = included
    .map((a) => {
      return `- artifact_id: ${a.id}
  type: ${a.type}
  name: ${a.name}
  created_at: ${a.created}
  excerpt: ${a.excerpt}`;
    })
    .join('\n');

  return { indexText, included };
}

/**
 * SYSTEM PROMPT (Refined for correctness, actionability, grounding)
 */
const SYSTEM_PROMPT = `You are a senior Product Manager reviewing product and release artifacts before finalization.

Your goal is to provide **clear, concise, high-signal feedback** that helps a PM quickly improve quality, clarity, and decision-readiness.

### Inputs

You may be given one or more of the following artifact types:

**Release & Communication**

* Customer-facing release notes
* Internal release summary
* Support briefing
* Technical / engineering notes
* Categorized issue breakdown
* Breaking changes / risk alerts
* Release checklist

**Product Definition**

* PRDs
* Epics
* Epic impact statements
* User stories
* Acceptance criteria

**Planning & Risk**

* Out-of-scope items
* Risks and mitigations
* Dependency mappings
* Success metrics / KPIs

Not all inputs will be present. Review **only what is provided**.

---

### Your responsibilities

* Evaluate **clarity, usefulness, and audience alignment**
* Identify **material gaps, risks, or confusion**
* Focus on what a PM should fix **before shipping or committing**

Do **not** restate system architecture, implementation details, or process unless they directly affect understanding or risk.

---

### Output format (STRICT)

Respond using **only the sections below**. Be concise and direct.

---

## 1) Executive Verdict (3–5 sentences)

Answer, based on the artifacts provided:

* Is this content clear and decision-ready?
* Who is most likely to be confused (customers, support, engineering, leadership)?
* Is it overly long, vague, inconsistent, or too technical for its audience?

---

## 2) What’s Working (Bullet list, max 5)

Call out what is **effective and should not be changed**.

Only include points that materially help clarity, alignment, or execution.

---

## 3) Top Issues to Fix (Bullet list, max 5)

List only issues that **meaningfully improve understanding, reduce risk, or unblock execution**.

Avoid:

* Minor wording polish
* Hypothetical future improvements
* New feature suggestions

---

## 4) Recommended Edits (Concrete)

Provide **specific, actionable changes**, such as:

* “Shorten section X by removing Y”
* “Clarify ownership for Z”
* “Move this content to internal-only documentation”
* “Rewrite this section for a non-technical audience”

Do **not** propose new scope or speculative work.

---

## 5) Final PM Takeaway (1–2 sentences)

If the PM fixed the issues above and changed nothing else, would this artifact be acceptable to:

* ship,
* share externally,
* or commit the team against?

Answer directly.

---

### Tone & Constraints

* Be direct, not academic
* Prefer plain language over jargon
* Do not invent missing information
* Do not restate architecture or tooling
* Optimize for speed of understanding
`;


async function callOpenAIChat({
  system,
  user,
  temperature,
  maxTokens,
}: {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
}) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  return response;
}

// Main handler
serve(async (req) => {
  const startTime = Date.now();
  console.log('📥 [Edge Function] Received request to pm-advisor');
  console.log('🧩 [Version]', FUNCTION_VERSION);
  console.log('⏰ [Timestamp]', new Date().toISOString());

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();

    const {
      artifact_output,
      artifact_id,
      module_type,
      project_name,
      artifact_type,
      selected_outputs,
      project_id,
      artifact_name,
    } = body;

    console.log('📋 [Payload]', {
      module_type,
      project_name,
      project_id,
      artifact_type,
      artifact_id,
      selected_outputs,
      artifact_output_length: artifact_output?.length || 0,
    });

    // Validate project_id (UUID)
    if (!project_id || !isValidUUID(project_id)) {
      console.warn('⚠️ [Validation Error] Invalid project_id - must be UUID');
      return new Response(
        JSON.stringify({
          error: 'Invalid project_id',
          details: 'project_id must be a valid UUID string',
        }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // OpenAI key check
    if (!OPENAI_API_KEY) {
      console.error('🔑 [Config Error] OPENAI_API_KEY not set in environment');
      return new Response(
        JSON.stringify({
          error: 'OpenAI API key not configured',
          details:
            'Please set OPENAI_API_KEY in Supabase secrets: supabase secrets set OPENAI_API_KEY=sk-...',
        }),
        { status: 500, headers: corsHeaders() }
      );
    }

    // Fetch artifacts for this project (canonical context)
    // Exclude pm_advisor artifacts from context to prevent recursive loops
    console.log('🔍 [Database] Fetching project artifacts (excluding pm_advisor)...');
    const { data: rawArtifacts, error: fetchError } = await supabase
      .from('project_artifacts')
      .select('*')
      .eq('project_id', project_id)
      .eq('status', 'active')
      .neq('artifact_type', 'pm_advisor')
      .order('created_at', { ascending: false });



      // ---------------------------------------------
      // STEP 2: Load project context documents
      // ---------------------------------------------
      const { data: projectDocs, error: docsError } = await supabase
        .from('project_documents')
        .select('id, name, extracted_text, created_at')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .not('extracted_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);

      if (docsError) {
        console.warn('⚠️ Failed to load project documents', docsError);
      }

      const projectDocsContext =
      Array.isArray(projectDocs) && projectDocs.length > 0
        ? projectDocs
            .filter(d => d.extracted_text && d.extracted_text.trim().length > 0)
            .slice(0, 3) 
            .map(d => {
              const text = d.extracted_text!;
              const snippet =
                text.length > 3000
                  ? `${text.slice(0, 1500)}\n\n[... truncated ...]\n\n${text.slice(-1000)}`
                  : text;

              return `### ${d.name}\n${snippet}`;
            })
            .join('\n\n')
        : '';


    if (fetchError) {
      console.error('❌ [Database Error]', fetchError);
    } else {
      console.log('✅ [Database] Fetched artifacts', { count: rawArtifacts?.length || 0 });
    }

    const allArtifacts = Array.isArray(rawArtifacts) ? rawArtifacts : [];

    
    // Determine artifact content to review
    let artifactToReview = artifact_output;

    // If artifact_output missing, try to load by artifact_id
    if ((!artifactToReview || String(artifactToReview).trim() === '') && artifact_id) {
      const match = allArtifacts.find((a: any) => a.id === artifact_id);
      if (match) {
        artifactToReview = match.output_data;
        console.log('✅ [Artifact] Loaded from database', { artifact_id });
      }
    }

    if (!artifactToReview || String(artifactToReview).trim() === '') {
      console.warn('⚠️ [Validation Error] No artifact to review');
      return new Response(
        JSON.stringify({
          error: 'No artifact to review',
          details: 'Please provide artifact_output or artifact_id',
        }),
        { status: 400, headers: corsHeaders() }
      );
    }

    // Compress very large artifacts
    const artifactForPrompt = compressLargeArtifact(artifactToReview);

    // Pick context artifacts by type (best-of)
    const pickedContext = pickArtifactsByType(allArtifacts, 1, 5);
    const { indexText, included } = buildArtifactIndex(pickedContext);

    // Build user message (tight + architecture-grounded)
    let userMessage = `You are reviewing a PM artifact for clarity, alignment, and decision-readiness.


## Review Target
- project_id: ${project_id}
- project_name: ${project_name || '(not provided)'}
- module_type: ${module_type || '(not provided)'}
- artifact_type (declared): ${artifact_type || '(not provided)'}
- reviewed_artifact_id: ${artifact_id || '(not provided)'}
`;

if (selected_outputs && Array.isArray(selected_outputs) && selected_outputs.length > 0) {
  userMessage += `
The PM intentionally selected the following artifact types for review:
${selected_outputs.map((o: string) => `- ${o}`).join('\n')}

Review ONLY these artifacts.
Do NOT comment on missing artifact types.
Tailor feedback to the intended audience of the selected outputs.
`;
}


userMessage += `

## Artifact Content (to review)
\`\`\`markdown
${artifactForPrompt}
\`\`\`
`;

if (projectDocsContext) {
  userMessage += `

## Project Context Documents (FOUNDATIONAL — not artifacts)
${projectDocsContext}
`;
}

userMessage += `

## Optional Background Artifacts
${indexText}

Ignore these unless they reveal a material inconsistency or missing context
that directly affects clarity, risk, or decision-making.
`;

    console.log('🤖 [OpenAI] Calling GPT-4o for PM Advisor review...');
    console.log('📊 [OpenAI] Message length:', userMessage.length);

    // First pass
    const response = await callOpenAIChat({
      system: SYSTEM_PROMPT,
      user: userMessage,
      temperature: 0.35,
      maxTokens: 4500,
    });

    console.log('📡 [OpenAI Response]', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ [OpenAI Error]', err);
      throw new Error(`OpenAI API error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    let output: string = data.choices?.[0]?.message?.content || '';
    const durationFirst = Date.now() - startTime;

    console.log('✅ [Success] Generated PM Advisor feedback (pass 1)', {
      duration: `${durationFirst}ms`,
      output_length: output.length,
      tokens_used: data.usage?.total_tokens || 'N/A',
    });

    const duration = Date.now() - startTime;

    // Store PM Advisor feedback in project_artifacts
    console.log('💾 [Database] Storing PM Advisor feedback...');
    const { data: advisorArtifact, error: dbError } = await supabase
      .from('project_artifacts')
      .insert({
        project_id: project_id,
        project_name: project_name || 'Unknown Project',
        artifact_type: 'pm_advisor',
        artifact_name:
          artifact_name ||
          `PM Advisor Review - ${module_type || 'unknown'} - ${new Date().toLocaleDateString()}`,
        input_data: {
          reviewed_artifact_id: artifact_id || null,
          reviewed_artifact_type: artifact_type || null,
          module_type: module_type || null,
          selected_outputs: Array.isArray(selected_outputs) ? selected_outputs : null,
          context_artifacts_count: pickedContext.length,
          included_context_artifact_ids: included.map((a: any) => a.id),
          function_version: FUNCTION_VERSION,
        },
        output_data: output,
        metadata: {
          category: 'pm_review',
          function_version: FUNCTION_VERSION,
          module_type: module_type || null,
          reviewed_artifact_id: artifact_id || null,
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration,
          model: 'gpt-4o',
          temperature: 0.35,
          context_documents_used: projectDocsContext ? true : false,
          context_artifacts: included.map((a: any) => ({
            id: a.id,
            type: a.type,
            name: a.name,
            created_at: a.created,
          })),
        },
        status: 'active',
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ [Database Error]', dbError);
    } else {
      console.log('✅ [Database] PM Advisor feedback saved', {
        artifact_id: advisorArtifact?.id,
      });
    }


    return new Response(
      JSON.stringify({
        output,
        artifact_id: advisorArtifact?.id,
        context_artifacts_count: pickedContext.length,
        function_version: FUNCTION_VERSION,
      }),
      { status: 200, headers: corsHeaders() }
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('💥 [Error]', {
      error: error?.message,
      duration: `${duration}ms`,
      stack: error?.stack,
    });

    return new Response(
      JSON.stringify({
        error: error?.message || 'Unknown error',
        details: String(error),
        function_version: FUNCTION_VERSION,
      }),
      { status: 500, headers: corsHeaders() }
    );
  }
});
