<script setup lang="ts">
import { ref, watch } from 'vue';
import Icon from './Icon.vue';

type Settings={revision:number;template:'forest'|'paper';size:'square'|'portrait'|'story'|'print';format:'png'|'jpg'|'pdf';primary_color:string;accent_color:string;cup_logo_id:string|null;organizer_logo_id:string|null;federation_logo_id:string|null};
const props=defineProps<{organizationId:string;tournamentId:string;csrfToken:string}>();
const settings=ref<Settings|null>(null),busy=ref(false),error=ref(''),message=ref('');
const logoSlots=[{key:'cup',label:'Copa',field:'cup_logo_id'},{key:'organizer',label:'Organizador',field:'organizer_logo_id'},{key:'federation',label:'Federación',field:'federation_logo_id'}] as const;
const root=()=>`/api/v1/organizations/${props.organizationId}/tournaments/${props.tournamentId}/flyer-settings`;
async function load(){error.value='';try{const response=await fetch(root(),{credentials:'same-origin'});const data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo abrir el diseño.');settings.value=data;}catch(cause){error.value=cause instanceof Error?cause.message:'No se pudo abrir el diseño.';}}
watch(()=>[props.organizationId,props.tournamentId],()=>{settings.value=null;void load();},{immediate:true});
async function save(){if(!settings.value||busy.value)return;busy.value=true;error.value='';message.value='';try{const s=settings.value,response=await fetch(root(),{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':props.csrfToken},body:JSON.stringify({revision:s.revision,template:s.template,size:s.size,format:s.format,primaryColor:s.primary_color,accentColor:s.accent_color})}),data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo guardar.');settings.value=data;message.value='Diseño guardado.';}catch(cause){error.value=cause instanceof Error?cause.message:'No se pudo guardar.';}finally{busy.value=false;}}
function openFile(slot:string){document.getElementById(`flyer-logo-${slot}`)?.click();}
async function upload(slot:string,event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;busy.value=true;error.value='';message.value='';try{const form=new FormData();form.append('file',file);const response=await fetch(`${root()}/logos/${slot}`,{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':props.csrfToken},body:form}),data=await response.json();if(!response.ok)throw new Error(data.message||'No se pudo cargar el logo.');await load();message.value='Logo cargado.';}catch(cause){error.value=cause instanceof Error?cause.message:'No se pudo cargar el logo.';}finally{busy.value=false;input.value='';}}
function logoUrl(slot:string){return `${root()}/logos/${slot}?v=${settings.value?.revision||0}`;}
function goBack(){if(window.history.length>1)window.history.back();else window.location.hash=`#/torneo/${props.tournamentId}/fixture`;}
</script>

<template>
  <section class="flyer-settings">
    <div class="flyer-settings-heading"><h1>Diseño de flyers</h1><button type="button" aria-label="Volver" @click="goBack"><Icon name="close" /></button></div>
    <p v-if="error" role="alert" class="flyer-settings-error">{{ error }}</p><p v-if="message" role="status" class="flyer-settings-ok">{{ message }}</p>
    <template v-if="settings">
      <h2>Logos</h2>
      <div v-for="item in logoSlots" :key="item.key" class="flyer-logo-row"><img v-if="settings[item.field]" :src="logoUrl(item.key)" :alt="`Logo de ${item.label}`"><span v-else class="flyer-logo-empty"><Icon name="image" /></span><strong>{{ item.label }}</strong><input :id="`flyer-logo-${item.key}`" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" @change="upload(item.key,$event)"><button type="button" :disabled="busy" @click="openFile(item.key)">{{ settings[item.field]?'Cambiar':'Añadir' }}</button></div>
      <h2>Estilo</h2>
      <div class="flyer-setting-options" role="group" aria-label="Estilo"><button type="button" :aria-pressed="settings.template==='forest'" @click="settings.template='forest'">Campo oscuro</button><button type="button" :aria-pressed="settings.template==='paper'" @click="settings.template='paper'">Pizarra clara</button></div>
      <div class="flyer-colors"><label>Base <input v-model="settings.primary_color" type="color"></label><label>Acento <input v-model="settings.accent_color" type="color"></label></div>
      <h2>Archivo</h2>
      <div class="flyer-setting-options" role="group" aria-label="Tamaño"><button v-for="option in [['square','Cuadrado'],['portrait','Vertical'],['story','Historia'],['print','Impresión']]" :key="option[0]" type="button" :aria-pressed="settings.size===option[0]" @click="settings.size=option[0] as Settings['size']">{{ option[1] }}</button></div>
      <div class="flyer-setting-options" role="group" aria-label="Formato"><button v-for="option in ['png','jpg','pdf']" :key="option" type="button" :aria-pressed="settings.format===option" @click="settings.format=option as Settings['format']">{{ option.toUpperCase() }}</button></div>
      <button type="button" class="flyer-settings-save" :disabled="busy" @click="save">Guardar diseño</button>
    </template>
  </section>
</template>

<style scoped>
.flyer-settings{max-width:640px;margin:0 auto;padding:10px 16px 55px;background:#fff;color:#11262b}.flyer-settings-heading{display:flex;align-items:center;justify-content:space-between}.flyer-settings-heading h1{font-size:1.2rem;margin:7px 0 13px}.flyer-settings-heading button{display:grid;place-items:center;width:44px;height:44px;border:0;background:#fff;color:#345349}.flyer-settings h2{font-size:.84rem;margin:20px 0 5px}.flyer-logo-row{display:flex;align-items:center;gap:10px;min-height:67px;border-top:1px solid #dce6e1}.flyer-logo-row img,.flyer-logo-empty{width:44px;height:44px;object-fit:contain;display:grid;place-items:center;background:#eef3f0;border-radius:50%}.flyer-logo-row strong{flex:1;min-width:0;font-size:.82rem}.flyer-logo-row button{min-height:42px;border:1px solid #ccd9d1;border-radius:5px;background:#fff;padding:0 13px;color:#075b40;font:inherit;font-size:.76rem;font-weight:700}.flyer-setting-options{display:flex;flex-wrap:wrap;gap:6px;padding:8px 0}.flyer-setting-options button{min-height:42px;border:1px solid #dce6e1;border-radius:5px;background:#fff;padding:0 11px;color:#3d5d51;font:inherit;font-size:.75rem}.flyer-setting-options button[aria-pressed=true]{border-color:#08754d;background:#e7f3ed;color:#075b40;font-weight:800}.flyer-colors{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:8px 0}.flyer-colors label{display:flex;align-items:center;gap:10px;font-size:.77rem;font-weight:700}.flyer-colors input{width:44px;height:44px;padding:2px;border:1px solid #cbd9d1;border-radius:5px;background:#fff}.flyer-settings-save{width:100%;min-height:46px;margin-top:17px;border:0;border-radius:5px;background:#075b40;color:#fff;font:inherit;font-weight:800}.flyer-settings-error,.flyer-settings-ok{font-size:.78rem;padding:8px}.flyer-settings-error{color:#ab332a;background:#fff0ec}.flyer-settings-ok{color:#075b40;background:#e7f3ed}
</style>
