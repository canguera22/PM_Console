import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// UUID validation helper
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const SYSTEM_PROMPT = `You are a Product Documentation Analyst specializing in creating comprehensive product documentation.

Your role:
- Create detailed PRDs (Product Requirements Documents)
- Write clear user stories with acceptance criteria
- Define epics and break them into manageable stories
- Structure technical specifications
- Follow best practices for JIRA, Linear, and Confluence

When generating documentation, you can create:
- PRD (Product Requirements Document): Complete product specification
- Epic: High-level initiative with business value
- User Stories: Specific user-facing features
- Technical Spec: Detailed technical implementation
- One-Pager: Executive summary for stakeholders

Format output in markdown optimized for copy/paste into PM tools.`;

serve(async (req) => {
  const startTime = Date.now();
  console.log('📥 [Edge Function] Received request to product-documentation');
  console.log('⏰ [Timestamp]', new Date().toISOString());
  
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
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
      artifact_name
    } = await req.json();

    console.log('📋 [Payload]', {
      selected_outputs,
      project_id,
      project_name,
      has_problem_statement: !!problem_statement,
      has_target_user_persona: !!target_user_persona,
      has_business_goals: !!business_goals,
      problem_statement_length: problem_statement?.length || 0,
    });

    // Validation
    if (!problem_statement) {
      console.warn('⚠️ [Validation Error] Missing problem_statement');
      return new Response(
        JSON.stringify({
          error: 'Missing problem_statement',
          details: 'Please provide a problem statement to generate documentation'
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          } 
        }
      );
    }

    // CRITICAL: Validate project_id is a valid UUID
    if (!project_id || !isValidUUID(project_id)) {
      console.warn('⚠️ [Validation Error] Invalid project_id - must be UUID');
      return new Response(
        JSON.stringify({
          error: 'Invalid project_id',
          details: 'project_id must be a valid UUID string'
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          } 
        }
      );
    }

    // Check OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error('🔑 [Config Error] OPENAI_API_KEY not set in environment');
      return new Response(
        JSON.stringify({
          error: 'OpenAI API key not configured',
          details: 'Please set OPENAI_API_KEY in Supabase secrets: supabase secrets set OPENAI_API_KEY=sk-...'
        }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*' 
          } 
        }
      );
    }

    // Build user message
    let userMessage = `Generate product documentation for the following:\n\n`;
    
    if (selected_outputs && selected_outputs.length > 0) {
      userMessage += `**Selected Output Types:**\n${selected_outputs.map((o: string) => `- ${o}`).join('\n')}\n\n`;
    }
    
    userMessage += `**Problem Statement:**\n${problem_statement}\n\n`;
    userMessage += `**Target User Persona:**\n${target_user_persona}\n\n`;
    userMessage += `**Business Goals:**\n${business_goals}\n\n`;
    userMessage += `**Assumptions & Constraints:**\n${assumptions_constraints}\n\n`;
    userMessage += `**Functional Requirements:**\n${functional_requirements}\n\n`;
    userMessage += `**Dependencies:**\n${dependencies}\n\n`;
    
    if (non_functional_requirements) {
      userMessage += `**Non-Functional Requirements:**\n${non_functional_requirements}\n\n`;
    }
    if (user_pain_points) {
      userMessage += `**User Pain Points / Jobs to Be Done:**\n${user_pain_points}\n\n`;
    }
    if (competitive_context) {
      userMessage += `**Competitive / Market Context:**\n${competitive_context}\n\n`;
    }
    if (technical_constraints) {
      userMessage += `**Technical Constraints:**\n${technical_constraints}\n\n`;
    }
    if (success_metrics) {
      userMessage += `**Success Metrics / KPIs:**\n${success_metrics}\n\n`;
    }
    if (target_timeline) {
      userMessage += `**Target Release Timeline:**\n${target_timeline}\n\n`;
    }
    if (epic_impact) {
      userMessage += `**Epic Impact Statement:**\n${epic_impact}\n\n`;
    }
    
    userMessage += `Please generate the requested documentation following PM best practices and formatting for tools like JIRA/Linear/Confluence.`;

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
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    console.log('📡 [OpenAI Response]', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ [OpenAI Error]', error);
      throw new Error(`OpenAI API error: ${error.error?.message || JSON.stringify(error)}`);
    }

    const data = await response.json();
    const output = data.choices[0].message.content;
    const duration = Date.now() - startTime;

    console.log('✅ [Success] Generated output', { 
      duration: `${duration}ms`, 
      output_length: output.length,
      tokens_used: data.usage?.total_tokens || 'N/A'
    });

    // =====================================================
    // NEW: Store in project_artifacts table
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
          epic_impact
        },
        output_data: output,
        metadata: {
          selected_outputs,
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration
        },
        status: 'active'
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ [Database Error]', dbError);
    } else {
      console.log('✅ [Database] Artifact saved', { artifact_id: artifact?.id });
    }

    return new Response(
      JSON.stringify({ 
        output,
        artifact_id: artifact?.id 
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
    const duration = Date.now() - startTime;
    console.error('💥 [Error]', { 
      error: error.message, 
      duration: `${duration}ms`,
      stack: error.stack 
    });

    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error',
        details: error.toString()
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