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

const SYSTEM_PROMPT = `You are a Senior Product Management Advisor specializing in artifact critique, cross-module consistency checks, and actionable feedback.

Your role:
- Review product artifacts (PRDs, user stories, release notes, etc.)
- Identify gaps, risks, and assumptions
- Check cross-artifact consistency
- Provide actionable recommendations
- Ensure clarity and completeness

When reviewing artifacts, you provide:
1. Executive Verdict: Pass/Pass with Feedback/Needs Revision
2. Key Gaps: Missing information or unclear sections
3. Risks & Assumptions: Identified risks and unvalidated assumptions
4. Clarity Improvements: Suggestions for better communication
5. Cross-Artifact Consistency: Alignment with other project artifacts
6. Recommended Edits: Specific, actionable changes
7. Open Questions: Items requiring stakeholder input

Format output in markdown with clear sections and actionable feedback.`;

serve(async (req) => {
  const startTime = Date.now();
  console.log('📥 [Edge Function] Received request to pm-advisor');
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
      artifact_output,
      artifact_id,
      module_type,
      project_name,
      artifact_type,
      selected_outputs,
      context_artifacts,
      project_id,
      artifact_name
    } = await req.json();

    console.log('📋 [Payload]', {
      module_type,
      project_name,
      project_id,
      artifact_type,
      artifact_id,
      selected_outputs,
      artifact_output_length: artifact_output?.length || 0,
      has_context: !!context_artifacts,
    });

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

    // =====================================================
    // NEW: Fetch all artifacts for this project
    // =====================================================
    console.log('🔍 [Database] Fetching project artifacts...');
    
    const { data: projectArtifacts, error: fetchError } = await supabase
      .from('project_artifacts')
      .select('*')
      .eq('project_id', project_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('❌ [Database Error]', fetchError);
    } else {
      console.log('✅ [Database] Fetched artifacts', { count: projectArtifacts?.length });
    }

    // Get the artifact to review
    let artifactToReview = artifact_output;
    
    if (!artifactToReview && artifact_id && projectArtifacts) {
      const artifact = projectArtifacts.find((a: any) => a.id === artifact_id);
      if (artifact) {
        artifactToReview = artifact.output_data;
        console.log('✅ [Artifact] Loaded from database', { artifact_id });
      }
    }

    if (!artifactToReview) {
      console.warn('⚠️ [Validation Error] No artifact to review');
      return new Response(
        JSON.stringify({
          error: 'No artifact to review',
          details: 'Please provide artifact_output or artifact_id'
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

    // Build context from project artifacts
    const contextSummary = projectArtifacts?.map((a: any) => {
      return `**${a.artifact_type}** (${new Date(a.created_at).toLocaleDateString()}):
${a.artifact_name}
Excerpt: ${a.output_data.substring(0, 200)}...`;
    }).join('\n---\n') || '[No other artifacts found for this project]';

    // Build user message
    let userMessage = `Please review the following ${module_type} artifact:\n\n`;
    
    userMessage += `**Module Type:** ${module_type}\n`;
    userMessage += `**Artifact Type:** ${artifact_type || 'N/A'}\n`;
    userMessage += `**Project:** ${project_name || 'N/A'}\n\n`;
    
    if (selected_outputs && selected_outputs.length > 0) {
      userMessage += `**Selected Outputs:**\n${selected_outputs.map((o: string) => `- ${o}`).join('\n')}\n\n`;
    }
    
    userMessage += `**Artifact Content:**\n\`\`\`\n${artifactToReview}\n\`\`\`\n\n`;
    
    userMessage += `---\n**Cross-Module Context (Project: ${project_name || 'Unknown'}):**\n${contextSummary}\n---\n\n`;
    
    userMessage += `Please provide a structured review following the PM Advisor template with these sections:\n`;
    userMessage += `1. Executive Verdict\n`;
    userMessage += `2. Key Gaps\n`;
    userMessage += `3. Risks & Assumptions\n`;
    userMessage += `4. Clarity Improvements\n`;
    userMessage += `5. Cross-Artifact Consistency - IMPORTANT: Analyze alignment with other artifacts listed above\n`;
    userMessage += `6. Recommended Edits\n`;
    userMessage += `7. Open Questions\n`;

    console.log('🤖 [OpenAI] Calling GPT-4o for PM Advisor review...');
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

    console.log('✅ [Success] Generated PM Advisor feedback', { 
      duration: `${duration}ms`, 
      output_length: output.length,
      tokens_used: data.usage?.total_tokens || 'N/A'
    });

    // =====================================================
    // NEW: Store PM Advisor feedback in project_artifacts
    // =====================================================
    console.log('💾 [Database] Storing PM Advisor feedback...');
    
    const { data: advisorArtifact, error: dbError } = await supabase
      .from('project_artifacts')
      .insert({
        project_id: project_id,
        project_name: project_name || 'Unknown Project',
        artifact_type: 'pm_advisor',
        artifact_name: artifact_name || `PM Advisor Review - ${module_type} - ${new Date().toLocaleDateString()}`,
        input_data: {
          reviewed_artifact_id: artifact_id,
          module_type,
          context_artifacts_count: projectArtifacts?.length || 0
        },
        output_data: output,
        metadata: {
          module_type,
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration,
          context_artifacts: projectArtifacts?.map((a: any) => ({
            id: a.id,
            type: a.artifact_type,
            name: a.artifact_name,
            created_at: a.created_at
          }))
        },
        status: 'active'
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ [Database Error]', dbError);
    } else {
      console.log('✅ [Database] PM Advisor feedback saved', { artifact_id: advisorArtifact?.id });
    }

    // =====================================================
    // NEW: Update the reviewed artifact with advisor feedback
    // =====================================================
    if (artifact_id && !dbError) {
      console.log('💾 [Database] Updating reviewed artifact with feedback reference...');
      
      const { error: updateError } = await supabase
        .from('project_artifacts')
        .update({
          advisor_feedback: output,
          advisor_reviewed_at: new Date().toISOString()
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
        context_artifacts_count: projectArtifacts?.length || 0
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