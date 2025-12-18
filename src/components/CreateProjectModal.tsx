// Create Project Modal Component
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { createProject } from '@/lib/projects';
import { useToast } from '@/hooks/use-toast';
import { ActiveProject } from '@/types/project';

interface CreateProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (project: ActiveProject) => void;
}

export function CreateProjectModal({
  open,
  onOpenChange,
  onProjectCreated,
}: CreateProjectModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'Active' | 'Archived'>('Active');
  const [nameError, setNameError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    if (!name.trim()) {
      setNameError('Project name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const project = await createProject(
        name.trim(),
        description.trim() || undefined,
        status
      );

      toast({
        title: 'Success',
        description: `Project "${project.name}" created and set as active`,
      });

      onProjectCreated({
        id: project.id,
        name: project.name,
        description: project.description,
      });

      // Reset form
      setName('');
      setDescription('');
      setStatus('Active');
      setNameError('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: 'Error',
        description: 'Failed to create project. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (nameError && value.trim()) {
      setNameError('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-[#111827]">
              Create New Project
            </DialogTitle>
            <DialogDescription className="text-sm text-[#6B7280]">
              Create a new project to organize your PM sessions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label htmlFor="project-name" className="text-[13px] font-medium text-[#6B7280]">
                Project Name <span className="text-[#EF4444]">*</span>
              </Label>
              <Input
                id="project-name"
                placeholder="e.g., Mobile App Redesign"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={nameError ? 'border-[#EF4444]' : ''}
              />
              {nameError && (
                <p className="text-xs text-[#EF4444]">{nameError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-description" className="text-[13px] font-medium text-[#6B7280]">
                Description (Optional)
              </Label>
              <Textarea
                id="project-description"
                placeholder="Brief description of the project..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-status" className="text-[13px] font-medium text-[#6B7280]">
                Status
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as 'Active' | 'Archived')}>
                <SelectTrigger id="project-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
