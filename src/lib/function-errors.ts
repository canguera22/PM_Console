type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function pickString(
  source: UnknownRecord,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function parseResponseBodyMessage(response: Response): Promise<string | null> {
  try {
    const payload = (await response.clone().json()) as unknown;
    if (isRecord(payload)) {
      const message = pickString(payload, ['error', 'details', 'message', 'hint']);
      if (message) return message;
    }
  } catch {
    // fall through to text parse
  }

  try {
    const text = (await response.clone().text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function getFunctionErrorMessage(
  error: unknown,
  fallback: string
): Promise<string> {
  if (!isRecord(error)) return fallback;

  const directMessage = pickString(error, ['details', 'message', 'hint']);
  if (directMessage) return directMessage;

  const context = error.context;
  if (context instanceof Response) {
    const bodyMessage = await parseResponseBodyMessage(context);
    if (bodyMessage) return bodyMessage;

    if (context.statusText) {
      return `Request failed (${context.status}): ${context.statusText}`;
    }
  }

  return fallback;
}

