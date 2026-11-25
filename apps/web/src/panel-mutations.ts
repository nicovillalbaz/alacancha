import { organizerReads } from './view-reads.ts';

export function invalidatePanelMutation(path: string, scopes: { tournament?: string; entry?: string } = {}) {
  const [,, organization, resource, resourceId, action, target] = path.split(/[/?]/);
  if (!organization || /\/(preview|inspect)$/.test(path)) return;
  const stale = (groups: string[], matches = (_key: string) => true) =>
    organizerReads.invalidateWhere((group, key) => groups.includes(group) && key.includes(`:${organization}:`) && matches(key));
  const match = (key: string) => key.includes(`/matches/${resourceId}/`);
  const tournament = (key: string) => !scopes.tournament || key.endsWith(`:${scopes.tournament}`) || key.includes(`/tournaments/${scopes.tournament}/`);

  if (resource === 'matches') {
    stale(['capture', 'history'], match);
    if (action === 'assignments') stale(['people']);
    if (action === 'record' && target === 'players') stale(['roster'], key => !scopes.entry || key.includes(`/entries/${scopes.entry}/`));
    if ((action === 'acta' && ['approve','reopen','submit','reject'].includes(target)) || (action === 'record' && target === 'start')) {
      stale(['schedule', 'people']);
      if (action === 'acta' && ['approve','reopen'].includes(target)) {
        stale(['standings']);
        stale(['roster']);
        stale(['payments'], tournament);
      }
    }
  } else if (resource === 'entries') {
    stale(['roster'], key => key.includes(`/entries/${resourceId}/`));
    if (action === 'players' || action === 'good-faith') stale(['capture']);
    else if (action === 'publication') stale(['teams']);
  } else if (['categories','editions','matchdays','draft-matches','fixture','groups','phases'].includes(resource)) {
    stale(['schedule','standings','catalog','teams','capture','people']);
    stale(['payments'], tournament);
  } else if (['teams','commission','staff'].includes(resource)) {
    stale(['teams','origins','roster']);
  } else if (resource === 'tournaments') {
    stale(['catalog','venues','teams','schedule','standings']);
  } else if (['operators','match-assignments'].includes(resource)) {
    stale(['people']);
  } else if (['discipline','registrations'].includes(resource)) {
    stale(['standings','roster','capture']);
  } else if (['venues','sponsors'].includes(resource)) {
    stale(['venues','schedule']);
  } else if (['branding','logo','access',''].includes(resource ?? '')) {
    stale(['organization']);
  }
}
