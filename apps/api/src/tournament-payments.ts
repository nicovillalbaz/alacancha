import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { audit, transaction, type DatabasePool } from '@torneos/db';
import { ruleSchema } from '@torneos/shared';

type Actor = { user_id: string };
type Access = (request: FastifyRequest, organizationId: string, write?: boolean) => Promise<Actor>;
type Reject = (status: number, code: string, message: string) => never;
const id = z.uuid();
const money = z.number().int().min(1).max(1000000000);
const ratesInput = z.object({ yellowGuaranies: z.number().int().min(0).max(1000000000), redGuaranies: z.number().int().min(0).max(1000000000), customCardRates: z.record(z.string(),z.number().int().min(0).max(1000000000)).default({}) }).strict();
const entryInput = z.object({
  kind: z.enum(['charge','income','expense']),
  category: z.enum(['fine_yellow','fine_red','fine_other','fine_payment','tickets','registration','match_fee','referee','other']),
  entryId: id.nullable().default(null),
  linkedChargeId: id.nullable().default(null),
  amountGuaranies: money.optional(),
  description: z.string().trim().min(2).max(160),
  occurredOn: z.iso.date(),
}).strict();
const voidInput = z.object({ reason: z.string().trim().min(3).max(300) }).strict();
const cardInput = z.object({ categoryId:id, label:z.string().trim().min(2).max(40), color:z.string().regex(/^#[0-9a-fA-F]{6}$/), suspensionMatches:z.number().int().min(0).max(50), amountGuaranies:z.number().int().min(0).max(1000000000) }).strict();
const cardChargeInput = z.object({ amountGuaranies: money }).strict();
const cardChargesInput = z.object({ entryId:id, items:z.array(z.object({eventId:id,amountGuaranies:money}).strict()).min(1).max(50) }).strict();

// La instantánea aprobada es la fuente; un evento anulado en una rectificación
// deja de aparecer como tarjeta pendiente, sin borrar un cobro ya asentado.
const officialCardsQuery = `SELECT (event.value->>'id')::uuid event_id,r.match_id,r.status record_status,m.category_id,
  event.value->>'kind' kind,event.value->>'cardCode' card_code,
  event.value->>'registrationId' registration_id,(event.value->>'teamEntryId')::uuid entry_id,
  coalesce(player.given_names||' '||player.family_names,'Jugador') player_name,
  team.name team_name,home.name home_name,away.name away_name,rv.rules,
  to_char(coalesce(m.match_date,(approved.created_at AT TIME ZONE t.timezone)::date),'YYYY-MM-DD') occurred_on
  FROM match_records r
  JOIN match_acta_snapshots approved ON approved.organization_id=r.organization_id AND approved.id=r.approval_id AND approved.kind='approved'
  JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
  JOIN categories c ON c.organization_id=m.organization_id AND c.id=m.category_id
  JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
  JOIN tournaments t ON t.organization_id=ed.organization_id AND t.id=ed.tournament_id
  JOIN rule_versions rv ON rv.organization_id=r.organization_id AND rv.category_id=m.category_id AND rv.version=r.rule_version
  CROSS JOIN LATERAL jsonb_array_elements(approved.snapshot->'events') event(value)
  JOIN team_entries te ON te.organization_id=r.organization_id AND te.id=(event.value->>'teamEntryId')::uuid
  JOIN teams team ON team.organization_id=te.organization_id AND team.id=te.team_id
  JOIN team_entries he ON he.organization_id=r.organization_id AND he.id=m.home_entry_id
  JOIN teams home ON home.organization_id=he.organization_id AND home.id=he.team_id
  JOIN team_entries ae ON ae.organization_id=r.organization_id AND ae.id=m.away_entry_id
  JOIN teams away ON away.organization_id=ae.organization_id AND away.id=ae.team_id
  LEFT JOIN player_registrations pr ON pr.organization_id=r.organization_id AND pr.id=(event.value->>'registrationId')::uuid
  LEFT JOIN players player ON player.organization_id=pr.organization_id AND player.id=pr.player_id
  WHERE r.organization_id=$1 AND t.id=$2
    AND event.value->>'kind' IN ('yellow','second_yellow','red','custom_card')
    AND ($3::uuid IS NULL OR (event.value->>'id')::uuid=$3)
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(approved.snapshot->'events') voided(value)
      WHERE voided.value->>'kind'='void' AND voided.value->>'voidsEventId'=event.value->>'id')
  ORDER BY approved.created_at DESC,r.match_id,(event.value->>'sequence')::int`;

function cardDetails(row: {kind:string;card_code:string|null;category_id:string;rules:unknown}) {
  if(row.kind==='yellow')return {key:'yellow',label:'Amarilla',category:'fine_yellow'};
  if(row.kind==='second_yellow')return {key:'yellow',label:'Segunda amarilla',category:'fine_yellow'};
  if(row.kind==='red')return {key:'red',label:'Roja',category:'fine_red'};
  const parsed=ruleSchema.safeParse(row.rules);
  const card=parsed.success?parsed.data.advanced?.discipline.customCards?.find(item=>item.code===row.card_code):null;
  return card?{key:`${row.category_id}:${card.code}`,label:card.label,category:'fine_other'}:null;
}

export function registerTournamentPaymentRoutes(app: FastifyInstance, pool: DatabasePool, access: Access, fail: Reject) {
  const root='/api/v1/organizations/:id/tournaments/:tournamentId/payments';
  async function scope(request: FastifyRequest) {
    const params=request.params as {id:string;tournamentId:string};
    const organizationId=id.parse(params.id),tournamentId=id.parse(params.tournamentId);
    const actor=await access(request,organizationId,true);
    const {rowCount}=await pool.query('SELECT 1 FROM tournaments WHERE organization_id=$1 AND id=$2',[organizationId,tournamentId]);
    if(!rowCount)fail(404,'TOURNAMENT_NOT_FOUND','No se encontró el torneo.');
    return {organizationId,tournamentId,actor};
  }
  async function insertCardCharge(client:PoolClient,organizationId:string,tournamentId:string,actor:Actor,eventId:string,amountGuaranies:number,expectedEntryId?:string) {
    const {rows:[eventMatch]}=await client.query(`SELECT r.match_id FROM match_record_events ev
      JOIN match_records r ON r.organization_id=ev.organization_id AND r.match_id=ev.match_id
      JOIN draft_matches m ON m.organization_id=r.organization_id AND m.id=r.match_id
      JOIN categories c ON c.organization_id=m.organization_id AND c.id=m.category_id
      JOIN editions ed ON ed.organization_id=c.organization_id AND ed.id=c.edition_id
      WHERE ev.organization_id=$1 AND ev.id=$2 AND ed.tournament_id=$3`,[organizationId,eventId,tournamentId]);
    if(!eventMatch)fail(404,'CARD_NOT_FOUND','La tarjeta no pertenece a este torneo.');
    await client.query('SELECT id FROM match_records WHERE organization_id=$1 AND match_id=$2 FOR SHARE',[organizationId,eventMatch.match_id]);
    const {rows:[recordStatus]}=await client.query('SELECT status FROM match_records WHERE organization_id=$1 AND match_id=$2',[organizationId,eventMatch.match_id]);
    if(recordStatus?.status!=='official')fail(409,'ACTA_IN_REVIEW','Terminá la rectificación del acta antes de generar el cargo.');
    const {rows:[card]}=await client.query(officialCardsQuery,[organizationId,tournamentId,eventId]);
    const details=card&&cardDetails(card);
    if(!details)fail(409,'CARD_NOT_OFFICIAL','La tarjeta no figura en el acta oficial vigente.');
    if(expectedEntryId && card.entry_id!==expectedEntryId)fail(400,'TEAM_MISMATCH','La tarjeta no corresponde al equipo seleccionado.');
    const {rowCount:existing}=await client.query('SELECT 1 FROM tournament_money_entries WHERE organization_id=$1 AND card_event_id=$2 AND voided_at IS NULL',[organizationId,eventId]);
    if(existing)fail(409,'CARD_ALREADY_CHARGED','Esta tarjeta ya tiene un cargo. Actualizá Pagos.');
    const {rows:[rate]}=await client.query('SELECT version,yellow_guaranies,red_guaranies,custom_card_rates FROM tournament_payment_rates WHERE organization_id=$1 AND tournament_id=$2 ORDER BY version DESC LIMIT 1',[organizationId,tournamentId]);
    const current=details.key==='yellow'?rate?.yellow_guaranies||0:details.key==='red'?rate?.red_guaranies||0:rate?.custom_card_rates?.[details.key]||0;
    if(!current){
      const customRates={...(rate?.custom_card_rates||{})};
      if(details.key!=='yellow'&&details.key!=='red')customRates[details.key]=amountGuaranies;
      const yellow=details.key==='yellow'?amountGuaranies:rate?.yellow_guaranies||0;
      const red=details.key==='red'?amountGuaranies:rate?.red_guaranies||0;
      await client.query('INSERT INTO tournament_payment_rates(id,organization_id,tournament_id,version,yellow_guaranies,red_guaranies,custom_card_rates,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),organizationId,tournamentId,(rate?.version||0)+1,yellow,red,JSON.stringify(customRates),actor.user_id]);
      await audit(client,actor.user_id,organizationId,'payments.card_rate_suggested',tournamentId,'Primer importe de tarjeta guardado para sugerencias',null,{cardKey:details.key,amountGuaranies});
    }
    const chargeId=randomUUID();
    await client.query(`INSERT INTO tournament_money_entries(id,organization_id,tournament_id,kind,category,entry_id,card_event_id,amount_guaranies,description,occurred_on,created_by)
      VALUES($1,$2,$3,'charge',$4,$5,$6,$7,$8,$9,$10)`,[chargeId,organizationId,tournamentId,details.category,card.entry_id,eventId,amountGuaranies,`Tarjeta ${details.label.toLowerCase()} · acta oficial`,card.occurred_on,actor.user_id]);
    await audit(client,actor.user_id,organizationId,'payments.card_charge_created',chargeId,'Cargo de tarjeta desde acta oficial',null,{eventId,matchId:card.match_id,entryId:card.entry_id,amountGuaranies});
    return {id:chargeId,eventId,amountGuaranies};
  }
  app.get(root,async request=>{
    const {organizationId,tournamentId}=await scope(request);
    const [{rows:[rate]},{rows:entries},{rows:cardRules},{rows:officialCards}]=await Promise.all([
      pool.query('SELECT version,yellow_guaranies,red_guaranies,custom_card_rates FROM tournament_payment_rates WHERE organization_id=$1 AND tournament_id=$2 ORDER BY version DESC LIMIT 1',[organizationId,tournamentId]),
      pool.query(`SELECT m.id,m.kind,m.category,m.entry_id,m.linked_charge_id,m.card_event_id,m.amount_guaranies,m.description,to_char(m.occurred_on,'YYYY-MM-DD') occurred_on,m.created_at,m.voided_at,m.void_reason,t.name team_name
        FROM tournament_money_entries m LEFT JOIN team_entries te ON te.organization_id=m.organization_id AND te.id=m.entry_id
        LEFT JOIN teams t ON t.organization_id=te.organization_id AND t.id=te.team_id
        WHERE m.organization_id=$1 AND m.tournament_id=$2 ORDER BY m.occurred_on DESC,m.created_at DESC,m.id DESC`,[organizationId,tournamentId]),
      pool.query(`SELECT c.id category_id,c.name category_name,r.rules FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id
        JOIN LATERAL (SELECT rules FROM rule_versions WHERE organization_id=c.organization_id AND category_id=c.id ORDER BY version DESC LIMIT 1) r ON true
        WHERE c.organization_id=$1 AND e.tournament_id=$2`,[organizationId,tournamentId]),
      pool.query(officialCardsQuery,[organizationId,tournamentId,null]),
    ]);
    const active=entries.filter(row=>!row.voided_at);
    const paid=new Map<string,number>();
    for(const row of active)if(row.kind==='income'&&row.linked_charge_id)paid.set(row.linked_charge_id,(paid.get(row.linked_charge_id)||0)+row.amount_guaranies);
    const charges=new Map(active.filter(row=>row.kind==='charge'&&row.card_event_id).map(row=>[row.card_event_id,row]));
    const cardEvents=officialCards.flatMap(row=>{const details=cardDetails(row);if(!details)return [];const charge=charges.get(row.event_id);
      const suggestedAmount=details.key==='yellow'?rate?.yellow_guaranies||0:details.key==='red'?rate?.red_guaranies||0:rate?.custom_card_rates?.[details.key]||0;
      return [{eventId:row.event_id,matchId:row.match_id,entryId:row.entry_id,teamName:row.team_name,playerName:row.player_name,
        matchLabel:`${row.home_name} vs ${row.away_name}`,occurredOn:row.occurred_on,label:details.label,
        cardKey:details.key,canCharge:row.record_status==='official',suggestedAmount,chargeId:charge?.id||null,amountGuaranies:charge?.amount_guaranies||null,
        outstandingGuaranies:charge?Math.max(0,charge.amount_guaranies-(paid.get(charge.id)||0)):null}];});
    const currentEventIds=new Set(cardEvents.map(card=>card.eventId));
    return {rates:{version:rate?.version||0,yellowGuaranies:rate?.yellow_guaranies||0,redGuaranies:rate?.red_guaranies||0,customCardRates:rate?.custom_card_rates||{}},cards:cardRules.flatMap(row=>(row.rules?.advanced?.discipline?.customCards||[]).map((card:{code:string;label:string;color:string})=>({key:`${row.category_id}:${card.code}`,label:card.label,color:card.color,categoryName:row.category_name}))),cardEvents,
      entries:entries.map(row=>({...row,source_changed:!!row.card_event_id&&!currentEventIds.has(row.card_event_id),outstanding_guaranies:row.kind==='charge'&&!row.voided_at?Math.max(0,row.amount_guaranies-(paid.get(row.id)||0)):null})),summary:{incomeGuaranies:active.filter(row=>row.kind==='income').reduce((sum,row)=>sum+row.amount_guaranies,0),expenseGuaranies:active.filter(row=>row.kind==='expense').reduce((sum,row)=>sum+row.amount_guaranies,0),pendingGuaranies:active.filter(row=>row.kind==='charge').reduce((sum,row)=>sum+Math.max(0,row.amount_guaranies-(paid.get(row.id)||0)),0)}};
  });
  app.post(`${root}/card-charges/:eventId`,async(request,reply)=>{
    const {organizationId,tournamentId,actor}=await scope(request);
    const eventId=id.parse((request.params as {eventId:string}).eventId),input=cardChargeInput.parse(request.body);
    const created=await transaction(pool,async client=>{
      await client.query('SELECT id FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,tournamentId]);
      return insertCardCharge(client,organizationId,tournamentId,actor,eventId,input.amountGuaranies);
    });
    return reply.code(201).send(created);
  });
  app.post(`${root}/card-charges`,async(request,reply)=>{
    const {organizationId,tournamentId,actor}=await scope(request),input=cardChargesInput.parse(request.body);
    if(new Set(input.items.map(item=>item.eventId)).size!==input.items.length)fail(400,'CARD_DUPLICATE','La misma tarjeta aparece dos veces.');
    const created=await transaction(pool,async client=>{
      await client.query('SELECT id FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,tournamentId]);
      const charges=[];
      for(const item of input.items)charges.push(await insertCardCharge(client,organizationId,tournamentId,actor,item.eventId,item.amountGuaranies,input.entryId));
      return charges;
    });
    return reply.code(201).send({charges:created,totalGuaranies:created.reduce((sum,item)=>sum+item.amountGuaranies,0)});
  });
  app.post(`${root}/cards`,async request=>{
    const {organizationId,tournamentId,actor}=await scope(request),input=cardInput.parse(request.body);
    return transaction(pool,async client=>{
      const {rows:[category]}=await client.query(`SELECT c.id FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id
        WHERE c.organization_id=$1 AND c.id=$2 AND e.tournament_id=$3 FOR UPDATE OF c`,[organizationId,input.categoryId,tournamentId]);
      if(!category)fail(404,'CATEGORY_NOT_FOUND','La categoría no pertenece a este torneo.');
      const {rows:[latest]}=await client.query('SELECT version,status,rules FROM rule_versions WHERE organization_id=$1 AND category_id=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE',[organizationId,input.categoryId]);
      if(!latest)fail(409,'RULES_MISSING','Guardá primero el reglamento de la categoría.');
      if(latest.status==='draft')fail(409,'RULES_DRAFT','Hay un reglamento en borrador. Publicalo antes de agregar la tarjeta desde Pagos.');
      const rules=ruleSchema.parse(latest.rules);
      if(!rules.advanced)fail(409,'CARD_RULES_MISSING','El reglamento aún no define tarjetas.');
      const cards=rules.advanced.discipline.customCards||[];
      if(cards.length>=8)fail(409,'CARD_LIMIT','Ya se configuró el máximo de tarjetas.');
      if(cards.some(card=>card.label.toLocaleLowerCase('es')===input.label.toLocaleLowerCase('es')))fail(409,'CARD_EXISTS','Esa tarjeta ya existe.');
      const code=`c_${randomUUID().replaceAll('-','').slice(0,12)}`;
      rules.advanced.discipline.customCards=[...cards,{code,label:input.label,color:input.color,suspensionMatches:input.suspensionMatches}];
      ruleSchema.parse(rules);
      const ruleId=randomUUID();
      await client.query("INSERT INTO rule_versions(id,organization_id,category_id,version,revision,status,rules,created_by,effective_at) VALUES($1,$2,$3,$4,1,'published',$5,$6,now())",[ruleId,organizationId,input.categoryId,latest.version+1,JSON.stringify(rules),actor.user_id]);
      const {rows:[rate]}=await client.query('SELECT version,yellow_guaranies,red_guaranies,custom_card_rates FROM tournament_payment_rates WHERE organization_id=$1 AND tournament_id=$2 ORDER BY version DESC LIMIT 1 FOR UPDATE',[organizationId,tournamentId]);
      const customRates={...(rate?.custom_card_rates||{}),[`${input.categoryId}:${code}`]:input.amountGuaranies};
      await client.query('INSERT INTO tournament_payment_rates(id,organization_id,tournament_id,version,yellow_guaranies,red_guaranies,custom_card_rates,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),organizationId,tournamentId,(rate?.version||0)+1,rate?.yellow_guaranies||0,rate?.red_guaranies||0,JSON.stringify(customRates),actor.user_id]);
      await audit(client,actor.user_id,organizationId,'rules.card_added',ruleId,`Tarjeta ${input.label} agregada`,{ruleVersion:latest.version},{ruleVersion:latest.version+1,code,amountGuaranies:input.amountGuaranies});
      return {code,label:input.label};
    });
  });
  app.post(`${root}/rates`,async request=>{
    const {organizationId,tournamentId,actor}=await scope(request),input=ratesInput.parse(request.body);
    return transaction(pool,async client=>{
      await client.query('SELECT id FROM tournaments WHERE organization_id=$1 AND id=$2 FOR UPDATE',[organizationId,tournamentId]);
      const {rows:rules}=await client.query(`SELECT c.id,r.rules FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id LEFT JOIN LATERAL (SELECT rules FROM rule_versions WHERE organization_id=c.organization_id AND category_id=c.id ORDER BY version DESC LIMIT 1) r ON true WHERE c.organization_id=$1 AND e.tournament_id=$2`,[organizationId,tournamentId]);
      const allowedCards=new Set<string>(rules.flatMap(row=>(row.rules?.advanced?.discipline?.customCards||[]).map((card:{code:string})=>`${row.id}:${card.code}`)));
      if(Object.keys(input.customCardRates).some(key=>!allowedCards.has(key)))fail(400,'CARD_UNKNOWN','Una tarjeta no pertenece a este torneo.');
      const {rows:[latest]}=await client.query('SELECT version,yellow_guaranies,red_guaranies,custom_card_rates FROM tournament_payment_rates WHERE organization_id=$1 AND tournament_id=$2 ORDER BY version DESC LIMIT 1',[organizationId,tournamentId]);
      if(latest?.yellow_guaranies===input.yellowGuaranies&&latest?.red_guaranies===input.redGuaranies&&JSON.stringify(latest.custom_card_rates||{})===JSON.stringify(input.customCardRates))return {version:latest.version,...input};
      const version=(latest?.version||0)+1;
      await client.query('INSERT INTO tournament_payment_rates(id,organization_id,tournament_id,version,yellow_guaranies,red_guaranies,custom_card_rates,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),organizationId,tournamentId,version,input.yellowGuaranies,input.redGuaranies,JSON.stringify(input.customCardRates),actor.user_id]);
      await audit(client,actor.user_id,organizationId,'payments.rates_changed',tournamentId,'Tarifas de tarjetas actualizadas',latest||null,{version,...input});
      return {version,...input};
    });
  });
  app.post(root,async(request,reply)=>{
    const {organizationId,tournamentId,actor}=await scope(request),input=entryInput.parse(request.body);
    const allowed={charge:['fine_yellow','fine_red','fine_other'],income:['fine_payment','tickets','registration','match_fee','other'],expense:['referee','other']} as const;
    if(!(allowed[input.kind] as readonly string[]).includes(input.category))fail(400,'PAYMENT_CATEGORY','Elegí un concepto válido para este movimiento.');
    if(input.kind==='charge'&&!input.entryId)fail(400,'TEAM_REQUIRED','Elegí el equipo al que corresponde el cargo.');
    if(input.category==='fine_payment'&&!input.linkedChargeId)fail(400,'CHARGE_REQUIRED','Elegí la multa que se cobró.');
    if(input.linkedChargeId&&input.category!=='fine_payment')fail(400,'CHARGE_NOT_ALLOWED','Este movimiento no puede cobrar una multa.');
    const created=await transaction(pool,async client=>{
      if(input.entryId){const {rowCount}=await client.query(`SELECT 1 FROM team_entries te JOIN categories c ON c.organization_id=te.organization_id AND c.id=te.category_id JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id WHERE te.organization_id=$1 AND te.id=$2 AND e.tournament_id=$3`,[organizationId,input.entryId,tournamentId]);if(!rowCount)fail(404,'TEAM_NOT_FOUND','El equipo no pertenece a este torneo.');}
      let amount=input.amountGuaranies;
      if(input.kind==='charge'&&(input.category==='fine_yellow'||input.category==='fine_red')&&amount===undefined){const {rows:[rate]}=await client.query('SELECT yellow_guaranies,red_guaranies FROM tournament_payment_rates WHERE organization_id=$1 AND tournament_id=$2 ORDER BY version DESC LIMIT 1',[organizationId,tournamentId]);amount=input.category==='fine_yellow'?rate?.yellow_guaranies:rate?.red_guaranies;}
      if(!amount)fail(400,'AMOUNT_REQUIRED','Ingresá un importe mayor a cero.');
      let teamEntry=input.entryId;
      if(input.linkedChargeId){
        const {rows:[charge]}=await client.query("SELECT id,entry_id,amount_guaranies FROM tournament_money_entries WHERE organization_id=$1 AND tournament_id=$2 AND id=$3 AND kind='charge' AND voided_at IS NULL FOR UPDATE",[organizationId,tournamentId,input.linkedChargeId]);
        if(!charge)fail(404,'CHARGE_NOT_FOUND','No se encontró la multa pendiente.');
        if(teamEntry&&teamEntry!==charge.entry_id)fail(400,'TEAM_MISMATCH','El cobro corresponde a otro equipo.');
        teamEntry=charge.entry_id;
        const {rows:[paid]}=await client.query("SELECT coalesce(sum(amount_guaranies),0)::int total FROM tournament_money_entries WHERE organization_id=$1 AND tournament_id=$2 AND linked_charge_id=$3 AND kind='income' AND voided_at IS NULL",[organizationId,tournamentId,input.linkedChargeId]);
        if(amount>charge.amount_guaranies-paid.total)fail(409,'AMOUNT_EXCEEDS_CHARGE','El importe supera lo pendiente de esta multa.');
      }
      const item={id:randomUUID(),kind:input.kind,category:input.category,entryId:teamEntry,amountGuaranies:amount,occurredOn:input.occurredOn,description:input.description};
      await client.query('INSERT INTO tournament_money_entries(id,organization_id,tournament_id,kind,category,entry_id,linked_charge_id,amount_guaranies,description,occurred_on,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[item.id,organizationId,tournamentId,item.kind,item.category,item.entryId,input.linkedChargeId,item.amountGuaranies,item.description,item.occurredOn,actor.user_id]);
      await audit(client,actor.user_id,organizationId,'payments.entry_created',item.id,'Movimiento registrado',null,item);
      return item;
    });
    return reply.code(201).send(created);
  });
  app.post(`${root}/:entryId/void`,async request=>{
    const {organizationId,tournamentId,actor}=await scope(request),entryId=id.parse((request.params as {entryId:string}).entryId),input=voidInput.parse(request.body);
    return transaction(pool,async client=>{
      const {rows:[entry]}=await client.query('SELECT id,kind,voided_at FROM tournament_money_entries WHERE organization_id=$1 AND tournament_id=$2 AND id=$3 FOR UPDATE',[organizationId,tournamentId,entryId]);
      if(!entry)fail(404,'ENTRY_NOT_FOUND','No se encontró el movimiento.');
      if(entry.voided_at)fail(409,'ENTRY_VOIDED','Este movimiento ya fue anulado.');
      if(entry.kind==='charge'){const {rowCount}=await client.query('SELECT 1 FROM tournament_money_entries WHERE organization_id=$1 AND tournament_id=$2 AND linked_charge_id=$3 AND voided_at IS NULL LIMIT 1',[organizationId,tournamentId,entryId]);if(rowCount)fail(409,'CHARGE_HAS_PAYMENTS','Anulá sus cobros antes de anular la multa.');}
      await client.query('UPDATE tournament_money_entries SET voided_by=$1,voided_at=now(),void_reason=$2 WHERE organization_id=$3 AND tournament_id=$4 AND id=$5',[actor.user_id,input.reason,organizationId,tournamentId,entryId]);
      await audit(client,actor.user_id,organizationId,'payments.entry_voided',entryId,input.reason,{kind:entry.kind},null);
      return {id:entryId,voided:true};
    });
  });
}
