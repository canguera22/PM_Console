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

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize active project on mount
  useEffect(() => {
    initializeActiveProject();
  }, []);

  const initializeActiveProject = async () => {
    try {
      setIsLoading(true);
      
      // Check localStorage for saved project ID
      const savedProjectId = localStorage.getItem(STORAGE_KEY);
      
      if (savedProjectId) {
        const projectId = parseInt(savedProjectId, 10);
        const project = await fetchProjectById(projectId);
        
        if (project && project.status === 'Active') {
          setActiveProjectState({
            id: project.id,
            name: project.name,
            description: project.description,
          });
          return;
        }
      }
      
      // Fallback to Ad-hoc project
      const adHocProject = await fetchAdHocProject();
      setActiveProjectState({
        id: adHocProject.id,
        name: adHocProject.name,
        description: adHocProject.description,
      });
      localStorage.setItem(STORAGE_KEY, adHocProject.id.toString());
    } catch (error) {
      console.error('Error initializing active project:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setActiveProject = (project: ActiveProject) => {
    setActiveProjectState(project);
    localStorage.setItem(STORAGE_KEY, project.id.toString());
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
