import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =====================================================
// ENV + CLIENT SETUP
// =====================================================
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Optional: fail fast if Supabase env vars are missing (helps debugging)
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Artifact persistence may fail.'
  );
}

const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '');

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
`.trim();

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
`.trim();

// ---------- Internal ----------
const INTERNAL_RELEASE_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- Internal stakeholders (Product, Engineering, Leadership, Support/CS, Ops)

OBJECTIVE
Produce INTERNAL release notes that are immediately usable by a PM to send to cross-functional stakeholders.
This is not a ticket-by-ticket recap. It must read like an internal comms artifact: coherent narrative, grouped themes, actions, and risks.

NON-NEGOTIABLE RULES
- Do NOT structure the main body as "New Features / Bug Fixes / Enhancements".
- Do NOT simply restate each ticket. Tickets belong in an appendix.
- You MUST cluster work into 3–6 meaningful THEMES that reflect product areas or outcomes (e.g., "Auth & Access Reliability", "Platform Correctness", "Observability & Ops", "Admin UX").
- Write so the main body makes sense even if the appendix is removed.
- Do not invent details. If information is missing, place it under "Assumptions / open questions".

REQUIRED OUTPUT FORMAT (Markdown)
# Internal Release Notes — <Release Name> (<Fix Version/s>)

## Executive summary
- 5–8 bullets max.
- Focus on what shipped + why it matters + who is impacted.

## What’s in this release
- 1–2 short paragraphs.
- Describe the release as a cohesive set of improvements (not a list).

## Key themes
Create 3–6 themes. For EACH theme include:

### <Theme name>
- **What changed:** (2–4 bullets)
- **Impact:** (user/business/ops impact; 1–3 bullets)
- **Who should care:** (teams/roles)
- **Actions / notes:** (what people need to do, update, watch, or communicate)

## Rollout & monitoring
- What to monitor for the first 24–72 hours (metrics/events/logs).
- Call out any areas likely to generate support tickets.

## Risks & mitigations
- Top 3–5 risks only.
- Each risk must include a mitigation or follow-up.

## Appendix — included work items (grouped)
- Group ticket keys under the same themes.
- For each ticket include: Key + Summary (and Component if available).
- Keep it scannable.

## Assumptions / open questions
- List anything you had to infer or that is missing from the inputs (e.g., deprecation removal version/date, rollout method, comms needed).
`.trim();

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
`.trim();

// =====================================================
// PROMPT SELECTION
// =====================================================
function buildSystemPrompt(selectedOutputs: string[]): string {
  const outputs = Array.isArray(selectedOutputs) ? selectedOutputs : [];

  // IMPORTANT: these strings must match what your UI sends in selected_outputs
  const hasCustomer = outputs.includes('Customer-Facing Release Notes');
  const hasInternal = outputs.includes('Internal Release Summary'); // ✅ match UI
  const hasSupport = outputs.includes('Support Briefing');

  // Fallback
  const normalized = outputs.length ? outputs : ['Customer-Facing Release Notes'];

  return `
You are a Release Communications Analyst responsible for transforming issue tracker exports into clear, structured release documentation.

HARD OUTPUT RULES (NON-NEGOTIABLE)
- Produce ONLY the outputs requested.
- If more than one output is requested:
  - Return them in ONE response
  - Separate each output with a line that contains EXACTLY:
---
- EACH output MUST start with a top-level markdown title that matches the output name EXACTLY:
  - "# Customer-Facing Release Notes"
  - "# Internal Release Summary"
  - "# Support Briefing"
- Do not add any additional top-level title above these outputs.
- Do not invent details. If missing, use "Assumptions / Open questions".

OUTPUT DEFINITIONS

${hasCustomer ? `# Customer-Facing Release Notes (instructions)
${CUSTOMER_RELEASE_PROMPT}
` : ''}

${hasInternal ? `# Internal Release Summary (instructions)
${INTERNAL_RELEASE_PROMPT}
` : ''}

${hasSupport ? `# Support Briefing (instructions)
${SUPPORT_RELEASE_PROMPT}
` : ''}

REMINDER
- Your final answer must contain ONLY the requested output(s) and must follow the title + separator rules exactly.
`;
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
      return new Response(JSON.stringify({ error: 'Missing csv_data' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!project_id || !isValidUUID(project_id)) {
      return new Response(JSON.stringify({ error: 'Invalid project_id' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not set' }), {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Normalize selected_outputs
    const selectedOutputs: string[] = Array.isArray(selected_outputs)
      ? selected_outputs
      : [];

    // ---------------------------
    // Build prompts
    // ---------------------------
    const systemPrompt = buildSystemPrompt(selectedOutputs);

    let userMessage = `Generate release documentation based on the following CSV.\n\n`;
    userMessage += `CSV DATA:\n${csv_data}\n\n`;

    if (release_name) userMessage += `Release Name: ${release_name}\n`;
    if (target_audience) userMessage += `Target Audience: ${target_audience}\n`;
    if (known_risks) userMessage += `Known Risks: ${known_risks}\n`;

    // ---------------------------
    // OpenAI call
    // ---------------------------
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        temperature: 0.4, 
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'OpenAI request failed');
    }

    const data = await response.json();
    const output = data.choices?.[0]?.message?.content ?? '';
    const duration = Date.now() - startTime;

    // ---------------------------
    // Persist artifact
    // ---------------------------
    // If Supabase env vars are missing, skip persistence gracefully
    let artifactId: string | undefined;

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
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
            selected_outputs: selectedOutputs,
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
      } else {
        artifactId = artifact?.id;
      }
    }

    return new Response(JSON.stringify({ output, artifact_id: artifactId }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('💥 [Error]', error);
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
