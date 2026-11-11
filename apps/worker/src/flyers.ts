import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import type { DatabasePool } from '@torneos/db';
import { renderFlyerSvg, flyerSizes, type FlyerSize, type FlyerSnapshot, type FlyerTemplateKey } from '../../api/src/flyer-template.ts';
import { loadFlyerAssets } from '../../api/src/flyer-assets.ts';

const chrome=process.env.CHROME_PATH||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'chromium');
async function run(binary:string,args:string[],timeout=30000){
 await new Promise<void>((ok,bad)=>{const child=spawn(binary,args,{windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{child.kill();bad(new Error('Tiempo de generación agotado.'));},timeout);child.on('error',error=>{clearTimeout(timer);bad(error);});child.on('exit',code=>{clearTimeout(timer);code===0?ok():bad(new Error(`El generador terminó con código ${code}.`));});});
}
async function awaitFile(path:string){for(let i=0;i<80;i++){try{const item=await stat(path);if(item.size>100)return;}catch{}await new Promise(resolve=>setTimeout(resolve,125));}throw new Error('El archivo no se generó.');}
function validate(data:Buffer,format:string){
 if(data.length<100||data.length>12*1024*1024)throw new Error('El archivo generado supera el límite o está vacío.');
 if(format==='png'&&(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||data.readUInt32BE(16)<1||data.readUInt32BE(20)<1))throw new Error('PNG generado inválido.');
 if(format==='jpg'&&!(data[0]===255&&data[1]===216&&data.at(-2)===255&&data.at(-1)===217))throw new Error('JPG generado inválido.');
 if(format==='pdf'&&data.toString('ascii',0,5)!=='%PDF-')throw new Error('PDF generado inválido.');
}
export async function processFlyerJobs(pool:DatabasePool,mediaDir:string,limit=3){
 await mkdir(mediaDir,{recursive:true});let count=0;
 for(;count<limit;count++){
  const client=await pool.connect();let job:any,temp='';
  try{
   const {rows:candidates}=await client.query("SELECT * FROM flyer_exports WHERE status IN ('queued','running') ORDER BY created_at,id LIMIT 100");
   for(const candidate of candidates){const {rows:[claim]}=await client.query('SELECT pg_try_advisory_lock(hashtextextended($1::text,0)) locked',[candidate.id]);if(!claim.locked)continue;const {rows:[fresh]}=await client.query('SELECT status FROM flyer_exports WHERE id=$1',[candidate.id]);if(fresh&&['queued','running'].includes(fresh.status)){job=candidate;break;}await client.query('SELECT pg_advisory_unlock(hashtextextended($1::text,0))',[candidate.id]);}
   if(!job)break;
   await client.query("UPDATE flyer_exports SET status='running',error_message=NULL WHERE id=$1",[job.id]);
   temp=await mkdtemp(join(mediaDir,'flyer-work-'));const snap=job.snapshot as FlyerSnapshot;
   const svg=renderFlyerSvg(snap,job.size_code as FlyerSize,job.template_key as FlyerTemplateKey,await loadFlyerAssets(pool,mediaDir,job.organization_id,snap));
   const svgPath=join(temp,'flyer.svg'),htmlPath=join(temp,'flyer.html'),pngPath=join(temp,'flyer.png'),outPath=join(temp,`flyer.${job.format}`);
   await writeFile(svgPath,svg,'utf8');const dimension=flyerSizes[job.size_code as FlyerSize];
   if(job.format==='pdf'){
    const html=`<!doctype html><meta charset="utf-8"><style>@page{size:${dimension.width}px ${dimension.height}px;margin:0}html,body{margin:0;width:${dimension.width}px;height:${dimension.height}px;overflow:hidden}img{display:block;width:100%;height:calc(100% - 2px)}</style><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
    await writeFile(htmlPath,html,'utf8');await run(chrome,['--headless','--disable-gpu','--no-first-run',`--user-data-dir=${join(temp,'chrome')}`,'--print-to-pdf-no-header',`--print-to-pdf=${outPath}`,`file:///${htmlPath.replaceAll('\\','/')}`]);
   }else{
    await run(chrome,['--headless','--disable-gpu','--hide-scrollbars','--no-first-run',`--user-data-dir=${join(temp,'chrome')}`,`--window-size=${dimension.width},${dimension.height}`,`--screenshot=${pngPath}`,`file:///${svgPath.replaceAll('\\','/')}`]);
    if(job.format==='jpg'){await awaitFile(pngPath);await run('ffmpeg',['-loglevel','error','-y','-i',pngPath,'-frames:v','1','-q:v','2',outPath]);}
   }
   await awaitFile(outPath);const data=await readFile(outPath);validate(data,job.format);
   const filename=`flyer-${job.id}.${job.format}`;await writeFile(join(mediaDir,filename),data);
   await client.query("UPDATE flyer_exports SET status='ready',filename=$2,checksum=$3,byte_length=$4,generated_at=now(),error_message=NULL WHERE id=$1 AND status='running'",[job.id,filename,createHash('sha256').update(data).digest('hex'),data.length]);
  }catch(error){if(job)await client.query("UPDATE flyer_exports SET status='failed',error_message=$2 WHERE id=$1 AND status='running'",[job.id,error instanceof Error?error.message.slice(0,240):'Error de generación']);else throw error;}
  finally{if(temp&&resolve(temp).startsWith(resolve(mediaDir)+sep))await rm(temp,{recursive:true,force:true});if(job)await client.query('SELECT pg_advisory_unlock(hashtextextended($1::text,0))',[job.id]);client.release();}
 }
 return count;
}
