// Project types for the PM Agent Operations Suite

export interface Project {
  id: number;
  created_at: string;
  name: string;
  description?: string;
  owner?: string;
  status: 'Active' | 'Archived';
  metadata?: Record<string, unknown>;
}

export interface ActiveProject {
  id: number;
  name: string;
  description?: string;
}
