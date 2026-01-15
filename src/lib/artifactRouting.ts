// lib/artifactRouting.ts

export type ArtifactType =
  | 'product_documentation'
  | 'meeting_intelligence'
  | 'release_notes'
  | 'prioritization';

type ArtifactRouteConfig = {
  route: string;
  tab?: string;
};

const ARTIFACT_ROUTE_MAP: Record<ArtifactType, ArtifactRouteConfig> = {
  product_documentation: {
    route: '/documentation',
    tab: 'history',
  },
  meeting_intelligence: {
    route: '/meetings',
    tab: 'history',
  },
  release_notes: {
    route: '/releases',
    tab: 'history',
  },
  prioritization: {
    route: '/prioritization',
  },
};

export function getArtifactRoute(
  artifactType: string,
  artifactId: string
): string | null {
  switch (artifactType) {
    case 'product_documentation':
      return `/documentation?artifact=${artifactId}`;
    case 'meeting_intelligence':
      return `/meetings?artifact=${artifactId}`;
    case 'release_communications':
      return `/releases?artifact=${artifactId}`;
    case 'prioritization':
      return `/prioritization?artifact=${artifactId}`;
    default:
      return null;
  }
}

