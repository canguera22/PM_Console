// Active Project Context - Global state management for active project
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ActiveProject } from '@/types/project';
import { fetchAdHocProject, fetchProjectById } from '@/lib/projects';

interface ActiveProjectContextType {
  activeProject: ActiveProject | null;
  setActiveProject: (project: ActiveProject) => void;
  isLoading: boolean;
}

const ActiveProjectContext = createContext<ActiveProjectContextType | undefined>(undefined);

const STORAGE_KEY = 'pm_suite_active_project_id';

// Simple UUID v4-ish check (good enough for guarding stale numeric IDs)
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void initializeActiveProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeActiveProject = async () => {
    try {
      setIsLoading(true);

      // Check localStorage for saved project ID
      const savedProjectId = localStorage.getItem(STORAGE_KEY);

      // If we find a saved ID but it's not a UUID (likely legacy numeric), clear it.
      if (savedProjectId && !isUuid(savedProjectId)) {
        localStorage.removeItem(STORAGE_KEY);
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
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // Fallback to Ad-hoc project
      const adHocProject = await fetchAdHocProject();
      const adHoc: ActiveProject = {
        id: adHocProject.id,
        name: adHocProject.name,
        description: adHocProject.description,
      };

      setActiveProjectState(adHoc);
      localStorage.setItem(STORAGE_KEY, adHocProject.id);
    } catch (error) {
      console.error('Error initializing active project:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setActiveProject = (project: ActiveProject) => {
    setActiveProjectState(project);
    localStorage.setItem(STORAGE_KEY, project.id);
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
