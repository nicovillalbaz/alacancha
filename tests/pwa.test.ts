import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import sharp from 'sharp';

test('PWA instala interfaz estática y nunca intercepta datos privados', async () => {
  const handlers=new Map<string,(event:any)=>void>(),saved:string[]=[];
  const cache={add:async(path:string)=>{saved.push(path);},addAll:async(paths:string[])=>{saved.push(...paths);},match:async(path:string)=>path==='/index.html'?'offline-shell':null,put:async(path:string)=>{saved.push(path);}};
  let shellRequests = 0;
  const caches={open:async()=>cache,keys:async()=>[],delete:async()=>true,match:cache.match};
  const self={location:{origin:'https://torneos.test'},clients:{claim:async()=>{}},addEventListener:(name:string,handler:(event:any)=>void)=>handlers.set(name,handler)};
  const source=await readFile(resolve('apps/web/public/sw.js'),'utf8');
  runInNewContext(source,{self,caches,URL,Promise,Error,fetch:async(path:string)=>{
    if(path==='/index.html'){shellRequests++;return new Response('<script src="/assets/app-1.js"></script><link href="/assets/app-1.css">');}
    throw new Error('sin red');
  }});
  await new Promise<void>((resolveWait,reject)=>handlers.get('install')!({waitUntil:(promise:Promise<void>)=>{void promise.then(resolveWait,reject);}}));
  assert.ok(saved.includes('/index.html'));
  assert.equal(shellRequests+saved.filter(path=>path==='/index.html').length,2);
  assert.ok(saved.includes('/assets/app-1.js'));
  assert.ok(saved.includes('/assets/app-1.css'));
  assert.ok(saved.includes('/icons/icon-192.webp'));
  assert.ok(saved.includes('/icons/icon-512.webp'));
  assert.ok(saved.includes('/icons/icon-192.png'));
  const visited=['/assets/PublicApp-aB12_cD3.js','/assets/PublicPositionPortal-D3b2CA1Z.css'];
  const rejected=['/api/v1/auth/me','https://other.test/assets/Other-aB12_cD3.js','/assets/../panel.js','/assets/manifest.json'];
  await new Promise<void>((resolveWait,reject)=>handlers.get('message')!({
    data:{kind:'cache-visited-assets',assets:[...visited,...visited,...rejected]},
    waitUntil:(promise:Promise<void>)=>{void promise.then(resolveWait,reject);},
  }));
  for(const asset of visited)assert.equal(saved.filter(path=>path===asset).length,1);
  for(const asset of rejected)assert.equal(saved.includes(asset),false);

  let intercepted=false;
  handlers.get('fetch')!({request:{method:'GET',url:'https://torneos.test/api/v1/auth/me',mode:'cors',destination:''},respondWith:()=>{intercepted=true;}});
  assert.equal(intercepted,false);
  let offline:Promise<unknown>|null=null;
  handlers.get('fetch')!({request:{method:'GET',url:'https://torneos.test/',mode:'navigate',destination:'document'},respondWith:(promise:Promise<unknown>)=>{offline=promise;}});
  assert.equal(await offline,'offline-shell');
  const manifest=JSON.parse(await readFile(resolve('apps/web/public/manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.id,'/');
  assert.equal(manifest.start_url,'/');
  for(const size of [192,512]){
    const icons=manifest.icons.filter((icon:{sizes:string})=>icon.sizes===`${size}x${size}`);
    assert.deepEqual(icons.map((icon:{type:string})=>icon.type),['image/png','image/webp']);
    const [png,webp]=await Promise.all(icons.map((icon:{src:string})=>readFile(resolve('apps/web/public',icon.src.slice(1)))));
    const original=sharp(png),next=sharp(webp);
    const metadata=await next.metadata();
    assert.deepEqual([metadata.format,metadata.width,metadata.height],['webp',size,size]);
    assert.ok(webp.length<png.length);
    assert.deepEqual(await next.ensureAlpha().raw().toBuffer(),await original.ensureAlpha().raw().toBuffer());
  }
  const html=await readFile(resolve('apps/web/index.html'),'utf8');
  assert.match(html,/<link rel="apple-touch-icon" href="\/icons\/icon-192\.png">/);
  assert.match(html,/<link rel="icon" type="image\/webp" sizes="192x192" href="\/icons\/icon-192\.webp">/);
});
