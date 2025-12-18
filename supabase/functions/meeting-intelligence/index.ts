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

const SYSTEM_PROMPT = `You are a Meeting Intelligence Analyst specializing in extracting actionable insights from meeting transcripts.

Your role:
- Extract key decisions, action items, and next steps
- Identify participants and their contributions
- Create executive summaries
- Flag risks, blockers, and dependencies
- Organize information clearly

When analyzing meetings, you can generate:
- Executive Summary: High-level overview for stakeholders
- Action Items: Clear tasks with owners and deadlines
- Decisions Log: Key decisions made
- Follow-up Items: Topics requiring further discussion
- Meeting Notes: Comprehensive notes

Format output in markdown with clear sections and bullet points.`;

serve(async (req) => {
  const startTime = Date.now();
  console.log('📥 [Edge Function] Received request to meeting-intelligence');
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
      meeting_transcript,
      meeting_type,
      project_name,
      participants,
      project_id,
      artifact_name,
    } = await req.json();

    console.log('📋 [Payload]', {
      meeting_type,
      project_name,
      project_id,
      participants,
      transcript_length: meeting_transcript?.length || 0,
    });

    // Validation
    if (!meeting_transcript) {
      console.warn('⚠️ [Validation Error] Missing meeting_transcript');
      return new Response(
        JSON.stringify({
          error: 'Missing meeting_transcript',
          details: 'Please provide a meeting transcript to analyze',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
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
        },
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
        },
      );
    }

    // Build user message
    let userMessage = `Please analyze this meeting transcript:\n\n${meeting_transcript}`;

    if (meeting_type) {
      userMessage += `\n\nMeeting Type: ${meeting_type}`;
    }
    if (project_name) {
      userMessage += `\nProject Name: ${project_name}`;
    }
    if (participants) {
      userMessage += `\nParticipants: ${participants}`;
    }

    console.log('🤖 [OpenAI] Calling GPT-4o...');
    console.log('📊 [OpenAI] Message length:', userMessage.length);

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
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
      throw new Error(
        `OpenAI API error: ${error.error?.message || JSON.stringify(error)}`,
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
    // NEW: Store in project_artifacts table
    // =====================================================
    console.log('💾 [Database] Storing in project_artifacts...');

    const { data: artifact, error: dbError } = await supabase
      .from('project_artifacts')
      .insert({
        project_id: project_id, // Use UUID directly
        project_name: project_name || 'Unknown Project',
        artifact_type: 'meeting_intelligence',
        artifact_name:
          artifact_name ||
          `Meeting Analysis - ${new Date().toLocaleDateString()}`,
        input_data: {
          meeting_transcript,
          meeting_type,
          participants,
        },
        output_data: output,
        metadata: {
          meeting_type,
          participants,
          tokens_used: data.usage?.total_tokens,
          duration_ms: duration,
        },
        status: 'active',
      })
      .select()
      .single();

    if (dbError) {
      console.error('❌ [Database Error]', dbError);
      // Don't fail the whole request if DB insert fails - just log it
    } else {
      console.log('✅ [Database] Artifact saved', { artifact_id: artifact?.id });
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
      },
    );
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
      },
    );
  }
});