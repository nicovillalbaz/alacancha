<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { accessLabels, accessStates, roleLabels, rulePresets, ruleSchema, tiebreakerLabels, playerDraftSchema, matchPeriodCodes, knockoutRoundName, previewCompetitionBracket, type PlannedRound, type AccessState, type CurrentUser, type OrganizationSummary, type RuleConfig, type TournamentSummary, type TournamentResources, type TeamSummary, type PlayerDraftSummary, type PlayerDraftInput, type GoodFaithVersion, type PlayerDocument, type PlayerMovement, type PlayerRestriction, type EligibilityResult, type DraftMatch, type LineupVersion, type PlayerImportBatch, type PlayerIdentitySearch, type PlayerIdentityChange, type FixtureOverview, type PositionBlueprintView, type PositionCompetitionView, type MatchdaySummary, type MatchCaptureView, type MatchJournalEvent } from '@torneos/shared';
import Icon from './Icon.vue';
import PublicDirectory from './PublicDirectory.vue';
import type { PublicDraw } from './PublicPositionPortal.vue';
import SportTabs from './SportTabs.vue';
import SportEventMark from './SportEventMark.vue';
import PublicMatchRow from './PublicMatchRow.vue';
import InstallButton from './InstallButton.vue';
import { queueMatchEvent,queuedMatchEvents,removeQueuedMatchEvent,type QueuedMatchEvent } from './offline-events.ts';

const LoadingScreen = defineComponent(() => () => h('p', { class: 'small muted pad', role: 'status' }, 'Cargando…'));
const LoadError = defineComponent(() => () => h('div', { class: 'pad stack', role: 'alert' }, [
  h('p', 'No se pudo abrir esta vista.'),
  h('button', { class: 'btn', type: 'button', onClick: () => location.reload() }, 'Reintentar'),
]));
const lazyScreen = (loader: () => Promise<{ default: import('vue').Component }>) => defineAsyncComponent({ loader, loadingComponent: LoadingScreen, errorComponent: LoadError, delay: 150 });
const RulesEditor = lazyScreen(() => import('./RulesEditor.vue'));
const BracketView = lazyScreen(() => import('./BracketView.vue'));
const FanPortal = lazyScreen(() => import('./FanPortal.vue'));
const TournamentWorkspace = lazyScreen(() => import('./TournamentWorkspace.vue'));
const PositionBlueprint = lazyScreen(() => import('./PositionBlueprint.vue'));
const PositionMatches = lazyScreen(() => import('./PositionMatches.vue'));
const PositionStatistics = lazyScreen(() => import('./PositionStatistics.vue'));
const PublicPositionPortal = lazyScreen(() => import('./PublicPositionPortal.vue'));
const FlyerSettings = lazyScreen(() => import('./FlyerSettings.vue'));
const FixtureDayEditor = lazyScreen(() => import('./FixtureDayEditor.vue'));
const PaymentsWorkspace = lazyScreen(() => import('./PaymentsWorkspace.vue'));

interface Administrator { id: string; user_id: string; name: string; username: string; organization_id: string; organization_name: string; organization_status: AccessState; status: AccessState; role: keyof typeof roleLabels; version: number }
interface Audit { id: string; action: string; reason: string; actor: string; organization_name: string | null; created_at: string; before_data: { status?: AccessState } | null; after_data: { status?: AccessState } | null }
interface TechnicalError { id:string;occurred_at:string;source:'api'|'worker';organization_id:string|null;request_id:string|null;operation:string;method:string|null;status_code:number|null;error_code:string;error_type:string|null;message:string|null;resource_id:string|null }
interface AccessDraft { status: AccessState; reason: string; version: number }
interface LinkResult { url: string; expiresInHours: number }
interface TokenInfo { name: string; username: string; organization_name: string | null; purpose: 'invite' | 'recovery'; has_password: boolean; currentUser: CurrentUser | null }
interface PublicFixtureDay { id: string; ordinal: number; tournament_id:string; edition_name: string; tournament_name: string; matches: Array<{ id: string; category_id:string; category_name: string; home_name: string; away_name: string; home_team_id:string; away_team_id:string; venue_name: string; court_label: string; match_date: string; match_time: string; result: { status:'provisional'|'official'; score:{home:number;away:number};shootout:{home:number;away:number};players:Array<{side:'home'|'away';name:string;shirtNumber:number|null}>;events:Array<{id:string;kind:string;side:'home'|'away'|'unknown';period:string|null;minute:number|null;cardLabel:string|null;cardColor:string|null;name:string;relatedName:string|null}> }|null }> }
interface PublicCatalogItem {id:string;name:string;public_slug:string|null;organization_id:string;organization_name:string;organization_slug:string}
interface PublicOrganizationItem {id:string;name:string;public_slug:string;has_logo:boolean;tournament_count:number;single_tournament_id:string|null;single_tournament_slug:string|null}
interface PublicOrganization {id:string;name:string;accent:string;logo_id:string|null;public_slug:string}
interface MatchAssignment {id:string;match_id:string;duty:'capture'|'review';membership_id:string;name:string;member_status:string;category_id:string;home_name:string;away_name:string;day_ordinal:number|null;day_status:'draft'|'published'|null;acta_status:'capturing'|'submitted'|'official'|null}
interface OperatorSummary {id:string;name:string;username:string;status:string}
interface PublicBracket { phase_id:string; category_id:string; category_name: string; edition_name: string; tournament_id:string; tournament_name: string; repechage?: boolean; slots: Array<{ stage: number; slot: number; home: string; away: string; twoLegs?: boolean;homeScore?:number|null;awayScore?:number|null }> }
interface PublicStats { available: boolean; reason?: string; phaseMode?: string | null; officialMatches?: number; tables?: Array<{ groupNo: number | null; rows: Array<{ position: number; unresolved: boolean; teamName: string; played: number; wins: number; draws: number; losses: number; points: number; goalsFor: number; goalsAgainst: number; goalDifference: number }> }>; scorers?: Array<{ name: string; teamName: string; goals: number; penalties: number }>; rosters?:Array<{entryId:string;players:Array<{name:string;goals:number;yellowCards:number;redCards:number}>}>;unlistedGoals?: number }
interface FlyerItem {id:string;kind:string;sourceId:string;pageNo:number;version:number;template:string;format:string;size:string;status:string;error:string|null;publicVisible:boolean;createdAt:string;stale:boolean}
interface DisciplineCase { id:string;entry_id:string;registration_id:string|null;source_kind:string;source_valid:boolean;status:string;summary:string;evidence_note:string|null;team_name:string;player_name:string|null;decision_id:string|null;decision_status:string|null;suspension_unit:string|null;suspension_matches:number|null;starts_on:string|null;ends_on:string|null;fine_amount_guaranies:number|null;decision_reason:string|null }
interface ReviewTask { id:string;entry_id:string;kind:string;state:string;summary:string;created_at:string;owner:'organizer'|'team';target:string;team_name:string;due_at:string|null }
interface FineCatalogItem { id:string;code:string;version:number;label:string;amount_guaranies:number }
interface PrivateStats { officialMatches:number; entries:Array<{id:string;name:string;groupNo:number|null}>; players:Array<{ registrationId:string;entryId:string;name:string;publicName:boolean;goals:number;yellowCards:number;redCards:number;appearances:number }>;defense:Array<{entryId:string;played:number;goalsAgainst:number}>;tables:Array<{groupNo:number|null;groups:Array<{position:number;teamIds:string[];unresolved:boolean}>;totals:Array<{teamId:string;points:number;played:number;wins:number;goalsFor:number;goalsAgainst:number}>}> }
class RequestError extends Error { constructor(message: string, public code = '', public status = 0) { super(message); } }
function routeFromLocation(){
  if(location.hash.startsWith('#/'))return location.hash.slice(2);
  const segments=location.pathname.split('/').filter(Boolean);
  if(!segments.length)return 'publico';
  if(segments.length===1&&['acceso','panel'].includes(segments[0]))return segments[0];
  const mount=document.getElementById('app')?.dataset;
  if(mount?.publicOrganizationId&&mount.publicPath===location.pathname&&segments.length<=2)return `publico/${mount.publicOrganizationId}${mount.publicTournamentId?`/${mount.publicTournamentId}`:''}`;
  if(segments.length<=2&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segments[0])&&(!segments[1]||/^[0-9a-f-]{36}$/i.test(segments[1])))return `portal/${segments.join('/')}`;
  return 'publico';
}
function setPublicPageMeta(title:string,description:string,canonical:string,image=''){
  document.title=title;
  const meta=(key:string,value:string,property=false)=>{const attribute=property?'property':'name';let element=document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);if(!element){element=document.createElement('meta');element.setAttribute(attribute,key);document.head.append(element);}element.content=value;};
  meta('description',description);meta('og:type','website',true);meta('og:title',title,true);meta('og:description',description,true);meta('og:url',canonical,true);
  let link=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');if(!link){link=document.createElement('link');link.rel='canonical';document.head.append(link);}link.href=canonical;
  document.head.querySelector('meta[property="og:image"]')?.remove();
  if(image)meta('og:image',image,true);
  meta('twitter:card',image?'summary_large_image':'summary');
  (window as Window & { gtag?: (...args: unknown[]) => void }).gtag?.('event','page_view',{page_location:canonical,page_title:title});
}
const initialRoute=routeFromLocation();
const route = ref(initialRoute);
const user = ref<CurrentUser | null>(null);
const members = ref<Administrator[]>([]);
const organizations = ref<OrganizationSummary[]>([]);
const organization = ref<OrganizationSummary | null>(null);
const tournaments = ref<TournamentSummary[]>([]);
const tournamentResources = ref<TournamentResources>({ venues: [], sponsors: [] });
const publicSponsors = ref<Array<{ tournament_id: string; id: string; name: string }>>([]);
const teams = ref<TeamSummary[]>([]);
const allOriginTeams = ref<Array<{ id: string; name: string }>>([]);
const players = ref<PlayerDraftSummary[]>([]);
const teamRosters = ref<Record<string,PlayerDraftSummary[]>>({});
const teamMatches = ref<Record<string,DraftMatch[]>>({});
const goodFaithVersions = ref<GoodFaithVersion[]>([]);
const draftMatches = ref<DraftMatch[]>([]), lineupVersions = ref<LineupVersion[]>([]);
const fixture = ref<FixtureOverview>({ phase: null, rounds: [], groups: [], bracket: [] });
const workspaceBlueprint = ref<PositionBlueprintView & { categoryId?:string }>({ blueprint:null, slots:[], games:[] });
const workspaceCompetition=ref<PositionCompetitionView|null>(null);
const fixedRulesConfirmed=ref(false);
function formatTiebreaks(rules:RuleConfig){return rules.advanced?.tiebreakers.map(item=>tiebreakerLabels[item]).join(' → ')||'Elegir';}
const hasPositionFormat=computed(()=>!!selectedTournament.value&&workspaceBlueprint.value.categoryId===selectedTournament.value.category_id&&!!workspaceBlueprint.value.blueprint);
const fixtureSeedOrder = ref<string[]>([]);
const teamAction = ref<'admin'|'commission'|'staff'|'category'|null>(null);
const teamTab = ref('players');
const goodFaithTab = ref('players');
const playerTab = ref('record');
const disciplineTab = ref('cases'), disciplineSettingsTab = ref('case');
const fixtureAdvanceReason = ref('');
const fixtureTie=ref<{categoryId:string;sourceKey:string;candidates:Array<{entryId:string;name:string}>;order:string[]}|null>(null);
const capture = ref<MatchCaptureView | null>(null);
const capturePreview=ref<{day:MatchdaySummary;match:MatchdaySummary['matches'][number]}|null>(null);
const captureStartBlocked=ref(false);
const matchTab = ref('events');
const publicStatsTab = reactive<Record<string,string>>({});
const captureKind = ref<'goal' | 'penalty' | 'penalty_miss' | 'own_goal' | 'yellow' | 'second_yellow' | 'red' | 'custom_card' | 'substitution' | 'incident' | 'shootout_goal' | 'shootout_miss'>('goal');
const captureCardCode = ref('');
const captureTeamId = ref(''), capturePeriod = ref<typeof matchPeriodCodes[number] | null>(null);
const captureKinds = [{ value: 'goal', label: 'Gol' }, { value: 'penalty', label: 'Gol de penal' }, { value: 'penalty_miss', label: 'Penal errado' }, { value: 'own_goal', label: 'Autogol' }, { value: 'yellow', label: 'Amarilla' }, { value: 'second_yellow', label: 'Segunda amarilla' }, { value: 'red', label: 'Roja' }, { value: 'custom_card', label: 'Otra tarjeta' }, { value: 'substitution', label: 'Cambio' }, { value: 'incident', label: 'Incidencia' }, { value: 'shootout_goal', label: 'Tanda: convertido' }, { value: 'shootout_miss', label: 'Tanda: fallado' }] as const;
const captureMinute=ref(''),captureRelatedRegistrationId=ref(''),captureIncidentNote=ref(''),captureWindowNo=ref('');
const actaReason=ref(''),overrideSignoffs=ref(false),captureHistory=ref<Array<{id:string;version:number;kind:string;event_revision:number;reason:string;actor:string;created_at:string;signoffs:number}>>([]);
const matchAssignments=ref<MatchAssignment[]>([]),operators=ref<OperatorSummary[]>([]),operatorDraft=reactive({name:'',username:''}),operatorInvitation=ref<LinkResult|null>(null),assignmentDraft=reactive({membershipId:'',duty:'capture' as 'capture'|'review',reason:''}),assignmentReasons=reactive<Record<string,string>>({});
const pendingCapture = ref<{ key: string; id: string } | null>(null);
const pendingCaptureUndo = ref<{ eventId: string; id: string } | null>(null);
const queuedCapture=ref<QueuedMatchEvent[]>([]),queueError=ref('');
const teamActa=ref<{view:MatchCaptureView;submissionId:string|null;signed:boolean;approvedVersion:number|null}|null>(null);
const disciplineCases=ref<DisciplineCase[]>([]),disciplineNotices=ref<Array<{id:string;case_id:string;kind:string;read_at:string|null}>>([]),fineCatalog=ref<FineCatalogItem[]>([]),privateStats=ref<PrivateStats|null>(null);
const reviewTasks=ref<ReviewTask[]>([]);
const reviewHasMore=ref(false);
const reviewStateLabels:Record<string,string>={submitted:'Presentado',observed:'Observado',rejected:'Rechazado',proposed:'Propuesto',uploaded:'Recibido',declared:'Declarado',draft:'Borrador',review:'En revisión',appealed:'Apelado',unread:'Sin leer'};
function reviewActionLabel(task:ReviewTask){return ({good_faith:task.state==='submitted'?'Revisar lista':'Corregir lista',commission:'Confirmar comisión',document:'Revisar documento',movement:'Revisar procedencia',registration:'Completar inscripción',discipline:task.state==='appealed'?'Resolver apelación':'Revisar expediente',notice:'Leer notificación',acta:'Revisar acta',acta_signoff:'Dar conformidad'} as Record<string,string>)[task.kind]||'Abrir tarea';}
async function loadReviewTasks(reset=true){
  if(!user.value?.organizationId)return;
  const org=user.value.organizationId,offset=reset?0:reviewTasks.value.length;
  const result=await api<{items:ReviewTask[];hasMore:boolean}>(`/organizations/${org}/review-inbox?offset=${offset}`);
  if(user.value?.organizationId!==org||parts.value[0]!=='bandeja')return;
  reviewTasks.value=reset?result.items:[...reviewTasks.value,...result.items];reviewHasMore.value=result.hasMore;
}
const selectedDisciplineCaseId=ref(''),disciplinePlayerSearch=ref(''),disciplineReasons=reactive<Record<string,string>>({}),publicationReasons=reactive<Record<string,string>>({});
const disciplineHistory=ref<Array<{kind:string;reason:string;created_at:string}>>([]);
const disciplineServiceHistory=ref<Array<{match_id:string;match_date:string;current_approval:boolean}>>([]);
const disciplineKindLabels:Record<string,string>={red:'Roja',second_yellow:'Segunda amarilla',yellow_accumulation:'Acumulación de amarillas',incident:'Incidencia',manual:'Caso manual'};
const caseDraft=reactive({registrationId:'',summary:'',evidenceNote:''}),fineDraft=reactive({code:'',label:'',amountGuaranies:0});
const decisionDraft=reactive({mode:'none' as 'none'|'matches'|'date_range',matches:1,startsOn:'',endsOn:'',fineCatalogId:'',reason:''});
const pointsDraft=reactive({delta:0,reason:''}),standingAdjustments=ref<Array<{id:string;entry_id:string;team_name:string;points_delta:number;reason:string}>>([]);
const tieOrder=ref<string[]>([]),tieReason=ref('');
const unresolvedTie=computed(()=>privateStats.value?.tables.flatMap(table=>table.groups.filter(group=>group.unresolved).map(group=>({groupNo:table.groupNo,...group})))[0]||null);
watch(unresolvedTie,(tie)=>{if(!tie&&disciplineSettingsTab.value==='tiebreak')disciplineSettingsTab.value='case';});
function moveTieEntry(index:number,offset:number){const target=index+offset;if(target<0||target>=tieOrder.value.length)return;const copy=[...tieOrder.value];[copy[index],copy[target]]=[copy[target],copy[index]];tieOrder.value=copy;}
const selectedDisciplineCase=computed(()=>disciplineCases.value.find(item=>item.id===selectedDisciplineCaseId.value)||null);
let lastCaptureTap = { key: '', at: 0 };
let publicResultsStream:EventSource|null=null;
let privateMatchStream:EventSource|null=null;
const publicTournaments = ref<TournamentSummary[]>([]);
const publicCatalog=ref<PublicCatalogItem[]>([]);
const publicOrganizations=ref<PublicOrganizationItem[]>([]);
const publicDraws=ref<PublicDraw[]>([]);
const publicResultsRevision=ref(0);
const publicTournament=computed(()=>publicTournaments.value.find(item=>item.id===parts.value[2])||null);
const matchdays = ref<MatchdaySummary[]>([]), publicFixture = ref<PublicFixtureDay[]>([]), publicBrackets = ref<PublicBracket[]>([]), publicStatistics = ref<Record<string,PublicStats>>({});
function publicStatsTabsFor(item:TournamentSummary){return [
  ...(item.rules.initialPhase?.mode==='knockout'?[]:[{key:'classification',label:'Clasificación',icon:'chart'}]),
  {key:'scorers',label:'Goleadores',icon:'ball'},
];}
function activePublicStatsTab(item:TournamentSummary){const tabs=publicStatsTabsFor(item);return tabs.some(tab=>tab.key===publicStatsTab[item.category_id])?publicStatsTab[item.category_id]:tabs[0].key;}
const workspaceMatchdays = ref<MatchdaySummary[]>([]);
const workspaceScores=ref<Record<string,{home:number;away:number}>>({});
const workspaceOfficialMatchIds = ref<string[]>([]);
const workspaceCases = ref<Record<string, DisciplineCase[]>>({});
const workspaceStats = ref<Record<string, PrivateStats>>({});
const workspaceBrackets = ref<Record<string, FixtureOverview>>({});
const flyers=ref<FlyerItem[]>([]),publicFlyers=ref<Array<{id:string;kind:string;sourceId:string;tournamentId:string;title:string;subtitle:string;format:string}>>([]),flyerPreview=ref(''),flyerPages=ref(1),flyerPageLabels=ref<string[]>([]);
const generatedFlyerId=ref('');
const generatedFlyer=computed(()=>flyers.value.find(item=>item.id===generatedFlyerId.value)||null);
const flyerBracketSources=ref<Array<{id:string;label:string}>>([]);
const flyerDraft=reactive({kind:'notice' as 'match'|'matchday'|'result'|'standings'|'scorers'|'scorer'|'defense'|'bracket'|'semifinal'|'final'|'champion'|'notice',sourceId:'',size:'square' as 'square'|'portrait'|'story'|'print',format:'png' as 'png'|'jpg'|'pdf',template:'forest' as 'forest'|'paper',pageNo:1,note:'',reason:''});
const flyerLabels:Record<string,string>={match:'Previa 1 vs 1',matchday:'Jornada completa',result:'Resultado y goleadores',standings:'Clasificación',scorers:'Goleadores',scorer:'Goleador',defense:'Valla menos vencida',bracket:'Cuadro',semifinal:'Semifinal',final:'Final',champion:'Campeón',notice:'Comunicado'};
const flyerSources=computed(()=>{const item=selectedTournament.value;if(!item)return [];if(flyerDraft.kind==='notice')return [{id:item.id,label:item.name}];if(['standings','scorers','defense'].includes(flyerDraft.kind))return tournaments.value.filter(category=>category.id===item.id).map(category=>({id:category.category_id,label:category.category_name}));if(['bracket','semifinal','final'].includes(flyerDraft.kind))return flyerBracketSources.value;if(flyerDraft.kind==='matchday')return matchdays.value.filter(day=>day.status==='published').map(day=>({id:day.id,label:`Fecha ${day.ordinal}`}));return matchdays.value.filter(day=>day.status==='published').flatMap(day=>day.matches.map(match=>({id:match.id,label:`${match.home_name} vs ${match.away_name} · Fecha ${day.ordinal}`})));});
const flyerScoped=computed(()=>parts.value[0]==='flyers'&&!!parts.value[2]&&!!parts.value[3]);
const flyerScopeLabel=computed(()=>flyerSources.value.find(item=>item.id===parts.value[3])?.label||'Contenido no disponible');
async function loadFlyers(){if(user.value?.organizationId)flyers.value=await api(`/organizations/${user.value.organizationId}/flyers`);}
async function previewFlyer(){if(!user.value?.organizationId||!flyerDraft.sourceId)return;await perform(async()=>{let response:Response;try{response=await fetch(`/api/v1/organizations/${user.value!.organizationId}/flyers/preview`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':user.value!.csrfToken},body:JSON.stringify({kind:flyerDraft.kind,sourceId:flyerDraft.sourceId,size:flyerDraft.size,pageNo:flyerDraft.pageNo,note:flyerDraft.note.trim()||null,template:flyerDraft.template})});}catch{throw new RequestError('No hay respuesta del servidor. El texto sigue en el formulario; reintentá cuando vuelva la conexión.','NETWORK_ERROR');}if(!response.ok){const data=await response.json();throw new RequestError(data.message||'No se pudo mostrar la vista previa.',data.code,response.status);}flyerPages.value=Number(response.headers.get('X-Flyer-Pages')||1);try{flyerPageLabels.value=JSON.parse(response.headers.get('X-Flyer-Page-Labels')||'[]');}catch{flyerPageLabels.value=[];}if(flyerPreview.value)URL.revokeObjectURL(flyerPreview.value);flyerPreview.value=URL.createObjectURL(new Blob([await response.text()],{type:'image/svg+xml'}));});}
function resetFlyerPage(){flyerDraft.pageNo=1;flyerPages.value=1;flyerPageLabels.value=[];if(flyerPreview.value)URL.revokeObjectURL(flyerPreview.value);flyerPreview.value='';}
async function changeFlyerPage(offset:number){const next=flyerDraft.pageNo+offset;if(next<1||next>flyerPages.value)return;flyerDraft.pageNo=next;await previewFlyer();}
async function selectFlyerPage(pageNo:number){if(flyerDraft.pageNo===pageNo)return;flyerDraft.pageNo=pageNo;await previewFlyer();}
async function createFlyer(){if(!user.value?.organizationId||!flyerDraft.sourceId)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/flyers`,'POST',{kind:flyerDraft.kind,sourceId:flyerDraft.sourceId,size:flyerDraft.size,pageNo:flyerDraft.pageNo,note:flyerDraft.note.trim()||null,template:flyerDraft.template,format:flyerDraft.format,requestKey:crypto.randomUUID(),reason:'Flyer generado por el organizador'});await loadFlyers();notify('Flyer enviado a generar. Actualizá el historial en unos segundos.');});}
async function createScopedFlyer(){if(!user.value?.organizationId||!selectedTournament.value||!flyerDraft.sourceId)return;generatedFlyerId.value='';const org=user.value.organizationId,tournamentId=selectedTournament.value.id;
  const settings=await api<{template:'forest'|'paper';size:'square'|'portrait'|'story'|'print';format:'png'|'jpg'|'pdf'}>(`/organizations/${org}/tournaments/${tournamentId}/flyer-settings`);
  const item=await api<{id:string}>(`/organizations/${org}/flyers`,'POST',{kind:flyerDraft.kind,sourceId:flyerDraft.sourceId,size:settings.size,pageNo:flyerDraft.pageNo,note:null,template:settings.template,format:settings.format,requestKey:crypto.randomUUID(),reason:'Flyer generado desde su sección'});
  generatedFlyerId.value=item.id;await loadFlyers();const atRoute=route.value;
  void (async()=>{for(let attempt=0;attempt<20;attempt++){if(route.value!==atRoute)return;const current=flyers.value.find(row=>row.id===item.id);if(current?.status==='ready'||current?.status==='failed')return;await new Promise(resolve=>setTimeout(resolve,1500));if(route.value!==atRoute)return;try{await loadFlyers();}catch{return;}}})();
}
async function publishFlyer(item:FlyerItem){if(!user.value?.organizationId)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/flyers/${item.id}/publication`,'POST',{publicVisible:!item.publicVisible,reason:'Revisión de difusión del organizador'});await loadFlyers();notify(item.publicVisible?'Flyer ocultado.':'Flyer publicado.');});}
function sharePublicLink(){if(publicOrganization.value){const alias=publicCatalog.value.find(item=>item.id===parts.value[2])?.public_slug;const slug=publicOrganization.value.public_slug;void copyLink(`${window.location.origin}${alias?`/${alias}`:slug?`/${slug}${parts.value[2]?`/${parts.value[2]}`:''}`:`/#/publico/${publicOrganization.value.id}${parts.value[2]?`/${parts.value[2]}`:''}`}`);}}
const referees=ref<Array<{id:string;name:string;archived_at:string|null}>>([]),newRefereeName=ref(''),refereeArchiveReason=ref('');
const scheduleDraft = reactive({ matchdayId: '', venueId: '', courtLabel: '', date: '', time: '', durationMinutes: 60, refereeId:'', refereeName: '', reason: '' });
const manualMatchId = ref('');
const manualMatchDraft = reactive({ homeEntryId: '', awayEntryId: '', reason: '' });
function beginMatchCorrection(match: { id: string; home_entry_id: string; away_entry_id: string }) {
  manualMatchId.value = match.id;
  manualMatchDraft.homeEntryId = match.home_entry_id;
  manualMatchDraft.awayEntryId = match.away_entry_id;
  manualMatchDraft.reason = '';
}
async function saveMatchCorrection() {
  if (!user.value?.organizationId || !selectedTournament.value || !manualMatchId.value) return;
  await perform(async () => {
    if (manualMatchDraft.homeEntryId === manualMatchDraft.awayEntryId) throw new Error('Elegí dos equipos distintos.');
    if (manualMatchDraft.reason.trim().length < 3) throw new Error('Indicá por qué cambian los equipos.');
    await api(`/organizations/${user.value!.organizationId}/fixture/matches/${manualMatchId.value}/participants`, 'PATCH', manualMatchDraft);
    manualMatchId.value = '';
    await Promise.all([loadFixture(selectedTournament.value!.category_id), loadMatchdays(selectedTournament.value!.edition_id)]);
    notify('Equipos del partido actualizados.');
  });
}
const scheduleMatchId = ref(''), schedulePreview = ref<{ conflicts: string[]; warnings: string[]; canSave: boolean } | null>(null), schedulePreviewKey = ref('');
const matchdayPreview = ref<{ id: string; ordinal: number; status: string; revision: number; snapshot: MatchdaySummary['matches']; missing: string[] } | null>(null), matchdayPublishReason = ref('');
const importRows = ref<PlayerDraftInput[]>([]), importToken = ref(''), importReason = ref('');
const importBatches = ref<PlayerImportBatch[]>([]), importRevertReasons = reactive<Record<string,string>>({});
const lineupPlayers = reactive<Record<string,{ role: 'starter' | 'bench'; goalkeeper: boolean; captain: boolean; shirtNumber: number | null }>>({});
const lineupSearch = ref('');
const lineupStaffIds = ref<string[]>([]), lineupReason = ref(''), lineupReviewReason = ref('');
const lineupDecision = ref<'observed' | 'rejected' | null>(null);
const lineupEligibility = reactive<Record<string,EligibilityResult>>({}), lineupExceptions = ref<Array<{ id: string; registration_id: string; reason: string }>>([]), lineupExceptionReasons = reactive<Record<string,string>>({});
const playerEvidence = ref<{ documents: PlayerDocument[]; movements: PlayerMovement[]; restrictions: PlayerRestriction[] }>({ documents: [], movements: [], restrictions: [] });
const identityHistory = ref<PlayerIdentityChange[]>([]), identityDraft = reactive({ playerId: '', givenNames: '', familyNames: '', birthDate: '', documentKind: 'ci' as 'ci'|'passport'|'other', documentNumber: '', expectedRevision: 1, reason: '' });
const reuseSearch = ref(''), reuseResults = ref<PlayerIdentitySearch[]>([]), reuseDraft = reactive({ playerId: '', registrationNumber: '', reason: '', originKind: 'unknown' as PlayerDraftInput['origin']['kind'], teamId: '', teamName: '', city: '', league: '' });
const eligibility = ref<EligibilityResult | null>(null);
const eligibilityDate = ref(new Date().toISOString().slice(0,10));
const evidenceLabel = ref(''), evidenceReason = ref('');
const movementDraft = reactive({ kind: 'transfer' as 'transfer' | 'loan', startsOn: '', endsOn: '', reason: '' });
const restrictionDraft = reactive({ startsOn: '', endsOn: '', reason: '' });
const categories = ref<Array<{ id: string; category_name: string; edition_name: string; tournament_name: string; team_limit: number | null }>>([]);
const publicOrganization = ref<PublicOrganization | null>(null);
const publicTeams = ref<Array<{ id: string; entry_id:string; name: string; color: string; has_shield: boolean; category_id: string }>>([]);
const activity = ref<Audit[]>([]);
const technicalErrors=ref<TechnicalError[]>([]),activityTab=ref<'changes'|'errors'>('changes');
const loading = ref(false), loadingVisual = ref(false), busy = ref(false), error = ref(''), success = ref(''), online = ref(navigator.onLine);
let loadingTimer:ReturnType<typeof setTimeout>|null=null;
const errorCode = ref('');
const login = reactive({ username: '', password: '' });
const showPassword = ref(false);
const passwordDraft = ref('');
const ownPasswordOpen = ref(false);
const adminPasswordTarget = ref('');
const search = ref(''), statusFilter = ref('Todos'), organizationSearch = ref('');
const createDraft = reactive({ name: '', administratorName: '', username: '' });
const creationRequestId = ref(crypto.randomUUID());
const accessDrafts = reactive<Record<string, AccessDraft>>({});
const brandDrafts = reactive<Record<string, { name: string; accent: string; version: number }>>({});
const createResult = ref<{ organizationId: string; membershipId: string; invitation: LinkResult } | null>(null);
const generatedLink = ref<LinkResult | null>(null);
const linkTarget = ref('');
const linkReason = ref('');
const tokenInfo = ref<TokenInfo | null>(null);
const tokenPassword = reactive({ password: '', confirm: '' });
const wizardStep = ref(1);
const tournamentRequestId = ref(crypto.randomUUID());
const categoryRequestId = ref(crypto.randomUUID());
const categoryStep = ref(1);
const suggestedRules = (n = 5): RuleConfig => ({ initialPhase: { mode: 'league', legs: 1, groupCount: null }, playersOnField: n, minimumToStart: Math.max(1,n-1), minimumToContinue: Math.max(1,n-2), maxMatchRoster: n + 7, maxBenchPlayers: 7, maxBenchStaff: 3, lineupRoles: { goalkeeperRequired: false, captainRequired: false }, maxRegisteredPlayers: null, substitutions: { mode: 'unlimited', maxChanges: null, maxWindows: null, reentry: true }, eligibility: { age: null, requiredDocuments: [], registrationWindow: null, transferProof: { requiredFor: 'none', label: 'Comprobante de pase' }, registrationFields: [] }, advanced: { tiebreakers: ['head_to_head_points','goal_difference','goals_for','wins','manual_draw'], discipline: { yellowCards: true, redCards: true, secondYellowRed: false, yellowAccumulation: null, redReviewRequired: false }, walkover: { enabled: false, winnerGoals: null, loserGoals: null, winnerPoints: null, loserPoints: null } }, periods: [{ name: 'Primer tiempo', minutes: 20 }, { name: 'Segundo tiempo', minutes: 20 }], points: { win: 3, draw: 1, loss: 0 } });
const tournamentDraft = reactive({ name: '', editionName: '', categoryName: '', timezone: 'America/Asuncion', preset: 'F5' as typeof rulePresets[number], teamLimit: null as number | null, rules: suggestedRules(), paymentRates:{yellowGuaranies:0,redGuaranies:0,customCardRates:{} as Record<string,number>} });
const quickCardOpen=ref(false),quickCard=reactive({name:'',color:'#2278C7',suspensionMatches:0,amountGuaranies:0});
const canAddQuickCard=computed(()=>{const label=quickCard.name.trim(),cards=tournamentDraft.rules.advanced?.discipline.customCards||[];return label.length>=2&&label.length<=40&&cards.length<8&&!cards.some(card=>card.label.toLocaleLowerCase('es')===label.toLocaleLowerCase('es'))&&Number.isInteger(quickCard.suspensionMatches)&&quickCard.suspensionMatches>=0&&quickCard.suspensionMatches<=50&&Number.isInteger(quickCard.amountGuaranies)&&quickCard.amountGuaranies>=0&&quickCard.amountGuaranies<=1000000000;});
watch(()=>tournamentDraft.rules.advanced?.discipline.customCards,cards=>{const valid=new Set((cards||[]).map(card=>card.code));for(const code of valid)if(tournamentDraft.paymentRates.customCardRates[code]===undefined)tournamentDraft.paymentRates.customCardRates[code]=0;for(const code of Object.keys(tournamentDraft.paymentRates.customCardRates))if(!valid.has(code))delete tournamentDraft.paymentRates.customCardRates[code];},{deep:true});
const categoryDraft = reactive({ editionName: '', categoryName: '', preset: 'F5' as typeof rulePresets[number], teamLimit: null as number | null, rules: suggestedRules() });
const teamDraft = reactive({ name: '', color: '#165D46', categoryId: '' });
const teamNameEditing = ref(false), teamNameDraft = ref('');
const teamDraftShield = ref<File|null>(null);
const teamDraftShieldInput = ref<HTMLInputElement|null>(null);
const teamRequestId = ref(crypto.randomUUID());
const entryCategoryId = ref('');
const teamAdminDraft = reactive({ entryId: '', name: '', username: '' });
const teamLink = ref<{ url: string } | null>(null);
const venueDraft = reactive({ name: '', city: '' }), sponsorDraft = reactive({ name: '' });
const resourceReasons = reactive<Record<string,string>>({}), adminRevokeReasons = reactive<Record<string,string>>({}), commissionEndReasons = reactive<Record<string,string>>({});
const commissionDraft = reactive({ entryId: '', name: '', role: '', validFrom: '', validUntil: '' });
const staffDraft = reactive({ entryId: '', name: '', role: '' });
const newPlayerDraft = reactive({ givenNames: '', familyNames: '', documentKind: 'ci' as PlayerDraftInput['documentKind'], documentNumber: '', birthDate: '', registrationNumber: '', details: {} as Record<string,string>, originKind: 'unknown' as PlayerDraftInput['origin']['kind'], originTeamId: '', originTeamName: '', originCity: '', originLeague: '' });
const playerStep = ref(1), playerSearch = ref('');
const goodFaithSubmitReason = ref(''), goodFaithReviewReason = ref('');
const goodFaithDecision = ref<'observed' | 'rejected' | null>(null);
function resetPlayerDraft() { Object.assign(newPlayerDraft, { givenNames: '', familyNames: '', documentKind: 'ci', documentNumber: '', birthDate: '', registrationNumber: '', details: {}, originKind: 'unknown', originTeamId: '', originTeamName: '', originCity: '', originLeague: '' }); playerStep.value = 1; }
const teamConfirmReasons = reactive<Record<string,string>>({});
const teamPublishReasons = reactive<Record<string,string>>({});
const ruleDrafts = reactive<Record<string, { rules: RuleConfig; revision: number; reason: string }>>({});
const ruleDraftStorageKey = (organizationId: string, categoryId: string) => `torneos-rule-draft:${organizationId}:${categoryId}`;
watch(ruleDrafts, (drafts) => {
  const organizationId = user.value?.organizationId;
  if (!organizationId) return;
  for (const [categoryId,draft] of Object.entries(drafts)) {
    const item = tournaments.value.find((row) => row.category_id === categoryId);
    if (item) sessionStorage.setItem(ruleDraftStorageKey(organizationId,categoryId), JSON.stringify({ ...draft, ruleVersion: item.rule_version }));
  }
}, { deep: true });
const publishPreviewCategory = ref('');
const showRuleEditor = ref(false);
const returnRoute = ref('');
const sessionNotice = ref('');
let organizationEpoch = 0, toastTimer: ReturnType<typeof setTimeout>, routeEpoch = 0;
const parts = computed(() => route.value.split('/'));
const publicRoute = computed(() => ['acceso', 'invitacion', 'recuperacion', 'publico', 'portal', 'panel'].includes(parts.value[0]));
const selectedMember = computed(() => members.value.find((item) => item.id === parts.value[1]));
const selectedOrg = computed(() => organizations.value.find((item) => item.id === parts.value[1]) || (organization.value?.id === parts.value[1] ? organization.value : null));
const selectedTournament = computed(() => ['categoria','fixture','programar','partido'].includes(parts.value[0]) ? tournaments.value.find((item) => item.category_id === parts.value[1]) : tournaments.value.find((item) => item.id === parts.value[1]));
watch(flyerSources,(sources)=>{if(flyerScoped.value){flyerDraft.sourceId=sources.some(source=>source.id===parts.value[3])?parts.value[3]:'';return;}if(!sources.some(source=>source.id===flyerDraft.sourceId))flyerDraft.sourceId=sources.length===1?sources[0].id:'';});
const tournamentList = computed(() => tournaments.value.filter((item,index,all) => all.findIndex((row) => row.id === item.id) === index));
const lastTournamentId = ref('');
const tournamentCategories = computed(() => tournaments.value.filter((item) => item.id === selectedTournament.value?.id));
const tournamentSection = computed(() => parts.value[0] === 'torneo' ? parts.value[2] || 'equipos' : '');
const scopedTeams = computed(() => parts.value[1] && selectedTournament.value ? teams.value.filter((item) => tournamentCategories.value.some((category) => category.category_id === item.category_id)) : teams.value);
const scopedCategories = computed(() => parts.value[1] && selectedTournament.value ? categories.value.filter((item) => tournaments.value.some((tournament) => tournament.id === selectedTournament.value?.id && tournament.category_id === item.id)) : categories.value);
const selectedTeamEntries = computed(() => teams.value.filter((item) => item.id === parts.value[1]));
watch(() => parts.value[1], () => { teamNameEditing.value = false; teamNameDraft.value = ''; });
const selectedTeamTournamentId = computed(() => tournaments.value.find(item => item.category_id === selectedTeamEntries.value[0]?.category_id)?.id);
const tournamentContext = computed(() => selectedTournament.value || tournaments.value.find(item => item.id === selectedTeamTournamentId.value) || tournamentList.value.find(item => item.id === lastTournamentId.value) || null);
const tournamentTabs = [['equipos','Equipos','users'],['pagos','Pagos','card'],['fixture','Fixture','calendar'],['partidos','Partidos','ball'],['estadisticas','Estadísticas','chart']] as const;
const tournamentDays = computed(() => workspaceMatchdays.value.filter(day => tournamentCategories.value.some(category => category.edition_id === day.edition_id)));
const tournamentEntries = computed(() => teams.value.filter(team => tournamentCategories.value.some(category => category.category_id === team.category_id)));
const selectedEntry = computed(() => teams.value.find((item) => item.entry_id === parts.value[1]));
watch(() => selectedEntry.value?.entry_id, () => { goodFaithTab.value = 'players'; });
watch(() => user.value?.organizationId, () => { teamMatches.value = {}; teamDraftShield.value = null; });
const selectedPlayer = computed(() => players.value.find((item) => item.id === parts.value[2]));
const selectedMatch = computed(() => draftMatches.value.find((item) => item.id === parts.value[2]));
const latestLineup = computed(() => lineupVersions.value[0] || null);
const starterCount = computed(() => Object.values(lineupPlayers).filter((player) => player.role === 'starter').length);
const benchCount = computed(() => Object.values(lineupPlayers).filter((player) => player.role === 'bench').length);
const fixtureEntries = computed(() => teams.value.filter((team) => team.category_id === selectedTournament.value?.category_id && team.status === 'active'));
const fixtureNeedsSeeds = computed(() => fixture.value.phase?.mode === 'knockout' && selectedTournament.value?.rules.competitionPlan?.qualification.from === 'direct' && selectedTournament.value.rules.competitionPlan.rounds[0]?.pairing === 'positions');
const scheduledMatch = computed(() => fixture.value.rounds.flatMap((round) => round.matches).find((match) => match.id === parts.value[2]));
const scheduledDetails = computed(() => matchdays.value.flatMap((day) => day.matches.map((match) => ({ ...match, dayId: day.id }))).find((match) => match.id === parts.value[2]));
function bracketSide(name: string | null, sourceId: string | null) {
  if (name) return name;
  if (!sourceId) return 'Descanso';
  const source = fixture.value.bracket.find((slot) => slot.id === sourceId);
  if (!source) return 'Ganador pendiente';
  if (!source.match_id && !source.return_match_id && (source.home_name || source.away_name)) return source.home_name || source.away_name || 'Ganador pendiente';
  return `Ganador de llave ${source.stage}.${source.slot}`;
}
const plannedCompetitionRounds = computed(() => { const rules = selectedTournament.value?.rules; return rules?.competitionPlan ? previewCompetitionBracket(rules.competitionPlan, rules.initialPhase?.groupCount ?? null) : []; });
function actualBracketRounds(slots: Array<{ stage: number; slot: number; home: string; away: string; twoLegs?: boolean }>, repechage = false): PlannedRound[] {
  return [...new Set(slots.map((item) => item.stage))].map((stage) => {
    const ties = slots.filter((item) => item.stage === stage).sort((a,b) => a.slot - b.slot);
    const size = ties.length * 2;
    return { size, name: stage === 1 && repechage ? 'Repechaje' : knockoutRoundName(size), pairing: 'positions' as const, legs: ties.some((item) => item.twoLegs) ? 2 as const : 1 as const, ties: ties.map((item) => ({ slot: item.slot, home: item.home, away: item.away })) };
  });
}
const privateBracketRounds = computed(() => actualBracketRounds(fixture.value.bracket.map((slot) => ({ stage: slot.stage, slot: slot.slot, home: bracketSide(slot.home_name, slot.home_source_id), away: bracketSide(slot.away_name, slot.away_source_id), twoLegs: !!slot.return_match_id })), !!selectedTournament.value?.rules.competitionPlan?.repechage));
const remainingCompetitionRounds = computed(() => plannedCompetitionRounds.value.filter((round) => !privateBracketRounds.value.some((actual) => actual.size === round.size)));
const selectedEntryRule = computed(() => tournaments.value.find((item) => item.category_id === selectedEntry.value?.category_id)?.rules);
const latestGoodFaith = computed(() => goodFaithVersions.value[0] || null);
const filteredPlayers = computed(() => players.value.filter((item) => normalize(`${item.given_names} ${item.family_names} ${item.registration_number}`).includes(normalize(playerSearch.value))));
const visibleLineupPlayers = computed(() => players.value.filter((item) => item.status === 'approved' && normalize(`${item.given_names} ${item.family_names} ${item.registration_number} ${lineupPlayers[item.id]?.shirtNumber ?? ''}`).includes(normalize(lineupSearch.value))));
const originTeams = computed(() => allOriginTeams.value.filter((item) => item.id !== selectedEntry.value?.id));
const availableCategories = computed(() => categories.value.filter((category) => !selectedTeamEntries.value.some((entry) => entry.category_id === category.id)));
const currentOrgName = computed(() => organization.value?.name || user.value?.memberships.find((item) => item.organization_id === user.value?.organizationId)?.organization_name || 'Elegí tu organización');
const accessTarget = computed(() => parts.value[0] === 'estado-organizacion' ? selectedOrg.value : selectedMember.value);
const accessKey = computed(() => `${parts.value[0]}:${parts.value[1]}`);
const accessDraft = computed(() => accessDrafts[accessKey.value]);
const palettes = ['#165D46', '#234F7D', '#6B4C8C', '#855300', '#8F373C', '#101820', '#F5C518', '#F5F5F5', '#D91E18', '#FF681F', '#1988C8', '#9CBE3A', '#E66BB2', '#6A4A32'];
const filters = ['Todos', 'Pendientes', 'Activos', 'Restringidos'];
const filteredMembers = computed(() => members.value.filter((item) => {
  const match = normalize(`${item.name} ${item.username} ${item.organization_name}`).includes(normalize(search.value));
  return match && (statusFilter.value === 'Todos' || (statusFilter.value === 'Pendientes' && item.status === 'pending') || (statusFilter.value === 'Activos' && item.status === 'active') || (statusFilter.value === 'Restringidos' && ['suspended', 'blocked'].includes(item.status)));
}));
const filteredOrgs = computed(() => organizations.value.filter((item) => normalize(item.name).includes(normalize(organizationSearch.value))));
const navigation = computed(() => user.value?.platformAdmin ? [
  ['administradores', 'Administradores', 'users'], ['organizaciones', 'Organizaciones', 'grid'], ['actividad', 'Actividad', 'file'], ['cuenta', 'Cuenta', 'account'],
] : canManageTournaments() ? [['torneos', 'Torneo', 'trophy'], ['cuenta', 'Cuenta', 'account']] : user.value?.memberships.some(item=>item.organization_id===user.value?.organizationId && item.role==='operator' && item.status==='active') ? [['mis-partidos', 'Partidos', 'ball'], ['cuenta', 'Cuenta', 'account']] : [['equipos', 'Mi equipo', 'users'], ['cuenta', 'Cuenta', 'account']]);
const memberReasons = ['Habilitación revisada', 'Solicitado por responsable', 'Revisión administrativa'];
const actionNames: Record<string, string> = { 'organization.created': 'Organización creada', 'membership.access_changed': 'Acceso del administrador', 'organization.access_changed': 'Acceso de la organización', 'organization.brand_changed': 'Datos actualizados', 'organization.logo_changed': 'Logo actualizado', 'invitation.created': 'Invitación generada', 'invite.accepted': 'Invitación aceptada', 'recovery.created': 'Recuperación generada', 'recovery.requested': 'Recuperación solicitada', 'recovery.accepted': 'Cuenta recuperada', 'password.changed': 'Contraseña cambiada', 'password.reset_by_admin': 'Contraseña cambiada por superadmin' };
function normalize(value: string) { return value.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, ''); }
function initials(value: string) { return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function publicTeam(teamId:string){return publicTeams.value.find(team=>team.id===teamId);}
function publicTeamByName(name:string,categoryId:string){return publicTeams.value.find(team=>team.category_id===categoryId&&team.name===name);}
function go(path: string, preferredAlias = '') {
  const target=path==='publico'?'/':path==='acceso'?'/acceso':path==='panel'?'/panel':path.startsWith('publico/')?(()=>{const [,organizationId,tournamentId]=path.split('/');const alias=preferredAlias||publicCatalog.value.find(item=>item.id===tournamentId)?.public_slug||publicOrganizations.value.find(item=>item.id===organizationId&&item.single_tournament_id===tournamentId)?.single_tournament_slug;if(alias)return `/${alias}`;const slug=publicOrganization.value?.id===organizationId?publicOrganization.value.public_slug:publicOrganizations.value.find(item=>item.id===organizationId)?.public_slug||publicCatalog.value.find(item=>item.organization_id===organizationId)?.organization_slug;return slug?`/${slug}${tournamentId?`/${tournamentId}`:''}`:`/#/${path}`;})():`/#/${path}`;
  history.pushState(null,'',target);route.value=path;window.scrollTo(0,0);
}
function openPublicOrganization(id:string){const item=publicOrganizations.value.find(row=>row.id===id);go(item?.tournament_count===1&&item.single_tournament_id?`publico/${id}/${item.single_tournament_id}`:`publico/${id}`,item?.single_tournament_slug||'');}
function focusContent() { document.querySelector<HTMLElement>('#contenido')?.focus(); }
function jumpToSection(id: string) { const target = document.getElementById(id); target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); target?.querySelector<HTMLElement>('input:not([type="hidden"]),button')?.focus({ preventScroll: true }); }
function openTeamAction(action: 'admin'|'commission'|'staff'|'category') { teamAction.value = teamAction.value === action ? null : action; if (teamAction.value) nextTick(() => jumpToSection(`${action === 'category' ? 'another-category' : action === 'admin' ? 'team-admin' : action}-form`)); }
function selectedNav(path: string) { return parts.value[0] === path || (path === 'torneos' && ['nuevo-torneo', 'torneo', 'nueva-categoria', 'categoria', 'fixture', 'programar', 'partido', 'flyers', 'flyer-settings', 'nuevo-equipo', 'equipo', 'buena-fe', 'nuevo-jugador', 'jugador'].includes(parts.value[0])) || (path === 'equipos' && ['nuevo-equipo', 'equipo', 'buena-fe', 'nuevo-jugador', 'jugador', 'disciplina'].includes(parts.value[0])) || (path === 'administradores' && ['administrador', 'acceso-administrador', 'invitar', 'recuperar', 'nueva-organizacion'].includes(parts.value[0])) || (path === 'organizaciones' && ['organizacion', 'estado-organizacion'].includes(parts.value[0])); }
function navPath(path: string) { return path === 'organizacion' && user.value?.organizationId ? `organizacion/${user.value.organizationId}` : path === 'organizacion' ? 'organizaciones' : path; }
function notify(message: string) { success.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { success.value = ''; }, 4500); }
function clearPrivate() { lastTournamentId.value = ''; queuedCapture.value=[]; queueError.value=''; reviewTasks.value=[]; reviewHasMore.value=false; disciplineCases.value=[]; disciplineNotices.value=[]; fineCatalog.value=[]; privateStats.value=null; standingAdjustments.value=[]; disciplineServiceHistory.value=[]; selectedDisciplineCaseId.value=''; publicStatistics.value={}; Object.keys(sessionStorage).filter((key) => key.startsWith('torneos-rule-draft:')).forEach((key) => sessionStorage.removeItem(key)); capture.value = null; pendingCapture.value = null; pendingCaptureUndo.value = null; fixture.value = { phase: null, rounds: [], groups: [], bracket: [] }; fixtureTie.value=null; referees.value=[]; newRefereeName.value=''; refereeArchiveReason.value=''; matchdays.value = []; publicFixture.value = []; publicBrackets.value = []; scheduleMatchId.value = ''; schedulePreview.value = null; matchdayPreview.value = null; draftMatches.value = []; lineupVersions.value = []; lineupSearch.value = ''; importRows.value = []; importToken.value = ''; importBatches.value = []; organizationEpoch++; members.value = []; organizations.value = []; organization.value = null; tournaments.value = []; tournamentResources.value = { venues: [], sponsors: [] }; publicSponsors.value = []; teams.value = []; allOriginTeams.value = []; players.value = []; goodFaithVersions.value = []; playerEvidence.value = { documents: [], movements: [], restrictions: [] }; eligibility.value = null; categories.value = []; activity.value = []; generatedLink.value = null; createResult.value = null; teamLink.value = null; Object.keys(accessDrafts).forEach((key) => delete accessDrafts[key]); Object.keys(brandDrafts).forEach((key) => delete brandDrafts[key]); Object.keys(ruleDrafts).forEach((key) => delete ruleDrafts[key]); Object.keys(teamConfirmReasons).forEach((key) => delete teamConfirmReasons[key]); Object.keys(teamPublishReasons).forEach((key) => delete teamPublishReasons[key]); Object.keys(resourceReasons).forEach((key) => delete resourceReasons[key]); Object.keys(adminRevokeReasons).forEach((key) => delete adminRevokeReasons[key]); search.value = ''; organizationSearch.value = ''; playerSearch.value = ''; goodFaithSubmitReason.value = ''; goodFaithReviewReason.value = ''; statusFilter.value = 'Todos'; resetPlayerDraft(); Object.assign(venueDraft, { name: '', city: '' }); Object.assign(sponsorDraft, { name: '', city: '' }); Object.assign(createDraft, { name: '', administratorName: '', username: '' }); Object.assign(tournamentDraft, { name: '', editionName: '', categoryName: '', timezone: 'America/Asuncion', preset: 'F5', teamLimit: null, rules: suggestedRules(), paymentRates:{yellowGuaranies:0,redGuaranies:0,customCardRates:{}} }); quickCardOpen.value=false; Object.assign(quickCard,{name:'',color:'#2278C7',suspensionMatches:0,amountGuaranies:0}); Object.assign(categoryDraft, { editionName: '', categoryName: '', preset: 'F5', teamLimit: null, rules: suggestedRules() }); Object.assign(teamDraft, { name: '', color: '#165D46', categoryId: '' }); Object.assign(teamAdminDraft, { entryId: '', name: '', username: '' }); Object.assign(commissionDraft, { entryId: '', name: '', role: '', validFrom: '', validUntil: '' }); Object.assign(staffDraft, { entryId: '', name: '', role: '' }); wizardStep.value = 1; categoryStep.value = 1; tournamentRequestId.value = crypto.randomUUID(); categoryRequestId.value = crypto.randomUUID(); teamRequestId.value = crypto.randomUUID(); }
async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = {};
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (user.value && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = user.value.csrfToken;
    const response = await fetch(`/api/v1${path}`, { method, credentials: 'same-origin', headers, signal: controller.signal, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    if (response.status === 204) return undefined as T;
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 && !publicRoute.value && user.value) { clearPrivate(); user.value = null; sessionNotice.value = 'Tu sesión terminó o el acceso cambió. Los eventos pendientes siguen en este dispositivo; ingresá de nuevo con la misma cuenta para revisarlos.'; go('acceso'); }
      throw new RequestError(result.message || 'No se pudo completar la operación.', result.code, response.status);
    }
    return result;
  } catch (failure) {
    if (failure instanceof RequestError) throw failure;
    throw new RequestError('No hay respuesta del servidor. Tus datos siguen en el formulario; podés volver a intentar.', 'NETWORK_ERROR');
  } finally { clearTimeout(timer); }
}
async function perform(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; error.value = ''; errorCode.value = '';
  try { await action(); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'No se pudo completar la operación.'; errorCode.value = failure instanceof RequestError ? failure.code : ''; }
  finally { busy.value = false; }
}
async function loadAdmin() { const [people, spaces] = await Promise.all([api<Administrator[]>('/admin/administrators'), api<OrganizationSummary[]>('/admin/organizations')]); members.value = people; organizations.value = spaces; }
async function loadOrganization(id: string) {
  const epoch = ++organizationEpoch;
  const result = await api<OrganizationSummary>(`/organizations/${id}`);
  if (epoch !== organizationEpoch) return;
  organization.value = result;
  if (!brandDrafts[id]) brandDrafts[id] = { name: result.name, accent: result.accent, version: result.version };
}
async function loadTournaments() {
  if (!user.value?.organizationId) return;
  tournaments.value = await api<TournamentSummary[]>(`/organizations/${user.value.organizationId}/tournaments`);
  if (selectedTournament.value) {
    lastTournamentId.value = selectedTournament.value.id;
    sessionStorage.setItem(`tournament-context:${user.value.organizationId}`, selectedTournament.value.id);
  } else lastTournamentId.value = sessionStorage.getItem(`tournament-context:${user.value.organizationId}`) || '';
  if (['torneo','categoria'].includes(parts.value[0]) && selectedTournament.value && !ruleDrafts[selectedTournament.value.category_id]) {
    const item = selectedTournament.value;
    let saved: { rules: RuleConfig; revision: number; reason: string; ruleVersion: number } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(ruleDraftStorageKey(user.value.organizationId,item.category_id)) || 'null'); } catch { /* Borrador de pestaña inválido: usar el servidor. */ }
    if (saved && saved.revision === item.rule_revision && saved.ruleVersion === item.rule_version && typeof saved.reason === 'string' && ruleSchema.safeParse(saved.rules).success) ruleDrafts[item.category_id] = { rules: saved.rules, revision: saved.revision, reason: saved.reason };
    else ruleDrafts[item.category_id] = { rules: JSON.parse(JSON.stringify(item.rules)), revision: item.rule_revision, reason: '' };
  }
}
async function loadTournamentResources(tournamentId: string) {
  if (!user.value?.organizationId) return;
  const organizationId = user.value.organizationId;
  const result = await api<TournamentResources>(`/organizations/${organizationId}/tournaments/${tournamentId}/resources`);
  if (user.value?.organizationId === organizationId && selectedTournament.value?.id === tournamentId) tournamentResources.value = result;
}
async function loadTeams() {
  if (!user.value?.organizationId) return;
  const organizationId=user.value.organizationId;
  const [teamRows,categoryRows]=await Promise.all([api<TeamSummary[]>(`/organizations/${organizationId}/teams`),canManageTournaments()?api<typeof categories.value>(`/organizations/${organizationId}/categories`):Promise.resolve(null)]);
  teams.value=teamRows;
  if(categoryRows)categories.value=categoryRows;
  if (parts.value[0] === 'nuevo-equipo' && scopedCategories.value.length === 1 && !teamDraft.categoryId) teamDraft.categoryId = scopedCategories.value[0].id;
  const entries = teams.value.filter((item) => item.id === parts.value[1]);
  if (parts.value[0] === 'equipo' && entries.length === 1) {
    if (!teamAdminDraft.entryId) teamAdminDraft.entryId = entries[0].entry_id;
    if (!commissionDraft.entryId) commissionDraft.entryId = entries[0].entry_id;
    if (!staffDraft.entryId) staffDraft.entryId = entries[0].entry_id;
  }
}
async function loadPlayers(entryId: string) {
  if (!user.value?.organizationId) return;
  players.value = await api<PlayerDraftSummary[]>(`/organizations/${user.value.organizationId}/entries/${entryId}/players`);
}
async function loadGoodFaith(entryId: string) {
  if (!user.value?.organizationId) return;
  goodFaithVersions.value = await api<GoodFaithVersion[]>(`/organizations/${user.value.organizationId}/entries/${entryId}/good-faith`);
}
async function loadPlayerEvidence() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  const base = `/organizations/${user.value.organizationId}/entries/${selectedEntry.value.entry_id}/players/${selectedPlayer.value.id}`;
  [playerEvidence.value, eligibility.value, identityHistory.value] = await Promise.all([api(`${base}/evidence`), api(`${base}/eligibility?date=${eligibilityDate.value}`), api(`${base}/identity/history`)]);
  if (identityDraft.playerId !== selectedPlayer.value.player_id || identityDraft.expectedRevision !== selectedPlayer.value.identity_revision) Object.assign(identityDraft, { playerId: selectedPlayer.value.player_id, givenNames: selectedPlayer.value.given_names, familyNames: selectedPlayer.value.family_names, birthDate: selectedPlayer.value.birth_date, documentKind: selectedPlayer.value.document_kind, documentNumber: '', expectedRevision: selectedPlayer.value.identity_revision, reason: '' });
}
async function saveIdentity() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  await perform(async () => {
    const entryId = selectedEntry.value!.entry_id, registrationId = selectedPlayer.value!.id;
    await api(`/organizations/${user.value!.organizationId}/entries/${entryId}/players/${registrationId}/identity`, 'PATCH', { givenNames: identityDraft.givenNames, familyNames: identityDraft.familyNames, birthDate: identityDraft.birthDate, ...(identityDraft.documentNumber ? { documentKind: identityDraft.documentKind, documentNumber: identityDraft.documentNumber } : {}), expectedRevision: identityDraft.expectedRevision, reason: identityDraft.reason });
    identityDraft.playerId = ''; await Promise.all([loadPlayers(entryId),loadGoodFaith(entryId)]); await loadPlayerEvidence(); notify('Identidad corregida con historial. Si estaba aprobada, requiere nueva revisión de buena fe.');
  });
}
async function searchReusableIdentity() {
  if (!user.value?.organizationId) return;
  await perform(async () => { reuseResults.value = await api(`/organizations/${user.value!.organizationId}/players/search?q=${encodeURIComponent(reuseSearch.value.trim())}`); });
}
async function reuseIdentity() {
  if (!user.value?.organizationId || !selectedEntry.value) return;
  await perform(async () => {
    const kind = reuseDraft.originKind;
    const origin: PlayerDraftInput['origin'] = kind === 'internal' ? { kind, teamId: reuseDraft.teamId, city: reuseDraft.city, league: reuseDraft.league || null }
      : kind === 'external' ? { kind, teamName: reuseDraft.teamName, city: reuseDraft.city, league: reuseDraft.league || null } : { kind };
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/reuse`, 'POST', { playerId: reuseDraft.playerId, registrationNumber: reuseDraft.registrationNumber.trim() || null, origin, reason: reuseDraft.reason });
    Object.assign(reuseDraft, { playerId: '', registrationNumber: '', reason: '', originKind: 'unknown', teamId: '', teamName: '', city: '', league: '' }); reuseResults.value = [];
    await loadPlayers(selectedEntry.value!.entry_id); notify('Identidad existente incorporada como nueva inscripción privada.');
  });
}
async function loadDraftMatches(entryId: string) {
  if (!user.value?.organizationId) return;
  draftMatches.value = await api(`/organizations/${user.value.organizationId}/entries/${entryId}/draft-matches`);
}
async function loadFixture(categoryId: string) {
  if (!user.value?.organizationId) return;
  if(fixtureTie.value?.categoryId!==categoryId)fixtureTie.value=null;
  fixture.value = await api<FixtureOverview>(`/organizations/${user.value.organizationId}/categories/${categoryId}/fixture`);
}
async function loadMatchdays(editionId: string) {
  if (!user.value?.organizationId) return;
  matchdays.value = await api<MatchdaySummary[]>(`/organizations/${user.value.organizationId}/editions/${editionId}/matchdays`);
}
async function loadTournamentSection() {
  const organizationId = user.value?.organizationId;
  const tournament = selectedTournament.value;
  if (!organizationId || !tournament) return;
  const categories = tournamentCategories.value;
  const section=tournamentSection.value;
  const needsBlueprint=['fixture','partidos','estadisticas'].includes(section);
  await Promise.all([needsBlueprint ? (async()=>{
    const categoryId = tournament.category_id;
    if (workspaceBlueprint.value.categoryId !== categoryId) workspaceBlueprint.value = { blueprint:null, slots:[], games:[] };
    workspaceBlueprint.value={...(await api<PositionBlueprintView>(`/organizations/${organizationId}/categories/${categoryId}/fixture/blueprint`)),categoryId};
    workspaceCompetition.value=workspaceBlueprint.value.blueprint?await api<PositionCompetitionView>(`/organizations/${organizationId}/categories/${categoryId}/fixture/blueprint/competition`):null;
  })():Promise.resolve(),['equipos','pagos','estadisticas','fixture','partidos'].includes(section)?loadTeams():Promise.resolve()]);
  if (needsBlueprint && workspaceBlueprint.value.blueprint && !(section==='fixture'&&parts.value[3])) return;
  if (section === 'multas' && canManageTournaments()) {
    const results = await Promise.all(categories.map(async category => [category.category_id, await api<DisciplineCase[]>(`/organizations/${organizationId}/categories/${category.category_id}/discipline/cases`)] as const));
    workspaceCases.value = Object.fromEntries(results);
  }
  if (needsBlueprint) {
    const editionIds = [...new Set(categories.map(category => category.edition_id))];
    const [days,brackets,stats]=await Promise.all([
      Promise.all(editionIds.map(editionId => api<MatchdaySummary[]>(`/organizations/${organizationId}/editions/${editionId}/matchdays`))),
      Promise.all(categories.map(async category=>[category.category_id,await api<FixtureOverview>(`/organizations/${organizationId}/categories/${category.category_id}/fixture`).catch(cause=>{if(cause instanceof RequestError&&[404,409].includes(cause.status))return{phase:null,rounds:[],groups:[],bracket:[]};throw cause;})] as const)),
      section==='estadisticas'&&canManageTournaments()?Promise.all(categories.map(async category=>[category.category_id,await api<PrivateStats>(`/organizations/${organizationId}/categories/${category.category_id}/statistics`).catch(cause=>{if(cause instanceof RequestError&&[404,409].includes(cause.status))return{officialMatches:0,entries:[],players:[],defense:[],tables:[]};throw cause;})] as const)):Promise.resolve(null),
    ]);
    workspaceMatchdays.value=days.flat();
    workspaceBrackets.value=Object.fromEntries(brackets);
    if(stats)workspaceStats.value=Object.fromEntries(stats);
    if (['fixture','partidos'].includes(section)) {
      const published = await api<PublicFixtureDay[]>(`/public/organizations/${organizationId}/fixture`);
      workspaceOfficialMatchIds.value = published.flatMap(day => day.matches.filter(match => match.result?.status === 'official').map(match => match.id));
      workspaceScores.value=Object.fromEntries(published.flatMap(day=>day.matches.filter(match=>match.result?.status==='official').map(match=>[match.id,match.result!.score])));
    }
  }
}
async function loadReferees(){if(user.value?.organizationId)referees.value=await api(`/organizations/${user.value.organizationId}/fixture/referees`);}
async function addReferee(){if(!user.value?.organizationId||newRefereeName.value.trim().length<2)return;await perform(async()=>{const row=await api<{id:string;name:string}>(`/organizations/${user.value!.organizationId}/fixture/referees`,'POST',{name:newRefereeName.value.trim()});await loadReferees();scheduleDraft.refereeId=row.id;scheduleDraft.refereeName=row.name;newRefereeName.value='';schedulePreview.value=null;notify('Árbitro guardado para esta organización.');});}
async function archiveReferee(){if(!user.value?.organizationId||!scheduleDraft.refereeId||refereeArchiveReason.value.trim().length<3)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/fixture/referees/${scheduleDraft.refereeId}/archive`,'POST',{reason:refereeArchiveReason.value.trim()});scheduleDraft.refereeId='';scheduleDraft.refereeName='';refereeArchiveReason.value='';schedulePreview.value=null;await loadReferees();notify('Árbitro archivado. Los horarios históricos conservan su nombre.');});}
async function createMatchday() {
  if (!user.value?.organizationId || !selectedTournament.value) return;
  await perform(async () => {
    const editionId = selectedTournament.value!.edition_id;
    const ordinal = Math.max(0, ...matchdays.value.map((day) => day.ordinal)) + 1;
    await api(`/organizations/${user.value!.organizationId}/editions/${editionId}/matchdays`, 'POST', { ordinal });
    await loadMatchdays(editionId); notify(`Fecha ${ordinal} creada para esta edición. Puede reunir varias categorías.`);
  });
}
function prepareScheduleDraft() {
  if (!selectedTournament.value || !scheduledMatch.value || scheduleMatchId.value === scheduledMatch.value.id) return;
  scheduleMatchId.value = scheduledMatch.value.id;
  const current = scheduledDetails.value;
  Object.assign(scheduleDraft, { matchdayId: current?.dayId || (matchdays.value.length === 1 ? matchdays.value[0].id : ''), venueId: current?.venue_id || (tournamentResources.value.venues.length === 1 ? tournamentResources.value.venues[0].id : ''), courtLabel: current?.court_label==='Cancha 1'?'':current?.court_label || '', date: current?.match_date || scheduledMatch.value.match_date || '', time: current?.match_time || '', durationMinutes: current?.duration_minutes || selectedTournament.value.rules.periods.reduce((total, period) => total + period.minutes, 0), refereeId:current?.referee_id||'',refereeName: current?.referee_name || '', reason: '' });
  schedulePreview.value = null; schedulePreviewKey.value = '';
}
function schedulePayload() {
  return { matchdayId: scheduleDraft.matchdayId, venueId: scheduleDraft.venueId, courtLabel: scheduleDraft.courtLabel.trim()||'Cancha 1', date: scheduleDraft.date, time: scheduleDraft.time, durationMinutes: scheduleDraft.durationMinutes, refereeId:scheduleDraft.refereeId||null,refereeName: scheduleDraft.refereeName.trim() || null, expectedRevision: scheduledDetails.value?.schedule_revision || 0, reason: scheduleDraft.reason };
}
async function previewSchedule() {
  if (!user.value?.organizationId || !scheduledMatch.value) return;
  await perform(async () => {
    const payload = schedulePayload();
    schedulePreview.value = await api(`/organizations/${user.value!.organizationId}/fixture/matches/${scheduledMatch.value!.id}/schedule/preview`, 'POST', payload);
    schedulePreviewKey.value = JSON.stringify(payload);
  });
}
async function saveSchedule() {
  if (!user.value?.organizationId || !scheduledMatch.value || !selectedTournament.value) return;
  await perform(async () => {
    const payload = schedulePayload();
    if (!schedulePreview.value?.canSave || schedulePreviewKey.value !== JSON.stringify(payload)) throw new Error('Revisá el horario actual antes de guardarlo.');
    const result = await api<{ warnings: string[] }>(`/organizations/${user.value!.organizationId}/fixture/matches/${scheduledMatch.value!.id}/schedule`, 'PATCH', payload);
    await Promise.all([loadMatchdays(selectedTournament.value!.edition_id),loadFixture(selectedTournament.value!.category_id)]);
    scheduleMatchId.value = ''; schedulePreview.value = null;
    notify(result.warnings.length ? `Horario guardado. ${result.warnings.join(' ')}` : 'Horario guardado con historial.');
    go(`fixture/${selectedTournament.value!.category_id}`);
  });
}
async function previewMatchday(dayId: string) {
  if (!user.value?.organizationId) return;
  await perform(async () => { matchdayPreview.value = await api(`/organizations/${user.value!.organizationId}/matchdays/${dayId}/preview`); matchdayPublishReason.value = ''; });
}
async function publishMatchday() {
  if (!user.value?.organizationId || !selectedTournament.value || !matchdayPreview.value) return;
  await perform(async () => {
    const day = matchdayPreview.value!;
    if (day.missing.length) throw new Error(day.missing.join(' '));
    await api(`/organizations/${user.value!.organizationId}/matchdays/${day.id}/publish`, 'POST', { expectedRevision: day.revision, reason: matchdayPublishReason.value });
    matchdayPreview.value = null; matchdayPublishReason.value = '';
    await loadMatchdays(selectedTournament.value!.edition_id); notify('Jornada publicada. Ya aparece en el portal público.');
  });
}
async function createFixturePhase() {
  if (!user.value?.organizationId || !selectedTournament.value) return;
  await perform(async () => {
    await api(`/organizations/${user.value!.organizationId}/categories/${selectedTournament.value!.category_id}/fixture/phase`, 'POST', {});
    await loadFixture(selectedTournament.value!.category_id); notify('Fase privada creada desde el reglamento publicado.');
  });
}
async function generateFixture() {
  if (!user.value?.organizationId || !selectedTournament.value || !fixture.value.phase) return;
  await perform(async () => {
    await api(`/organizations/${user.value!.organizationId}/categories/${selectedTournament.value!.category_id}/fixture/generate`, 'POST', { expectedRevision: fixture.value.phase!.revision, ...(fixtureNeedsSeeds.value ? { seedOrder: fixtureSeedOrder.value } : {}) });
    await loadFixture(selectedTournament.value!.category_id); notify('Cruces privados generados. Falta asignar jornadas y horarios.');
  });
}
async function advanceFixture() {
  if (!user.value?.organizationId || !selectedTournament.value || !fixture.value.phase) return;
  await perform(async () => {
    if (fixtureAdvanceReason.value.trim().length < 3) throw new Error('Escribí el motivo para avanzar el cuadro.');
    const tie=fixtureTie.value?.categoryId===selectedTournament.value!.category_id?fixtureTie.value:null;
    if(tie && tie.order.length!==tie.candidates.length)throw new Error('Ordená todos los equipos empatados antes de avanzar.');
    const result = await api<{status:string;stage?:number;matches?:number;message?:string;championEntryId?:string;sourceKey?:string;candidates?:Array<{entryId:string;name:string}>}>(`/organizations/${user.value!.organizationId}/categories/${selectedTournament.value!.category_id}/fixture/advance`, 'POST', { reason: fixtureAdvanceReason.value,...(tie?{manualOrder:tie.order,sourceKey:tie.sourceKey}:{}) });
    await loadFixture(selectedTournament.value!.category_id);
    if(result.status==='tie'&&result.sourceKey&&result.candidates){fixtureTie.value={categoryId:selectedTournament.value!.category_id,sourceKey:result.sourceKey,candidates:result.candidates,order:[]};notify(result.message||'Ordená el empate de mejores restantes.');}
    else if (result.status === 'generated') { fixtureTie.value=null;fixtureAdvanceReason.value = ''; notify(`Ronda ${result.stage} preparada con ${result.matches} cruces privados.`); }
    else if (result.status === 'complete') notify('El cuadro tiene campeón según las actas oficiales.');
    else notify(result.message || 'Todavía hay resultados pendientes.');
  });
}
async function loadCapture() {
  capture.value = null; capturePreview.value=null; captureStartBlocked.value=false; pendingCapture.value = null; pendingCaptureUndo.value = null; lastCaptureTap = { key: '', at: 0 };
  queuedCapture.value=[];queueError.value='';captureHistory.value=[];
  privateMatchStream?.close();privateMatchStream=null;
  const matchId=parts.value[2];
  if (!user.value?.organizationId || !matchId) return;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matchId)){error.value='No se encontró este partido. Volvé a la lista y elegilo de nuevo.';return;}
  if(canManageTournaments()){
    const day=matchdays.value.find(item=>item.matches.some(match=>match.id===matchId));
    const match=day?.matches.find(item=>item.id===matchId);
    if(day&&match)capturePreview.value={day,match};
    if(day&&match&&!match.acta_status)return;
  }
  queuedCapture.value=await queuedMatchEvents(user.value.id,user.value.organizationId,matchId);queueError.value='';
  await loadMatchAssignments();
  const assigned=matchAssignments.value.find(item=>item.match_id===matchId);
  if(!canManageTournaments()&&assigned?.day_status!=='published'){captureStartBlocked.value=true;return;}
  if(!canManageTournaments()&&assigned&&!assigned.acta_status)return;
  if (canManageTournaments()) operators.value=await api<OperatorSummary[]>(`/organizations/${user.value.organizationId}/operators`);
  try {
    capture.value = await api<MatchCaptureView>(`/organizations/${user.value.organizationId}/matches/${matchId}/record`);
    captureTeamId.value = capture.value.home.entryId;
    await loadCaptureHistory();
    watchCaptureChanges();
  } catch (cause) {
    if (!(cause instanceof RequestError) || cause.code !== 'RECORD_NOT_FOUND') throw cause;
  }
}
function watchCaptureChanges(){if(!capture.value||!user.value?.organizationId)return;privateMatchStream?.close();const organizationId=user.value.organizationId,matchId=capture.value.matchId;privateMatchStream=new EventSource(`/api/v1/organizations/${organizationId}/matches/${matchId}/record/stream`);privateMatchStream.addEventListener('changed',()=>{void api<MatchCaptureView>(`/organizations/${organizationId}/matches/${matchId}/record`).then(result=>{if(capture.value?.matchId===matchId){capture.value=result;void loadCaptureHistory();}}).catch(cause=>{if(cause instanceof RequestError && cause.status===403){privateMatchStream?.close();error.value='Se revocó tu asignación para este partido.';}});});}
async function loadMatchAssignments() {if(user.value?.organizationId) matchAssignments.value=await api<MatchAssignment[]>(`/organizations/${user.value.organizationId}/match-assignments`);}
async function loadCaptureHistory(){if(user.value?.organizationId && capture.value) try {captureHistory.value=await api(`/organizations/${user.value.organizationId}/matches/${capture.value.matchId}/acta/history`);}catch{captureHistory.value=[];}}
async function loadTeamActa(){teamActa.value=null;if(user.value?.organizationId&&parts.value[1]&&parts.value[2])teamActa.value=await api(`/organizations/${user.value.organizationId}/matches/${parts.value[2]}/acta/for-team/${parts.value[1]}`);}
async function loadDiscipline(){
  if(!user.value?.organizationId||!selectedEntry.value)return;
  const org=user.value.organizationId,entry=selectedEntry.value;
  const result=await api<{cases:DisciplineCase[];notices:typeof disciplineNotices.value}>(`/organizations/${org}/entries/${entry.entry_id}/discipline`);
  disciplineCases.value=result.cases;disciplineNotices.value=result.notices;
  if(selectedDisciplineCaseId.value&&!result.cases.some(item=>item.id===selectedDisciplineCaseId.value))selectedDisciplineCaseId.value='';
  if(selectedDisciplineCaseId.value){const detail=await api<{actions:typeof disciplineHistory.value;serviceHistory:typeof disciplineServiceHistory.value}>(`/organizations/${org}/discipline/cases/${selectedDisciplineCaseId.value}`);disciplineHistory.value=detail.actions;disciplineServiceHistory.value=detail.serviceHistory;}
  if(canManageTournaments()){
    [fineCatalog.value,privateStats.value,standingAdjustments.value]=await Promise.all([api<FineCatalogItem[]>(`/organizations/${org}/categories/${entry.category_id}/discipline/fines`),api<PrivateStats>(`/organizations/${org}/categories/${entry.category_id}/statistics`),api<typeof standingAdjustments.value>(`/organizations/${org}/categories/${entry.category_id}/standings/adjustments`)]);
    if(unresolvedTie.value && (tieOrder.value.length!==unresolvedTie.value.teamIds.length || tieOrder.value.some(id=>!unresolvedTie.value?.teamIds.includes(id)))) tieOrder.value=[...unresolvedTie.value.teamIds];
    await loadPlayers(entry.entry_id);
  }
}
async function selectDisciplineCase(id:string){selectedDisciplineCaseId.value=id;disciplineHistory.value=[];disciplineServiceHistory.value=[];if(user.value?.organizationId){const detail=await api<{actions:typeof disciplineHistory.value;serviceHistory:typeof disciplineServiceHistory.value}>(`/organizations/${user.value.organizationId}/discipline/cases/${id}`);disciplineHistory.value=detail.actions;disciplineServiceHistory.value=detail.serviceHistory;}}
async function rebuildDisciplineProposals(){if(!user.value?.organizationId||!selectedEntry.value)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/categories/${selectedEntry.value!.category_id}/discipline/proposals/rebuild`,'POST',{});await loadDiscipline();notify('Propuestas actualizadas desde actas oficiales.');});}
async function createDisciplineCase(){if(!user.value?.organizationId||!selectedEntry.value)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/categories/${selectedEntry.value!.category_id}/discipline/cases`,'POST',{entryId:selectedEntry.value!.entry_id,registrationId:caseDraft.registrationId||null,summary:caseDraft.summary,evidenceNote:caseDraft.evidenceNote||null});Object.assign(caseDraft,{registrationId:'',summary:'',evidenceNote:''});await loadDiscipline();notify('Expediente creado para revisión.');});}
async function createFineCatalog(){if(!user.value?.organizationId||!selectedEntry.value)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/categories/${selectedEntry.value!.category_id}/discipline/fines`,'POST',{code:fineDraft.code.toUpperCase(),label:fineDraft.label,amountGuaranies:Number(fineDraft.amountGuaranies)});Object.assign(fineDraft,{code:'',label:'',amountGuaranies:0});await loadDiscipline();notify('Versión de multa guardada.');});}
async function adjustStandingPoints(){if(!user.value?.organizationId||!selectedEntry.value)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/categories/${selectedEntry.value!.category_id}/standings/adjustments`,'POST',{entryId:selectedEntry.value!.entry_id,pointsDelta:Number(pointsDraft.delta),reason:pointsDraft.reason});Object.assign(pointsDraft,{delta:0,reason:''});await loadDiscipline();notify('Ajuste de puntos registrado.');});}
async function saveTiebreak(){if(!user.value?.organizationId||!selectedEntry.value||!unresolvedTie.value)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/categories/${selectedEntry.value!.category_id}/standings/tiebreaks`,'POST',{groupNo:unresolvedTie.value!.groupNo,position:unresolvedTie.value!.position,entryOrder:tieOrder.value,reason:tieReason.value});tieOrder.value=[];tieReason.value='';await loadDiscipline();notify('Orden de desempate documentado.');});}
async function reviewDisciplineCase(){if(!user.value?.organizationId||!selectedDisciplineCase.value)return;const target=selectedDisciplineCase.value.id;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/discipline/cases/${target}/review`,'POST',{reason:disciplineReasons[target]});await loadDiscipline();notify('Revisión registrada.');});}
async function decideDisciplineCase(){if(!user.value?.organizationId||!selectedDisciplineCase.value)return;const target=selectedDisciplineCase.value.id;await perform(async()=>{const suspension=decisionDraft.mode==='matches'?{unit:'matches',matches:Number(decisionDraft.matches),startsOn:decisionDraft.startsOn}:decisionDraft.mode==='date_range'?{unit:'date_range',startsOn:decisionDraft.startsOn,endsOn:decisionDraft.endsOn}:null;await api(`/organizations/${user.value!.organizationId}/discipline/cases/${target}/decision`,'POST',{reason:decisionDraft.reason,suspension,fineCatalogId:decisionDraft.fineCatalogId||null});decisionDraft.reason='';await loadDiscipline();notify('Resolución guardada y notificada al equipo.');});}
async function appealDisciplineCase(){if(!user.value?.organizationId||!selectedDisciplineCase.value)return;const target=selectedDisciplineCase.value.id;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/discipline/cases/${target}/appeal`,'POST',{reason:disciplineReasons[target]});disciplineReasons[target]='';await loadDiscipline();notify('Apelación presentada. La decisión sigue vigente hasta que se resuelva.');});}
async function resolveDisciplineAppeal(decision:'confirm'|'revoke'){if(!user.value?.organizationId||!selectedDisciplineCase.value)return;const target=selectedDisciplineCase.value.id;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/discipline/cases/${target}/appeal/resolve`,'POST',{decision,reason:disciplineReasons[target]});disciplineReasons[target]='';await loadDiscipline();notify(decision==='revoke'?'Decisión revocada.':'Decisión confirmada.');});}
async function readDisciplineNotice(id:string){if(!user.value?.organizationId||!selectedEntry.value)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/discipline/notices/${id}/read`,'POST',{});await loadDiscipline();});}
async function setPlayerPublicName(player:{registrationId:string;publicName:boolean}){if(!user.value?.organizationId)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/registrations/${player.registrationId}/publication`,'POST',{visible:!player.publicName,reason:publicationReasons[player.registrationId]});publicationReasons[player.registrationId]='';await loadDiscipline();notify(player.publicName?'Nombre retirado del portal.':'Nombre autorizado para goleadores públicos.');});}
async function signTeamActa(){if(!teamActa.value?.submissionId||!user.value?.organizationId)return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/matches/${parts.value[2]}/acta/sign`,'POST',{entryId:parts.value[1],submissionId:teamActa.value!.submissionId});await loadTeamActa();notify('Conformidad guardada.');});}
const canCaptureMatch=computed(()=>canManageTournaments() || matchAssignments.value.some(item=>item.match_id===parts.value[2] && item.duty==='capture'));
const canReviewMatch=computed(()=>canManageTournaments() || matchAssignments.value.some(item=>item.match_id===parts.value[2] && item.duty==='review'));
async function createOperator(){if(!user.value?.organizationId)return;await perform(async()=>{const result=await api<{membershipId:string;invitation:LinkResult|null}>(`/organizations/${user.value!.organizationId}/operators`,'POST',operatorDraft);operatorInvitation.value=result.invitation;operators.value=await api(`/organizations/${user.value!.organizationId}/operators`);notify('Planillero creado. Entregá la invitación fuera del sistema.');});}
async function assignMatch(){if(!user.value?.organizationId||!parts.value[2])return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/matches/${parts.value[2]}/assignments`,'POST',assignmentDraft);await loadMatchAssignments();notify('Asignación guardada.');});}
async function revokeMatchAssignment(assignmentId:string){if(!user.value?.organizationId||!parts.value[2])return;await perform(async()=>{await api(`/organizations/${user.value!.organizationId}/matches/${parts.value[2]}/assignments/${assignmentId}/revoke`,'POST',{reason:assignmentReasons[assignmentId]});await loadMatchAssignments();notify('Asignación revocada.');});}
async function actaAction(action:'submit'|'approve'|'reject'|'reopen'){if(!capture.value||!user.value?.organizationId)return;await perform(async()=>{const result=await api<MatchCaptureView|{record:MatchCaptureView;bracketReassigned?:number;correctedMatchdays?:number}>(`/organizations/${user.value!.organizationId}/matches/${capture.value!.matchId}/acta/${action}`,'POST',action==='approve'?{reason:actaReason.value,overrideSignoffs:overrideSignoffs.value}:{reason:actaReason.value});capture.value='record' in result?result.record:result;await loadCaptureHistory();actaReason.value='';notify(action==='submit'?'Acta enviada para revisión.':action==='approve'?(('bracketReassigned' in result)&&result.bracketReassigned?'Resultado oficial publicado. El clasificado fue actualizado en los cruces siguientes. Revisá los cruces y las Fechas afectadas.':'Resultado oficial publicado.'):action==='reject'?'Acta devuelta para corrección.':'Acta abierta para rectificación.');});}
async function startCapture() {
  if (!user.value?.organizationId || !parts.value[2]) return;
  await perform(async () => {
    if(capturePreview.value?.day.status==='draft'&&canManageTournaments()){
      const dayId=capturePreview.value.day.id;
      const preview=await api<{revision:number;missing:string[]}>(`/organizations/${user.value!.organizationId}/matchdays/${dayId}/preview`);
      if(preview.missing.length)throw new Error(preview.missing.join(' '));
      await api(`/organizations/${user.value!.organizationId}/matchdays/${dayId}/publish`,'POST',{expectedRevision:preview.revision,reason:'Jornada confirmada al abrir la carga del partido'});
      capturePreview.value.day.status='published';
    }
    capture.value = await api<MatchCaptureView>(`/organizations/${user.value!.organizationId}/matches/${parts.value[2]}/record/start`, 'POST', {});
    captureTeamId.value = capture.value.home.entryId;
    await loadMatchAssignments();
    if(canManageTournaments())operators.value=await api<OperatorSummary[]>(`/organizations/${user.value!.organizationId}/operators`);
    watchCaptureChanges();
    notify('Partido listo para cargar.');
  });
}
async function publishCaptureResult(){if(!capture.value||!user.value?.organizationId||queuedCapture.value.length)return;await perform(async()=>{const root=`/organizations/${user.value!.organizationId}/matches/${capture.value!.matchId}/acta`;if(capture.value!.status==='capturing')await api(root+'/submit','POST',{reason:'Resultado cargado por el organizador'});const result=await api<{record:MatchCaptureView}>(root+'/approve','POST',{reason:'Resultado confirmado por el organizador',overrideSignoffs:true});capture.value=result.record;await loadCaptureHistory();notify('Resultado oficial publicado.');});}
const capturePlayers = computed(() => captureTeamId.value === capture.value?.away.entryId ? capture.value.away.players : capture.value?.home.players || []);
const activeCaptureEvents = computed(() => {
  if (!capture.value) return null;
  const voided = new Set(capture.value.events.filter((event) => event.kind === 'void').map((event) => event.voidsEventId));
  return [...capture.value.events].reverse().filter((event) => event.kind !== 'void' && !voided.has(event.id));
});
function capturePlayerName(registrationId: string | null) {
  if (!registrationId || !capture.value) return 'Sin autor';
  return [...capture.value.home.players, ...capture.value.away.players].find((player) => player.registrationId === registrationId)?.name || 'Jugador';
}
function captureEventLabel(event: {kind:string;cardCode?:string|null}, view: MatchCaptureView | null) {
  if (event.kind === 'custom_card') return view?.customCards.find(card => card.code === event.cardCode)?.label || 'Tarjeta';
  return captureKinds.find(kind => kind.value === event.kind)?.label || event.kind;
}
function matchGoals(side:'home'|'away'){
  if(!capture.value)return [];
  const voided=new Set(capture.value.events.filter(event=>event.kind==='void').map(event=>event.voidsEventId));
  const entryId=capture.value[side].entryId;
  return capture.value.events.filter(event=>['goal','penalty','own_goal'].includes(event.kind)&&!voided.has(event.id)&&(event.kind==='own_goal'?event.teamEntryId!==entryId:event.teamEntryId===entryId)).map(event=>({id:event.id,name:event.registrationId?capturePlayerName(event.registrationId):'Sin autor',kind:event.kind,period:event.period}));
}
async function addCaptureEvent(registrationId: string | null) {
  if (!capture.value || !user.value?.organizationId || !captureTeamId.value || capture.value.status!=='capturing') return;
  const payload = { kind: captureKind.value, teamEntryId: captureTeamId.value, registrationId, cardCode:captureKind.value==='custom_card'?captureCardCode.value:null, relatedRegistrationId:captureKind.value==='substitution'?captureRelatedRegistrationId.value||null:null,incidentNote:captureKind.value==='incident'?captureIncidentNote.value.trim()||null:null,windowNo:captureKind.value==='substitution'&&captureWindowNo.value?Number(captureWindowNo.value):null,period: capturePeriod.value, minute: captureMinute.value===''?null:Number(captureMinute.value) };
  const key = JSON.stringify(payload);
  const now = Date.now();
  if (lastCaptureTap.key === key && now - lastCaptureTap.at < 650) return;
  lastCaptureTap = { key, at: now };
  if (pendingCapture.value?.key !== key) pendingCapture.value = { key, id: crypto.randomUUID() };
  await perform(async () => {
    const clientEventId=pendingCapture.value!.id;
    const ownerId=user.value!.id,organizationId=user.value!.organizationId!,matchId=capture.value!.matchId;
    await queueMatchEvent({id:clientEventId,userId:ownerId,organizationId,matchId,payload:{...payload,clientEventId},createdAt:Date.now()});
    pendingCapture.value=null;
    queuedCapture.value=await queuedMatchEvents(ownerId,organizationId,matchId);
    try {capture.value = await api<MatchCaptureView>(`/organizations/${organizationId}/matches/${matchId}/events`, 'POST', { ...payload, clientEventId });}
    catch(cause){
      queueError.value=cause instanceof RequestError&&cause.code==='NETWORK_ERROR'?'Guardado solo en este dispositivo. Sincronizá antes de enviar el acta.':'El evento quedó pendiente en este dispositivo. Revisá el acceso o el conflicto antes de sincronizar.';
      if(cause instanceof RequestError&&cause.code==='NETWORK_ERROR')return;
      throw cause;
    }
    await removeQueuedMatchEvent(clientEventId);
    queuedCapture.value=await queuedMatchEvents(ownerId,organizationId,matchId);
    pendingCapture.value = null;
    if(captureKind.value==='incident')captureIncidentNote.value='';
    notify(captureKind.value === 'goal' ? 'Gol guardado.' : ['yellow','second_yellow','red','custom_card'].includes(captureKind.value) ? 'Tarjeta guardada.' : 'Evento guardado.');
  });
}
async function syncCaptureQueue(){if(!capture.value||!user.value?.organizationId||!queuedCapture.value.length)return;await perform(async()=>{
  for(const item of [...queuedCapture.value]){try{capture.value=await api<MatchCaptureView>(`/organizations/${item.organizationId}/matches/${item.matchId}/events`,'POST',item.payload);await removeQueuedMatchEvent(item.id);queuedCapture.value=await queuedMatchEvents(user.value!.id,item.organizationId,item.matchId);}catch(cause){queueError.value=cause instanceof Error?cause.message:'No se pudo sincronizar. Revisá el acceso.';throw cause;}}
  queueError.value='';notify('Eventos sincronizados con el servidor.');
});}
async function correctCaptureEvent(target: MatchJournalEvent, edit = false) {
  if (!capture.value || !user.value?.organizationId || capture.value.status !== 'capturing') return;
  if (pendingCaptureUndo.value?.eventId !== target.id) pendingCaptureUndo.value = { eventId: target.id, id: crypto.randomUUID() };
  await perform(async () => {
    capture.value = await api<MatchCaptureView>(`/organizations/${user.value!.organizationId}/matches/${capture.value!.matchId}/events/${target.id}/void`, 'POST', { clientEventId: pendingCaptureUndo.value!.id, reason: edit ? 'Edición del evento' : 'Eliminación del evento' });
    pendingCaptureUndo.value = null;
    if (edit) {
      captureKind.value = target.kind as typeof captureKind.value;
      captureTeamId.value = target.teamEntryId || capture.value!.home.entryId;
      capturePeriod.value = target.period as typeof capturePeriod.value;
      captureMinute.value = target.minute === null ? '' : String(target.minute);
      captureCardCode.value = target.cardCode || '';
      captureRelatedRegistrationId.value = target.relatedRegistrationId || '';
      captureIncidentNote.value = target.incidentNote || '';
      captureWindowNo.value = target.windowNo === null ? '' : String(target.windowNo);
      document.getElementById('capture-add-event')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      notify('Elegí el jugador para guardar el evento corregido.');
    } else notify('Evento eliminado. La corrección quedó en el historial.');
  });
}
async function loadLineup() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedMatch.value) return;
  const base = `/organizations/${user.value.organizationId}/draft-matches/${selectedMatch.value.id}/entries/${selectedEntry.value.entry_id}`;
  [lineupVersions.value, lineupExceptions.value] = await Promise.all([api(`${base}/lineup`),api(`${base}/exceptions`)]);
  Object.keys(lineupEligibility).forEach((id) => delete lineupEligibility[id]);
  Object.keys(lineupPlayers).forEach((id) => delete lineupPlayers[id]); lineupStaffIds.value = [];
  if (latestLineup.value) {
    for (const player of latestLineup.value.snapshot.players) lineupPlayers[player.registrationId] = { role: player.role, goalkeeper: player.goalkeeper, captain: player.captain, shirtNumber: player.shirtNumber ?? null };
    lineupStaffIds.value = [...latestLineup.value.snapshot.staffIds];
  }
}
async function selectLineupRole(registrationId: string, role: 'starter' | 'bench' | null) {
  if (role === null) { delete lineupPlayers[registrationId]; return; }
  if (!user.value?.organizationId || !selectedEntry.value || !selectedMatch.value) return;
  if (!lineupEligibility[registrationId]) {
    await perform(async () => { lineupEligibility[registrationId] = await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/${registrationId}/eligibility?date=${selectedMatch.value!.match_date}`); });
  }
  if (!lineupEligibility[registrationId]) return;
  if (lineupEligibility[registrationId]?.status === 'blocked' && !lineupExceptions.value.some((item) => item.registration_id === registrationId)) { error.value = lineupEligibility[registrationId].reasons.join(' '); return; }
  const current = lineupPlayers[registrationId];
  lineupPlayers[registrationId] = { role, goalkeeper: role === 'starter' ? current?.goalkeeper || false : false, captain: role === 'starter' ? current?.captain || false : false, shirtNumber: current?.shirtNumber ?? null };
}
function setShirtNumber(registrationId: string, event: Event) {
  const selected = lineupPlayers[registrationId]; if (!selected) return;
  const value = (event.target as HTMLInputElement).value;
  selected.shirtNumber = value === '' ? null : Number(value);
}
async function authorizeLineupException(registrationId: string) {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedMatch.value) return;
  await perform(async () => {
    const reason = lineupExceptionReasons[registrationId]?.trim() || ''; if (reason.length < 3) throw new Error('Escribí el motivo de la excepción.');
    await api(`/organizations/${user.value!.organizationId}/draft-matches/${selectedMatch.value!.id}/entries/${selectedEntry.value!.entry_id}/players/${registrationId}/exception`, 'POST', { reason });
    delete lineupExceptionReasons[registrationId]; lineupExceptions.value = await api(`/organizations/${user.value!.organizationId}/draft-matches/${selectedMatch.value!.id}/entries/${selectedEntry.value!.entry_id}/exceptions`); notify('Excepción autorizada con motivo. Volvé a seleccionar al jugador.');
  });
}
function selectLineupMarker(registrationId: string, marker: 'goalkeeper' | 'captain') {
  const current = lineupPlayers[registrationId]; if (!current || current.role !== 'starter') return;
  const value = !current[marker];
  for (const selected of Object.values(lineupPlayers)) selected[marker] = false;
  current[marker] = value;
}
function toggleLineupStaff(id: string) { lineupStaffIds.value = lineupStaffIds.value.includes(id) ? lineupStaffIds.value.filter((item) => item !== id) : [...lineupStaffIds.value, id]; }
async function saveLineup() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedMatch.value) return;
  await perform(async () => {
    const selected = Object.entries(lineupPlayers).map(([registrationId, values]) => ({ registrationId, ...values }));
    await api(`/organizations/${user.value!.organizationId}/draft-matches/${selectedMatch.value!.id}/entries/${selectedEntry.value!.entry_id}/lineup`, 'POST', { players: selected, staffIds: lineupStaffIds.value, expectedVersion: latestLineup.value?.version || 0, reason: 'Planilla guardada por el equipo' });
    lineupReason.value = ''; await loadLineup(); notify('Planilla guardada como nueva versión privada.');
  });
}
async function submitLineup() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedMatch.value || !latestLineup.value) return;
  await perform(async () => {
    await api(`/organizations/${user.value!.organizationId}/draft-matches/${selectedMatch.value!.id}/entries/${selectedEntry.value!.entry_id}/lineup/submit`, 'POST', { expectedVersion: latestLineup.value!.version, reason: 'Planilla presentada por el equipo' });
    lineupReason.value = ''; await loadLineup(); notify('Planilla presentada para revisión.');
  });
}
async function reviewLineup(decision: 'approved' | 'observed' | 'rejected') {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedMatch.value || !latestLineup.value) return;
  await perform(async () => {
    if (decision !== 'approved' && lineupReviewReason.value.trim().length < 3) throw new Error('Escribí el motivo de la observación o rechazo.');
    await api(`/organizations/${user.value!.organizationId}/draft-matches/${selectedMatch.value!.id}/entries/${selectedEntry.value!.entry_id}/lineup/review`, 'POST', { expectedVersion: latestLineup.value!.version, decision, reason: lineupReviewReason.value.trim() || 'Planilla aprobada por el organizador' });
    lineupReviewReason.value = ''; lineupDecision.value = null; await loadLineup(); notify('Revisión de planilla registrada.');
  });
}
async function copyPreviousLineup() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedMatch.value) return;
  await perform(async () => {
    const previous = await api<{ snapshot: LineupVersion['snapshot'] } | null>(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/lineups/previous?exclude=${selectedMatch.value!.id}`);
    if (!previous) throw new Error('No hay una planilla anterior aprobada para copiar.');
    Object.keys(lineupPlayers).forEach((id) => delete lineupPlayers[id]);
    for (const player of previous.snapshot.players) lineupPlayers[player.registrationId] = { role: player.role, goalkeeper: player.goalkeeper, captain: player.captain, shirtNumber: player.shirtNumber ?? null };
    lineupStaffIds.value = [...previous.snapshot.staffIds]; notify('Selección anterior copiada. Revisá cupos y elegibilidad antes de guardar.');
  });
}
async function uploadPlayerDocument(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  if (!file || !user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  await perform(async () => {
    const label = evidenceLabel.value.trim();
    if (label.length < 2) throw new Error('Elegí o escribí el nombre del documento.');
    const body = new FormData(); body.append('file', file);
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/${selectedPlayer.value!.id}/documents/${encodeURIComponent(label)}`, 'POST', body);
    input.value = ''; await loadPlayerEvidence(); notify('Documento privado cargado; espera revisión.');
  });
}
async function reviewPlayerDocument(documentId: string, decision: 'approved' | 'rejected') {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  await perform(async () => {
    if (decision === 'rejected' && evidenceReason.value.trim().length < 3) throw new Error('Escribí el motivo del rechazo.');
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/${selectedPlayer.value!.id}/documents/${documentId}/review`, 'POST', { decision, reason: evidenceReason.value.trim() || 'Documento revisado por el organizador' });
    evidenceReason.value = ''; await loadPlayerEvidence(); notify('Documento revisado.');
  });
}
async function declareMovement() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  await perform(async () => {
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/${selectedPlayer.value!.id}/movements`, 'POST', { kind: movementDraft.kind, startsOn: movementDraft.startsOn, endsOn: movementDraft.kind === 'loan' ? movementDraft.endsOn || null : null, reason: movementDraft.reason });
    movementDraft.reason = ''; await loadPlayerEvidence(); notify('Movimiento declarado; espera revisión.');
  });
}
async function reviewMovement(movementId: string, decision: 'approved' | 'rejected') {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  await perform(async () => {
    if (decision === 'rejected' && evidenceReason.value.trim().length < 3) throw new Error('Escribí el motivo del rechazo.');
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/${selectedPlayer.value!.id}/movements/${movementId}/review`, 'POST', { decision, reason: evidenceReason.value.trim() || 'Movimiento revisado por el organizador' });
    evidenceReason.value = ''; await loadPlayerEvidence(); notify('Movimiento revisado.');
  });
}
async function createRestriction() {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  await perform(async () => {
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/${selectedPlayer.value!.id}/restrictions`, 'POST', { startsOn: restrictionDraft.startsOn, endsOn: restrictionDraft.endsOn || null, reason: restrictionDraft.reason });
    restrictionDraft.reason = ''; await loadPlayerEvidence(); notify('Restricción manual guardada.');
  });
}
async function liftRestriction(restrictionId: string) {
  if (!user.value?.organizationId || !selectedEntry.value || !selectedPlayer.value) return;
  await perform(async () => {
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/${selectedPlayer.value!.id}/restrictions/${restrictionId}/lift`, 'POST', { reason: evidenceReason.value.trim() || 'Aviso levantado por el organizador' });
    evidenceReason.value = ''; await loadPlayerEvidence(); notify('Restricción levantada con motivo.');
  });
}
async function submitGoodFaith() {
  if (!user.value?.organizationId || !selectedEntry.value) return;
  const entryId = selectedEntry.value.entry_id;
  await perform(async () => {
    await api(`/organizations/${user.value!.organizationId}/entries/${entryId}/good-faith/submit`, 'POST', { registrationIds: players.value.map((item) => item.id), expectedVersion: latestGoodFaith.value?.version || 0, reason: 'Lista presentada por el equipo' });
    goodFaithSubmitReason.value = ''; await loadGoodFaith(entryId); notify('Lista presentada al organizador para revisión.');
  });
}
async function publishGoodFaith() {
  if (!user.value?.organizationId || !selectedEntry.value || !players.value.length) return;
  const organizationId = user.value.organizationId, entryId = selectedEntry.value.entry_id;
  await perform(async () => {
    let version = latestGoodFaith.value?.version || 0;
    if (latestGoodFaith.value?.status !== 'submitted') {
      const submitted = await api<{ version: number }>(`/organizations/${organizationId}/entries/${entryId}/good-faith/submit`, 'POST', {
        registrationIds: players.value.map((player) => player.id), expectedVersion: version, reason: 'Lista presentada por el organizador',
      });
      version = submitted.version;
    }
    try {
      await api(`/organizations/${organizationId}/entries/${entryId}/good-faith/review`, 'POST', {
        version, decision: 'approved', reason: 'Lista publicada por el organizador',
      });
    } finally {
      await Promise.all([loadGoodFaith(entryId), loadPlayers(entryId)]);
    }
    notify('Lista publicada. Los jugadores ya figuran como aprobados.');
  });
}
async function reviewGoodFaith(decision: 'approved' | 'observed' | 'rejected') {
  if (!user.value?.organizationId || !selectedEntry.value || !latestGoodFaith.value) return;
  const entryId = selectedEntry.value.entry_id, version = latestGoodFaith.value.version;
  await perform(async () => {
    if (decision !== 'approved' && goodFaithReviewReason.value.trim().length < 3) throw new Error('Escribí el motivo de la observación o rechazo.');
    await api(`/organizations/${user.value!.organizationId}/entries/${entryId}/good-faith/review`, 'POST', { version, decision, reason: goodFaithReviewReason.value.trim() || 'Lista aprobada por el organizador' });
    goodFaithReviewReason.value = ''; goodFaithDecision.value = null; await Promise.all([loadGoodFaith(entryId), loadPlayers(entryId)]); notify(decision === 'approved' ? 'Lista aprobada.' : 'Revisión registrada.');
  });
}
async function loadOriginTeams() {
  if (!user.value?.organizationId) return;
  allOriginTeams.value = await api<Array<{ id: string; name: string }>>(`/organizations/${user.value.organizationId}/origin-teams`);
}
async function createPlayer(another: boolean) {
  if (!user.value?.organizationId || !selectedEntry.value) return;
  await perform(async () => {
    const kind = newPlayerDraft.originKind;
    const league = newPlayerDraft.originLeague.trim() || null;
    const origin: PlayerDraftInput['origin'] = kind === 'internal' ? { kind, teamId: newPlayerDraft.originTeamId, city: newPlayerDraft.originCity, league }
      : kind === 'external' ? { kind, teamName: newPlayerDraft.originTeamName, city: newPlayerDraft.originCity, league }
      : { kind };
    const parsed = playerDraftSchema.safeParse({ givenNames: newPlayerDraft.givenNames, familyNames: newPlayerDraft.familyNames, documentKind: newPlayerDraft.documentNumber.trim() ? newPlayerDraft.documentKind : null, documentNumber: newPlayerDraft.documentNumber.trim() || null, birthDate: newPlayerDraft.birthDate, registrationNumber: newPlayerDraft.registrationNumber.trim() || null, details: Object.fromEntries(Object.entries(newPlayerDraft.details).filter(([,value]) => value.trim())), origin });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || 'Revisá los datos del jugador.');
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players`, 'POST', parsed.data);
    resetPlayerDraft(); await loadPlayers(selectedEntry.value!.entry_id);
    if (!another) go(`buena-fe/${selectedEntry.value!.entry_id}`);
    else await nextTick(() => document.querySelector<HTMLInputElement>('#player-names')?.focus());
    notify(another ? 'Borrador guardado. Podés agregar otro jugador.' : 'Jugador guardado como borrador privado.');
  });
}
function csvCells(source: string): string[][] {
  const delimiter = (source.split(/\r?\n/,1)[0].match(/;/g)?.length || 0) > (source.split(/\r?\n/,1)[0].match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"') { if (quoted && source[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) { if (char === '\r' && source[index + 1] === '\n') index++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('El CSV tiene comillas sin cerrar.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
async function previewPlayerCsv(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file || !user.value?.organizationId || !selectedEntry.value) return;
  await perform(async () => {
    if (file.size > 256 * 1024) throw new Error('El CSV puede pesar hasta 256 KB.');
    const table = csvCells((await file.text()).replace(/^\uFEFF/, ''));
    const headers = table.shift()?.map((item) => item.toLocaleLowerCase('es')) || [];
    const columns = ['nombres','apellidos','tipo_documento','numero_documento','fecha_nacimiento','numero_ficha','origen','equipo_origen','ciudad_origen','liga_origen'];
    if (columns.slice(0,7).some((name) => !headers.includes(name))) throw new Error('Faltan columnas obligatorias: nombres, apellidos, tipo_documento, numero_documento, fecha_nacimiento, numero_ficha y origen.');
    if (!table.length || table.length > 100) throw new Error('El archivo debe contener entre 1 y 100 jugadores.');
    const value = (row: string[], name: string) => row[headers.indexOf(name)]?.trim() || '';
    const prepared = table.map((row, index) => {
      const kind = value(row,'origen').toLocaleLowerCase('es');
      const origin: PlayerDraftInput['origin'] = kind === 'externo' ? { kind: 'external', teamName: value(row,'equipo_origen'), city: value(row,'ciudad_origen'), league: value(row,'liga_origen') || null }
        : kind === 'interno' ? { kind: 'internal', teamId: allOriginTeams.value.find((team) => team.name.toLocaleLowerCase('es') === value(row,'equipo_origen').toLocaleLowerCase('es'))?.id || '', city: value(row,'ciudad_origen'), league: value(row,'liga_origen') || null }
        : kind === 'ninguno' ? { kind: 'none' } : { kind: 'unknown' };
      const details=Object.fromEntries((selectedEntryRule.value?.eligibility?.registrationFields||[]).map(field=>[field.key,value(row,`dato_${field.key}`)]).filter(([,entry])=>Boolean(entry)));
      const parsed = playerDraftSchema.safeParse({ givenNames: value(row,'nombres'), familyNames: value(row,'apellidos'), documentKind: value(row,'tipo_documento').toLocaleLowerCase('es'), documentNumber: value(row,'numero_documento'), birthDate: value(row,'fecha_nacimiento'), registrationNumber: value(row,'numero_ficha'), origin, details });
      if (!parsed.success) throw new Error(`Fila ${index + 2}: ${parsed.error.issues[0]?.message || 'dato inválido'}`);
      return parsed.data;
    });
    const result = await api<{ previewToken: string }>(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/import/preview`, 'POST', { rows: prepared });
    importRows.value = prepared; importToken.value = result.previewToken; notify(`${prepared.length} jugadores listos para revisión. Aún no se importaron.`);
  });
}
async function commitPlayerImport() {
  if (!user.value?.organizationId || !selectedEntry.value) return;
  await perform(async () => {
    if (!importToken.value || importReason.value.trim().length < 3) throw new Error('Revisá el CSV y escribí un motivo.');
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/import`, 'POST', { rows: importRows.value, previewToken: importToken.value, reason: importReason.value });
    importRows.value = []; importToken.value = ''; importReason.value = '';
    await Promise.all([loadPlayers(selectedEntry.value!.entry_id),loadImportBatches(selectedEntry.value!.entry_id)]); notify('Lote importado como borrador. Podés revertirlo antes de presentarlo.');
  });
}
async function loadImportBatches(entryId: string) { if (user.value?.organizationId) importBatches.value = await api(`/organizations/${user.value.organizationId}/entries/${entryId}/players/import-batches`); }
async function revertPlayerImport(batchId: string) {
  if (!user.value?.organizationId || !selectedEntry.value) return;
  await perform(async () => {
    const reason = importRevertReasons[batchId]?.trim() || ''; if (reason.length < 3) throw new Error('Escribí el motivo de reversión.');
    await api(`/organizations/${user.value!.organizationId}/entries/${selectedEntry.value!.entry_id}/players/import-batches/${batchId}/revert`, 'POST', { reason });
    delete importRevertReasons[batchId]; await Promise.all([loadPlayers(selectedEntry.value!.entry_id),loadImportBatches(selectedEntry.value!.entry_id)]); notify('Lote revertido con historial; sus jugadores ya no figuran en el borrador.');
  });
}
async function createTeam() {
  await perform(async () => {
    if (!user.value?.organizationId || !teamDraft.categoryId) throw new Error('Elegí la categoría del equipo.');
    const shield = teamDraftShield.value;
    if (shield && (!['image/png','image/jpeg','image/webp'].includes(shield.type) || shield.size > 2*1024*1024)) throw new Error('El escudo debe ser PNG, JPG o WebP de hasta 2 MB.');
    const result = await api<{ teamId: string }>(`/organizations/${user.value.organizationId}/teams`, 'POST', { ...teamDraft, requestId: teamRequestId.value });
    let shieldFailed = false;
    if (shield) { try { const data = new FormData(); data.append('file', shield); await api(`/organizations/${user.value.organizationId}/teams/${result.teamId}/shield`, 'POST', data); } catch { shieldFailed = true; } }
    teamRequestId.value = crypto.randomUUID(); Object.assign(teamDraft, { name: '', color: '#165D46', categoryId: '' }); teamDraftShield.value = null;
    await loadTeams(); go(`equipo/${result.teamId}`); notify(shieldFailed ? 'Equipo creado. El escudo no se guardó; podés añadirlo aquí.' : 'Equipo creado.');
  });
}
async function saveTeamName() {
  if (!user.value?.organizationId || !selectedTeamEntries.value.length) return;
  await perform(async () => {
    const name = teamNameDraft.value.trim();
    if (name.length < 2 || name.length > 120) throw new Error('Escribí un nombre de 2 a 120 caracteres.');
    await api(`/organizations/${user.value!.organizationId}/teams/${selectedTeamEntries.value[0].id}`, 'PATCH', { name });
    await loadTeams(); teamNameEditing.value = false; notify('Nombre actualizado.');
  });
}
async function addTeamEntry(teamId: string) {
  await perform(async () => {
    if (!user.value?.organizationId || !entryCategoryId.value) throw new Error('Elegí otra categoría.');
    await api(`/organizations/${user.value.organizationId}/teams/${teamId}/entries`, 'POST', { categoryId: entryCategoryId.value });
    entryCategoryId.value = ''; await loadTeams(); notify('Participación agregada.');
  });
}
async function assignTeamAdmin() {
  await perform(async () => {
    if (!user.value?.organizationId || !teamAdminDraft.entryId) throw new Error('Elegí una participación.');
    const result = await api<{ invitation: { url: string } | null; alreadyAssigned: boolean }>(`/organizations/${user.value.organizationId}/entries/${teamAdminDraft.entryId}/administrators`, 'POST', { name: teamAdminDraft.name, username: teamAdminDraft.username });
    teamLink.value = result.invitation; await loadTeams(); notify(result.alreadyAssigned ? 'Esta persona ya estaba asignada.' : 'Administrador asignado.');
    Object.assign(teamAdminDraft, { name: '', username: '' });
  });
}
async function revokeTeamAdmin(entryId: string, membershipId: string) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    const reason = adminRevokeReasons[`${entryId}:${membershipId}`]?.trim() || '';
    if (reason.length < 3) throw new Error('Escribí el motivo de la revocación.');
    await api(`/organizations/${user.value.organizationId}/entries/${entryId}/administrators/${membershipId}/revoke`, 'POST', { reason });
    delete adminRevokeReasons[`${entryId}:${membershipId}`]; await loadTeams(); notify('Asignación revocada para esta participación.');
  });
}
async function createVenue(tournamentId: string) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    await api(`/organizations/${user.value.organizationId}/tournaments/${tournamentId}/venues`, 'POST', { name: venueDraft.name, city: venueDraft.city.trim() || null });
    Object.assign(venueDraft, { name: '', city: '' }); await loadTournamentResources(tournamentId); notify('Sede agregada al torneo.');
  });
}
async function createSponsor(tournamentId: string) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    await api(`/organizations/${user.value.organizationId}/tournaments/${tournamentId}/sponsors`, 'POST', { name: sponsorDraft.name });
    sponsorDraft.name = ''; await loadTournamentResources(tournamentId); notify('Patrocinador agregado de forma privada.');
  });
}
async function setSponsorPublic(tournamentId: string, sponsorId: string, visible: boolean) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    const reason = resourceReasons[sponsorId]?.trim() || '';
    if (reason.length < 3) throw new Error('Escribí el motivo del cambio público.');
    await api(`/organizations/${user.value.organizationId}/tournaments/${tournamentId}/sponsors/${sponsorId}/publication`, 'POST', { publicVisible: !visible, reason });
    delete resourceReasons[sponsorId]; await loadTournamentResources(tournamentId); notify(visible ? 'Patrocinador ocultado del portal.' : 'Patrocinador autorizado para el portal.');
  });
}
async function archiveResource(tournamentId: string, kind: 'venues' | 'sponsors', resourceId: string) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    const reason = resourceReasons[resourceId]?.trim() || '';
    if (reason.length < 3) throw new Error('Escribí el motivo de archivar.');
    await api(`/organizations/${user.value.organizationId}/tournaments/${tournamentId}/${kind}/${resourceId}/archive`, 'POST', { reason });
    delete resourceReasons[resourceId]; await loadTournamentResources(tournamentId); notify('Recurso archivado con historial.');
  });
}
async function proposeTeamPerson(kind: 'commission' | 'staff') {
  const draft = kind === 'commission' ? commissionDraft : staffDraft;
  await perform(async () => {
    if (!user.value?.organizationId || !draft.entryId) throw new Error('Elegí una participación.');
    const result = await api<{status:string}>(`/organizations/${user.value.organizationId}/entries/${draft.entryId}/${kind}`, 'POST', { name: draft.name, role: draft.role });
    Object.assign(draft, { name: '', role: '' }); await loadTeams(); notify(result.status==='confirmed'?'Integrante agregado.':'Integrante enviado para revisión.');
  });
}
async function confirmTeamPerson(kind: 'commission' | 'staff', id: string) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    const reason = teamConfirmReasons[id]?.trim() || '';
    if (reason.length < 3) throw new Error('Escribí el motivo de la confirmación.');
    await api(`/organizations/${user.value.organizationId}/${kind}/${id}/confirm`, 'POST', { reason });
    delete teamConfirmReasons[id]; await loadTeams(); notify('Integrante confirmado.');
  });
}
async function endCommission(id:string) {
  await perform(async()=>{
    if(!user.value?.organizationId)return;
    const reason=commissionEndReasons[id]?.trim()||'';
    if(reason.length<3)throw new Error('Escribí el motivo de finalización.');
    await api(`/organizations/${user.value.organizationId}/commission/${id}/end`,'POST',{reason});
    delete commissionEndReasons[id];await loadTeams();notify('Designación finalizada.');
  });
}
async function setTeamPublic(entry: TeamSummary) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    const reason = entry.public_visible ? 'Ocultado por el organizador' : 'Visible por decisión del organizador';
    await api(`/organizations/${user.value.organizationId}/entries/${entry.entry_id}/publication`, 'POST', { publicVisible: !entry.public_visible, reason });
    await loadTeams(); notify(entry.public_visible ? 'Equipo ocultado al público.' : 'Equipo visible al público.');
  });
}
async function uploadShield(event: Event, teamId: string) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file || !user.value?.organizationId) return;
  await perform(async () => {
    const data = new FormData(); data.append('file', file);
    await api(`/organizations/${user.value!.organizationId}/teams/${teamId}/shield`, 'POST', data);
    await loadTeams(); notify('Escudo guardado.');
  }); input.value = '';
}
async function uploadTournamentEmblem(event: Event, tournamentId: string) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file || !user.value?.organizationId) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2*1024*1024) { error.value = 'El emblema debe ser PNG, JPG o WebP de hasta 2 MB.'; input.value = ''; return; }
  await perform(async () => {
    const data = new FormData(); data.append('file', file);
    await api(`/organizations/${user.value!.organizationId}/tournaments/${tournamentId}/emblem`, 'POST', data);
    await loadTournaments(); notify('Emblema guardado.');
  }); input.value = '';
}
function pickTeamDraftShield(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0] || null;
  if (file && (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 2*1024*1024)) { error.value = 'El escudo debe ser PNG, JPG o WebP de hasta 2 MB.'; input.value = ''; teamDraftShield.value = null; return; }
  error.value = ''; teamDraftShield.value = file;
}
function clearTeamDraftShield() { teamDraftShield.value = null; if (teamDraftShieldInput.value) teamDraftShieldInput.value.value = ''; }
function choosePreset(preset: typeof rulePresets[number]) { const cards=tournamentDraft.rules.advanced?.discipline.customCards; tournamentDraft.preset = preset; tournamentDraft.rules = suggestedRules(preset === 'personalizado' ? 5 : preset === 'futsal' ? 5 : Number(preset.slice(1))); if(cards?.length)tournamentDraft.rules.advanced!.discipline.customCards=cards; }
function addQuickTournamentCard(){if(!canAddQuickCard.value||!tournamentDraft.rules.advanced)return;const code=`c_${crypto.randomUUID().replaceAll('-','').slice(0,12)}`;tournamentDraft.rules.advanced.discipline.customCards=[...(tournamentDraft.rules.advanced.discipline.customCards||[]),{code,label:quickCard.name.trim(),color:quickCard.color,suspensionMatches:quickCard.suspensionMatches}];tournamentDraft.paymentRates.customCardRates[code]=quickCard.amountGuaranies;quickCard.name='';quickCard.color='#2278C7';quickCard.suspensionMatches=0;quickCard.amountGuaranies=0;quickCardOpen.value=false;}
function removeQuickTournamentCard(code:string){if(!tournamentDraft.rules.advanced)return;tournamentDraft.rules.advanced.discipline.customCards=(tournamentDraft.rules.advanced.discipline.customCards||[]).filter(card=>card.code!==code);delete tournamentDraft.paymentRates.customCardRates[code];}
function setQuickRepechage(enabled: boolean) {
  if (!enabled) { tournamentDraft.rules.competitionPlan = null; return; }
  const entrants = 6, bracketSize = 8;
  tournamentDraft.rules.initialPhase = { mode: 'knockout', legs: 1, groupCount: null };
  tournamentDraft.rules.competitionPlan = { qualification: { from: 'direct', entrants }, bracketSize, repechage: true, rounds: [{ size: 8, pairing: 'positions', legs: 1 }, { size: 4, pairing: 'positions', legs: 1 }, { size: 2, pairing: 'positions', legs: 1 }] };
}
function setQuickRepechageEntrants(event: Event) {
  const count = Number((event.target as HTMLInputElement).value);
  const plan = tournamentDraft.rules.competitionPlan;
  if (!plan || plan.qualification.from !== 'direct' || !Number.isInteger(count) || count < 3 || count > 255) return;
  const size = 2 ** Math.ceil(Math.log2(count));
  plan.qualification.entrants = count;
  plan.bracketSize = size;
  plan.rounds = Array.from({ length: Math.log2(size) }, (_, index) => ({ size: size / 2 ** index, pairing: 'positions' as const, legs: 1 as const }));
}
function chooseCategoryPreset(preset: typeof rulePresets[number]) { categoryDraft.preset = preset; categoryDraft.rules = suggestedRules(preset === 'personalizado' ? 5 : preset === 'futsal' ? 5 : Number(preset.slice(1))); }
function validateRules(rules: RuleConfig) { const result = ruleSchema.safeParse(rules); if (!result.success) throw new Error(result.error.issues[0]?.message || 'Revisá el reglamento.'); }
function sameRules(left: RuleConfig, right: RuleConfig) { const a = ruleSchema.safeParse(left), b = ruleSchema.safeParse(right); return a.success && b.success && JSON.stringify(a.data) === JSON.stringify(b.data); }
function canManageTournaments() { return Boolean(user.value?.memberships.some((item) => item.organization_id === user.value?.organizationId && item.role === 'tournament_admin' && item.status === 'active' && item.organization_status === 'active')); }
async function createTournament() {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    validateRules(tournamentDraft.rules);
    const cardRates=Object.fromEntries((tournamentDraft.rules.advanced?.discipline.customCards||[]).map(card=>[card.code,Number(tournamentDraft.paymentRates.customCardRates[card.code]||0)]));
    const result = await api<{ tournamentId: string; categoryId: string }>(`/organizations/${user.value.organizationId}/tournaments`, 'POST', { ...tournamentDraft, paymentRates:{...tournamentDraft.paymentRates,customCardRates:cardRates}, requestId: tournamentRequestId.value });
    const id = result.categoryId || tournaments.value.find((item) => item.id === result.tournamentId)?.category_id;
    tournamentRequestId.value = crypto.randomUUID();
    Object.assign(tournamentDraft, { name: '', editionName: '', categoryName: '', timezone: 'America/Asuncion', preset: 'F5', teamLimit: null, rules: suggestedRules(), paymentRates:{yellowGuaranies:0,redGuaranies:0,customCardRates:{}} }); quickCardOpen.value=false; wizardStep.value = 1;
    await loadTournaments(); go(id ? `categoria/${id}` : `torneo/${result.tournamentId}`); notify('Torneo guardado en borrador.');
  });
}
async function createCategory(tournamentId: string) {
  await perform(async () => {
    if (!user.value?.organizationId) return;
    validateRules(categoryDraft.rules);
    const result = await api<{ categoryId: string }>(`/organizations/${user.value.organizationId}/tournaments/${tournamentId}/categories`, 'POST', { ...categoryDraft, requestId: categoryRequestId.value });
    categoryRequestId.value = crypto.randomUUID(); Object.assign(categoryDraft, { editionName: '', categoryName: '', preset: 'F5', teamLimit: null, rules: suggestedRules() }); categoryStep.value = 1;
    await loadTournaments(); go(`categoria/${result.categoryId}`); notify('Categoría guardada en borrador.');
  });
}
async function saveRuleDraft(item: TournamentSummary) {
  const draft = ruleDrafts[item.category_id]; if (!draft || !user.value?.organizationId) return;
  await perform(async () => {
    validateRules(draft.rules);
    const updated = await api<{ revision: number }>(`/organizations/${user.value!.organizationId}/categories/${item.category_id}/rules/draft`, 'POST', { rules: draft.rules, expectedRevision: draft.revision, reason: draft.reason });
    draft.revision = updated.revision; draft.reason = ''; publishPreviewCategory.value = '';
    await loadTournaments(); notify('Reglamento guardado como borrador.');
  });
}
async function beginRulePublication(item: TournamentSummary) {
  const draft = ruleDrafts[item.category_id]; if (!draft) return;
  await perform(async () => {
    if (draft.reason.trim().length < 3) throw new Error('Escribí el motivo de la publicación.');
    if (item.rule_status !== 'draft' || !sameRules(draft.rules, item.rules)) throw new Error('Guardá primero el reglamento antes de revisarlo para publicación.');
    if (!draft.rules.initialPhase || !draft.rules.substitutions || !draft.rules.eligibility || !draft.rules.advanced) throw new Error('Completá fase, cambios, elegibilidad y criterios deportivos antes de publicar.');
    publishPreviewCategory.value = item.category_id;
    await nextTick(); jumpToSection('rule-publish-preview');
  });
}
async function publishRules(item: TournamentSummary) {
  const draft = ruleDrafts[item.category_id]; if (!draft || !user.value?.organizationId) return;
  await perform(async () => {
    if (draft.reason.trim().length < 3) throw new Error('Escribí el motivo de la publicación.');
    if (item.rule_status !== 'draft' || !sameRules(draft.rules, item.rules)) throw new Error('Guardá primero el reglamento antes de publicarlo.');
    await api(`/organizations/${user.value!.organizationId}/categories/${item.category_id}/rules/publish`, 'POST', { expectedRevision: draft.revision, reason: draft.reason });
    draft.reason = ''; publishPreviewCategory.value = ''; await loadTournaments(); notify('Reglamento publicado. La versión queda conservada.');
  });
}
async function publishCurrentRules(item: TournamentSummary) {
  if (!user.value?.organizationId) return;
  await perform(async () => {
    const draft = ruleDrafts[item.category_id];
    if (!draft || !sameRules(draft.rules, item.rules)) throw new Error('Guardá los cambios del reglamento antes de publicar.');
    if (!item.rules.initialPhase) throw new Error('Elegí el formato antes de publicar el torneo.');
    const defaults = suggestedRules(item.rules.playersOnField);
    const completed: RuleConfig = { ...item.rules, substitutions: item.rules.substitutions ?? defaults.substitutions, eligibility: item.rules.eligibility ?? defaults.eligibility, advanced: item.rules.advanced ?? defaults.advanced };
    if (!sameRules(completed, item.rules)) {
      const saved = await api<{revision:number}>(`/organizations/${user.value!.organizationId}/categories/${item.category_id}/rules/draft`, 'POST', { rules: completed, expectedRevision: draft.revision, reason: 'Completar configuración inicial del torneo' });
      draft.revision = saved.revision;
    }
    await api(`/organizations/${user.value!.organizationId}/categories/${item.category_id}/rules/publish`, 'POST', { expectedRevision: draft.revision, reason: 'Publicación del reglamento de la categoría' });
    await loadTournaments(); notify('Reglamento publicado. Ya podés armar el fixture.');
  });
}
async function publishFixedRules(item:TournamentSummary){
  if(!user.value?.organizationId||!fixedRulesConfirmed.value)return;
  await perform(async()=>{
    const draft=ruleDrafts[item.category_id];
    if(!draft||!sameRules(draft.rules,item.rules))throw new Error('Guardá primero los puntos y desempates elegidos.');
    await api(`/organizations/${user.value!.organizationId}/categories/${item.category_id}/rules/publish`,'POST',{expectedRevision:draft.revision,reason:'Reglamento confirmado por el organizador',fixedFormatConfirmed:true});
    fixedRulesConfirmed.value=false;await loadTournaments();notify('Reglamento publicado. Ya podés preparar los partidos.');
  });
}
async function decideTitleExtra(input:{decision:'no_extra'|'extra';homeEntryId?:string;awayEntryId?:string}){
  if(!user.value?.organizationId||!selectedTournament.value)return;
  await perform(async()=>{
    await api(`/organizations/${user.value!.organizationId}/categories/${selectedTournament.value!.category_id}/fixture/blueprint/title-extra`,'POST',input);
    await loadTournamentSection();
    notify(input.decision==='extra'?'Partido extra preparado. Podés programarlo desde Partidos.':'Decisión guardada: sin partido extra.');
  });
}
async function decidePositionTiebreak(input:{table:'A'|'B'|'general';position:number;entryOrder:string[]}){
  if(!user.value?.organizationId||!selectedTournament.value)return;
  await perform(async()=>{
    await api(`/organizations/${user.value!.organizationId}/categories/${selectedTournament.value!.category_id}/fixture/blueprint/tiebreak`,'POST',input);
    await loadTournamentSection();
    notify('Orden guardado. Los cruces pendientes se actualizaron.');
  });
}
async function refreshTournament(item: TournamentSummary) {
  await perform(async () => { await loadTournaments(); const latest = tournaments.value.find((row) => row.category_id === item.category_id); if (latest && ruleDrafts[item.category_id]) ruleDrafts[item.category_id].revision = latest.rule_revision; notify('Datos actualizados. Revisá tu borrador antes de guardar.'); });
}
async function chooseOrganization(id: string) {
  await perform(async () => { importRows.value = []; importToken.value = ''; importBatches.value = []; reviewTasks.value=[]; reviewHasMore.value=false; organizationEpoch++; organization.value = null; tournaments.value = []; tournamentResources.value = { venues: [], sponsors: [] }; teams.value = []; allOriginTeams.value = []; players.value = []; goodFaithVersions.value = []; categories.value = []; teamLink.value = null; resetPlayerDraft(); Object.keys(ruleDrafts).forEach((key) => delete ruleDrafts[key]); Object.keys(teamConfirmReasons).forEach((key) => delete teamConfirmReasons[key]); Object.keys(teamPublishReasons).forEach((key) => delete teamPublishReasons[key]); Object.assign(teamAdminDraft, { entryId: '', name: '', username: '' }); Object.assign(commissionDraft, { entryId: '', name: '', role: '', validFrom: '', validUntil: '' }); Object.assign(staffDraft, { entryId: '', name: '', role: '' }); user.value = await api<CurrentUser>('/auth/context', 'POST', { organizationId: id }); await loadOrganization(id); go(user.value.memberships.some(item=>item.organization_id===id&&item.role==='tournament_admin'&&item.status==='active')?'torneos':user.value.memberships.some(item=>item.organization_id===id&&item.role==='operator'&&item.status==='active')?'mis-partidos':'equipos'); });
}
async function loadView(force = false) {
  const epoch = ++routeEpoch;
  const viewParts = [...parts.value];
  error.value = ''; loading.value = true; loadingVisual.value=false;
  if(loadingTimer)clearTimeout(loadingTimer);
  loadingTimer=setTimeout(()=>{if(epoch===routeEpoch&&loading.value)loadingVisual.value=true;},180);
  try {
    if(parts.value[0]!=='publico'){publicResultsStream?.close();publicResultsStream=null;}
    if(parts.value[0]!=='partido'){privateMatchStream?.close();privateMatchStream=null;}
    if (parts.value[0] === 'acceso') return;
    if (parts.value[0] === 'portal') {
      const selected=await api<{kind:'organization'|'tournament';organization_id:string;tournament_id?:string;tournament_count?:number;single_tournament_id?:string|null;single_tournament_slug?:string|null}>(`/public/resolve/${encodeURIComponent(viewParts[1]||'')}`);
      if(epoch!==routeEpoch)return;
      const tournamentId=selected.kind==='tournament'?selected.tournament_id||'':viewParts[2]||(selected.tournament_count===1?selected.single_tournament_id||'':'');
      if(selected.kind==='organization'&&!viewParts[2]&&tournamentId&&selected.single_tournament_slug)history.replaceState(null,'',`/${selected.single_tournament_slug}`);
      route.value=`publico/${selected.organization_id}${tournamentId?`/${tournamentId}`:''}`;
      return;
    }
    if (parts.value[0] === 'publico') {
      publicOrganization.value = null; publicTournaments.value = []; publicTeams.value = []; publicSponsors.value = []; publicFixture.value = []; publicBrackets.value = []; publicStatistics.value = {}; publicFlyers.value=[]; publicDraws.value=[];
      if(!viewParts[1]){const organizations=await api<PublicOrganizationItem[]>('/public/organizations');if(epoch!==routeEpoch)return;publicOrganizations.value=organizations;setPublicPageMeta('A la cancha · Torneos','Encontrá organizaciones, torneos, partidos, resultados y estadísticas.',`${location.origin}/`);return;}
      const organizationId=viewParts[1];
      const [result,draws] = await Promise.all([api<{ organization: PublicOrganization; tournaments: TournamentSummary[]; teams: typeof publicTeams.value; sponsors: typeof publicSponsors.value }>(`/public/organizations/${organizationId}/tournaments`),api<PublicDraw[]>(`/public/organizations/${organizationId}/draws`)]);
      if(epoch!==routeEpoch)return;
      publicDraws.value=draws;
      publicCatalog.value=[...new Map([...result.tournaments.map(item=>[item.id,{id:item.id,name:item.name,public_slug:item.public_slug||null,organization_id:organizationId,organization_name:result.organization.name,organization_slug:result.organization.public_slug}] as const),...draws.map(item=>[item.tournament_id,{id:item.tournament_id,name:item.tournament_name,public_slug:item.public_slug||null,organization_id:organizationId,organization_name:result.organization.name,organization_slug:result.organization.public_slug}] as const)].map(item=>[item[0],item[1]])).values()];
      const tournamentId=viewParts[2];
      if(tournamentId&&!result.tournaments.some(item=>item.id===tournamentId)&&!draws.some(item=>item.tournament_id===tournamentId))throw new RequestError('Este torneo todavía no está publicado.','NOT_FOUND',404);
      const positionPortal=draws.length>0&&(tournamentId?draws.some(item=>item.tournament_id===tournamentId):!result.tournaments.length);
      const [published,brackets,sharedFlyers]=positionPortal?[[] as PublicFixtureDay[],[] as PublicBracket[],[] as typeof publicFlyers.value]:await Promise.all([api<PublicFixtureDay[]>(`/public/organizations/${organizationId}/fixture`),api<PublicBracket[]>(`/public/organizations/${organizationId}/brackets`),api<typeof publicFlyers.value>(`/public/organizations/${organizationId}/flyers`)]);
      if(epoch!==routeEpoch)return;
      publicOrganization.value = result.organization; publicTournaments.value = tournamentId?result.tournaments.filter(item=>item.id===tournamentId):result.tournaments; publicTeams.value = result.teams.filter(team=>publicTournaments.value.some(item=>item.category_id===team.category_id)); publicSponsors.value = result.sponsors.filter(sponsor=>!tournamentId||sponsor.tournament_id===tournamentId);
      publicFixture.value = tournamentId?published.filter(day=>day.tournament_id===tournamentId):published; publicBrackets.value = tournamentId?brackets.filter(item=>item.tournament_id===tournamentId):brackets;publicFlyers.value=tournamentId?sharedFlyers.filter(item=>item.tournamentId===tournamentId):sharedFlyers;
      const publicName=tournamentId?(publicTournament.value?.name||draws.find(item=>item.tournament_id===tournamentId)?.tournament_name):(result.organization as unknown as {name:string}|null)?.name||'Torneos';
      const title=tournamentId?`${publicName} · ${result.organization.name}`:`${publicName} · Torneos`;
      const description=tournamentId?`Partidos, fixture, clasificación y goleadores de ${publicName}.`:`Torneos, partidos, resultados y estadísticas de ${publicName}.`;
      const alias=tournamentId?publicCatalog.value.find(item=>item.id===tournamentId)?.public_slug:null;
      const canonical=`${location.origin}${alias?`/${alias}`:`/${result.organization.public_slug}${tournamentId?`/${tournamentId}`:''}`}`;
      const hasEmblem=publicTournament.value?.has_emblem&&publicTournament.value.status==='published'||draws.some(item=>item.tournament_id===tournamentId&&item.has_emblem);
      const image=hasEmblem?`${location.origin}/api/v1/public/organizations/${result.organization.id}/tournaments/${tournamentId}/emblem`:result.organization.logo_id?`${location.origin}/api/v1/public/organizations/${result.organization.id}/logo`:'';
      setPublicPageMeta(title,description,canonical,image);
      const statResults = positionPortal?[]:await Promise.allSettled(result.tournaments.map(item => api<PublicStats>(`/public/organizations/${organizationId}/categories/${item.category_id}/statistics`)));
      if(epoch!==routeEpoch)return;
      publicStatistics.value = Object.fromEntries(result.tournaments.flatMap((item, index) => statResults[index].status === 'fulfilled' ? [[item.category_id, statResults[index].value]] : []));
      publicResultsStream?.close();publicResultsStream=new EventSource(`/api/v1/public/organizations/${organizationId}/results/stream`);
      const currentPublicView=()=>epoch===routeEpoch&&parts.value[0]==='publico'&&parts.value[1]===organizationId&&parts.value[2]===tournamentId;
      const refreshResults=()=>{void api<PublicFixtureDay[]>(`/public/organizations/${organizationId}/fixture`).then(days=>{if(currentPublicView())publicFixture.value=tournamentId?days.filter(day=>day.tournament_id===tournamentId):days;}).catch(()=>{});void Promise.allSettled(publicTournaments.value.map(item=>api<PublicStats>(`/public/organizations/${organizationId}/categories/${item.category_id}/statistics`))).then(results=>{if(currentPublicView())publicStatistics.value=Object.fromEntries(publicTournaments.value.flatMap((item,index)=>results[index].status==='fulfilled'?[[item.category_id,results[index].value]]:[]));});};
      const drawOrganizationId=organizationId;
      const refreshDraws=()=>{void api<PublicDraw[]>(`/public/organizations/${drawOrganizationId}/draws`).then(latest=>{
        if(!currentPublicView())return;
        if(latest.some(item=>(publicDraws.value.find(current=>current.category_id===item.category_id)?.revision||0)>item.revision))return;
        publicDraws.value=latest;
      }).catch(()=>{});};
      publicResultsStream.addEventListener('result',()=>{if(positionPortal)publicResultsRevision.value++;else refreshResults();});
      publicResultsStream.addEventListener('fixture',()=>{if(positionPortal)publicResultsRevision.value++;else refreshResults();});
      publicResultsStream.addEventListener('draw',refreshDraws);
      let streamReady=false,streamInterrupted=false;
      publicResultsStream.addEventListener('error',()=>{if(positionPortal&&!streamInterrupted)publicResultsRevision.value++;streamInterrupted=true;});
      publicResultsStream.addEventListener('ready',()=>{if(positionPortal&&(streamReady||streamInterrupted))publicResultsRevision.value++;else if(!positionPortal)refreshResults();streamReady=true;streamInterrupted=false;refreshDraws();});
      return;
    }
    if(parts.value[0]==='panel'){
      if(!user.value)user.value=await api<CurrentUser>('/auth/me');
      go(user.value.platformAdmin?'administradores':user.value.memberships.some(item=>item.role==='operator'&&item.status==='active')?'mis-partidos':user.value.memberships.some(item=>item.role==='tournament_admin'&&item.status==='active')?'torneos':'equipos');
      return;
    }
    if (['invitacion', 'recuperacion'].includes(parts.value[0])) {
      tokenInfo.value = null;
      tokenInfo.value = await api<TokenInfo>('/invitations/inspect', 'POST', { token: parts.value[1] || '' });
      if (tokenInfo.value.currentUser) user.value = tokenInfo.value.currentUser;
      return;
    }
    if (!user.value) user.value = await api<CurrentUser>('/auth/me');
    if (user.value.platformAdmin) {
      if (!members.value.length || force) await loadAdmin();
      if (parts.value[0] === 'actividad') [activity.value,technicalErrors.value] = await Promise.all([api<Audit[]>('/admin/audit'),api<TechnicalError[]>('/admin/error-logs')]);
      if (['acceso-administrador', 'estado-organizacion'].includes(parts.value[0]) && accessTarget.value && !accessDrafts[accessKey.value]) accessDrafts[accessKey.value] = { status: accessTarget.value.status, version: accessTarget.value.version, reason: '' };
      if (['invitar', 'recuperar'].includes(parts.value[0]) && linkTarget.value !== route.value) { generatedLink.value = null; linkTarget.value = route.value; linkReason.value = ''; }
      if (parts.value[0] === 'organizacion' && selectedOrg.value) {
        const id = selectedOrg.value.id;
        if (!brandDrafts[id]) brandDrafts[id] = { name: selectedOrg.value.name, accent: selectedOrg.value.accent, version: selectedOrg.value.version };
      }
    } else {
      const active = user.value.memberships.filter((item) => item.status === 'active' && item.organization_status === 'active');
      if (!user.value.organizationId && active.length === 1) user.value = await api<CurrentUser>('/auth/context', 'POST', { organizationId: active[0].organization_id });
      if (user.value.organizationId && (!organization.value || force)) await loadOrganization(user.value.organizationId);
      if (user.value.organizationId && parts.value[0] === 'bandeja') await loadReviewTasks(true);
      if (user.value.organizationId && parts.value[0]==='mis-partidos') await loadMatchAssignments();
      if (user.value.organizationId && ['torneos', 'nuevo-torneo', 'torneo', 'nueva-categoria', 'categoria', 'fixture', 'programar', 'partido','flyers','flyer-settings','equipos','nuevo-equipo','equipo','cuenta'].includes(parts.value[0])) {
        await loadTournaments();
        if(parts.value[0]==='categoria'&&selectedTournament.value){const categoryId=selectedTournament.value.category_id;workspaceBlueprint.value={...(await api<PositionBlueprintView>(`/organizations/${user.value.organizationId}/categories/${categoryId}/fixture/blueprint`)),categoryId};}
        if (parts.value[0] === 'torneo' && selectedTournament.value) {
          await loadTournamentSection();
          if (['ajustes','fixture'].includes(tournamentSection.value)) await loadTournamentResources(selectedTournament.value.id);
        }
        if(parts.value[0]==='flyers'&&selectedTournament.value){
          const categories=tournaments.value.filter(item=>item.id===selectedTournament.value?.id);
          const editionIds=[...new Set(categories.map(item=>item.edition_id))];
          const [days,brackets]=await Promise.all([
            Promise.all(editionIds.map(id=>api<MatchdaySummary[]>(`/organizations/${user.value!.organizationId}/editions/${id}/matchdays`))),
            Promise.all(categories.map(async category=>({category,fixture:await api<FixtureOverview>(`/organizations/${user.value!.organizationId}/categories/${category.category_id}/fixture`)}))),
            loadFlyers(),
          ]);
          matchdays.value=days.flat();
          flyerBracketSources.value=brackets.filter(item=>item.fixture.phase).map(item=>({id:item.fixture.phase!.id,label:item.category.category_name}));
          if(parts.value[2] && parts.value[2] in flyerLabels){
            flyerDraft.kind=(parts.value[2]==='scorer'?'scorers':parts.value[2]) as typeof flyerDraft.kind;
            await nextTick();
            flyerDraft.sourceId=parts.value[3]?(flyerSources.value.some(item=>item.id===parts.value[3])?parts.value[3]:''):flyerSources.value[0]?.id||'';
            resetFlyerPage();flyerDraft.pageNo=Math.max(1,Number(parts.value[4])||1);
            if(flyerScoped.value&&flyerDraft.sourceId)await createScopedFlyer();
          }
        }
        if (['fixture','programar','partido'].includes(parts.value[0]) && selectedTournament.value) {
          if(parts.value[0]==='partido'){
            if(canManageTournaments())await loadMatchdays(selectedTournament.value.edition_id);
          }else await Promise.all([loadFixture(selectedTournament.value.category_id), loadMatchdays(selectedTournament.value.edition_id), loadTournamentResources(selectedTournament.value.id),...(parts.value[0]==='programar'?[loadReferees()]:[])]);
          if (parts.value[0] === 'programar') prepareScheduleDraft();
        }
        if(parts.value[0]==='partido') await loadCapture();
        if (parts.value[0] === 'nueva-categoria' && selectedTournament.value && !categoryDraft.editionName) categoryDraft.editionName = selectedTournament.value.edition_name;
      }
      if (user.value.organizationId && ['equipos', 'nuevo-equipo', 'equipo', 'buena-fe', 'nuevo-jugador', 'jugador', 'planilla', 'acta-equipo', 'fixture', 'disciplina'].includes(parts.value[0])) await loadTeams();
      if (user.value.organizationId && parts.value[0]==='equipo') { const entries=selectedTeamEntries.value; const [rosters,matches]=await Promise.all([Promise.all(entries.map(async entry=>[entry.entry_id,await api<PlayerDraftSummary[]>(`/organizations/${user.value!.organizationId}/entries/${entry.entry_id}/players`)] as const)),Promise.all(entries.map(async entry=>[entry.entry_id,await api<DraftMatch[]>(`/organizations/${user.value!.organizationId}/entries/${entry.entry_id}/draft-matches`)] as const))]);teamRosters.value=Object.fromEntries(rosters);teamMatches.value=Object.fromEntries(matches); }
      if(user.value.organizationId&&parts.value[0]==='disciplina')await loadDiscipline();
      if(user.value.organizationId && parts.value[0]==='acta-equipo'){await loadDraftMatches(parts.value[1]);await loadTeamActa();}
      if (user.value.organizationId && ['buena-fe', 'nuevo-jugador', 'jugador', 'planilla'].includes(parts.value[0]) && selectedEntry.value) { await Promise.all([loadPlayers(selectedEntry.value.entry_id), loadGoodFaith(selectedEntry.value.entry_id), loadTournaments(), ...(parts.value[0] === 'planilla' ? [loadDraftMatches(selectedEntry.value.entry_id)] : []), ...(parts.value[0] === 'nuevo-jugador' || parts.value[0] === 'buena-fe' ? [loadOriginTeams()] : []), ...(parts.value[0] === 'buena-fe' ? [loadImportBatches(selectedEntry.value.entry_id)] : [])]); if (parts.value[0] === 'jugador') await loadPlayerEvidence(); if (parts.value[0] === 'planilla') await loadLineup(); }
      if (parts.value[0] === 'organizacion' && parts.value[1] && parts.value[1] !== user.value.organizationId) throw new RequestError('Elegí primero una organización a la que tengas acceso.');
    }
  } catch (failure) {
    if(epoch!==routeEpoch)return;
    if (failure instanceof RequestError && failure.status === 401) { clearPrivate(); user.value = null; go('acceso'); error.value = 'Tu sesión terminó. Ingresá de nuevo.'; }
    else error.value = failure instanceof Error ? failure.message : 'No se pudo abrir la pantalla.';
  } finally { if (epoch === routeEpoch) {if(loadingTimer)clearTimeout(loadingTimer);loadingTimer=null;loading.value = false;loadingVisual.value=false;} }
  await nextTick(); document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
}
async function signIn() {
  await perform(async () => {
    const result = await api<CurrentUser>('/auth/login', 'POST', login);
    clearPrivate(); creationRequestId.value = crypto.randomUUID(); user.value = result; login.password = ''; sessionNotice.value = '';
    const destination = returnRoute.value || (result.platformAdmin ? 'administradores' : result.memberships.some(item=>item.role==='operator'&&item.status==='active')?'mis-partidos':result.memberships.some(item=>item.role==='tournament_admin'&&item.status==='active')?'torneos':'equipos'); returnRoute.value = ''; go(destination);
  });
}
async function signOut() { await perform(async () => { await api('/auth/logout', 'POST');clearPrivate(); user.value = null; login.password = ''; go('publico'); }); }
function toggleOwnPassword() { ownPasswordOpen.value = !ownPasswordOpen.value; passwordDraft.value = ''; }
function toggleAdminPassword(userId: string) { adminPasswordTarget.value = adminPasswordTarget.value === userId ? '' : userId; passwordDraft.value = ''; }
async function changeOwnPassword() {
  await perform(async () => {
    await api('/auth/password', 'POST', { password: passwordDraft.value });
    passwordDraft.value = ''; ownPasswordOpen.value = false;
    notify('Contraseña actualizada. Las otras sesiones se cerraron.');
  });
}
async function changeAdminPassword(userId: string) {
  await perform(async () => {
    await api(`/admin/users/${userId}/password`, 'POST', { password: passwordDraft.value });
    passwordDraft.value = ''; adminPasswordTarget.value = '';
    notify('Contraseña actualizada. Las sesiones de esa cuenta se cerraron.');
  });
}
async function createOrganization() {
  await perform(async () => { createResult.value = await api('/admin/organizations', 'POST', { ...createDraft, requestId: creationRequestId.value }); await loadAdmin(); notify('Organización creada. El administrador queda pendiente de habilitación.'); });
}
function anotherOrganization() { Object.assign(createDraft, { name: '', administratorName: '', username: '' }); createResult.value = null; creationRequestId.value = crypto.randomUUID(); nextTick(() => document.querySelector<HTMLInputElement>('#organization-name')?.focus()); }
function prepareAccess(person: Administrator) { const key = `acceso-administrador:${person.id}`; if (!accessDrafts[key]) accessDrafts[key] = { status: person.status === 'pending' ? 'active' : person.status, reason: '', version: person.version }; }
async function saveAccess() {
  const target = accessTarget.value, draft = accessDraft.value;
  if (!target || !draft) return;
  await perform(async () => {
    const path = parts.value[0] === 'estado-organizacion' ? `/admin/organizations/${target.id}/access` : `/admin/memberships/${target.id}/access`;
    const result = await api<{ version: number; status: AccessState }>(path, 'POST', draft);
    draft.version = result.version; draft.reason = ''; await loadAdmin(); notify('Acceso actualizado.');
  });
}
async function refreshAccess() {
  await perform(async () => { await loadAdmin(); if (accessTarget.value && accessDraft.value) accessDraft.value.version = accessTarget.value.version; notify('Datos actualizados. Revisá el estado actual antes de confirmar.'); });
}
async function generateLink() {
  const person = selectedMember.value; if (!person) return;
  await perform(async () => { generatedLink.value = parts.value[0] === 'invitar' ? await api(`/admin/memberships/${person.id}/invitation`, 'POST') : await api(`/admin/users/${person.user_id}/recovery`, 'POST', { reason: linkReason.value }); notify('Enlace generado para entrega manual.'); });
}
async function copyLink(link: string) { try { await navigator.clipboard.writeText(link); notify('Enlace copiado.'); } catch { error.value = 'No se pudo copiar. Podés seleccionar y copiar el enlace del campo.'; } }
async function saveBrand(id: string) {
  await perform(async () => {
    const result = await api<OrganizationSummary>(`/organizations/${id}/branding`, 'PATCH', brandDrafts[id]);
    brandDrafts[id].version = result.version;
    if (user.value?.platformAdmin) await loadAdmin(); else await loadOrganization(id);
    notify('Datos de la organización guardados.');
  });
}
async function refreshBrand(id: string) {
  await perform(async () => {
    if (user.value?.platformAdmin) await loadAdmin(); else await loadOrganization(id);
    const actual = organizations.value.find((item) => item.id === id) || organization.value;
    if (actual && brandDrafts[id]) brandDrafts[id].version = actual.version;
    notify('Datos actualizados. Revisá el nombre actual antes de guardar tu edición.');
  });
}
async function uploadLogo(event: Event, id: string) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
  await perform(async () => {
    const data = new FormData(); data.append('file', file);
    await api(`/organizations/${id}/logo`, 'POST', data);
    if (user.value?.platformAdmin) await loadAdmin(); else await loadOrganization(id);
    const result = organizations.value.find((item) => item.id === id) || organization.value;
    if (result && brandDrafts[id]) brandDrafts[id].version = result.version;
    notify('Logo guardado.');
  }); input.value = '';
}
function editableBrand(id: string) { return Boolean(user.value?.platformAdmin || user.value?.memberships.some((item) => item.organization_id === id && item.role === 'tournament_admin' && item.status === 'active')); }
function textOnColor(color: string) {
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] > .179 ? '#10252B' : '#FFFFFF';
}
async function acceptLink() {
  if (!tokenInfo.value) return;
  const info = tokenInfo.value;
  await perform(async () => {
    const needPassword = info.purpose === 'recovery' || !info.has_password;
    if (needPassword && tokenPassword.password !== tokenPassword.confirm) throw new Error('Las contraseñas no coinciden.');
    await api('/invitations/accept', 'POST', { token: parts.value[1], ...(needPassword ? { password: tokenPassword.password } : {}) });
    if (info.purpose === 'invite' && !info.has_password) {
      const result = await api<CurrentUser>('/auth/login', 'POST', { username: info.username, password: tokenPassword.password });
      clearPrivate(); user.value = result; go(result.platformAdmin ? 'administradores' : 'inicio');
    } else if (info.purpose === 'recovery') { clearPrivate(); user.value = null; login.username = info.username; go('acceso'); notify('Contraseña actualizada. Ingresá con la nueva.'); }
    else { user.value = await api<CurrentUser>('/auth/me'); go('inicio'); notify('Invitación aceptada. La administración define la habilitación.'); }
    tokenPassword.password = ''; tokenPassword.confirm = '';
  });
}
function signInForLink() { returnRoute.value = route.value; login.username = tokenInfo.value?.username || ''; go('acceso'); }
function dateLabel(value: string) { return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Asuncion' }).format(new Date(value)); }
const routeChanged = () => { route.value = routeFromLocation(); };
const connectionChanged = () => { online.value = navigator.onLine; if(online.value && queuedCapture.value.length) void syncCaptureQueue(); };
watch(route, (next, previous) => { success.value = ''; publishPreviewCategory.value = ''; showRuleEditor.value = next.startsWith('categoria/') && next.endsWith('/tarjetas'); if (next.startsWith('planilla/') && next !== previous) lineupSearch.value = ''; if (next.startsWith('fixture/') && next !== previous) fixtureSeedOrder.value = []; if (next.startsWith('equipo/') && next !== previous) { teamAction.value = null; teamTab.value='players'; } if (next.startsWith('jugador/') && next !== previous) playerTab.value='record'; if (next.startsWith('disciplina/') && next !== previous) {disciplineTab.value='cases';disciplineSettingsTab.value='case';} if (next.startsWith('partido/') && next !== previous) matchTab.value='events'; void loadView().then(async()=>{if(next.endsWith('/tarjetas')){await nextTick(); document.getElementById('rule-cards')?.scrollIntoView({block:'start'});}}); if(!next.endsWith('/tarjetas'))window.scrollTo(0, 0); });
watch(route, () => { passwordDraft.value = ''; ownPasswordOpen.value = false; adminPasswordTarget.value = ''; });
watch([route, user], async () => { await nextTick(); document.querySelector<HTMLElement>('.bottom-nav a[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, { flush: 'post' });
onMounted(() => { window.addEventListener('hashchange', routeChanged); window.addEventListener('popstate', routeChanged); window.addEventListener('online', connectionChanged); window.addEventListener('offline', connectionChanged); loadView(); });
onUnmounted(() => { publicResultsStream?.close();privateMatchStream?.close();window.removeEventListener('hashchange', routeChanged); window.removeEventListener('popstate', routeChanged); window.removeEventListener('online', connectionChanged); window.removeEventListener('offline', connectionChanged); clearTimeout(toastTimer);if(loadingTimer)clearTimeout(loadingTimer); });
</script>

<template>
  <a class="skip" href="#contenido" @click.prevent="focusContent">Ir al contenido</a>
  <main v-if="publicRoute" id="contenido" tabindex="-1" :class="parts[0] === 'publico' || parts[0] === 'portal' ? 'fan-main' : 'auth'">
    <div :class="parts[0] === 'publico' || parts[0] === 'portal' ? 'fan-host' : 'auth-card'">
      <div v-if="!['publico','portal','panel','acceso'].includes(parts[0])" class="auth-brand"><Icon />Panel de torneos</div>
      <template v-if="parts[0] === 'acceso'">
        <h1 tabindex="-1">Ingresar</h1>
        <div v-if="sessionNotice" class="notice amber" role="status">{{ sessionNotice }}</div>
        <div v-if="error" class="notice error" role="alert">{{ error }}</div>
        <form class="panel" @submit.prevent="signIn">
          <div class="field"><label for="username">Usuario</label><input id="username" v-model="login.username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="160" required placeholder="Tu usuario"></div>
          <div class="field"><label for="password">Contraseña</label><div class="password-wrap"><input id="password" v-model="login.password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" maxlength="128" required><button class="btn" type="button" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Ocultar' : 'Mostrar' }}</button></div></div>
          <button class="btn primary full mt" :disabled="busy">{{ busy ? 'Ingresando…' : 'Ingresar' }}<Icon name="arrow" /></button>
        </form>
      </template>
      <template v-else-if="parts[0] === 'publico' && !parts[1]">
        <PublicDirectory :organizations="publicOrganizations" :loading="loading" :error="error" @select="openPublicOrganization" @select-tournament="(organizationId, tournamentId, slug) => go(`publico/${organizationId}/${tournamentId}`, slug || '')" />
      </template>
      <template v-else-if="parts[0] === 'publico'">
        <PublicPositionPortal v-if="publicDraws.length && (parts[2] ? publicDraws.some(item=>item.tournament_id===parts[2]) : !publicTournaments.length)" :organization="publicOrganization" :draws="publicDraws" :selected-tournament-id="parts[2]||''" :results-revision="publicResultsRevision" @navigate="go" />
        <FanPortal v-else :catalog="publicCatalog" :organization="publicOrganization" :selected-tournament-id="parts[2]||''" :tournaments="publicTournaments" :fixture="publicFixture" :brackets="publicBrackets" :statistics="publicStatistics" :teams="publicTeams" :flyers="publicFlyers" :loading="loading" :error="error" @navigate="go" />
      </template>
      <template v-else-if="parts[0] === 'portal' || parts[0] === 'panel'"><p v-if="error" role="alert">{{ error }} <a href="/">Organizaciones</a></p><p v-else role="status">Abriendo…</p></template>
      <template v-else>
        <h1 tabindex="-1">{{ parts[0] === 'recuperacion' ? 'Recuperar acceso' : 'Aceptar invitación' }}</h1><p class="intro">{{ tokenInfo?.organization_name || 'Enlace administrado de un solo uso' }}</p>
        <div v-if="loading" class="loading">Comprobando el enlace…</div>
        <div v-if="error" class="notice error" role="alert">{{ error }}</div>
        <form v-if="tokenInfo && !loading" class="panel stack" @submit.prevent="acceptLink">
          <div><strong>{{ tokenInfo.name }}</strong><p class="small muted">{{ tokenInfo.username }}</p></div>
          <template v-if="tokenInfo.purpose === 'recovery' || !tokenInfo.has_password">
            <div class="field"><label for="new-password">Nueva contraseña</label><input id="new-password" v-model="tokenPassword.password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><span class="small muted">Al menos 12 caracteres.</span></div>
            <div class="field"><label for="confirm-password">Repetir contraseña</label><input id="confirm-password" v-model="tokenPassword.confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>
            <button class="btn primary full" :disabled="busy">{{ busy ? 'Guardando…' : tokenInfo.purpose === 'recovery' ? 'Guardar nueva contraseña' : 'Crear contraseña y entrar' }}</button>
          </template>
          <template v-else-if="user?.username === tokenInfo.username"><p class="small muted">Vas a vincular tu cuenta a esta organización.</p><button class="btn primary full" :disabled="busy">Aceptar invitación</button></template>
          <template v-else><p class="small muted">Ingresá con esta cuenta para aceptar la invitación.</p><button type="button" class="btn primary full" @click="signInForLink">Ingresar con mi cuenta</button></template>
        </form>
        <button class="link btn ghost full mt" @click="go('acceso')">Volver a ingresar</button>
      </template>
    </div>
    <footer v-if="parts[0] === 'publico'" class="public-credit">Desarrollado por NAVZ <a href="tel:+595972995557">+595972995557</a></footer>
  </main>
  <div v-else-if="user" class="shell">
    <aside class="sidebar">
      <a class="sidebar-brand" :href="`#/${user.platformAdmin ? 'administradores' : 'torneos'}`"><Icon />Torneos</a>
      <div class="sidebar-context"><strong>{{ user.platformAdmin ? 'Administración general' : currentOrgName }}</strong><small>{{ user.platformAdmin ? 'Control de accesos' : user.name }}</small></div>
      <nav class="side-nav" aria-label="Navegación principal"><a v-for="[path, label, symbol] in navigation" :key="path" :href="`#/${navPath(path)}`" :aria-current="selectedNav(path) ? 'page' : undefined"><Icon :name="symbol" />{{ label }}</a></nav>
    </aside>
    <header class="topbar"><details v-if="!user.platformAdmin && canManageTournaments() && parts[0] !== 'torneos'" :key="route" class="tournament-picker"><summary><Icon name="trophy" /><span>{{ tournamentContext?.name || 'Elegir torneo' }}</span><Icon name="chevron" /></summary><div class="picker-menu"><a href="#/torneos"><Icon name="grid" />Todos los torneos</a><a v-for="item in tournamentList" :key="item.id" :href="`#/torneo/${item.id}`"><Icon name="trophy" />{{ item.name }}</a><a v-if="tournamentContext" :href="`#/torneo/${tournamentContext.id}/ajustes`"><Icon name="grid" />Configuración</a><a href="#/nuevo-torneo"><Icon name="plus" />Crear torneo</a></div></details><div v-else class="row"><span class="org-mark"><Icon /></span><strong>{{ user.platformAdmin ? 'Administración general' : currentOrgName }}</strong></div><a href="#/cuenta" class="account-link" aria-label="Cuenta"><span class="avatar">{{ initials(user.name) }}</span></a></header>
    <nav v-if="user.platformAdmin || !canManageTournaments()" class="bottom-nav" aria-label="Navegación móvil"><a v-for="[path, label, symbol] in navigation" :key="path" :href="`#/${navPath(path)}`" :aria-current="selectedNav(path) ? 'page' : undefined"><Icon :name="symbol" /><span>{{ label }}</span></a></nav>
    <nav v-if="!user.platformAdmin && canManageTournaments() && tournamentContext && parts[0] === 'torneo'" class="tournament-tabs" aria-label="Secciones del torneo"><a v-for="[section,label,symbol] in tournamentTabs" :key="section" :href="`#/torneo/${tournamentContext.id}/${section}`" :aria-current="tournamentSection === section ? 'page' : undefined"><Icon :name="symbol" /><span>{{ label }}</span></a></nav>
    <main id="contenido" tabindex="-1" class="main" :class="{'tournament-main':parts[0]==='torneo'}">
      <a v-if="!user.platformAdmin && user.organizationId && parts[0] === 'inicio'" class="btn full" href="#/bandeja">Abrir bandeja de revisión<Icon name="arrow" /></a>
      <div v-if="!online" class="notice amber" role="status">Sin conexión. Tus cambios del formulario se conservan; guardá cuando vuelva la conexión.</div>
      <div v-if="error" class="notice error" role="alert"><div><p>{{ error }}</p><button v-if="errorCode === 'STALE_VERSION' && parts[0] === 'organizacion' && selectedOrg" type="button" class="btn mt" :disabled="busy" @click="refreshBrand(selectedOrg.id)">Actualizar datos sin borrar mi edición</button></div></div>
      <div v-if="loadingVisual && !(parts[0]==='torneo' && workspaceBlueprint.blueprint && workspaceBlueprint.categoryId===selectedTournament?.category_id && ['fixture','partidos','estadisticas'].includes(tournamentSection))" class="loading" role="status">Cargando…</div>

      <template v-if="user.platformAdmin && parts[0] === 'administradores'">
        <div class="heading"><div><h1 tabindex="-1">Administradores</h1><p>Personas y acceso a sus organizaciones</p></div><a href="#/nueva-organizacion" class="btn primary"><Icon name="plus" />Agregar</a></div>
        <label class="search"><span class="sr-only">Buscar administrador u organización</span><Icon name="search" /><input v-model="search" type="search" placeholder="Buscar persona u organización"></label>
        <div class="filters" aria-label="Filtrar administradores"><button v-for="filter in filters" :key="filter" class="filter" :aria-pressed="statusFilter === filter" @click="statusFilter = filter">{{ filter }}</button></div>
        <section class="panel">
          <div v-for="person in filteredMembers" :key="person.id" class="person-row">
            <a class="person-main" :href="`#/administrador/${person.id}`"><span class="avatar">{{ initials(person.name) }}</span><div class="grow"><h3>{{ person.name }}</h3><p>{{ person.organization_name }}</p></div></a>
            <div class="person-actions"><span class="badge" :class="person.status">{{ accessLabels[person.status] }}</span><a class="btn" :class="person.status === 'pending' ? 'soft' : ''" :href="`#/acceso-administrador/${person.id}`" :aria-label="`${person.status === 'pending' ? 'Habilitar' : 'Revisar acceso de'} ${person.name}`" @click="prepareAccess(person)">{{ person.status === 'pending' ? 'Habilitar' : 'Acceso' }}</a></div>
          </div>
          <div v-if="!filteredMembers.length && !loading" class="empty"><Icon name="search" /><h2>Sin coincidencias</h2><p>Probá otro nombre o cambiá el filtro.</p><button class="btn" @click="search = ''; statusFilter = 'Todos'">Mostrar todos</button></div>
        </section>
      </template>

      <div v-else-if="user.platformAdmin && parts[0] === 'nueva-organizacion'" class="form-page">
        <a href="#/administradores" class="back"><Icon name="back" />Administradores</a><div class="heading"><div><h1 tabindex="-1">Agregar organización</h1><p>Con su administrador responsable</p></div></div>
        <form v-if="!createResult" class="panel pad" @submit.prevent="createOrganization"><div class="form-grid"><div class="field wide"><label for="organization-name">Nombre de la organización</label><input id="organization-name" v-model="createDraft.name" minlength="3" maxlength="120" required placeholder="Ej. Liga del Barrio"></div><div class="field"><label for="administrator-name">Nombre del administrador</label><input id="administrator-name" v-model="createDraft.administratorName" minlength="2" maxlength="120" required autocomplete="name"></div><div class="field"><label for="administrator-username">Usuario del administrador</label><input id="administrator-username" v-model="createDraft.username" minlength="3" maxlength="160" required autocapitalize="none" spellcheck="false" placeholder="Ej. juan@ejemplo.test"></div></div><div class="form-actions"><a class="btn" href="#/administradores">Volver</a><button class="btn primary" :disabled="busy">{{ busy ? 'Creando…' : 'Crear e invitar' }}</button></div></form>
        <section v-else class="panel pad stack"><div class="notice"><Icon name="check" /><p>Organización creada. Su administrador queda pendiente de habilitación.</p></div><div class="copy-row"><div class="field"><label for="created-link">Enlace de invitación</label><input id="created-link" :value="createResult.invitation.url" readonly @focus="($event.target as HTMLInputElement).select()"></div><button class="btn primary" @click="copyLink(createResult.invitation.url)"><Icon name="copy" />Copiar</button></div><p class="small muted">Vence en 48 horas. Entregalo por el medio que acuerden; se muestra solo al generarlo.</p><a class="btn" :href="`#/acceso-administrador/${createResult.membershipId}`">Revisar habilitación<Icon name="arrow" /></a><button class="btn soft" @click="anotherOrganization"><Icon name="plus" />Crear otra organización</button></section>
      </div>

      <div v-else-if="user.platformAdmin && parts[0] === 'administrador' && selectedMember" class="form-page">
        <a href="#/administradores" class="back"><Icon name="back" />Administradores</a><div class="heading"><div><h1 tabindex="-1">{{ selectedMember.name }}</h1><p>{{ selectedMember.organization_name }}</p></div><span class="badge" :class="selectedMember.status">{{ accessLabels[selectedMember.status] }}</span></div>
        <section class="panel pad"><div class="row"><span class="avatar">{{ initials(selectedMember.name) }}</span><div><strong>{{ roleLabels[selectedMember.role] }}</strong><p class="small muted">{{ selectedMember.username }}</p></div></div><a class="btn primary full mt" :href="`#/acceso-administrador/${selectedMember.id}`">Cambiar acceso<Icon name="shield" /></a><div class="action-grid mt"><a class="btn" :href="`#/invitar/${selectedMember.id}`"><Icon name="copy" />Invitación</a><button type="button" class="btn" :aria-expanded="adminPasswordTarget === selectedMember.user_id" @click="toggleAdminPassword(selectedMember.user_id)"><Icon name="lock" />Cambiar contraseña</button><a class="btn" :href="`#/organizacion/${selectedMember.organization_id}`"><Icon name="grid" />Organización</a></div><form v-if="adminPasswordTarget === selectedMember.user_id" class="stack mt" @submit.prevent="changeAdminPassword(selectedMember.user_id)"><div class="field"><label for="admin-new-password">Nueva contraseña</label><input id="admin-new-password" v-model="passwordDraft" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div><p class="small muted">Se cerrarán sus sesiones en todas las organizaciones.</p><div class="row wrap"><button class="btn primary" :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar' }}</button><button type="button" class="btn" :disabled="busy" @click="toggleAdminPassword(selectedMember.user_id)">Cancelar</button></div></form></section>
      </div>

      <div v-else-if="user.platformAdmin && ['acceso-administrador', 'estado-organizacion'].includes(parts[0]) && accessTarget && accessDraft" class="form-page">
        <a :href="`#/${parts[0] === 'estado-organizacion' ? 'organizacion' : 'administrador'}/${parts[1]}`" class="back"><Icon name="back" />Volver al detalle</a><div class="heading"><div><h1 tabindex="-1">Cambiar acceso</h1><p>{{ 'organization_name' in accessTarget ? accessTarget.organization_name : 'Toda la organización' }}</p></div></div>
        <form class="panel pad" @submit.prevent="saveAccess"><div class="between"><strong>{{ accessTarget.name }}</strong><span class="badge" :class="accessTarget.status">{{ accessLabels[accessTarget.status] }}</span></div><p class="small muted mt">{{ parts[0] === 'estado-organizacion' ? 'Afecta a todos los integrantes de esta organización.' : 'Afecta solo a esta persona en la organización indicada.' }}</p><div class="choices grid mt" role="group" aria-label="Nuevo estado de acceso"><button v-for="status in accessStates" :key="status" type="button" class="choice" :aria-pressed="accessDraft.status === status" @click="accessDraft.status = status"><Icon :name="status === 'active' ? 'check' : status === 'pending' ? 'clock' : 'lock'" />{{ accessLabels[status] }}</button></div><div class="field mt"><label for="access-reason">Motivo</label><div class="choices"><button v-for="reason in memberReasons" :key="reason" type="button" class="filter" @click="accessDraft.reason = reason">{{ reason }}</button></div><textarea id="access-reason" v-model="accessDraft.reason" minlength="3" maxlength="300" required placeholder="Explicá brevemente el cambio"></textarea></div><div v-if="['suspended', 'blocked'].includes(accessDraft.status)" class="notice amber mt"><Icon name="lock" /><p>Se impedirá operar en esta organización y se cerrarán las sesiones afectadas. Los datos se conservarán.</p></div><div class="form-actions"><button class="btn" type="button" :disabled="busy" @click="refreshAccess">Actualizar datos</button><button class="btn primary" :class="accessDraft.status === 'blocked' ? 'danger' : ''" :disabled="busy || accessDraft.status === accessTarget.status">{{ busy ? 'Guardando…' : 'Guardar acceso' }}</button></div></form>
      </div>

      <div v-else-if="user.platformAdmin && ['invitar', 'recuperar'].includes(parts[0]) && selectedMember" class="form-page">
        <a :href="`#/administrador/${selectedMember.id}`" class="back"><Icon name="back" />{{ selectedMember.name }}</a><div class="heading"><div><h1 tabindex="-1">{{ parts[0] === 'invitar' ? 'Invitación' : 'Recuperar cuenta' }}</h1><p>{{ selectedMember.organization_name }}</p></div></div>
        <form class="panel pad stack" @submit.prevent="generateLink"><div><strong>{{ selectedMember.name }}</strong><p class="small muted">{{ selectedMember.username }}</p></div><p class="small muted">{{ parts[0] === 'invitar' ? 'El nuevo enlace reemplaza las invitaciones anteriores de esta organización.' : 'Al usar el enlace se cambiará la contraseña y se cerrarán las sesiones previas de la cuenta. El estado de acceso se conserva.' }}</p><div v-if="parts[0] === 'recuperar'" class="field"><label for="recovery-reason">Motivo de la recuperación</label><textarea id="recovery-reason" v-model="linkReason" minlength="3" maxlength="300" required placeholder="Ej. Recuperación solicitada por el responsable"></textarea></div><button class="btn primary full" :disabled="busy">{{ busy ? 'Generando…' : generatedLink ? 'Generar otro enlace' : 'Generar enlace' }}</button><template v-if="generatedLink"><div class="copy-row"><div class="field"><label for="generated-link">Enlace temporal</label><input id="generated-link" :value="generatedLink.url" readonly @focus="($event.target as HTMLInputElement).select()"></div><button type="button" class="btn" @click="copyLink(generatedLink.url)"><Icon name="copy" />Copiar</button></div><p class="small muted">Un uso · 48 horas · Entrega manual fuera de la aplicación.</p></template></form>
      </div>

      <template v-else-if="!user.platformAdmin && parts[0] === 'torneos' && user.organizationId">
        <div class="heading"><h1 tabindex="-1">Elegí un torneo</h1><a v-if="canManageTournaments()" href="#/nuevo-torneo" class="btn primary"><Icon name="plus" />Crear</a></div>
        <div v-if="!tournaments.length && !loading" class="empty"><a v-if="canManageTournaments()" href="#/nuevo-torneo" class="btn primary">Crear torneo</a></div>
        <div v-else class="directory-list"><a v-for="item in tournamentList" :key="item.id" :href="`#/torneo/${item.id}`"><Icon name="trophy" /><span><strong>{{ item.name }}</strong><small>{{ item.edition_name }} · {{ item.category_name }}</small></span><span class="badge" :class="item.status === 'published' ? 'active' : 'pending'">{{ item.status === 'published' ? 'Publicado' : 'Borrador' }}</span><Icon name="arrow" /></a></div>
      </template>
      <FlyerSettings v-else-if="!user.platformAdmin && parts[0] === 'flyer-settings' && selectedTournament && canManageTournaments() && user.organizationId" :organization-id="user.organizationId" :tournament-id="selectedTournament.id" :csrf-token="user.csrfToken" />
      <div v-else-if="!user.platformAdmin && parts[0] === 'flyers' && selectedTournament && canManageTournaments()" class="form-page stack">
        <div class="heading"><h1 tabindex="-1">Flyer</h1><a :href="`#/flyer-settings/${selectedTournament.id}`" class="btn"><Icon name="edit" />Diseño</a><a :href="`#/torneo/${selectedTournament.id}/${flyerDraft.kind === 'matchday' || flyerDraft.kind === 'bracket' ? 'fixture' : ['match','result'].includes(flyerDraft.kind) ? 'partidos' : 'estadisticas'}`" class="icon-button" aria-label="Volver al torneo"><Icon name="back" /></a></div>
        <div v-if="flyerScoped" class="stack"><strong>{{ flyerLabels[flyerDraft.kind] }} · {{ flyerScopeLabel }}</strong><template v-if="generatedFlyer"><img v-if="generatedFlyer.status==='ready'&&generatedFlyer.format!=='pdf'" class="flyer-preview" :src="`/api/v1/organizations/${user.organizationId}/flyers/${generatedFlyer.id}/file`" alt="Flyer generado"><a v-if="generatedFlyer.status==='ready'" class="btn primary full" :href="`/api/v1/organizations/${user.organizationId}/flyers/${generatedFlyer.id}/file`" download><Icon name="download" />Descargar</a><p v-else-if="generatedFlyer.status==='failed'" role="alert" class="notice amber">{{ generatedFlyer.error||'No se pudo generar.' }}</p><p v-else role="status" class="small muted">Generando…</p><button type="button" class="btn" :disabled="busy" @click="createScopedFlyer">Regenerar</button></template><p v-else class="small muted">{{ flyerDraft.sourceId?'Preparando…':'Contenido no disponible.' }}</p></div>
        <template v-else>
        <div class="stack">
          <div v-if="flyerScoped" class="flyer-context"><strong>{{ flyerLabels[flyerDraft.kind] }} · {{ flyerScopeLabel }}</strong></div>
          <template v-else><div class="field"><label for="flyer-kind">Contenido</label><select id="flyer-kind" v-model="flyerDraft.kind" @change="flyerDraft.sourceId='';flyerDraft.note='';resetFlyerPage()"><template v-for="(label,key) in flyerLabels" :key="key"><option v-if="key!=='scorer'" :value="key">{{ label }}</option></template></select></div>
          <div class="field"><label v-if="flyerSources.length>1" for="flyer-source">Partido o fecha</label><select v-if="flyerSources.length>1" id="flyer-source" v-model="flyerDraft.sourceId" @change="resetFlyerPage"><option value="">Elegí</option><option v-for="item in flyerSources" :key="item.id" :value="item.id">{{ item.label }}</option></select><strong v-else-if="flyerSources.length===1">{{ flyerSources[0].label }}</strong><a v-else class="link" :href="`#/fixture/${selectedTournament.category_id}`">Primero prepará y publicá la fecha en Fixture</a></div></template>
          <div v-if="flyerDraft.kind==='notice'" class="field"><label for="flyer-note">Texto</label><textarea id="flyer-note" v-model="flyerDraft.note" maxlength="160" rows="3"></textarea></div>
          <div class="choices grid" role="group" aria-label="Plantilla"><button v-for="item in [['forest','Campo oscuro'],['paper','Pizarra clara']]" :key="item[0]" type="button" class="choice" :aria-pressed="flyerDraft.template===item[0]" @click="flyerDraft.template=item[0] as 'forest'|'paper'">{{ item[1] }}</button></div>
          <div class="choices grid" role="group" aria-label="Tamaño"><button v-for="item in [['square','Cuadrado'],['portrait','Vertical'],['story','Historia'],['print','Impresión']]" :key="item[0]" type="button" class="choice" :aria-pressed="flyerDraft.size===item[0]" @click="flyerDraft.size=item[0] as typeof flyerDraft.size;resetFlyerPage()">{{ item[1] }}</button></div>
          <div class="choices grid" role="group" aria-label="Formato"><button v-for="item in ['png','jpg','pdf']" :key="item" type="button" class="choice" :aria-pressed="flyerDraft.format===item" @click="flyerDraft.format=item as typeof flyerDraft.format">{{ item.toUpperCase() }}</button></div>
          <div v-if="flyerDraft.kind==='standings'&&flyerPageLabels.length>1" class="choices" role="group" aria-label="Grupo del flyer"><button v-for="(label,index) in flyerPageLabels" :key="index" type="button" class="choice" :aria-pressed="flyerDraft.pageNo===index+1" :disabled="busy" @click="selectFlyerPage(index+1)">{{ label }}</button></div>
          <div v-else-if="flyerPages>1" class="between"><button type="button" class="btn" :disabled="busy||flyerDraft.pageNo===1" @click="changeFlyerPage(-1)">Anterior</button><span class="small">Página {{ flyerDraft.pageNo }} de {{ flyerPages }}</span><button type="button" class="btn" :disabled="busy||flyerDraft.pageNo===flyerPages" @click="changeFlyerPage(1)">Siguiente</button></div>
          <button type="button" class="btn full" :disabled="busy||!flyerDraft.sourceId" @click="previewFlyer">Ver vista previa</button><img v-if="flyerPreview" class="flyer-preview" :src="flyerPreview" alt="Vista previa del flyer generado con los datos publicados">
          <button type="button" class="btn primary full" :disabled="busy||!flyerDraft.sourceId" @click="createFlyer">Generar archivo</button>
        </div>
        <section class="panel pad stack"><div class="between"><h2>Versiones y archivos</h2><button type="button" class="btn" :disabled="busy" @click="loadFlyers">Actualizar</button></div><p v-if="!flyers.length" class="small muted">Aún no se generaron flyers.</p><div v-for="item in flyers" :key="item.id" class="team-person"><div><strong>{{ flyerLabels[item.kind]||item.kind }} · v{{ item.version }}</strong><p class="small muted">{{ item.format.toUpperCase() }} · {{ item.size }} · {{ item.status==='ready'?'Listo':item.status==='failed'?'Falló':item.status==='running'?'Generando':'En cola' }}<template v-if="item.stale"> · Fuente actualizada</template><template v-if="item.publicVisible"> · Público</template></p><p v-if="item.error" class="small muted">{{ item.error }}</p></div><div class="stack"><a v-if="item.status==='ready'" class="btn" :href="`/api/v1/organizations/${user.organizationId}/flyers/${item.id}/file`">Descargar</a><button v-if="item.status==='ready'&&(!item.stale||item.publicVisible)" type="button" class="btn" :disabled="busy" @click="publishFlyer(item)">{{ item.publicVisible?'Ocultar':'Publicar' }}</button></div></div></section>
        </template>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'nuevo-torneo' && user.organizationId && canManageTournaments()" class="form-page">
        <a href="#/torneos" class="back"><Icon name="back" />Torneos</a><div class="heading"><div><h1 tabindex="-1">Crear torneo</h1></div></div>
        <form class="panel pad stack" @submit.prevent="createTournament">
          <div class="field"><label for="tournament-name">Nombre del torneo</label><input id="tournament-name" v-model="tournamentDraft.name" minlength="3" maxlength="120" required placeholder="Ej. Copa de la Comunidad"></div>
          <div class="form-grid"><div class="field"><label for="edition-name">Edición</label><input id="edition-name" v-model="tournamentDraft.editionName" minlength="2" maxlength="100" required placeholder="Ej. Temporada 2026"></div><div class="field"><label for="category-name">Categoría</label><input id="category-name" v-model="tournamentDraft.categoryName" minlength="2" maxlength="100" required placeholder="Ej. Libre"></div></div>
          <div><span class="label">Formato</span><div class="choices grid mt" role="group" aria-label="Formato del torneo"><button v-for="[mode,label] in [['league','Liga'],['groups','Grupos'],['knockout','Copa']]" :key="mode" type="button" class="choice" :aria-pressed="tournamentDraft.rules.initialPhase?.mode===mode" @click="tournamentDraft.rules.initialPhase={mode:mode as 'league'|'groups'|'knockout',legs:1,groupCount:mode==='groups'?2:null}; tournamentDraft.rules.competitionPlan=null">{{ label }}</button></div></div>
          <div v-if="tournamentDraft.rules.initialPhase?.mode==='knockout'"><div class="choices grid" role="group" aria-label="Repechaje"><button type="button" class="choice" :aria-pressed="!!tournamentDraft.rules.competitionPlan?.repechage" @click="setQuickRepechage(true)">Con repechaje</button><button type="button" class="choice" :aria-pressed="!tournamentDraft.rules.competitionPlan?.repechage" @click="setQuickRepechage(false)">Sin repechaje</button></div><div v-if="tournamentDraft.rules.competitionPlan?.repechage" class="field mt"><label for="quick-repechage-teams">Equipos previstos</label><input id="quick-repechage-teams" type="number" min="3" max="255" :value="tournamentDraft.rules.competitionPlan.qualification.from==='direct' ? tournamentDraft.rules.competitionPlan.qualification.entrants : ''" @change="setQuickRepechageEntrants($event)"></div></div>
          <div v-if="tournamentDraft.rules.initialPhase?.mode==='groups'" class="field"><label for="quick-groups">Grupos</label><input id="quick-groups" type="number" min="2" max="32" :value="tournamentDraft.rules.initialPhase.groupCount" @input="tournamentDraft.rules.initialPhase!.groupCount=Number(($event.target as HTMLInputElement).value)"></div>
          <div><span class="label">Puntos</span><div class="quick-points mt"><div class="field"><label for="quick-win">Victoria</label><input id="quick-win" v-model.number="tournamentDraft.rules.points.win" type="number" min="0" max="10"></div><div class="field"><label for="quick-draw">Empate</label><input id="quick-draw" v-model.number="tournamentDraft.rules.points.draw" type="number" min="0" max="10"></div><div class="field"><label for="quick-loss">Derrota</label><input id="quick-loss" v-model.number="tournamentDraft.rules.points.loss" type="number" min="0" max="10"></div></div></div>
          <div><div class="between"><span class="label">Pagos · multa por tarjeta</span><button v-if="(tournamentDraft.rules.advanced?.discipline.customCards?.length||0)<8" type="button" class="inline-add-card" :aria-expanded="quickCardOpen" aria-controls="quick-card-editor" @click="quickCardOpen=!quickCardOpen"><Icon name="plus" />Añadir tarjeta</button></div><div class="form-grid mt"><div class="field"><label for="new-yellow-rate">Amarilla · Gs.</label><input id="new-yellow-rate" v-model.number="tournamentDraft.paymentRates.yellowGuaranies" type="number" inputmode="numeric" min="0" max="1000000000" required></div><div class="field"><label for="new-red-rate">Roja · Gs.</label><input id="new-red-rate" v-model.number="tournamentDraft.paymentRates.redGuaranies" type="number" inputmode="numeric" min="0" max="1000000000" required></div></div><div v-for="card in tournamentDraft.rules.advanced?.discipline.customCards||[]" :key="card.code" class="quick-card-row"><div class="between"><span class="quick-card-name"><span class="card-swatch" :style="{background:card.color}" aria-hidden="true"></span><strong>{{ card.label }}</strong></span><button type="button" class="text-action" @click="removeQuickTournamentCard(card.code)">Quitar</button></div><div class="field"><label :for="`new-rate-${card.code}`">{{ card.label }} · Gs.</label><input :id="`new-rate-${card.code}`" v-model.number="tournamentDraft.paymentRates.customCardRates[card.code]" type="number" inputmode="numeric" min="0" max="1000000000" required></div></div><div v-if="quickCardOpen" id="quick-card-editor" class="quick-card-editor" role="group" aria-label="Nueva tarjeta"><div class="field"><label for="quick-card-name">Nombre</label><input id="quick-card-name" v-model="quickCard.name" minlength="2" maxlength="40" placeholder="Ej. Azul" @keydown.enter.prevent="addQuickTournamentCard"></div><div class="form-grid"><div class="field"><label for="quick-card-color">Color</label><input id="quick-card-color" v-model="quickCard.color" type="color"></div><div class="field"><label for="quick-card-amount">Multa · Gs.</label><input id="quick-card-amount" v-model.number="quickCard.amountGuaranies" type="number" inputmode="numeric" min="0" max="1000000000"></div></div><div class="field"><label for="quick-card-suspension">Suspensión sugerida · partidos</label><input id="quick-card-suspension" v-model.number="quickCard.suspensionMatches" type="number" inputmode="numeric" min="0" max="50"></div><div class="workspace-actions"><button type="button" class="btn" :disabled="!canAddQuickCard" @click="addQuickTournamentCard">Agregar</button><button type="button" class="text-action" @click="quickCardOpen=false">Cancelar</button></div></div></div>
          <details class="optional-section"><summary>Más opciones de formato y reglamento</summary><div class="field mt"><label for="team-limit">Límite de equipos</label><input id="team-limit" type="number" inputmode="numeric" min="2" max="256" :value="tournamentDraft.teamLimit ?? ''" @input="tournamentDraft.teamLimit = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"></div><div class="field mt"><label for="timezone">Zona horaria</label><input id="timezone" v-model="tournamentDraft.timezone" minlength="3" maxlength="80"></div><RulesEditor :key="tournamentRequestId" v-model="tournamentDraft.rules" :disabled="busy" /></details>
          <button class="btn primary full" :disabled="busy">{{ busy ? 'Guardando…' : 'Crear torneo' }}</button>
        </form>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'nueva-categoria' && selectedTournament && canManageTournaments()" class="form-page">
        <a :href="`#/torneo/${selectedTournament.id}`" class="back"><Icon name="back" />{{ selectedTournament.name }}</a><div class="heading"><div><h1 tabindex="-1">Agregar categoría</h1><p>Paso {{ categoryStep }} de 2 · {{ selectedTournament.name }}</p></div></div>
        <form v-if="categoryStep === 1" class="panel pad stack" @submit.prevent="categoryStep = 2"><div class="field"><label for="new-edition-name">Edición</label><input id="new-edition-name" v-model="categoryDraft.editionName" minlength="2" maxlength="100" required><span class="small muted">Usá el mismo nombre para sumarla a la edición actual, u otro para crear una nueva.</span></div><div class="field"><label for="new-category-name">Nombre de la categoría</label><input id="new-category-name" v-model="categoryDraft.categoryName" minlength="2" maxlength="100" required placeholder="Ej. Juvenil"></div><div class="field"><label for="new-category-team-limit">Límite de equipos <span class="muted">(opcional)</span></label><input id="new-category-team-limit" type="number" inputmode="numeric" min="2" max="256" :value="categoryDraft.teamLimit ?? ''" @input="categoryDraft.teamLimit = ($event.target as HTMLInputElement).value === '' ? null : Number(($event.target as HTMLInputElement).value)"></div><div><span class="label">Modalidad como punto de partida</span><div class="choices grid mt" role="group" aria-label="Modalidad de la categoría"><button v-for="preset in rulePresets" :key="preset" type="button" class="choice" :aria-pressed="categoryDraft.preset === preset" @click="chooseCategoryPreset(preset)">{{ preset }}</button></div></div><div class="form-actions"><a class="btn" :href="`#/torneo/${selectedTournament.id}`">Volver</a><button class="btn primary">Revisar reglas</button></div></form>
        <form v-else class="panel pad stack" @submit.prevent="createCategory(selectedTournament.id)"><div class="notice"><Icon name="file" /><p><strong>{{ categoryDraft.categoryName }}</strong><br>{{ categoryDraft.editionName }} · {{ categoryDraft.preset }}</p></div><RulesEditor :key="categoryRequestId" v-model="categoryDraft.rules" :disabled="busy" /><div class="form-actions"><button type="button" class="btn" @click="categoryStep = 1">Volver a datos</button><button class="btn primary" :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar categoría' }}</button></div></form>
      </div>

      <div v-else-if="!user.platformAdmin && ['torneo','categoria'].includes(parts[0]) && selectedTournament" class="form-page">
        <h1 v-if="parts[0] === 'torneo'" class="sr-only" tabindex="-1">{{ selectedTournament.name }}</h1><div v-else class="heading"><h1 tabindex="-1">{{ selectedTournament.category_name }}</h1><span class="badge" :class="selectedTournament.rule_status === 'published' ? 'active' : 'pending'">{{ selectedTournament.rule_status === 'published' ? 'Oficial' : 'Borrador' }}</span></div>
        <PaymentsWorkspace v-if="parts[0] === 'torneo' && tournamentSection === 'pagos' && canManageTournaments()" :key="selectedTournament.id" :organization-id="user.organizationId!" :tournament-id="selectedTournament.id" :teams="tournamentEntries" :categories="tournamentCategories" :initial-entry-id="parts[3] === 'tarifas' ? '' : parts[3]" :show-rates="parts[3] === 'tarifas'" :csrf-token="user.csrfToken" @refresh="loadTournaments" />
        <FixtureDayEditor v-else-if="parts[0] === 'torneo' && tournamentSection === 'fixture' && parts[3] && canManageTournaments()" :tournament="selectedTournament" :categories="tournamentCategories" :entries="tournamentEntries" :days="tournamentDays" :day-id="parts[3]" :focus-match-id="parts[4]" :venues="tournamentResources.venues" :official-match-ids="workspaceOfficialMatchIds" :organization-id="user.organizationId!" :csrf-token="user.csrfToken" @refresh="loadTournamentSection" />
        <PositionBlueprint v-else-if="parts[0] === 'torneo' && tournamentSection === 'fixture' && workspaceBlueprint.blueprint && workspaceBlueprint.categoryId === selectedTournament.category_id" :view="workspaceBlueprint" :competition="workspaceCompetition" :entries="tournamentEntries" :can-manage="canManageTournaments()" :organization-id="user.organizationId!" :category-id="selectedTournament.category_id" :tournament-id="selectedTournament.id" :csrf-token="user.csrfToken" @refresh="loadTournamentSection" />
        <PositionMatches v-else-if="parts[0] === 'torneo' && tournamentSection === 'partidos' && workspaceBlueprint.blueprint && workspaceBlueprint.categoryId === selectedTournament.category_id" :view="workspaceBlueprint" :competition="workspaceCompetition" :entries="tournamentEntries" :organization-id="user.organizationId!" :category-id="selectedTournament.category_id" :tournament-id="selectedTournament.id" />
        <PositionStatistics v-else-if="parts[0]==='torneo' && tournamentSection==='estadisticas' && workspaceBlueprint.blueprint && workspaceBlueprint.categoryId===selectedTournament.category_id" :view="workspaceBlueprint" :competition="workspaceCompetition" :entries="tournamentEntries" :organization-id="user.organizationId!" :category-id="selectedTournament.category_id" :can-manage="canManageTournaments()" @decide-title-extra="decideTitleExtra" @decide-tiebreak="decidePositionTiebreak" />
        <TournamentWorkspace v-else-if="parts[0] === 'torneo'" :tournament="selectedTournament" :categories="tournamentCategories" :entries="tournamentEntries" :days="tournamentDays" :official-match-ids="workspaceOfficialMatchIds" :scores="workspaceScores" :cases="workspaceCases" :stats="workspaceStats" :brackets="workspaceBrackets" :position-blueprint="workspaceBlueprint" :position-competition="workspaceCompetition" :section="tournamentSection" :day-id="parts[3]" :can-manage="canManageTournaments()" :organization-id="user.organizationId!" :csrf-token="user.csrfToken" @refresh="loadView(true)" />
        <template v-if="parts[0] === 'torneo' && tournamentSection === 'ajustes'">
          <div class="tournament-emblem-editor"><img v-if="selectedTournament.has_emblem" :src="`/api/v1/organizations/${user.organizationId}/tournaments/${selectedTournament.id}/emblem`" :alt="`Emblema de ${selectedTournament.name}`"><Icon v-else name="trophy" /><div><strong>Emblema del torneo</strong><input id="tournament-emblem" class="file-input" type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="uploadTournamentEmblem($event,selectedTournament.id)"><label for="tournament-emblem" class="team-shield-action"><Icon name="edit" />{{ selectedTournament.has_emblem ? 'Cambiar' : 'Añadir' }}</label></div></div>
          <details class="optional-section"><summary>Sedes</summary>
          <section class="panel pad stack mt"><h2>Sedes</h2><p v-if="!tournamentResources.venues.length" class="small muted">Todavía no hay sedes asociadas.</p><div v-for="venue in tournamentResources.venues" :key="venue.id" class="team-person"><div><strong>{{ venue.name }}</strong><p v-if="venue.city" class="small muted">{{ venue.city }}</p></div><div v-if="canManageTournaments()" class="team-confirm"><input v-model="resourceReasons[venue.id]" :aria-label="`Motivo para archivar ${venue.name}`" maxlength="300" placeholder="Motivo para archivar"><button type="button" class="btn" :disabled="busy" @click="archiveResource(selectedTournament.id,'venues',venue.id)">Archivar</button></div></div><form v-if="canManageTournaments()" class="stack" @submit.prevent="createVenue(selectedTournament.id)"><div class="field"><label for="new-venue-name">Nombre de la sede</label><input id="new-venue-name" v-model="venueDraft.name" minlength="2" maxlength="120" required></div><div class="field"><label for="new-venue-city">Ciudad <span class="muted">(opcional)</span></label><input id="new-venue-city" v-model="venueDraft.city" maxlength="120"></div><button class="btn primary" :disabled="busy">Agregar sede</button></form></section>
          </details><details class="optional-section"><summary>Patrocinadores</summary>
          <section class="panel pad stack mt"><h2>Patrocinadores</h2><p class="small muted">Cada nombre comienza privado. Solo se publica después de autorización explícita.</p><p v-if="!tournamentResources.sponsors.length" class="small muted">Todavía no hay patrocinadores asociados.</p><div v-for="sponsor in tournamentResources.sponsors" :key="sponsor.id" class="team-person"><div><strong>{{ sponsor.name }}</strong><p class="small muted">{{ sponsor.public_visible ? 'Visible en portal' : 'Privado' }}</p></div><div v-if="canManageTournaments()" class="team-confirm"><input v-model="resourceReasons[sponsor.id]" :aria-label="`Motivo del cambio de ${sponsor.name}`" maxlength="300" placeholder="Motivo de la acción"><button type="button" class="btn" :disabled="busy" @click="setSponsorPublic(selectedTournament.id,sponsor.id,sponsor.public_visible)">{{ sponsor.public_visible ? 'Ocultar' : 'Publicar' }}</button><button type="button" class="btn" :disabled="busy" @click="archiveResource(selectedTournament.id,'sponsors',sponsor.id)">Archivar</button></div></div><form v-if="canManageTournaments()" class="stack" @submit.prevent="createSponsor(selectedTournament.id)"><div class="field"><label for="new-sponsor-name">Nombre del patrocinador</label><input id="new-sponsor-name" v-model="sponsorDraft.name" minlength="2" maxlength="120" required></div><button class="btn primary" :disabled="busy">Agregar patrocinador</button></form></section>
          </details>
        </template>
        <template v-if="parts[0] === 'categoria'">
        <section v-if="hasPositionFormat" class="fixed-competition-format"><h2>Formato de la Copa</h2><div><b>1</b><span>2 grupos de 5 · interserial puntuable</span></div><div><b>2</b><span>4 cuartos · avanzan los ganadores</span></div><div><b>3</b><span>Finales · los cuatro ganadores juegan todos contra todos; orden según la tabla general de la primera etapa</span></div><div><Icon name="chart" /><span>Victoria {{ selectedTournament.rules.points.win }} · Empate {{ selectedTournament.rules.points.draw }} · Derrota {{ selectedTournament.rules.points.loss }}</span></div><div><Icon name="edit" /><span>Desempates: {{ formatTiebreaks(selectedTournament.rules) }}</span></div></section>
        <section class="panel pad stack"><div class="between wrap"><strong>Reglamento v{{ selectedTournament.rule_version }}</strong><span class="badge" :class="selectedTournament.rule_status === 'published' ? 'active' : 'pending'">{{ selectedTournament.rule_status === 'published' ? 'Oficial' : 'Borrador' }}</span></div><p class="small muted">{{ selectedTournament.preset }} · {{ selectedTournament.rules.playersOnField }} en cancha · {{ selectedTournament.rules.periods.map(period => `${period.name} ${period.minutes} min`).join(' · ') }}</p><a class="btn full" :href="`#/torneo/${selectedTournament.id}/fixture`">Fixture<Icon name="arrow" /></a><a v-if="selectedTournament.status === 'published'" class="btn full" :href="`#/publico/${user.organizationId}`">Ver portal público<Icon name="arrow" /></a></section>
        <button v-if="canManageTournaments() && selectedTournament.rule_status === 'draft' && !hasPositionFormat" type="button" class="btn primary full mt" :disabled="busy || !selectedTournament.rules.initialPhase" @click="publishCurrentRules(selectedTournament)">Publicar reglamento y habilitar fixture</button>
        <div v-if="canManageTournaments()&&selectedTournament.rule_status==='draft'&&hasPositionFormat" class="fixed-rules-publish"><label><input v-model="fixedRulesConfirmed" type="checkbox"> Confirmé puntos y desempates</label><button type="button" class="btn primary full" :disabled="busy||!fixedRulesConfirmed" @click="publishFixedRules(selectedTournament)">Publicar reglamento</button></div>
        <button v-if="canManageTournaments()" type="button" class="btn full mt" :aria-expanded="showRuleEditor" @click="showRuleEditor = !showRuleEditor">{{ showRuleEditor ? 'Cerrar edición' : 'Editar reglamento' }}</button>
        <form v-if="showRuleEditor && canManageTournaments() && ruleDrafts[selectedTournament.category_id]" class="panel pad stack mt" @submit.prevent="saveRuleDraft(selectedTournament)">
          <div><h2>{{ selectedTournament.rule_status === 'published' ? 'Preparar nueva versión' : 'Editar borrador' }}</h2><p class="small muted">Al editar una versión oficial se crea un borrador nuevo; la versión pública conserva sus reglas.</p></div>
          <RulesEditor :key="selectedTournament.category_id" v-model="ruleDrafts[selectedTournament.category_id].rules" :disabled="busy" :focus-cards="parts[2]==='tarjetas'" :locked-format="hasPositionFormat" />
          <div class="field"><label for="rules-reason">Motivo del cambio o publicación</label><textarea id="rules-reason" v-model="ruleDrafts[selectedTournament.category_id].reason" minlength="3" maxlength="300" required placeholder="Ej. Reglamento aprobado por la organización"></textarea></div>
          <div class="form-actions"><button type="button" class="btn" :disabled="busy" @click="refreshTournament(selectedTournament)">Actualizar datos</button><button class="btn" :disabled="busy" type="submit">{{ busy ? 'Guardando…' : 'Guardar borrador' }}</button><button v-if="selectedTournament.rule_status === 'draft' && !hasPositionFormat" class="btn primary" :disabled="busy" type="button" @click="beginRulePublication(selectedTournament)">Revisar publicación</button></div>
          <p v-if="!hasPositionFormat" class="small muted">Publicar hace visible el nombre y las reglas deportivas en el portal. La versión publicada no se puede modificar.</p>
        </form>
        <section v-if="canManageTournaments() && publishPreviewCategory === selectedTournament.category_id && selectedTournament.rule_status === 'draft'" id="rule-publish-preview" class="panel pad stack mt" tabindex="-1">
          <h2>Revisar antes de publicar</h2><p class="small muted">{{ selectedTournament.name }} · {{ selectedTournament.edition_name }} · {{ selectedTournament.category_name }}. La versión {{ selectedTournament.rule_version }} quedará fija y aparecerá en el portal.</p>
          <p><strong>Fase:</strong> {{ selectedTournament.rules.initialPhase?.mode === 'league' ? 'Liga' : selectedTournament.rules.initialPhase?.mode === 'groups' ? `${selectedTournament.rules.initialPhase.groupCount} grupos` : selectedTournament.rules.initialPhase?.mode === 'knockout' ? 'Eliminación' : 'Sin definir' }}<template v-if="selectedTournament.rules.initialPhase"> · {{ selectedTournament.rules.initialPhase.mode === 'knockout' && selectedTournament.rules.competitionPlan ? 'formato por ronda' : selectedTournament.rules.initialPhase.legs === 2 ? 'ida y vuelta' : 'una rueda' }}</template>.</p>
          <p><strong>Jugadores:</strong> {{ selectedTournament.rules.playersOnField }} en cancha, {{ selectedTournament.rules.maxBenchPlayers }} en banca, {{ selectedTournament.rules.maxMatchRoster }} en planilla, {{ selectedTournament.rules.maxBenchStaff }} del cuerpo técnico.</p>
          <p><strong>Cambios:</strong> {{ selectedTournament.rules.substitutions?.mode === 'none' ? 'sin cambios' : selectedTournament.rules.substitutions?.mode === 'limited' ? `${selectedTournament.rules.substitutions.maxChanges} permitidos` : 'ilimitados' }}<template v-if="selectedTournament.rules.substitutions?.maxWindows"> · {{ selectedTournament.rules.substitutions.maxWindows }} ventanas</template><template v-if="selectedTournament.rules.substitutions?.reentry"> · con reingreso</template>.</p>
          <p><strong>Edad:</strong> {{ selectedTournament.rules.eligibility?.age ? `${selectedTournament.rules.eligibility.age.minYears ?? 'sin mínimo'}–${selectedTournament.rules.eligibility.age.maxYears ?? 'sin máximo'} años, ${selectedTournament.rules.eligibility.age.reference === 'fixed_date' ? `al ${selectedTournament.rules.eligibility.age.fixedDate}` : 'a fecha de partido'}` : 'sin límite' }}. <strong>Documentos:</strong> {{ selectedTournament.rules.eligibility?.requiredDocuments.length ? selectedTournament.rules.eligibility.requiredDocuments.join(', ') : 'ninguno adicional' }}.</p>
          <p><strong>Tarjetas:</strong> {{ selectedTournament.rules.advanced?.discipline.yellowCards ? 'amarillas' : 'sin amarillas' }} y {{ selectedTournament.rules.advanced?.discipline.redCards ? 'rojas' : 'sin rojas' }}<template v-if="selectedTournament.rules.advanced?.discipline.yellowAccumulation"> · aviso tras {{ selectedTournament.rules.advanced.discipline.yellowAccumulation }} amarillas</template>. <strong>Walkover:</strong> {{ selectedTournament.rules.advanced?.walkover.enabled ? `${selectedTournament.rules.advanced.walkover.winnerGoals}–${selectedTournament.rules.advanced.walkover.loserGoals}` : 'no previsto' }}.</p>
          <p><strong>Períodos:</strong> {{ selectedTournament.rules.periods.map(period => `${period.name} ${period.minutes} min`).join(' · ') }}. <strong>Puntos:</strong> {{ selectedTournament.rules.points.win }}/{{ selectedTournament.rules.points.draw }}/{{ selectedTournament.rules.points.loss }} por victoria/empate/derrota.</p>
          <div><strong>Orden de desempates</strong><p class="small muted">Los puntos totales siempre van primero.</p><ol class="stack"><li v-for="criterion in selectedTournament.rules.advanced?.tiebreakers" :key="criterion">{{ tiebreakerLabels[criterion] }}</li></ol></div>
          <p><strong>Motivo:</strong> {{ ruleDrafts[selectedTournament.category_id].reason }}</p>
          <div class="form-actions"><button type="button" class="btn" @click="publishPreviewCategory = ''">Volver a editar</button><button type="button" class="btn primary" :disabled="busy" @click="publishRules(selectedTournament)">Confirmar publicación</button></div>
        </section>
        </template>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'fixture' && selectedTournament" class="form-page">
        <a :href="`#/torneo/${selectedTournament.id}/fixture`" class="back"><Icon name="back" />Fixture</a>
        <div class="heading"><h1 tabindex="-1">Fixture · {{ selectedTournament.category_name }}</h1><a v-if="fixture.phase?.mode === 'knockout' && fixture.phase.status === 'generated' && canManageTournaments()" class="btn" :href="`#/flyers/${selectedTournament.id}/bracket/${fixture.phase.id}`">Flyer del cuadro</a></div>
        <section class="panel pad stack"><h2>{{ fixture.phase?.status === 'generated' ? 'Cruces preparados' : 'Preparar cruces' }}</h2>
          <div v-if="!fixture.phase" class="stack"><p class="notice neutral">Aún no hay fase de fixture para esta categoría.</p><p class="small muted">{{ fixtureEntries.length }} equipos activos. El reglamento publicado define {{ selectedTournament.rules.initialPhase?.mode === 'groups' ? `${selectedTournament.rules.initialPhase.groupCount} grupos` : selectedTournament.rules.initialPhase?.mode === 'knockout' ? 'eliminación' : 'liga' }} · {{ selectedTournament.rules.initialPhase?.legs === 2 ? 'ida y vuelta' : 'una rueda' }}.</p><button v-if="canManageTournaments() && selectedTournament.rule_status === 'published'" type="button" class="btn primary full" :disabled="busy" @click="createFixturePhase">Crear fase privada</button><p v-else-if="selectedTournament.rule_status !== 'published'" class="notice amber">Publicá primero el reglamento de la categoría.</p></div>
          <div v-else-if="fixture.phase.status === 'draft'" class="stack"><p class="notice neutral">Reglamento v{{ fixture.phase.rule_version }} · {{ fixtureEntries.length }} equipos activos.</p><template v-if="fixtureNeedsSeeds"><div class="between"><h3>Orden de posiciones</h3><button type="button" class="btn" @click="fixtureSeedOrder=[]">Reiniciar</button></div><div class="seed-list"><button v-for="entry in fixtureEntries" :key="entry.entry_id" type="button" class="seed-row" :disabled="fixtureSeedOrder.includes(entry.entry_id)" @click="fixtureSeedOrder.push(entry.entry_id)"><span>{{ fixtureSeedOrder.includes(entry.entry_id) ? fixtureSeedOrder.indexOf(entry.entry_id)+1 : '＋' }}</span><strong>{{ entry.name }}</strong></button></div></template><div v-else v-for="entry in fixtureEntries" :key="entry.entry_id" class="team-person"><strong>{{ entry.name }}</strong></div><p v-if="fixtureEntries.length < 2 || (fixture.phase.mode === 'groups' && fixtureEntries.length < (fixture.phase.group_count || 0) * 2)" class="notice amber">Hacen falta más equipos activos para el formato elegido.</p><button v-if="canManageTournaments()" type="button" class="btn primary full" :disabled="busy || fixtureEntries.length < 2 || (fixture.phase.mode === 'groups' && fixtureEntries.length < (fixture.phase.group_count || 0) * 2) || (fixtureNeedsSeeds && fixtureSeedOrder.length !== fixtureEntries.length)" @click="generateFixture">Generar cruces privados</button></div>
          <div v-else class="notice neutral">Reglamento v{{ fixture.phase.rule_version }} · Cruces privados hasta publicar la Fecha.</div>
        </section>
        <section v-if="fixture.phase?.status === 'generated' && canManageTournaments() && (fixture.phase.mode === 'knockout' || selectedTournament.rules.competitionPlan)" class="panel pad stack mt">
          <h2>Avanzar el cuadro</h2>
          <div v-if="fixtureTie?.categoryId===selectedTournament.category_id" class="stack notice amber"><strong>Desempate de mejores restantes</strong><p>Elegí el orden de los equipos empatados. El motivo quedará en auditoría.</p><div class="choices" role="group" aria-label="Orden manual de clasificados"><button v-for="candidate in fixtureTie.candidates" :key="candidate.entryId" type="button" class="choice" :disabled="fixtureTie.order.includes(candidate.entryId)" @click="fixtureTie.order.push(candidate.entryId)">{{ fixtureTie.order.includes(candidate.entryId) ? fixtureTie.order.indexOf(candidate.entryId)+1 + '. ' : '' }}{{ candidate.name }}</button></div><button type="button" class="btn" @click="fixtureTie.order=[]">Reiniciar orden</button><button type="button" class="btn" @click="fixtureTie=null">Volver a comprobar la tabla</button></div>
          <div class="field"><label for="fixture-advance-reason">Motivo</label><input id="fixture-advance-reason" v-model="fixtureAdvanceReason" minlength="3" maxlength="300" placeholder="Ej. Clasificados de la fase oficial"></div>
          <button type="button" class="btn primary full" :disabled="busy || fixtureAdvanceReason.trim().length < 3 || (fixtureTie?.categoryId===selectedTournament.category_id && fixtureTie.order.length!==fixtureTie.candidates.length)" @click="advanceFixture">{{ fixtureTie?.categoryId===selectedTournament.category_id ? 'Confirmar orden y preparar ronda' : 'Comprobar actas y preparar siguiente ronda' }}</button>
        </section>
        <section v-if="fixture.phase?.status === 'generated'" class="stack mt"><div class="between wrap"><h2>Fechas de {{ selectedTournament.edition_name }}</h2><button v-if="canManageTournaments()" type="button" class="btn" :disabled="busy" @click="createMatchday">Agregar Fecha {{ Math.max(0, ...matchdays.map(day => day.ordinal)) + 1 }}</button></div><p v-if="!matchdays.length" class="notice neutral">Creá la primera Fecha para programar los cruces.</p><div v-for="day in matchdays" :key="day.id" class="panel pad stack"><div class="between wrap"><h3>Fecha {{ day.ordinal }}</h3><span class="badge" :class="day.status === 'published' ? 'active' : 'pending'">{{ day.status === 'published' ? 'Publicada' : 'Privada' }}</span></div><p v-if="!day.matches.length" class="small muted">Todavía sin partidos.</p><div v-for="match in day.matches" :key="match.id" class="team-person"><div><strong>{{ match.home_name }} vs {{ match.away_name }}</strong><p class="small muted">{{ match.category_name }} · {{ match.match_date }} {{ match.match_time }} · {{ match.venue_name }} / {{ match.court_label }}</p></div></div><button v-if="canManageTournaments() && day.status === 'draft'" type="button" class="btn full" :disabled="busy" @click="previewMatchday(day.id)">Revisar publicación</button><div v-if="matchdayPreview?.id === day.id" class="stack"><div v-if="matchdayPreview.missing.length" class="notice amber" role="alert"><p v-for="item in matchdayPreview.missing" :key="item">{{ item }}</p></div><div v-else class="notice neutral">{{ matchdayPreview.snapshot.length }} partidos listos para publicar.</div><div class="field"><label for="matchday-publish-reason">Motivo de publicación</label><input id="matchday-publish-reason" v-model="matchdayPublishReason" minlength="3" maxlength="300" placeholder="Ej. Horarios confirmados"></div><button type="button" class="btn primary full" :disabled="busy || !!matchdayPreview.missing.length || matchdayPublishReason.trim().length < 3" @click="publishMatchday">Confirmar publicación</button></div></div></section>
        <section v-if="fixture.groups.length" class="stack mt"><h2>Grupos</h2><div v-for="groupNo in [...new Set(fixture.groups.map(group => group.group_no))]" :key="groupNo" class="panel pad stack"><h3>Grupo {{ groupNo }}</h3><p v-for="entry in fixture.groups.filter(group => group.group_no === groupNo)" :key="entry.entry_id">{{ entry.team_name }}</p></div></section>
        <section v-if="fixture.bracket.length" class="stack mt"><h2>Cuadro de eliminación</h2><BracketView :rounds="privateBracketRounds" /></section>
        <section v-if="remainingCompetitionRounds.length" class="stack mt"><h2>{{ fixture.bracket.length ? 'Rondas pendientes del plan' : 'Camino al título planificado' }}</h2><p class="small muted">{{ selectedTournament.rules.competitionPlan?.qualification.from === 'groups' ? 'Los puestos de cada grupo alimentarán este cuadro al cerrar la clasificación oficial.' : selectedTournament.rules.competitionPlan?.qualification.from === 'league' ? 'Los puestos de liga alimentarán este cuadro al cerrar la clasificación oficial.' : 'Las plazas se confirmarán antes de cada sorteo.' }}</p><BracketView :rounds="remainingCompetitionRounds" planned /></section>
        <section v-if="fixture.rounds.length" class="stack mt"><h2>Rondas generadas</h2><div v-for="round in fixture.rounds" :key="round.id" class="panel pad stack"><h3>{{ fixture.phase?.mode === 'groups' ? `Grupo ${round.group_no} · ` : '' }}Ronda {{ round.ordinal }} · {{ round.leg === 2 ? 'vuelta' : 'ida' }}</h3><div v-for="match in round.matches" :key="match.id" class="team-person"><div><strong>{{ match.home_name }} vs {{ match.away_name }}</strong><p class="small muted">{{ matchdays.flatMap(day => day.matches).find(item => item.id === match.id)?.match_date || match.match_date || 'Sin fecha' }}<template v-if="matchdays.flatMap(day => day.matches).find(item => item.id === match.id)"> · {{ matchdays.flatMap(day => day.matches).find(item => item.id === match.id)?.match_time }} · Fecha {{ matchdays.find(day => day.matches.some(item => item.id === match.id))?.ordinal }}</template></p></div><a v-if="canManageTournaments()" class="btn" :href="`#/programar/${selectedTournament.category_id}/${match.id}`">{{ matchdays.some(day => day.matches.some(item => item.id === match.id)) ? 'Reprogramar' : 'Programar' }}</a><a v-if="canManageTournaments() && matchdays.some(day => day.status === 'published' && day.matches.some(item => item.id === match.id))" class="btn primary" :href="`#/partido/${selectedTournament.category_id}/${match.id}`">Completar partido</a><button v-if="canManageTournaments()" type="button" class="btn" @click="beginMatchCorrection(match)">Cambiar equipos</button></div><p v-for="bye in round.byes" :key="bye.entry_id" class="small muted">Descansa: {{ bye.team_name }}</p></div></section>
        <form v-if="manualMatchId && canManageTournaments()" class="manual-match-editor" @submit.prevent="saveMatchCorrection"><div class="between"><h3>Cambiar equipos del partido</h3><button type="button" class="btn" @click="manualMatchId=''">Cerrar</button></div><div class="form-grid"><div><span class="label">Local</span><div class="choices grid mt"><button v-for="team in fixtureEntries" :key="`home-${team.entry_id}`" type="button" class="choice" :aria-pressed="manualMatchDraft.homeEntryId===team.entry_id" @click="manualMatchDraft.homeEntryId=team.entry_id">{{ team.name }}</button></div></div><div><span class="label">Visitante</span><div class="choices grid mt"><button v-for="team in fixtureEntries" :key="`away-${team.entry_id}`" type="button" class="choice" :aria-pressed="manualMatchDraft.awayEntryId===team.entry_id" @click="manualMatchDraft.awayEntryId=team.entry_id">{{ team.name }}</button></div></div></div><div class="field"><label for="manual-match-reason">Motivo del cambio</label><input id="manual-match-reason" v-model="manualMatchDraft.reason" minlength="3" maxlength="300" required></div><button class="btn primary full" :disabled="busy || !manualMatchDraft.homeEntryId || !manualMatchDraft.awayEntryId || manualMatchDraft.homeEntryId===manualMatchDraft.awayEntryId">Guardar cambio</button></form>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'mis-partidos'" class="form-page">
        <div class="heading"><h1 tabindex="-1">Partidos asignados</h1><button type="button" class="btn" :disabled="loading" @click="loadMatchAssignments">Actualizar</button></div>
        <p v-if="!matchAssignments.length" class="notice neutral">Todavía no tenés partidos asignados.</p>
        <div v-for="item in matchAssignments" :key="item.id" class="panel pad stack mt"><strong>{{ item.home_name }} vs {{ item.away_name }}</strong><p class="small muted">{{ item.day_ordinal===null?'Fecha pendiente':`Fecha ${item.day_ordinal}` }} · {{ item.duty==='capture'?'Captura':'Revisión' }} · {{ item.name }}</p><a class="btn primary full" :href="`#/partido/${item.category_id}/${item.match_id}`">Abrir partido</a></div>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'partido'" class="form-page">
        <a :href="canManageTournaments() && selectedTournament ? `#/torneo/${selectedTournament.id}/partidos` : '#/mis-partidos'" class="back"><Icon name="back" />Partidos</a>
        <div class="heading match-top-actions"><h1 tabindex="-1" class="sr-only">Partido</h1><a v-if="selectedTournament && canManageTournaments() && capture" class="btn" :href="`#/flyers/${selectedTournament.id}/${capture.status === 'official' ? 'result' : 'match'}/${parts[2]}`"><Icon name="file" />{{ capture.status === 'official' ? 'Flyer del resultado' : 'Flyer del partido' }}</a></div>
        <section v-if="!capture && capturePreview" class="match-preview"><div class="match-hero" aria-label="Partido programado"><div class="match-hero-status">Jornada {{ capturePreview.day.ordinal }} · {{ capturePreview.day.status==='published'?'Publicada':'Sin publicar' }}</div><div class="match-hero-main"><div class="match-hero-team"><img v-if="capturePreview.match.home_has_shield" class="match-hero-shield" :src="`/api/v1/organizations/${user.organizationId}/teams/${capturePreview.match.home_team_id}/shield`" alt=""><span v-else class="match-hero-shield placeholder">{{ initials(capturePreview.match.home_name) }}</span><strong>{{ capturePreview.match.home_name }}</strong></div><div class="match-hero-score"><b aria-label="Marcador pendiente">–<span>:</span>–</b></div><div class="match-hero-team"><img v-if="capturePreview.match.away_has_shield" class="match-hero-shield" :src="`/api/v1/organizations/${user.organizationId}/teams/${capturePreview.match.away_team_id}/shield`" alt=""><span v-else class="match-hero-shield placeholder">{{ initials(capturePreview.match.away_name) }}</span><strong>{{ capturePreview.match.away_name }}</strong></div></div><p>{{ capturePreview.match.match_date || 'Día por definir' }}{{ capturePreview.match.match_time ? ` · ${capturePreview.match.match_time}` : '' }}{{ capturePreview.match.venue_name ? ` · ${capturePreview.match.venue_name}` : '' }}</p></div><button v-if="!capturePreview.match.acta_status && !captureStartBlocked && canCaptureMatch" type="button" class="btn primary full" :disabled="busy" @click="startCapture">{{ capturePreview.day.status==='draft'?'Publicar jornada y cargar partido':'Cargar partido' }}</button><a v-if="selectedTournament && canManageTournaments()" class="btn match-preview-edit" :href="`#/torneo/${selectedTournament.id}/fixture/${capturePreview.day.id}/${capturePreview.match.id}`"><Icon name="edit" />Editar en Fixture</a></section>
        <section v-else-if="!capture && canCaptureMatch && !captureStartBlocked && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(parts[2]||'')" class="stack"><button type="button" class="btn primary full" :disabled="busy" @click="startCapture">Abrir partido para cargar</button></section>
        <section v-else-if="!capture && matchAssignments.some(item=>item.match_id===parts[2]&&item.day_status!=='published')" class="notice neutral">La jornada todavía no está publicada. El organizador puede habilitarla desde el partido.</section>
        <section v-else-if="!capture" class="notice neutral">Este partido todavía no tiene carga abierta. El planillero asignado puede iniciarla.</section>
        <template v-else>
          <section class="match-hero" aria-label="Resultado del partido"><div class="match-hero-status">{{ capture.status==='official'?'Resultado oficial':capture.status==='submitted'?'En revisión':'Resultado en borrador' }}</div><div class="match-hero-main"><div class="match-hero-team"><img v-if="capture.home.hasShield" class="match-hero-shield" :src="`/api/v1/organizations/${user.organizationId}/teams/${capture.home.teamId}/shield`" :alt="`Escudo de ${capture.home.name}`"><span v-else class="match-hero-shield placeholder" :style="{background:capture.home.color}">{{ initials(capture.home.name) }}</span><strong>{{ capture.home.name }}</strong></div><div class="match-hero-score"><b aria-label="Marcador">{{ capture.score.home }}<span>:</span>{{ capture.score.away }}</b><small v-if="capture.shootout.home || capture.shootout.away">Penales {{ capture.shootout.home }} : {{ capture.shootout.away }}</small></div><div class="match-hero-team"><img v-if="capture.away.hasShield" class="match-hero-shield" :src="`/api/v1/organizations/${user.organizationId}/teams/${capture.away.teamId}/shield`" :alt="`Escudo de ${capture.away.name}`"><span v-else class="match-hero-shield placeholder" :style="{background:capture.away.color}">{{ initials(capture.away.name) }}</span><strong>{{ capture.away.name }}</strong></div></div><div v-if="matchGoals('home').length||matchGoals('away').length" class="match-hero-goals"><div><span v-for="goal in matchGoals('home')" :key="goal.id"><SportEventMark :kind="goal.kind" />{{ goal.name }} <small>{{ goal.period||'' }}</small></span></div><div><span v-for="goal in matchGoals('away')" :key="goal.id"><SportEventMark :kind="goal.kind" />{{ goal.name }} <small>{{ goal.period||'' }}</small></span></div></div><p v-for="warning in capture.warnings||[]" :key="warning" class="notice amber">{{ warning }}</p></section>
          <SportTabs v-model="matchTab" :tabs="[{key:'events',label:'Eventos',icon:'ball'},{key:'players',label:'Jugadores',icon:'users'},...(canManageTournaments()||canReviewMatch?[{key:'management',label:'Gestión',icon:'file'}]:[])]" id="partido" />
          <div v-if="matchTab==='events'" id="partido-events-panel" role="tabpanel" aria-labelledby="partido-events-tab">
          <section v-if="queuedCapture.length || queueError" class="notice amber mt" role="status"><p>{{ queuedCapture.length }} evento(s) solo en este dispositivo. {{ queueError }}</p><button v-if="queuedCapture.length" type="button" class="btn" :disabled="busy || !online" @click="syncCaptureQueue">Sincronizar ahora</button></section>
          <section v-if="capture.status==='capturing' && canCaptureMatch" id="capture-add-event" class="panel pad stack mt"><h2>Agregar evento</h2>
            <div><span class="label">Equipo</span><div class="choices grid mt capture-team-list" role="group" aria-label="Equipo del evento"><button v-for="team in [capture.home, capture.away]" :key="team.entryId" type="button" class="choice capture-team" :aria-pressed="captureTeamId === team.entryId" @click="captureTeamId = team.entryId"><img v-if="team.hasShield" class="team-public-shield" :src="`/api/v1/organizations/${user.organizationId}/teams/${team.teamId}/shield`" :alt="`Escudo de ${team.name}`"><span v-else class="team-mark" :style="{ background: team.color }" aria-hidden="true">{{ initials(team.name) }}</span><span>{{ team.name }}</span></button></div></div>
            <div><span class="label">Tiempo</span><div class="choices grid mt" role="group" aria-label="Tiempo del evento"><button type="button" class="choice" :aria-pressed="capturePeriod === null" @click="capturePeriod = null">Sin tiempo</button><button v-for="(period, index) in capture.periods" :key="index" type="button" class="choice" :aria-label="period" :aria-pressed="capturePeriod === matchPeriodCodes[index]" @click="capturePeriod = matchPeriodCodes[index]">{{ matchPeriodCodes[index] }}{{ index > 2 ? ' · ' + period : '' }}</button></div></div>
            <div><span class="label">Qué pasó</span><div class="choices grid mt capture-kind-list" role="group" aria-label="Tipo de evento"><button v-for="kind in captureKinds.filter(item=>capture?.allowedKinds.includes(item.value))" :key="kind.value" type="button" class="choice" :aria-pressed="captureKind === kind.value" @click="captureKind = kind.value"><SportEventMark :kind="kind.value" :color="kind.value==='custom_card'?'#2988c9':undefined" />{{ kind.label }}</button></div></div>
            <div v-if="captureKind==='custom_card'" class="choices grid" role="group" aria-label="Tarjeta configurada"><button v-for="card in capture.customCards" :key="card.code" type="button" class="choice" :aria-pressed="captureCardCode===card.code" @click="captureCardCode=card.code"><span class="card-swatch" :style="{background:card.color}"></span>{{ card.label }}</button></div>
            <p v-if="captureKind === 'own_goal'" class="small muted">Elegí el equipo del jugador que hizo el autogol; se suma al rival.</p>
            <details class="optional-section"><summary>Minuto opcional</summary><div class="field mt"><label for="capture-minute">Minuto</label><input id="capture-minute" v-model="captureMinute" type="number" inputmode="numeric" min="0" max="200" placeholder="Sin minuto"></div></details>
            <div v-if="captureKind==='substitution'" class="stack"><p class="small muted">Tocá al jugador que sale. Antes elegí quién entra.</p><div class="choices grid" role="group" aria-label="Jugador que entra"><button v-for="player in capturePlayers" :key="player.registrationId" type="button" class="choice" :aria-pressed="captureRelatedRegistrationId===player.registrationId" @click="captureRelatedRegistrationId=player.registrationId">Entra {{ player.name }}</button></div></div>
            <div v-if="captureKind==='incident'" class="field"><label for="capture-incident">Qué ocurrió</label><textarea id="capture-incident" v-model="captureIncidentNote" minlength="3" maxlength="500" placeholder="Describí la incidencia"></textarea></div>
            <div><h3>{{ captureKind==='substitution'?'Jugador que sale':'Jugador' }}</h3><div class="stack"><button v-for="player in capturePlayers" :key="player.registrationId" type="button" class="category-choice" :disabled="busy || (captureKind==='substitution' && (!captureRelatedRegistrationId)) || (captureKind==='custom_card' && !captureCardCode) || (captureKind==='incident' && captureIncidentNote.trim().length<3)" @click="addCaptureEvent(player.registrationId)"><strong>{{ player.shirtNumber !== null ? `#${player.shirtNumber} · ` : '' }}{{ player.name }}</strong><span>Agregar {{ captureKind==='custom_card' ? capture.customCards.find(card=>card.code===captureCardCode)?.label || 'tarjeta' : captureKinds.find(kind => kind.value === captureKind)?.label.toLowerCase() }}</span></button></div><button v-if="['goal','penalty','penalty_miss','own_goal','shootout_goal','shootout_miss','incident'].includes(captureKind)" type="button" class="btn full mt" :disabled="busy || (captureKind==='incident' && captureIncidentNote.trim().length<3)" @click="addCaptureEvent(null)">{{ captureKind==='incident'?'Registrar incidencia':'Registrar sin autor identificado' }}</button></div>
          </section>
          <section class="stack mt"><p v-if="!activeCaptureEvents?.length" class="small muted">Todavía no hay eventos.</p><div v-for="event in activeCaptureEvents || []" :key="event.id" class="sport-event-row"><SportEventMark :kind="event.kind" :color="event.kind==='custom_card'?capture.customCards.find(card=>card.code===event.cardCode)?.color:undefined" /><div><strong>{{ capturePlayerName(event.registrationId) }}</strong><small>{{ captureEventLabel(event,capture) }} · {{ event.period || 'Sin tiempo' }}{{ event.minute === null ? '' : ` · ${event.minute} min` }}<template v-if="event.kind==='substitution'"> · entra {{ capturePlayerName(event.relatedRegistrationId) }}</template></small></div><div v-if="capture.status==='capturing' && canCaptureMatch" class="workspace-actions"><button type="button" class="btn" :disabled="busy" @click="correctCaptureEvent(event,true)">Editar</button><button type="button" class="btn" :disabled="busy" @click="correctCaptureEvent(event)">Eliminar</button></div></div></section>
          </div>
          <section v-if="matchTab==='players'" id="partido-players-panel" role="tabpanel" aria-labelledby="partido-players-tab" class="match-players"><div v-for="team in [capture.home,capture.away]" :key="team.entryId"><h2><img v-if="team.hasShield" class="team-public-shield" :src="`/api/v1/organizations/${user.organizationId}/teams/${team.teamId}/shield`" :alt="`Escudo de ${team.name}`"><span v-else class="team-dot" :style="{background:team.color}"></span>{{ team.name }}</h2><p v-if="!team.players.length" class="empty-list">Sin jugadores cargados.</p><div v-for="player in team.players" :key="player.registrationId" class="match-player-row"><b>{{ player.shirtNumber ?? '—' }}</b><span>{{ player.name }}</span></div></div></section>
          <div v-if="matchTab==='management'" id="partido-management-panel" role="tabpanel" aria-labelledby="partido-management-tab">
          <div v-if="canReviewMatch" class="action-grid mt"><button v-if="capture.status==='capturing' || capture.status==='submitted'" type="button" class="btn primary full" :disabled="busy || !!queuedCapture.length" @click="publishCaptureResult">Publicar resultado</button></div><details class="match-more mt"><summary>Revisión e historial</summary><section class="panel pad stack mt"><h2>Acta y revisión</h2><div class="field"><label for="acta-reason">Motivo o constancia</label><textarea id="acta-reason" v-model="actaReason" minlength="3" maxlength="300" placeholder="Ej. Resultado verificado con planilla"></textarea></div><label v-if="capture.status==='submitted' && canReviewMatch" class="row"><input v-model="overrideSignoffs" type="checkbox"> Aprobar sin ambas conformidades, con motivo registrado</label><div class="action-grid"><button v-if="capture.status==='capturing' && canCaptureMatch" type="button" class="btn primary" :disabled="busy || !!queuedCapture.length || actaReason.trim().length<3" @click="actaAction('submit')">Enviar acta</button><button v-if="capture.status==='submitted' && canReviewMatch" type="button" class="btn primary" :disabled="busy || actaReason.trim().length<3" @click="actaAction('approve')">Aprobar resultado</button><button v-if="capture.status==='submitted' && canReviewMatch" type="button" class="btn" :disabled="busy || actaReason.trim().length<3" @click="actaAction('reject')">Devolver</button><button v-if="capture.status==='official' && canReviewMatch" type="button" class="btn" :disabled="busy || actaReason.trim().length<3" @click="actaAction('reopen')">Rectificar acta</button></div><p v-if="capture.status==='submitted'" class="small muted">Los administradores de ambos equipos pueden dejar su conformidad. El revisor puede aprobar de forma excepcional con motivo.</p><div v-for="item in captureHistory" :key="item.id" class="team-person"><div><strong>Versión {{ item.version }} · {{ item.kind }}</strong><p class="small muted">{{ item.reason }} · {{ item.actor }}<template v-if="item.kind==='submitted'"> · {{ item.signoffs }} conformidades</template></p></div></div></section></details>
        <details v-if="canManageTournaments()" class="match-more mt"><summary>Planilleros y revisores</summary><section class="panel pad stack mt"><h2>Planilleros y revisores</h2><div v-for="item in matchAssignments.filter(row=>row.match_id===parts[2])" :key="item.id" class="team-person"><div><strong>{{ item.name }} · {{ item.duty==='capture'?'Captura':'Revisión' }}</strong><p class="small muted">Asignación activa</p></div><div class="field"><label :for="`revoke-${item.id}`">Motivo de revocación</label><input :id="`revoke-${item.id}`" v-model="assignmentReasons[item.id]" minlength="3" maxlength="300"><button type="button" class="btn" :disabled="busy || !assignmentReasons[item.id] || assignmentReasons[item.id].trim().length<3" @click="revokeMatchAssignment(item.id)">Revocar</button></div></div><div class="field"><label for="assignment-person">Persona activa</label><select id="assignment-person" v-model="assignmentDraft.membershipId"><option value="">Elegí una persona</option><option v-for="item in operators.filter(row=>row.status==='active')" :key="item.id" :value="item.id">{{ item.name }}</option></select></div><div class="choices" role="group" aria-label="Función"><button type="button" class="choice" :aria-pressed="assignmentDraft.duty==='capture'" @click="assignmentDraft.duty='capture'">Captura</button><button type="button" class="choice" :aria-pressed="assignmentDraft.duty==='review'" @click="assignmentDraft.duty='review'">Revisión</button></div><div class="field"><label for="assignment-reason">Motivo</label><input id="assignment-reason" v-model="assignmentDraft.reason" minlength="3" maxlength="300"></div><button type="button" class="btn full" :disabled="busy || !assignmentDraft.membershipId || assignmentDraft.reason.trim().length<3" @click="assignMatch">Asignar a este partido</button><h3>Crear planillero</h3><div class="field"><label for="operator-name">Nombre</label><input id="operator-name" v-model="operatorDraft.name" minlength="2" maxlength="120"></div><div class="field"><label for="operator-user">Usuario</label><input id="operator-user" v-model="operatorDraft.username" minlength="3" maxlength="160"></div><button type="button" class="btn full" :disabled="busy || operatorDraft.name.trim().length<2 || operatorDraft.username.trim().length<3" @click="createOperator">Crear e invitar</button><div v-if="operatorInvitation" class="field"><label for="operator-link">Enlace de invitación, entrega manual</label><input id="operator-link" :value="operatorInvitation.url" readonly @focus="($event.target as HTMLInputElement).select()"></div></section></details>
          </div>
        </template>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'programar' && selectedTournament && scheduledMatch && canManageTournaments()" class="form-page">
        <a :href="`#/fixture/${selectedTournament.category_id}`" class="back"><Icon name="back" />Cruces de {{ selectedTournament.category_name }}</a>
        <div class="heading"><div><h1 tabindex="-1">{{ scheduledDetails ? 'Reprogramar partido' : 'Programar partido' }}</h1><p>{{ scheduledMatch.home_name }} vs {{ scheduledMatch.away_name }}</p></div></div>
        <form class="panel pad stack" @submit.prevent="previewSchedule">
          <p class="small muted">Ronda y equipos permanecen iguales. Se guardará el motivo y el horario anterior.</p>
          <div><span class="label">Fecha de la edición</span><div v-if="matchdays.length" class="choices mt" role="group" aria-label="Fecha de la edición"><button v-for="day in matchdays" :key="day.id" type="button" class="choice" :aria-pressed="scheduleDraft.matchdayId === day.id" @click="scheduleDraft.matchdayId = day.id">Fecha {{ day.ordinal }}{{ day.status === 'published' ? ' · pública' : '' }}</button></div><p v-else class="notice amber mt">Creá una Fecha desde los cruces antes de programar.</p></div>
          <div><span class="label">Lugar</span><div v-if="tournamentResources.venues.length" class="choices mt" role="group" aria-label="Lugar"><button v-for="venue in tournamentResources.venues" :key="venue.id" type="button" class="choice" :aria-pressed="scheduleDraft.venueId === venue.id" @click="scheduleDraft.venueId = venue.id">{{ venue.name }}</button></div><p v-else class="notice amber mt">Agregá un lugar en el torneo antes de programar. <a :href="`#/torneo/${selectedTournament.id}`">Abrir torneo</a></p></div>
          <div class="form-grid"><div class="field"><label for="schedule-court">Cancha dentro del lugar <span class="muted">(opcional)</span></label><input id="schedule-court" v-model="scheduleDraft.courtLabel" maxlength="80" placeholder="Solo si hay varias"></div><div class="field"><label for="schedule-date">Día</label><input id="schedule-date" v-model="scheduleDraft.date" type="date" required></div><div class="field"><label for="schedule-time">Hora</label><input id="schedule-time" v-model="scheduleDraft.time" type="time" required></div><div class="field"><label for="schedule-duration">Duración estimada (minutos)</label><input id="schedule-duration" v-model.number="scheduleDraft.durationMinutes" type="number" inputmode="numeric" min="15" max="240" required></div></div>
          <div class="stack"><span class="label">Árbitro <span class="muted">(opcional)</span></span><div class="choices" role="group" aria-label="Árbitro asignado"><button type="button" class="choice" :aria-pressed="!scheduleDraft.refereeId && !scheduleDraft.refereeName" @click="scheduleDraft.refereeId='';scheduleDraft.refereeName='';schedulePreview=null">Sin árbitro</button><button v-for="referee in referees.filter(row=>!row.archived_at || row.id===scheduleDraft.refereeId)" :key="referee.id" type="button" class="choice" :aria-pressed="scheduleDraft.refereeId===referee.id" @click="scheduleDraft.refereeId=referee.id;scheduleDraft.refereeName=referee.name;schedulePreview=null">{{ referee.name }}{{ referee.archived_at?' · archivado':'' }}</button></div><div class="form-grid"><div class="field"><label for="new-schedule-referee">Nuevo árbitro</label><input id="new-schedule-referee" v-model="newRefereeName" maxlength="120" placeholder="Nombre y apellido"></div><button type="button" class="btn" :disabled="busy||newRefereeName.trim().length<2" @click="addReferee">Guardar árbitro</button></div><div v-if="scheduleDraft.refereeName && !scheduleDraft.refereeId" class="field"><label for="schedule-referee">Nombre previo sin catálogo</label><input id="schedule-referee" v-model="scheduleDraft.refereeName" maxlength="120" @input="schedulePreview=null"></div></div>
          <div v-if="scheduleDraft.refereeId && referees.some(row=>row.id===scheduleDraft.refereeId&&!row.archived_at)" class="field"><label for="referee-archive-reason">Archivar este árbitro del catálogo</label><input id="referee-archive-reason" v-model="refereeArchiveReason" minlength="3" maxlength="300" placeholder="Motivo del archivo" @keydown.enter.prevent="archiveReferee"><button type="button" class="btn" :disabled="busy||refereeArchiveReason.trim().length<3" @click="archiveReferee">Archivar árbitro</button></div>
          <div class="field"><label for="schedule-reason">Motivo</label><input id="schedule-reason" v-model="scheduleDraft.reason" minlength="3" maxlength="300" required placeholder="Ej. Horario acordado por los equipos"></div>
          <button class="btn primary full" :disabled="busy || !scheduleDraft.matchdayId || !scheduleDraft.venueId">Revisar horario y conflictos</button>
          <div v-if="schedulePreview" class="stack" role="status"><p v-if="schedulePreview.canSave" class="notice neutral">Horario disponible. {{ schedulePreview.warnings.length ? 'Revisá la advertencia antes de guardar.' : 'No se detectaron conflictos.' }}</p><p v-for="item in schedulePreview.conflicts" :key="item" class="notice error">{{ item }}</p><p v-for="item in schedulePreview.warnings" :key="item" class="notice amber">{{ item }}</p><button type="button" class="btn primary full" :disabled="busy || !schedulePreview.canSave || schedulePreviewKey !== JSON.stringify(schedulePayload())" @click="saveSchedule">Guardar {{ scheduledDetails ? 'reprogramación' : 'horario' }}</button></div>
        </form>
      </div>

      <template v-else-if="!user.platformAdmin && parts[0] === 'equipos' && user.organizationId">
        <a v-if="selectedTournament" :href="`#/torneo/${selectedTournament.id}`" class="back"><Icon name="back" />{{ selectedTournament.name }}</a>
        <div class="heading"><div><h1 tabindex="-1">{{ canManageTournaments() ? 'Equipos' : 'Mi equipo' }}</h1><p>{{ selectedTournament?.name || currentOrgName }}</p></div><a v-if="canManageTournaments() && selectedTournament" :href="`#/nuevo-equipo/${selectedTournament.id}`" class="btn primary"><Icon name="plus" />Crear</a></div>
        <div v-if="canManageTournaments() && !selectedTournament" class="notice neutral">Elegí un torneo para ver sus equipos. <a href="#/torneos">Ir a torneos</a></div>
        <div v-else-if="!scopedTeams.length && !loading" class="empty-list">Todavía no hay equipos en este torneo.</div>
        <div v-else class="directory-list"><a v-for="entry in scopedTeams" :key="entry.entry_id" :href="`#/equipo/${entry.id}`"><span class="team-mark" :style="{ background: entry.color }">{{ initials(entry.name) }}</span><span class="grow"><strong>{{ entry.name }}</strong><small>{{ entry.category_name }}</small></span><Icon name="arrow" /></a></div>
      </template>

      <div v-else-if="!user.platformAdmin && parts[0] === 'nuevo-equipo' && user.organizationId && canManageTournaments()" class="form-page">
        <a :href="selectedTournament ? `#/torneo/${selectedTournament.id}/equipos` : '#/torneos'" class="back"><Icon name="back" />Equipos</a><div class="heading"><h1 tabindex="-1">Crear equipo</h1></div>
        <form class="panel pad stack" @submit.prevent="createTeam">
          <div class="field"><label for="new-team-name">Nombre del equipo</label><input id="new-team-name" v-model="teamDraft.name" minlength="2" maxlength="120" required placeholder="Ej. Deportivo Central"></div>
          <div class="field"><span class="label">Escudo (opcional)</span><input id="new-team-shield" ref="teamDraftShieldInput" class="file-input" type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="pickTeamDraftShield"><div class="team-shield-picker"><label for="new-team-shield" class="btn"><Icon name="plus" />{{ teamDraftShield?.name || 'Añadir escudo' }}</label><button v-if="teamDraftShield" type="button" class="text-action" @click="clearTeamDraftShield">Quitar</button></div></div>
          <div><span class="label">Color de referencia</span><div class="color-options mt" role="group" aria-label="Color del equipo"><button v-for="color in palettes" :key="color" type="button" class="color-button" :aria-label="`Color ${color}`" :aria-pressed="teamDraft.color === color" @click="teamDraft.color = color"><span :style="{ background: color, color: textOnColor(color) }"><Icon v-if="teamDraft.color === color" name="check" /></span></button><label class="color-custom">Otro <input v-model="teamDraft.color" type="color" aria-label="Otro color del equipo"></label></div></div>
          <div><span class="label">Categoría inicial</span><div v-if="scopedCategories.length" class="stack mt" role="group" aria-label="Elegir categoría"><button v-for="category in scopedCategories" :key="category.id" type="button" class="category-choice" :aria-pressed="teamDraft.categoryId === category.id" @click="teamDraft.categoryId = category.id"><strong>{{ category.category_name }}</strong></button></div><div v-else class="notice amber mt">Creá una categoría para este torneo.</div></div>
          <div class="form-actions"><button class="btn primary" :disabled="busy || !scopedCategories.length">{{ busy ? 'Guardando…' : 'Crear equipo' }}</button></div>
        </form>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'equipo' && selectedTeamEntries.length" class="form-page">
        <a :href="selectedTeamTournamentId ? `#/torneo/${selectedTeamTournamentId}/equipos` : '#/equipos'" class="back"><Icon name="back" />Equipos</a><div class="heading team-heading"><div><h1 tabindex="-1">{{ selectedTeamEntries[0].name }}</h1><button v-if="canManageTournaments() && !teamNameEditing" type="button" class="text-action" @click="teamNameDraft=selectedTeamEntries[0].name;teamNameEditing=true"><Icon name="edit" />Editar nombre</button></div><div class="field team-shield-control"><img v-if="selectedTeamEntries[0].has_shield" class="team-public-shield" :src="`/api/v1/organizations/${user.organizationId}/teams/${selectedTeamEntries[0].id}/shield`" :alt="`Escudo de ${selectedTeamEntries[0].name}`"><span v-else class="team-mark" :style="{ background: selectedTeamEntries[0].color }">{{ initials(selectedTeamEntries[0].name) }}</span><input v-if="canManageTournaments()" id="team-shield" class="file-input" type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="uploadShield($event,selectedTeamEntries[0].id)"><label v-if="canManageTournaments()" for="team-shield" class="team-shield-action"><Icon name="edit" />{{ selectedTeamEntries[0].has_shield ? 'Cambiar escudo' : 'Añadir escudo' }}</label></div></div>
        <form v-if="canManageTournaments() && teamNameEditing" class="stack" @submit.prevent="saveTeamName"><div class="field"><label for="team-name-edit">Nombre del equipo</label><input id="team-name-edit" v-model="teamNameDraft" minlength="2" maxlength="120" required></div><div class="workspace-actions"><button class="btn primary" :disabled="busy || teamNameDraft.trim().length<2">Guardar</button><button type="button" class="btn" @click="teamNameEditing=false">Cancelar</button></div></form>
        <SportTabs v-model="teamTab" :tabs="[{key:'players',label:'Jugadores',icon:'users'},{key:'matches',label:'Partidos',icon:'ball'},{key:'people',label:'Personas',icon:'account'},{key:'management',label:'Gestión',icon:'edit'}]" id="equipo" />
        <div :id="`equipo-${teamTab}-panel`" role="tabpanel" :aria-labelledby="`equipo-${teamTab}-tab`">
        <div v-if="teamTab==='management'" class="action-grid"><button v-if="canManageTournaments()" type="button" class="btn" :aria-pressed="teamAction==='admin'" @click="openTeamAction('admin')">Asignar administrador</button><button type="button" class="btn" :aria-pressed="teamAction==='commission'" @click="openTeamAction('commission')">Agregar comisión</button><button type="button" class="btn" :aria-pressed="teamAction==='staff'" @click="openTeamAction('staff')">Agregar cuerpo técnico</button><button v-if="canManageTournaments() && availableCategories.length" type="button" class="btn" :aria-pressed="teamAction==='category'" @click="openTeamAction('category')">Otra categoría</button></div>
        <section v-for="entry in selectedTeamEntries" :key="entry.entry_id" class="panel pad stack mt">
          <div v-if="selectedTeamEntries.length>1"><h2>{{ entry.category_name }}</h2><p class="small muted">{{ entry.tournament_name }} · {{ entry.edition_name }}</p></div>
          <template v-if="teamTab==='players'"><a class="btn full" :href="`#/buena-fe/${entry.entry_id}`">Editar lista de buena fe<Icon name="arrow" /></a><p v-if="!teamRosters[entry.entry_id]?.length" class="empty-list">Sin jugadores cargados.</p><a v-for="player in teamRosters[entry.entry_id]||[]" :key="player.id" class="team-roster-row" :href="`#/jugador/${entry.entry_id}/${player.id}/equipo`"><strong>{{ player.given_names }} {{ player.family_names }}</strong><span><small>{{ player.status==='approved'?'Aprobado':player.status==='submitted'?'Presentado':player.status==='observed'?'Observado':'Borrador' }}</small><Icon name="arrow" /></span></a></template>
          <div v-if="teamTab==='matches'"><p v-if="!teamMatches[entry.entry_id]?.length" class="empty-list">Sin partidos.</p><div v-for="match in teamMatches[entry.entry_id]||[]" :key="match.id" class="team-match-row"><div><strong>{{ match.home_name }} · {{ match.away_name }}</strong><small>{{ match.match_date }}<template v-if="match.acta_status==='official'"> · Final</template></small></div><div class="workspace-actions"><a :href="`#/planilla/${entry.entry_id}/${match.id}`"><Icon name="users" />Planilla</a><a v-if="['submitted','official'].includes(match.acta_status||'')" :href="`#/acta-equipo/${entry.entry_id}/${match.id}`"><Icon name="file" />Acta</a></div></div></div>
          <a v-if="teamTab==='management' && canManageTournaments()" class="btn full" :href="`#/torneo/${tournaments.find(item=>item.category_id===entry.category_id)?.id}/pagos/${entry.entry_id}`">Pagos y multas<Icon name="arrow" /></a>
          <a v-if="teamTab==='management'" class="btn full" :href="`#/disciplina/${entry.entry_id}`">Disciplina y resoluciones<Icon name="arrow" /></a>
          <button v-if="teamTab==='management' && canManageTournaments() && tournaments.some(item=>item.category_id===entry.category_id&&item.status==='published')" type="button" class="text-action" :disabled="busy" @click="setTeamPublic(entry)">{{ entry.public_visible ? 'Ocultar equipo al público' : 'Mostrar equipo al público' }}</button>
          <div v-if="teamTab==='people'"><h3>Administradores</h3><div v-for="person in entry.administrators" :key="person.id" class="team-person"><div><strong>{{ person.name }}</strong><p class="small muted">{{ person.assignment === 'revoked' ? 'Asignación revocada' : accessLabels[person.status] }}</p></div><div v-if="canManageTournaments() && person.assignment === 'active'" class="team-confirm"><input v-model="adminRevokeReasons[`${entry.entry_id}:${person.id}`]" :aria-label="`Motivo para revocar a ${person.name}`" maxlength="300" placeholder="Motivo de revocación"><button type="button" class="btn" :disabled="busy" @click="revokeTeamAdmin(entry.entry_id,person.id)">Revocar</button></div></div><p v-if="!entry.administrators.length" class="small muted">Todavía no asignados.</p></div>
          <div v-if="teamTab==='people'"><h3>Comisión</h3><div v-for="person in entry.commission" :key="person.id" class="team-person"><div><strong>{{ person.name }}</strong><p class="small muted">{{ person.title }} · {{ person.ended_at ? 'Finalizado' : person.status === 'confirmed' ? 'Confirmado' : 'Propuesto' }}</p></div><div v-if="canManageTournaments() && person.status === 'proposed' && !person.ended_at" class="team-confirm"><input v-model="teamConfirmReasons[person.id]" aria-label="Motivo de confirmación" maxlength="300" placeholder="Motivo de confirmación"><button type="button" class="btn" :disabled="busy" @click="confirmTeamPerson('commission',person.id)">Confirmar</button></div><div v-if="canManageTournaments() && person.status === 'confirmed' && !person.ended_at" class="team-confirm"><input v-model="commissionEndReasons[person.id]" :aria-label="`Motivo para finalizar a ${person.name}`" maxlength="300" placeholder="Motivo de finalización"><button type="button" class="btn" :disabled="busy" @click="endCommission(person.id)">Finalizar</button></div></div><p v-if="!entry.commission.length" class="small muted">Sin integrantes todavía.</p></div>
          <div v-if="teamTab==='people'"><h3>Cuerpo técnico</h3><div v-for="person in entry.staff" :key="person.id" class="team-person"><div><strong>{{ person.name }}</strong><p class="small muted">{{ person.role }} · {{ person.status === 'confirmed' ? 'Confirmado' : 'Propuesto' }}</p></div><div v-if="canManageTournaments() && person.status === 'proposed'" class="team-confirm"><input v-model="teamConfirmReasons[person.id]" aria-label="Motivo de confirmación" maxlength="300" placeholder="Motivo de confirmación"><button type="button" class="btn" :disabled="busy" @click="confirmTeamPerson('staff',person.id)">Confirmar</button></div></div><p v-if="!entry.staff.length" class="small muted">Sin integrantes todavía.</p></div>
        </section>
        <form v-if="teamTab==='management' && teamAction==='category' && canManageTournaments() && availableCategories.length" id="another-category-form" class="panel pad stack mt" @submit.prevent="addTeamEntry(selectedTeamEntries[0].id)"><h2>Otra categoría</h2><p class="small muted">El mismo equipo conserva su identidad y suma una participación independiente.</p><div class="stack" role="group" aria-label="Otra categoría"><button v-for="category in availableCategories" :key="category.id" type="button" class="category-choice" :aria-pressed="entryCategoryId === category.id" @click="entryCategoryId = category.id"><strong>{{ category.category_name }}</strong><span>{{ category.tournament_name }} · {{ category.edition_name }}</span></button></div><button class="btn primary" :disabled="busy">Agregar participación</button></form>
        <form v-if="teamTab==='management' && teamAction==='admin' && canManageTournaments()" id="team-admin-form" class="panel pad stack mt" @submit.prevent="assignTeamAdmin"><h2>Administrador de equipo</h2><div v-if="selectedTeamEntries.length > 1" class="choices grid" role="group" aria-label="Participación para el administrador"><button v-for="entry in selectedTeamEntries" :key="entry.entry_id" type="button" class="choice" :aria-pressed="teamAdminDraft.entryId === entry.entry_id" @click="teamAdminDraft.entryId = entry.entry_id">{{ entry.category_name }}</button></div><div class="field"><label for="team-admin-name">Nombre</label><input id="team-admin-name" v-model="teamAdminDraft.name" minlength="2" maxlength="120" required></div><div class="field"><label for="team-admin-user">Usuario</label><input id="team-admin-user" v-model="teamAdminDraft.username" minlength="3" maxlength="160" required autocapitalize="none" spellcheck="false"></div><button class="btn primary" :disabled="busy">Asignar</button><div v-if="teamLink" class="stack"><p class="small">Entregale este enlace. Al abrirlo, el administrador elige su contraseña.</p><div class="copy-row"><div class="field"><label for="team-admin-link">Enlace de acceso</label><input id="team-admin-link" :value="teamLink.url" readonly @focus="($event.target as HTMLInputElement).select()"></div><button type="button" class="btn" @click="copyLink(teamLink.url)">Copiar</button></div></div></form>
        <form v-if="teamTab==='management' && teamAction==='commission'" id="commission-form" class="panel pad stack mt" @submit.prevent="proposeTeamPerson('commission')"><h2>Agregar comisión</h2><div v-if="selectedTeamEntries.length > 1" class="choices grid" role="group" aria-label="Participación de la comisión"><button v-for="entry in selectedTeamEntries" :key="entry.entry_id" type="button" class="choice" :aria-pressed="commissionDraft.entryId === entry.entry_id" @click="commissionDraft.entryId = entry.entry_id">{{ entry.category_name }}</button></div><div class="field"><label for="commission-name">Nombre</label><input id="commission-name" v-model="commissionDraft.name" minlength="2" maxlength="120" required></div><div class="field"><label for="commission-role">Cargo</label><input id="commission-role" v-model="commissionDraft.role" minlength="2" maxlength="80" required placeholder="Ej. Presidencia"></div><button class="btn primary" :disabled="busy">Agregar</button></form>
        <form v-if="teamTab==='management' && teamAction==='staff'" id="staff-form" class="panel pad stack mt" @submit.prevent="proposeTeamPerson('staff')"><h2>Agregar cuerpo técnico</h2><div v-if="selectedTeamEntries.length > 1" class="choices grid" role="group" aria-label="Participación del cuerpo técnico"><button v-for="entry in selectedTeamEntries" :key="entry.entry_id" type="button" class="choice" :aria-pressed="staffDraft.entryId === entry.entry_id" @click="staffDraft.entryId = entry.entry_id">{{ entry.category_name }}</button></div><div class="field"><label for="staff-name">Nombre</label><input id="staff-name" v-model="staffDraft.name" minlength="2" maxlength="120" required></div><div class="field"><label for="staff-role">Función</label><input id="staff-role" v-model="staffDraft.role" minlength="2" maxlength="80" required placeholder="Ej. Director técnico"></div><button class="btn primary" :disabled="busy">Agregar</button></form>
        </div>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'disciplina' && selectedEntry" class="form-page">
        <a :href="`#/equipo/${selectedEntry.id}`" class="back"><Icon name="back" />{{ selectedEntry.name }}</a>
        <div class="heading"><div><h1 tabindex="-1">Disciplina</h1><p>{{ selectedEntry.category_name }} · {{ selectedEntry.name }}</p></div></div>
        <SportTabs v-if="canManageTournaments()" v-model="disciplineTab" :tabs="[{key:'cases',label:'Expedientes',icon:'file'},{key:'settings',label:'Ajustes',icon:'edit'},{key:'publicity',label:'Nombres',icon:'users'}]" id="disciplina" />
        <div v-if="disciplineTab==='cases' || !canManageTournaments()" id="disciplina-cases-panel" role="tabpanel" aria-labelledby="disciplina-cases-tab">
        <div class="action-grid"><a class="btn" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/exports/discipline/summary/current/pdf`">Resumen PDF privado</a><a class="btn" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/exports/discipline/summary/current/csv`">Resumen CSV privado</a></div>
        <div v-if="loading" class="loading" role="status">Cargando expedientes…</div>
        <div v-if="error" class="notice error" role="alert">{{ error }}</div>
        <section v-if="disciplineNotices.some(item=>!item.read_at)" class="panel pad stack"><h2>Notificaciones del equipo</h2><div v-for="notice in disciplineNotices.filter(item=>!item.read_at)" :key="notice.id" class="team-person"><span>{{ notice.kind==='decision'?'Nueva resolución':notice.kind==='revocation'?'Resolución revocada':'Apelación resuelta' }}</span><button type="button" class="btn" :disabled="busy" @click="readDisciplineNotice(notice.id)">Marcar leída</button></div></section>
        <section v-if="canManageTournaments()" class="panel pad stack mt"><h2>Actas y propuestas</h2><p class="small muted">Las tarjetas e incidencias generan propuestas. Solo una resolución humana produce una suspensión o multa.</p><button type="button" class="btn full" :disabled="busy" @click="rebuildDisciplineProposals">Actualizar propuestas desde actas oficiales</button></section>
        <section class="panel pad stack mt"><h2>Expedientes del equipo</h2><p v-if="!disciplineCases.length" class="small muted">Todavía no hay casos para esta participación.</p><button v-for="item in disciplineCases" :key="item.id" type="button" class="category-choice" :aria-pressed="selectedDisciplineCaseId===item.id" @click="selectDisciplineCase(item.id)"><strong>{{ item.summary }}</strong><span>{{ disciplineKindLabels[item.source_kind] || item.source_kind }} · {{ item.status==='proposed'?'Propuesto':item.status==='review'?'En revisión':item.status==='decided'?'Resuelto':item.status==='appealed'?'Apelado':'Revocado' }}{{ !item.source_valid?' · Origen rectificado: revisar':'' }}</span></button></section>
        <section v-if="selectedDisciplineCase" class="panel pad stack mt"><h2>Expediente seleccionado</h2><p><strong>{{ selectedDisciplineCase.player_name || selectedDisciplineCase.team_name }}</strong> · {{ selectedDisciplineCase.summary }}</p><p v-if="selectedDisciplineCase.evidence_note" class="small muted">Evidencia: {{ selectedDisciplineCase.evidence_note }}</p><p v-if="!selectedDisciplineCase.source_valid" class="notice amber">El acta que originó la propuesta cambió. La decisión vigente requiere revisión expresa.</p><div v-if="selectedDisciplineCase.decision_id" class="notice neutral"><strong>Resolución {{ selectedDisciplineCase.decision_status==='active'?'vigente':'revocada' }}</strong><p v-if="selectedDisciplineCase.decision_status==='revoked'" class="small">Sin suspensión ni multa vigente; se muestran los términos originales por historial.</p><p>{{ selectedDisciplineCase.decision_reason }}</p><p v-if="selectedDisciplineCase.suspension_unit==='matches'">{{ selectedDisciplineCase.suspension_matches }} partido(s) desde {{ selectedDisciplineCase.starts_on }}</p><p v-else-if="selectedDisciplineCase.suspension_unit==='date_range'">Desde {{ selectedDisciplineCase.starts_on }} hasta {{ selectedDisciplineCase.ends_on }}</p><p v-if="selectedDisciplineCase.fine_amount_guaranies!==null">Multa deportiva: Gs. {{ selectedDisciplineCase.fine_amount_guaranies }} · sin cobros en esta pantalla.</p><a class="btn full mt" :href="`/api/v1/organizations/${user.organizationId}/discipline/cases/${selectedDisciplineCase.id}/resolution.pdf`">Descargar resolución PDF privada</a></div>
          <div v-if="disciplineServiceHistory.some(item=>item.current_approval)" class="stack"><h3>Partidos cumplidos</h3><p v-for="item in disciplineServiceHistory.filter(item=>item.current_approval)" :key="item.match_id" class="small">Acta oficial del {{ item.match_date }}</p></div><div v-if="disciplineHistory.length" class="stack"><h3>Historial</h3><p v-for="(action,index) in disciplineHistory" :key="index" class="small">{{ action.kind }} · {{ action.reason }}</p></div>
          <template v-if="canManageTournaments()"><div v-if="['proposed','review'].includes(selectedDisciplineCase.status)" class="stack"><div class="field"><label for="discipline-review-reason">Motivo de revisión</label><input id="discipline-review-reason" v-model="disciplineReasons[selectedDisciplineCase.id]" minlength="3" maxlength="1000" placeholder="Constancia revisada"></div><button type="button" class="btn full" :disabled="busy" @click="reviewDisciplineCase">Registrar revisión</button></div><form v-if="['proposed','review'].includes(selectedDisciplineCase.status) && selectedDisciplineCase.source_valid" class="stack" @submit.prevent="decideDisciplineCase"><h3>Resolver</h3><div class="choices grid" role="group" aria-label="Tipo de suspensión"><button v-for="[mode,label] in [['none','Sin suspensión'],['matches','Partidos'],['date_range','Fechas']]" :key="mode" type="button" class="choice" :aria-pressed="decisionDraft.mode===mode" @click="decisionDraft.mode=mode as typeof decisionDraft.mode">{{ label }}</button></div><div v-if="decisionDraft.mode!=='none'" class="field"><label for="suspension-start">Vigente desde</label><input id="suspension-start" v-model="decisionDraft.startsOn" type="date" required></div><div v-if="decisionDraft.mode==='matches'" class="field"><label for="suspension-matches">Cantidad de partidos oficiales</label><input id="suspension-matches" v-model.number="decisionDraft.matches" type="number" inputmode="numeric" min="1" max="100" required></div><div v-if="decisionDraft.mode==='date_range'" class="field"><label for="suspension-end">Hasta</label><input id="suspension-end" v-model="decisionDraft.endsOn" type="date" required></div><div><span class="label">Multa deportiva</span><div class="choices grid mt" role="group" aria-label="Multa del catálogo"><button type="button" class="choice" :aria-pressed="decisionDraft.fineCatalogId===''" @click="decisionDraft.fineCatalogId=''">Sin multa</button><button v-for="fine in fineCatalog" :key="fine.id" type="button" class="choice" :aria-pressed="decisionDraft.fineCatalogId===fine.id" @click="decisionDraft.fineCatalogId=fine.id">{{ fine.label }} · v{{ fine.version }} · Gs. {{ fine.amount_guaranies }}</button></div></div><div class="field"><label for="decision-reason">Motivo de la decisión</label><textarea id="decision-reason" v-model="decisionDraft.reason" minlength="3" maxlength="1000" required></textarea></div><button class="btn primary full" :disabled="busy">Guardar resolución y notificar</button></form><div v-if="selectedDisciplineCase.status==='appealed'" class="stack"><div class="field"><label for="appeal-answer">Motivo al resolver apelación</label><textarea id="appeal-answer" v-model="disciplineReasons[selectedDisciplineCase.id]" minlength="3" maxlength="1000" required></textarea></div><div class="action-grid"><button type="button" class="btn" :disabled="busy" @click="resolveDisciplineAppeal('confirm')">Confirmar</button><button type="button" class="btn" :disabled="busy" @click="resolveDisciplineAppeal('revoke')">Revocar</button></div></div></template>
          <div v-else-if="selectedDisciplineCase.status==='decided'" class="stack"><div class="field"><label for="appeal-reason">Motivo de apelación</label><textarea id="appeal-reason" v-model="disciplineReasons[selectedDisciplineCase.id]" minlength="3" maxlength="1000" required></textarea></div><button type="button" class="btn full" :disabled="busy" @click="appealDisciplineCase">Presentar apelación</button><p class="small muted">La apelación no suspende la resolución automáticamente.</p></div>
        </section>
        </div>
        <div v-if="canManageTournaments() && disciplineTab==='settings'" id="disciplina-settings-panel" role="tabpanel" aria-labelledby="disciplina-settings-tab">
        <SportTabs v-model="disciplineSettingsTab" :tabs="[...(unresolvedTie?[{key:'tiebreak',label:'Desempate',icon:'chart'}]:[]),{key:'case',label:'Caso',icon:'file'},{key:'fine',label:'Multas',icon:'card'},{key:'points',label:'Puntos',icon:'chart'}]" id="disciplina-ajustes" />
        <div :id="`disciplina-ajustes-${disciplineSettingsTab}-panel`" role="tabpanel" :aria-labelledby="`disciplina-ajustes-${disciplineSettingsTab}-tab`">
        <form v-if="unresolvedTie && disciplineSettingsTab==='tiebreak'" class="panel pad stack mt" @submit.prevent="saveTiebreak">
  <h2>Desempate pendiente</h2>
  <p class="small muted">{{ unresolvedTie.groupNo===null?'Tabla general':'Grupo '+unresolvedTie.groupNo }} · puesto {{ unresolvedTie.position }}. Ordená los equipos según la decisión documentada.</p>
  <div v-for="(entryId,index) in tieOrder" :key="entryId" class="team-person">
    <strong>{{ index+unresolvedTie.position }}. {{ privateStats?.entries.find(item=>item.id===entryId)?.name || 'Equipo' }}</strong>
    <div class="action-grid"><button type="button" class="btn" :disabled="index===0" @click="moveTieEntry(index,-1)">Subir</button><button type="button" class="btn" :disabled="index===tieOrder.length-1" @click="moveTieEntry(index,1)">Bajar</button></div>
  </div>
  <div class="field"><label for="tie-reason">Motivo del orden decidido</label><textarea id="tie-reason" v-model="tieReason" minlength="3" maxlength="1000" required></textarea></div>
  <button class="btn primary full" :disabled="busy">Registrar desempate</button>
</form><form v-if="disciplineSettingsTab==='case'" class="panel pad stack mt" @submit.prevent="createDisciplineCase"><h2>Crear caso manual</h2><div class="field"><label for="case-summary">Motivo</label><input id="case-summary" v-model="caseDraft.summary" minlength="3" maxlength="500" required></div><div class="field"><label for="case-evidence">Constancia (opcional)</label><textarea id="case-evidence" v-model="caseDraft.evidenceNote" maxlength="1000"></textarea></div><div><span class="label">Afectado</span><div class="choices grid mt" role="group" aria-label="Persona o equipo"><button type="button" class="choice" :aria-pressed="!caseDraft.registrationId" @click="caseDraft.registrationId=''">Equipo</button></div><input v-model="disciplinePlayerSearch" type="search" aria-label="Buscar jugador para el caso" placeholder="Buscar jugador"><div class="choices grid mt"><button v-for="player in players.filter(item=>normalize(`${item.given_names} ${item.family_names}`).includes(normalize(disciplinePlayerSearch))).slice(0,30)" :key="player.id" type="button" class="choice" :aria-pressed="caseDraft.registrationId===player.id" @click="caseDraft.registrationId=player.id">{{ player.given_names }} {{ player.family_names }}</button></div></div><button class="btn primary full" :disabled="busy">Crear expediente</button></form><form v-if="disciplineSettingsTab==='fine'" class="panel pad stack mt" @submit.prevent="createFineCatalog"><h2>Catálogo de multas deportivas</h2><p class="small muted">Cada edición del código crea una versión nueva. No se registran saldos ni pagos.</p><div class="form-grid"><div class="field"><label for="fine-code">Código</label><input id="fine-code" v-model="fineDraft.code" minlength="2" maxlength="30" pattern="[A-Za-z0-9_]+" required placeholder="CONDUCTA"></div><div class="field"><label for="fine-label">Descripción</label><input id="fine-label" v-model="fineDraft.label" minlength="3" maxlength="120" required></div><div class="field"><label for="fine-amount">Importe Gs.</label><input id="fine-amount" v-model.number="fineDraft.amountGuaranies" type="number" inputmode="numeric" min="0" max="1000000000" required></div></div><button class="btn full" :disabled="busy">Guardar versión</button></form><form v-if="disciplineSettingsTab==='points'" class="panel pad stack mt" @submit.prevent="adjustStandingPoints">
  <h2>Ajuste de puntos · {{ selectedEntry.name }}</h2>
  <p class="small muted">La decisión se conserva. Para revertirla, registrá un ajuste opuesto con motivo.</p>
  <div class="field"><label for="points-delta">Puntos a sumar o descontar</label><input id="points-delta" v-model.number="pointsDraft.delta" type="number" inputmode="numeric" min="-100" max="100" required></div>
  <div class="field"><label for="points-reason">Motivo de la decisión</label><textarea id="points-reason" v-model="pointsDraft.reason" minlength="3" maxlength="1000" required></textarea></div>
  <button class="btn full" :disabled="busy || !pointsDraft.delta">Registrar ajuste</button>
  <div v-for="adjustment in standingAdjustments.filter(item=>item.entry_id===selectedEntry?.entry_id)" :key="adjustment.id" class="team-person"><strong>{{ adjustment.points_delta }} puntos</strong><span>{{ adjustment.reason }}</span></div>
</form></div></div><section v-if="canManageTournaments() && disciplineTab==='publicity' && privateStats" id="disciplina-publicity-panel" role="tabpanel" aria-labelledby="disciplina-publicity-tab" class="panel pad stack mt"><h2>Nombres públicos</h2><p class="small muted">El nombre queda privado hasta autorización individual del organizador. Nunca se publica la cédula ni el nacimiento.</p><div v-for="player in privateStats.players.filter(item=>item.goals>0)" :key="player.registrationId" class="team-person"><div><strong>{{ player.name }}</strong><p class="small muted">{{ player.goals }} {{ player.goals===1?'gol':'goles' }} · {{ player.publicName?'Nombre autorizado':'Nombre privado' }}</p></div><div class="team-confirm"><input v-model="publicationReasons[player.registrationId]" :aria-label="`Motivo de visibilidad de ${player.name}`" minlength="3" maxlength="300" placeholder="Motivo de publicación"><button type="button" class="btn" :disabled="busy" @click="setPlayerPublicName(player)">{{ player.publicName?'Ocultar':'Publicar nombre' }}</button></div></div><p v-if="!privateStats.players.some(item=>item.goals>0)" class="small muted">Aún no hay goles con autor en actas oficiales.</p></section>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'buena-fe' && selectedEntry" class="form-page">
        <a :href="`#/equipo/${selectedEntry.id}`" class="back"><Icon name="back" />{{ selectedEntry.name }}</a>
        <div class="heading"><div><h1 tabindex="-1">Lista de buena fe</h1><p>{{ selectedEntry.category_name }} · {{ selectedEntry.name }}</p></div></div>
        <SportTabs v-model="goodFaithTab" :tabs="[{key:'players',label:'Jugadores',icon:'users'},{key:'publication',label:'Publicación',icon:'file'}]" id="buena-fe" />
        <div v-if="goodFaithTab==='players'" id="buena-fe-players-panel" role="tabpanel" aria-labelledby="buena-fe-players-tab">
        <a class="btn primary" :href="`#/nuevo-jugador/${selectedEntry.entry_id}`"><Icon name="plus" />Agregar jugador</a>
        <label v-if="players.length" class="search mt"><span class="sr-only">Buscar jugador por nombre o ficha</span><Icon name="search" /><input v-model="playerSearch" type="search" placeholder="Buscar nombre o ficha"></label>
        <p v-if="!players.length && !loading" class="empty-list">Sin jugadores.</p>
        <div v-else class="stack mt"><a v-for="player in filteredPlayers" :key="player.id" class="player-row" :href="`#/jugador/${selectedEntry.entry_id}/${player.id}`"><span><strong>{{ player.family_names }}, {{ player.given_names }}</strong><small class="muted">{{ player.status === "approved" ? "Aprobado" : "Borrador" }}</small></span><Icon name="arrow" /></a><div v-if="!filteredPlayers.length && playerSearch" class="empty"><h2>Sin coincidencias</h2><button class="btn" @click="playerSearch = ''">Mostrar todos</button></div></div>
        <details v-if="canManageTournaments()" class="optional-section mt"><summary>Vincular jugador ya registrado</summary>
          <div class="team-confirm"><input v-model="reuseSearch" aria-label="Buscar identidad existente" minlength="2" maxlength="80" placeholder="Nombre o terminación de documento"><button type="button" class="btn" :disabled="busy || reuseSearch.trim().length < 2" @click="searchReusableIdentity">Buscar</button></div>
          <div v-for="person in reuseResults" :key="person.id" class="team-person"><div><strong>{{ person.family_names }}, {{ person.given_names }}</strong><p class="small muted">{{ person.document_kind ? `${person.document_kind.toUpperCase()} termina en ${person.document_last_four}` : 'Sin documento' }} · nació {{ person.birth_date }}</p></div><button type="button" class="btn" :aria-pressed="reuseDraft.playerId === person.id" @click="reuseDraft.playerId = person.id">Elegir</button></div>
          <form v-if="reuseDraft.playerId" class="stack" @submit.prevent="reuseIdentity"><div class="field"><label for="reuse-number">Número de ficha en este equipo (opcional)</label><input id="reuse-number" v-model="reuseDraft.registrationNumber" minlength="1" maxlength="40"></div><div class="choices grid" role="group" aria-label="Procedencia de identidad reutilizada"><button v-for="[kind,label] in [['unknown','No informado'],['none','Sin equipo previo'],['internal','Interno'],['external','Externo']]" :key="kind" type="button" class="choice" :aria-pressed="reuseDraft.originKind === kind" @click="reuseDraft.originKind = kind as PlayerDraftInput['origin']['kind']">{{ label }}</button></div><div v-if="reuseDraft.originKind === 'internal'" class="choices grid" role="group" aria-label="Equipo interno de procedencia"><button v-for="team in originTeams" :key="team.id" type="button" class="choice" :aria-pressed="reuseDraft.teamId === team.id" @click="reuseDraft.teamId = team.id">{{ team.name }}</button></div><div v-if="reuseDraft.originKind === 'external'" class="field"><label for="reuse-team">Equipo externo de origen</label><input id="reuse-team" v-model="reuseDraft.teamName" minlength="2" maxlength="120" required></div><div v-if="['internal','external'].includes(reuseDraft.originKind)" class="field"><label for="reuse-city">Ciudad de origen</label><input id="reuse-city" v-model="reuseDraft.city" minlength="2" maxlength="120" required></div><div v-if="['internal','external'].includes(reuseDraft.originKind)" class="field"><label for="reuse-league">Liga (opcional)</label><input id="reuse-league" v-model="reuseDraft.league" maxlength="120"></div><div class="field"><label for="reuse-reason">Motivo de incorporación</label><input id="reuse-reason" v-model="reuseDraft.reason" minlength="3" maxlength="300" required></div><button class="btn primary full" :disabled="busy">Incorporar a este equipo</button></form>
        </details>
        </div>

        <section v-if="goodFaithTab==='publication'" id="buena-fe-publication-panel" role="tabpanel" aria-labelledby="buena-fe-publication-tab" class="stack mt">
          <div v-if="latestGoodFaith" class="notice" :class="latestGoodFaith.status === 'approved' ? 'neutral' : 'amber'"><span>Versión {{ latestGoodFaith.version }} · {{ latestGoodFaith.status === 'submitted' ? 'Pendiente de revisión' : latestGoodFaith.status === 'approved' ? 'Aprobada' : latestGoodFaith.status === 'observed' ? 'Observada' : 'Rechazada' }} · {{ latestGoodFaith.snapshot.length }} {{ latestGoodFaith.snapshot.length === 1 ? 'jugador' : 'jugadores' }}.<template v-if="latestGoodFaith.review_reason"> Motivo: {{ latestGoodFaith.review_reason }}</template></span></div>
          <a v-if="latestGoodFaith?.status === 'approved'" class="btn full" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/good-faith/${latestGoodFaith.version}/pdf`">Descargar PDF privado aprobado</a>
          <a v-if="latestGoodFaith?.status === 'approved'" class="btn full" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/exports/good-faith/list/${latestGoodFaith.version}/csv`">Descargar CSV privado aprobado</a>
          <button v-if="canManageTournaments() && latestGoodFaith?.status !== 'submitted'" type="button" class="btn primary full" :disabled="busy || !players.length" @click="publishGoodFaith">Publicar lista</button>
          <button v-else-if="latestGoodFaith?.status !== 'submitted'" type="button" class="btn primary full" :disabled="busy || !players.length" @click="submitGoodFaith">Enviar lista</button>
          <div v-else-if="canManageTournaments()" class="stack"><div class="action-grid"><button type="button" class="btn primary" :disabled="busy" @click="reviewGoodFaith('approved')">Aprobar lista</button><button type="button" class="btn" @click="goodFaithDecision='observed'">Observar</button><button type="button" class="btn" @click="goodFaithDecision='rejected'">Rechazar</button></div><div v-if="goodFaithDecision" class="field"><label for="good-faith-review-reason">Motivo para {{ goodFaithDecision==='observed'?'observar':'rechazar' }}</label><input id="good-faith-review-reason" v-model="goodFaithReviewReason" minlength="3" maxlength="300"><button type="button" class="btn" :disabled="busy || goodFaithReviewReason.trim().length<3" @click="reviewGoodFaith(goodFaithDecision)">Confirmar</button></div></div>
          <p v-else class="small muted">La lista está en revisión. Podrás presentar otra versión después de la decisión del organizador.</p>
          <div v-if="goodFaithVersions.length > 1"><h3>Historial</h3><p v-for="version in goodFaithVersions.slice(1)" :key="version.id" class="small muted">Versión {{ version.version }} · {{ version.status }} · {{ version.snapshot.length }} {{ version.snapshot.length === 1 ? 'jugador' : 'jugadores' }} · {{ dateLabel(version.submitted_at) }} <a v-if="version.status === 'approved'" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/good-faith/${version.version}/pdf`">PDF privado</a></p></div>
        </section>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'acta-equipo' && selectedEntry" class="form-page">
        <a :href="`#/buena-fe/${selectedEntry.entry_id}`" class="back"><Icon name="back" />{{ selectedEntry.name }}</a><div class="heading"><div><h1 tabindex="-1">Conformidad del acta</h1><p>{{ teamActa?.view.home.name }} vs {{ teamActa?.view.away.name }}</p></div></div>
        <section v-if="teamActa" class="panel pad stack"><p><strong>{{ teamActa.view.score.home }} : {{ teamActa.view.score.away }}</strong> · {{ teamActa.view.status==='official'?'Resultado oficial':'Resultado provisional' }}</p><p v-if="teamActa.view.shootout.home||teamActa.view.shootout.away">Tanda {{ teamActa.view.shootout.home }} : {{ teamActa.view.shootout.away }}</p><div v-for="event in teamActa.view.events.filter(row=>row.kind!=='void')" :key="event.id" class="team-person"><div><strong>{{ captureEventLabel(event,teamActa.view) }} · {{ [...teamActa.view.home.players,...teamActa.view.away.players].find(player=>player.registrationId===event.registrationId)?.name || 'Sin autor' }}</strong><p class="small muted">{{ event.period || 'Tiempo sin especificar' }}{{ event.minute===null?'':` · ${event.minute} min` }}<template v-if="event.incidentNote"> · {{ event.incidentNote }}</template></p></div></div><p v-if="teamActa.signed" class="notice neutral">Tu equipo ya dejó su conformidad.</p><button v-else-if="teamActa.view.status==='submitted' && teamActa.submissionId" type="button" class="btn primary full" :disabled="busy" @click="signTeamActa">Confirmar conformidad</button><div v-if="teamActa.approvedVersion" class="action-grid"><a class="btn" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/exports/acta/${teamActa.view.matchId}/${teamActa.approvedVersion}/pdf`">Acta PDF</a><a class="btn" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/exports/acta/${teamActa.view.matchId}/${teamActa.approvedVersion}/csv`">Acta CSV</a></div></section>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'planilla' && selectedEntry && selectedMatch" class="form-page">
        <a :href="`#/buena-fe/${selectedEntry.entry_id}`" class="back"><Icon name="back" />Lista de buena fe</a>
        <div class="heading"><div><h1 tabindex="-1">Planilla de partido</h1><p>{{ selectedMatch.home_name }} vs {{ selectedMatch.away_name }} · {{ selectedMatch.match_date }}</p></div><span class="badge pending">Borrador privado</span></div>
        <div v-if="latestLineup" class="notice neutral">Versión {{ latestLineup.version }} · {{ latestLineup.status === 'draft' ? 'Borrador guardado' : latestLineup.status === 'submitted' ? 'En revisión' : latestLineup.status === 'approved' ? 'Aprobada' : latestLineup.status === 'observed' ? 'Observada' : 'Rechazada' }} · Reglamento v{{ latestLineup.rule_version }} · Buena fe v{{ latestLineup.good_faith_version }}<template v-if="latestLineup.review_reason">. Motivo: {{ latestLineup.review_reason }}</template></div>
        <div v-else class="notice neutral">Elegí jugadores y guardá.</div>
        <div v-for="version in lineupVersions.filter(item=>item.status==='approved')" :key="`export-lineup-${version.id}`" class="action-grid mt"><span>Planilla aprobada v{{ version.version }}</span><a class="btn" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/exports/lineup/${selectedMatch.id}/${version.version}/pdf`">PDF</a><a class="btn" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/exports/lineup/${selectedMatch.id}/${version.version}/csv`">CSV</a></div>
        <div class="notice neutral" role="status"><strong>{{ starterCount }} titulares · {{ benchCount }} suplentes · {{ lineupStaffIds.length }} cuerpo técnico</strong></div>
        <div class="action-grid mt"><button type="button" class="btn" :disabled="busy || latestLineup?.status === 'submitted'" @click="copyPreviousLineup">Copiar planilla anterior</button></div>
        <section class="stack mt"><h2>Jugadores</h2><div class="field"><label for="lineup-search">Buscar jugador</label><input id="lineup-search" v-model="lineupSearch" type="search" autocomplete="off" placeholder="Nombre, ficha o dorsal"></div>
          <div v-for="player in visibleLineupPlayers" :key="player.id" class="lineup-row stack">
            <div><strong>{{ player.family_names }}, {{ player.given_names }}</strong><p class="small muted">{{ player.registration_number ? `Ficha ${player.registration_number} · ` : '' }}<a class="link" :href="`#/jugador/${selectedEntry.entry_id}/${player.id}`">Ver elegibilidad</a></p></div>
            <div v-if="lineupEligibility[player.id]" class="notice" :class="lineupEligibility[player.id].status === 'blocked' ? 'error' : lineupEligibility[player.id].status === 'warning' ? 'amber' : 'neutral'"><strong>{{ lineupEligibility[player.id].status === 'blocked' ? 'Bloqueado' : lineupEligibility[player.id].status === 'warning' ? 'Advertencia' : 'Permitido' }}</strong><p v-for="reason in lineupEligibility[player.id].reasons" :key="reason" class="small">{{ reason }}</p><p v-if="lineupExceptions.some(item => item.registration_id === player.id)" class="small">Excepción autorizada para este encuentro.</p></div>
            <div class="choices grid" :aria-label="`Convocatoria de ${player.given_names} ${player.family_names}`"><button type="button" class="choice" :aria-pressed="lineupPlayers[player.id]?.role === 'starter'" :disabled="latestLineup?.status === 'submitted'" @click="selectLineupRole(player.id,'starter')">Titular</button><button type="button" class="choice" :aria-pressed="lineupPlayers[player.id]?.role === 'bench'" :disabled="latestLineup?.status === 'submitted'" @click="selectLineupRole(player.id,'bench')">Banco</button><button v-if="lineupPlayers[player.id]" type="button" class="choice" :disabled="latestLineup?.status === 'submitted'" @click="selectLineupRole(player.id,null)">Quitar</button></div>
            <div v-if="lineupPlayers[player.id]" class="field"><label :for="`shirt-${player.id}`">Dorsal en este partido (opcional)</label><input :id="`shirt-${player.id}`" type="number" inputmode="numeric" min="0" max="99" :value="lineupPlayers[player.id]?.shirtNumber ?? ''" :disabled="latestLineup?.status === 'submitted'" @input="setShirtNumber(player.id,$event)"></div>
            <div v-if="canManageTournaments() && lineupEligibility[player.id]?.status === 'blocked' && !lineupExceptions.some(item => item.registration_id === player.id)" class="team-confirm"><input v-model="lineupExceptionReasons[player.id]" :aria-label="`Motivo de excepción para ${player.given_names} ${player.family_names}`" maxlength="300" placeholder="Motivo de excepción"><button type="button" class="btn" :disabled="busy" @click="authorizeLineupException(player.id)">Autorizar excepción</button></div>
          </div>
          <p v-if="!visibleLineupPlayers.length && lineupSearch" class="notice neutral">No hay jugadores que coincidan. Borrá la búsqueda para ver toda la buena fe aprobada.</p>
          <div v-if="!players.some(player => player.status === 'approved')" class="empty"><h3>Sin jugadores aprobados</h3><a class="btn" :href="`#/buena-fe/${selectedEntry.entry_id}`">Ir a lista de buena fe</a></div>
        </section>
        <section v-if="selectedEntry.staff.some(item => item.status === 'confirmed')" class="stack mt"><h2>Cuerpo técnico</h2><div v-for="person in selectedEntry.staff.filter(item => item.status === 'confirmed')" :key="person.id" class="choices"><button type="button" class="choice full" :aria-pressed="lineupStaffIds.includes(person.id)" :disabled="latestLineup?.status === 'submitted'" @click="toggleLineupStaff(person.id)">{{ person.name }} · {{ person.role }}</button></div></section>
        <section v-if="latestLineup?.status !== 'submitted'" class="panel pad stack mt"><button type="button" class="btn primary full" :disabled="busy" @click="saveLineup">Guardar planilla</button><button v-if="latestLineup?.status === 'draft'" type="button" class="btn full" :disabled="busy" @click="submitLineup">Enviar planilla</button></section>
        <section v-else-if="canManageTournaments()" class="panel pad stack mt"><h2>Revisar planilla</h2><div class="action-grid"><button type="button" class="btn primary" :disabled="busy" @click="reviewLineup('approved')">Aprobar</button><button type="button" class="btn" @click="lineupDecision='observed'">Observar</button><button type="button" class="btn" @click="lineupDecision='rejected'">Rechazar</button></div><div v-if="lineupDecision" class="field"><label for="lineup-review-reason">Motivo para {{ lineupDecision==='observed'?'observar':'rechazar' }}</label><input id="lineup-review-reason" v-model="lineupReviewReason" minlength="3" maxlength="300"><button type="button" class="btn" :disabled="busy || lineupReviewReason.trim().length<3" @click="reviewLineup(lineupDecision)">Confirmar</button></div></section>
        <div v-if="lineupVersions.length > 1" class="panel pad stack mt"><h2>Historial de planillas</h2><p v-for="version in lineupVersions.slice(1)" :key="version.id" class="small muted">Versión {{ version.version }} · {{ version.status }} · {{ version.snapshot.players.length }} jugadores</p></div>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'jugador' && selectedEntry && selectedPlayer" class="form-page">
        <a :href="parts[3]==='equipo' ? `#/equipo/${selectedEntry.id}` : `#/buena-fe/${selectedEntry.entry_id}`" class="back"><Icon name="back" />{{ parts[3]==='equipo' ? 'Equipo' : 'Lista de buena fe' }}</a>
        <div class="heading"><div><h1 tabindex="-1">{{ selectedPlayer.given_names }} {{ selectedPlayer.family_names }}</h1><p>{{ selectedEntry.category_name }}</p></div></div>
        <SportTabs v-model="playerTab" :tabs="[{key:'record',label:'Ficha',icon:'account'},{key:'documents',label:'Documentos',icon:'file'},{key:'origin',label:'Procedencia',icon:'arrow'},...(canManageTournaments()?[{key:'notices',label:'Avisos',icon:'alert'}]:[])]" id="jugador" />
        <div v-if="playerTab==='record'" id="jugador-record-panel" role="tabpanel" aria-labelledby="jugador-record-tab">
        <section v-if="Object.keys(selectedPlayer.details || {}).length" class="panel pad stack"><h2>Otros datos privados de la ficha</h2><p v-for="[key,value] in Object.entries(selectedPlayer.details)" :key="key" class="small"><strong>{{ selectedEntryRule?.eligibility?.registrationFields?.find(field => field.key === key)?.label || key }}:</strong> {{ value }}</p></section>
        <details class="optional-section"><summary>Editar datos</summary><section class="panel pad stack"><h2>Corregir identidad privada</h2><p class="small muted">La corrección conserva versión y motivo. Si la identidad estaba aprobada, requiere nueva revisión de buena fe; las versiones anteriores no cambian.</p><form class="stack" @submit.prevent="saveIdentity"><div class="form-grid"><div class="field"><label for="edit-given">Nombres</label><input id="edit-given" v-model="identityDraft.givenNames" minlength="2" maxlength="120" required></div><div class="field"><label for="edit-family">Apellidos</label><input id="edit-family" v-model="identityDraft.familyNames" minlength="2" maxlength="120" required></div><div class="field"><label for="edit-birth">Nacimiento</label><input id="edit-birth" v-model="identityDraft.birthDate" type="date" required></div></div><div class="field"><label for="edit-document">Nuevo número de documento (solo si cambia)</label><input id="edit-document" v-model="identityDraft.documentNumber" minlength="4" maxlength="40" autocomplete="off"><span class="small muted">Actual: {{ selectedPlayer.document_kind ? `${selectedPlayer.document_kind.toUpperCase()} terminado en ${selectedPlayer.document_last_four}` : 'sin documento' }}. El número completo nunca se muestra aquí.</span></div><div v-if="identityDraft.documentNumber" class="choices grid" role="group" aria-label="Tipo del nuevo documento"><button v-for="[kind,label] in [['ci','Cédula'],['passport','Pasaporte'],['other','Otro']]" :key="kind" type="button" class="choice" :aria-pressed="identityDraft.documentKind === kind" @click="identityDraft.documentKind = kind as 'ci'|'passport'|'other'">{{ label }}</button></div><div class="field"><label for="edit-reason">Motivo de corrección</label><input id="edit-reason" v-model="identityDraft.reason" minlength="3" maxlength="300" required></div><button class="btn full" :disabled="busy">Guardar corrección</button></form><div v-if="identityHistory.length"><h3>Historial</h3><div v-for="change in identityHistory" :key="change.id" class="team-person"><div><strong>Versión {{ change.revision }} · {{ dateLabel(change.changed_at) }}</strong><p class="small muted">{{ change.changed_fields.join(', ') }} · {{ change.reason }}</p><p class="small muted">{{ change.before.familyNames }}, {{ change.before.givenNames }} → {{ change.after.familyNames }}, {{ change.after.givenNames }}</p></div></div></div></section>
        </details>
        <details class="optional-section"><summary>Comprobar jugador</summary><section class="panel pad stack mt">
          <h2>Elegibilidad</h2><p class="small muted">Evaluación privada para una fecha. Una advertencia requiere revisión; una restricción bloquea la convocatoria normal.</p>
          <div class="field"><label for="eligibility-date">Fecha del partido</label><input id="eligibility-date" v-model="eligibilityDate" type="date"><button type="button" class="btn" :disabled="busy" @click="loadPlayerEvidence">Comprobar fecha</button></div>
          <div v-if="eligibility" class="notice" :class="eligibility.status === 'blocked' ? 'error' : eligibility.status === 'warning' ? 'amber' : 'neutral'"><strong>{{ eligibility.status === 'allowed' ? 'Permitido' : eligibility.status === 'warning' ? 'Con advertencia' : 'Bloqueado' }}</strong><p v-for="reason in eligibility.reasons" :key="reason">{{ reason }}</p><p v-if="!eligibility.reasons.length">No se encontraron impedimentos para esta fecha.</p></div>
        </section>
        </details>
        </div>
        <div v-if="playerTab==='documents'" id="jugador-documents-panel" role="tabpanel" aria-labelledby="jugador-documents-tab"><section class="panel pad stack mt">
          <h2>Documentos privados</h2><p class="small muted">Solo tu equipo y el organizador pueden consultarlos. PDF, PNG, JPG o WebP, hasta 2 MB. Los obligatorios deben ser aprobados antes de aprobar la buena fe.</p>
          <div v-if="selectedEntryRule?.eligibility?.requiredDocuments.length" class="choices grid" role="group" aria-label="Documentos exigidos"><button v-for="label in selectedEntryRule.eligibility.requiredDocuments" :key="label" type="button" class="choice" :aria-pressed="evidenceLabel === label" @click="evidenceLabel = label">{{ label }}</button></div>
          <button v-if="selectedEntryRule?.eligibility?.transferProof && selectedEntryRule.eligibility.transferProof.requiredFor !== 'none' && (selectedEntryRule.eligibility.transferProof.requiredFor === 'all' || selectedPlayer.origin_kind === 'external')" type="button" class="choice" :aria-pressed="evidenceLabel === selectedEntryRule.eligibility.transferProof.label" @click="evidenceLabel = selectedEntryRule.eligibility.transferProof.label">{{ selectedEntryRule.eligibility.transferProof.label }} requerido</button>
          <div class="field"><label for="evidence-label">Nombre del documento</label><input id="evidence-label" v-model="evidenceLabel" minlength="2" maxlength="80" placeholder="Ej. Documento de identidad"></div>
          <div class="field"><label for="evidence-file">Subir documento privado</label><input id="evidence-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" :disabled="busy" @change="uploadPlayerDocument"></div>
          <div v-if="canManageTournaments() && playerEvidence.documents.some(item=>item.status==='uploaded')" class="field"><label for="evidence-reason">Motivo si rechazás</label><input id="evidence-reason" v-model="evidenceReason" maxlength="300"></div>
          <div v-for="document in playerEvidence.documents" :key="document.id" class="team-person"><div><strong>{{ document.label }}</strong><p class="small muted">{{ document.status === 'uploaded' ? 'Pendiente de revisión' : document.status === 'approved' ? 'Aprobado' : 'Rechazado' }} · {{ Math.ceil(document.byte_length / 1024) }} KB</p><p v-if="document.review_reason" class="small muted">{{ document.review_reason }}</p></div><a class="btn" :href="`/api/v1/organizations/${user.organizationId}/entries/${selectedEntry.entry_id}/players/${selectedPlayer.id}/documents/${document.id}/file`">Descargar</a><div v-if="canManageTournaments() && document.status === 'uploaded'" class="action-grid"><button type="button" class="btn primary" :disabled="busy" @click="reviewPlayerDocument(document.id,'approved')">Aprobar</button><button type="button" class="btn" :disabled="busy" @click="reviewPlayerDocument(document.id,'rejected')">Rechazar</button></div></div>
          <p v-if="!playerEvidence.documents.length" class="small muted">Todavía no hay archivos cargados.</p>
        </section>
        </div>
        <div v-if="playerTab==='origin'" id="jugador-origin-panel" role="tabpanel" aria-labelledby="jugador-origin-tab"><section class="panel pad stack mt">
          <h2>Transferencia o préstamo</h2><p class="small muted">La procedencia declarada no verifica un pase. El organizador revisa el movimiento y su vigencia.</p>
          <form class="stack" @submit.prevent="declareMovement"><div class="choices grid" role="group" aria-label="Tipo de movimiento"><button type="button" class="choice" :aria-pressed="movementDraft.kind === 'transfer'" @click="movementDraft.kind = 'transfer'">Transferencia</button><button type="button" class="choice" :aria-pressed="movementDraft.kind === 'loan'" @click="movementDraft.kind = 'loan'">Préstamo</button></div><div class="form-grid"><div class="field"><label for="movement-start">Desde</label><input id="movement-start" v-model="movementDraft.startsOn" type="date" required></div><div v-if="movementDraft.kind === 'loan'" class="field"><label for="movement-end">Hasta</label><input id="movement-end" v-model="movementDraft.endsOn" type="date" required></div></div><div class="field"><label for="movement-reason">Motivo y procedencia</label><input id="movement-reason" v-model="movementDraft.reason" minlength="3" maxlength="300" required></div><button class="btn full" :disabled="busy">Declarar movimiento</button></form>
          <div v-for="movement in playerEvidence.movements" :key="movement.id" class="team-person"><div><strong>{{ movement.kind === 'loan' ? 'Préstamo' : 'Transferencia' }}</strong><p class="small muted">{{ movement.starts_on }}<template v-if="movement.ends_on"> a {{ movement.ends_on }}</template> · {{ movement.status === 'declared' ? 'Pendiente' : movement.status === 'approved' ? 'Aprobado' : 'Rechazado' }}</p><p class="small muted">{{ movement.reason }}</p><p v-if="movement.review_reason" class="small muted">{{ movement.review_reason }}</p></div><div v-if="canManageTournaments() && movement.status === 'declared'" class="action-grid"><button type="button" class="btn primary" :disabled="busy" @click="reviewMovement(movement.id,'approved')">Aprobar</button><button type="button" class="btn" :disabled="busy" @click="reviewMovement(movement.id,'rejected')">Rechazar</button></div></div>
          <p v-if="!playerEvidence.movements.length" class="small muted">No hay movimientos declarados.</p>
        </section>
        </div>
        <div v-if="playerTab==='notices' && canManageTournaments()" id="jugador-notices-panel" role="tabpanel" aria-labelledby="jugador-notices-tab"><section class="panel pad stack mt">
          <h2>Restricción manual</h2><p class="small muted">Para ensayar una suspensión o impedimento. Exige motivo, vigencia y rastro; no genera una sanción automática.</p>
          <form class="stack" @submit.prevent="createRestriction"><div class="form-grid"><div class="field"><label for="restriction-start">Desde</label><input id="restriction-start" v-model="restrictionDraft.startsOn" type="date" required></div><div class="field"><label for="restriction-end">Hasta (opcional)</label><input id="restriction-end" v-model="restrictionDraft.endsOn" type="date"></div></div><div class="field"><label for="restriction-reason">Motivo</label><input id="restriction-reason" v-model="restrictionDraft.reason" minlength="3" maxlength="300" required></div><button class="btn full" :disabled="busy">Registrar restricción</button></form>
          <div v-for="restriction in playerEvidence.restrictions" :key="restriction.id" class="team-person"><div><strong>{{ restriction.lifted_at ? 'Levantada' : 'Activa' }}</strong><p class="small muted">{{ restriction.starts_on }}<template v-if="restriction.ends_on"> a {{ restriction.ends_on }}</template> · {{ restriction.reason }}</p></div><button v-if="!restriction.lifted_at" type="button" class="btn" :disabled="busy" @click="liftRestriction(restriction.id)">Levantar</button></div>
        </section>
        </div>
      </div>

      <div v-else-if="!user.platformAdmin && parts[0] === 'nuevo-jugador' && selectedEntry" class="form-page">
        <a :href="`#/buena-fe/${selectedEntry.entry_id}`" class="back"><Icon name="back" />Lista de buena fe</a>
        <div class="heading"><div><h1 tabindex="-1">Agregar jugador</h1><p>{{ selectedEntry.name }} · {{ selectedEntry.category_name }} · Paso {{ playerStep }} de 2</p></div></div>
        <form v-if="playerStep === 1" class="panel pad stack" @submit.prevent="playerStep = 2">
          <h2>Identidad privada</h2><p class="small muted">Completá los datos tal como constan en el documento. La lista muestra solo la terminación.</p>
          <div class="field"><label for="player-names">Nombres</label><input id="player-names" v-model="newPlayerDraft.givenNames" minlength="2" maxlength="120" required autocomplete="off"></div>
          <div class="field"><label for="player-surnames">Apellidos</label><input id="player-surnames" v-model="newPlayerDraft.familyNames" minlength="2" maxlength="120" required autocomplete="off"></div>
          <div><span class="label">Tipo de documento</span><div class="choices grid mt" role="group" aria-label="Tipo de documento"><button v-for="[value,label] in [['ci','Cédula'],['passport','Pasaporte'],['other','Otro']]" :key="value" type="button" class="choice" :aria-pressed="newPlayerDraft.documentKind === value" @click="newPlayerDraft.documentKind = value as PlayerDraftInput['documentKind']">{{ label }}</button></div></div>
          <div class="field"><label for="player-document">Número de documento (opcional)</label><input id="player-document" v-model="newPlayerDraft.documentNumber" minlength="4" maxlength="40" autocomplete="off" autocapitalize="characters"></div>
          <div class="field"><label for="player-birth">Fecha de nacimiento</label><input id="player-birth" v-model="newPlayerDraft.birthDate" type="date" required :max="new Date().toISOString().slice(0,10)"></div>
          <button class="btn primary full">Continuar a ficha y origen</button>
        </form>
        <form v-else class="panel pad stack" @submit.prevent="createPlayer(false)">
          <h2>Ficha y procedencia</h2><p class="small muted">El número de ficha es distinto del documento y del dorsal del partido.</p>
          <div class="field"><label for="player-card">Número de ficha (opcional)</label><input id="player-card" v-model="newPlayerDraft.registrationNumber" minlength="1" maxlength="40" autocomplete="off"></div>
          <div><span class="label">Equipo de origen</span><div class="choices grid mt" role="group" aria-label="Tipo de origen"><button v-for="[value,label] in [['internal','Del torneo'],['external','Externo'],['none','Sin equipo previo'],['unknown','No informado']]" :key="value" type="button" class="choice" :aria-pressed="newPlayerDraft.originKind === value" @click="newPlayerDraft.originKind = value as PlayerDraftInput['origin']['kind']">{{ label }}</button></div></div>
          <div v-if="newPlayerDraft.originKind === 'internal'" class="stack"><span class="label">Elegí el equipo de origen</span><div v-if="originTeams.length" class="choices grid" role="group" aria-label="Equipo interno de origen"><button v-for="team in originTeams" :key="team.id" type="button" class="choice" :aria-pressed="newPlayerDraft.originTeamId === team.id" @click="newPlayerDraft.originTeamId = team.id">{{ team.name }}</button></div><p v-else class="notice amber">No hay otro equipo en tu ámbito. Podés declarar uno externo.</p></div>
          <div v-if="newPlayerDraft.originKind === 'external'" class="field"><label for="player-origin-team">Nombre del equipo de origen</label><input id="player-origin-team" v-model="newPlayerDraft.originTeamName" minlength="2" maxlength="120" required></div>
          <div v-if="newPlayerDraft.originKind === 'external' || newPlayerDraft.originKind === 'internal'" class="field"><label for="player-origin-city">Ciudad del equipo de origen</label><input id="player-origin-city" v-model="newPlayerDraft.originCity" minlength="2" maxlength="120" required></div>
          <div v-if="newPlayerDraft.originKind === 'external' || newPlayerDraft.originKind === 'internal'" class="field"><label for="player-origin-league">Liga o asociación <span class="muted">(opcional)</span></label><input id="player-origin-league" v-model="newPlayerDraft.originLeague" maxlength="120"></div>
          <div v-for="field in selectedEntryRule?.eligibility?.registrationFields || []" :key="field.key" class="field"><label :for="`player-extra-${field.key}`">{{ field.label }} <span class="muted">(opcional y privado)</span></label><input :id="`player-extra-${field.key}`" v-model="newPlayerDraft.details[field.key]" maxlength="160" autocomplete="off"></div>
          <p v-if="newPlayerDraft.originKind === 'external'" class="notice neutral">El origen externo queda declarado para revisión. No crea un equipo participante ni verifica el pase.</p>
          <div class="form-actions"><button type="button" class="btn" @click="playerStep = 1">Volver a identidad</button><button class="btn primary" :disabled="busy">Guardar borrador</button></div>
          <button type="button" class="btn full" :disabled="busy" @click="createPlayer(true)">Guardar y agregar otro</button>
        </form>
      </div>

      <template v-else-if="parts[0] === 'organizaciones' || (!user.platformAdmin && parts[0] === 'inicio' && !user.organizationId)">
        <div class="heading"><div><h1 tabindex="-1">{{ user.platformAdmin ? 'Organizaciones' : 'Elegí tu organización' }}</h1><p>{{ user.platformAdmin ? 'Acceso y configuración de cada organización' : 'Se muestra el estado de cada acceso' }}</p></div></div>
        <template v-if="user.platformAdmin"><label class="search"><span class="sr-only">Buscar organización</span><Icon name="search" /><input v-model="organizationSearch" type="search" placeholder="Buscar organización"></label><div class="organization-grid mt"><a v-for="item in filteredOrgs" :key="item.id" class="org-card" :href="`#/organizacion/${item.id}`"><span class="org-mark"><Icon /></span><div class="grow"><strong>{{ item.name }}</strong><p>{{ accessLabels[item.status] }}</p></div><Icon name="arrow" /></a></div><div v-if="!filteredOrgs.length && !loading" class="panel empty mt"><h2>Sin coincidencias</h2><button class="btn" @click="organizationSearch = ''">Mostrar todas</button></div></template>
        <div v-else class="stack"><button v-for="item in user.memberships" :key="item.id" class="org-card" :disabled="busy || item.status !== 'active' || item.organization_status !== 'active'" :aria-current="item.organization_id === user.organizationId" @click="chooseOrganization(item.organization_id)"><span class="org-mark"><Icon /></span><div class="grow"><strong>{{ item.organization_name }}</strong><p>{{ roleLabels[item.role] }}</p></div><span class="badge" :class="item.status !== 'active' ? item.status : item.organization_status">{{ accessLabels[item.status !== 'active' ? item.status : item.organization_status] }}</span></button><div v-if="!user.memberships.length" class="panel empty"><Icon /><h2>Tu cuenta aún no tiene organización</h2><p>La administración debe asignar tu acceso.</p></div><p class="small muted">Si el acceso está pendiente, suspendido o bloqueado, consultá con la administración.</p></div>
      </template>

      <template v-else-if="parts[0] === 'organizacion' && selectedOrg && brandDrafts[selectedOrg.id]">
        <div class="form-page"><a :href="user.platformAdmin ? '#/organizaciones' : '#/inicio'" class="back"><Icon name="back" />{{ user.platformAdmin ? 'Organizaciones' : 'Inicio' }}</a><div class="heading"><div><h1 tabindex="-1">Organización</h1><p>{{ selectedOrg.name }}</p></div><span class="badge" :class="selectedOrg.status">{{ accessLabels[selectedOrg.status] }}</span></div>
          <form class="panel pad stack" @submit.prevent="saveBrand(selectedOrg.id)"><div class="brand-preview"><img v-if="selectedOrg.logo_id" :src="`/api/v1/organizations/${selectedOrg.id}/logo?v=${selectedOrg.version}`" :alt="`Logo de ${selectedOrg.name}`"><span v-else class="org-mark" :style="{ color: brandDrafts[selectedOrg.id].accent }"><Icon /></span><strong>{{ brandDrafts[selectedOrg.id].name }}</strong></div><div class="field"><label for="brand-name">Nombre de la organización</label><input id="brand-name" v-model="brandDrafts[selectedOrg.id].name" minlength="3" maxlength="120" required :readonly="!editableBrand(selectedOrg.id)"></div><template v-if="editableBrand(selectedOrg.id)"><span class="label">Color de referencia</span><div class="color-options" role="group" aria-label="Color de la organización"><button v-for="color in palettes" :key="color" type="button" class="color-button" :aria-label="`Color ${color}`" :aria-pressed="brandDrafts[selectedOrg.id].accent === color" @click="brandDrafts[selectedOrg.id].accent = color"><span :style="{ background: color, color: textOnColor(color) }"><Icon v-if="brandDrafts[selectedOrg.id].accent === color" name="check" /></span></button></div><button class="btn primary full" :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar datos' }}</button><hr class="divider"><div class="field"><label for="logo">Logo de la organización</label><input id="logo" type="file" accept="image/png,image/jpeg,image/webp" :disabled="busy" @change="uploadLogo($event, selectedOrg.id)"><span class="small muted">PNG, JPG o WebP · Hasta 2 MB.</span></div></template></form>
          <a v-if="user.platformAdmin" class="btn full mt" :href="`#/estado-organizacion/${selectedOrg.id}`"><Icon name="lock" />Cambiar acceso de toda la organización</a>
        </div>
      </template>

      <template v-else-if="!user.platformAdmin && parts[0] === 'bandeja' && organization">
        <div class="form-page">
          <a href="#/inicio" class="back"><Icon name="back" />Inicio</a>
          <div class="heading"><div><h1 tabindex="-1">Bandeja de revisión</h1><p>Asuntos de {{ organization.name }} que requieren una acción</p></div><button type="button" class="btn" :disabled="loading" @click="loadView(true)">Actualizar</button></div>
          <section class="stack mt" aria-label="Tareas pendientes">
            <article v-for="task in reviewTasks" :key="`${task.kind}:${task.id}:${task.entry_id}`" class="panel pad stack">
              <div class="between wrap"><h2>{{ task.summary }}</h2><span class="badge pending">{{ reviewStateLabels[task.state]||task.state }}</span></div>
              <p class="small muted">{{ task.team_name }} · Responsable: {{ task.owner==='organizer'?'Organizador':'Equipo' }}</p>
              <p class="small muted">Desde {{ dateLabel(task.created_at) }} · {{ task.due_at ? `Plazo: ${dateLabel(task.due_at)}` : 'Sin plazo definido' }}</p>
              <a class="btn primary full" :href="`#/${task.target}`">{{ reviewActionLabel(task) }}<Icon name="arrow" /></a>
            </article>
            <div v-if="!reviewTasks.length && !loading" class="panel empty"><Icon name="file" /><h2>Sin tareas pendientes</h2><p>Al recibir nuevas listas, propuestas, actas o avisos aparecerán aquí.</p></div>
            <button v-if="reviewHasMore" type="button" class="btn full" :disabled="loading" @click="loadReviewTasks(false)">Mostrar más tareas</button>
          </section>
        </div>
      </template>
      <template v-else-if="!user.platformAdmin && parts[0] === 'inicio' && organization">
        <div class="heading"><div><h1 tabindex="-1">{{ organization.name }}</h1><p>{{ roleLabels[user.memberships.find(item => item.organization_id === organization?.id)?.role || 'operator'] }}</p></div><span class="badge active">Acceso habilitado</span></div><div class="content-grid"><section class="panel pad stack"><div class="row"><span class="org-mark"><Icon /></span><div><h2>Tu organización</h2><p class="small muted">Nombre, logo y datos de acceso.</p></div></div><a class="btn primary full" :href="`#/organizacion/${organization.id}`">Abrir organización<Icon name="arrow" /></a><a v-if="user.memberships.length > 1" class="btn full" href="#/organizaciones">Cambiar organización<Icon name="grid" /></a></section><section class="panel pad"><h2>Cuenta</h2><p class="small muted mt">{{ user.name }}</p><p class="small muted">{{ user.username }}</p><a class="link mt" href="#/cuenta">Ver mi cuenta<Icon name="arrow" /></a></section></div>
      </template>

      <template v-else-if="user.platformAdmin && parts[0] === 'actividad'">
        <div class="heading"><h1 tabindex="-1">Actividad</h1><button class="btn" :disabled="loading" @click="loadView(true)">Actualizar</button></div><div class="choices" role="group" aria-label="Tipo de actividad"><button type="button" class="choice" :aria-pressed="activityTab==='changes'" @click="activityTab='changes'">Cambios</button><button type="button" class="choice" :aria-pressed="activityTab==='errors'" @click="activityTab='errors'">Errores</button></div><section v-if="activityTab==='changes'" class="panel"><article v-for="item in activity" :key="item.id" class="audit-item"><div class="between wrap"><h3>{{ actionNames[item.action] || item.action }}</h3><time :datetime="item.created_at">{{ dateLabel(item.created_at) }}</time></div><p>{{ item.actor }}<template v-if="item.organization_name"> · {{ item.organization_name }}</template></p><p v-if="item.before_data?.status && item.after_data?.status">{{ accessLabels[item.before_data.status] }} → {{ accessLabels[item.after_data.status] }}</p><p>{{ item.reason }}</p></article><div v-if="!activity.length && !loading" class="empty">Sin cambios registrados.</div></section><section v-else class="panel"><article v-for="item in technicalErrors" :key="item.id" class="audit-item"><div class="between wrap"><strong>{{ item.error_code }}</strong><time :datetime="item.occurred_at">{{ dateLabel(item.occurred_at) }}</time></div><p>{{ item.source }} · {{ item.method || '' }} {{ item.operation }}<template v-if="item.status_code"> · {{ item.status_code }}</template></p><small v-if="item.message">{{ item.message }}</small><small v-if="item.request_id">ID {{ item.request_id }}</small></article><div v-if="!technicalErrors.length && !loading" class="empty">Sin errores registrados.</div></section>
      </template>

      <template v-else-if="parts[0] === 'cuenta'">
        <div class="form-page"><div class="heading"><div><h1 tabindex="-1">Cuenta</h1></div></div><section class="panel pad"><div class="row"><span class="avatar">{{ initials(user.name) }}</span><div><h2>{{ user.name }}</h2><p class="small muted">{{ user.username }}</p></div></div><dl class="key-values"><div v-if="user.organizationId"><dt>Organización actual</dt><dd>{{ currentOrgName }}</dd></div></dl><a v-if="!user.platformAdmin && user.memberships.length > 1" href="#/organizaciones" class="btn full">Cambiar organización</a><button type="button" class="btn full mt" :aria-expanded="ownPasswordOpen" @click="toggleOwnPassword"><Icon name="lock" />Cambiar contraseña</button><form v-if="ownPasswordOpen" class="stack mt" @submit.prevent="changeOwnPassword"><div class="field"><label for="own-new-password">Nueva contraseña</label><input id="own-new-password" v-model="passwordDraft" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div><div class="row wrap"><button class="btn primary" :disabled="busy">{{ busy ? 'Guardando…' : 'Guardar' }}</button><button type="button" class="btn" :disabled="busy" @click="toggleOwnPassword">Cancelar</button></div></form><button class="btn full mt" :disabled="busy" @click="signOut"><Icon name="exit" />Cerrar sesión</button></section></div>
      </template>
      <section v-else-if="!loading" class="panel empty"><Icon /><h1 tabindex="-1">No se puede abrir esta pantalla</h1><p>Revisá tu acceso o volvé al inicio.</p><a class="btn" :href="`#/${user.platformAdmin ? 'administradores' : 'inicio'}`">Volver al inicio</a></section>
    </main>
  </div>
  <main v-else id="contenido" tabindex="-1" class="auth"><div class="auth-card"><h1 tabindex="-1">Abriendo tu cuenta</h1><p class="muted mt">{{ error || 'Comprobando la sesión…' }}</p><a v-if="error" class="btn mt" href="#/acceso">Volver a ingresar</a></div></main>
  <div v-if="success" class="toast" role="status"><Icon name="check" />{{ success }}</div>
  <InstallButton />
</template>
