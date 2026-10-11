export const routePaths = [
  '/',
  '/training',
  '/verlauf',
  '/einstellungen',
] as const;

export type RoutePath = (typeof routePaths)[number];

export function resolveRoute(hash: string): RoutePath {
  const path = hash.replace(/^#/, '').split('?')[0] || '/';
  return routePaths.includes(path as RoutePath) ? (path as RoutePath) : '/';
}

export function routeQuery(hash = window.location.hash): URLSearchParams {
  return new URLSearchParams(hash.split('?')[1] ?? '');
}

export function navigate(path: RoutePath, query?: URLSearchParams): void {
  const suffix = query && query.size > 0 ? `?${query.toString()}` : '';
  window.location.hash = `#${path}${suffix}`;
}
