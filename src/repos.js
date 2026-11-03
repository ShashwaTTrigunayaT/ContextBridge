// Real, active open-source repositories the workspace can point at. Ingestion is
// generic (any public owner/name works); these are the suggested starting points.

export const FEATURED_REPOS = [
  {
    slug: 'twentyhq/twenty',
    name: 'Twenty CRM',
    language: 'TypeScript',
    description: 'Open-source CRM with an active issue tracker and pull-request review history.',
  },
  {
    slug: 'novuhq/novu',
    name: 'Novu',
    language: 'TypeScript',
    description: 'Open-source notification infrastructure with heavy day-to-day development.',
  },
];

export const DEFAULT_REPO = FEATURED_REPOS[0].slug;

export function isRepoSlug(value) {
  return /^[\w.-]+\/[\w.-]+$/.test(String(value ?? ''));
}
