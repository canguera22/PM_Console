import type { ExtractedActionItem } from '@/types/meeting';

export function extractActionItemsFromMarkdown(markdown: string): ExtractedActionItem[] {
  const text = String(markdown || '');
  const sectionMatch = text.match(
    /(?:^|\n)#{1,3}\s*(?:Proposed\s+)?Action Items\s*\n([\s\S]*?)(?=\n#{1,3}\s|\nConflicts with Context Documents|$)/i
  );

  if (!sectionMatch?.[1]) return [];

  const lines = sectionMatch[1].split('\n').filter((line) => line.trim());
  const candidates: ExtractedActionItem[] = [];
  let pending: ExtractedActionItem | null = null;

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
      if (/^owner$/i.test(label)) pending.owner = value || null;
      if (/^due$/i.test(label)) pending.due_date = parseLooseDueDate(value);
      continue;
    }

    const item = actionItemFromLine(cleaned, candidates.length);
    if (item) {
      candidates.push(item);
      pending = item;
    }
  }

  return candidates;
}

export function isPlaceholderActionItem(item: ExtractedActionItem): boolean {
  const values = [item.title, item.description, item.source_evidence].filter(Boolean);
  return values.length > 0 && values.every((value) => shouldSkipActionLine(String(value)));
}

function actionItemFromLine(line: string, index: number): ExtractedActionItem | null {
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
    /^no\b.*\b(action items?|follow-?ups?|tasks?)\b.*\b(identified|found|noted|captured|provided)\b/i.test(plain) ||
    /^no explicit\b.*\b(action items?|follow-?ups?|tasks?)\b/i.test(plain) ||
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
    .replace(/["]/g, '')
    .trim();

  return owner || null;
}

function parseLooseDueDate(value: string) {
  const explicit = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicit) return explicit[1];

  const monthMatch = value.match(
    /\b(?:by|due|on)?\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?(?:day)?[,]?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
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

  return `${new Date().getFullYear()}-${month}-${day}`;
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
