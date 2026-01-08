import {
  PrioritizationModel,
  OutputType,
  RICEOutputType,
  MoSCoWOutputType,
  ValueEffortOutputType,
  CustomOutputType,
} from '@/types/prioritization';

export const PRIORITIZATION_MODELS: {
  value: PrioritizationModel;
  label: string;
}[] = [
  { value: 'WSJF', label: 'Weighted Shortest Job First (WSJF)' },
  { value: 'RICE', label: 'RICE Scoring' },
  { value: 'MoSCoW', label: 'MoSCoW Prioritization' },
  { value: 'Value/Effort', label: 'Value vs Effort' },
  { value: 'Custom', label: 'Custom Scoring Model' },
];

export const OUTPUT_TYPES: OutputType[] = [
  'Ranked Backlog',
  'Top N Items Summary',
  'Quick Wins vs Strategic Bets',
  'WSJF Score Breakdown',
  'Prioritization Rationale',
];

export const RICE_OUTPUT_TYPES: RICEOutputType[] = [
  'Ranked Backlog (RICE Score + Rank)',
  'Top N Items Summary',
  'High Impact / Low Effort Items',
  'RICE Score Breakdown per Item',
  'Prioritization Rationale',
];

export const MOSCOW_OUTPUT_TYPES: MoSCoWOutputType[] = [
  'Ranked Backlog by MoSCoW Category',
  'Breakdown by Category (Must/Should/Could/Won’t)',
  'Category Distribution Summary',
  'Prioritization Rationale',
];

export const VALUE_EFFORT_OUTPUT_TYPES: ValueEffortOutputType[] = [
  'Ranked Backlog (Value/Effort Score + Rank)',
  'Top N Items Summary',
  'Quick Wins (High Value, Low Effort)',
  'Score Breakdown per Item',
  'Prioritization Rationale',
];

export const CUSTOM_OUTPUT_TYPES: CustomOutputType[] = [
  'Ranked Backlog (Custom Score + Rank)',
  'Top N Items Summary',
  'Score Breakdown per Item',
  'Prioritization Rationale',
];
