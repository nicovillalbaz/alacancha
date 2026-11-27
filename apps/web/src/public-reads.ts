export const PUBLIC_SCORER_LIMIT = 10;

export interface PublicFixtureMatchSummary {
  id: string;
  category_id: string;
  home_name: string;
  away_name: string;
  home_team_id: string;
  away_team_id: string;
  match_date: string | null;
  match_time: string | null;
  tie_leg: string | null;
  bracket_round?: string | null;
  result: { status: 'provisional' | 'official'; score: { home: number; away: number }; shootout: { home: number; away: number } } | null;
}

export interface PublicFixtureDay {
  id: string;
  ordinal: number;
  tournament_id: string;
  matches: PublicFixtureMatchSummary[];
}

export interface PublicPortalTournament {
  id: string;
  name: string;
  public_slug: string | null;
  status: 'draft' | 'published';
  has_emblem: boolean;
  presentation_only: boolean;
  has_announced_fixture: boolean;
  has_public_bracket: boolean;
  category_id: string;
  category_name: string;
  rules: { initialPhase: { mode: string } | null } | null;
}

export type PublicPositionView = 'resumen'|'clasificacion'|'goleadores'|'valla'|'equipos';

export function publicPositionView(section:string,matchOpen=false):PublicPositionView {
  if(matchOpen&&section!=='clasificacion')return 'resumen';
  if(section==='clasificacion'||section==='goleadores'||section==='valla'||section==='equipos')return section;
  return 'resumen';
}

export function createPublicReads(limit = 12) {
  const cache = new Map<string, { request: Promise<unknown>; expires: number }>();
  return function read<T>(path: string, revision: string, ttl = 15_000): Promise<T> {
    const key = `${revision}:${path}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.request as Promise<T>;
    const entry = { request: Promise.resolve<unknown>(null), expires: Infinity };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const request = fetch(`/api/v1/public${path}`, {
      credentials: 'omit',
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as T;
      entry.expires = Date.now() + ttl;
      return data;
    }).catch(cause => {
      if (cache.get(key) === entry) cache.delete(key);
      throw cause;
    }).finally(() => clearTimeout(timeout));
    entry.request = request;
    cache.set(key, entry);
    const oldest = cache.keys().next().value;
    if (cache.size > limit && oldest !== undefined) cache.delete(oldest);
    return request;
  };
}
