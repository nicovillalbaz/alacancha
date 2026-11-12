export const flyerSizes = {
  square: { width: 1080, height: 1080, perPage: 6 },
  portrait: { width: 1080, height: 1350, perPage: 8 },
  story: { width: 1080, height: 1920, perPage: 12 },
  print: { width: 1240, height: 1754, perPage: 11 },
} as const;
export type FlyerSize = keyof typeof flyerSizes;
export const flyerKinds = ['match','matchday','result','standings','scorers','scorer','defense','bracket','semifinal','final','champion','notice'] as const;
export type FlyerKind = typeof flyerKinds[number];
export const flyerTemplates = [
  { key: 'forest', version: 6, label: 'Campo oscuro' },
  { key: 'paper', version: 6, label: 'Pizarra clara' },
] as const;
export type FlyerTemplateKey = typeof flyerTemplates[number]['key'];
export type FlyerLine = { left:string; right?:string; sub?:string; side?:'home'|'away'; homeAssetId?:string|null; awayAssetId?:string|null; homeName?:string; awayName?:string };
export type FlyerSnapshot = {
  kind:FlyerKind; sourceId:string; title:string; kicker:string; competition:string; subline:string; footer:string;
  home?:{name:string;assetId:string|null}; away?:{name:string;assetId:string|null};
  score?:{home:number;away:number}; shootout?:{home:number;away:number}; lines:FlyerLine[]; note:string|null;
  orgAssetId:string|null; entryIds:string[]; scorerRegistrationIds:string[];
  matchdayId:string|null; sourceRevision:number|null; approvalId:string|null;
  relatedMatchdayId?:string; relatedSourceRevision?:number; relatedApprovalId?:string;
  pageNo:number; totalPages:number;
  pageLabels?:string[];
  brand?:{primaryColor:string;accentColor:string;cupAssetId:string|null;organizerAssetId:string|null;federationAssetId:string|null};
};
function esc(value:string){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function words(value:string,maxChars:number,maxLines:number){
  const lines:string[]=[];let line='';
  for(const word of String(value).split(/\s+/)){
    if(!word)continue;
    if(line&&`${line} ${word}`.length>maxChars){lines.push(line);line='';}
    if(word.length>maxChars){let rest=word;while(rest.length>maxChars){lines.push(rest.slice(0,maxChars));rest=rest.slice(maxChars);}line=rest;}
    else line=line?`${line} ${word}`:word;
  }
  if(line)lines.push(line);
  if(lines.length>maxLines){const visible=lines.slice(0,maxLines);visible[maxLines-1]=`${visible[maxLines-1].slice(0,maxChars-1)}…`;return visible;}
  return lines.length?lines:[''];
}
function text(value:string,x:number,y:number,size:number,color:string,weight=500,anchor:'start'|'middle'|'end'='start',display=false){
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${display?'Impact, Bahnschrift Condensed, Arial Narrow, sans-serif':'Bahnschrift, Segoe UI, Arial, sans-serif'}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
}
function multi(value:string,x:number,y:number,size:number,color:string,maxChars:number,maxLines:number,anchor:'start'|'middle'|'end'='start',step=size*1.17,weight=600,display=false){
  return words(value,maxChars,maxLines).map((row,index)=>text(row,x,y+index*step,size,color,weight,anchor,display)).join('');
}
function luminance(hex:string){const rgb=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function imageOrMark(assetId:string|null|undefined,name:string,x:number,y:number,size:number,assets:Record<string,string>,dark:boolean,contentSize=size*.82,circleColor?:string){
  const source=assetId&&assets[assetId];
  const bg=circleColor||(dark?'#FFFFFF':'#E2EEE8'),ink=dark?'#165D46':'#184534';
  const circle=`<circle cx="${x+size/2}" cy="${y+size/2}" r="${size/2}" fill="${bg}"/>`;
  const inset=(size-contentSize)/2;
  if(source)return `${circle}<image x="${x+inset}" y="${y+inset}" width="${contentSize}" height="${contentSize}" href="${esc(source)}" preserveAspectRatio="xMidYMid meet"/>`;
  const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  return circle+text(initials,x+size/2,y+size*.62,Math.min(68,contentSize*.44),ink,800,'middle');
}
export function renderFlyerSvg(snapshot:FlyerSnapshot,sizeCode:FlyerSize,templateKey:FlyerTemplateKey,assets:Record<string,string>={}){
  const {width:w,height:h}=flyerSizes[sizeCode],primary=snapshot.brand?.primaryColor||'#102B2B',rawAccent=snapshot.brand?.accentColor||'#A9E1B9',dark=templateKey==='forest';
  const bg=dark?primary:'#F5F7F3',ink=contrast(bg,'#FFFFFF')>contrast(bg,'#102B2B')?'#FFFFFF':'#102B2B',muted=dark?ink:'#526760',accent=contrast(bg,rawAccent)>=4.5?rawAccent:ink,panel=dark?(ink==='#FFFFFF'?'#1A3B38':'#E5EEE7'):'#E5EEE7',line=dark?ink:'#CBDAD0';
  const b:string[]=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${bg}"/>`,
    `<path d="M0 0 H${w} V${Math.round(h*.16)} L0 ${Math.round(h*.32)}Z" fill="${dark?rawAccent:primary}" opacity="${dark?.11:.08}"/>`,
    `<path d="M0 ${Math.round(h*.82)} L${w} ${Math.round(h*.64)} V${h} H0Z" fill="${rawAccent}" opacity="${dark?.07:.12}"/>`,
    `<circle cx="${w*.82}" cy="${h*.52}" r="${w*.44}" fill="none" stroke="${ink}" stroke-width="3" opacity=".055"/>`,
    `<circle cx="${w*.82}" cy="${h*.52}" r="${w*.13}" fill="none" stroke="${ink}" stroke-width="3" opacity=".055"/>`,
    `<path d="M${w*.82} ${h*.08}V${h*.96}M${w*.38} ${h*.52}H${w}" stroke="${ink}" stroke-width="3" opacity=".045"/>`,
    `<rect x="0" y="0" width="${w}" height="12" fill="${rawAccent}"/>`];
  const top=76;
  const logos=[snapshot.brand?.cupAssetId,snapshot.brand?.organizerAssetId,snapshot.brand?.federationAssetId].filter((id):id is string=>Boolean(id));
  const logoSizes=logos.map((_,index)=>index===0?94:82);
  const logoStart=w-65-logoSizes.reduce((total,value)=>total+value,0)-Math.max(0,logos.length-1)*12;
  if(logos.length){let x=logoStart;logos.forEach((id,index)=>{const size=logoSizes[index];b.push(imageOrMark(id,'',x,top-40,size,assets,dark,(index===0?72:60)*.82,'#FFFFFF'));x+=size+12;});}
  else if(snapshot.orgAssetId)b.push(imageOrMark(snapshot.orgAssetId,snapshot.competition,w-110,top-33,70,assets,dark));
  b.push(multi(snapshot.competition,65,top+5,25,muted,Math.max(17,Math.floor(((logos.length?logoStart:w-110)-85)/14)),2,'start',29,750));
  b.push(`<path d="M65 130 H${Math.min(w-65,305)}" stroke="${rawAccent}" stroke-width="6"/>`);
  b.push(text(snapshot.kicker.toUpperCase(),65,166,23,accent,800));
  b.push(multi(snapshot.title,65,227,Math.min(62,h*.052),ink,29,2,'start',68,900,true));
  b.push(`<text x="65" y="${h-31}" font-family="Bahnschrift, Segoe UI, Arial, sans-serif" font-size="18" fill="${muted}"><tspan font-weight="600">Generado por </tspan><tspan font-size="23" font-weight="800" letter-spacing=".3" fill="${ink}">alacancha.top</tspan></text>`);
  if(snapshot.pageNo>1||snapshot.totalPages>1)b.push(text(`${snapshot.pageNo}/${snapshot.totalPages}`,w-65,h-31,20,muted,700,'end'));
  const hero=['match','result','champion'].includes(snapshot.kind);
  if(hero){
    if(snapshot.kind==='champion'&&snapshot.home&&!snapshot.away){
      const logoSize=Math.min(285,h*.27),logoY=Math.max(315,h*.34);
      b.push(imageOrMark(snapshot.home.assetId,snapshot.home.name,(w-logoSize)/2,logoY,logoSize,assets,dark));
      b.push(multi(snapshot.home.name,w/2,logoY+logoSize+80,49,ink,28,2,'middle',57,900));
      b.push(multi(snapshot.subline,w/2,logoY+logoSize+160,29,accent,46,2,'middle',36,750));
      b.push('</svg>');return b.join('');
    }
    const logoSize=Math.min(250,h*.19),logoY=Math.max(300,h*.31);
    if(snapshot.home)b.push(imageOrMark(snapshot.home.assetId,snapshot.home.name,145,logoY,logoSize,assets,dark));
    if(snapshot.away)b.push(imageOrMark(snapshot.away.assetId,snapshot.away.name,w-145-logoSize,logoY,logoSize,assets,dark));
    const nameY=logoY+logoSize+60;
    if(snapshot.home)b.push(multi(snapshot.home.name,260,nameY,37,ink,20,3,'middle',43,800));
    if(snapshot.away)b.push(multi(snapshot.away.name,w-260,nameY,37,ink,20,3,'middle',43,800));
    const scoreY=logoY+logoSize*.54;
    b.push(snapshot.score?text(`${snapshot.score.home} : ${snapshot.score.away}`,w/2,scoreY,82,accent,900,'middle',true):text(snapshot.kind==='champion'?'★':'VS',w/2,scoreY,74,accent,900,'middle',true));
    if(snapshot.shootout)b.push(text(`Penales ${snapshot.shootout.home} : ${snapshot.shootout.away}`,w/2,scoreY+55,36,accent,800,'middle'));
    if(snapshot.kind==='result'){
      const detailY=Math.max(nameY+82,h*.65);
      b.push(text(snapshot.subline,w/2,detailY,23,muted,600,'middle'));
      for(const side of ['home','away'] as const){
        const rows=snapshot.lines.filter(row=>row.side===side),x=side==='home'?95:w/2+26;
        rows.forEach((row,index)=>{
          const y=detailY+62+index*47;
          b.push(multi(row.left,x,y,25,ink,21,1,'start',28,700));
          if(row.right)b.push(text(row.right,side==='home'?w/2-28:w-85,y,20,accent,800,'end'));
        });
      }
    }else{
      const detailY=Math.max(nameY+125,h*.69);
      const lines=snapshot.lines.slice(0,4);
      b.push(`<rect x="65" y="${detailY-48}" width="${w-130}" height="${Math.max(112,Math.min(100+lines.length*43,h-detailY-175))}" rx="22" fill="${panel}"/>`);
      b.push(multi(snapshot.subline,w/2,detailY,30,ink,54,2,'middle',38,700));
      lines.forEach((row,index)=>b.push(multi([row.left,row.right].filter(Boolean).join(' · '),w/2,detailY+55+index*43,25,muted,65,1,'middle',30,500)));
    }
  }else if(snapshot.kind==='scorer'){
    b.push(multi(snapshot.subline,w/2,h*.4,43,muted,30,2,'middle',50,700));
    b.push(multi(snapshot.lines[0]?.right||'',w/2,h*.62,116,accent,12,1,'middle',124,900));
    b.push(multi(snapshot.lines[0]?.sub||'',w/2,h*.72,33,ink,35,2,'middle',40,650));
  }else if(snapshot.kind==='notice'){
    b.push(`<rect x="65" y="305" width="${w-130}" height="${h-510}" rx="30" fill="${panel}"/>`);
    b.push(multi(snapshot.subline,110,390,34,ink,44,9,'start',49,600));
  }else{
    b.push(multi(snapshot.subline,65,275,28,muted,65,2,'start',36,500));
    const rows=snapshot.lines,bottom=h-130,available=bottom-345,pair=['matchday','bracket','semifinal','final'].includes(snapshot.kind),slot=pair?Math.min(220,available/Math.max(rows.length,1)):available/Math.max(rows.length,1),topRows=pair?Math.max(340,345+Math.max(0,(available-slot*rows.length)/3)):345;
    rows.forEach((row,index)=>{
      const y=topRows+slot*index;
      b.push(`<line x1="65" y1="${y+slot-6}" x2="${w-65}" y2="${y+slot-6}" stroke="${line}" stroke-width="2"${dark?' opacity=".2"':''}/>`);
      if(pair&&row.homeName&&row.awayName){
        const spacious=slot>=155,logo=spacious?78:Math.max(34,Math.min(56,slot-25));
        if(spacious){
          b.push(imageOrMark(row.homeAssetId||null,row.homeName,85,y+53,logo,assets,dark));
          b.push(multi(row.homeName,85+logo+15,y+100,33,ink,18,2,'start',36,780));
          b.push(text(row.right||'VS',w/2,y+104,28,accent,900,'middle',true));
          b.push(imageOrMark(row.awayAssetId||null,row.awayName,w*.55,y+53,logo,assets,dark));
          b.push(multi(row.awayName,w*.55+logo+15,y+100,33,ink,18,2,'start',36,780));
          if(row.sub)b.push(multi(row.sub,85+logo+15,y+170,21,muted,68,1,'start',22,600));
        }else{
          b.push(imageOrMark(row.homeAssetId||null,row.homeName,85,y+11,logo,assets,dark));
          b.push(multi(row.homeName,85+logo+13,y+Math.min(46,slot*.43),Math.max(21,Math.min(28,slot*.25)),ink,18,1,'start',25,700));
          b.push(text(row.right||'VS',w*.47,y+Math.min(46,slot*.43),22,accent,800,'middle'));
          b.push(imageOrMark(row.awayAssetId||null,row.awayName,w*.52,y+11,logo,assets,dark));
          b.push(multi(row.awayName,w*.52+logo+13,y+Math.min(46,slot*.43),Math.max(21,Math.min(28,slot*.25)),ink,18,1,'start',25,700));
          if(row.sub&&slot>=85)b.push(multi(row.sub,85+logo+13,y+Math.min(79,slot*.72),18,muted,72,1,'start',20,500));
        }
        return;
      }
      if(row.homeName)b.push(imageOrMark(row.homeAssetId,row.homeName,87,y+13,Math.min(50,slot-24),assets,dark));
      const x=row.homeName?153:92;
      const fs=Math.max(20,Math.min(31,slot*.28));
      b.push(multi(row.left,x,y+Math.min(47,slot*.47),fs,ink,41,1,'start',fs,700));
      if(row.right)b.push(multi(row.right,w-95,y+Math.min(47,slot*.47),fs,accent,22,1,'end',fs,800));
      if(row.sub&&slot>=80)b.push(multi(row.sub,x,y+Math.min(80,slot*.75),Math.max(18,fs*.75),muted,80,1,'start',20,500));
    });
  }
  if(snapshot.note&&snapshot.kind!=='notice')b.push(multi(snapshot.note,65,h-148,22,muted,80,1,'start',24,500));
  b.push('</svg>');return b.join('');
}
