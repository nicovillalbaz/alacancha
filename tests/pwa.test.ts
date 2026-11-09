import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';

test('PWA instala interfaz estática y nunca intercepta datos privados', async () => {
  const handlers=new Map<string,(event:any)=>void>(),saved:string[]=[];
  const cache={addAll:async(paths:string[])=>{saved.push(...paths);},match:async(path:string)=>path==='/index.html'?'offline-shell':null,put:async()=>{}};
  const caches={open:async()=>cache,keys:async()=>[],delete:async()=>true,match:cache.match};
  const self={location:{origin:'https://torneos.test'},clients:{claim:async()=>{}},addEventListener:(name:string,handler:(event:any)=>void)=>handlers.set(name,handler)};
  const source=await readFile(resolve('apps/web/public/sw.js'),'utf8');
  runInNewContext(source,{self,caches,URL,Promise,Error,fetch:async(path:string)=>{
    if(path==='/index.html')return {ok:true,text:async()=>'<script src="/assets/app-1.js"></script><link href="/assets/app-1.css">'};
    throw new Error('sin red');
  }});
  await new Promise<void>(resolveWait=>handlers.get('install')!({waitUntil:async(promise:Promise<void>)=>{await promise;resolveWait();}}));
  assert.ok(saved.includes('/index.html'));
  assert.ok(saved.includes('/assets/app-1.js'));
  assert.ok(saved.includes('/assets/app-1.css'));
  let intercepted=false;
  handlers.get('fetch')!({request:{method:'GET',url:'https://torneos.test/api/v1/auth/me',mode:'cors',destination:''},respondWith:()=>{intercepted=true;}});
  assert.equal(intercepted,false);
  let offline:Promise<unknown>|null=null;
  handlers.get('fetch')!({request:{method:'GET',url:'https://torneos.test/',mode:'navigate',destination:'document'},respondWith:(promise:Promise<unknown>)=>{offline=promise;}});
  assert.equal(await offline,'offline-shell');
  const manifest=JSON.parse(await readFile(resolve('apps/web/public/manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){const bytes=await readFile(resolve('apps/web/public',icon.src.slice(1)));assert.equal(bytes.subarray(1,4).toString(),'PNG');}
});
