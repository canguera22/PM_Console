// Active Project Context - Global state management for active project
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ActiveProject } from '@/types/project';
import { fetchProjectById, fetchProjects } from '@/lib/projects';
import { useAuth } from '@/contexts/AuthContext';

interface ActiveProjectContextType {
  activeProject: ActiveProject | null;
  setActiveProject: (project: ActiveProject) => void;
  isLoading: boolean;
}

const ActiveProjectContext = createContext<ActiveProjectContextType | undefined>(undefined);

const storageKeyForUser = (userId: string) => `pm_suite_active_project_id_${userId}`;

// Simple UUID v4-ish check (good enough for guarding stale numeric IDs)
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setActiveProjectState(null);
      setIsLoading(false);
      return;
    }

    void initializeActiveProject(user.id);
  }, [user, authLoading]);

  const initializeActiveProject = async (userId: string) => {
    try {
      setIsLoading(true);
      const storageKey = storageKeyForUser(userId);

      // Check localStorage for saved project ID
      const savedProjectId = localStorage.getItem(storageKey);

      // If we find a saved ID but it's not a UUID (likely legacy numeric), clear it.
      if (savedProjectId && !isUuid(savedProjectId)) {
        localStorage.removeItem(storageKey);
      }

      // Load saved project if valid UUID
      if (savedProjectId && isUuid(savedProjectId)) {
        const project = await fetchProjectById(savedProjectId);

        if (project && project.status === 'active') {
          setActiveProjectState({
            id: project.id,
            name: project.name,
            description: project.description,
          });
          return;
        } else {
          // Saved project no longer valid/active — clear so we don't keep trying it
          localStorage.removeItem(storageKey);
        }
      }

      // Fallback to any accessible project
      const accessibleProjects = await fetchProjects();
      if (accessibleProjects.length > 0) {
        const preferredProject =
          accessibleProjects.find((project) => project.name === 'Ad-hoc') ??
          accessibleProjects[0];

        setActiveProjectState({
          id: preferredProject.id,
          name: preferredProject.name,
          description: preferredProject.description,
        });
        localStorage.setItem(storageKey, preferredProject.id);
        return;
      }

      // No accessible projects yet. Leave selection empty and let onboarding/create flow handle it.
      setActiveProjectState(null);
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Error initializing active project:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setActiveProject = (project: ActiveProject) => {
    setActiveProjectState(project);
    if (user?.id) {
      localStorage.setItem(storageKeyForUser(user.id), project.id);
    }
  };

  return (
    <ActiveProjectContext.Provider value={{ activeProject, setActiveProject, isLoading }}>
      {children}
    </ActiveProjectContext.Provider>
  );
}

export function useActiveProject() {
  const context = useContext(ActiveProjectContext);
  if (context === undefined) {
    throw new Error('useActiveProject must be used within an ActiveProjectProvider');
  }
  return context;
}
