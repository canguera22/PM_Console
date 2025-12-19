import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS', // ✅ recommended
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
 * Also excludes pm_advisor artifacts by default (handled by query too).
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
  for (const [type, arr] of grouped.entries()) {
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
const SYSTEM_PROMPT = `You are a Senior Product + Engineering Advisor.

Your output will be used to decide what engineers build next. You must be:
- Correct (do not invent facts),
- Actionable for engineering,
- Grounded in the provided architecture + artifact context.

Hard Rules (do not violate):
1) NO HALLUCINATION: If something is not present in the artifact or provided context, say: "Not verifiable from provided artifacts."
2) EVIDENCE: Any cross-artifact consistency claim MUST cite at least one artifact reference from the "Project Artifact Index" (by artifact_id).
3) ARCHITECTURE GROUNDING: When recommending changes, tie them to the actual system:
   - Supabase Edge Functions
   - project_artifacts table keyed by project_id (UUID)
   - frontend calling functions via supabase.functions.invoke
4) ENGINEERING ACTIONABILITY: Every major recommended change must include:
   - What to change
   - Where (component/table/edge function)
   - Acceptance Criteria (testable)
   - Suggested implementation sequence (1-2-3)

You MUST include a scorecard at the top with these three scores (0-10):
- Correctness Score
- Engineering Actionability Score
- Architecture Grounding Score
Each score needs 1-2 sentences explaining why.

Required Output Sections (in this exact order, always):
1) Scorecard (3 scores)
2) Executive Verdict (Pass / Pass with Feedback / Needs Revision)
3) Artifact Summary (what it claims, in 5-10 bullets)
4) Correctness & Completeness Checks (missing sections, contradictions, vague requirements)
5) Architecture & Data Contract Alignment
   - Must reference: project_id UUID, project_artifacts, edge function payload/response, persistence expectations
6) Cross-Artifact Consistency (must cite artifact_id(s) or say Not verifiable)
7) Engineering Action Plan
   - TABLE REQUIRED with columns:
     Task | Location | Owner (PM/FE/BE/Data/DevOps) | Priority (P0/P1/P2) | Effort (S/M/L) | Acceptance Criteria | Verification (Unit/E2E/Manual/DB Query)
8) Recommended Edits (write “replace/add” instructions that a PM can paste back into the artifact)
9) Open Questions (only questions that block correctness)

Tone: direct, precise, build-oriented. Output in Markdown.`;

// Main handler
serve(async (req) => {
  const startTime = Date.now();
  console.log('📥 [Edge Function] Received request to pm-advisor');
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
      // context_artifacts param intentionally unused — canonical context is DB-backed
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
    // ✅ Exclude pm_advisor artifacts from context to prevent recursive loops
    console.log('🔍 [Database] Fetching project artifacts (excluding pm_advisor)...');
    const { data: rawArtifacts, error: fetchError } = await supabase
      .from('project_artifacts')
      .select('*')
      .eq('project_id', project_id)
      .eq('status', 'active')
      .neq('artifact_type', 'pm_advisor')
      .order('created_at', { ascending: false });

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
      // Note: reviewed artifact could be a pm_advisor artifact (rare) but typically not.
      // If you want to allow reviewing pm_advisor items, we'd need a second fetch that includes it.
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

    // Compress very large artifacts to avoid token blowups
    const artifactForPrompt = compressLargeArtifact(artifactToReview);

    // ✅ Pick context artifacts by type (best-of)
    const pickedContext = pickArtifactsByType(allArtifacts, 2, 12);
    const { indexText, included } = buildArtifactIndex(pickedContext);

    // Build user message (tight + architecture-grounded)
    let userMessage = `You are reviewing a PM artifact within a specific architecture.\n\n`;

    userMessage += `## Architecture Ground Truth (must be referenced)\n`;
    userMessage += `- Frontend: React/Vite calling Supabase Edge Functions via supabase.functions.invoke\n`;
    userMessage += `- Persistence: Postgres on Supabase\n`;
    userMessage += `- Central store: project_artifacts (keyed by project_id UUID) with fields: project_id, project_name, artifact_type, artifact_name, input_data(JSONB), output_data(TEXT), metadata(JSONB), advisor_feedback, advisor_reviewed_at, status\n`;
    userMessage += `- This pm-advisor function loads DB-backed artifacts for context and stores its review back into project_artifacts.\n\n`;

    userMessage += `## Review Target\n`;
    userMessage += `- project_id: ${project_id}\n`;
    userMessage += `- project_name: ${project_name || '(not provided)'}\n`;
    userMessage += `- module_type: ${module_type || '(not provided)'}\n`;
    userMessage += `- artifact_type (declared): ${artifact_type || '(not provided)'}\n`;
    userMessage += `- reviewed_artifact_id: ${artifact_id || '(not provided)'}\n`;
    if (selected_outputs && Array.isArray(selected_outputs) && selected_outputs.length > 0) {
      userMessage += `- selected_outputs:\n${selected_outputs.map((o: string) => `  - ${o}`).join('\n')}\n`;
    }
    userMessage += `\n`;

    userMessage += `## Artifact Content (to review)\n`;
    userMessage += `\`\`\`markdown\n${artifactForPrompt}\n\`\`\`\n\n`;

    userMessage += `## Project Artifact Index (you MUST cite artifact_id for cross-artifact claims)\n`;
    userMessage += `${indexText}\n\n`;

    userMessage += `Important constraints:\n`;
    userMessage += `- Any cross-artifact statement must cite artifact_id(s) from the index above.\n`;
    userMessage += `- If you cannot verify something from the artifact(s), explicitly say: "Not verifiable from provided artifacts."\n`;
    userMessage += `- Focus on build-ready actionability and architecture alignment.\n`;

    console.log('🤖 [OpenAI] Calling GPT-4o for PM Advisor review...');
    console.log('📊 [OpenAI] Message length:', userMessage.length);

    // Call OpenAI (lower temp for correctness + build focus)
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
        temperature: 0.25,
        max_tokens: 4500,
      }),
    });

    console.log('📡 [OpenAI Response]', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ [OpenAI Error]', err);
      throw new Error(`OpenAI API error: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    const output = data.choices[0].message.content;
    const duration = Date.now() - startTime;

    console.log('✅ [Success] Generated PM Advisor feedback', {
      duration: `${duration}ms`,
      output_length: output.length,
      tokens_used: data.usage?.total_tokens || 'N/A',
    });

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
        },
        output_data: output,
        metadata: {
          // ✅ makes dashboard categorization easier later
          category: 'pm_review',
          module_type: module_type || null,
          reviewed_artifact_id: artifact_id || null,
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration,
          model: 'gpt-4o',
          temperature: 0.25,
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

    // Optionally update the reviewed artifact with advisor feedback
    if (artifact_id && !dbError) {
      console.log('💾 [Database] Updating reviewed artifact with advisor feedback reference...');

      const { error: updateError } = await supabase
        .from('project_artifacts')
        .update({
          advisor_feedback: output,
          advisor_reviewed_at: new Date().toISOString(),
        })
        .eq('id', artifact_id);

      if (updateError) {
        console.error('❌ [Database Error] Failed to update artifact', updateError);
      } else {
        console.log('✅ [Database] Artifact updated with advisor feedback');
      }
    }

    return new Response(
      JSON.stringify({
        output,
        artifact_id: advisorArtifact?.id,
        context_artifacts_count: pickedContext.length,
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
      }),
      { status: 500, headers: corsHeaders() }
    );
  }
});
