import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}

function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

async function requireProjectAccess(req: Request, projectId: string): Promise<Response | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return jsonResponse({ error: 'Missing bearer token' }, 401);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return jsonResponse({ error: 'Invalid authentication token' }, 401);
  }

  const [{ data: ownedProject, error: ownerError }, { data: membership, error: memberError }] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('owner_user_id', userId)
        .maybeSingle(),
      supabase
        .from('project_members')
        .select('project_id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (ownerError || memberError) {
    console.error('❌ [Auth Error] Failed to validate project access', { ownerError, memberError });
    return jsonResponse({ error: 'Unable to validate project access' }, 500);
  }

  if (!ownedProject && !membership) {
    return jsonResponse({ error: 'Forbidden: project access denied' }, 403);
  }

  return null;
}

function compactText(value: string, maxLength: number) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  const head = normalized.slice(0, Math.floor(maxLength * 0.7));
  const tail = normalized.slice(-Math.floor(maxLength * 0.2));
  return `${head}\n\n[... truncated ...]\n\n${tail}`;
}

const DISCOVERY_TYPE_LABELS: Record<string, string> = {
  customer_interview: 'Customer Interview',
  support_feedback: 'Support Feedback',
  sales_feedback: 'Sales Feedback',
  market_research: 'Market Research',
  opportunity_sizing: 'Opportunity Sizing',
  general_discovery: 'General Discovery',
};

const SYSTEM_PROMPT = `
You are a senior Product Manager performing discovery synthesis.

Your job is to turn raw product signals into a grounded, decision-useful discovery brief.

Hard rules:
- Use only the supplied source material, project context documents, project memory, and prior project artifacts.
- Do not hallucinate customer facts, business outcomes, technical constraints, or certainty that the evidence does not support.
- Separate observed evidence from interpretation.
- When something is not confirmed, label it as an assumption, open question, or hypothesis.
- Be concise, high-signal, and PM-to-PM in tone.

Required structure:
1. Executive Summary
2. Key Themes
3. Pain Points
4. Opportunity Areas
5. User Stories / JTBD Signals
6. Open Questions & Assumptions
7. Recommended Next Steps
8. Conflicts with Context Documents

Final section rule:
- The last heading must be exactly: "## Conflicts with Context Documents"
- If no conflicts are found, explicitly write: "No conflicts identified"
`.trim();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const body = await req.json();
    const {
      project_id,
      project_name,
      artifact_name,
      discovery_type = 'general_discovery',
      source_material,
      problem_area,
      target_segment,
      research_goal,
      notes_context,
      signal_focus,
      selected_outputs = [],
      output_language,
    } = body;

    if (!project_id || !isValidUUID(project_id)) {
      return jsonResponse({ error: 'project_id must be a valid UUID' }, 400);
    }

    if (!source_material || !String(source_material).trim()) {
      return jsonResponse({ error: 'source_material is required' }, 400);
    }

    if (!Array.isArray(selected_outputs) || selected_outputs.length === 0) {
      return jsonResponse({ error: 'selected_outputs must contain at least one output type' }, 400);
    }

    const accessError = await requireProjectAccess(req, project_id);
    if (accessError) {
      return accessError;
    }

    const [
      { data: projectDocs, error: docsError },
      { data: projectArtifacts, error: artifactsError },
      { data: decisions, error: decisionsError },
      { data: memoryItems, error: memoryItemsError },
    ] = await Promise.all([
      supabase
        .from('project_documents')
        .select('id, name, extracted_text, created_at, document_type, doc_type')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .not('extracted_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('project_artifacts')
        .select('id, artifact_type, artifact_name, output_data, created_at')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .not('output_data', 'is', null)
        .neq('artifact_type', 'pm_advisor_feedback')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('project_decisions')
        .select('decision_summary, decision_text, decision_maker, created_at')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('project_memory_items')
        .select('item_type, title, detail, created_at')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    if (docsError) console.warn('[DISCOVERY] Failed to load project documents', docsError);
    if (artifactsError) console.warn('[DISCOVERY] Failed to load project artifacts', artifactsError);
    if (decisionsError) console.warn('[DISCOVERY] Failed to load project decisions', decisionsError);
    if (memoryItemsError) console.warn('[DISCOVERY] Failed to load project memory items', memoryItemsError);

    const projectDocsContext =
      Array.isArray(projectDocs) && projectDocs.length > 0
        ? projectDocs
            .filter((doc) => doc.extracted_text && doc.extracted_text.trim().length > 0)
            .map((doc) => {
              const docType = doc.document_type || doc.doc_type || 'reference';
              return `### ${doc.name} (${docType})\n${compactText(doc.extracted_text, 2200)}`;
            })
            .join('\n\n')
        : '[No uploaded context documents]';

    const projectArtifactsContext =
      Array.isArray(projectArtifacts) && projectArtifacts.length > 0
        ? projectArtifacts
            .map((artifact) => {
              return `### ${artifact.artifact_name || artifact.artifact_type} (${artifact.artifact_type})\n${compactText(String(artifact.output_data || ''), 1500)}`;
            })
            .join('\n\n')
        : '[No prior project artifacts]';

    const decisionsContext =
      Array.isArray(decisions) && decisions.length > 0
        ? decisions
            .map((decision) => {
              const maker = decision.decision_maker ? ` | by ${decision.decision_maker}` : '';
              return `- ${decision.decision_summary || decision.decision_text}${maker}`;
            })
            .join('\n')
        : '[No stored decisions]';

    const memoryItemsContext =
      Array.isArray(memoryItems) && memoryItems.length > 0
        ? memoryItems
            .map((item) => `- ${item.item_type}: ${item.title}${item.detail ? ` — ${item.detail}` : ''}`)
            .join('\n')
        : '[No stored open questions or assumptions]';

    const normalizedOutputLanguage = output_language === 'spanish' ? 'Spanish' : 'English';
    const discoveryLabel = DISCOVERY_TYPE_LABELS[discovery_type] || 'General Discovery';

    const userPrompt = `
PROJECT
- Project: ${project_name || '(not provided)'}
- Discovery Type: ${discoveryLabel}
- Problem Area: ${problem_area || '(not provided)'}
- Customer / Segment: ${target_segment || '(not provided)'}
- Research Goal: ${research_goal || '(not provided)'}
- Requested Outputs: ${selected_outputs.join(', ')}

OUTPUT LANGUAGE
- Write all user-facing markdown output in ${normalizedOutputLanguage}.
- Keep product names, acronyms, quoted source language, and the exact final heading "## Conflicts with Context Documents" unchanged.

RAW SOURCE MATERIAL
${compactText(String(source_material), 18000)}

OPTIONAL PM CONTEXT
${notes_context ? compactText(String(notes_context), 3000) : '[None provided]'}

SIGNAL FOCUS
${signal_focus ? compactText(String(signal_focus), 2000) : '[No specific focus provided]'}

PROJECT MEMORY - DECISIONS
${decisionsContext}

PROJECT MEMORY - OPEN QUESTIONS / ASSUMPTIONS
${memoryItemsContext}

UPLOADED CONTEXT DOCUMENTS
${projectDocsContext}

PRIOR PROJECT ARTIFACTS
${projectArtifactsContext}

INSTRUCTIONS
- Synthesize only what the evidence supports.
- Use the requested outputs to decide where to put emphasis.
- If user stories or JTBD signals are not well-supported by the evidence, say so plainly instead of inventing them.
- If something appears contradictory across source material and context docs, call it out in the final conflicts section.
- If a meaningful detail is still uncertain, place it under "Open Questions & Assumptions".
`.trim();

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.2-chat-latest',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 3600,
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const completion = await openaiResponse.json();
    const output = completion.choices?.[0]?.message?.content?.trim();

    if (!output) {
      throw new Error('Discovery model returned no output');
    }

    const { data: artifact, error: dbError } = await supabase
      .from('project_artifacts')
      .insert({
        project_id,
        project_name: project_name ?? 'Unknown Project',
        artifact_type: 'prioritization',
        artifact_name:
          artifact_name ??
          `${problem_area || discoveryLabel} Discovery Brief – ${new Date().toLocaleDateString()}`,
        input_data: {
          schema_version: 2,
          input_mode: 'discovery',
          selected_outputs,
          output_language: output_language === 'spanish' ? 'spanish' : 'english',
          input: {
            discovery_type,
            problem_area,
            target_segment,
            research_goal,
            source_material,
            notes_context,
            signal_focus,
            selected_outputs,
          },
        },
        output_data: output,
        metadata: {
          version: 1,
          discovery_type,
          problem_area,
          research_goal,
          output_language: output_language === 'spanish' ? 'spanish' : 'english',
          selected_outputs,
          tokens_used: completion.usage?.total_tokens,
          context_documents_used: Array.isArray(projectDocs) && projectDocs.length > 0,
        },
        status: 'active',
        advisor_feedback: null,
        advisor_reviewed_at: null,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[DISCOVERY DB ERROR]', dbError);
    }

    return jsonResponse({
      output,
      artifact_id: artifact?.id,
    });
  } catch (error: any) {
    console.error('[DISCOVERY ERROR]', error);
    return jsonResponse({ error: error.message ?? 'Unknown error' }, 500);
  }
});
