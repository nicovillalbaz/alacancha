import {strict as assert} from 'node:assert';
import {createPool} from '@torneos/db';
import {buildApp} from '../apps/api/src/app.ts';
import {readConfig} from '../apps/api/src/config.ts';
import {seedIds} from '../packages/db/src/seed.ts';
import {loadFlyerSource} from '../apps/api/src/flyer-source.ts';
import {renderFlyerSvg} from '../apps/api/src/flyer-template.ts';

const config=readConfig(),pool=createPool(config.databaseUrl),app=await buildApp(config,pool);
try{
  const names=['Copa por grupos · Finalizada 2026','Copa eliminación · Finalizada 2026','Liguilla y eliminación · Finalizada 2026'];
  const fixtureResponse=await app.inject({method:'GET',url:`/api/v1/public/organizations/${seedIds.a}/fixture`});assert.equal(fixtureResponse.statusCode,200,fixtureResponse.body);
  const bracketResponse=await app.inject({method:'GET',url:`/api/v1/public/organizations/${seedIds.a}/brackets`});assert.equal(bracketResponse.statusCode,200,bracketResponse.body);
  const days=fixtureResponse.json() as Array<{tournament_id:string;matches:Array<{id:string;tie_leg:string|null;result:{status:string;score:{home:number;away:number};shootout:{home:number;away:number}}|null}>}>;
  const brackets=bracketResponse.json() as Array<{tournament_id:string;category_id:string;slots:Array<{stage:number;twoLegs:boolean;resolution:string;homeScore:number|null;awayScore:number|null;scoreLabel:string|null;winnerSide:string|null;matchId:string|null;matchIds:{first:string|null;second:string|null;third:string|null};legs:Array<{label:string;matchId:string|null}>;shootout:{home:number;away:number}|null}>}>;
  for(const name of names){
    const {rows:[tournament]}=await pool.query('SELECT id FROM tournaments WHERE organization_id=$1 AND name=$2',[seedIds.a,name]);assert.ok(tournament,`Falta ${name}`);
    const ownDays=days.filter(day=>day.tournament_id===tournament.id),ownBracket=brackets.find(item=>item.tournament_id===tournament.id);
    assert.ok(ownDays.length>0,`Sin fechas públicas: ${name}`);assert.ok(ownBracket,`Sin cuadro público: ${name}`);
    assert.ok(ownDays.every(day=>day.matches.every(match=>match.result?.status==='official')),`Actas pendientes: ${name}`);
    assert.ok(ownBracket!.slots.every(slot=>slot.winnerSide),`Llaves pendientes: ${name}`);
    const statsResponse=await app.inject({method:'GET',url:`/api/v1/public/organizations/${seedIds.a}/categories/${ownBracket!.category_id}/statistics`});assert.equal(statsResponse.statusCode,200,statsResponse.body);
    const stats=statsResponse.json() as {officialMatches:number;tables:Array<{rows:Array<{played:number}>}>;scorers:Array<{goals:number}>;defense:Array<{played:number;goalsAgainst:number}>};
    const publicMatches=ownDays.flatMap(day=>day.matches);
    for(const match of publicMatches.filter(item=>item.result&&(item.result.shootout.home>0||item.result.shootout.away>0))){
      const result=await loadFlyerSource(pool,seedIds.a,'result',match.id,'square',1,null);
      assert.deepEqual(result.shootout,match.result!.shootout);
      assert.match(renderFlyerSvg(result,'square','forest'),new RegExp(`Penales ${result.shootout!.home} : ${result.shootout!.away}`));
    }
    const ordinary=publicMatches.find(item=>item.result&&item.result.shootout.home===0&&item.result.shootout.away===0);
    if(ordinary){const result=await loadFlyerSource(pool,seedIds.a,'result',ordinary.id,'square',1,null);assert.equal(result.shootout,undefined);assert.doesNotMatch(renderFlyerSvg(result,'square','forest'),/Penales/);}
    const publicMatchIds=new Set(publicMatches.map(match=>match.id));
    const bracketMatchIds=ownBracket!.slots.flatMap(slot=>Object.values(slot.matchIds).filter((id):id is string=>!!id));
    assert.ok(bracketMatchIds.length>0&&bracketMatchIds.every(id=>publicMatchIds.has(id)),`El cuadro no abre sus partidos publicados: ${name}`);
    assert.ok(ownBracket!.slots.every(slot=>slot.matchId===(slot.matchIds.third||slot.matchIds.second||slot.matchIds.first)),`Partido principal incorrecto en el cuadro: ${name}`);
    assert.ok(ownBracket!.slots.every(slot=>slot.legs.every(leg=>!leg.matchId||publicMatchIds.has(leg.matchId))),`Una ida o vuelta no corresponde al fixture público: ${name}`);
    assert.equal(stats.officialMatches,publicMatches.length);
    assert.equal(stats.defense.reduce((sum,row)=>sum+row.played,0),publicMatches.length*2,`Valla sin partidos eliminatorios: ${name}`);
    const goals=publicMatches.reduce((sum,match)=>sum+(match.result?.score.home||0)+(match.result?.score.away||0),0);
    assert.equal(stats.scorers.reduce((sum,row)=>sum+row.goals,0),goals,`Goleadores sin partidos eliminatorios: ${name}`);
    assert.equal(stats.defense.reduce((sum,row)=>sum+row.goalsAgainst,0),goals,`Goles recibidos incompletos: ${name}`);
    if(name.startsWith('Copa por grupos')){
      const first=await loadFlyerSource(pool,seedIds.a,'standings',ownBracket!.category_id,'square',1,null);
      const second=await loadFlyerSource(pool,seedIds.a,'standings',ownBracket!.category_id,'square',2,null);
      assert.deepEqual(first.pageLabels,['Grupo 1','Grupo 2']);
      assert.equal(first.subline,'Grupo 1');assert.equal(second.subline,'Grupo 2');
      assert.equal(first.lines.length,4);assert.equal(second.lines.length,4);
      assert.equal(new Set([...first.lines,...second.lines].map(line=>line.homeName)).size,8,'Un equipo aparece en ambos flyers de grupo');
    }
    console.log(JSON.stringify({name,tournamentId:tournament.id,dates:ownDays.length,partidos:ownDays.flatMap(day=>day.matches).length,llaves:ownBracket!.slots.length,penales:ownDays.flatMap(day=>day.matches).filter(match=>match.result&&(match.result.shootout.home||match.result.shootout.away)).length}));
    if(name.startsWith('Copa eliminación'))assert.ok(ownBracket!.slots.some(slot=>slot.twoLegs&&slot.resolution==='aggregate'&&slot.shootout&&slot.scoreLabel==='Penales'));
    if(name.startsWith('Liguilla')){
      assert.equal(stats.tables.flatMap(table=>table.rows).reduce((sum,row)=>sum+row.played,0),12,'La tabla de liguilla no debe incluir eliminación');
      assert.ok(ownBracket!.slots.some(slot=>slot.resolution==='match_points_third'&&slot.legs.some(leg=>leg.label==='Desempate')&&slot.scoreLabel==='Desempate'&&slot.homeScore===2&&slot.awayScore===1));
      assert.ok(ownBracket!.slots.some(slot=>slot.resolution==='match_points_penalties'&&slot.shootout&&slot.scoreLabel==='Penales'&&slot.homeScore===5&&slot.awayScore===4));
      assert.ok(ownDays.flatMap(day=>day.matches).some(match=>match.tie_leg==='Desempate'));
    }
  }
}finally{await app.close();await pool.end();}
