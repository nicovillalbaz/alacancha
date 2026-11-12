import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePositionCompetition, type PositionGame, type PositionResult } from '@torneos/shared';
import { fcfsPositionPlan } from '../scripts/fcfs-position-plan.ts';

test('Copa Caacupé: cada equipo juega una sola vez por jornada programada',()=>{
  const scheduled=fcfsPositionPlan.games.filter(game=>game.stage==='groups'&&game.jornadaNo!==null);
  const byDay=new Map<number,string[]>();
  for(const game of scheduled){const day=game.jornadaNo!;byDay.set(day,[...(byDay.get(day)||[]),game.homeRef,game.awayRef]);}
  for(const [day,teams] of byDay)assert.equal(new Set(teams).size,teams.length,`Jornada ${day}: equipo repetido`);
  assert.deepEqual(scheduled.filter(game=>game.jornadaNo===6).map(game=>[game.homeRef,game.awayRef]),[['A3','B3'],['A5','A1'],['A4','B4']]);
  assert.deepEqual(scheduled.filter(game=>game.jornadaNo===7).map(game=>[game.homeRef,game.awayRef]),[['A2','A3'],['B5','B1'],['B2','B3']]);
});

const slots=new Map(Array.from({length:10},(_,index)=>[`${index<5?'A':'B'}${index%5+1}`,`${index<5?'A':'B'}${index%5+1}`] as const));
const games:PositionGame[]=[];
const results:PositionResult[]=[];
for(const group of ['A','B'])for(let left=1;left<=5;left++)for(let right=left+1;right<=5;right++){
  const code=`G${String(games.length+1).padStart(2,'0')}`;
  games.push({code,stage:'groups',homeRef:`${group}${left}`,awayRef:`${group}${right}`});
  results.push({code,homeEntryId:`${group}${left}`,awayEntryId:`${group}${right}`,homeGoals:1,awayGoals:0,homePenalties:0,awayPenalties:0});
}
for(let position=1;position<=5;position++){
  const code=`G${String(games.length+1).padStart(2,'0')}`;
  games.push({code,stage:'groups',homeRef:`A${position}`,awayRef:`B${position}`});
  results.push({code,homeEntryId:`A${position}`,awayEntryId:`B${position}`,homeGoals:position===2?2:1,awayGoals:0,homePenalties:0,awayPenalties:0});
}
for(const [code,homeRef,awayRef] of [['MM1','1A','4B'],['MM2','1B','4A'],['MM3','2A','3B'],['MM4','2B','3A']])games.push({code,stage:'quarterfinal',homeRef,awayRef});
for(const [code,homeRef,awayRef] of [['Q1','S1','S4'],['Q2','S2','S3'],['Q3','S1','S3'],['Q4','S2','S4'],['Q5','S1','S2'],['Q6','S3','S4']])games.push({code,stage:'quadrangular',homeRef,awayRef});
const rules={points:{win:2,draw:1,loss:0},advanced:{tiebreakers:['wins','goal_difference','goals_for','manual_draw']}} as Parameters<typeof derivePositionCompetition>[3];

test('interserial cuenta para ambos grupos y solo los ganadores de cuartos reciben semilla',()=>{
  const first=derivePositionCompetition(slots,games,results,rules);
  assert.equal(first.official.groups,25);
  assert.equal(first.groupA.totals.find(team=>team.teamId==='A1')?.played,5);
  assert.equal(first.groupB.totals.find(team=>team.teamId==='B1')?.played,5);
  assert.equal(first.general.totals.find(team=>team.teamId==='A1')?.played,5);
  assert.equal(first.participants.MM1.homeEntryId,'A1');
  assert.equal(first.participants.MM1.awayEntryId,'B4');
  assert.equal(first.blocked,'quarterfinal_results');
  const quarterResults:PositionResult[]=[
    {code:'MM1',homeEntryId:'A1',awayEntryId:'B4',homeGoals:0,awayGoals:1,homePenalties:0,awayPenalties:0},
    {code:'MM2',homeEntryId:'B1',awayEntryId:'A4',homeGoals:1,awayGoals:0,homePenalties:0,awayPenalties:0},
    {code:'MM3',homeEntryId:'A2',awayEntryId:'B3',homeGoals:0,awayGoals:0,homePenalties:4,awayPenalties:3},
    {code:'MM4',homeEntryId:'B2',awayEntryId:'A3',homeGoals:1,awayGoals:0,homePenalties:0,awayPenalties:0},
  ];
  const progressed=derivePositionCompetition(slots,games,[...results,...quarterResults],rules);
  assert.equal(progressed.blocked,'quadrangular_results');
  assert.deepEqual(progressed.quarterfinalWinners,['B4','B1','A2','B2']);
  assert.deepEqual(progressed.seeds,['A2','B1','B2','B4']);
  assert.equal(progressed.seeds.includes('A1'),false);
  assert.deepEqual(progressed.participants.Q1,{homeEntryId:'A2',awayEntryId:'B4'});
  assert.deepEqual(progressed.participants.Q2,{homeEntryId:'B1',awayEntryId:'B2'});
});

test('un empate total espera órdenes manuales de grupos y general sin inventar posiciones',()=>{
  const drawn=results.map(result=>({...result,homeGoals:0,awayGoals:0}));
  const raw=derivePositionCompetition(slots,games,drawn,rules);
  assert.equal(raw.blocked,'group_tiebreak');
  assert.equal(raw.groupA.groups[0].unresolved,true);
  const groupOrders={A:new Map([[1,['A1','A2','A3','A4','A5']]]),B:new Map([[1,['B1','B2','B3','B4','B5']]])};
  const grouped=derivePositionCompetition(slots,games,drawn,rules,groupOrders);
  assert.equal(grouped.blocked,'quarterfinal_results');
  assert.deepEqual(grouped.participants.MM1,{homeEntryId:'A1',awayEntryId:'B4'});
  const quarterResults:PositionResult[]=[
    {code:'MM1',homeEntryId:'A1',awayEntryId:'B4',homeGoals:1,awayGoals:0,homePenalties:0,awayPenalties:0},
    {code:'MM2',homeEntryId:'B1',awayEntryId:'A4',homeGoals:1,awayGoals:0,homePenalties:0,awayPenalties:0},
    {code:'MM3',homeEntryId:'A2',awayEntryId:'B3',homeGoals:1,awayGoals:0,homePenalties:0,awayPenalties:0},
    {code:'MM4',homeEntryId:'B2',awayEntryId:'A3',homeGoals:1,awayGoals:0,homePenalties:0,awayPenalties:0},
  ];
  const waiting=derivePositionCompetition(slots,games,[...drawn,...quarterResults],rules,groupOrders);
  assert.equal(waiting.blocked,'general_tiebreak');
  const generalOrder=['A2','B1','B2','A1','A3','A4','A5','B3','B4','B5'];
  const resolved=derivePositionCompetition(slots,games,[...drawn,...quarterResults],rules,{...groupOrders,general:new Map([[1,generalOrder]])});
  assert.deepEqual(resolved.seeds,['A2','B1','B2','A1']);
  assert.deepEqual(resolved.participants.Q1,{homeEntryId:'A2',awayEntryId:'A1'});
  const invalid=derivePositionCompetition(slots,games,[...drawn,...quarterResults],rules,{...groupOrders,general:new Map([[1,['A2','A2']]])});
  assert.equal(invalid.blocked,'general_tiebreak');
});
