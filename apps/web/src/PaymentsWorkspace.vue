<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { TournamentEntry, TournamentSummary } from '@torneos/shared';
import Icon from './Icon.vue';
import { organizerReads } from './view-reads.ts';

type Kind='charge'|'income'|'expense';
interface Movement { id:string;kind:Kind;category:string;entry_id:string|null;team_name:string|null;amount_guaranies:number;description:string;occurred_on:string;voided_at:string|null;outstanding_guaranies:number|null;source_changed?:boolean;match_fee_match_id?:string|null }
interface CardEvent { eventId:string;entryId:string;teamName:string;label:string;cardKey:string;canCharge:boolean;suggestedAmount:number;chargeId:string|null;amountGuaranies:number|null }
interface CardTypeGroup { key:string;label:string;cards:CardEvent[] }
interface CardGroup { entryId:string;teamName:string;cards:CardEvent[];types:CardTypeGroup[] }
interface MatchFee { match_id:string;entry_id:string;team_name:string;opponent_name:string;ordinal:number;match_date:string|null }
interface Book { matchFeeGuaranies?:number|null;pendingMatchFees?:MatchFee[];rates:{version:number;yellowGuaranies:number;redGuaranies:number;customCardRates:Record<string,number>};cards:Array<{key:string;label:string;color:string;categoryName:string}>;cardEvents:CardEvent[];entries:Movement[];summary:{incomeGuaranies:number;expenseGuaranies:number;pendingGuaranies:number} }
const props=defineProps<{organizationId:string;tournamentId:string;teams:TournamentEntry[];categories:TournamentSummary[];initialEntryId?:string;showRates?:boolean;csrfToken:string}>();
const emit=defineEmits<{refresh:[]}>();
const book=ref<Book|null>(null),error=ref(''),busy=ref(false),formOpen=ref(false),filter=ref<'all'|Kind>('all'),teamFilter=ref(''),voidId=ref(''),voidReason=ref('');
const movementForm=ref<HTMLElement|null>(null);
const selectedFee=ref<MatchFee|null>(null),feesOpen=ref(false),feeDay=ref<number|null>(null);
const priorFee=ref('');
const unlinkedFees=computed(()=>(book.value?.entries||[]).filter(item=>item.category==='match_fee'&&item.kind==='income'&&!item.voided_at&&!item.match_fee_match_id));
const priorFees=computed(()=>selectedFee.value?unlinkedFees.value.filter(item=>!item.entry_id||item.entry_id===selectedFee.value?.entry_id):[]);
const feeRate=ref<number|string>('');
const pendingFees=computed(()=>(book.value?.pendingMatchFees||[]).filter(fee=>!teamFilter.value||fee.entry_id===teamFilter.value));
const feeDays=computed(()=>[...new Set(pendingFees.value.map(fee=>fee.ordinal))]);
const shownFees=computed(()=>pendingFees.value.filter(fee=>fee.ordinal===(feeDay.value??feeDays.value[0])));
watch(feeDays,days=>{if(feeDay.value!==null&&!days.includes(feeDay.value))feeDay.value=null;});
const expandedTeams=ref(new Set<string>());
function toggleTeam(entryId:string,event:Event){
  if((event.currentTarget as HTMLDetailsElement).open)expandedTeams.value.add(entryId);
  else expandedTeams.value.delete(entryId);
}
const paymentScope=computed(()=>`${props.csrfToken}:${props.organizationId}:${props.tournamentId}`);
let loadEpoch=0;
const cardOpen=ref(false),cardDraft=reactive({categoryId:props.categories[0]?.category_id||'',label:'',color:'#2278C7',suspensionMatches:0,amountGuaranies:0});
const cardAmounts=reactive<Record<string,number|null>>({});
const cardAutoSource=reactive<Record<string,string>>({});
const rates=reactive({yellowGuaranies:0,redGuaranies:0,customCardRates:{} as Record<string,number>});
const customCards=computed(()=>book.value?.cards||[]);
const chargeOptions=computed<Array<[string,string]>>(()=>[...options.charge.slice(0,2),...customCards.value.map(card=>[`card:${card.key}`,`${card.label}${props.categories.length>1?` · ${card.categoryName}`:''}`] as [string,string]),options.charge[2]]);
const selectedConcept=ref('fine_yellow');
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Asuncion'});
const draft=reactive<{kind:Kind;category:string;entryId:string;linkedChargeId:string;amountGuaranies:number|null;description:string;occurredOn:string}>({kind:'charge',category:'fine_yellow',entryId:'',linkedChargeId:'',amountGuaranies:null,description:'Tarjeta amarilla',occurredOn:today()});
const options:Record<Kind,Array<[string,string]>>={charge:[['fine_yellow','Amarilla'],['fine_red','Roja'],['fine_other','Otra multa']],income:[['tickets','Entradas'],['registration','Inscripción'],['match_fee','Derecho de partido'],['other','Otro ingreso']],expense:[['referee','Árbitros'],['other','Otra salida']]};
const names:Record<string,string>={fine_yellow:'Amarilla',fine_red:'Roja',fine_other:'Otra multa',fine_payment:'Cobro de multa',tickets:'Entradas',registration:'Inscripción',match_fee:'Derecho de partido',referee:'Árbitros',other:'Otro'};
const visible=computed(()=>book.value?.entries.filter(item=>(filter.value==='all'||item.kind===filter.value)&&(!teamFilter.value||item.entry_id===teamFilter.value))||[]);
const visibleCards=computed(()=>book.value?.cardEvents.filter(card=>!teamFilter.value||card.entryId===teamFilter.value)||[]);
const cardGroups=computed<CardGroup[]>(()=>{const groups=new Map<string,CardGroup>();for(const card of visibleCards.value){let group=groups.get(card.entryId);if(!group){group={entryId:card.entryId,teamName:card.teamName,cards:[],types:[]};groups.set(card.entryId,group);}group.cards.push(card);let type=group.types.find(item=>item.key===card.cardKey);if(!type){type={key:card.cardKey,label:card.cardKey==='yellow'?'Amarilla':card.cardKey==='red'?'Roja':card.label,cards:[]};group.types.push(type);}type.cards.push(card);}return [...groups.values()].sort((a,b)=>a.teamName.localeCompare(b.teamName,'es'));});
const summary=computed(()=>{if(!book.value)return null;if(!teamFilter.value)return book.value.summary;const rows=book.value.entries.filter(item=>item.entry_id===teamFilter.value&&!item.voided_at);return {incomeGuaranies:rows.filter(item=>item.kind==='income').reduce((total,item)=>total+item.amount_guaranies,0),expenseGuaranies:rows.filter(item=>item.kind==='expense').reduce((total,item)=>total+item.amount_guaranies,0),pendingGuaranies:rows.filter(item=>item.kind==='charge').reduce((total,item)=>total+(item.outstanding_guaranies||0),0)};});
const teamName=computed(()=>props.teams.find(team=>team.entry_id===teamFilter.value)?.name||'');
const format=(amount:number)=>`Gs. ${amount.toLocaleString('es-PY')}`;
const amountKey=(card:CardEvent)=>`${card.entryId}:${card.cardKey}`;
const cardAmount=(card:CardEvent)=>card.chargeId?card.amountGuaranies||0:card.canCharge?Number(cardAmounts[amountKey(card)])||0:0;
const groupTotal=(group:CardGroup)=>group.cards.reduce((total,card)=>total+cardAmount(card),0);
const typeTotal=(type:CardTypeGroup)=>type.cards.reduce((total,card)=>total+cardAmount(card),0);
const readyCards=(group:CardGroup)=>group.cards.filter(card=>!card.chargeId&&card.canCharge&&Number.isInteger(cardAmount(card))&&cardAmount(card)>0&&cardAmount(card)<=1000000000);
const unpricedCards=(group:CardGroup)=>group.cards.filter(card=>!card.chargeId&&card.canCharge);
function editCardAmount(type:CardTypeGroup,entryId:string,event:Event){const key=`${entryId}:${type.key}`,raw=(event.target as HTMLInputElement).value,amount=raw===''?null:Number(raw);delete cardAutoSource[key];cardAmounts[key]=amount;for(const other of book.value?.cardEvents||[])if(other.entryId!==entryId&&other.cardKey===type.key&&!other.chargeId){const otherKey=amountKey(other);if(cardAutoSource[otherKey]===key||!cardAmounts[otherKey]){cardAmounts[otherKey]=amount;cardAutoSource[otherKey]=key;}}}
function revealForm(){formOpen.value=true;void nextTick(()=>movementForm.value?.scrollIntoView({behavior:'smooth',block:'start'}));}
async function request(path='',method='GET',body?:unknown){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  const scope=paymentScope.value;
  try{
    const response=await fetch(`/api/v1/organizations/${props.organizationId}/tournaments/${props.tournamentId}/payments${path}`,{method,signal:controller.signal,credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':props.csrfToken},body:body===undefined?undefined:JSON.stringify(body)});
    const value=await response.json();
    if(!response.ok)throw new Error(value.message||(method==='GET'?'No se pudo cargar Pagos.':'No se pudo guardar.'));
    if(method!=='GET')organizerReads.invalidateWhere((group,key)=>group==='payments'&&key===scope);
    return value;
  }catch(cause){
    if(controller.signal.aborted)throw new Error(method==='GET'?'Pagos tardó en responder. Podés reintentar.':'El servidor tardó en responder. Revisá el libro de pagos antes de volver a guardar.');
    throw cause;
  }finally{
    clearTimeout(timeout);
  }
}
async function load(){
  const epoch=++loadEpoch;
  const scope=paymentScope.value;
  const current=()=>epoch===loadEpoch&&scope===paymentScope.value;
  error.value='';
  try{
    const next=await organizerReads.read<Book>('payments',scope,()=>request('?resumen=1'));
    if(!current())return;
    book.value=next;
    feeRate.value=next.matchFeeGuaranies??'';
    rates.yellowGuaranies=next.rates.yellowGuaranies;
    rates.redGuaranies=next.rates.redGuaranies;
    rates.customCardRates={...next.rates.customCardRates};
    for(const key of Object.keys(cardAutoSource))delete cardAutoSource[key];
    for(const key of Object.keys(cardAmounts))delete cardAmounts[key];
    for(const card of next.cardEvents)if(!card.chargeId)cardAmounts[amountKey(card)]=card.suggestedAmount||null;
  }catch(cause){if(current())error.value=cause instanceof Error?cause.message:'No se pudo cargar Pagos.';}
}
function chooseKind(kind:Kind){selectedFee.value=null;draft.kind=kind;draft.category=options[kind][0][0];selectedConcept.value=draft.category;draft.linkedChargeId='';draft.amountGuaranies=null;draft.description=kind==='charge'?'Tarjeta amarilla':'';if(kind==='charge')chooseCategory('fine_yellow');}
function chooseCategory(category:string){selectedConcept.value=category;draft.category=category.startsWith('card:')?'fine_other':category;if(category==='fine_yellow'){draft.amountGuaranies=rates.yellowGuaranies||null;draft.description='Tarjeta amarilla';}else if(category==='fine_red'){draft.amountGuaranies=rates.redGuaranies||null;draft.description='Tarjeta roja';}else if(category.startsWith('card:')){const key=category.slice(5);draft.amountGuaranies=rates.customCardRates[key]||null;draft.description=`Tarjeta ${customCards.value.find(card=>card.key===key)?.label||''}`.trim();}else{draft.amountGuaranies=null;draft.description='';}}
function openNew(kind:Kind='charge'){chooseKind(kind);draft.entryId=teamFilter.value||'';draft.occurredOn=today();revealForm();}
function collect(item:Movement){chooseKind('income');draft.category='fine_payment';draft.linkedChargeId=item.id;draft.entryId=item.entry_id||'';draft.amountGuaranies=item.outstanding_guaranies;draft.description=`Cobro: ${item.description}`;draft.occurredOn=today();revealForm();}
function collectMatchFee(fee:MatchFee){
  chooseKind('income');
  selectedFee.value=fee;
  priorFee.value='';
  draft.category='match_fee';
  draft.entryId=fee.entry_id;
  draft.amountGuaranies=book.value?.matchFeeGuaranies??null;
  draft.occurredOn=today();
  revealForm();
}
async function save(){
  const fee=selectedFee.value;
  if(busy.value||(!priorFee.value||!fee)&&(!draft.amountGuaranies||(!fee&&!draft.description.trim())))return;
  busy.value=true;error.value='';
  try{
    if(fee&&priorFee.value)await request(`/match-fees/${fee.match_id}/link`,'POST',{entryId:fee.entry_id,movementId:priorFee.value});
    else if(fee)await request(`/match-fees/${fee.match_id}/collect`,'POST',{entryId:fee.entry_id,amountGuaranies:draft.amountGuaranies,occurredOn:draft.occurredOn});
    else await request('','POST',{kind:draft.kind,category:draft.category,entryId:draft.entryId||null,linkedChargeId:draft.linkedChargeId||null,amountGuaranies:draft.amountGuaranies,description:draft.description.trim(),occurredOn:draft.occurredOn});
    formOpen.value=false;selectedFee.value=null;await load();
  }catch(cause){error.value=cause instanceof Error?cause.message:'No se pudo guardar.';}
  finally{busy.value=false;}
}
async function saveFeeRate(){
  if(busy.value)return;
  busy.value=true;error.value='';
  try{await request('/match-fee-rate','POST',{amountGuaranies:feeRate.value===''?null:Number(feeRate.value)});await load();}
  catch(cause){error.value=cause instanceof Error?cause.message:'No se pudo guardar el importe sugerido.';}
  finally{busy.value=false;}
}
async function saveRates(){busy.value=true;error.value='';try{await request('/rates','POST',{yellowGuaranies:Number(rates.yellowGuaranies),redGuaranies:Number(rates.redGuaranies),customCardRates:Object.fromEntries(customCards.value.map(card=>[card.key,Number(rates.customCardRates[card.key]||0)]))});await load();}catch(cause){error.value=cause instanceof Error?cause.message:'No se pudieron guardar los importes.';}finally{busy.value=false;}}
async function saveCard(){busy.value=true;error.value='';try{await request('/cards','POST',{categoryId:cardDraft.categoryId,label:cardDraft.label.trim(),color:cardDraft.color,suspensionMatches:Number(cardDraft.suspensionMatches),amountGuaranies:Number(cardDraft.amountGuaranies)});cardDraft.label='';cardDraft.amountGuaranies=0;cardDraft.suspensionMatches=0;cardOpen.value=false;await load();emit('refresh');}catch(cause){error.value=cause instanceof Error?cause.message:'No se pudo agregar la tarjeta.';}finally{busy.value=false;}}
async function saveTeamCards(group:CardGroup){const cards=readyCards(group);if(!cards.length||cards.length!==unpricedCards(group).length)return;busy.value=true;error.value='';try{await request('/card-charges','POST',{entryId:group.entryId,items:cards.map(card=>({eventId:card.eventId,amountGuaranies:cardAmount(card)}))});await load();}catch(cause){error.value=cause instanceof Error?cause.message:'No se pudieron guardar los importes de este equipo.';}finally{busy.value=false;}}
async function voidMovement(item:Movement){if(voidReason.value.trim().length<3)return;busy.value=true;error.value='';try{await request(`/${item.id}/void`,'POST',{reason:voidReason.value.trim()});voidId.value='';voidReason.value='';await load();}catch(cause){error.value=cause instanceof Error?cause.message:'No se pudo anular.';}finally{busy.value=false;}}
watch(()=>props.initialEntryId,value=>{teamFilter.value=value||'';draft.entryId=value||'';},{immediate:true});
watch(paymentScope,()=>{book.value=organizerReads.peek<Book>('payments',paymentScope.value)??null;expandedTeams.value.clear();voidId.value='';formOpen.value=false;selectedFee.value=null;feeDay.value=null;feesOpen.value=false;void load();},{immediate:true});
</script>

<template>
  <section class="payments-workspace">
    <div class="between"><h2>Pagos</h2><button type="button" class="btn primary" :disabled="!book" @click="openNew()"><Icon name="plus" />Registrar</button></div>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <button v-if="error&&!book" type="button" class="btn" @click="load">Reintentar</button>
    <form v-if="formOpen" ref="movementForm" class="payments-form" @submit.prevent="save">
      <div class="between"><h3>{{ selectedFee?(priorFee?'Vincular cobro anterior':'Cobrar derecho de partido'):draft.kind==='charge'?'Multa a favor de la federación':draft.linkedChargeId?'Cobrar multa':draft.kind==='income'?'Registrar ingreso':'Registrar salida' }}</h3><button type="button" class="icon-button" aria-label="Cerrar" @click="formOpen=false"><Icon name="close" /></button></div>
      <div v-if="!selectedFee&&!draft.linkedChargeId" class="choices" role="group" aria-label="Tipo de movimiento"><button v-for="[kind,label] in [['charge','Multa'],['income','Ingreso'],['expense','Salida']]" :key="kind" type="button" class="choice" :aria-pressed="draft.kind===kind" @click="chooseKind(kind as Kind)">{{ label }}</button></div>
      <div v-if="!selectedFee&&!draft.linkedChargeId" class="choices" role="group" aria-label="Concepto"><button v-for="[category,label] in draft.kind==='charge'?chargeOptions:options[draft.kind]" :key="category" type="button" class="choice" :aria-pressed="selectedConcept===category" @click="chooseCategory(category)">{{ label }}</button></div>
      <div v-if="!selectedFee&&draft.kind!=='expense'" class="field"><label for="payment-team">Equipo {{ draft.kind==='charge'?'':'(opcional)' }}</label><select id="payment-team" v-model="draft.entryId" :disabled="!!draft.linkedChargeId" :required="draft.kind==='charge'"><option value="">{{ draft.kind==='charge'?'Elegí equipo':'Sin equipo' }}</option><option v-for="team in teams" :key="team.entry_id" :value="team.entry_id">{{ team.name }} · {{ team.category_name }}</option></select></div>
      <p v-if="selectedFee"><strong>{{ selectedFee.team_name }}</strong> · vs {{ selectedFee.opponent_name }} · Fecha {{ selectedFee.ordinal }}</p>
      <div v-if="priorFees.length" class="field"><label for="prior-match-fee">Si ya se cobró, elegí el ingreso anterior</label><select id="prior-match-fee" v-model="priorFee"><option value="">Registrar un cobro nuevo</option><option v-for="item in priorFees" :key="item.id" :value="item.id">{{ item.occurred_on }} · {{ format(item.amount_guaranies) }} · {{ item.description }}{{ item.entry_id?'':' · Sin equipo' }}</option></select></div>
      <div v-if="!selectedFee||!priorFee" class="form-grid"><div class="field"><label for="payment-amount">Importe Gs.</label><input id="payment-amount" v-model.number="draft.amountGuaranies" type="number" inputmode="numeric" min="1" max="1000000000" required></div><div class="field"><label for="payment-date">Fecha</label><input id="payment-date" v-model="draft.occurredOn" type="date" required></div></div>
      <div v-if="!selectedFee" class="field"><label for="payment-description">Detalle</label><input id="payment-description" v-model="draft.description" minlength="2" maxlength="160" required></div>
      <button class="btn primary full" :disabled="busy">{{ selectedFee ? (priorFee ? 'Vincular cobro' : 'Confirmar cobro') : 'Guardar' }}</button>
    </form>
    <div v-if="summary" class="payments-summary"><span>Ingresó <strong>{{ format(summary.incomeGuaranies) }}</strong></span><span>Salió <strong>{{ format(summary.expenseGuaranies) }}</strong></span><span>Multas por cobrar <strong>{{ format(summary.pendingGuaranies) }}</strong></span></div>
    <div v-if="teamFilter" class="payments-team"><strong>{{ teamName }}</strong><button type="button" class="btn" @click="teamFilter='';draft.entryId=''">Ver todo</button></div>
    <div class="payments-filters" role="group" aria-label="Filtrar pagos"><button v-for="[value,label] in [['all','Todos'],['charge','Multas'],['income','Ingresos'],['expense','Salidas']]" :key="value" type="button" :aria-pressed="filter===value" @click="filter=value as typeof filter">{{ label }}</button></div>
    <details v-if="book&&(filter==='all'||filter==='income')" class="payment-card-team" @toggle="feesOpen=($event.currentTarget as HTMLDetailsElement).open">
      <summary><span><strong>Derecho de partido</strong><small>{{ pendingFees.length }} pendientes<template v-if="book.matchFeeGuaranies"> · {{ format(book.matchFeeGuaranies) }} sugeridos por equipo</template></small></span><span class="payment-card-chevron" aria-hidden="true">⌄</span></summary>
      <div v-if="feesOpen" class="payment-card-team-body">
        <p v-if="unlinkedFees.length" class="small muted">{{ unlinkedFees.length }} cobros anteriores sin partido. Podés vincularlos al abrir «Cobrar».</p>
        <form class="payment-card-row" @submit.prevent="saveFeeRate"><div class="field"><label for="match-fee-rate">Importe sugerido · Gs. (opcional)</label><input id="match-fee-rate" v-model.number="feeRate" type="number" min="1" max="1000000000" inputmode="numeric"></div><button class="btn" :disabled="busy">Guardar importe</button></form>
        <div v-if="feeDays.length>1" class="field"><label for="match-fee-day">Fecha</label><select id="match-fee-day" :value="feeDay??feeDays[0]" @change="feeDay=Number(($event.target as HTMLSelectElement).value)"><option v-for="day in feeDays" :key="day" :value="day">Fecha {{ day }}</option></select></div>
        <p v-if="!shownFees.length" class="small muted">Sin derechos pendientes.</p>
        <div v-for="fee in shownFees" :key="`${fee.match_id}:${fee.entry_id}`" class="payment-card-row">
          <div class="payment-card-info"><strong>{{ fee.team_name }}</strong><small>vs {{ fee.opponent_name }} · Fecha {{ fee.ordinal }}<template v-if="fee.match_date"> · {{ fee.match_date }}</template></small><small>{{ book.matchFeeGuaranies ? format(book.matchFeeGuaranies) : 'Importe por definir' }}</small></div>
          <button type="button" class="btn" :disabled="busy" @click="collectMatchFee(fee)">Cobrar</button>
        </div>
      </div>
    </details>
    <section v-if="visibleCards.length&&(filter==='all'||filter==='charge')" class="payments-card-events" aria-label="Tarjetas por equipo">
      <div class="between"><h3>Tarjetas por equipo</h3><small>{{ visibleCards.length }} registradas</small></div>
      <details v-for="group in cardGroups" :key="group.entryId" class="payment-card-team" :open="!!teamFilter" @toggle="toggleTeam(group.entryId,$event)">
        <summary><span><strong>{{ group.teamName }}</strong><small>{{ group.cards.length }} {{ group.cards.length===1?'tarjeta':'tarjetas' }}<template v-if="unpricedCards(group).length"> · {{ unpricedCards(group).length }} sin importe</template></small></span><span class="payment-card-chevron" aria-hidden="true">⌄</span></summary>
        <form v-if="teamFilter||expandedTeams.has(group.entryId)" class="payment-card-team-body" @submit.prevent="saveTeamCards(group)">
          <div v-for="type in group.types" :key="type.key" class="payment-card-row">
            <div class="payment-card-info"><strong>{{ type.label }} × {{ type.cards.length }}</strong><small v-if="type.cards.some(card=>!card.chargeId&&card.canCharge)">{{ type.cards.filter(card=>!card.chargeId&&card.canCharge).length }} por registrar</small><small v-else-if="type.cards.some(card=>card.chargeId)">{{ format(typeTotal(type)) }} registrado</small><small v-if="type.cards.some(card=>!card.canCharge)">Acta en rectificación</small></div>
            <div v-if="type.cards.some(card=>!card.chargeId&&card.canCharge)" class="payment-card-price"><label :for="`card-price-${group.entryId}-${type.key}`">Precio c/u · Gs.</label><input :id="`card-price-${group.entryId}-${type.key}`" :value="cardAmounts[`${group.entryId}:${type.key}`]??''" type="number" inputmode="numeric" min="1" max="1000000000" required @input="editCardAmount(type,group.entryId,$event)"></div>
          </div>
          <div class="payment-card-team-total"><span>Total</span><strong>{{ format(groupTotal(group)) }}</strong></div>
          <button v-if="unpricedCards(group).length" class="btn primary full" :disabled="busy||readyCards(group).length!==unpricedCards(group).length">Guardar importes del equipo</button>
        </form>
      </details>
    </section>
    <details v-if="book" class="optional-section payments-rates" :open="showRates"><summary>Importes por tarjeta</summary><form class="stack" @submit.prevent="saveRates"><div class="form-grid"><div class="field"><label for="yellow-rate">Amarilla · Gs.</label><input id="yellow-rate" v-model.number="rates.yellowGuaranies" type="number" inputmode="numeric" min="0" max="1000000000" required></div><div class="field"><label for="red-rate">Roja · Gs.</label><input id="red-rate" v-model.number="rates.redGuaranies" type="number" inputmode="numeric" min="0" max="1000000000" required></div><div v-for="card in customCards" :key="card.key" class="field"><label :for="`rate-${card.key}`">{{ card.label }}{{ categories.length>1?` · ${card.categoryName}`:'' }} · Gs.</label><input :id="`rate-${card.key}`" v-model.number="rates.customCardRates[card.key]" type="number" inputmode="numeric" min="0" max="1000000000"></div></div><button class="btn" :disabled="busy">Guardar importes</button></form><button type="button" class="btn full" :aria-expanded="cardOpen" @click="cardOpen=!cardOpen"><Icon name="plus" />Agregar tarjeta</button><form v-if="cardOpen" class="stack mt" @submit.prevent="saveCard"><div v-if="categories.length>1" class="choices" role="group" aria-label="Categoría"><button v-for="category in categories" :key="category.category_id" type="button" class="choice" :aria-pressed="cardDraft.categoryId===category.category_id" @click="cardDraft.categoryId=category.category_id">{{ category.category_name }}</button></div><div class="form-grid"><div class="field"><label for="card-name">Tarjeta</label><input id="card-name" v-model="cardDraft.label" minlength="2" maxlength="40" placeholder="Ej. Azul" required></div><div class="field"><label for="card-amount">Importe · Gs.</label><input id="card-amount" v-model.number="cardDraft.amountGuaranies" type="number" inputmode="numeric" min="0" max="1000000000" required></div><div class="field"><label for="card-color">Color</label><input id="card-color" v-model="cardDraft.color" type="color"></div><div class="field"><label for="card-suspension">Suspensión sugerida</label><input id="card-suspension" v-model.number="cardDraft.suspensionMatches" type="number" inputmode="numeric" min="0" max="50"></div></div><button class="btn primary" :disabled="busy">Guardar tarjeta e importe</button></form></details>
    <div v-if="!book&&!error" class="empty-list">Cargando…</div>
    <div v-else-if="book&&!visible.length" class="empty-list">Sin movimientos.</div>
    <div v-for="item in visible" :key="item.id" class="payment-row" :class="{voided:!!item.voided_at}">
      <div class="payment-row-main"><div><strong>{{ names[item.category]||item.category }}</strong><small>{{ item.description }}<template v-if="item.team_name&&!item.description.includes(item.team_name)"> · {{ item.team_name }}</template></small><small>{{ item.occurred_on }}<template v-if="item.voided_at"> · Anulado</template><template v-if="item.source_changed&&!item.voided_at"> · Acta corregida: revisar cargo</template></small></div><strong :class="item.kind">{{ item.kind==='expense'?'−':item.kind==='income'?'+':'' }}{{ format(item.amount_guaranies) }}</strong></div>
      <div v-if="item.kind==='charge'&&!item.voided_at" class="payment-row-actions"><span>{{ item.outstanding_guaranies ? `Federación · por cobrar ${format(item.outstanding_guaranies)}` : 'Federación · cobrada' }}</span><button v-if="item.outstanding_guaranies" type="button" class="btn" @click="collect(item)">Cobrar</button></div>
      <button v-if="!item.voided_at&&voidId!==item.id" type="button" class="text-action" @click="voidId=item.id;voidReason=''">Anular</button>
      <form v-if="voidId===item.id" class="payment-void" @submit.prevent="voidMovement(item)"><label :for="`void-${item.id}`">Motivo de anulación</label><input :id="`void-${item.id}`" v-model="voidReason" minlength="3" maxlength="300" required><div class="row"><button type="button" class="btn" @click="voidId=''">Volver</button><button class="btn" :disabled="busy">Anular movimiento</button></div></form>
    </div>
  </section>
</template>
