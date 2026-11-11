import { createPool } from '@torneos/db';
import { resolve } from 'node:path';
import { processFlyerJobs } from './flyers.ts';
import { processFixtureOutbox } from './fixture-outbox.ts';
const pool=createPool(process.env.DATABASE_URL!);let running=true;
process.on('SIGINT',()=>{running=false;});process.on('SIGTERM',()=>{running=false;});
try{while(running){try{await processFixtureOutbox(pool);}catch(error){console.error('Fixture:',error);}try{await processFlyerJobs(pool,resolve(process.env.MEDIA_DIR||'.local/media'),3);}catch(error){console.error('Flyers:',error);}await new Promise(resolve=>setTimeout(resolve,1500));}}finally{await pool.end();}
