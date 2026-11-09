export interface FixturePair { homeEntryId: string; awayEntryId: string }
export interface GeneratedRound { ordinal: number; leg: 1 | 2; matches: FixturePair[]; byeEntryIds: string[] }

/** Genera pares sin asignar fecha, sede ni jornada oficial. El orden de entrada es estable. */
export function roundRobin(entryIds: string[], legs: 1 | 2): GeneratedRound[] {
  if (entryIds.length < 2 || entryIds.length > 256 || new Set(entryIds).size !== entryIds.length || ![1, 2].includes(legs)) throw new Error('Participantes o ruedas inválidos.');
  let circle: Array<string | null> = [...entryIds];
  if (circle.length % 2) circle.push(null);
  const base: GeneratedRound[] = [];
  for (let index = 0; index < circle.length - 1; index++) {
    const matches: FixturePair[] = [], byeEntryIds: string[] = [];
    for (let position = 0; position < circle.length / 2; position++) {
      const first = circle[position], second = circle[circle.length - 1 - position];
      if (first === null || second === null) { byeEntryIds.push((first ?? second)!); continue; }
      const swap = (index + position) % 2 === 1;
      matches.push({ homeEntryId: swap ? second : first, awayEntryId: swap ? first : second });
    }
    base.push({ ordinal: index + 1, leg: 1, matches, byeEntryIds });
    circle = [circle[0], circle[circle.length - 1], ...circle.slice(1, -1)];
  }
  if (legs === 1) return base;
  return [...base, ...base.map((round, index) => ({ ordinal: base.length + index + 1, leg: 2 as const, matches: round.matches.map((match) => ({ homeEntryId: match.awayEntryId, awayEntryId: match.homeEntryId })), byeEntryIds: [...round.byeEntryIds] }))];
}

/** Reparto serpenteante reproducible. El orden recibido debe ser el orden de siembra aprobado. */
export function drawGroups(entryIds: string[], count: number): string[][] {
  if (!Number.isInteger(count) || count < 2 || count > 32 || entryIds.length < count * 2 || new Set(entryIds).size !== entryIds.length) throw new Error('Cantidad de grupos o participantes inválida.');
  const groups = Array.from({ length: count }, () => [] as string[]);
  entryIds.forEach((id, index) => { const cycle = Math.floor(index / count), position = index % count; groups[cycle % 2 ? count - 1 - position : position].push(id); });
  return groups;
}

export interface BracketSlotPlan { stage: number; slot: number; homeEntryId: string | null; awayEntryId: string | null; homeSourceSlot: number | null; awaySourceSlot: number | null }
/** Llaves sin ganador supuesto. Los descansos solo colocan un equipo en una llave de primera ronda. */
export function knockoutBracket(entryIds: string[], requestedSize?: number): BracketSlotPlan[] {
  if (entryIds.length < 2 || entryIds.length > 256 || new Set(entryIds).size !== entryIds.length) throw new Error('Participantes inválidos.');
  const size = requestedSize ?? 2 ** Math.ceil(Math.log2(entryIds.length));
  if (!Number.isInteger(size) || size < entryIds.length || size > 256 || (size & (size - 1)) !== 0) throw new Error('El tamaño del cuadro no admite los participantes.');
  const slots: BracketSlotPlan[] = [];
  for (let stage = 1, stageSize = size / 2; stageSize >= 1; stage++, stageSize /= 2) {
    for (let index = 0; index < stageSize; index++) {
      const homeEntryId = stage === 1 ? entryIds[index] || null : null;
      const awayEntryId = stage === 1 ? entryIds[size - 1 - index] || null : null;
      // En cada ronda se enfrenta la primera llave con la última, la segunda con la penúltima.
      const previousCount = stageSize * 2;
      slots.push({ stage, slot: index + 1, homeEntryId, awayEntryId, homeSourceSlot: stage === 1 ? null : index + 1, awaySourceSlot: stage === 1 ? null : previousCount - index });
    }
  }
  return slots;
}
