import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

type MemoryKind = 'document' | 'artifact' | 'task' | 'decision' | 'open_question' | 'assumption';

type MemoryCitation = {
  id: string;
  kind: MemoryKind;
  title: string;
  quote: string;
  score: number;
  route: string | null;
  routeLabel: string;
  badgeLabel?: string | null;
};

type MemoryItem = MemoryCitation & {
  content: string;
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

async function requireProjectAccess(req: Request, projectId: string): Promise<Response | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing bearer token' }), {
      status: 401,
      headers: corsHeaders(),
    });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
      status: 401,
      headers: corsHeaders(),
    });
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
    return new Response(JSON.stringify({ error: 'Unable to validate project access' }), {
      status: 500,
      headers: corsHeaders(),
    });
  }

  if (!ownedProject && !membership) {
    return new Response(JSON.stringify({ error: 'Forbidden: project access denied' }), {
      status: 403,
      headers: corsHeaders(),
    });
  }

  return null;
}

function tokenize(value: string) {
  const stopWords = new Set([
    'about', 'after', 'again', 'also', 'and', 'are', 'can', 'for', 'from', 'how',
    'into', 'its', 'just', 'that', 'the', 'their', 'them', 'this', 'what', 'when',
    'where', 'which', 'with', 'would', 'your',
  ]);

  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

function scoreText(text: string, terms: string[]) {
  const normalized = text.toLowerCase();
  return terms.reduce((score, term) => {
    const matches = normalized.split(term).length - 1;
    return score + matches;
  }, 0);
}

function chunkText(text: string, size: number) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: string[] = [];
  for (let index = 0; index < clean.length; index += size) {
    chunks.push(clean.slice(index, index + size));
  }
  return chunks;
}

function makeQuote(text: string, terms: string[]) {
  const sentences = String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const scoredSentences = sentences
    .map((sentence) => ({
      sentence,
      score: scoreText(sentence, terms),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredSentences.length > 0) {
    const quote = scoredSentences
      .slice(0, 2)
      .map((item) => item.sentence)
      .join(' ');
    return quote.length > 380 ? `${quote.slice(0, 377).trim()}...` : quote;
  }

  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > 220 ? `${clean.slice(0, 217).trim()}...` : clean;
}

function artifactRoute(artifactType: string, artifactId: string) {
  switch (artifactType) {
    case 'product_documentation':
      return `/documentation?artifact=${artifactId}`;
    case 'meeting_intelligence':
      return `/meetings?artifact=${artifactId}`;
    case 'release_communications':
      return `/releases?artifact=${artifactId}`;
    case 'prioritization':
      return `/prioritization?artifact=${artifactId}`;
    default:
      return null;
  }
}

function artifactBadgeLabel(artifactType: string) {
  switch (artifactType) {
    case 'product_documentation':
      return 'Product Doc';
    case 'meeting_intelligence':
      return 'Project Notes';
    case 'release_communications':
      return 'Release Comms';
    case 'prioritization':
      return 'Prioritization';
    default:
      return 'Artifact';
  }
}

function buildDocumentItems(documents: Array<Record<string, unknown>>, terms: string[]): MemoryItem[] {
  return documents.flatMap((document) => {
    const text = String(document.extracted_text || '').trim();
    if (!text) return [];

    return chunkText(text, 1100).map((chunk, index) => ({
      id: `${document.id}-chunk-${index}`,
      kind: 'document' as const,
      title: String(document.name || 'Context Document'),
      quote: makeQuote(chunk, terms),
      content: chunk,
      score: 0,
      route: '/context-docs',
      routeLabel: 'Open Context Docs',
      badgeLabel: 'Context Doc',
    }));
  });
}

function buildArtifactItems(artifacts: Array<Record<string, unknown>>, terms: string[]): MemoryItem[] {
  return artifacts.flatMap((artifact) => {
    const output = String(artifact.output_data || '').trim();
    if (!output) return [];

    const artifactType = String(artifact.artifact_type || 'artifact');
    const artifactId = String(artifact.id || '');
    return chunkText(output, 1200).map((chunk, index) => ({
      id: `${artifactId}-chunk-${index}`,
      kind: 'artifact' as const,
      title: String(artifact.artifact_name || artifactType.replace(/_/g, ' ')),
      quote: makeQuote(chunk, terms),
      content: chunk,
      score: 0,
      route: artifactRoute(artifactType, artifactId),
      routeLabel: 'Open Artifact',
      badgeLabel: artifactBadgeLabel(artifactType),
    }));
  });
}

function buildTaskItems(tasks: Array<Record<string, unknown>>) {
  return tasks.map((task) => {
    const title = String(task.title || 'Task');
    const details = [
      title,
      task.description ? `Description: ${String(task.description)}` : '',
      task.status ? `Status: ${String(task.status)}` : '',
      task.due_date ? `Due: ${String(task.due_date)}` : '',
      task.related_module ? `Related module: ${String(task.related_module)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      id: String(task.id),
      kind: 'task' as const,
      title,
      quote: task.description ? String(task.description).slice(0, 220) : `Status: ${String(task.status || 'open')}`,
      content: details,
      score: 0,
      route: '/tasks',
      routeLabel: 'Open Tasks',
      badgeLabel: String(task.status || 'open') === 'completed' ? 'Completed Task' : 'Open Task',
    };
  });
}

function buildDecisionItems(decisions: Array<Record<string, unknown>>) {
  return decisions.map((decision) => {
    const summary = String(decision.decision_summary || decision.decision_text || 'Decision');
    const evidence = String(decision.source_evidence || '').trim();
    const details = [
      `Decision: ${String(decision.decision_text || '')}`,
      decision.decision_maker ? `Made by: ${String(decision.decision_maker)}` : '',
      evidence ? `Evidence: ${evidence}` : '',
      decision.source_artifact_name ? `Source: ${String(decision.source_artifact_name)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const sourceArtifactType = String(decision.source_artifact_type || '');
    const sourceArtifactId = String(decision.source_artifact_id || '');

    return {
      id: String(decision.id),
      kind: 'decision' as const,
      title: summary,
      quote: evidence || String(decision.decision_text || '').slice(0, 220),
      content: details,
      score: 0,
      route: sourceArtifactId ? artifactRoute(sourceArtifactType, sourceArtifactId) : null,
      routeLabel: sourceArtifactId ? 'Open Source Note' : 'View Decision',
      badgeLabel: 'Decision',
    };
  });
}

function buildProjectMemoryItems(items: Array<Record<string, unknown>>) {
  return items.map((item) => {
    const itemType = String(item.item_type || 'open_question');
    const evidence = String(item.source_evidence || '').trim();
    const title = String(item.title || 'Project memory item');
    const detail = String(item.detail || '').trim();
    const ownerOrSource = String(item.owner_or_source || '').trim();
    const sourceArtifactType = String(item.source_artifact_type || '');
    const sourceArtifactId = String(item.source_artifact_id || '');

    const content = [
      itemType === 'assumption' ? `Assumption: ${title}` : `Open question: ${title}`,
      detail ? `Summary: ${detail}` : '',
      ownerOrSource ? `Source: ${ownerOrSource}` : '',
      evidence ? `Evidence: ${evidence}` : '',
      item.source_artifact_name ? `Origin: ${String(item.source_artifact_name)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      id: String(item.id),
      kind: itemType === 'assumption' ? ('assumption' as const) : ('open_question' as const),
      title,
      quote: evidence || detail || title,
      content,
      score: 0,
      route: sourceArtifactId ? artifactRoute(sourceArtifactType, sourceArtifactId) : null,
      routeLabel: sourceArtifactId ? 'Open Source Note' : 'View Source',
      badgeLabel: itemType === 'assumption' ? 'Assumption' : 'Open Question',
    };
  });
}

function uniqueTopMatches(items: MemoryItem[]) {
  const bestById = new Map<string, MemoryItem>();
  for (const item of items) {
    const existing = bestById.get(item.id);
    if (!existing || item.score > existing.score) {
      bestById.set(item.id, item);
    }
  }

  return Array.from(bestById.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const { project_id, project_name, query } = await req.json();

    if (!project_id || !isValidUUID(project_id)) {
      return new Response(JSON.stringify({ error: 'project_id must be a valid UUID' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    if (!query || !String(query).trim()) {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const accessError = await requireProjectAccess(req, project_id);
    if (accessError) return accessError;

    const [documentsResult, artifactsResult, tasksResult, decisionsResult, memoryItemsResult] = await Promise.all([
      supabase
        .from('project_documents')
        .select('id, name, extracted_text')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .not('extracted_text', 'is', null),
      supabase
        .from('project_artifacts')
        .select('id, artifact_type, artifact_name, output_data')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .not('output_data', 'is', null)
        .neq('artifact_type', 'pm_advisor_feedback')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('project_tasks')
        .select('id, title, description, due_date, related_module, status')
        .eq('project_id', project_id)
        .in('status', ['open', 'completed'])
        .order('updated_at', { ascending: false })
        .limit(80),
      supabase
        .from('project_decisions')
        .select('id, decision_text, decision_summary, decision_maker, source_evidence, source_artifact_id, source_artifact_type, source_artifact_name, status')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('project_memory_items')
        .select('id, item_type, title, detail, owner_or_source, source_evidence, source_artifact_id, source_artifact_type, source_artifact_name, status')
        .eq('project_id', project_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(120),
    ]);

    if (documentsResult.error || artifactsResult.error || tasksResult.error || decisionsResult.error || memoryItemsResult.error) {
      throw new Error(
        documentsResult.error?.message ||
          artifactsResult.error?.message ||
          tasksResult.error?.message ||
          decisionsResult.error?.message ||
          memoryItemsResult.error?.message ||
          'Failed to load project memory'
      );
    }

    const terms = tokenize(query);
    const memoryItems = [
      ...buildDocumentItems(documentsResult.data ?? [], terms),
      ...buildArtifactItems(artifactsResult.data ?? [], terms),
      ...buildTaskItems(tasksResult.data ?? []),
      ...buildDecisionItems(decisionsResult.data ?? []),
      ...buildProjectMemoryItems(memoryItemsResult.data ?? []),
    ]
      .map((item) => ({
        ...item,
        score: scoreText(`${item.title}\n${item.content}`, terms),
      }))
      .filter((item) => item.score > 0);

    const topMatches = uniqueTopMatches(memoryItems);

    if (topMatches.length === 0) {
      return new Response(
        JSON.stringify({
          answer:
            'I could not find a grounded answer for that in this project yet. Try different terms, or add the missing notes, context docs, or artifacts first.',
          citations: [],
        }),
        {
          status: 200,
          headers: corsHeaders(),
        }
      );
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          answer: `I found relevant project memory for "${query}" in the cited sources below.`,
          citations: topMatches.map(({ content: _content, ...citation }) => citation),
        }),
        {
          status: 200,
          headers: corsHeaders(),
        }
      );
    }

    const evidenceText = topMatches
      .map((match, index) => {
        return [
          `Source ${index + 1}`,
          `kind: ${match.kind}`,
          `title: ${match.title}`,
          `badge: ${match.badgeLabel ?? match.kind}`,
          `quote: ${match.quote}`,
          `content: ${match.content}`,
        ].join('\n');
      })
      .join('\n\n---\n\n');

    const systemPrompt = `You are the Product Workbench Project Memory Assistant.

Answer only from the provided project evidence.

Rules:
- Be concise and directly answer the user's question.
- If the evidence is incomplete, say what is known and what is missing.
- Do not invent facts, dates, decisions, user stories, owners, scope, assumptions, or answers to open questions.
- If the user asks for "all" relevant items, summarize the known set from the evidence provided.
- Distinguish clearly between confirmed decisions, unresolved open questions, and current assumptions.
- Mention source titles naturally when useful, but do not fabricate sources.
- Return plain markdown only.`;

    const userPrompt = `Project: ${project_name || '(not provided)'}

User question:
${query}

Available evidence:
${evidenceText}

Write a grounded answer using only the evidence above.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.2-chat-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 900,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error: ${errorText}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      throw new Error('Project memory returned no answer');
    }

    return new Response(
      JSON.stringify({
        answer,
        citations: topMatches.map(({ content: _content, ...citation }) => citation),
      }),
      {
        status: 200,
        headers: corsHeaders(),
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: corsHeaders(),
      }
    );
  }
});
