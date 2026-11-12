import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
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
  app.get(root,async request=>{
    const {organizationId,tournamentId}=await scope(request);
    const [{rows:[rate]},{rows:entries},{rows:cardRules}]=await Promise.all([
      pool.query('SELECT version,yellow_guaranies,red_guaranies,custom_card_rates FROM tournament_payment_rates WHERE organization_id=$1 AND tournament_id=$2 ORDER BY version DESC LIMIT 1',[organizationId,tournamentId]),
      pool.query(`SELECT m.id,m.kind,m.category,m.entry_id,m.linked_charge_id,m.amount_guaranies,m.description,to_char(m.occurred_on,'YYYY-MM-DD') occurred_on,m.created_at,m.voided_at,m.void_reason,t.name team_name
        FROM tournament_money_entries m LEFT JOIN team_entries te ON te.organization_id=m.organization_id AND te.id=m.entry_id
        LEFT JOIN teams t ON t.organization_id=te.organization_id AND t.id=te.team_id
        WHERE m.organization_id=$1 AND m.tournament_id=$2 ORDER BY m.occurred_on DESC,m.created_at DESC,m.id DESC`,[organizationId,tournamentId]),
      pool.query(`SELECT c.id category_id,c.name category_name,r.rules FROM categories c JOIN editions e ON e.organization_id=c.organization_id AND e.id=c.edition_id
        JOIN LATERAL (SELECT rules FROM rule_versions WHERE organization_id=c.organization_id AND category_id=c.id AND status='published' ORDER BY version DESC LIMIT 1) r ON true
        WHERE c.organization_id=$1 AND e.tournament_id=$2`,[organizationId,tournamentId]),
    ]);
    const active=entries.filter(row=>!row.voided_at);
    const paid=new Map<string,number>();
    for(const row of active)if(row.kind==='income'&&row.linked_charge_id)paid.set(row.linked_charge_id,(paid.get(row.linked_charge_id)||0)+row.amount_guaranies);
    return {rates:{version:rate?.version||0,yellowGuaranies:rate?.yellow_guaranies||0,redGuaranies:rate?.red_guaranies||0,customCardRates:rate?.custom_card_rates||{}},cards:cardRules.flatMap(row=>(row.rules?.advanced?.discipline?.customCards||[]).map((card:{code:string;label:string;color:string})=>({key:`${row.category_id}:${card.code}`,label:card.label,color:card.color,categoryName:row.category_name}))),entries:entries.map(row=>({...row,outstanding_guaranies:row.kind==='charge'&&!row.voided_at?Math.max(0,row.amount_guaranies-(paid.get(row.id)||0)):null})),summary:{incomeGuaranies:active.filter(row=>row.kind==='income').reduce((sum,row)=>sum+row.amount_guaranies,0),expenseGuaranies:active.filter(row=>row.kind==='expense').reduce((sum,row)=>sum+row.amount_guaranies,0),pendingGuaranies:active.filter(row=>row.kind==='charge').reduce((sum,row)=>sum+Math.max(0,row.amount_guaranies-(paid.get(row.id)||0)),0)}};
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
