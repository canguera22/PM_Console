import { createClient } from '@supabase/supabase-js';

// Read Supabase configuration from environment variables
// These must be set in .env.local (see .env.example)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
    'See .env.example for template.'
  );
}

export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;

// Initialize Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to fetch from PostgREST API
export async function supabaseFetch<T>(
  path: string,
  options?: RequestInit,
  accessTokenOverride?: string
): Promise<T> {
  let accessToken = accessTokenOverride;
  if (!accessToken) {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token;
  }
  if (!accessToken) {
    throw new Error('No active auth session');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let details = response.statusText;
    try {
      const errorBody = await response.json();
      details = errorBody.message || errorBody.error || JSON.stringify(errorBody);
    } catch {
      // Fall back to status text when no JSON payload is available.
    }
    throw new Error(`API error (${response.status}): ${details}`);
  }

  return response.json();
}
