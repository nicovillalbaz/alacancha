import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('cola local sobrevive reinicio y separa capturistas, organizaciones y partidos', async () => {
  const rows=new Map<string,unknown>();let created=false;
  const database={objectStoreNames:{contains:()=>created},createObjectStore:()=>{created=true;},close:()=>{},transaction:(_name:string,_mode:string)=>{
    const tx:{oncomplete?:()=>void;onerror?:()=>void;objectStore:(name:string)=>unknown}={objectStore:()=>({
      put:(value:{id:string})=>{rows.set(value.id,value);queueMicrotask(()=>tx.oncomplete?.());},
      delete:(id:string)=>{rows.delete(id);queueMicrotask(()=>tx.oncomplete?.());},
      getAll:()=>{const request:{result:unknown[];onsuccess?:()=>void;onerror?:()=>void}={result:[...rows.values()]};queueMicrotask(()=>{request.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return request;}
    })};return tx;
  }};
  Object.assign(globalThis,{indexedDB:{open:()=>{
    const request:{result:typeof database;onupgradeneeded?:()=>void;onsuccess?:()=>void;onerror?:()=>void}={result:database};
    queueMicrotask(()=>{if(!created)request.onupgradeneeded?.();request.onsuccess?.();});return request;
  }}});
  try{
    const modulePath='../apps/web/src/offline-events.ts';
    const first=await import(modulePath) as typeof import('../apps/web/src/offline-events.ts');
    const event=(id:string,userId:string,organizationId:string,matchId:string,createdAt:number)=>({id,userId,organizationId,matchId,createdAt,payload:{clientEventId:id,kind:'goal',teamEntryId:'equipo',registrationId:null,relatedRegistrationId:null,incidentNote:null,windowNo:null,period:'PT',minute:null}});
    const a=event(randomUUID(),'capturista-A','org-A','partido-1',2),b=event(randomUUID(),'capturista-A','org-A','partido-1',1);
    await first.queueMatchEvent(a);await first.queueMatchEvent(b);
    await first.queueMatchEvent(event(randomUUID(),'capturista-B','org-A','partido-1',3));
    await first.queueMatchEvent(event(randomUUID(),'capturista-A','org-B','partido-1',4));
    await first.queueMatchEvent(event(randomUUID(),'capturista-A','org-A','partido-2',5));
    rows.set(randomUUID(),{id:randomUUID(),organizationId:'org-A',matchId:'partido-1'}); // evento anterior sin identidad: no se sincroniza.
    const afterRestart=await import(`${modulePath}?restart`) as typeof import('../apps/web/src/offline-events.ts');
    assert.deepEqual((await afterRestart.queuedMatchEvents('capturista-A','org-A','partido-1')).map(item=>item.id),[b.id,a.id]);
    assert.equal((await afterRestart.queuedMatchEvents('capturista-B','org-A','partido-1')).length,1);
    assert.equal((await afterRestart.queuedMatchEvents('capturista-A','org-B','partido-1')).length,1);
    await afterRestart.removeQueuedMatchEvent(b.id);
    assert.deepEqual((await first.queuedMatchEvents('capturista-A','org-A','partido-1')).map(item=>item.id),[a.id]);
  }finally{delete (globalThis as {indexedDB?:unknown}).indexedDB;}
});
