import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =====================================================
// ENV + CLIENT SETUP
// =====================================================
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// =====================================================
// HELPERS
// =====================================================
function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// =====================================================
// PROMPTS
// =====================================================

// ---------- Base ----------
const BASE_RELEASE_PROMPT = `
You are a Release Communications Analyst responsible for transforming issue tracker exports into clear, structured release documentation.

You:
- Accurately synthesize changes from CSV exports
- Organize content by relevance and impact
- Write in clean, scannable markdown
- Avoid referencing internal systems unless explicitly instructed
- Do not invent features or capabilities not supported by the input
`;

// ---------- Customer-Facing ----------
const CUSTOMER_RELEASE_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- End users and customers
- Non-technical readers
- No internal context assumed

STYLE GUIDANCE
- Use structure to inform your writing, but do not expose rigid templates
- Avoid explicit labels like "Feature:", "Benefit:", or "Impact:"
- Write naturally, as a Product Manager addressing customers
- Combine feature and benefit into a single, fluid explanation
- Vary sentence structure to avoid repetitive patterns

OPENING CONTEXT
- Begin the release notes with a short, one-sentence summary directly under the title
- This sentence should briefly describe the overall focus of the release (e.g., security, performance, usability)
- Keep it concise and neutral (no marketing language)

OBJECTIVE
Produce customer-facing release notes that feel written by a senior Product Manager and are ready to ship with minimal editing.

GUIDELINES
- Write directly to the user where appropriate ("you can now…")
- Lead with benefits and outcomes, not feature mechanics
- Prioritize the 1–2 most user-visible improvements
- Use friendly, benefit-driven section headers
- Clearly state if a change requires user action
- For deprecations, explain:
  - What is changing
  - When it will matter
  - What the user should do next (if anything)

DO NOT
- Reference Jira, Linear, tickets, or internal teams
- Include implementation details or internal metrics
- Treat all changes as equal importance
`;

// ---------- Internal ----------
const INTERNAL_RELEASE_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- Internal stakeholders (Product, Engineering, Leadership)

OBJECTIVE
Produce an internal release summary that provides clarity on scope, impact, and notable risks.

GUIDELINES
- Focus on what shipped and why it matters to the business
- Include relevant technical or operational context where helpful
- Highlight notable risks, dependencies, or follow-up work
- Be concise but informative
`;

// ---------- Support ----------
const SUPPORT_RELEASE_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- Customer Support and Operations teams

OBJECTIVE
Prepare a support-facing briefing to help teams assist customers post-release.

GUIDELINES
- Summarize user-visible changes
- Call out areas likely to generate support questions
- Note known limitations or edge cases
- Include suggested explanations or guidance for users
- Emphasize "what changed" from the customer’s perspective
`;

// =====================================================
// PROMPT SELECTION
// =====================================================
function buildSystemPrompt(selectedOutputs: string[]): string {
  const sections: string[] = [];

  if (selectedOutputs?.includes('Customer-Facing Release Notes')) {
    sections.push(`# Customer-Facing Release Notes\n${CUSTOMER_RELEASE_PROMPT}`);
  }

  if (selectedOutputs?.includes('Internal Stakeholder Update')) {
    sections.push(`# Internal Stakeholder Update\n${INTERNAL_RELEASE_PROMPT}`);
  }

  if (selectedOutputs?.includes('Support Briefing')) {
    sections.push(`# Support Briefing\n${SUPPORT_RELEASE_PROMPT}`);
  }

  // Fallback
  if (sections.length === 0) {
    sections.push(`# Customer-Facing Release Notes\n${CUSTOMER_RELEASE_PROMPT}`);
  }

  return sections.join('\n\n---\n\n');
}

// =====================================================
// EDGE FUNCTION
// =====================================================
serve(async (req) => {
  const startTime = Date.now();

  // CORS
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
    const {
      csv_data,
      selected_outputs,
      release_name,
      target_audience,
      known_risks,
      project_id,
      project_name,
      artifact_name,
    } = await req.json();

    // ---------------------------
    // Validation
    // ---------------------------
    if (!csv_data) {
      return new Response(
        JSON.stringify({ error: 'Missing csv_data' }),
        { status: 400 }
      );
    }

    if (!project_id || !isValidUUID(project_id)) {
      return new Response(
        JSON.stringify({ error: 'Invalid project_id' }),
        { status: 400 }
      );
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not set' }),
        { status: 500 }
      );
    }

    // ---------------------------
    // Build prompts
    // ---------------------------
    const systemPrompt = buildSystemPrompt(selected_outputs || []);

    let userMessage = `Generate release documentation based on the following CSV:\n\n`;
    userMessage += `CSV DATA:\n${csv_data}\n\n`;

    if (release_name) userMessage += `Release Name: ${release_name}\n`;
    if (target_audience) userMessage += `Target Audience: ${target_audience}\n`;
    if (known_risks) userMessage += `Known Risks: ${known_risks}\n`;

    // ---------------------------
    // OpenAI call
    // ---------------------------
    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'OpenAI request failed');
    }

    const data = await response.json();
    const output = data.choices[0].message.content;
    const duration = Date.now() - startTime;

    // ---------------------------
    // Persist artifact
    // ---------------------------
    const { data: artifact, error: dbError } = await supabase
      .from('project_artifacts')
      .insert({
        project_id,
        project_name: project_name || 'Unknown Project',
        artifact_type: 'release_communications',
        artifact_name:
          artifact_name ||
          `Release Notes - ${new Date().toLocaleDateString()}`,
        input_data: {
          release_name,
          target_audience,
          known_risks,
          selected_outputs,
        },
        output_data: output,
        metadata: {
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration,
        },
        status: 'active',
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ [Database Error]', dbError);
    }

    return new Response(
      JSON.stringify({
        output,
        artifact_id: artifact?.id,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('💥 [Error]', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
