import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import PmAiIcon from '@/assets/branding/pm_ai_icon.png';
import { Button } from '@/components/ui/button';
import { ProjectMemoryAssistant } from '@/components/ProjectMemoryAssistant';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { fetchProjectFeatures } from '@/lib/projectFeatures';
import type { ProjectFeature } from '@/types/project-features';

const PROJECT_SCOPE_ID = 'project';

export function FloatingProjectAssistant() {
  const { activeProject } = useActiveProject();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [features, setFeatures] = useState<ProjectFeature[]>([]);
  const [selectedScopeId, setSelectedScopeId] = useState(PROJECT_SCOPE_ID);

  const featureIdFromRoute = useMemo(() => {
    const match = location.pathname.match(/^\/features\/([^/]+)/);
    return match?.[1] ?? null;
  }, [location.pathname]);

  useEffect(() => {
    if (!activeProject) {
      setFeatures([]);
      setSelectedScopeId(PROJECT_SCOPE_ID);
      return;
    }

    let isMounted = true;

    async function loadFeatures() {
      try {
        const rows = await fetchProjectFeatures(activeProject.id);
        if (!isMounted) return;
        setFeatures(rows);
      } catch (error: unknown) {
        toast.error('Failed to load assistant feature scopes', {
          description: error instanceof Error ? error.message : 'Project AI will use project-wide scope.',
        });
      }
    }

    void loadFeatures();

    return () => {
      isMounted = false;
    };
  }, [activeProject]);

  useEffect(() => {
    if (!featureIdFromRoute) {
      setSelectedScopeId(PROJECT_SCOPE_ID);
      return;
    }

    const matchingFeature = features.find((feature) => feature.id === featureIdFromRoute);
    setSelectedScopeId(matchingFeature ? `feature:${matchingFeature.id}` : PROJECT_SCOPE_ID);
  }, [featureIdFromRoute, features]);

  const scopeOptions = useMemo(
    () => [
      { id: PROJECT_SCOPE_ID, label: 'All Project' },
      ...features.map((feature) => ({
        id: `feature:${feature.id}`,
        label: feature.name,
        featureId: feature.id,
      })),
    ],
    [features]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-blue-600 shadow-xl shadow-blue-900/20 transition hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        aria-label={isOpen ? 'Close PM AI' : 'Open PM AI'}
        title={isOpen ? 'Close PM AI' : 'Open PM AI'}
      >
        <img src={PmAiIcon} alt="" className="h-full w-full object-cover" />
      </button>

      {isOpen ? (
        <div className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-[440px] sm:inset-x-auto sm:right-5 sm:mx-0 sm:w-[440px]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="m-0 text-sm font-semibold text-slate-950">PM AI</p>
                <p className="m-0 truncate text-xs text-slate-500">
                  {activeProject?.name ?? 'No active project'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setIsOpen(false)}
                aria-label="Close PM AI"
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ProjectMemoryAssistant
              activeProject={activeProject ? { id: activeProject.id, name: activeProject.name } : null}
              title="Ask PM AI"
              description="Search project memory from anywhere in the workbench."
              bodyHeightClass="h-[560px]"
              samplePrompts={[
                'What are the current open questions?',
                'Summarize the key decisions',
                'What should I build next?',
              ]}
              emptyStateCopy="Ask anything about this project. I will search saved notes, artifacts, tasks, decisions, and selected feature context."
              scopeOptions={scopeOptions}
              selectedScopeId={selectedScopeId}
              onSelectedScopeChange={setSelectedScopeId}
              embedded
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
