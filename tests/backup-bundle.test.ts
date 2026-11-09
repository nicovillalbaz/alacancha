import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, open, rm, truncate, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { encryptBundle, extractBundle, fileDigest, type BundleManifest } from '../scripts/backup-bundle.ts';

test('respaldo cifrado mayor de 64 MiB se restaura y rechaza alteraciones', async () => {
  const root=await mkdtemp(resolve('.local','bundle-test-'));
  try{
    const dump=resolve(root,'source.dump'),archive=resolve(root,'large.backup'),area=resolve(root,'restored');
    await writeFile(dump,Buffer.alloc(0));await truncate(dump,70*1024*1024);
    const manifest:BundleManifest={version:3,createdAt:new Date().toISOString(),snapshot:{},dump:await fileDigest(dump),files:[]};
    const key=randomBytes(32).toString('hex');
    await mkdir(area);
    await encryptBundle(archive,manifest,dump,root,key);
    assert.deepEqual(await extractBundle(archive,area,key),manifest);
    assert.deepEqual(await fileDigest(resolve(area,'database.dump')),manifest.dump);
    const file=await open(archive,'r+');
    try{const changed=Buffer.from([0xff]);await file.write(changed,0,1,100);}finally{await file.close();}
    const tampered=resolve(root,'tampered');await mkdir(tampered);
    await assert.rejects(extractBundle(archive,tampered,key),/authenticat|authenticate|Unsupported state/i);
  }finally{await rm(root,{recursive:true,force:true});}
});
