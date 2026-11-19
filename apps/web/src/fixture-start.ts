import type { CurrentUser, MatchdaySummary, PositionBlueprintView, PositionCompetitionView, TournamentEntry, TournamentSummary } from '@torneos/shared';
import type { AnnouncedFixture } from './organizer-announced-fixture.ts';

export function announcedFixturePath(organizationId: string, categoryId: string) {
  return `/public/organizations/${organizationId}/categories/${categoryId}/fixture/announced`;
}

export type FixtureStart = {
  route: string;
  opening: Promise<FixtureOpening | undefined>;
  take: (path: string) => Promise<Response | undefined> | undefined;
  cancel: () => void;
};

export type FixtureOpening = {
  tournament: string;
  day: string;
  matches: Array<{ home: string; away: string; score: string }>;
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

  const opening = (async (): Promise<FixtureOpening | undefined> => {
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

    const teams = start(`${org}/teams?torneo=${tournamentId}`);
    if (category.has_position_blueprint !== false) {
      const plan = start(`${org}/categories/${category.category_id}/fixture/blueprint?vista=fixture`);
      const [view, entries] = await Promise.all([
        inspect<PositionBlueprintView & { competition?: PositionCompetitionView }>(plan),
        inspect<TournamentEntry[]>(teams),
      ]);
      if (!view?.blueprint || !view.competition || !entries) return;
      const games = view.games.filter(game => game.sporting_round === 'F1').slice(0,4);
      const entryNames = new Map(entries.filter(entry => entry.category_id === category.category_id && entry.status === 'active').map(entry => [entry.entry_id,entry.name]));
      const slotNames = new Map(view.slots.map(slot => [slot.slot_code,slot.team_name]));
      const results = new Map(view.competition.results.map(result => [result.code,result]));
      const matches = games.map(game => {
        const pair = view.competition!.competition.participants[game.code];
        const result = results.get(game.code);
        return {
          home: (pair?.homeEntryId && entryNames.get(pair.homeEntryId)) || slotNames.get(game.home_ref) || game.home_ref,
          away: (pair?.awayEntryId && entryNames.get(pair.awayEntryId)) || slotNames.get(game.away_ref) || game.away_ref,
          score: result ? `${result.homeGoals} : ${result.awayGoals}` : '–',
        };
      });
      return { tournament:category.name, day:'Fecha 1', matches };
    }
    const dates = [...new Set(categories.map(row => row.edition_id))]
      .map(editionId => inspect<MatchdaySummary[]>(start(`${org}/editions/${editionId}/matchdays?vista=lista`)));
    const announcements: Array<{categoryId:string; plan: Promise<AnnouncedFixture | undefined>}> = [];
    for (const row of categories) {
      start(`${org}/categories/${row.category_id}/fixture`);
      if (row.has_announced_fixture) announcements.push({
        categoryId:row.category_id, plan:inspect<AnnouncedFixture>(start(announcedFixturePath(organizationId,row.category_id))),
      });
    }
    const [dateGroups, announced] = await Promise.all([
      Promise.all(dates), Promise.all(announcements.map(async item => ({categoryId:item.categoryId, plan:await item.plan}))),
    ]);
    if (dateGroups.some(group => !group)) return;
    const days = dateGroups.flatMap(group => group || []).filter(day => !day.archivedAt);
    const firstAnnounced = announced.find(item => item.plan?.rounds.some(round => round.ordinal === 1));
    if (firstAnnounced?.plan) {
      const round = firstAnnounced.plan.rounds.find(item => item.ordinal === 1)!;
      const names = new Map(firstAnnounced.plan.teams.map(team => [team.entry_id,team.name]));
      const scheduled = days.find(day => day.ordinal === round.ordinal && day.matches.some(match => match.category_id === firstAnnounced.categoryId));
      const scores = new Map(scheduled?.matches.filter(match => match.category_id === firstAnnounced.categoryId)
        .map(match => [`${match.home_entry_id}:${match.away_entry_id}`,match.official_score]));
      const matches = round.matches.slice(0,4).map(match => {
        const score = scores.get(`${match.homeEntryId}:${match.awayEntryId}`);
        return { home:names.get(match.homeEntryId) || '', away:names.get(match.awayEntryId) || '', score:score ? `${score.home} : ${score.away}` : 'vs' };
      }).filter(match => match.home && match.away);
      return { tournament:category.name, day:'Jornada 1', matches };
    }
    if (announcements.length) return;
    const firstDay = days.find(day => day.matches.length);
    if (!firstDay) return;
    return { tournament:category.name, day:`Fecha ${firstDay.ordinal}`, matches:firstDay.matches.slice(0,4).map(match => ({
      home:match.home_name, away:match.away_name, score:match.official_score ? `${match.official_score.home} : ${match.official_score.away}` : '–',
    })) };
  })().catch(() => undefined);

  return {
    route,
    opening,
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
