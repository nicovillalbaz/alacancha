import { z } from 'zod';
export { rankStandings, type RankedMatch, type StandingTotals, type StandingGroup } from './standings.ts';
export { roundRobin, drawGroups, knockoutBracket, type GeneratedRound, type FixturePair, type BracketSlotPlan } from './fixture.ts';
export { knockoutRoundName, previewCompetitionBracket, type PlannedRound, type PlannedTie } from './competition.ts';
export { projectMatchJournal, type MatchJournalEvent, type MatchEventKind } from './match.ts';
export { deriveOfficialStatistics, type OfficialStatMatch, type StatEntry, type PlayerStat, type TableStat } from './statistics.ts';

export const accessStates = ['pending', 'active', 'suspended', 'blocked'] as const;
export type AccessState = typeof accessStates[number];
export const accessLabels: Record<AccessState, string> = { pending: 'Pendiente', active: 'Activo', suspended: 'Suspendido', blocked: 'Bloqueado' };
export const roles = ['tournament_admin', 'team_admin', 'operator'] as const;
export const matchPeriodCodes = ['PT','ST','TE','P4','P5','P6'] as const;
export const matchEventSchema = z.object({ clientEventId: z.uuid(), kind: z.enum(['goal','penalty','own_goal','yellow','second_yellow','red','custom_card','substitution','incident','shootout_goal','shootout_miss']), teamEntryId: z.uuid(), registrationId: z.uuid().nullable(), cardCode: z.string().regex(/^[a-z][a-z0-9_]{1,29}$/).nullable().optional(), relatedRegistrationId: z.uuid().nullable().optional(), incidentNote: z.string().trim().min(3).max(500).nullable().optional(), windowNo: z.number().int().min(1).max(20).nullable().optional(), period: z.enum(matchPeriodCodes).nullable(), minute: z.number().int().min(0).max(200).nullable() }).strict();
export const matchEventVoidSchema = z.object({ clientEventId: z.uuid(), reason: z.string().trim().min(3).max(300) }).strict();
export interface MatchCaptureView { matchId: string; status: 'capturing' | 'submitted' | 'official'; revision: number; warnings?: string[]; home: { entryId: string; teamId: string; name: string; color: string; hasShield: boolean; players: Array<{ registrationId: string; name: string; shirtNumber: number | null }> }; away: { entryId: string; teamId: string; name: string; color: string; hasShield: boolean; players: Array<{ registrationId: string; name: string; shirtNumber: number | null }> }; score: { home: number; away: number }; shootout: { home: number; away: number }; unattributedGoals: number; submissionId: string | null; approvalId: string | null; allowedKinds: import('./match.ts').MatchEventKind[]; customCards: Array<{code:string;label:string;color:string;suspensionMatches:number}>; substitutionNeedsWindow:boolean; events: import('./match.ts').MatchJournalEvent[]; periods: string[] }
export const roleLabels: Record<typeof roles[number], string> = { tournament_admin: 'Administrador de torneo', team_admin: 'Administrador de equipo', operator: 'Planillero' };
export const passwordSchema = z.string().min(12, 'Usá al menos 12 caracteres.').max(128, 'La contraseña es demasiado larga.');
export const loginSchema = z.object({ username: z.string().trim().min(3).max(160), password: z.string().min(1).max(128) }).strict();
export const organizationSchema = z.object({ name: z.string().trim().min(3).max(120), administratorName: z.string().trim().min(2).max(120), username: z.string().trim().min(3).max(160), requestId: z.uuid() }).strict();
export const accessSchema = z.object({ status: z.enum(accessStates), reason: z.string().trim().min(3, 'Escribí el motivo del cambio.').max(300), version: z.number().int().positive() }).strict();
export const brandSchema = z.object({ name: z.string().trim().min(3).max(120), accent: z.string().regex(/^#[0-9a-fA-F]{6}$/), version: z.number().int().positive() }).strict();
export const tokenSchema = z.object({ token: z.string().min(32).max(128) }).strict();
export const acceptSchema = z.object({ token: z.string().min(32).max(128), password: passwordSchema.optional() }).strict();
export interface OrganizationSummary { id: string; name: string; status: AccessState; accent: string; version: number; logo_id: string | null }
export interface MembershipSummary { id: string; organization_id: string; organization_name: string; organization_status: AccessState; status: AccessState; role: typeof roles[number]; version: number }
export interface CurrentUser { id: string; name: string; username: string; platformAdmin: boolean; organizationId: string | null; memberships: MembershipSummary[]; csrfToken: string }

export const rulePresets = ['F5','F6','F7','F8','F9','F11','futsal','personalizado'] as const;
export const substitutionsSchema = z.object({
  mode: z.enum(['none', 'limited', 'unlimited']),
  maxChanges: z.number().int().min(0).max(100).nullable(),
  maxWindows: z.number().int().min(1).max(20).nullable(),
  reentry: z.boolean(),
}).strict().superRefine((changes, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (changes.mode === 'none' && (changes.maxChanges !== 0 || changes.maxWindows !== null || changes.reentry)) issue('Sin cambios exige cupos cero, sin ventanas ni reingreso.');
  if (changes.mode === 'limited' && (changes.maxChanges === null || changes.maxChanges < 1)) issue('Indicá al menos un cambio permitido.');
  if (changes.mode === 'unlimited' && changes.maxChanges !== null) issue('Los cambios ilimitados no llevan un máximo de cambios.');
  if (changes.mode === 'limited' && changes.maxWindows !== null && changes.maxChanges !== null && changes.maxWindows > changes.maxChanges) issue('Las ventanas no pueden superar la cantidad de cambios.');
});
export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Ingresá una fecha válida.');
export const eligibilitySchema = z.object({
  age: z.object({
    minYears: z.number().int().min(0).max(120).nullable(),
    maxYears: z.number().int().min(0).max(120).nullable(),
    reference: z.enum(['match_date', 'fixed_date']),
    fixedDate: calendarDateSchema.nullable(),
  }).strict().nullable(),
  requiredDocuments: z.array(z.string().trim().min(2).max(80)).max(12),
  registrationWindow: z.object({ opensOn: calendarDateSchema, closesOn: calendarDateSchema }).strict().nullable().optional(),
  transferProof: z.object({ requiredFor: z.enum(['none', 'external', 'all']), label: z.string().trim().min(2).max(80) }).strict().optional(),
  registrationFields: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,31}$/), label: z.string().trim().min(2).max(80) }).strict()).max(8).optional(),
}).strict().superRefine((eligibility, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  const age = eligibility.age;
  if (age && age.minYears !== null && age.maxYears !== null && age.minYears > age.maxYears) issue('La edad mínima no puede superar la máxima.');
  if (age?.reference === 'match_date' && age.fixedDate !== null) issue('La edad por fecha de partido no lleva fecha de corte fija.');
  if (new Set(eligibility.requiredDocuments.map((label) => label.toLocaleLowerCase('es'))).size !== eligibility.requiredDocuments.length) issue('No repitas documentos obligatorios.');
  if (eligibility.registrationWindow && eligibility.registrationWindow.opensOn > eligibility.registrationWindow.closesOn) issue('La ventana de inscripción termina antes de comenzar.');
  if (new Set((eligibility.registrationFields || []).map((field) => field.key)).size !== (eligibility.registrationFields || []).length) issue('No repitas campos de inscripción.');
});
export const tiebreakerNames = ['head_to_head_points', 'head_to_head_wins', 'head_to_head_goal_difference', 'head_to_head_goals_for', 'head_to_head_goals_against', 'wins', 'goal_difference', 'goals_for', 'goals_against', 'yellow_cards', 'red_cards', 'manual_draw'] as const;
export const tiebreakerLabels: Record<typeof tiebreakerNames[number], string> = {
  head_to_head_points: 'Puntos entre sí', head_to_head_wins: 'Victorias entre sí', head_to_head_goal_difference: 'Diferencia de goles entre sí',
  head_to_head_goals_for: 'Goles a favor entre sí', head_to_head_goals_against: 'Goles en contra entre sí',
  wins: 'Victorias totales', goal_difference: 'Diferencia de goles total', goals_for: 'Goles a favor totales', goals_against: 'Goles en contra totales',
  yellow_cards: 'Menos amarillas', red_cards: 'Menos rojas', manual_draw: 'Sorteo documentado',
};
export const advancedRulesSchema = z.object({
  tiebreakers: z.array(z.enum(tiebreakerNames)).min(1).max(tiebreakerNames.length),
  discipline: z.object({
    yellowCards: z.boolean(),
    redCards: z.boolean(),
    secondYellowRed: z.boolean(),
    yellowAccumulation: z.number().int().min(1).max(20).nullable(),
    redReviewRequired: z.boolean(),
    customCards: z.array(z.object({ code: z.string().regex(/^[a-z][a-z0-9_]{1,29}$/), label: z.string().trim().min(2).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), suspensionMatches: z.number().int().min(0).max(50) }).strict()).max(8).optional(),
  }).strict(),
  walkover: z.object({
    enabled: z.boolean(),
    winnerGoals: z.number().int().min(0).max(30).nullable(),
    loserGoals: z.number().int().min(0).max(30).nullable(),
    winnerPoints: z.number().int().min(0).max(10).nullable(),
    loserPoints: z.number().int().min(0).max(10).nullable(),
  }).strict(),
}).strict().superRefine((rules, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (new Set(rules.tiebreakers).size !== rules.tiebreakers.length) issue('No repitas criterios de desempate.');
  const drawIndex = rules.tiebreakers.indexOf('manual_draw');
  if (drawIndex >= 0 && drawIndex !== rules.tiebreakers.length - 1) issue('El sorteo documentado debe quedar al final.');
  const cards = rules.discipline;
  if (!cards.yellowCards && (cards.secondYellowRed || cards.yellowAccumulation !== null)) issue('Las amarillas desactivadas no pueden acumularse ni producir segunda amarilla.');
  if (!cards.redCards && (cards.secondYellowRed || cards.redReviewRequired)) issue('Las rojas desactivadas no pueden tener revisión ni segunda amarilla.');
  if (new Set((cards.customCards || []).map((card) => card.code)).size !== (cards.customCards || []).length) issue('No repitas códigos de tarjeta.');
  const walkover = rules.walkover;
  if (!walkover.enabled && [walkover.winnerGoals, walkover.loserGoals, walkover.winnerPoints, walkover.loserPoints].some((value) => value !== null)) issue('El walkover desactivado no lleva marcador ni puntos.');
  if (walkover.enabled && (walkover.winnerGoals === null || walkover.loserGoals === null || walkover.winnerGoals <= walkover.loserGoals)) issue('El marcador adjudicado debe tener más goles para el ganador.');
});
export const initialPhaseSchema = z.object({
  mode: z.enum(['league', 'groups', 'knockout']),
  legs: z.union([z.literal(1), z.literal(2)]),
  groupCount: z.number().int().min(2).max(32).nullable(),
}).strict().superRefine((phase, context) => {
  if ((phase.mode === 'groups') !== (phase.groupCount !== null)) context.addIssue({ code: 'custom', message: 'Solo la fase de grupos lleva cantidad de grupos.' });
});
export const competitionPlanSchema = z.object({
  qualification: z.discriminatedUnion('from', [
    z.object({ from: z.literal('direct'), entrants: z.number().int().min(2).max(256) }).strict(),
    z.object({ from: z.literal('league'), top: z.number().int().min(2).max(256) }).strict(),
    z.object({ from: z.literal('groups'), perGroup: z.number().int().min(1).max(16), bestRemaining: z.number().int().min(0).max(32) }).strict(),
  ]),
  bracketSize: z.number().int().min(2).max(256).refine((size) => (size & (size - 1)) === 0, 'El cuadro debe tener 2, 4, 8, 16, 32, 64, 128 o 256 plazas.'),
  repechage: z.boolean().optional(),
  rounds: z.array(z.object({ size: z.number().int().min(2).max(256), pairing: z.enum(['positions', 'draw']), legs: z.union([z.literal(1), z.literal(2)]), resolution: z.enum(['aggregate','match_points_penalties','match_points_third']).optional() }).strict()).min(1).max(8),
}).strict().superRefine((plan, context) => {
  const expected = Math.log2(plan.bracketSize);
  if (plan.rounds.length !== expected || plan.rounds.some((round, index) => round.size !== plan.bracketSize / (2 ** index))) context.addIssue({ code: 'custom', message: 'Configurá cada ronda del cuadro, desde la primera hasta la final.' });
  if(plan.rounds.some(round=>round.legs===1&&round.resolution&&round.resolution!=='aggregate'))context.addIssue({code:'custom',message:'El desempate por partidos requiere ida y vuelta.'});
  const count = plan.qualification.from === 'direct' ? plan.qualification.entrants : plan.qualification.from === 'league' ? plan.qualification.top : null;
  if (plan.repechage && count !== null && (count <= plan.bracketSize / 2 || count >= plan.bracketSize)) context.addIssue({ code: 'custom', message: 'El repechaje necesita participantes con descanso y participantes que jueguen la primera ronda.' });
});
export type CompetitionPlan = z.infer<typeof competitionPlanSchema>;
export const ruleSchema = z.object({
  initialPhase: initialPhaseSchema.nullable().default(null),
  competitionPlan: competitionPlanSchema.nullable().optional(),
  playersOnField: z.number().int().min(1).max(30),
  minimumToStart: z.number().int().min(1).max(30),
  minimumToContinue: z.number().int().min(1).max(30),
  maxMatchRoster: z.number().int().min(1).max(100),
  maxBenchPlayers: z.number().int().min(0).max(100),
  maxBenchStaff: z.number().int().min(0).max(50).default(0),
  lineupRoles: z.object({ goalkeeperRequired: z.boolean(), captainRequired: z.boolean() }).strict().default({ goalkeeperRequired: false, captainRequired: false }),
  maxRegisteredPlayers: z.number().int().min(1).max(500).nullable(),
  substitutions: substitutionsSchema.nullable().default(null),
  eligibility: eligibilitySchema.nullable().default(null),
  advanced: advancedRulesSchema.nullable().default(null),
  periods: z.array(z.object({ name: z.string().trim().min(2).max(40), minutes: z.number().int().min(1).max(120) }).strict()).min(1).max(6),
  points: z.object({ win: z.number().int().min(0).max(10), draw: z.number().int().min(0).max(10), loss: z.number().int().min(0).max(10) }).strict(),
}).strict().superRefine((rule, context) => {
  const issue = (message: string) => context.addIssue({ code: 'custom', message });
  if (rule.minimumToStart > rule.playersOnField) issue('El mínimo para iniciar no puede superar los jugadores en cancha.');
  if (rule.minimumToContinue > rule.minimumToStart) issue('El mínimo para continuar no puede superar el mínimo para iniciar.');
  if (rule.maxMatchRoster !== rule.playersOnField + rule.maxBenchPlayers) issue('El total de jugadores en planilla debe ser cancha más banca.');
  if (rule.maxRegisteredPlayers !== null && rule.maxRegisteredPlayers < rule.maxMatchRoster) issue('La nómina general no puede ser menor que el acta.');
  if (new Set(rule.periods.map((item) => item.name.toLocaleLowerCase('es'))).size !== rule.periods.length) issue('Cada período necesita un nombre distinto.');
  if (rule.competitionPlan) {
    const plan = rule.competitionPlan, phase = rule.initialPhase, source = plan.qualification;
    if (!phase || (phase.mode === 'knockout' ? source.from !== 'direct' : source.from !== phase.mode)) issue('La clasificación del cuadro debe partir de la fase inicial elegida.');
    const count = source.from === 'direct' ? source.entrants : source.from === 'league' ? source.top : (phase?.groupCount ?? 0) * source.perGroup + source.bestRemaining;
    if (count > plan.bracketSize) issue('Los clasificados no caben en el cuadro elegido.');
    if (count <= plan.bracketSize / 2) issue('El cuadro tiene demasiados descansos; elegí un tamaño menor.');
    if (source.from === 'groups' && phase?.groupCount !== null && phase?.groupCount !== undefined && source.bestRemaining > phase.groupCount) issue('No puede haber más mejores restantes que grupos.');
    if (source.from === 'direct' && plan.rounds[0]?.pairing !== 'draw' && !plan.repechage) issue('Una copa directa sin clasificación previa comienza por sorteo.');
  }
});
export type RuleConfig = z.infer<typeof ruleSchema>;
export const tournamentSetupSchema = z.object({
  requestId: z.uuid(),
  name: z.string().trim().min(3).max(120),
  timezone: z.string().trim().min(3).max(80),
  editionName: z.string().trim().min(2).max(100),
  categoryName: z.string().trim().min(2).max(100),
  preset: z.enum(rulePresets),
  teamLimit: z.number().int().min(2).max(256).nullable(),
  rules: ruleSchema,
  paymentRates: z.object({ yellowGuaranies: z.number().int().min(0).max(1000000000), redGuaranies: z.number().int().min(0).max(1000000000), customCardRates: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,29}$/),z.number().int().min(0).max(1000000000)).optional() }).strict().optional(),
}).strict();
export const categoryAddSchema = z.object({
  requestId: z.uuid(),
  editionName: z.string().trim().min(2).max(100),
  categoryName: z.string().trim().min(2).max(100),
  preset: z.enum(rulePresets),
  teamLimit: z.number().int().min(2).max(256).nullable(),
  rules: ruleSchema,
}).strict();
export const ruleEditSchema = z.object({ rules: ruleSchema, expectedRevision: z.number().int().positive(), reason: z.string().trim().min(3).max(300) }).strict();
export const publishSchema = z.object({ reason: z.string().trim().min(3).max(300), expectedRevision: z.number().int().positive() }).strict();
export interface TournamentSummary { id: string; name: string; timezone: string; status: 'draft' | 'published'; edition_id: string; edition_name: string; category_id: string; category_name: string; preset: typeof rulePresets[number]; team_limit: number | null; rule_version: number; rule_revision: number; rule_status: 'draft' | 'published'; rules: RuleConfig }
export const teamCreateSchema = z.object({ requestId: z.uuid(), name: z.string().trim().min(2).max(120), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), categoryId: z.uuid() }).strict();
export const teamEntrySchema = z.object({ categoryId: z.uuid() }).strict();
export const teamAdminSchema = z.object({ name: z.string().trim().min(2).max(120), username: z.string().trim().min(3).max(160) }).strict();
export const venueCreateSchema = z.object({ name: z.string().trim().min(2).max(120), city: z.string().trim().max(120).nullable() }).strict();
export const sponsorCreateSchema = z.object({ name: z.string().trim().min(2).max(120) }).strict();
export const sponsorPublicationSchema = z.object({ publicVisible: z.boolean(), reason: z.string().trim().min(3).max(300) }).strict();
export interface TournamentVenue { id: string; name: string; city: string | null; created_at: string }
export interface TournamentSponsor { id: string; name: string; public_visible: boolean; created_at: string }
export interface TournamentResources { venues: TournamentVenue[]; sponsors: TournamentSponsor[] }
export const teamPersonSchema = z.object({ name: z.string().trim().min(2).max(120), role: z.string().trim().min(2).max(80) }).strict();
export const teamPublicationSchema = z.object({ publicVisible: z.boolean(), reason: z.string().trim().min(3).max(300) }).strict();
export interface TeamSummary { id: string; name: string; color: string; has_shield: boolean; entry_id: string; category_id: string; category_name: string; edition_name: string; tournament_name: string; status: 'active' | 'withdrawn'; public_visible: boolean; commission: Array<{ id: string; name: string; title: string; status: 'proposed' | 'confirmed'; valid_from: string | null; valid_until: string | null; ended_at: string | null }>; staff: Array<{ id: string; name: string; role: string; status: 'proposed' | 'confirmed' }>; administrators: Array<{ id: string; name: string; username: string; status: AccessState; assignment: 'active' | 'revoked'; revoked_at: string | null }> }
export const playerOriginSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('internal'), teamId: z.uuid(), city: z.string().trim().min(2).max(120), league: z.string().trim().min(2).max(120).nullable() }).strict(),
  z.object({ kind: z.literal('external'), teamName: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(120), league: z.string().trim().min(2).max(120).nullable() }).strict(),
  z.object({ kind: z.literal('none') }).strict(),
  z.object({ kind: z.literal('unknown') }).strict(),
]);
export const playerDraftSchema = z.object({
  givenNames: z.string().trim().min(2).max(120),
  familyNames: z.string().trim().min(2).max(120),
  documentKind: z.enum(['ci', 'passport', 'other']).nullable(),
  documentNumber: z.string().trim().min(4).max(40).refine((value) => value.replace(/[\s.\-]/g, '').length >= 4, 'Ingresá un número de documento válido.').nullable(),
  birthDate: calendarDateSchema,
  registrationNumber: z.string().trim().min(1).max(40).nullable(),
  origin: playerOriginSchema,
  details: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,31}$/), z.string().trim().max(160)).default({}),
}).strict().refine((player) => Boolean(player.documentKind) === Boolean(player.documentNumber), 'Si cargás documento, indicá tipo y número.');
export type PlayerDraftInput = z.infer<typeof playerDraftSchema>;
export const playerImportPreviewSchema = z.object({ rows: z.array(playerDraftSchema).min(1).max(100) }).strict().superRefine((batch, context) => {
  const cards = batch.rows.flatMap((row) => row.registrationNumber ? [row.registrationNumber.toLocaleLowerCase('es')] : []);
  if (new Set(cards).size !== cards.length) context.addIssue({ code: 'custom', message: 'El archivo repite números de ficha.' });
  const documents = batch.rows.flatMap((row) => row.documentNumber ? [`${row.documentKind}:${row.documentNumber.replace(/[\s.\-]/g, '').toLocaleUpperCase('es')}`] : []);
  if (new Set(documents).size !== documents.length) context.addIssue({ code: 'custom', message: 'El archivo repite documentos.' });
});
export const playerImportCommitSchema = playerImportPreviewSchema.safeExtend({ previewToken: z.string().min(70).max(120), reason: z.string().trim().min(3).max(300) });
export interface PlayerImportBatch { id: string; status: 'imported' | 'reverted'; row_count: number; reason: string; created_at: string; reverted_at: string | null }
export const playerIdentityEditSchema = z.object({ givenNames: z.string().trim().min(2).max(120), familyNames: z.string().trim().min(2).max(120), birthDate: calendarDateSchema, documentKind: z.enum(['ci','passport','other']).optional(), documentNumber: z.string().trim().min(4).max(40).optional(), expectedRevision: z.number().int().positive(), reason: z.string().trim().min(3).max(300) }).strict().refine((edit) => Boolean(edit.documentKind) === Boolean(edit.documentNumber), 'Para cambiar el documento, indicá tipo y número.');
export const playerReuseSchema = z.object({ playerId: z.uuid(), registrationNumber: z.string().trim().min(1).max(40).nullable(), origin: playerOriginSchema, details: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,31}$/), z.string().trim().max(160)).default({}), reason: z.string().trim().min(3).max(300) }).strict();
export interface PlayerIdentitySearch { id: string; given_names: string; family_names: string; document_kind: string | null; document_last_four: string | null; birth_date: string; revision: number }
export interface PlayerIdentityChange { id: string; revision: number; changed_fields: string[]; reason: string; changed_at: string; before: { givenNames: string; familyNames: string; birthDate: string; documentKind: string; documentLastFour: string }; after: { givenNames: string; familyNames: string; birthDate: string; documentKind: string; documentLastFour: string } }
export interface PlayerDraftSummary { id: string; player_id: string; entry_id: string; given_names: string; family_names: string; document_kind: 'ci' | 'passport' | 'other' | null; document_last_four: string | null; birth_date: string; identity_revision: number; registration_number: string | null; details: Record<string,string>; origin_kind: 'internal' | 'external' | 'none' | 'unknown'; origin_team_name: string | null; origin_city: string | null; origin_league: string | null; status: 'draft' | 'submitted' | 'approved' | 'observed' | 'rejected'; revision: number }
export const goodFaithSubmitSchema = z.object({ registrationIds: z.array(z.uuid()).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, 'No repitas jugadores.'), expectedVersion: z.number().int().min(0), reason: z.string().trim().min(3).max(300) }).strict();
export const goodFaithReviewSchema = z.object({ version: z.number().int().positive(), decision: z.enum(['approved','observed','rejected']), reason: z.string().trim().min(3).max(300) }).strict();
export interface GoodFaithVersion { id: string; entry_id: string; version: number; status: 'submitted' | 'approved' | 'observed' | 'rejected'; snapshot: Array<{ registrationId: string; playerId: string; givenNames: string; familyNames: string; birthDate: string; registrationNumber: string | null; originKind: string }>; submit_reason: string; submitted_at: string; review_reason: string | null; reviewed_at: string | null }
export const playerDocumentLabelSchema = z.string().trim().min(2).max(80);
export const playerEvidenceReviewSchema = z.object({ decision: z.enum(['approved','rejected']), reason: z.string().trim().min(3).max(300) }).strict();
export interface PlayerDocument { id: string; registration_id: string; label: string; content_type: string; byte_length: number; status: 'uploaded' | 'approved' | 'rejected'; uploaded_at: string; review_reason: string | null }
export const movementDeclareSchema = z.object({ kind: z.enum(['transfer','loan']), startsOn: calendarDateSchema, endsOn: calendarDateSchema.nullable(), reason: z.string().trim().min(3).max(300) }).strict().superRefine((movement, context) => {
  if (movement.kind === 'loan' && !movement.endsOn) context.addIssue({ code: 'custom', message: 'El préstamo necesita fecha de fin.' });
  if (movement.endsOn && movement.endsOn < movement.startsOn) context.addIssue({ code: 'custom', message: 'La fecha final no puede preceder al inicio.' });
});
export interface PlayerMovement { id: string; registration_id: string; kind: 'transfer' | 'loan'; starts_on: string; ends_on: string | null; status: 'declared' | 'approved' | 'rejected'; reason: string; review_reason: string | null }
export const restrictionCreateSchema = z.object({ startsOn: calendarDateSchema, endsOn: calendarDateSchema.nullable(), reason: z.string().trim().min(3).max(300) }).strict().superRefine((restriction, context) => {
  if (restriction.endsOn && restriction.endsOn < restriction.startsOn) context.addIssue({ code: 'custom', message: 'La fecha final no puede preceder al inicio.' });
});
export interface PlayerRestriction { id: string; registration_id: string; starts_on: string; ends_on: string | null; reason: string; lifted_at: string | null }
export interface EligibilityResult { status: 'allowed' | 'warning' | 'blocked'; reasons: string[]; asOf: string; registrationId: string }
export const draftMatchSchema = z.object({ homeEntryId: z.uuid(), awayEntryId: z.uuid(), matchDate: calendarDateSchema }).strict().refine((match) => match.homeEntryId !== match.awayEntryId, 'Elegí dos equipos distintos.');
export interface DraftMatch { id: string; category_id: string; home_entry_id: string; away_entry_id: string; match_date: string; home_name: string; away_name: string; status: 'draft'; acta_status: 'capturing'|'submitted'|'official'|null }
export interface FixturePhase { id: string; category_id: string; rule_version: number; mode: 'league' | 'groups' | 'knockout'; legs: 1 | 2; group_count: number | null; status: 'draft' | 'generated'; revision: number }
export interface FixtureRound { id: string; ordinal: number; leg: 1 | 2; group_no: number; matches: Array<{ id: string; home_entry_id: string; away_entry_id: string; home_name: string; away_name: string; match_date: string | null }>; byes: Array<{ entry_id: string; team_name: string }> }
export interface FixtureBracketSlot { id: string; round_id: string; stage: number; slot: number; home_entry_id: string | null; away_entry_id: string | null; home_source_id: string | null; away_source_id: string | null; match_id: string | null; return_match_id: string | null; decider_match_id?: string | null; home_name: string | null; away_name: string | null }
export interface FixtureOverview { phase: FixturePhase | null; rounds: FixtureRound[]; groups: Array<{ group_no: number; entry_id: string; team_name: string }>; bracket: FixtureBracketSlot[] }
export const matchdayCreateSchema = z.object({ ordinal: z.number().int().min(1).max(999) }).strict();
export const fixtureScheduleSchema = z.object({ matchdayId: z.uuid(), venueId: z.uuid(), courtLabel: z.string().trim().min(1).max(80), date: calendarDateSchema, time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), durationMinutes: z.number().int().min(15).max(240), refereeId: z.uuid().nullable().optional(), refereeName: z.string().trim().max(120).nullable(), expectedRevision: z.number().int().min(0), reason: z.string().trim().min(3).max(300) }).strict();
export const matchdayPublishSchema = z.object({ expectedRevision: z.number().int().positive(), reason: z.string().trim().min(3).max(300) }).strict();
export interface MatchdaySummary { id: string; edition_id: string; ordinal: number; status: 'draft' | 'published'; revision: number; archivedAt?: string | null; matches: Array<{ id: string; category_id: string; fixture_phase_id: string | null; category_name: string; home_entry_id: string; away_entry_id: string; home_name: string; away_name: string; venue_name: string; venue_id: string; court_label: string; match_date: string; match_time: string; duration_minutes: number; referee_id: string | null; referee_name: string | null; schedule_revision: number }>; archivedMatches?: MatchdaySummary['matches'] }
export const lineupPlayerSchema = z.object({ registrationId: z.uuid(), role: z.enum(['starter','bench']), goalkeeper: z.boolean(), captain: z.boolean(), shirtNumber: z.number().int().min(0).max(99).nullable().default(null) }).strict();
export const lineupSaveSchema = z.object({ players: z.array(lineupPlayerSchema).max(100), staffIds: z.array(z.uuid()).max(50), expectedVersion: z.number().int().min(0), reason: z.string().trim().min(3).max(300) }).strict().superRefine((lineup, context) => {
  if (new Set(lineup.players.map((player) => player.registrationId)).size !== lineup.players.length) context.addIssue({ code: 'custom', message: 'No repitas jugadores en la planilla.' });
  if (new Set(lineup.staffIds).size !== lineup.staffIds.length) context.addIssue({ code: 'custom', message: 'No repitas integrantes del cuerpo técnico.' });
  if (lineup.players.filter((player) => player.goalkeeper).length > 1 || lineup.players.filter((player) => player.captain).length > 1) context.addIssue({ code: 'custom', message: 'Elegí como máximo un arquero y un capitán.' });
  if (lineup.players.some((player) => player.role !== 'starter' && (player.goalkeeper || player.captain))) context.addIssue({ code: 'custom', message: 'Arquero y capitán deben ser titulares.' });
  const shirts = lineup.players.map((player) => player.shirtNumber).filter((number): number is number => number !== null);
  if (new Set(shirts).size !== shirts.length) context.addIssue({ code: 'custom', message: 'No repitas dorsales en esta planilla.' });
});
export const lineupTransitionSchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(300) }).strict();
export const lineupReviewSchema = lineupTransitionSchema.extend({ decision: z.enum(['approved','observed','rejected']) });
export interface LineupVersion { id: string; match_id: string; entry_id: string; version: number; status: 'draft' | 'submitted' | 'approved' | 'observed' | 'rejected'; snapshot: { players: z.infer<typeof lineupPlayerSchema>[]; staffIds: string[] }; rule_version: number; good_faith_version: number; reason: string; created_at: string; review_reason: string | null }
