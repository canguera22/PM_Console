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

function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

async function requireProjectAccess(req: Request, projectId: string): Promise<Response | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
      status: 401,
      headers: corsHeaders(),
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
      status: 401,
      headers: corsHeaders(),
    });
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
    return new Response(JSON.stringify({ error: 'Unable to validate project access' }), {
      status: 500,
      headers: corsHeaders(),
    });
  }

  if (!ownedProject && !membership) {
    return new Response(JSON.stringify({ error: 'Forbidden: project access denied' }), {
      status: 403,
      headers: corsHeaders(),
    });
  }

  return null;
}

function compactText(value: string, maxLength: number) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function moduleStructureInstruction(moduleType: string) {
  switch (moduleType) {
    case 'product_documentation':
      return [
        'Preserve the existing product documentation output structure.',
        'If the original output uses <!-- OUTPUT: ... --> markers, keep those exact marker lines and output names.',
        'Keep Jira/Confluence-friendly Markdown.',
      ].join('\n');
    case 'release_communications':
      return [
        'Preserve the release communication output sections and selected output names.',
        'Do not add release facts, customers, risks, dates, or scope not present in the supplied inputs.',
      ].join('\n');
    case 'prioritization':
      return [
        'Preserve the discovery brief structure and selected output emphasis.',
        'Do not turn assumptions into facts or invent user stories, evidence, or certainty not supported by the original inputs.',
      ].join('\n');
    case 'meeting_intelligence':
      return [
        'Preserve the project notes / meeting intelligence structure.',
        'Do not invent owners, due dates, or decisions that are not present in the source material.',
      ].join('\n');
    default:
      return 'Preserve the original artifact type, section order, and Markdown structure.';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const {
      project_id,
      project_name,
      artifact_id,
      artifact_name,
      module_type,
      artifact_type,
      original_input,
      original_output,
      advisor_feedback,
      selected_outputs = [],
      output_language,
    } = body;

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), {
        status: 500,
        headers: corsHeaders(),
      });
    }

    if (!project_id || !isValidUUID(project_id)) {
      return new Response(JSON.stringify({ error: 'project_id must be a valid UUID' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    if (!artifact_id || !isValidUUID(artifact_id)) {
      return new Response(JSON.stringify({ error: 'artifact_id must be a valid UUID' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    if (!original_output || !advisor_feedback) {
      return new Response(JSON.stringify({ error: 'original_output and advisor_feedback are required' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const accessError = await requireProjectAccess(req, project_id);
    if (accessError) return accessError;

    const { data: sourceArtifact, error: artifactError } = await supabase
      .from('project_artifacts')
      .select('id, project_id, artifact_type')
      .eq('id', artifact_id)
      .eq('project_id', project_id)
      .maybeSingle();

    if (artifactError) throw artifactError;
    if (!sourceArtifact) {
      return new Response(JSON.stringify({ error: 'Artifact not found for this project' }), {
        status: 404,
        headers: corsHeaders(),
      });
    }

    const normalizedOutputLanguage = output_language === 'spanish' ? 'Spanish' : 'English';
    const systemPrompt = `
You are a senior Product Manager revising a Product Workbench artifact after PM Advisor feedback.

Your job is to produce a stronger second version while preserving evidence discipline.

Hard rules:
- Use only the provided original inputs, original artifact, PM Advisor feedback, and project context.
- Do not invent facts, requirements, customers, owners, dates, metrics, dependencies, scores, or scope.
- If PM Advisor feedback asks for information that is not available, add it under "Missing Inputs" or "Open Questions" instead of fabricating it.
- Keep claims traceable to the supplied material.
- Preserve Markdown output. Return revised artifact Markdown only.
- Write user-facing content in ${normalizedOutputLanguage}.
- Preserve product names, acronyms, exact field names, direct quotes, and required structural markers.
`.trim();

    const userPrompt = `
PROJECT
- Project: ${project_name || '(not provided)'}
- Module type: ${module_type}
- Artifact type: ${artifact_type || sourceArtifact.artifact_type}
- Artifact name: ${artifact_name || '(not provided)'}
- Selected outputs: ${Array.isArray(selected_outputs) && selected_outputs.length ? selected_outputs.join(', ') : '(not provided)'}

MODULE STRUCTURE CONTRACT
${moduleStructureInstruction(module_type)}

ORIGINAL USER INPUT / SOURCE SNAPSHOT
\`\`\`json
${JSON.stringify(original_input ?? {}, null, 2).slice(0, 12000)}
\`\`\`

ORIGINAL ARTIFACT
\`\`\`markdown
${compactText(original_output, 30000)}
\`\`\`

PM ADVISOR FEEDBACK TO APPLY
\`\`\`markdown
${compactText(advisor_feedback, 12000)}
\`\`\`

REVISION TASK
Revise the original artifact by applying the PM Advisor feedback where the feedback is supported by the supplied inputs and artifact.

If the PM Advisor asks for missing or unsupported information:
- Do not add invented content.
- Add a concise "Missing Inputs" or "Open Questions" section in the relevant place.
- Explain exactly what information is needed.

Return the revised artifact only.
`.trim();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.2-chat-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 5000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error: ${errorText}`);
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content?.trim();

    if (!output) {
      throw new Error('Revision model returned no output');
    }

    return new Response(JSON.stringify({ output }), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: corsHeaders(),
    });
  }
});
