import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// UUID validation helper
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

const SYSTEM_PROMPT = `You are a WSJF Prioritization Analyst specializing in backlog prioritization and strategic portfolio management.

Your role:
- Calculate WSJF (Weighted Shortest Job First) scores
- Evaluate Business Value, Time Criticality, and Risk Reduction
- Normalize scores and rank items
- Provide strategic recommendations
- Identify dependencies and risks

When calculating WSJF, you evaluate:
- Business Value: Revenue impact, customer satisfaction, strategic alignment
- Time Criticality: Urgency, competitive advantage, regulatory requirements
- Risk Reduction/Opportunity Enablement: Technical debt, enabler work
- Job Size (Effort): Development complexity and time

WSJF Score = (Business Value + Time Criticality + Risk Reduction) / Job Size

Format output in markdown with clear tables and prioritized recommendations.`;

serve(async (req) => {
  const startTime = Date.now();
  console.log('📥 [Edge Function] Received request to prioritization');
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
      csv_content,
      effort_field_name,
      max_score_per_factor,
      normalize_scores,
      initiative_name,
      default_effort_scale,
      notes_context,
      selected_outputs,
      top_n_items,
      project_id,
      project_name,
      artifact_name
    } = await req.json();

    console.log('📋 [Payload]', {
      initiative_name,
      effort_field_name,
      max_score_per_factor,
      normalize_scores,
      selected_outputs,
      top_n_items,
      project_id,
      project_name,
      csv_content_length: csv_content?.length || 0,
    });

    // Validation
    if (!csv_content) {
      console.warn('⚠️ [Validation Error] Missing csv_content');
      return new Response(
        JSON.stringify({
          error: 'Missing csv_content',
          details: 'Please provide CSV content to calculate WSJF scores'
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
    let userMessage = `Please calculate WSJF scores for this backlog:\n\n`;
    
    userMessage += `CSV Content:\n${csv_content}\n\n`;
    
    userMessage += `Configuration:\n`;
    userMessage += `- Effort Field Name: ${effort_field_name || 'Story Points'}\n`;
    userMessage += `- Max Score Per Factor: ${max_score_per_factor || 10}\n`;
    userMessage += `- Normalize Scores: ${normalize_scores ? 'Yes' : 'No'}\n`;
    
    if (initiative_name) {
      userMessage += `- Initiative/Backlog Name: ${initiative_name}\n`;
    }
    if (default_effort_scale) {
      userMessage += `- Default Effort Scale: ${default_effort_scale}\n`;
    }
    if (notes_context) {
      userMessage += `\nAdditional Context:\n${notes_context}\n`;
    }
    
    if (selected_outputs && selected_outputs.length > 0) {
      userMessage += `\nRequested Outputs:\n`;
      selected_outputs.forEach((output: string) => {
        userMessage += `- ${output}\n`;
      });
    }
    
    if (selected_outputs?.includes('Top N Items Summary') && top_n_items) {
      userMessage += `\nShow top ${top_n_items} items.\n`;
    }

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
        project_id: project_id, // Use UUID directly
        project_name: project_name || 'Unknown Project',
        artifact_type: 'prioritization',
        artifact_name: artifact_name || `WSJF Analysis - ${new Date().toLocaleDateString()}`,
        input_data: {
          csv_content,
          effort_field_name,
          max_score_per_factor,
          normalize_scores,
          initiative_name,
          default_effort_scale,
          notes_context
        },
        output_data: output,
        metadata: {
          initiative_name,
          selected_outputs,
          top_n_items,
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