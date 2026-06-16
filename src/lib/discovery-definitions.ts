import type { DiscoveryOutputType, DiscoveryType } from '@/types/discovery';

export const DISCOVERY_TYPES: Array<{
  value: DiscoveryType;
  label: string;
  description: string;
}> = [
  {
    value: 'customer_interview',
    label: 'Customer Interview',
    description: 'Synthesize interview notes into themes, pain points, and follow-up questions.',
  },
  {
    value: 'support_feedback',
    label: 'Support Feedback',
    description: 'Organize recurring support pain into product insights and next moves.',
  },
  {
    value: 'sales_feedback',
    label: 'Sales Feedback',
    description: 'Translate deal friction and objections into product learning.',
  },
  {
    value: 'market_research',
    label: 'Market Research',
    description: 'Condense outside research into patterns, threats, and opportunities.',
  },
  {
    value: 'opportunity_sizing',
    label: 'Opportunity Sizing',
    description: 'Frame a problem area and surface the most promising opportunity spaces.',
  },
  {
    value: 'general_discovery',
    label: 'General Discovery',
    description: 'Use when your input is mixed and you want a broad synthesis.',
  },
];

export const DISCOVERY_OUTPUTS: DiscoveryOutputType[] = [
  'Executive Summary',
  'Key Themes',
  'Pain Points',
  'Opportunity Areas',
  'User Stories / JTBD Signals',
  'Open Questions',
  'Recommended Next Steps',
];
