import React, { createContext, useContext, useState, useEffect } from 'react';

interface Project {
  id: string; // UUID
  name: string;
  description?: string;
  created_at?: string;
}

interface ProjectContextType {
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load active project from localStorage on mount
    const savedProject = localStorage.getItem('activeProject');
    if (savedProject) {
      try {
        setActiveProject(JSON.parse(savedProject));
      } catch (error) {
        console.error('Failed to parse saved project:', error);
        localStorage.removeItem('activeProject');
      }
    }
    setIsLoading(false);
  }, []);

  const handleSetActiveProject = (project: Project | null) => {
    setActiveProject(project);
    if (project) {
      localStorage.setItem('activeProject', JSON.stringify(project));
    } else {
      localStorage.removeItem('activeProject');
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        setActiveProject: handleSetActiveProject,
        isLoading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
