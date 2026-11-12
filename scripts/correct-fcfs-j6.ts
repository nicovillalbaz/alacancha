import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { audit, createPool, transaction } from '@torneos/db';

const [mode,slug]=process.argv.slice(2);
if(!['--inspect','--apply'].includes(mode)||!slug||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Uso: --inspect|--apply alias-publico');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL es obligatorio.');
if(mode==='--apply'&&process.env.FCFS_J6_CORRECTION!=='apply')throw new Error('FCFS_J6_CORRECTION=apply es obligatorio para modificar.');

type Game={id:string;code:string;stage:string;sporting_round:string;home_ref:string;away_ref:string;jornada_no:number|null;planned_date:string|null};
type Plan={id:string;organization_id:string;category_id:string;revision:number;tournament_name:string};
type Publication={revision:number;snapshot:{games:Array<Omit<Game,'id'>>;[key:string]:unknown}};
const expected={
  G17:{home:'A2',away:'A3',beforeDay:6,beforeDate:'2026-12-01',afterDay:7,afterDate:'2026-12-03'},
  G20:{home:'A4',away:'B4',beforeDay:7,beforeDate:'2026-12-03',afterDay:6,afterDate:'2026-12-01'},
} as const;
const pool=createPool(process.env.DATABASE_URL);

async function read(client:PoolClient,lock:boolean){
  const {rows:plans}=await client.query<Plan>(`SELECT b.id,b.organization_id,b.category_id,b.revision,t.name tournament_name
    FROM tournaments t JOIN editions e ON e.organization_id=t.organization_id AND e.tournament_id=t.id
    JOIN categories c ON c.organization_id=e.organization_id AND c.edition_id=e.id
    JOIN fixture_position_blueprints b ON b.organization_id=c.organization_id AND b.category_id=c.id
    WHERE t.public_slug=$1${lock?' FOR UPDATE OF b':''}`,[slug]);
  if(plans.length!==1)throw new Error(`Se esperaba un plan único para ${slug}; se encontraron ${plans.length}.`);
  const plan=plans[0];
  const {rows:games}=await client.query<Game>(`SELECT id,code,stage,sporting_round,home_ref,away_ref,jornada_no,to_char(planned_date,'YYYY-MM-DD') planned_date
    FROM fixture_position_games WHERE organization_id=$1 AND blueprint_id=$2 ORDER BY ordinal${lock?' FOR UPDATE':''}`,[plan.organization_id,plan.id]);
  const {rows:[publication]}=await client.query<Publication>(`SELECT revision,snapshot FROM fixture_position_publications
    WHERE organization_id=$1 AND blueprint_id=$2 ORDER BY revision DESC LIMIT 1`,[plan.organization_id,plan.id]);
  if(!publication)throw new Error('El plan todavía no tiene publicación pública.');
  const {rows:[linked]}=await client.query<{total:number}>(`SELECT count(*)::int total FROM draft_matches m JOIN fixture_position_games g
    ON g.organization_id=m.organization_id AND g.id=m.position_game_id
    WHERE g.organization_id=$1 AND g.blueprint_id=$2`,[plan.organization_id,plan.id]);
  return {plan,games,publication,linkedMatches:linked.total};
}

function verify(data:Awaited<ReturnType<typeof read>>){
  const {games,publication,plan}=data;
  if(plan.revision!==publication.revision)throw new Error('Hay cambios privados posteriores a la publicación; se requiere revisión manual.');
  if(games.length!==35||publication.snapshot.games.length!==35)throw new Error('El plan no tiene los 35 cruces previstos.');
  const targets=Object.entries(expected).map(([code,rule])=>{
    const game=games.find(item=>item.code===code),publicGame=publication.snapshot.games.find(item=>item.code===code);
    if(!game||!publicGame||game.stage!=='groups'||game.sporting_round!=='F4'||game.home_ref!==rule.home||game.away_ref!==rule.away||publicGame.home_ref!==rule.home||publicGame.away_ref!==rule.away)throw new Error(`El cruce ${code} no coincide con el plan esperado.`);
    if(game.jornada_no!==publicGame.jornada_no||game.planned_date!==publicGame.planned_date)throw new Error(`El cruce ${code} privado y público no coincide.`);
    const before=game.jornada_no===rule.beforeDay&&game.planned_date===rule.beforeDate;
    const after=game.jornada_no===rule.afterDay&&game.planned_date===rule.afterDate;
    if(!before&&!after)throw new Error(`El cruce ${code} tiene otra programación.`);
    return {code,before,after};
  });
  if(targets.some(item=>item.before)&&targets.some(item=>item.after))throw new Error('La corrección está aplicada solo a uno de los cruces.');
  const corrected=targets.every(item=>item.after);
  const scheduled=games.filter(game=>game.stage==='groups'&&game.jornada_no!==null).map(game=>({
    day:corrected?game.jornada_no!:expected[game.code as keyof typeof expected]?.afterDay??game.jornada_no!,
    home:game.home_ref,away:game.away_ref,
  }));
  for(const day of new Set(scheduled.map(item=>item.day))){
    const refs=scheduled.filter(item=>item.day===day).flatMap(item=>[item.home,item.away]);
    if(refs.length!==new Set(refs).size)throw new Error(`Hay un equipo repetido en la jornada ${day}.`);
  }
  return {corrected,targets};
}

try{
  if(mode==='--inspect'){
    const client=await pool.connect();
    try{const data=await read(client,false);const state=verify(data);console.log(JSON.stringify({tournament:data.plan.tournament_name,organizationId:data.plan.organization_id,categoryId:data.plan.category_id,revision:data.plan.revision,linkedMatches:data.linkedMatches,...state}));}
    finally{client.release();}
  }else{
    const result=await transaction(pool,async client=>{
      const data=await read(client,true),state=verify(data);
      if(state.corrected)return {changed:false,revision:data.plan.revision};
      if(data.linkedMatches!==0)throw new Error('Ya hay partidos oficiales vinculados; no se modifica el plan automáticamente.');
      const {rows:[actor]}=await client.query<{id:string}>("SELECT id FROM users WHERE username='superadmin' AND platform_admin=true AND disabled_at IS NULL");
      if(!actor)throw new Error('No se encontró una cuenta técnica de superadministración activa.');
      for(const [code,rule] of Object.entries(expected))await client.query(`UPDATE fixture_position_games SET jornada_no=$4,planned_date=$5::date
        WHERE organization_id=$1 AND blueprint_id=$2 AND code=$3`,[data.plan.organization_id,data.plan.id,code,rule.afterDay,rule.afterDate]);
      const revision=data.plan.revision+1;
      await client.query('UPDATE fixture_position_blueprints SET revision=$3 WHERE organization_id=$1 AND id=$2',[data.plan.organization_id,data.plan.id,revision]);
      const snapshot={...data.publication.snapshot,games:data.publication.snapshot.games.map(game=>{
        const rule=expected[game.code as keyof typeof expected];
        return rule?{...game,jornada_no:rule.afterDay,planned_date:rule.afterDate}:game;
      })};
      const publicationId=randomUUID();
      await client.query(`INSERT INTO fixture_position_publications(id,organization_id,blueprint_id,revision,snapshot,published_by)
        VALUES($1,$2,$3,$4,$5,$6)`,[publicationId,data.plan.organization_id,data.plan.id,revision,JSON.stringify(snapshot),actor.id]);
      await audit(client,actor.id,data.plan.organization_id,'fixture.position_schedule_corrected',data.plan.id,'Corrección confirmada: A4–B4 a J6 y A2–A3 a J7; sin repetir equipos por jornada',
        {revision:data.plan.revision,games:state.targets},{revision,games:[{code:'G17',jornada:7,date:'2026-12-03'},{code:'G20',jornada:6,date:'2026-12-01'}],publicationId});
      return {changed:true,revision,publicationId};
    });
    console.log(JSON.stringify(result));
  }
}finally{await pool.end();}
