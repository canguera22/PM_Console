import { FormEvent, useEffect, useState } from 'react';
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
import { Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  assignProjectMemberByEmail,
  listProjectMembers,
  removeProjectMember,
  type ProjectMember,
} from '@/lib/projectMembers';
import type { ActiveProject } from '@/types/project';

interface ManageProjectAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProject: ActiveProject | null;
}

export function ManageProjectAccessDialog({
  open,
  onOpenChange,
  activeProject,
}: ManageProjectAccessDialogProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const loadMembers = async () => {
    if (!activeProject) {
      setMembers([]);
      return;
    }

    setIsLoadingMembers(true);
    try {
      const rows = await listProjectMembers(activeProject.id);
      setMembers(rows);
    } catch (error: any) {
      setMembers([]);
      toast({
        title: 'Failed to load project access',
        description: error?.message ?? 'Only project owners can view members.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (!open || !activeProject) return;
    void loadMembers();
  }, [open, activeProject?.id]);

  const resetForm = () => {
    setEmail('');
    setIsSubmitting(false);
    setRemovingUserId(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) resetForm();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeProject) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast({
        title: 'Email required',
        description: 'Enter the email address of the user you want to assign.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const assigned = await assignProjectMemberByEmail(activeProject.id, normalizedEmail, 'member');
      toast({
        title: 'Access granted',
        description: `${assigned.email} now has access to "${activeProject.name}".`,
      });
      setEmail('');
      await loadMembers();
    } catch (error: any) {
      toast({
        title: 'Failed to assign access',
        description: error?.message ?? 'Only project owners can assign members.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (member: ProjectMember) => {
    if (!activeProject) return;

    setRemovingUserId(member.user_id);
    try {
      await removeProjectMember(activeProject.id, member.user_id);
      toast({
        title: 'Access removed',
        description: `${member.email} no longer has access to "${activeProject.name}".`,
      });
      await loadMembers();
    } catch (error: any) {
      toast({
        title: 'Failed to remove access',
        description: error?.message ?? 'Unable to remove member access.',
        variant: 'destructive',
      });
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Manage Project Access</DialogTitle>
            <DialogDescription>
              Add a user by email to the current project as a member.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Current Members</Label>
              <div className="max-h-44 overflow-y-auto rounded-md border border-[#E5E7EB] bg-[#FAFAFA]">
                {isLoadingMembers ? (
                  <div className="flex items-center justify-center py-6 text-sm text-[#6B7280]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading members...
                  </div>
                ) : members.length === 0 ? (
                  <div className="py-6 text-center text-sm text-[#6B7280]">
                    No members found
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E7EB]">
                    {members.map((member) => (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-[#111827]">{member.email}</p>
                          <p className="text-xs text-[#6B7280]">
                            {member.role === 'owner' ? 'Owner' : 'Member'}
                          </p>
                        </div>
                        {member.role !== 'owner' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={removingUserId === member.user_id}
                            onClick={() => void handleRemoveMember(member)}
                            className="text-[#DC2626] hover:text-[#B91C1C] hover:bg-[#FEF2F2]"
                          >
                            {removingUserId === member.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
            <Label htmlFor="member-email">User Email</Label>
            <Input
              id="member-email"
              type="email"
              autoComplete="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting || !activeProject}
            />
            {activeProject && (
              <p className="text-xs text-[#6B7280]">
                Project: {activeProject.name}
              </p>
            )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !activeProject}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Access'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
