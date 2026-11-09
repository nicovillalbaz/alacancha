import type { CompetitionPlan } from './index.ts';

export interface PlannedTie { slot: number; home: string; away: string }
export interface PlannedRound { size: number; name: string; pairing: 'positions' | 'draw'; legs: 1 | 2; ties: PlannedTie[] }

export function knockoutRoundName(size: number): string {
  return ({ 2: 'Final', 4: 'Semifinales', 8: 'Cuartos de final', 16: 'Octavos de final', 32: 'Dieciseisavos de final' } as Record<number, string>)[size] || `Ronda de ${size}`;
}

/** Vista previa estructural: no asigna equipos, ganadores ni un sorteo pendiente. */
export function previewCompetitionBracket(plan: CompetitionPlan, groupCount: number | null): PlannedRound[] {
  const source = plan.qualification;
  const seeds: string[] = [];
  if (source.from === 'direct') for (let index = 1; index <= source.entrants; index++) seeds.push(`Participante ${index}`);
  if (source.from === 'league') for (let index = 1; index <= source.top; index++) seeds.push(`${index}.º de liga`);
  if (source.from === 'groups') {
    for (let position = 1; position <= source.perGroup; position++) for (let group = 1; group <= (groupCount || 0); group++) seeds.push(`${position}.º Grupo ${group}`);
    for (let index = 1; index <= source.bestRemaining; index++) seeds.push(`Mejor restante ${index}`);
  }
  return plan.rounds.map((round, roundIndex) => ({
    size: round.size,
    name: roundIndex === 0 && plan.repechage ? 'Repechaje' : knockoutRoundName(round.size),
    pairing: round.pairing,
    legs: round.legs,
    ties: Array.from({ length: round.size / 2 }, (_, index) => {
      if (roundIndex === 0 && round.pairing === 'positions') return { slot: index + 1, home: seeds[index] || 'Descanso', away: seeds[round.size - 1 - index] || 'Descanso' };
      if (roundIndex === 0) return { slot: index + 1, home: 'Plaza por sorteo', away: 'Plaza por sorteo' };
      if (round.pairing === 'draw') return { slot: index + 1, home: 'Ganador por sortear', away: 'Ganador por sortear' };
      return { slot: index + 1, home: `Ganador llave ${index + 1} anterior`, away: `Ganador llave ${round.size - index} anterior` };
    }),
  }));
}
