import { organizerReads } from './view-reads.ts';

export type AnnouncedFixture = {
  revision: number;
  rounds: Array<{ ordinal: number; matches: Array<{ homeEntryId: string; awayEntryId: string }> }>;
  teams: Array<{ entry_id: string; team_id: string; name: string; color: string; has_shield: boolean }>;
};

export function readAnnouncedFixture(organizationId: string, categoryId: string, csrfToken: string) {
  return organizerReads.read<AnnouncedFixture | null>('schedule', `${csrfToken}:${organizationId}:announced:${categoryId}`, async () => {
    const response = await fetch(`/api/v1/public/organizations/${organizationId}/categories/${categoryId}/fixture/announced`, {
      signal: AbortSignal.timeout(12_000), credentials: 'omit',
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('No se pudo cargar el calendario anunciado.');
    return response.json();
  });
}
