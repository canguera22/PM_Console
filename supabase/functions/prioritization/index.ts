import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

/* ------------------------------------------------------------------ */
/* Utilities */
/* ------------------------------------------------------------------ */

function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/* ------------------------------------------------------------------ */
/* SYSTEM PROMPT */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `
You are a senior Product Manager reviewing and synthesizing WSJF-based backlog prioritization.

Your job is NOT to restate calculations or raw data.
Your job IS to help a PM make better sequencing and planning decisions.

STRICT RULES:
- Never reproduce the raw CSV or full tables
- Never explain WSJF mechanics
- Assume the reader understands prioritization frameworks
- Focus on implications, not arithmetic

WHAT YOU SHOULD DO:
- Highlight which items rise to the top and WHY
- Call out meaningful tradeoffs and opportunity costs
- Identify execution risks, dependencies, and sequencing concerns
- Provide practical next-step guidance a PM could act on

OUTPUT STYLE:
- Executive, concise, and confident
- PM-to-PM tone (not instructional)
- Insight-dense, not verbose

REQUIRED STRUCTURE:
1. Executive Summary
2. Priority Highlights (Top Items Only)
3. Key Tradeoffs & Insights
4. Risks & Dependencies
5. Recommended Next Actions

You may reference WSJF scores selectively if they add decision value.
Never mirror the full dataset.
`;

/* ------------------------------------------------------------------ */
/* MAIN HANDLER */
/* ------------------------------------------------------------------ */

serve(async (req) => {
  const startTime = Date.now();

  /* ---------------- CORS ---------------- */
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
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const payload = await req.json();

    const {
      csv_content,
      effort_field_name = 'Job Size',
      max_score_per_factor = 10,
      normalize_scores = true,
      initiative_name,
      default_effort_scale,
      notes_context,
      selected_outputs = [],
      top_n_items,
      project_id,
      project_name,
      artifact_name,
    } = payload;

    /* ---------------- Validation ---------------- */

    if (!csv_content) {
      return jsonResponse(
        { error: 'Missing csv_content' },
        400
      );
    }

    if (!project_id || !isValidUUID(project_id)) {
      return jsonResponse(
        { error: 'project_id must be a valid UUID' },
        400
      );
    }

    /* ---------------- Prompt Assembly ---------------- */

    let userPrompt = `
You are reviewing a backlog for WSJF prioritization.

The CSV below is provided ONLY so you can derive rankings and insights.
DO NOT reproduce the dataset or calculations in your output.

BACKLOG DATA (internal analysis only):
${csv_content}

CONFIGURATION:
- Effort Field: ${effort_field_name}
- Max Score Per Factor: ${max_score_per_factor}
- Normalize Scores: ${normalize_scores ? 'Yes' : 'No'}
`;

    if (initiative_name) {
      userPrompt += `- Initiative Name: ${initiative_name}\n`;
    }

    if (default_effort_scale) {
      userPrompt += `- Effort Scale: ${default_effort_scale}\n`;
    }

    if (notes_context) {
      userPrompt += `\nCONTEXT FROM PM:\n${notes_context}\n`;
    }

    if (selected_outputs.length > 0) {
      userPrompt += `
REQUESTED OUTPUT EMPHASIS:
${selected_outputs.map((o: string) => `- ${o}`).join('\n')}

Only include what materially supports these outputs.
`;
    }

    if (
      selected_outputs.includes('Top N Items Summary') &&
      top_n_items
    ) {
      userPrompt += `\nFocus on the top ${top_n_items} items only.\n`;
    }

    /* ---------------- OpenAI Call ---------------- */

    const openaiResponse = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.6,
          max_tokens: 3000,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const completion = await openaiResponse.json();
    const output = completion.choices[0].message.content;
    const durationMs = Date.now() - startTime;

    /* ---------------- Persist Artifact ---------------- */

    const { data: artifact, error: dbError } = await supabase
      .from('project_artifacts')
      .insert({
        project_id,
        project_name: project_name ?? 'Unknown Project',
        artifact_type: 'prioritization',
        artifact_name:
          artifact_name ??
          `WSJF Prioritization – ${new Date().toLocaleDateString()}`,
        input_data: {
          initiative_name,
          effort_field_name,
          max_score_per_factor,
          normalize_scores,
          selected_outputs,
          top_n_items,
        },
        output_data: output,
        metadata: {
          model: 'WSJF',
          tokens_used: completion.usage?.total_tokens,
          duration_ms: durationMs,
        },
        status: 'active',
        advisor_feedback: null,
        advisor_reviewed_at: null,
      })
      .select()
      .single();

    if (dbError) {
      console.error('[DB ERROR]', dbError);
    }

    /* ---------------- Response ---------------- */

    return jsonResponse({
      output,
      artifact_id: artifact?.id,
    });
  } catch (err: any) {
    console.error('[PRIORITIZATION ERROR]', err);
    return jsonResponse(
      {
        error: err.message ?? 'Unknown error',
      },
      500
    );
  }
});
