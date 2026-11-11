import type { FastifyInstance } from 'fastify';
import type { DatabasePool } from '@torneos/db';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type Page = { organization_id: string; organization_name: string; public_slug: string; has_logo: boolean; tournament_id: string; tournament_name: string; has_emblem: boolean; official: boolean };
const pagesSql = `SELECT DISTINCT o.id organization_id,o.name organization_name,o.public_slug,(o.logo_id IS NOT NULL) has_logo,t.id tournament_id,t.name tournament_name,(t.emblem_id IS NOT NULL) has_emblem,true official
  FROM organizations o JOIN tournaments t ON t.organization_id=o.id AND t.status='published'
  JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id AND ed.status='published'
  JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id AND c.status='published'
  JOIN rule_versions r ON r.organization_id=c.organization_id AND r.category_id=c.id AND r.status='published'
  WHERE o.status='active'
  UNION
  SELECT DISTINCT o.id,o.name,o.public_slug,(o.logo_id IS NOT NULL),t.id,t.name,(t.emblem_id IS NOT NULL),false
  FROM organizations o JOIN tournaments t ON t.organization_id=o.id
  JOIN editions ed ON ed.organization_id=t.organization_id AND ed.tournament_id=t.id
  JOIN categories c ON c.organization_id=ed.organization_id AND c.edition_id=ed.id
  JOIN fixture_position_blueprints b ON b.organization_id=c.organization_id AND b.category_id=c.id
  JOIN fixture_position_publications p ON p.organization_id=b.organization_id AND p.blueprint_id=b.id
  WHERE o.status='active'`;
const escapeHtml = (value: string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const escapeXml = escapeHtml;
const typeFor = (path: string) => path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.css') ? 'text/css; charset=utf-8' : path.endsWith('.png') ? 'image/png' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream';

export function registerPublicWebRoutes(app: FastifyInstance, pool: DatabasePool, origin: string, webDist = resolve('apps/web/dist'), measurementId = process.env.GA_MEASUREMENT_ID || '') {
  const base = origin.replace(/\/$/, '');
  const gaEnabled = /^G-[A-Z0-9]+$/.test(measurementId);
  const pages = async () => {
    const unique = new Map<string,Page>();
    for (const page of (await pool.query(pagesSql)).rows as Page[]) {
      const key = `${page.organization_id}/${page.tournament_id}`, previous = unique.get(key);
      unique.set(key, previous ? {...previous, official: previous.official || page.official} : page);
    }
    return [...unique.values()];
  };
  app.get('/robots.txt', async (_request, reply) => reply.type('text/plain; charset=utf-8').send(`User-agent: *\nAllow: /\nAllow: /api/v1/public/\nDisallow: /api/\nDisallow: /acceso\nDisallow: /panel\nSitemap: ${base}/sitemap.xml\n`));
  app.get('/sitemap.xml', async (_request, reply) => {
    const published = await pages();
    const urls = new Set<string>([`${base}/`]);
    for (const page of published) { urls.add(`${base}/${page.public_slug}`); urls.add(`${base}/${page.public_slug}/${page.tournament_id}`); }
    return reply.type('application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...urls].map(url=>`<url><loc>${escapeXml(url)}</loc></url>`).join('')}</urlset>`);
  });
  app.get('/*', async (request, reply) => {
    const path = new URL(request.url, base).pathname;
    if (path.startsWith('/api/') || path === '/health' || path === '/ready') return reply.code(404).send({code:'NOT_FOUND'});
    const staticPath = path.slice(1);
    if (/^(?:assets|icons)\/[a-zA-Z0-9._-]+$/.test(staticPath) || ['manifest.webmanifest','sw.js','analytics.js'].includes(staticPath)) {
      try {
        const body = await readFile(resolve(webDist, staticPath));
        if (/^assets\/[a-zA-Z0-9._-]+-[a-zA-Z0-9_-]{8,}\.(?:js|css)$/.test(staticPath)) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        return reply.type(typeFor(staticPath)).send(body);
      }
      catch { return reply.code(404).type('text/plain').send('Archivo no encontrado.'); }
    }
    if (path !== '/index.html' && /\.[a-zA-Z0-9]+$/.test(path)) return reply.code(404).type('text/plain').send('Página no encontrada.');
    let shell: string;
    try { shell = await readFile(resolve(webDist, 'index.html'), 'utf8'); }
    catch { return reply.code(503).type('text/plain').send('Compilá la web antes de servirla.'); }
    const segments = path === '/index.html' ? [] : path.split('/').filter(Boolean);
    const published = await pages();
    const organization = segments.length ? published.find(page=>page.public_slug===segments[0]) : undefined;
    const tournament = segments.length===2 && organization ? published.find(page=>page.public_slug===segments[0] && page.tournament_id===segments[1]) : undefined;
    const publicPage = segments.length===0 || segments.length===1 && !!organization || !!tournament;
    const canonical = segments.length===0 ? `${base}/` : tournament ? `${base}/${organization!.public_slug}/${tournament.tournament_id}` : organization && segments.length===1 ? `${base}/${organization.public_slug}` : '';
    const name = tournament?.tournament_name || organization?.organization_name || 'A la cancha';
    const title = tournament ? `${name} · ${organization!.organization_name}` : organization ? `${name} · A la cancha` : 'A la cancha · Torneos';
    const description = tournament ? `Partidos, fixture, clasificación y goleadores de ${name}.` : organization ? `Torneos, partidos, resultados y estadísticas de ${name}.` : 'Encontrá organizaciones, torneos, partidos, resultados y estadísticas.';
    const image = tournament?.has_emblem ? `${base}/api/v1/public/organizations/${tournament.organization_id}/tournaments/${tournament.tournament_id}/emblem` : organization?.has_logo ? `${base}/api/v1/public/organizations/${organization.organization_id}/logo` : '';
    const children = segments.length===0 ? [...new Map(published.map(page=>[page.public_slug,page])).values()].map(page=>({url:`/${page.public_slug}`,name:page.organization_name})) : organization && !tournament ? published.filter(page=>page.public_slug===organization.public_slug).map(page=>({url:`/${page.public_slug}/${page.tournament_id}`,name:page.tournament_name})) : [];
    const meta = `<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}">${publicPage?`<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}">${image?`<meta property="og:image" content="${escapeHtml(image)}">`:''}<meta name="twitter:card" content="${image?'summary_large_image':'summary'}">`:'<meta name="robots" content="noindex,nofollow">'}`;
    const analytics = publicPage && gaEnabled ? `<meta name="ga-measurement-id" content="${measurementId}"><script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script><script src="/analytics.js"></script>` : '';
    shell = shell.replace(/<title>[^<]*<\/title>/, '').replace(/<meta name="description"[^>]*>/, '').replace('</head>', `${meta}${analytics}</head>`);
    if (publicPage) shell = shell.replace('<div id="app"></div>', `<div id="app"></div><noscript><main><h1>${escapeHtml(name)}</h1><p>${escapeHtml(description)}</p>${children.length?`<ul>${children.map(child=>`<li><a href="${escapeHtml(child.url)}">${escapeHtml(child.name)}</a></li>`).join('')}</ul>`:''}</main></noscript>`);
    return reply.code(publicPage ? 200 : segments[0]==='acceso'||segments[0]==='panel' ? 200 : 404).type('text/html; charset=utf-8').send(shell);
  });
}
