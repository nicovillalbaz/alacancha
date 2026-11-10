import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildApp} from '../apps/api/src/app.ts';
import {readConfig} from '../apps/api/src/config.ts';
import {createPool} from '@torneos/db';

const config=readConfig();
const destination=new URL(config.databaseUrl);
if(process.env.NODE_ENV==='production'||destination.hostname!=='127.0.0.1'||destination.port!=='55461'||destination.pathname!=='/torneos_local')throw new Error('Carga limitada a la base local de este proyecto.');
const orgName='Federación Caacupeña de Fútbol de Salón';
const tournamentName='Copa Caacupé - Cooperativa Serrana';
const assets:Record<string,string>={
  'Mc Cavi':'mc-cavi.png',
  '8 de Diciembre':'8-de-diciembre.png',
  'Juan Pablo II':'juan-pablo-ii.png',
  'Barrio Nuevo':'barrio-nuevo.png',
  'Mercury':'mercury.png',
  'Cosmos 04':'cosmos-04.png',
  'Ytororo':'ytororo.png',
  'Club Teniente Fariña':'teniente-farina.png',
  'Asociación de Jóvenes del Barrio Loma':'ajbl.png',
  'Sporting Cruzado':'sporting-cruzado.png',
};
const pool=createPool(config.databaseUrl);
const app=await buildApp(config,pool);
try{
  const {rows:teams}=await pool.query(`SELECT o.id organization_id,t.id team_id,t.name,t.shield_id
    FROM organizations o JOIN tournaments tr ON tr.organization_id=o.id JOIN editions ed ON ed.organization_id=tr.organization_id AND ed.tournament_id=tr.id
    JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id JOIN team_entries e ON e.organization_id=c.organization_id AND e.category_id=c.id
    JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id
    WHERE o.name=$1 AND tr.name=$2 ORDER BY t.name`,[orgName,tournamentName]);
  if(teams.length!==10||teams.some(team=>!(team.name in assets)))throw new Error('Los diez equipos locales no coinciden con el afiche; se detuvo la carga.');
  const {rows:[account]}=await pool.query(`SELECT u.username FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.organization_id=$1 AND m.role='tournament_admin' AND m.status='active' AND u.username=$2`,[teams[0].organization_id,'usuariofcfs']);
  if(!account)throw new Error('No se encontró la cuenta organizadora de FCFS.');
  const access=(await readFile(resolve('.local/fcfs-access.txt'),'utf8')).match(/^Contraseña: (.+)$/m)?.[1];
  if(!access)throw new Error('Falta el acceso local de FCFS.');
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:account.username,password:access}});
  if(login.statusCode!==200)throw new Error('No se pudo autenticar la cuenta organizadora.');
  const cookie=`torneos_session=${login.cookies[0].value}`;
  const context=await app.inject({method:'POST',url:'/api/v1/auth/context',headers:{cookie,'x-csrf-token':login.json().csrfToken},payload:{organizationId:teams[0].organization_id}});
  if(context.statusCode!==200)throw new Error('No se pudo seleccionar la organización.');
  const headers={cookie,'x-csrf-token':context.json().csrfToken};
  for(const team of teams){
    if(team.shield_id){console.log(`${team.name}: ya tiene escudo; no se reemplazó`);continue;}
    const file=assets[team.name];
    const image=await readFile(resolve('img/FCFS/escudos',file));
    const boundary=`fcfs-shield-${randomUUID()}`;
    const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file}"\r\nContent-Type: image/png\r\n\r\n`),image,Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const uploaded=await app.inject({method:'POST',url:`/api/v1/organizations/${team.organization_id}/teams/${team.team_id}/shield`,headers:{...headers,'content-type':`multipart/form-data; boundary=${boundary}`},payload});
    if(uploaded.statusCode!==201)throw new Error(`No se pudo cargar ${team.name}: ${uploaded.statusCode} ${uploaded.body}`);
    console.log(`${team.name}: escudo cargado`);
  }
  const {rows:[verified]}=await pool.query(`SELECT count(*)::int total FROM organizations o JOIN tournaments tr ON tr.organization_id=o.id JOIN editions ed ON ed.organization_id=tr.organization_id AND ed.tournament_id=tr.id JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id JOIN team_entries e ON e.organization_id=c.organization_id AND e.category_id=c.id JOIN teams t ON t.organization_id=e.organization_id AND t.id=e.team_id WHERE o.name=$1 AND tr.name=$2 AND t.shield_id IS NOT NULL`,[orgName,tournamentName]);
  if(verified.total!==10)throw new Error(`Solo ${verified.total}/10 escudos quedaron asociados.`);
  console.log('Verificados 10/10 escudos en los equipos de Copa Caacupé.');
}finally{await app.close();await pool.end();}
