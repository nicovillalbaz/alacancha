import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { createPool } from '@torneos/db';
import { ruleSchema } from '@torneos/shared';
import { csrfFor, digest, opaqueToken } from '../apps/api/src/security.ts';

const config = readConfig();
const target = process.env.FSBFS_IMPORT;
const database = new URL(config.databaseUrl);
if (process.env.NODE_ENV !== 'production' || !['production', 'rehearsal'].includes(target || '') ||
    database.hostname !== '127.0.0.1' || database.pathname !== (target === 'production' ? '/torneos_prod' : '/torneos_fsbfs_rehearsal') ||
    config.origin !== 'https://alacancha.top') throw new Error('Destino FSBFS no autorizado.');
const assets = resolve(process.env.FSBFS_ASSET_DIR || '/srv/torneos/import-assets-fsbfs/FSBFS');
const privateFile = resolve(`/srv/torneos/private/fsbfs-access-${target}.txt`);
const organizationName = 'Federación San Bernardinense de Fútbol de Salón';
const tournamentName = 'Copa Sanber';
const username = 'usuariofsbfs';
const organizationLogo = '615424389_122199289082369201_3548612563604717913_n.jpg';
const cupLogo = 'WhatsApp Image 2026-11-12 at 09.44.56.jpeg';
const clubs = [
  { name:'Deportivo Puerta del Lago', color:'#1C548B', file:'WhatsApp Image 2026-11-12 at 09.39.11.jpeg' },
  { name:'Sport Center', color:'#1E5C95', file:'WhatsApp Image 2026-11-12 at 09.39.11 (1).jpeg' },
  { name:'Sport Santa Lucía', color:'#213E8D', file:'WhatsApp Image 2026-11-12 at 09.39.12.jpeg' },
  { name:'San Cristóbal', color:'#7A182D', file:'WhatsApp Image 2026-11-12 at 09.39.12 (1).jpeg' },
  { name:'Concepción Fútbol Club', color:'#C42B32', file:'WhatsApp Image 2026-11-12 at 09.39.12 (2).jpeg' },
  { name:'3 de Febrero', color:'#BC242D', file:'WhatsApp Image 2026-11-12 at 09.39.12 (3).jpeg' },
  { name:'Los Russia FC', color:'#A51B27', file:'WhatsApp Image 2026-11-12 at 09.39.13.jpeg' },
  { name:'Villa Delfina', color:'#254990', file:'WhatsApp Image 2026-11-12 at 09.39.13 (1).jpeg' },
  { name:'Santa Rosa FC', color:'#BD2529', file:'WhatsApp Image 2026-11-12 at 09.39.14.jpeg' },
  { name:'Sport Comando', color:'#168C54', file:'WhatsApp Image 2026-11-12 at 09.42.21.jpeg' },
] as const;
const key = (label:string) => {
  const hex=createHash('sha256').update(`fsbfs:2026:${label}`).digest('hex').slice(0,32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
};
// The API requires an initial rule document. It stays private and in draft;
// none of these values represent an approved competition format.
const rules=ruleSchema.parse({
  initialPhase:null,competitionPlan:null,playersOnField:5,minimumToStart:4,minimumToContinue:3,
  maxMatchRoster:12,maxBenchPlayers:7,maxBenchStaff:3,
  lineupRoles:{goalkeeperRequired:false,captainRequired:false},maxRegisteredPlayers:null,
  substitutions:{mode:'unlimited',maxChanges:null,maxWindows:null,reentry:true},
  eligibility:{age:null,requiredDocuments:[],registrationWindow:null,transferProof:{requiredFor:'none',label:'Comprobante de pase'},registrationFields:[]},
  advanced:{tiebreakers:['head_to_head_points','goal_difference','goals_for','wins','manual_draw'],discipline:{yellowCards:true,redCards:true,secondYellowRed:false,yellowAccumulation:null,redReviewRequired:false},walkover:{enabled:false,winnerGoals:null,loserGoals:null,winnerPoints:null,loserPoints:null}},
  periods:[{name:'Primer tiempo',minutes:20},{name:'Segundo tiempo',minutes:20}],points:{win:2,draw:1,loss:0},
});
const pool=createPool(config.databaseUrl);
const app=await buildApp(config,pool);
let ownerSessionId='',organizerSessionToken='';
try {
  for(const file of [organizationLogo,cupLogo,...clubs.map(club=>club.file)]){
    const bytes=await readFile(resolve(assets,file));
    if(bytes.length<100||bytes.length>2*1024*1024||bytes[0]!==0xff||bytes[1]!==0xd8)throw new Error(`Imagen JPEG inválida: ${file}`);
  }
  const {rows:[owner],rowCount:ownerCount}=await pool.query('SELECT id FROM users WHERE platform_admin=true AND disabled_at IS NULL');
  if(ownerCount!==1)throw new Error('Se necesita exactamente un superadmin activo.');
  const {rows:existingOrganizations}=await pool.query('SELECT id FROM organizations WHERE name=$1',[organizationName]);
  if(existingOrganizations.length>1)throw new Error('Organización FSBFS duplicada.');
  const {rows:existingUsers}=await pool.query(`SELECT o.id,o.name,m.id membership_id,m.status,u.password_hash FROM users u JOIN memberships m ON m.user_id=u.id JOIN organizations o ON o.id=m.organization_id WHERE lower(u.username)=lower($1)`,[username]);
  if(existingUsers.length>1||(existingUsers.length===1&&existingUsers[0].name!==organizationName))throw new Error('El usuario ya pertenece a otra organización.');
  if(existingOrganizations.length&&(!existingUsers.length||existingUsers[0].id!==existingOrganizations[0].id))throw new Error('Organización preexistente sin el administrador previsto; revisión manual.');
  const saved=await readFile(privateFile,'utf8').catch(()=> '');
  const password=saved.match(/^Contraseña: (.+)$/m)?.[1]||`FSBFS!${randomBytes(18).toString('base64url')}`;
  if(!saved){await mkdir(resolve('/srv/torneos/private'),{recursive:true,mode:0o700});await writeFile(privateFile,`Usuario: ${username}\nContraseña: ${password}\nAcceso: ${config.origin}/acceso\n`,{flag:'wx',mode:0o600});}
  const ownerToken=opaqueToken();ownerSessionId=randomUUID();
  await pool.query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[ownerSessionId,owner.id,digest(ownerToken)]);
  const ownerHeaders={cookie:`torneos_session=${ownerToken}`,'x-csrf-token':csrfFor(config.appSecret,ownerToken)};
  const call=async(method:'GET'|'POST'|'PATCH',path:string,payload?:unknown,headers:Record<string,string>=ownerHeaders)=>{
    const response=await app.inject({method,url:`/api/v1${path}`,headers,payload:payload as any});
    if(response.statusCode>=400)throw new Error(`${method} ${path}: ${response.statusCode} ${response.body}`);
    return response.json() as any;
  };
  let organizationId:string,membershipId:string;
  if(existingUsers.length){organizationId=existingUsers[0].id;membershipId=existingUsers[0].membership_id;}
  else{const created=await call('POST','/admin/organizations',{name:organizationName,administratorName:'Administración FSBFS',username,requestId:key('organization')});organizationId=created.organizationId;membershipId=created.membershipId;}
  if(!existingUsers.length||existingUsers[0].status!=='active')await call('POST',`/admin/memberships/${membershipId}/access`,{status:'active',version:1,reason:'Preparación Copa Sanber'});
  let login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username,password}});
  if(login.statusCode!==200){
    if(existingUsers.length&&existingUsers[0].password_hash)throw new Error('La cuenta ya tiene otra contraseña. No se cambia automáticamente.');
    const invitation=await call('POST',`/admin/memberships/${membershipId}/invitation`);
    const accepted=await app.inject({method:'POST',url:'/api/v1/invitations/accept',payload:{token:invitation.token,password}});
    if(accepted.statusCode!==200)throw new Error(`No se pudo activar la cuenta: ${accepted.statusCode} ${accepted.body}`);
    login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username,password}});
  }
  if(login.statusCode!==200)throw new Error('No se pudo iniciar sesión organizadora.');
  organizerSessionToken=login.cookies[0].value;
  const cookie=`torneos_session=${organizerSessionToken}`;
  let organizerHeaders={cookie,'x-csrf-token':login.json().csrfToken as string};
  const context=await call('POST','/auth/context',{organizationId},organizerHeaders);
  organizerHeaders={cookie,'x-csrf-token':context.csrfToken as string};
  const base=`/organizations/${organizationId}`;
  const upload=async(path:string,file:string)=>{
    const bytes=await readFile(resolve(assets,file)),boundary=`fsbfs-${randomUUID()}`;
    const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="shield.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const result=await app.inject({method:'POST',url:`/api/v1${path}`,headers:{...organizerHeaders,'content-type':`multipart/form-data; boundary=${boundary}`},payload});
    if(result.statusCode!==201)throw new Error(`Imagen ${file}: ${result.statusCode} ${result.body}`);
  };
  const {rows:[org]}=await pool.query('SELECT logo_id,name,accent,version FROM organizations WHERE id=$1',[organizationId]);
  if(!org.logo_id)await upload(`${base}/logo`,organizationLogo);
  if(org.accent!=='#142D59'){
    const {rows:[latest]}=await pool.query('SELECT version FROM organizations WHERE id=$1',[organizationId]);
    await call('PATCH',`${base}/branding`,{name:organizationName,accent:'#142D59',version:latest.version},organizerHeaders);
  }
  const {rows:[existingTournament]}=await pool.query(`SELECT t.id "tournamentId",c.id "categoryId" FROM tournaments t JOIN editions e ON e.organization_id=t.organization_id AND e.tournament_id=t.id JOIN categories c ON c.organization_id=e.organization_id AND c.edition_id=e.id WHERE t.organization_id=$1 AND t.request_key=$2 AND e.name='2026' LIMIT 1`,[organizationId,key('tournament')]);
  const tournament=existingTournament||await call('POST',`${base}/tournaments`,{requestId:key('tournament'),name:tournamentName,timezone:'America/Asuncion',editionName:'2026',categoryName:'Primera',preset:'personalizado',teamLimit:null,rules,paymentRates:{yellowGuaranies:0,redGuaranies:0}},organizerHeaders);
  const {tournamentId,categoryId}=tournament;
  const {rows:[emblem]}=await pool.query('SELECT emblem_id,public_slug FROM tournaments WHERE organization_id=$1 AND id=$2',[organizationId,tournamentId]);
  if(!emblem.emblem_id)await upload(`${base}/tournaments/${tournamentId}/emblem`,cupLogo);
  if(emblem.public_slug!=='copa-sanber')await call('PATCH',`${base}/tournaments/${tournamentId}/public-slug`,{slug:'copa-sanber'},organizerHeaders);
  for(const [index,club] of clubs.entries()){
    const requestId=key(`team:${index+1}`);
    const {rows:[existing]}=await pool.query('SELECT id FROM teams WHERE organization_id=$1 AND request_key=$2',[organizationId,requestId]);
    const team=existing?{teamId:existing.id}:await call('POST',`${base}/teams`,{requestId,name:club.name,color:club.color,categoryId},organizerHeaders);
    const {rows:[current]}=await pool.query('SELECT shield_id FROM teams WHERE organization_id=$1 AND id=$2',[organizationId,team.teamId]);
    if(!current.shield_id)await upload(`${base}/teams/${team.teamId}/shield`,club.file);
  }
  const {rows:[state]}=await pool.query(`SELECT t.status,t.public_preview_at,rv.status rule_status,rv.rules->'initialPhase' initial_phase,rv.rules->'competitionPlan' competition_plan,(SELECT count(*)::int FROM team_entries WHERE organization_id=$1 AND category_id=$2) team_count,(SELECT count(*)::int FROM draft_matches WHERE organization_id=$1 AND category_id=$2) match_count,(SELECT count(*)::int FROM teams tm JOIN team_entries te ON te.organization_id=tm.organization_id AND te.team_id=tm.id WHERE te.organization_id=$1 AND te.category_id=$2 AND tm.shield_id IS NOT NULL) shield_count FROM tournaments t JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id JOIN rule_versions rv ON rv.organization_id=c.organization_id AND rv.category_id=c.id WHERE t.organization_id=$1 AND t.id=$3 AND c.id=$2 ORDER BY rv.version DESC LIMIT 1`,[organizationId,categoryId,tournamentId]);
  if(state.status!=='draft'||state.rule_status!=='draft'||state.initial_phase!==null||state.competition_plan!==null||state.team_count!==10||state.shield_count!==10||state.match_count!==0)throw new Error('Estado deportivo inesperado; no se hace pública la Copa.');
  if(!state.public_preview_at)await call('PATCH',`${base}/tournaments/${tournamentId}/public-preview`,{publicVisible:true},organizerHeaders);
  const publicPage=await call('GET',`/public/organizations/${organizationId}/tournaments`,undefined,{});
  if(publicPage.tournaments.length!==1||!publicPage.tournaments[0].presentation_only||publicPage.teams.length!==10)throw new Error('La presentación pública no muestra exactamente la Copa y los diez equipos.');
  for(const path of [`/public/organizations/${organizationId}/logo`,`/public/organizations/${organizationId}/tournaments/${tournamentId}/emblem`,...publicPage.teams.map((team:{id:string})=>`/public/organizations/${organizationId}/teams/${team.id}/shield`)]){
    const image=await app.inject({method:'GET',url:`/api/v1${path}`});if(image.statusCode!==200)throw new Error(`Imagen pública inaccesible: ${path}: ${image.statusCode}`);
  }
  const {rows:[published]}=await pool.query('SELECT count(*)::int total FROM matchdays md JOIN categories c ON c.organization_id=md.organization_id AND c.edition_id=md.edition_id WHERE md.organization_id=$1 AND c.id=$2',[organizationId,categoryId]);
  if(published.total!==0)throw new Error('Se encontraron jornadas inesperadas.');
  console.log(JSON.stringify({organizationId,tournamentId,categoryId,teams:state.team_count,shields:state.shield_count,fixtureMatches:0,format:'pending',publicVisible:true,url:`${config.origin}/copa-sanber`,accessFile:privateFile}));
}finally{
  if(ownerSessionId)await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[ownerSessionId]);
  if(organizerSessionToken)await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[digest(organizerSessionToken)]);
  await app.close();await pool.end();
}
