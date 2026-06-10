import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  FileArchive,
  FileText,
  FolderOpen,
  Home,
  LayoutDashboard,
  ListOrdered,
  LockKeyhole,
  LogOut,
  Megaphone,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
import Logo from '@/assets/branding/product_workbench_logo.png';
import MiniLogo from '@/assets/branding/minilogo.png';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { ManageProjectAccessDialog } from '@/components/ManageProjectAccessDialog';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchProjects } from '@/lib/projects';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/types/project';
import { toast } from 'sonner';

const primaryNav = [
  { label: 'Home', path: '/', icon: Home },
  { label: 'Project Memory', path: '/dashboard', icon: FileArchive },
  { label: 'Tasks', path: '/tasks', icon: ClipboardList },
];

const moduleNav = [
  { label: 'Project Notes', path: '/meetings', icon: MessageSquareText },
  { label: 'Product Docs', path: '/documentation', icon: FileText },
  { label: 'Release Comms', path: '/releases', icon: Megaphone },
  { label: 'Prioritization', path: '/prioritization', icon: ListOrdered },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeProject, setActiveProject } = useActiveProject();
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isAccessOpen, setIsAccessOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isResetSending, setIsResetSending] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    void loadProjects();
  }, [activeProject?.id]);

  async function loadProjects() {
    try {
      setIsLoadingProjects(true);
      const rows = await fetchProjects();
      setProjects(rows);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  }

  function selectProject(project: Project) {
    setActiveProject({
      id: project.id,
      name: project.name,
      description: project.description,
    });
  }

  function navigateTo(path: string) {
    navigate(path);
  }

  async function handleSendPasswordReset() {
    if (!user?.email) {
      toast.error('No email found for this user');
      return;
    }

    setIsResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success('Password reset email sent');
    } catch (error: any) {
      toast.error('Failed to send password reset', {
        description: error?.message ?? 'Please try again.',
      });
    } finally {
      setIsResetSending(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      setIsProfileOpen(false);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Failed to sign out:', error);
      toast.error('Failed to sign out');
    }
  }

  return (
    <>
      <aside
        className={`relative flex min-h-dvh w-full shrink-0 overflow-hidden bg-[#071A33] text-white transition-[width] duration-300 lg:sticky lg:top-0 lg:h-dvh lg:max-h-dvh lg:self-start lg:flex-col ${
          isCollapsed ? 'lg:w-24' : 'lg:w-72'
        }`}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 10%, rgba(59,130,246,0.28), transparent 28%), radial-gradient(circle at 90% 18%, rgba(14,165,233,0.18), transparent 26%), linear-gradient(145deg, rgba(15,23,42,0.2), rgba(15,23,42,0.82))',
          }}
        />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:18px_18px]" />

        <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col p-4 lg:h-full">
          <div className="mb-5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className={`flex min-w-0 flex-1 items-center justify-center rounded-xl bg-white px-3 py-2 shadow-sm transition hover:bg-white ${
                isCollapsed ? 'px-2' : ''
              }`}
            >
              <img
                src={isCollapsed ? MiniLogo : Logo}
                alt="Product Workbench"
                className={isCollapsed ? 'h-12 w-12 object-contain' : 'h-10 w-auto'}
              />
            </button>
          </div>

          <div className={`mb-4 rounded-2xl border border-white/10 bg-white/10 p-3 shadow-inner backdrop-blur ${isCollapsed ? 'p-2' : ''}`}>
            <div className={`mb-2 flex items-center justify-between gap-2 ${isCollapsed ? 'hidden' : ''}`}>
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-100">
                Active Project
              </span>
              <Badge className="border-white/10 bg-white/10 text-[10px] text-blue-50 hover:bg-white/10">
                Live
              </Badge>
            </div>

            <DropdownMenu onOpenChange={(open) => open && void loadProjects()}>
              <DropdownMenuTrigger asChild>
                <button className={`flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#061427]/80 px-3 py-3 text-left transition hover:bg-[#0A2342] ${isCollapsed ? 'justify-center px-2' : ''}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <FolderOpen className="h-4 w-4 shrink-0 text-blue-200" />
                    <div className={`min-w-0 ${isCollapsed ? 'hidden' : ''}`}>
                      <p className="truncate text-sm font-semibold text-white">
                        {activeProject?.name ?? 'Select project'}
                      </p>
                      <p className="truncate text-xs text-blue-100/70">
                        {activeProject?.description ?? 'Choose workspace context'}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-blue-100/70 ${isCollapsed ? 'hidden' : ''}`} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel>Projects</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isLoadingProjects ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    Loading projects...
                  </div>
                ) : projects.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No projects found
                  </div>
                ) : (
                  projects.map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() => selectProject(project)}
                      className="gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{project.name}</p>
                        {project.description ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {project.description}
                          </p>
                        ) : null}
                      </div>
                      {activeProject?.id === project.id ? (
                        <Check className="h-4 w-4 text-blue-600" />
                      ) : null}
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsCreateProjectOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="space-y-5">
            <NavSection label="Workspace" collapsed={isCollapsed}>
              {primaryNav.map((item) => (
                <SidebarButton
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  active={location.pathname === item.path}
                  collapsed={isCollapsed}
                  onClick={() => navigateTo(item.path)}
                />
              ))}
            </NavSection>

            <NavSection label="Create" collapsed={isCollapsed}>
              {moduleNav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    sidebarItemClass(isActive, false, isCollapsed)
                  }
                  title={isCollapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4" />
                  <span className={isCollapsed ? 'sr-only' : ''}>{item.label}</span>
                </NavLink>
              ))}
            </NavSection>

            <NavSection label="Project" collapsed={isCollapsed}>
              <SidebarButton
                icon={BookOpen}
                label="Context Docs"
                active={location.pathname === '/context'}
                collapsed={isCollapsed}
                onClick={() => navigateTo('/context')}
              />
              <SidebarButton
                icon={ShieldCheck}
                label="Manage Access"
                active={false}
                collapsed={isCollapsed}
                disabled={!activeProject}
                onClick={() => setIsAccessOpen(true)}
              />
            </NavSection>
          </nav>

          <div className="mt-auto space-y-2 pt-6">
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className={`hidden h-10 w-full items-center rounded-xl border border-white/10 bg-white/10 px-3 text-sm font-medium text-blue-100 transition hover:bg-white/15 hover:text-white lg:flex ${
                isCollapsed ? 'justify-center px-2' : 'gap-3'
              }`}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isCollapsed ? 'Expand sidebar' : undefined}
            >
              {isCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4" />
                  <span>Collapse</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsProfileOpen(true)}
              className={`flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-left transition hover:bg-white/15 ${isCollapsed ? 'justify-center px-2' : ''}`}
              title={isCollapsed ? user?.email ?? 'Profile' : undefined}
            >
              <UserCircle className="h-5 w-5 shrink-0 text-blue-100" />
              <div className={`min-w-0 flex-1 ${isCollapsed ? 'hidden' : ''}`}>
                <p className="truncate text-sm font-semibold text-white">
                  Profile
                </p>
                <p className="truncate text-xs text-blue-100/70">
                  {user?.email ?? 'Account settings'}
                </p>
              </div>
              <Settings className={`h-4 w-4 shrink-0 text-blue-100/70 ${isCollapsed ? 'hidden' : ''}`} />
            </button>
          </div>
        </div>
      </aside>

      <CreateProjectModal
        open={isCreateProjectOpen}
        onOpenChange={setIsCreateProjectOpen}
        onProjectCreated={(project) => {
          setActiveProject(project);
          setIsCreateProjectOpen(false);
          void loadProjects();
        }}
      />

      <ManageProjectAccessDialog
        open={isAccessOpen}
        onOpenChange={setIsAccessOpen}
        activeProject={activeProject}
      />

      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>
              View your account details and manage access credentials.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Signed in as
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {user?.email ?? 'Unknown user'}
              </p>
              <p className="mt-2 break-all text-xs text-slate-500">
                User ID: {user?.id ?? 'Unavailable'}
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => void handleSendPasswordReset()}
              disabled={isResetSending}
            >
              <LockKeyhole className="h-4 w-4" />
              {isResetSending ? 'Sending reset email...' : 'Send Password Reset Email'}
            </Button>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NavSection({
  label,
  children,
  collapsed,
}: {
  label: string;
  children: ReactNode;
  collapsed?: boolean;
}) {
  return (
    <div>
      <p className={`mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-blue-100/60 ${collapsed ? 'sr-only' : ''}`}>
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarButton({
  icon: Icon,
  label,
  active,
  disabled,
  collapsed,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={sidebarItemClass(Boolean(active), disabled, collapsed)}
      title={collapsed ? label : undefined}
    >
      <Icon className="h-4 w-4" />
      <span className={collapsed ? 'sr-only' : ''}>{label}</span>
    </button>
  );
}

function sidebarItemClass(active: boolean, disabled = false, collapsed = false) {
  return [
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
    collapsed ? 'justify-center px-2' : '',
    active
      ? 'bg-white text-[#071A33] shadow-sm'
      : 'text-blue-50/85 hover:bg-white/10 hover:text-white',
    disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : '',
  ].join(' ');
}
