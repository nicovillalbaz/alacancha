import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { createPool } from '@torneos/db';
import { digest } from '../apps/api/src/security.ts';

const target=process.env.FSBFS_LOGO_REFRESH;
const config=readConfig(), database=new URL(config.databaseUrl);
const expected=target==='production'?'torneos_prod':target==='rehearsal'?'torneos_fsbfs_logo_rehearsal':'';
if(process.env.NODE_ENV!=='production'||!expected||database.hostname!=='127.0.0.1'||database.pathname!==`/${expected}`||config.origin!=='https://alacancha.top')throw new Error('Destino FSBFS no autorizado.');
const org='7a8be048-ffce-4e14-9213-cb0d902e326d';
const tournament='5edc2433-5833-4eb4-9c6b-53971f6454aa';
const assetDir=resolve(process.env.FSBFS_ASSET_DIR||'/srv/torneos/app/img/FSBFS/logos-blanco');
const images=[
  ['Deportivo Puerta del Lago','deportivo-puerta-del-lago'],['Sport Center','sport-center'],
  ['Sport Santa Lucía','sport-santa-lucia'],['San Cristóbal','san-cristobal'],
  ['Concepción Fútbol Club','concepcion'],['3 de Febrero','3-de-febrero'],
  ['Los Russia FC','los-russia'],['Villa Delfina','villa-delfina'],
  ['Santa Rosa FC','santa-rosa'],['Sport Comando','sport-comando'],
] as const;
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
const source=new Map<string,Buffer>();
for(const stem of ['federacion-san-bernardino','copa-sanber',...images.map(image=>image[1])]){
  const bytes=await readFile(resolve(assetDir,`${stem}.png`));
  if(bytes.length<100||bytes.length>2*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)!==512||bytes.readUInt32BE(20)!==512)throw new Error(`PNG inesperado: ${stem}`);
  source.set(stem,bytes);
}
const pool=createPool(config.databaseUrl),app=await buildApp(config,pool);
let token='';
try{
  const {rows:[organization]}=await pool.query('SELECT id,name,logo_id FROM organizations WHERE id=$1',[org]);
  const {rows:[cup]}=await pool.query('SELECT id,name,emblem_id FROM tournaments WHERE organization_id=$1 AND id=$2',[org,tournament]);
  const {rows:teams}=await pool.query('SELECT id,name,shield_id FROM teams WHERE organization_id=$1 ORDER BY name',[org]);
  if(organization?.name!=='Federación San Bernardinense de Fútbol de Salón'||cup?.name!=='Copa Sanber'||teams.length!==10||images.some(([name])=>!teams.some(team=>team.name===name)))throw new Error('Identidad FSBFS inesperada.');
  const saved=await readFile('/srv/torneos/private/fsbfs-access-production.txt','utf8');
  const password=saved.match(/^Contraseña: (.+)$/m)?.[1];
  if(!password)throw new Error('Falta el acceso privado de FSBFS.');
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'usuariofsbfs',password}});
  if(login.statusCode!==200)throw new Error(`Ingreso organizador: ${login.statusCode}`);
  token=login.cookies.find(cookie=>cookie.name==='torneos_session')?.value||'';
  if(!token)throw new Error('Falta sesión organizadora.');
  const cookie=`torneos_session=${token}`;
  const context=await app.inject({method:'POST',url:'/api/v1/auth/context',headers:{cookie,'x-csrf-token':login.json().csrfToken},payload:{organizationId:org}});
  if(context.statusCode!==200)throw new Error(`Contexto organizador: ${context.statusCode}`);
  const headers={cookie,'x-csrf-token':context.json().csrfToken};
  const denied=await app.inject({method:'POST',url:'/api/v1/organizations/85b89c2d-d78a-4a23-81e3-ce0ba9272c40/logo',headers});
  if(denied.statusCode!==403)throw new Error(`Permiso entre organizaciones inesperado: ${denied.statusCode}`);
  const currentChecksum=async(id:string|null)=>id?(await pool.query('SELECT checksum FROM media WHERE organization_id=$1 AND id=$2',[org,id])).rows[0]?.checksum:null;
  const upload=async(path:string,stem:string,previous:string|null)=>{
    const bytes=source.get(stem)!;
    if(await currentChecksum(previous)===hash(bytes))return {stem,updated:false};
    const boundary=`fsbfs-logo-${randomUUID()}`;
    const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${stem}.png"\r\nContent-Type: image/png\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const response=await app.inject({method:'POST',url:`/api/v1/organizations/${org}/${path}`,headers:{...headers,'content-type':`multipart/form-data; boundary=${boundary}`},payload});
    if(response.statusCode!==201)throw new Error(`${stem}: ${response.statusCode} ${response.body}`);
    const publicImage=await app.inject({method:'GET',url:`/api/v1/public/organizations/${org}/${path}`});
    if(publicImage.statusCode!==200||hash(publicImage.rawPayload)!==hash(bytes))throw new Error(`Imagen pública incorrecta: ${stem}`);
    return {stem,updated:true};
  };
  const changes=[];
  changes.push(await upload('logo','federacion-san-bernardino',organization.logo_id));
  changes.push(await upload(`tournaments/${tournament}/emblem`,'copa-sanber',cup.emblem_id));
  for(const [name,stem] of images){
    const team=teams.find(row=>row.name===name);
    changes.push(await upload(`teams/${team.id}/shield`,stem,team.shield_id));
  }
  console.log(JSON.stringify({target,organizationId:org,tournamentId:tournament,changes,deniedCrossOrganization:denied.statusCode}));
}finally{
  if(token)await pool.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[digest(token)]);
  await app.close();await pool.end();
}
