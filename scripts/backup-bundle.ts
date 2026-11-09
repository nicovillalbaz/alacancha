import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, open, readFile, stat, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { resolve } from 'node:path';

export const bundleHeader = Buffer.from('TORNEOS-BACKUP-3\n');
export interface BundleManifest { version: 3; createdAt: string; snapshot: Record<string,{rows:number;checksum:string}>; dump: {size:number;checksum:string}; files: {filename:string;size:number;checksum:string}[] }
const sha = () => createHash('sha256');
const safeName = (name:string) => /^(?:[0-9a-f-]+\.(?:png|jpg|webp|pdf)|flyer-[0-9a-f-]+\.(?:png|jpg|pdf))$/.test(name);
function keyBytes(key:string){if(!/^[0-9a-f]{64}$/i.test(key))throw new Error('BACKUP_KEY debe tener 64 caracteres hexadecimales.');return Buffer.from(key,'hex');}
export async function fileDigest(path:string){const hash=sha();let size=0;for await(const block of createReadStream(path)){const bytes=block as Buffer;hash.update(bytes);size+=bytes.length;}return {size,checksum:hash.digest('hex')};}
async function* pieces(manifest:BundleManifest,dumpPath:string,mediaDir:string){
  const json=Buffer.from(JSON.stringify(manifest));if(json.length>16*1024*1024)throw new Error('Índice de respaldo demasiado grande.');
  const length=Buffer.alloc(4);length.writeUInt32BE(json.length);yield length;yield json;
  for(const item of [{path:dumpPath,...manifest.dump},...manifest.files.map(file=>({path:resolve(mediaDir,file.filename),...file}))]){
    const hash=sha();let size=0;
    for await(const block of createReadStream(item.path)){const bytes=block as Buffer;size+=bytes.length;hash.update(bytes);yield bytes;}
    if(size!==item.size||hash.digest('hex')!==item.checksum)throw new Error(`Archivo cambiado durante el respaldo: ${item.path}`);
  }
}
export async function encryptBundle(path:string,manifest:BundleManifest,dumpPath:string,mediaDir:string,key:string){
  const iv=randomBytes(12);await writeFile(path,Buffer.concat([bundleHeader,iv]),{flag:'wx',mode:0o600});
  try{
    const cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);
    await pipeline(Readable.from(pieces(manifest,dumpPath,mediaDir)),cipher,createWriteStream(path,{flags:'a'}));
    await appendFile(path,cipher.getAuthTag());
  }catch(error){const {rm}=await import('node:fs/promises');await rm(path,{force:true});throw error;}
}
async function copyRange(source:string,target:string,start:number,size:number,checksum:string){
  const hash=sha();let copied=0;
  if(size===0){await writeFile(target,Buffer.alloc(0),{flag:'wx',mode:0o600});}
  else await pipeline(createReadStream(source,{start,end:start+size-1}),new Transform({transform(block,_encoding,done){copied+=block.length;hash.update(block);done(null,block);}}),createWriteStream(target,{flags:'wx',mode:0o600}));
  if(copied!==size||hash.digest('hex')!==checksum)throw new Error('Un archivo del respaldo no coincide con su índice.');
}
export async function extractBundle(archivePath:string,area:string,key:string){
  const total=(await stat(archivePath)).size;
  if(total<bundleHeader.length+12+16+4)throw new Error('Respaldo incompleto.');
  const source=await open(archivePath,'r');let iv:Buffer,tag:Buffer;
  try{
    const head=Buffer.alloc(bundleHeader.length);await source.read(head,0,head.length,0);if(!head.equals(bundleHeader))throw new Error('Formato de respaldo no admitido.');
    iv=Buffer.alloc(12);tag=Buffer.alloc(16);await source.read(iv,0,12,bundleHeader.length);await source.read(tag,0,16,total-16);
  }finally{await source.close();}
  const plain=resolve(area,'bundle.plain');
  try{
    const decipher=createDecipheriv('aes-256-gcm',keyBytes(key),iv);decipher.setAuthTag(tag);
    await pipeline(createReadStream(archivePath,{start:bundleHeader.length+12,end:total-17}),decipher,createWriteStream(plain,{flags:'wx',mode:0o600}));
    const reader=await open(plain,'r');let manifest:BundleManifest,offset:number;
    try{
      const prefix=Buffer.alloc(4);await reader.read(prefix,0,4,0);const length=prefix.readUInt32BE(0);
      if(length<2||length>16*1024*1024)throw new Error('Índice de respaldo inválido.');
      const bytes=Buffer.alloc(length);const read=await reader.read(bytes,0,length,4);if(read.bytesRead!==length)throw new Error('Índice de respaldo incompleto.');
      manifest=JSON.parse(bytes.toString('utf8')) as BundleManifest;offset=4+length;
    }finally{await reader.close();}
    if(manifest.version!==3||!manifest.snapshot||!manifest.dump||!Array.isArray(manifest.files)||!Number.isSafeInteger(manifest.dump.size)||manifest.dump.size<0||!/^[0-9a-f]{64}$/.test(manifest.dump.checksum))throw new Error('Índice de respaldo inválido.');
    const names=new Set<string>();for(const file of manifest.files){if(!safeName(file.filename)||names.has(file.filename)||!Number.isSafeInteger(file.size)||file.size<0||!/^[0-9a-f]{64}$/.test(file.checksum))throw new Error('Archivo de respaldo inválido.');names.add(file.filename);}
    const expected=offset+manifest.dump.size+manifest.files.reduce((sum,file)=>sum+file.size,0);
    if(expected!==(await stat(plain)).size)throw new Error('Tamaño del respaldo inconsistente.');
    await copyRange(plain,resolve(area,'database.dump'),offset,manifest.dump.size,manifest.dump.checksum);offset+=manifest.dump.size;
    const {mkdir}=await import('node:fs/promises');await mkdir(resolve(area,'media'));
    for(const file of manifest.files){await copyRange(plain,resolve(area,'media',file.filename),offset,file.size,file.checksum);offset+=file.size;}
    return manifest;
  }finally{const {rm}=await import('node:fs/promises');await rm(plain,{force:true});}
}
export async function isBundleV3(path:string){const source=await open(path,'r');try{const bytes=Buffer.alloc(bundleHeader.length);await source.read(bytes,0,bytes.length,0);return bytes.equals(bundleHeader);}finally{await source.close();}}
