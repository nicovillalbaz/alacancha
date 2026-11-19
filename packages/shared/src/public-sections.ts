export const publicSectionLabels = {
  partidos: 'Partidos',
  fixture: 'Fixture',
  clasificacion: 'Clasificación',
  goleadores: 'Goleadores',
  valla: 'Valla menos vencida',
  equipos: 'Equipos',
} as const;

export type PublicSection = keyof typeof publicSectionLabels;

const descriptions: Record<PublicSection, (cup: string) => string> = {
  partidos: cup => `Consultá los próximos partidos y los resultados publicados de ${cup}.`,
  fixture: cup => `Revisá el calendario y los cruces de las jornadas de ${cup}.`,
  clasificacion: cup => `Consultá la tabla de posiciones y los cruces de clasificación de ${cup}.`,
  goleadores: cup => `Encontrá la tabla de goleadores y los goles registrados en ${cup}.`,
  valla: cup => `Consultá los partidos jugados y los goles recibidos por los equipos de ${cup}.`,
  equipos: cup => `Conocé los equipos participantes y sus planteles publicados en ${cup}.`,
};

export function isPublicSection(value: string): value is PublicSection {
  return Object.hasOwn(publicSectionLabels, value);
}

export function publicSectionMetadata(canonical: string, cup: string, section: string) {
  if (!cup || !isPublicSection(section)) return null;
  const url = new URL(canonical);
  if (section !== 'partidos') url.searchParams.set('vista', section);
  return { canonical: url.href, title: `${publicSectionLabels[section]} · ${cup}`, description: descriptions[section](cup) };
}

export interface PublicVisitReport {
  total: number;
  recent: number;
  cups: { id: string; name: string; organization: string; views: number }[];
  sections: { section: PublicSection; views: number }[];
}
