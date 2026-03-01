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

// =====================================================
// NEW: Fetch project context documents
// =====================================================



const SYSTEM_PROMPT = `You are a Meeting Intelligence Analyst specializing in extracting actionable insights from meeting transcripts and cleaning up rough meeting notes. You are also responsible for validating decisions against known constraints.

Your role:
- Convert rough notes into polished, structured meeting notes without inventing facts
- Extract key decisions, action items, and next steps
- Identify participants and their contributions when the source content makes them clear
- Create executive summaries
- Flag risks, blockers, and dependencies
- Organize information clearly
- Explicitly distinguish between proposed decisions and validated decisions


When the input mode is "transcript", produce a full meeting analysis that can include:
- Executive Summary: High-level overview for stakeholders
- Action Items: Clear tasks with owners and deadlines
- Decisions Log: Key decisions made
- Follow-up Items: Topics requiring further discussion
- Meeting Notes: Comprehensive notes

When the input mode is "notes_cleanup", produce cleaned and organized notes:
- Cleaned Notes: Rewrite the raw notes into coherent markdown
- Action Items: Include only if the notes imply them
- Decisions and Open Questions: Distinguish confirmed decisions from unresolved items
- Do not fabricate details that are not present in the raw notes

SOURCE AUTHORITY RULES

- Meeting transcripts reflect discussion and decisions made with incomplete information.
- Uploaded context documents are considered factual and authoritative.
- If a meeting decision conflicts with authoritative context:
  - You MUST call out the conflict explicitly.
  - You MUST NOT treat the meeting decision as final.
  - You MUST recommend a revised decision based on the authoritative information.

REQUIRED OUTPUT SECTION

## Conflicts with Context Documents
- This section must appear at the very end of the output.
- Verify the meeting transcript-derived conclusions against:
  - uploaded project context documents
  - other previously generated project artifacts (if provided)
- If conflicts exist, list each conflict and explain the impact.
- If NO conflicts exist, explicitly state: "No conflicts identified"
- This section must always be present



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
      input_mode,
      meeting_type,
      project_name,
      participants,
      project_id,
      artifact_name,
    } = await req.json();

    console.log('📋 [Payload]', {
      input_mode,
      meeting_type,
      project_name,
      project_id,
      participants,
      transcript_length: meeting_transcript?.length || 0,
    });

    const normalizedInputMode =
      input_mode === 'notes_cleanup' ? 'notes_cleanup' : 'transcript';

    // Validation
    if (!meeting_transcript) {
      console.warn('⚠️ [Validation Error] Missing source content');
      return new Response(
        JSON.stringify({
          error: 'Missing meeting_transcript',
          details:
            normalizedInputMode === 'notes_cleanup'
              ? 'Please provide raw meeting notes to clean up'
              : 'Please provide a meeting transcript to analyze',
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

    let projectContextText = '';
    let projectArtifactContextText = '';

      const { data: docs, error: docsError } = await supabase
        .from('project_documents')
        .select('name, extracted_text')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .not('extracted_text', 'is', null);

      if (!docsError && docs && docs.length > 0) {
        projectContextText =
          `\n\nAUTHORITATIVE PROJECT CONTEXT:\n` +
          docs
            .map(
              (d) =>
                `\n---\nDocument: ${d.name}\n${d.extracted_text}`
            )
            .join('\n');
      }

      const { data: artifacts, error: artifactsError } = await supabase
        .from('project_artifacts')
        .select('artifact_type, artifact_name, output_data, created_at')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .not('output_data', 'is', null)
        .neq('artifact_type', 'pm_advisor_feedback')
        .order('created_at', { ascending: false });

      if (!artifactsError && artifacts && artifacts.length > 0) {
        projectArtifactContextText =
          `\n\nPREVIOUS PROJECT ARTIFACTS (REFERENCE FOR CONSISTENCY/CROSS-CHECKS):\n` +
          artifacts
            .map((a) => {
              const excerpt = (a.output_data || '').slice(0, 1200);
              return `\n---\nArtifact: ${a.artifact_name || a.artifact_type} (${a.artifact_type})\n${excerpt}`;
            })
            .join('\n');
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

    const modeSpecificInstructions =
      normalizedInputMode === 'notes_cleanup'
        ? [
            'Input mode: notes_cleanup',
            'Clean up the raw notes into polished, easy-to-scan meeting notes.',
            'Preserve the original meaning and uncertainty.',
            'Use markdown headings and bullets.',
            'If action items are identifiable, include owners only when explicitly present.',
            'If decisions are uncertain, list them under open questions instead of asserting them as final.',
            'Recommended sections: ## Executive Summary, ## Cleaned Notes, ## Action Items, ## Decisions and Open Questions.',
          ].join('\n')
        : [
            'Input mode: transcript',
            'Analyze the transcript and extract structured meeting intelligence.',
            'Recommended sections: ## Executive Summary, ## Action Items, ## Decisions Log, ## Follow-up Items, ## Meeting Notes.',
          ].join('\n');

    const sourceLabel =
      normalizedInputMode === 'notes_cleanup' ? 'raw meeting notes' : 'meeting transcript';

    // Build user message
    let userMessage = `Please process this ${sourceLabel}:\n\n${meeting_transcript}\n\n${modeSpecificInstructions}${projectContextText}${projectArtifactContextText}`;

    if (meeting_type) {
      userMessage += `\n\nMeeting Type: ${meeting_type}`;
    }
    if (project_name) {
      userMessage += `\nProject Name: ${project_name}`;
    }
    if (participants) {
      userMessage += `\nParticipants: ${participants}`;
    }
    userMessage += `\n\nREQUIRED FINAL SECTION:\n- End the output with exactly this heading: "## Conflicts with Context Documents"\n- In that section, compare your output against uploaded project documents and prior project artifacts provided above.\n- If none conflict, write: "No conflicts identified".`;

    console.log('🤖 [OpenAI] Calling GPT-5.2 Chat...');
    console.log('📊 [OpenAI] Message length:', userMessage.length);

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.2-chat-latest',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: 4000,
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
          `${
            normalizedInputMode === 'notes_cleanup'
              ? 'Cleaned Meeting Notes'
              : 'Meeting Analysis'
          } - ${new Date().toLocaleDateString()}`,
        input_data: {
          schema_version: 2,
          input_mode: normalizedInputMode,
          input: {
            source_text: meeting_transcript,
            meeting_transcript:
              normalizedInputMode === 'transcript' ? meeting_transcript : undefined,
            raw_notes:
              normalizedInputMode === 'notes_cleanup' ? meeting_transcript : undefined,
            meeting_type,
            participants,
          },
        },
        output_data: output,
        metadata: {
          input_schema_version: 2,
          input_mode: normalizedInputMode,
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
