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

async function requireProjectAccess(req: Request, projectId: string): Promise<Response | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return new Response(
      JSON.stringify({ error: 'Missing bearer token' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return new Response(
      JSON.stringify({ error: 'Invalid authentication token' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  const [{ data: ownedProject, error: ownerError }, { data: membership, error: memberError }] =
    await Promise.all([
      supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('owner_user_id', userId)
        .maybeSingle(),
      supabase
        .from('project_members')
        .select('project_id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (ownerError || memberError) {
    console.error('❌ [Auth Error] Failed to validate project access', { ownerError, memberError });
    return new Response(
      JSON.stringify({ error: 'Unable to validate project access' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  if (!ownedProject && !membership) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: project access denied' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }

  return null;
}

// =====================================================
// NEW: Fetch project context documents
// =====================================================



const SYSTEM_PROMPT = `You are a Project Notes Intelligence Analyst specializing in turning rough PM notes into organized project memory and reviewable follow-up tasks. You are also responsible for validating note-derived claims against known project context.

Your role:
- Convert rough notes into polished, structured project notes without inventing facts
- Extract key decisions, action items, and next steps
- Identify participants and their contributions when the source content makes them clear
- Create executive summaries
- Flag risks, blockers, and dependencies
- Organize information clearly
- Explicitly distinguish between proposed decisions and validated decisions


When the input mode is "transcript", produce a full notes analysis that can include:
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

function extractJsonObject(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // Continue to brace extraction.
      }
    }

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function normalizeActionItems(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      const row = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const title = typeof row.title === 'string' ? row.title.trim() : '';
      if (!title) return null;

      const dueDate = typeof row.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.due_date)
        ? row.due_date
        : null;
      const confidence = row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low'
        ? row.confidence
        : null;

      return {
        id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `action-${index + 1}`,
        title,
        description: typeof row.description === 'string' && row.description.trim() ? row.description.trim() : null,
        due_date: dueDate,
        owner: typeof row.owner === 'string' && row.owner.trim() ? row.owner.trim() : null,
        source_evidence: typeof row.source_evidence === 'string' && row.source_evidence.trim() ? row.source_evidence.trim() : null,
        confidence,
        context_validation: typeof row.context_validation === 'string' && row.context_validation.trim() ? row.context_validation.trim() : null,
        related_module: typeof row.related_module === 'string' && row.related_module.trim() ? row.related_module.trim() : null,
      };
    })
    .filter(Boolean);
}

function extractActionItemsFromMarkdown(markdown: string) {
  const text = String(markdown || '');
  const sectionMatch = text.match(
    /(?:^|\n)#{1,3}\s*(?:Proposed\s+)?Action Items\s*\n([\s\S]*?)(?=\n#{1,3}\s|\nConflicts with Context Documents|$)/i,
  );

  if (!sectionMatch?.[1]) return [];

  const lines = sectionMatch[1]
    .split('\n')
    .filter((line) => line.trim());

  const candidates: Array<Record<string, unknown>> = [];
  let pending: Record<string, unknown> | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const cleaned = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s*/, '').trim();
    if (!cleaned || shouldSkipActionLine(cleaned)) continue;

    const isNestedBullet = /^\s{2,}[-*]\s+/.test(rawLine);
    if (isNestedBullet && pending) {
      pending.description = [pending.description, cleaned].filter(Boolean).join('\n');
      continue;
    }

    const isSubDetail = /^(owner|due|source|context|confidence):/i.test(cleaned);
    if (isSubDetail && pending) {
      const [label, ...rest] = cleaned.split(':');
      const value = rest.join(':').trim();
      if (/^owner$/i.test(label)) pending.owner = value;
      if (/^due$/i.test(label)) pending.due_date = parseLooseDueDate(value);
      continue;
    }

    const item = actionItemFromLine(cleaned, candidates.length);
    if (item) {
      candidates.push(item);
      pending = item;
    }
  }

  return normalizeActionItems(candidates);
}

function actionItemFromLine(line: string, index: number) {
  const normalized = stripInlineMarkdown(line).replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const dueDate = parseLooseDueDate(normalized);
  let owner: string | null = null;
  let title = normalized;

  const ownerDashMatch = normalized.match(/^([^:–—-]{2,60})\s+[–—-]\s+(.+)$/);
  if (ownerDashMatch && looksLikeOwner(ownerDashMatch[1])) {
    owner = cleanOwner(ownerDashMatch[1]);
    title = ownerDashMatch[2].trim();
  }

  title = title
    .replace(/\bby\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?(?:day)?[,]?\s+[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?\b\.?$/i, '')
    .replace(/\bdue\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?(?:day)?[,]?\s+[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?\b\.?$/i, '')
    .replace(/\bon\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?(?:day)?[,]?\s+[A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?\b\.?$/i, '')
    .replace(/\bdue\s+\d{4}-\d{2}-\d{2}\b\.?$/i, '')
    .replace(/\bby\s+\d{4}-\d{2}-\d{2}\b\.?$/i, '')
    .replace(/:$/, '')
    .replace(/\.$/, '')
    .trim();

  if (!title || /^confirm:?$/i.test(title)) return null;

  return {
    id: `action-${index + 1}`,
    title,
    description: normalized,
    due_date: dueDate,
    owner,
    source_evidence: normalized,
    confidence: 'medium',
    context_validation: 'Extracted from the generated Action Items section.',
    related_module: inferRelatedModule(title),
  };
}

function shouldSkipActionLine(line: string) {
  const plain = line.replace(/[*_]/g, '').trim();
  return (
    /^-{3,}$/.test(plain) ||
    /^\(?no owners?\b/i.test(plain) ||
    /^none identified/i.test(plain) ||
    /^n\/a$/i.test(plain)
  );
}

function stripInlineMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .trim();
}

function looksLikeOwner(value: string) {
  const normalized = value.trim();
  return (
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(normalized) ||
    /\b(team|owner|ops|operations|product|engineering|design|qa)\b/i.test(normalized)
  );
}

function cleanOwner(value: string) {
  const owner = value
    .replace(/^owner:\s*/i, '')
    .replace(/^owner\s+/i, '')
    .replace(/[“”"]/g, '')
    .trim();

  return owner || null;
}

function parseLooseDueDate(value: string) {
  const explicit = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit) return explicit[1];

  const monthMatch = value.match(
    /\b(?:by|due|on)?\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?(?:day)?[,]?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );

  if (!monthMatch) return null;

  const monthLookup: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  const month = monthLookup[monthMatch[1].slice(0, 3).toLowerCase()];
  const day = monthMatch[2].padStart(2, '0');
  if (!month) return null;

  return `2026-${month}-${day}`;
}

function inferRelatedModule(title: string) {
  const lower = title.toLowerCase();
  if (
    lower.includes('release note') ||
    lower.includes('release communication') ||
    lower.includes('communication') ||
    lower.includes('faq') ||
    lower.includes('customer comm')
  ) {
    return 'release_communications';
  }
  if (lower.includes('prd') || lower.includes('requirement') || lower.includes('spec')) {
    return 'product_documentation';
  }
  if (lower.includes('priorit') || lower.includes('backlog') || lower.includes('wsjf')) {
    return 'prioritization';
  }
  return 'meeting_intelligence';
}

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

    const accessError = await requireProjectAccess(req, project_id);
    if (accessError) {
      return accessError;
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
            'Clean up the raw notes into polished, easy-to-scan project notes.',
            'Preserve the original meaning and uncertainty.',
            'Use markdown headings and bullets.',
            'If action items are identifiable, include owners only when explicitly present.',
            'If decisions are uncertain, list them under open questions instead of asserting them as final.',
            'Recommended markdown sections: ## Executive Summary, ## Cleaned Notes, ## Proposed Action Items, ## Decisions and Open Questions.',
          ].join('\n')
        : [
            'Input mode: transcript',
            'Analyze the transcript and extract structured project notes intelligence.',
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

    userMessage += `\n\nReturn ONLY valid JSON matching this shape:
{
  "output": "markdown string for the user",
  "action_items": [
    {
      "id": "stable short id",
      "title": "imperative task title",
      "description": "optional detail from notes",
      "due_date": "YYYY-MM-DD or null",
      "owner": "person or team if explicitly present, else null",
      "source_evidence": "short quote or paraphrase from the notes",
      "confidence": "high|medium|low",
      "context_validation": "how this item aligns/conflicts with provided docs and artifacts",
      "related_module": "meeting_intelligence|product_documentation|release_communications|prioritization|null"
    }
  ]
}

Rules for action_items:
- Extract only actionable commitments, follow-ups, decisions requiring work, or due-date-bound reminders.
- Do not invent due dates. If notes say "Friday", infer the calendar date only when enough date context is available; otherwise use null and explain in description.
- Use related_module only when the action clearly maps to an existing PM Console module.
- If no action items exist, return an empty array.`;

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
    const rawOutput = data.choices[0].message.content;
    const parsedOutput = extractJsonObject(rawOutput);
    const output =
      parsedOutput && typeof parsedOutput.output === 'string'
        ? parsedOutput.output
        : rawOutput;
    const normalizedJsonActionItems = normalizeActionItems(parsedOutput?.action_items);
    const actionItems = normalizedJsonActionItems.length > 0
      ? normalizedJsonActionItems
      : extractActionItemsFromMarkdown(output);
    const duration = Date.now() - startTime;

    console.log('✅ [Success] Generated output', {
      duration: `${duration}ms`,
      output_length: output.length,
      action_items: actionItems.length,
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
          action_items: actionItems,
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
        action_items: actionItems,
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
