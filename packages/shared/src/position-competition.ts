import { rankStandings, type RankedMatch, type StandingGroup, type StandingTotals } from './standings.ts';
import type { RuleConfig } from './index.ts';

export type PositionStage = 'groups' | 'quarterfinal' | 'quadrangular';
export interface PositionGame {
  code: string;
  stage: PositionStage;
  homeRef: string;
  awayRef: string;
}
export interface PositionResult {
  code: string;
  homeEntryId: string;
  awayEntryId: string;
  homeGoals: number;
  awayGoals: number;
  homePenalties: number;
  awayPenalties: number;
  homeYellowCards?: number;
  awayYellowCards?: number;
  homeRedCards?: number;
  awayRedCards?: number;
}
export interface PositionTable {
  totals: StandingTotals[];
  groups: StandingGroup[];
}
export interface PositionCompetition {
  groupA: PositionTable;
  groupB: PositionTable;
  general: PositionTable;
  final: PositionTable | null;
  participants: Record<string, { homeEntryId: string | null; awayEntryId: string | null }>;
  quarterfinalWinners: string[];
  seeds: string[];
  official: { groups: number; quarterfinals: number; quadrangular: number };
  blocked: 'draw' | 'group_results' | 'group_tiebreak' | 'quarterfinal_results' | 'general_tiebreak' | 'quadrangular_results' | 'final_tiebreak' | null;
}
export interface PositionCompetitionView {
  competition: PositionCompetition;
  results: PositionResult[];
  matches: Array<{code:string;match_id:string;matchday_id:string|null;day_status:string|null}>;
  preparedMatches: number;
  rulesPublished: boolean;
  players: Array<{registrationId:string;entryId:string;goals:number;name:string;publicName:boolean}>;
  defense: Array<{entryId:string;played:number;goalsAgainst:number}>;
  titleTie: string[];
  titleExtra: {decision:'no_extra'|'extra';matchId:string|null;homeEntryId:string|null;awayEntryId:string|null;date:string|null;dayStatus:string|null;score:{home:number;away:number;homePenalties:number;awayPenalties:number}|null;winnerEntryId:string|null}|null;
}

export type PositionManualOrders = Partial<Record<'A'|'B'|'general'|'final', ReadonlyMap<number,readonly string[]>>>;

function applyManualOrder(table:PositionTable, orders:ReadonlyMap<number,readonly string[]>|undefined):PositionTable {
  if(!orders?.size)return table;
  return {...table,groups:table.groups.flatMap(group=>{
    const order=orders.get(group.position);
    if(!group.unresolved||!order||order.length!==group.teamIds.length||new Set(order).size!==order.length||order.some(id=>!group.teamIds.includes(id)))return [group];
    return order.map((id,index)=>({position:group.position+index,teamIds:[id],unresolved:false}));
  })};
}

/** El resultado aprobado es la fuente. Cada interserial cuenta una sola vez en la general y para cada participante en su grupo. */
export function derivePositionCompetition(slots: ReadonlyMap<string,string|null>, games: readonly PositionGame[], results: readonly PositionResult[], rules: Pick<RuleConfig,'points'|'advanced'>, manualOrders:PositionManualOrders={}): PositionCompetition {
  const idsA=Array.from({length:5},(_,i)=>slots.get(`A${i+1}`)).filter((id):id is string=>!!id);
  const idsB=Array.from({length:5},(_,i)=>slots.get(`B${i+1}`)).filter((id):id is string=>!!id);
  const all=[...idsA,...idsB];
  const byGame=new Map(games.map(game=>[game.code,game]));
  const byResult=new Map(results.filter(result=>byGame.has(result.code)).map(result=>[result.code,result]));
  const breakers=rules.advanced?.tiebreakers || ['manual_draw'];
  const ranked=(result:PositionResult):RankedMatch=>({
    homeTeamId:result.homeEntryId,awayTeamId:result.awayEntryId,status:'official',homeGoals:result.homeGoals,awayGoals:result.awayGoals,
    homePoints:result.homeGoals>result.awayGoals?rules.points.win:result.homeGoals===result.awayGoals?rules.points.draw:rules.points.loss,
    awayPoints:result.awayGoals>result.homeGoals?rules.points.win:result.awayGoals===result.homeGoals?rules.points.draw:rules.points.loss,
    homeYellowCards:result.homeYellowCards||0,awayYellowCards:result.awayYellowCards||0,homeRedCards:result.homeRedCards||0,awayRedCards:result.awayRedCards||0,
  });
  const resultFor=(game:PositionGame)=>{
    const result=byResult.get(game.code);
    if(!result)return null;
    const home=slots.get(game.homeRef),away=slots.get(game.awayRef);
    if(game.stage==='groups'&&(home!==result.homeEntryId||away!==result.awayEntryId))return null;
    return result;
  };
  const groupGames=games.filter(game=>game.stage==='groups');
  const groupResults=groupGames.map(resultFor).filter((result):result is PositionResult=>!!result);
  const initial=groupResults.map(ranked);
  const groupA=applyManualOrder(rankStandings(idsA,initial,breakers,new Map(),{includeExternalOpponents:true}),manualOrders.A);
  const groupB=applyManualOrder(rankStandings(idsB,initial,breakers,new Map(),{includeExternalOpponents:true}),manualOrders.B);
  const general=applyManualOrder(rankStandings(all,initial,breakers),manualOrders.general);
  const completeDraw=idsA.length===5&&idsB.length===5&&new Set(all).size===10;
  const completeGroups=completeDraw&&groupGames.length===25&&groupResults.length===25;
  const positions=(table:PositionTable)=>table.groups.flatMap(group=>group.unresolved?Array(group.teamIds.length).fill(null) as null[]:group.teamIds);
  const a=completeGroups?positions(groupA):[],b=completeGroups?positions(groupB):[];
  const canPair=a.slice(0,4).every(Boolean)&&b.slice(0,4).every(Boolean);
  const refs=new Map<string,string|null>();
  if(canPair)for(let index=0;index<4;index++){refs.set(`${index+1}A`,a[index]);refs.set(`${index+1}B`,b[index]);}
  const quarterfinalGames=games.filter(game=>game.stage==='quarterfinal');
  const winners:string[]=[];
  const participants:PositionCompetition['participants']={};
  for(const game of games){
    const home=slots.get(game.homeRef)||refs.get(game.homeRef)||null;
    const away=slots.get(game.awayRef)||refs.get(game.awayRef)||null;
    participants[game.code]={homeEntryId:home,awayEntryId:away};
    if(game.stage!=='quarterfinal')continue;
    const result=byResult.get(game.code);
    if(!home||!away||!result||result.homeEntryId!==home||result.awayEntryId!==away)continue;
    const winner=result.homeGoals>result.awayGoals?home:result.awayGoals>result.homeGoals?away:result.homePenalties>result.awayPenalties?home:result.awayPenalties>result.homePenalties?away:null;
    if(winner)winners.push(winner);
  }
  const allWinners=quarterfinalGames.length===4&&winners.length===4&&new Set(winners).size===4;
  const seeds=allWinners?general.groups.flatMap(group=>{
    const finalists=group.teamIds.filter(id=>winners.includes(id));
    return group.unresolved&&finalists.length>1?[]:finalists;
  }):[];
  const seeded=seeds.length===4;
  if(seeded)for(let index=0;index<4;index++)refs.set(`S${index+1}`,seeds[index]);
  for(const game of games.filter(game=>game.stage==='quadrangular'))participants[game.code]={homeEntryId:refs.get(game.homeRef)||null,awayEntryId:refs.get(game.awayRef)||null};
  const finalGames=games.filter(game=>game.stage==='quadrangular');
  const finalResults=seeded?finalGames.flatMap(game=>{
    const result=byResult.get(game.code),pair=participants[game.code];
    return result&&result.homeEntryId===pair.homeEntryId&&result.awayEntryId===pair.awayEntryId?[result]:[];
  }):[];
  const final=seeded?applyManualOrder(rankStandings(seeds,finalResults.map(ranked),breakers),manualOrders.final):null;
  const blocked:PositionCompetition['blocked']=!completeDraw?'draw':!completeGroups?'group_results':!canPair?'group_tiebreak':!allWinners?'quarterfinal_results':!seeded?'general_tiebreak':finalResults.length!==6?'quadrangular_results':final?.groups[0]?.unresolved?'final_tiebreak':null;
  return {groupA,groupB,general,final,participants,quarterfinalWinners:winners,seeds,official:{groups:groupResults.length,quarterfinals:quarterfinalGames.filter(game=>byResult.has(game.code)).length,quadrangular:finalResults.length},blocked};
}
