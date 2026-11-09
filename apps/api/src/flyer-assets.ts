import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DatabasePool } from '@torneos/db';
import type { FlyerSnapshot } from './flyer-template.ts';

export async function loadFlyerAssets(pool:DatabasePool,mediaDir:string,org:string,snapshot:FlyerSnapshot){
 const ids=[snapshot.orgAssetId,snapshot.home?.assetId,snapshot.away?.assetId,...snapshot.lines.flatMap(line=>[line.homeAssetId,line.awayAssetId])].filter((id):id is string=>Boolean(id));
 if(!ids.length)return {};
 const {rows}=await pool.query("SELECT id,filename,content_type,checksum,byte_length FROM media WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND content_type IN ('image/png','image/jpeg','image/webp') AND byte_length<=2097152",[org,ids]);
 const result:Record<string,string>={};
 for(const item of rows){if(!/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/.test(item.filename))continue;try{const data=await readFile(resolve(mediaDir,item.filename));if(data.length!==item.byte_length||createHash('sha256').update(data).digest('hex')!==item.checksum)continue;result[item.id]=`data:${item.content_type};base64,${data.toString('base64')}`;}catch{continue;}}
 return result;
}
