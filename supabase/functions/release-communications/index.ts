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

type StructuredOutputSection = {
  name: string;
  markdown: string;
};

function normalizeOutputName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sanitizeMarkdown(output: string): string {
  return output.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+.+\n+/, '').trim();
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // fall through
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as Record<string, unknown>;
    } catch {
      // fall through
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

function parseSectionsFromJson(
  payload: Record<string, unknown>,
  selectedOutputs: string[]
): StructuredOutputSection[] {
  const rawOutputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  const normalizedRows: Array<{ name: string; markdown: string }> = [];

  for (const row of rawOutputs) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (typeof record.name !== 'string' || typeof record.markdown !== 'string') continue;

    normalizedRows.push({
      name: record.name,
      markdown: stripLeadingH1(sanitizeMarkdown(record.markdown)),
    });
  }

  const byExactName = new Map<string, string>();
  const byNormalizedName = new Map<string, string>();
  normalizedRows.forEach((row) => {
    if (!byExactName.has(row.name)) {
      byExactName.set(row.name, row.markdown);
    }
    const normalized = normalizeOutputName(row.name);
    if (!byNormalizedName.has(normalized)) {
      byNormalizedName.set(normalized, row.markdown);
    }
  });

  const usedIndexes = new Set<number>();
  return selectedOutputs.map((name, index) => {
    const exact = byExactName.get(name);
    if (typeof exact === 'string') {
      return { name, markdown: exact };
    }

    const normalized = byNormalizedName.get(normalizeOutputName(name));
    if (typeof normalized === 'string') {
      return { name, markdown: normalized };
    }

    // Final fallback: align by order to avoid blank sections when names drift
    const fallbackIndex = normalizedRows.findIndex((_, i) => i === index && !usedIndexes.has(i));
    if (fallbackIndex !== -1) {
      usedIndexes.add(fallbackIndex);
      return { name, markdown: normalizedRows[fallbackIndex].markdown };
    }

    const nextAvailableIndex = normalizedRows.findIndex((_, i) => !usedIndexes.has(i));
    if (nextAvailableIndex !== -1) {
      usedIndexes.add(nextAvailableIndex);
      return { name, markdown: normalizedRows[nextAvailableIndex].markdown };
    }

    return { name, markdown: '' };
  });
}

function parseSectionsFromMarkdown(
  markdown: string,
  selectedOutputs: string[]
): StructuredOutputSection[] {
  if (selectedOutputs.length === 0) return [];
  if (selectedOutputs.length === 1) {
    return [{ name: selectedOutputs[0], markdown: stripLeadingH1(sanitizeMarkdown(markdown)) }];
  }

  const headers = [...markdown.matchAll(/^#\s+(.+)$/gm)];
  if (headers.length > 1) {
    return selectedOutputs.map((name, index) => {
      const start = headers[index]?.index;
      const end = headers[index + 1]?.index ?? markdown.length;
      if (start === undefined) return { name, markdown: '' };
      const block = markdown.slice(start, end).trim();
      return { name, markdown: stripLeadingH1(sanitizeMarkdown(block)) };
    });
  }

  return selectedOutputs.map((name, index) => ({
    name,
    markdown: index === 0 ? stripLeadingH1(sanitizeMarkdown(markdown)) : '',
  }));
}

function buildCombinedOutput(sections: StructuredOutputSection[]): string {
  return sections
    .map((section) => `# ${section.name}\n\n${section.markdown.trim()}`)
    .join('\n\n');
}

async function getProjectContextText(projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from('project_documents')
    .select('name, extracted_text')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .not('extracted_text', 'is', null);

  if (error) {
    console.warn('⚠️ Failed to fetch project documents', error);
    return '';
  }

  if (!data || data.length === 0) return '';

  return data
    .map(
      (doc) =>
        `### Project Context Document: ${doc.name}\n${doc.extracted_text}`
    )
    .join('\n\n');
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
- Output sections MUST appear in the same order as selected_outputs.
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
- Begin the release notes with a short, 2-3 sentence summary of the changes being implemented in the release
- This sentence should briefly describe the overall focus of the release citing specifics (e.g., security, performance, usability)
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
# Internal Release Notes

## Executive summary
- 5–8 bullets max.
- Focus on what shipped + why it matters + who is impacted.

## Release context
- Release name: <name if known>
- Fix version(s): <if present in CSV>

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

// --------Technical Release Notes-----------
const TECHNICAL_RELEASE_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- Engineers, QA, SRE, platform teams

OBJECTIVE
Provide a technically-oriented release summary focused on implementation details, risks, and operational considerations.

REQUIRED OUTPUT FORMAT (Markdown)

# Technical / Engineering Notes

## Overview
- 1–2 paragraphs summarizing the technical scope of the release.

## Key technical changes
- Bullet list of significant code, infrastructure, or configuration changes.

## Risks & mitigations
- Known technical risks
- Rollback considerations

## Operational notes
- Monitoring
- Feature flags
- Migrations
`.trim();


// ---------Cetegorized Issue Breakdown ----------
const CATEGORIZED_ISSUE_BREAKDOWN_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- Product Managers
- QA
- Stakeholders needing detailed release coverage

OBJECTIVE
Produce a categorized breakdown of all work included in the release.
This is a STRUCTURED inventory, not a narrative summary.

REQUIRED OUTPUT FORMAT (Markdown)

# Categorized Issue Breakdown

## Summary
- 1 short paragraph explaining what this breakdown represents and how to use it.

## Categories
Group all included issues into logical categories.
Use categories such as (but not limited to):
- Features
- Enhancements
- Bug fixes
- Performance
- Security
- Infrastructure / DevOps
- UX / UI
- Technical debt

For EACH category:

### <Category name>
- Bullet list of issues.
- Each bullet should include:
  - Issue key (if available)
  - Short description
  - Impacted area or component (if available)

## Notes
- If issue metadata is incomplete, group conservatively.
- Do not invent categories or issues not present in the input.
- If an issue fits multiple categories, choose the MOST relevant one.

STYLE GUIDANCE
- Be concise
- Optimize for scanability
- Avoid narrative prose
`.trim();


// ---------- Breaking Changes ----------
const BREAKING_CHANGES_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- Product
- Engineering
- Support
- Customer Success
- Leadership

OBJECTIVE
Identify and clearly communicate any breaking changes, risks, or noteworthy behavioral changes introduced by this release.

REQUIRED OUTPUT FORMAT (Markdown)

# Breaking Changes / Risk Alerts

## Overview
- 1–2 sentences explaining the purpose of this section.

## Breaking changes
List ONLY if applicable.
For EACH breaking change include:
- **What changed**
- **Who is affected**
- **When it matters**
- **What action is required** (if any)

If there are no breaking changes, explicitly state:
> No breaking changes were identified in this release.

## Risk alerts
Call out high-risk or sensitive changes even if they are not technically breaking.
Examples:
- Behavior changes
- Deprecations
- Performance tradeoffs
- Feature flag removals
- Security-related changes

For EACH risk include:
- **Risk description**
- **Likelihood** (low / medium / high)
- **Potential impact**
- **Mitigation or monitoring guidance**

## Support & comms notes
- Anything Support or CS should proactively know or communicate.

STYLE GUIDANCE
- Be explicit and conservative
- Do not downplay risks
- Avoid vague language
`.trim();


// ---------- Release Checklist ----------
const RELEASE_CHECKLIST_PROMPT = `
${BASE_RELEASE_PROMPT}

AUDIENCE
- Product Managers
- Release Managers
- Engineering Leads

OBJECTIVE
Generate a practical release checklist to validate readiness before and after deploying this release.

REQUIRED OUTPUT FORMAT (Markdown)

# Release Checklist

## Pre-release
Checklist items to confirm BEFORE deployment.
Use checkbox format:
- [ ] Code freeze complete
- [ ] QA validation complete
- [ ] Feature flags reviewed
- [ ] Rollback plan defined
- [ ] Monitoring dashboards prepared
- [ ] Stakeholders notified

Tailor checklist items to the actual contents of the release when possible.

## Deployment
Checklist items DURING deployment:
- [ ] Deployment started
- [ ] No blocking errors observed
- [ ] Critical paths verified
- [ ] Feature flags toggled as planned

## Post-release
Checklist items AFTER deployment:
- [ ] Metrics reviewed
- [ ] Error rates stable
- [ ] Support briefed
- [ ] Release notes distributed
- [ ] Follow-ups logged (if needed)

## Notes
- Include any release-specific checks inferred from the CSV.
- Do not invent requirements unsupported by the inputs.

STYLE GUIDANCE
- Keep items actionable
- Avoid generic filler
- Prefer operational realism over completeness
`.trim();


// =====================================================
// PROMPT SELECTION
// =====================================================
function buildSystemPrompt(selectedOutputs: string[]): string {
  if (!selectedOutputs.length) {
    throw new Error('At least one output type must be selected');
  }

  const hasCustomer = selectedOutputs.includes('Customer-Facing Release Notes');
  const hasInternal = selectedOutputs.includes('Internal Release Summary');
  const hasSupport = selectedOutputs.includes('Support Briefing');
  const hasTechnical = selectedOutputs.includes('Technical / Engineering Notes');
  const hasCategorized = selectedOutputs.includes('Categorized Issue Breakdown');
  const hasBreaking = selectedOutputs.includes('Breaking Changes / Risk Alerts');
  const hasChecklist = selectedOutputs.includes('Release Checklist');

  return `
HARD OUTPUT RULES (NON-NEGOTIABLE)
- Produce ONLY the outputs explicitly requested
- EACH output MUST start with a top-level markdown header (#)
- Header text MUST exactly match the output name
- Do NOT include any output that was not requested
- Do NOT include HTML comments or separators
- Do NOT include explanatory text outside the outputs

${hasCustomer ? CUSTOMER_RELEASE_PROMPT : ''}
${hasInternal ? INTERNAL_RELEASE_PROMPT : ''}
${hasSupport ? SUPPORT_RELEASE_PROMPT : ''}
${hasTechnical ? TECHNICAL_RELEASE_PROMPT : ''}
${hasCategorized ? CATEGORIZED_ISSUE_BREAKDOWN_PROMPT : ''}
${hasBreaking ? BREAKING_CHANGES_PROMPT : ''}
${hasChecklist ? RELEASE_CHECKLIST_PROMPT : ''}
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
    // Fetch project context documents
    // ---------------------------
    const projectContextText = await getProjectContextText(project_id);

    // ---------------------------
    // Build prompts
    // ---------------------------
    const baseSystemPrompt = buildSystemPrompt(selectedOutputs);

    const systemPrompt = `
    ${baseSystemPrompt}

    ${projectContextText ? `
    ================================
    PROJECT CONTEXT (SOURCE DOCUMENTS)
    ================================
    ${projectContextText}

    The following project context documents are AUTHORITATIVE.

    REQUIREMENTS
    - You MUST align terminology, scope, and framing to these documents.
    - You MUST NOT introduce features, risks, or themes that contradict them.
    - If the CSV omits rationale, intent, or framing, infer it ONLY from the project documents.
    - If the CSV conflicts with the project documents:
      - CSV wins for factual release contents
      - Project documents win for intent, scope, and narrative framing
    ` : ''}
    `.trim();


    let userMessage = `Generate release documentation based on the following CSV.\n\n`;
    userMessage += `CSV DATA:\n${csv_data}\n\n`;

    if (release_name) userMessage += `Release Name: ${release_name}\n`;
    if (target_audience) userMessage += `Target Audience: ${target_audience}\n`;
    if (known_risks) userMessage += `Known Risks: ${known_risks}\n`;
    userMessage += `\nSelected outputs (exact):\n${selectedOutputs.map((o) => `- ${o}`).join('\n')}\n`;
    userMessage += `
Return JSON ONLY in this shape:
{
  "outputs": [
    { "name": "<one selected output>", "markdown": "<markdown content, no outer H1 title>" }
  ]
}

Rules:
- Include ALL selected outputs exactly once.
- "name" must exactly match selected output labels.
- Keep outputs in the same order as selected outputs.
- Do not include any extra top-level keys.
`;

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
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'release_outputs',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                outputs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        enum: selectedOutputs,
                      },
                      markdown: { type: 'string' },
                    },
                    required: ['name', 'markdown'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['outputs'],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.4, 
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'OpenAI request failed');
    }

    const data = await response.json();
    const rawOutput = data.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonObject(rawOutput);

    const sections = parsed
      ? parseSectionsFromJson(parsed, selectedOutputs)
      : parseSectionsFromMarkdown(rawOutput, selectedOutputs);

    const output = buildCombinedOutput(sections);

    console.log('================ RAW LLM OUTPUT ================');
    console.log(output);
    console.log('================================================');

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
            schema_version: 1,
            input_mode: 'csv',
            selected_outputs: selectedOutputs,
            input: {
              release_name,
              target_audience,
              known_risks,
            },
          },
          output_data: output,
          metadata: {
            input_schema_version: 1,
            tokens_used: data.usage?.total_tokens,
            duration_ms: duration,
            output_sections: sections,
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

    return new Response(JSON.stringify({ output, artifact_id: artifactId, sections }), {
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
