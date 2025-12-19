// Project types for the PM Agent Operations Suite

export interface Project {
  id: string;
  created_at: string;
  name: string;
  description: string | null; // <- important: Supabase returns null for nullable columns
  owner?: string | null;
  status: 'active' | 'archived' | 'deleted';
  metadata?: Record<string, unknown> | null;
}

export interface ActiveProject {
  id: string;
  name: string;
  description: string | null;
}
