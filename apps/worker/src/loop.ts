import { createPool } from '@torneos/db';
import { resolve } from 'node:path';
import { processFlyerJobs } from './flyers.ts';
const pool=createPool(process.env.DATABASE_URL!);let running=true;
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
try{while(running){try{await processFlyerJobs(pool,resolve(process.env.MEDIA_DIR||'.local/media'),3);}catch(error){console.error('Flyers:',error);}await new Promise(resolve=>setTimeout(resolve,1500));}}finally{await pool.end();}
