// Active Project Selector - Dropdown component for header
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronDown, FolderOpen, Plus } from 'lucide-react';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { fetchProjects } from '@/lib/projects';
import { Project } from '@/types/project';
import { CreateProjectModal } from './CreateProjectModal';
import { useToast } from '@/hooks/use-toast';

export function ActiveProjectSelector() {
  const { activeProject, setActiveProject, isLoading: contextLoading } = useActiveProject();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Load projects when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      loadProjects();
    }
  }, [dropdownOpen]);

  const loadProjects = async () => {
    try {
      setIsLoadingProjects(true);
      const data = await fetchProjects();
      setProjects(data);
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        title: 'Error',
        description: 'Failed to load projects',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const handleProjectSelect = (project: Project) => {
    setActiveProject({
      id: project.id,
      name: project.name,
      description: project.description,
    });
    setDropdownOpen(false);
    toast({
      title: 'Project Changed',
      description: `Switched to "${project.name}"`,
    });
  };

  const handleProjectCreated = (project: { id: number; name: string; description?: string }) => {
    setActiveProject(project);
    loadProjects(); // Refresh the list
  };

  if (contextLoading || !activeProject) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-[#E5E7EB] bg-white px-3 py-2">
        <FolderOpen className="h-4 w-4 text-[#9CA3AF]" />
        <span className="text-sm text-[#6B7280]">Loading...</span>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] hover:border-[#D1D5DB]"
          >
            <FolderOpen className="h-4 w-4 text-[#6B7280]" />
            <span className="max-w-[200px] truncate text-sm font-medium text-[#111827]">
              {activeProject.name}
            </span>
            <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[280px]">
          <DropdownMenuLabel className="text-xs font-medium text-[#9CA3AF] uppercase">
            Active Project
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {isLoadingProjects ? (
            <div className="py-6 text-center text-sm text-[#9CA3AF]">
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div className="py-6 text-center text-sm text-[#9CA3AF]">
              No projects found
            </div>
          ) : (
            <>
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => handleProjectSelect(project)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-[#111827] truncate">
                      {project.name}
                    </div>
                    {project.description && (
                      <div className="text-xs text-[#6B7280] truncate mt-0.5">
                        {project.description}
                      </div>
                    )}
                  </div>
                  {activeProject.id === project.id && (
                    <Check className="h-4 w-4 text-[#3B82F6] ml-2 flex-shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false);
              setIsCreateModalOpen(true);
            }}
            className="gap-2 cursor-pointer text-[#3B82F6] hover:text-[#2563EB]"
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium">Create New Project...</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProjectModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onProjectCreated={handleProjectCreated}
      />
    </>
  );
}
