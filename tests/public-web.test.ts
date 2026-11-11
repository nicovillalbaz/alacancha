import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabasePool } from '@torneos/db';
import { registerPublicWebRoutes } from '../apps/api/src/public-web.ts';

test('SEO entrega solo torneos públicos, HTML de cada URL y acceso no indexable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'torneos-seo-'));
  const organizationId='11111111-1111-4111-8111-111111111111', tournamentId='22222222-2222-4222-8222-222222222222';
  const visible = {organization_id:organizationId,organization_name:'Federación de Prueba',public_slug:'federacion-prueba',has_logo:true,tournament_id:tournamentId,tournament_name:'Copa Pública',has_emblem:true,official:true};
  const pool = {query:async(query:string)=>{assert.match(query,/rule_versions r/);assert.match(query,/fixture_position_publications p/);return {rows:[visible]};}} as unknown as DatabasePool;
  const app = Fastify();
  try {
    await mkdir(join(directory,'assets'));
    await writeFile(join(directory,'index.html'),'<html><head><meta name="description" content="genérica"><title>Genérico</title></head><body><div id="app"></div><script src="/assets/app.js"></script></body></html>');
    await writeFile(join(directory,'assets','app.js'),'console.log("ok")');
    await writeFile(join(directory,'assets','app-aB12_cD3.js'),'console.log("versión")');
    registerPublicWebRoutes(app,pool,'https://torneos.example',directory);
    const root=await app.inject('/');assert.equal(root.statusCode,200);assert.match(root.body,/Federación de Prueba/);
    const shell=await app.inject('/index.html');assert.equal(shell.statusCode,200);assert.match(shell.body,/rel="canonical" href="https:\/\/torneos.example\/"/);
    const page=await app.inject('/federacion-prueba/'+tournamentId);assert.equal(page.statusCode,200);assert.match(page.body,/<title>Copa Pública · Federación de Prueba<\/title>/);assert.match(page.body,/rel="canonical" href="https:\/\/torneos.example\/federacion-prueba\//);assert.match(page.body,/og:image/);assert.doesNotMatch(page.body,/content="genérica"/);
    visible.official=false;
    const partial=await app.inject('/federacion-prueba/'+tournamentId);assert.equal(partial.statusCode,200);assert.match(partial.body,/og:image/);
    const sitemap=await app.inject('/sitemap.xml');assert.equal(sitemap.statusCode,200);assert.match(sitemap.body,/federacion-prueba\/22222222/);assert.doesNotMatch(sitemap.body,/borrador/);
    const robots=await app.inject('/robots.txt');assert.match(robots.body,/Disallow: \/acceso/);assert.match(robots.body,/Allow: \/api\/v1\/public\//);
    const login=await app.inject('/acceso');assert.equal(login.statusCode,200);assert.match(login.body,/noindex,nofollow/);
    assert.doesNotMatch(root.body,/googletagmanager/);
    const unknown=await app.inject('/borrador');assert.equal(unknown.statusCode,404);assert.match(unknown.body,/noindex,nofollow/);
    const asset=await app.inject('/assets/app.js');assert.equal(asset.statusCode,200);assert.match(String(asset.headers['content-type']||''),/javascript/);
    const versioned=await app.inject('/assets/app-aB12_cD3.js');assert.equal(versioned.statusCode,200);assert.equal(versioned.headers['cache-control'],'public, max-age=31536000, immutable');
    assert.notEqual(asset.headers['cache-control'],versioned.headers['cache-control']);
  } finally {await app.close();await rm(directory,{recursive:true,force:true});}
});

test('Analytics requiere ID válido y solo se inserta en páginas públicas', async () => {
  const directory=await mkdtemp(join(tmpdir(),'torneos-ga-'));
  const pool={query:async()=>({rows:[]})} as unknown as DatabasePool;
  const app=Fastify();
  try {
    await writeFile(join(directory,'index.html'),'<html><head><title>Inicio</title></head><body><div id="app"></div></body></html>');
    registerPublicWebRoutes(app,pool,'https://torneos.example',directory,'G-TEST1234');
    const publicPage=await app.inject('/');
    assert.match(publicPage.body,/gtag\/js\?id=G-TEST1234/);
    assert.match(publicPage.body,/\/analytics.js/);
    assert.doesNotMatch((await app.inject('/acceso')).body,/gtag\/js/);
  } finally {await app.close();await rm(directory,{recursive:true,force:true});}
});
