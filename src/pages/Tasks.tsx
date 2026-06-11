import { useState } from 'react';
import { ClipboardList, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';
import { ProjectTaskPanel } from '@/components/ProjectTaskPanel';
import { useActiveProject } from '@/contexts/ActiveProjectContext';
import { exportProjectTasksToNotion } from '@/lib/notion';

export default function Tasks() {
  const { activeProject } = useActiveProject();
  const [exportMode, setExportMode] = useState<'all' | 'open' | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function handleExportTasks(mode: 'all' | 'open') {
    if (!activeProject) {
      toast.error('Select a project before exporting tasks');
      return;
    }

    setExportMode(mode);
    try {
      const result = await exportProjectTasksToNotion(
        activeProject.id,
        undefined,
        mode === 'open' ? 'open' : undefined
      );
      setRefreshKey((prev) => prev + 1);
      if (result.failures.length > 0) {
        toast.warning('Notion export partially completed', {
          description: `${result.exported} exported, ${result.failures.length} failed.`,
        });
      } else {
        toast.success('Tasks exported to Notion', {
          description: `${result.created} created, ${result.updated} updated.`,
        });
      }
    } catch (error: any) {
      toast.error('Failed to export tasks to Notion', {
        description: error?.message ?? 'Check the project Notion settings and try again.',
      });
    } finally {
      setExportMode(null);
    }
  }

  return (
    <PageShell
      eyebrow="Execution"
      title="Tasks"
      icon={ClipboardList}
      description={`Plan, link, complete, and review work for ${activeProject?.name ?? 'the active project'}.`}
      action={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleExportTasks('open')}
            disabled={!activeProject || exportMode !== null}
          >
            {exportMode === 'open' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            Export Open
          </Button>
          <Button
            className="gap-2"
            onClick={() => void handleExportTasks('all')}
            disabled={!activeProject || exportMode !== null}
          >
            {exportMode === 'all' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            Export All
          </Button>
        </div>
      }
    >
      <div className="max-w-5xl">
        <ProjectTaskPanel
          activeProject={activeProject}
          expandableItems
          listMaxHeightClass="max-h-[720px]"
          refreshKey={refreshKey}
        />
      </div>
    </PageShell>
  );
}
