import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoundRobin } from '../apps/api/src/undated-fixture-routes.ts';

const teams='ABCDEFGHIJ'.split('').map((_,index)=>`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`);
const pairs=['AH BC DG EF JI','CA FJ GE HD IB','AI BF DC HG JE','CH EB FA GJ ID','AE BJ CG DF HI','ED FH GB IC JA','AB CF DJ HE IG','AG BD EC FI JH','CJ DA GF HB IE'];
const rounds=pairs.map((line,index)=>({ordinal:index+1,matches:line.split(' ').map(pair=>({homeEntryId:teams[pair.charCodeAt(0)-65],awayEntryId:teams[pair.charCodeAt(1)-65]}))}));
const fail=(_status:number,code:string):never=>{throw new Error(code);};

test('la hoja de Sanber forma una rueda única de 45 cruces',()=>{
  assert.doesNotThrow(()=>validateRoundRobin(rounds,teams,8,fail));
});
test('rechaza un equipo repetido en una jornada',()=>{
  const altered=structuredClone(rounds);altered[0].matches[1].homeEntryId=altered[0].matches[0].homeEntryId;
  assert.throws(()=>validateRoundRobin(altered,teams,8,fail),/FIXTURE_TEAMS/);
});
test('rechaza una pareja repetida aunque cada jornada tenga diez equipos',()=>{
  const altered=structuredClone(rounds);altered[1].matches[0]={homeEntryId:rounds[0].matches[0].homeEntryId,awayEntryId:rounds[0].matches[0].awayEntryId};
  assert.throws(()=>validateRoundRobin(altered,teams,8,fail),/FIXTURE_TEAMS|FIXTURE_PAIR/);
});
