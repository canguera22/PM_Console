import { ClipboardList } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { ProjectTaskPanel } from '@/components/ProjectTaskPanel';
import { useActiveProject } from '@/contexts/ActiveProjectContext';

export default function Tasks() {
  const { activeProject } = useActiveProject();

  return (
    <PageShell
      eyebrow="Execution"
      title="Tasks"
      icon={ClipboardList}
      description={`Plan, link, complete, and review work for ${activeProject?.name ?? 'the active project'}.`}
    >
      <div className="max-w-5xl">
        <ProjectTaskPanel
          activeProject={activeProject}
          expandableItems
          listMaxHeightClass="max-h-[720px]"
        />
      </div>
    </PageShell>
  );
}
