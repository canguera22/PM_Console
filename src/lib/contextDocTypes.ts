export const CONTEXT_DOCUMENT_TYPES = [
  {
    value: 'fact_source',
    label: 'Fact Source',
    description: 'Authoritative operational or external truth.',
    badgeClass: 'bg-blue-50 text-blue-700',
    searchWeight: 1.45,
  },
  {
    value: 'user_stories',
    label: 'User Stories',
    description: 'Approved scope or intended behavior.',
    badgeClass: 'bg-violet-50 text-violet-700',
    searchWeight: 1.3,
  },
  {
    value: 'confirmed_decisions',
    label: 'Confirmed Decisions',
    description: 'Settled project direction or choices.',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    searchWeight: 1.35,
  },
  {
    value: 'prd_spec',
    label: 'PRD / Spec',
    description: 'Structured product requirements and specs.',
    badgeClass: 'bg-indigo-50 text-indigo-700',
    searchWeight: 1.2,
  },
  {
    value: 'meeting_notes',
    label: 'Meeting Notes',
    description: 'Discussion records that may contain decisions or unknowns.',
    badgeClass: 'bg-amber-50 text-amber-700',
    searchWeight: 1.05,
  },
  {
    value: 'research_reference',
    label: 'Research / Reference',
    description: 'Reference material with useful background context.',
    badgeClass: 'bg-cyan-50 text-cyan-700',
    searchWeight: 1.1,
  },
  {
    value: 'draft_working_doc',
    label: 'Draft Working Doc',
    description: 'Low-authority draft or working material.',
    badgeClass: 'bg-slate-100 text-slate-700',
    searchWeight: 0.9,
  },
] as const;

export type ContextDocumentType = (typeof CONTEXT_DOCUMENT_TYPES)[number]['value'];

export function getContextDocumentTypeConfig(type?: string | null) {
  return (
    CONTEXT_DOCUMENT_TYPES.find((item) => item.value === type) ?? {
      value: 'uncategorized',
      label: 'Context',
      description: 'Uncategorized project source material.',
      badgeClass: 'bg-slate-100 text-slate-700',
      searchWeight: 1,
    }
  );
}
