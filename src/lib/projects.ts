// Project API functions
import { supabaseFetch } from './supabase';
import { Project, ActiveProject } from '@/types/project';

/**
 * Fetch all active projects from the database
 */
export async function fetchProjects(): Promise<Project[]> {
  const data = await supabaseFetch<Project[]>(
    '/projects?status=eq.Active&order=created_at.desc'
  );
  return data;
}

/**
 * Fetch the default "Ad-hoc" project
 */
export async function fetchAdHocProject(): Promise<Project> {
  const data = await supabaseFetch<Project[]>(
    '/projects?name=eq.Ad-hoc&limit=1'
  );
  
  if (!data || data.length === 0) {
    throw new Error('Ad-hoc project not found');
  }
  
  return data[0];
}

/**
 * Create a new project
 */
export async function createProject(
  name: string,
  description?: string,
  status: 'Active' | 'Archived' = 'Active'
): Promise<Project> {
  const data = await supabaseFetch<Project[]>('/projects', {
    method: 'POST',
    body: JSON.stringify({
      name,
      description: description || null,
      status,
    }),
  });

  if (!data || data.length === 0) {
    throw new Error('Failed to create project');
  }

  return data[0];
}

/**
 * Get a project by ID
 */
export async function fetchProjectById(id: number): Promise<Project | null> {
  try {
    const data = await supabaseFetch<Project[]>(
      `/projects?id=eq.${id}&limit=1`
    );
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error fetching project:', error);
    return null;
  }
}
