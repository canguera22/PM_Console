import { supabase } from './supabase';

interface AssignedProjectMember {
  project_id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'member';
}

export interface ProjectMember {
  user_id: string;
  email: string;
  role: 'owner' | 'member';
  created_at: string;
}

export async function assignProjectMemberByEmail(
  projectId: string,
  email: string,
  role: 'owner' | 'member' = 'member'
): Promise<AssignedProjectMember> {
  const { data, error } = await supabase.rpc('assign_project_member_by_email', {
    p_project_id: projectId,
    p_email: email,
    p_role: role,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Failed to assign project member');
  }

  return row as AssignedProjectMember;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase.rpc('list_project_members', {
    p_project_id: projectId,
  });

  if (error) throw error;
  return (data ?? []) as ProjectMember[];
}

export async function removeProjectMember(
  projectId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_project_member', {
    p_project_id: projectId,
    p_user_id: userId,
  });

  if (error) throw error;
  return Boolean(data);
}
