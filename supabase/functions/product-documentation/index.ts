import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// UUID validation helper
function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

/**
 * SYSTEM PROMPT (Refined)
 * Goal: Force “build-ready” specs, avoid hallucinations, require explicit workflows/contracts/errors.
 */
const SYSTEM_PROMPT = `You are a Senior Product Lead + Technical Program Manager. Your output must be IMPLEMENTATION-READY.

Your job:
- Produce build-ready PRDs with explicit workflows, data contracts, API boundaries, error states, and acceptance criteria.
- Do not write generic product fluff. Be specific, deterministic, and actionable.
- If information is missing, DO NOT invent it. Instead:
  1) Add a "Missing Inputs" section listing what’s missing,
  2) Provide a "Reasonable Assumptions" section (clearly labeled),
  3) Add an "Open Questions" section.

Important constraints:
- Output must be in Markdown.
- Use concrete structures: tables, checklists, numbered flows.
- When you specify requirements, include acceptance criteria that a developer can test.
- Always include: Core User Flows, Data Model/Contracts, Integration Points, Failure Modes & Error UX, and an MVP scope boundary.

Architecture context you must assume unless overridden:
- Frontend: React (Vite) calling Supabase Edge Functions.
- Persistence: Postgres via Supabase.
- Central artifact storage: project_artifacts table, keyed by project_id (UUID).
- Artifact output is saved to project_artifacts with input_data/output_data/metadata.

Mandatory PRD Sections (always include these headings in this order):
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

When output types are requested (e.g., PRD, Epics, User Stories), generate ONLY those, but ensure PRD includes all mandatory sections above.`;

/**
 * Helper: normalize blank strings
 */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * Helper: build missing inputs list (for better PRDs even with partial inputs)
 */
function buildMissingInputs(payload: Record<string, unknown>): string[] {
  const missing: string[] = [];

  // These are typically "required" in your UI, but we handle missing gracefully
  const requiredish = [
    { key: 'problem_statement', label: 'Problem Statement' },
    { key: 'target_user_persona', label: 'Target User Persona' },
    { key: 'business_goals', label: 'Business Goals' },
    { key: 'assumptions_constraints', label: 'Assumptions & Constraints' },
    { key: 'functional_requirements', label: 'Functional Requirements' },
    { key: 'dependencies', label: 'Dependencies' },
    { key: 'selected_outputs', label: 'Selected Output Types' },
    { key: 'project_name', label: 'Project Name (optional but helpful)' },
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
      artifact_name,
    } = body;

    console.log('📋 [Payload]', {
      selected_outputs,
      project_id,
      project_name,
      has_problem_statement: !!problem_statement,
      has_target_user_persona: !!target_user_persona,
      has_business_goals: !!business_goals,
      problem_statement_length: problem_statement?.length || 0,
    });

    // Validation (keep strict on project_id + OpenAI key)
    if (!problem_statement) {
      console.warn('⚠️ [Validation Error] Missing problem_statement');
      return new Response(
        JSON.stringify({
          error: 'Missing problem_statement',
          details:
            'Please provide a problem statement to generate documentation',
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
    const missingInputs = buildMissingInputs(body);

    // Build user message (refined: includes contracts, workflow, and required sections)
    let userMessage = `You are generating IMPLEMENTATION-READY product documentation.\n\n`;

    // Output selection
    if (selected_outputs && Array.isArray(selected_outputs) && selected_outputs.length > 0) {
      userMessage += `Requested outputs:\n${selected_outputs
        .map((o: string) => `- ${o}`)
        .join('\n')}\n\n`;
    } else {
      userMessage += `Requested outputs:\n- PRD (Product Requirements Document)\n\n`;
    }

    // Project context (critical for project-level architecture specs)
    userMessage += `Project Context:\n- project_id (UUID): ${project_id}\n- project_name: ${project_name || '(not provided)'}\n`;
    userMessage += `\nArchitecture Notes (must reflect in PRD):\n`;
    userMessage += `- Central artifact store: project_artifacts table keyed by project_id (UUID)\n`;
    userMessage += `- Artifacts saved with: project_id, project_name, artifact_type, artifact_name, input_data(JSON), output_data(TEXT), metadata(JSON), status\n`;
    userMessage += `- Edge Function will store output in project_artifacts (already implemented)\n\n`;

    // Missing inputs section directive
    if (missingInputs.length > 0) {
      userMessage += `IMPORTANT: The following inputs are missing or incomplete:\n${missingInputs
        .map((m) => `- ${m}`)
        .join('\n')}\n\n`;
      userMessage += `You MUST include a "Missing Inputs" section and a "Reasonable Assumptions" section in the PRD.\n`;
      userMessage += `Do NOT invent specifics. Keep assumptions clearly labeled.\n\n`;
    }

    // Provided inputs
    userMessage += `Provided Inputs:\n\n`;
    userMessage += `**Problem Statement:**\n${problem_statement}\n\n`;

    if (!isBlank(target_user_persona)) {
      userMessage += `**Target User Persona:**\n${target_user_persona}\n\n`;
    }
    if (!isBlank(business_goals)) {
      userMessage += `**Business Goals:**\n${business_goals}\n\n`;
    }
    if (!isBlank(assumptions_constraints)) {
      userMessage += `**Assumptions & Constraints:**\n${assumptions_constraints}\n\n`;
    }
    if (!isBlank(functional_requirements)) {
      userMessage += `**Functional Requirements:**\n${functional_requirements}\n\n`;
    }
    if (!isBlank(dependencies)) {
      userMessage += `**Dependencies:**\n${dependencies}\n\n`;
    }

    if (!isBlank(non_functional_requirements)) {
      userMessage += `**Non-Functional Requirements:**\n${non_functional_requirements}\n\n`;
    }
    if (!isBlank(user_pain_points)) {
      userMessage += `**User Pain Points / Jobs to Be Done:**\n${user_pain_points}\n\n`;
    }
    if (!isBlank(competitive_context)) {
      userMessage += `**Competitive / Market Context:**\n${competitive_context}\n\n`;
    }
    if (!isBlank(technical_constraints)) {
      userMessage += `**Technical Constraints:**\n${technical_constraints}\n\n`;
    }
    if (!isBlank(success_metrics)) {
      userMessage += `**Success Metrics / KPIs:**\n${success_metrics}\n\n`;
    }
    if (!isBlank(target_timeline)) {
      userMessage += `**Target Release Timeline:**\n${target_timeline}\n\n`;
    }
    if (!isBlank(epic_impact)) {
      userMessage += `**Epic Impact Statement:**\n${epic_impact}\n\n`;
    }

    // Hard requirements for “build-ready”
    userMessage += `\nHard Requirements for Output Quality:\n`;
    userMessage += `1) PRD MUST include: explicit step-by-step user flows (project selection → generate artifact → persist → dashboard).\n`;
    userMessage += `2) PRD MUST include: a Data Model/Contracts section with a table defining at minimum project_artifacts fields and enums.\n`;
    userMessage += `3) PRD MUST include: Integration Points: edge function payload + expected response, including error responses.\n`;
    userMessage += `4) PRD MUST include: Error Handling & Observability: UI states, logs, and how to debug failed edge calls.\n`;
    userMessage += `5) Epics + Stories MUST be directly traceable to PRD requirements.\n`;
    userMessage += `6) Keep it realistic for an MVP: include an MVP cutline.\n\n`;
    userMessage += `Generate in Markdown optimized for Confluence/Jira/Linear copy/paste.\n`;

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
        temperature: 0.25,
        max_tokens: 5000,
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
        artifact_name: artifact_name || `PRD - ${new Date().toLocaleDateString()}`,
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
        },
        output_data: output,
        metadata: {
          selected_outputs,
          missing_inputs: missingInputs,
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration,
          model: 'gpt-4o',
          temperature: 0.25,
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
