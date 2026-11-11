import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import { createPool } from '@torneos/db';
import { buildApp } from '../apps/api/src/app.ts';
import { readConfig } from '../apps/api/src/config.ts';
import { localConnection } from './backup.ts';

const connection = process.env.TEST_DATABASE_URL!;
if (new URL(connection).pathname !== '/torneos_test' || process.env.NODE_ENV === 'production') throw new Error('La medición solo admite torneos_test con datos sintéticos.');
localConnection(connection);
const pool = createPool(connection);
const app = await buildApp({ ...readConfig(), databaseUrl: connection }, pool);
const bounded=(name:string,fallback:number,min:number,max:number)=>{const value=Number(process.env[name]??fallback);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} debe estar entre ${min} y ${max}.`);return value;};
const requests=bounded('PERF_REQUESTS',20,4,1000),concurrency=bounded('PERF_CONCURRENCY',4,1,16);
const percentile = (values: number[], p: number) => values.slice().sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
async function sample(label: string, paths: string[], headers?: Record<string,string>) {
  const values: number[] = [];
  for (let offset = 0; offset < requests; offset+=concurrency) {
    await Promise.all(Array.from({ length: Math.min(concurrency,requests-offset) }, async (_,index) => {
      const start = performance.now();
      const response = await app.inject({ method: 'GET', url: paths[(offset+index)%paths.length],headers });
      if (response.statusCode !== 200) throw new Error(`${label}: HTTP ${response.statusCode}`);
      values.push(performance.now() - start);
    }));
  }
  return { label, targets:paths.length, requests: values.length, concurrency, p50Ms: Math.round(percentile(values, .5)), p95Ms: Math.round(percentile(values, .95)), maxMs: Math.round(Math.max(...values)) };
}
try {
  const { rows: counts } = await pool.query(`SELECT
    (SELECT count(*)::int FROM organizations) organizations,
    (SELECT count(*)::int FROM team_entries) entries,
    (SELECT count(*)::int FROM player_registrations) registrations,
    (SELECT count(*)::int FROM draft_matches) matches,
    (SELECT count(*)::int FROM match_record_events) events,
    (SELECT count(*)::int FROM flyer_exports) flyers`);
  const { rows: organizations } = await pool.query(`SELECT o.id,count(p.id)::int publications FROM organizations o
    JOIN matchday_publications p ON p.organization_id=o.id WHERE o.status='active'
    GROUP BY o.id ORDER BY publications DESC,o.id LIMIT 4`);
  const { rows: categories } = await pool.query(`SELECT c.id,c.organization_id,count(e.id)::int entries FROM categories c
    LEFT JOIN team_entries e ON e.organization_id=c.organization_id AND e.category_id=c.id
    WHERE c.status='published' GROUP BY c.id,c.organization_id ORDER BY entries DESC,c.id LIMIT 4`);
  if (!organizations.length || !categories.length) throw new Error('Faltan organizaciones o categorías sintéticas para medir.');
  const {rows:[roster]}=await pool.query(`SELECT e.organization_id,e.id entry_id,count(pr.id)::int registrations
    FROM team_entries e JOIN player_registrations pr ON pr.organization_id=e.organization_id AND pr.entry_id=e.id
    GROUP BY e.organization_id,e.id ORDER BY registrations DESC,e.id LIMIT 1`);
  const measurements = [
    await sample('health', ['/health']),
    await sample('portada-publica', ['/']),
    await sample('sitemap-publico', ['/sitemap.xml']),
    await sample('fixture-publico-varios-torneos', organizations.map(item=>`/api/v1/public/organizations/${item.id}/fixture`)),
    await sample('estadisticas-publicas-varias-categorias', categories.map(item=>`/api/v1/public/organizations/${item.organization_id}/categories/${item.id}/statistics`)),
  ];
  let rosterDbMs:null|{p50Ms:number;p95Ms:number;maxMs:number;requests:number}=null;
  if(roster){const values:number[]=[];for(let offset=0;offset<requests;offset+=concurrency)await Promise.all(Array.from({length:Math.min(concurrency,requests-offset)},async()=>{
    const start=performance.now();await pool.query(`SELECT pr.id,p.given_names,p.family_names,pr.registration_number FROM player_registrations pr JOIN players p ON p.organization_id=pr.organization_id AND p.id=pr.player_id WHERE pr.organization_id=$1 AND pr.entry_id=$2 ORDER BY p.family_names,p.given_names`,[roster.organization_id,roster.entry_id]);values.push(performance.now()-start);
  }));rosterDbMs={requests:values.length,p50Ms:Math.round(percentile(values,.5)),p95Ms:Math.round(percentile(values,.95)),maxMs:Math.round(Math.max(...values))};}
  const report = { at: new Date().toISOString(), database: 'torneos_test', dataset: counts[0], sampledFixtureOrganizations:organizations.length,sampledFixturePublications:organizations.map(item=>item.publications),sampledStatisticsCategories:categories.length,sampledStatisticsEntries:categories.map(item=>item.entries),sampledRosterRegistrations:roster?.registrations??null, rosterDbMs,measurements, note: 'Muestra local de API con Fastify inject y consulta SQL privada de plantel; no representa red móvil. La captura simultánea y el worker se miden por separado.' };
  await writeFile(requests>20?'.local/perf-load.json':'.local/perf-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await app.close(); await pool.end(); }
