import type { CurrentUser, TournamentSummary } from '@torneos/shared';

export function announcedFixturePath(organizationId: string, categoryId: string) {
  return `/public/organizations/${organizationId}/categories/${categoryId}/fixture/announced`;
}

export type FixtureStart = {
  route: string;
  take: (path: string) => Promise<Response | undefined> | undefined;
  cancel: () => void;
};

export function startFixtureReads(route: string): FixtureStart {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]);
  const requests = new Map<string, Promise<Response | undefined>>();
  const taken = new Set<string>();

  function start(path: string) {
    if (signal.aborted || taken.has(path)) return;
    const request = fetch(`/api/v1${path}`, {
      credentials: path.startsWith('/public/') ? 'omit' : 'same-origin',
      signal,
    }).catch(() => undefined);
    requests.set(path, request);
    return request;
  }

  async function inspect<T>(request: Promise<Response | undefined> | undefined): Promise<T | undefined> {
    const response = await request;
    if (response?.ok) return response.clone().json();
  }

  void (async () => {
    const user = await inspect<CurrentUser>(start('/auth/me'));
    const organizationId = user?.organizationId;
    if (!organizationId || user.platformAdmin || !user.memberships.some(membership =>
      membership.organization_id === organizationId && membership.status === 'active' &&
      membership.organization_status === 'active' && membership.role === 'tournament_admin',
    )) return;

    const org = `/organizations/${organizationId}`;
    const catalog = start(`${org}/tournaments`);
    start(org);
    const tournamentId = route.split('/')[1];
    const categories = (await inspect<TournamentSummary[]>(catalog))?.filter(row => row.id === tournamentId);
    const category = categories?.[0];
    if (!category || !categories) return;

    start(`${org}/teams?torneo=${tournamentId}`);
    if (category.has_position_blueprint !== false) {
      start(`${org}/categories/${category.category_id}/fixture/blueprint?vista=fixture`);
      return;
    }
    for (const editionId of new Set(categories.map(row => row.edition_id))) {
      start(`${org}/editions/${editionId}/matchdays?vista=lista`);
    }
    for (const row of categories) {
      start(`${org}/categories/${row.category_id}/fixture`);
      if (row.has_announced_fixture) start(announcedFixturePath(organizationId,row.category_id));
    }
  })().catch(() => undefined);

  return {
    route,
    take(path) {
      const request = requests.get(path);
      requests.delete(path);
      taken.add(path);
      return request;
    },
    cancel() {
      controller.abort();
      requests.clear();
      taken.clear();
    },
  };
}
