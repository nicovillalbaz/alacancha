import type { DatabasePool } from '@torneos/db';
import { publicPagesSql } from './public-web.ts';

const daySql = "(now() AT TIME ZONE 'America/Asuncion')::date";

export async function recordPublicVisit(pool: DatabasePool, visit: boolean, tournament?: { id: string; section: string; first: boolean }) {
  await pool.query(`
    WITH portal_visit AS (
      INSERT INTO public_visit_days(day, visits)
      SELECT ${daySql}, 1 WHERE $1::boolean
      ON CONFLICT (day) DO UPDATE SET visits = public_visit_days.visits + 1
    )
    INSERT INTO public_tournament_view_days(day, tournament_id, section, views)
    SELECT ${daySql}, $2::uuid, selected.section, 1
    FROM (VALUES ($3::text), (CASE WHEN $4::boolean THEN 'copa' END)) selected(section)
    WHERE selected.section IS NOT NULL
      AND EXISTS (SELECT 1 FROM (${publicPagesSql}) public_pages WHERE tournament_id = $2::uuid)
    ORDER BY selected.section
    ON CONFLICT (day, tournament_id, section) DO UPDATE SET views = public_tournament_view_days.views + 1
  `, [visit, tournament?.id ?? null, tournament?.section ?? null, tournament?.first ?? false]);
}

export async function publicVisitReport(pool: DatabasePool) {
  const { rows: [report] } = await pool.query(`
    WITH recent AS (
      SELECT tournament_id, section, views
      FROM public_tournament_view_days WHERE day >= ${daySql} - 29
    ), cups AS (
      SELECT t.id, t.name, o.name AS organization, sum(recent.views)::bigint AS views
      FROM recent JOIN tournaments t ON t.id = recent.tournament_id
      JOIN organizations o ON o.id = t.organization_id
      WHERE recent.section = 'copa'
      GROUP BY t.id, o.name ORDER BY views DESC, t.name, t.id LIMIT 10
    ), sections AS (
      SELECT section, sum(views)::bigint AS views FROM recent
      WHERE section <> 'copa' GROUP BY section
    )
    SELECT
      coalesce(sum(visits), 0)::float8 AS total,
      coalesce(sum(visits) FILTER (WHERE day >= ${daySql} - 29), 0)::float8 AS recent,
      coalesce((SELECT json_agg(cups ORDER BY views DESC, name, id) FROM cups), '[]') AS cups,
      coalesce((SELECT json_agg(sections ORDER BY views DESC, section) FROM sections), '[]') AS sections
    FROM public_visit_days
  `);
  return report;
}
