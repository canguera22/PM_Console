// Project API functions
import { supabase, supabaseFetch } from './supabase';
import { Project } from '@/types/project';

/**
 * Fetch all active projects from the database
 */
export async function fetchProjects(): Promise<Project[]> {
  const data = await supabaseFetch<Project[]>(
    '/projects?status=eq.active&order=created_at.desc'
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
  status: 'active' | 'archived' | 'deleted' = 'active'
): Promise<Project> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }

  const session = data.session;
  const userId = session?.user?.id;
  if (!userId || !session?.access_token) {
    throw new Error('No authenticated user found');
  }

  const { data: project, error: insertError } = await supabase
    .from('projects')
    .insert({
      name,
      description: description || null,
      status,
      owner_user_id: userId,
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  if (!project) {
    throw new Error('Failed to create project');
  }

  return project as Project;
}

/**
 * Get a project by ID (UUID string)
 */
export async function fetchProjectById(id: string): Promise<Project | null> {
  try {
    // UUIDs include hyphens; string interpolation is safe for PostgREST equality here.
    const data = await supabaseFetch<Project[]>(
      `/projects?id=eq.${id}&limit=1`
    );
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error fetching project:', error);
    return null;
  }
}
