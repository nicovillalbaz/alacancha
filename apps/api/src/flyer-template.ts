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
  { key: 'forest', version: 1, label: 'Campo oscuro' },
  { key: 'paper', version: 1, label: 'Pizarra clara' },
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
function text(value:string,x:number,y:number,size:number,color:string,weight=500,anchor:'start'|'middle'|'end'='start'){
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
}
function multi(value:string,x:number,y:number,size:number,color:string,maxChars:number,maxLines:number,anchor:'start'|'middle'|'end'='start',step=size*1.17,weight=600){
  return words(value,maxChars,maxLines).map((row,index)=>text(row,x,y+index*step,size,color,weight,anchor)).join('');
}
function imageOrMark(assetId:string|null|undefined,name:string,x:number,y:number,size:number,assets:Record<string,string>,dark:boolean){
  const source=assetId&&assets[assetId];
  const bg=dark?'#F3F7F4':'#E2EEE8',ink=dark?'#165D46':'#184534';
  const circle=`<circle cx="${x+size/2}" cy="${y+size/2}" r="${size/2}" fill="${bg}"/>`;
  if(source)return `${circle}<image x="${x+size*.09}" y="${y+size*.09}" width="${size*.82}" height="${size*.82}" href="${esc(source)}" preserveAspectRatio="xMidYMid meet"/>`;
  const initials=name.trim().split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  return circle+text(initials,x+size/2,y+size*.62,Math.min(68,size*.36),ink,800,'middle');
}
export function renderFlyerSvg(snapshot:FlyerSnapshot,sizeCode:FlyerSize,templateKey:FlyerTemplateKey,assets:Record<string,string>={}){
  const {width:w,height:h}=flyerSizes[sizeCode],dark=templateKey==='forest';
  const bg=dark?'#102B2B':'#F5F7F3',ink=dark?'#F8FBF9':'#102B2B',muted=dark?'#BBD3C7':'#526760',accent=dark?'#A9E1B9':'#165D46',panel=dark?'#1A3B38':'#E5EEE7',line=dark?'#39615B':'#CBDAD0';
  const b:string[]=[`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="${bg}"/>`,
    `<rect x="0" y="0" width="${w}" height="16" fill="${accent}"/>`];
  const top=76;
  if(snapshot.orgAssetId) b.push(imageOrMark(snapshot.orgAssetId,snapshot.competition,62,top-33,70,assets,dark));
  b.push(text(snapshot.competition,snapshot.orgAssetId?150:65,top+14,25,muted,700));
  b.push(text(snapshot.kicker.toUpperCase(),65,156,25,accent,800));
  b.push(multi(snapshot.title,65,215,Math.min(55,h*.048),ink,32,2,'start',60,800));
  b.push(text('Generado por NAVZ',65,h-31,18,muted,700));
  if(snapshot.pageNo>1||snapshot.totalPages>1)b.push(text(`${snapshot.pageNo}/${snapshot.totalPages}`,w-65,h-31,20,muted,700,'end'));
  const hero=['match','result','champion'].includes(snapshot.kind);
  if(hero){
    const logoSize=Math.min(250,h*.19),logoY=Math.max(300,h*.31);
    if(snapshot.home)b.push(imageOrMark(snapshot.home.assetId,snapshot.home.name,145,logoY,logoSize,assets,dark));
    if(snapshot.away)b.push(imageOrMark(snapshot.away.assetId,snapshot.away.name,w-145-logoSize,logoY,logoSize,assets,dark));
    const nameY=logoY+logoSize+60;
    if(snapshot.home)b.push(multi(snapshot.home.name,260,nameY,37,ink,20,3,'middle',43,800));
    if(snapshot.away)b.push(multi(snapshot.away.name,w-260,nameY,37,ink,20,3,'middle',43,800));
    const scoreY=logoY+logoSize*.54;
    b.push(snapshot.score?text(`${snapshot.score.home} : ${snapshot.score.away}`,w/2,scoreY,76,accent,900,'middle'):text(snapshot.kind==='champion'?'★':'VS',w/2,scoreY,68,accent,900,'middle'));
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
      b.push(`<rect x="65" y="${detailY-48}" width="${w-130}" height="${Math.min(260,h-detailY-175)}" rx="28" fill="${panel}"/>`);
      b.push(multi(snapshot.subline,w/2,detailY,30,ink,54,2,'middle',38,700));
      const lines=snapshot.lines.slice(0,4);
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
    const rows=snapshot.lines,bottom=h-130,available=bottom-345,pair=['matchday','bracket','semifinal','final'].includes(snapshot.kind),slot=pair?Math.min(154,available/Math.max(rows.length,1)):available/Math.max(rows.length,1),topRows=pair?345+Math.max(0,(available-slot*rows.length)/2):345;
    rows.forEach((row,index)=>{
      const y=topRows+slot*index;
      b.push(`<line x1="65" y1="${y+slot-6}" x2="${w-65}" y2="${y+slot-6}" stroke="${line}" stroke-width="2"/>`);
      if(pair&&row.homeName&&row.awayName){
        const logo=Math.max(30,Math.min(56,slot-25));
        b.push(imageOrMark(row.homeAssetId||null,row.homeName,85,y+11,logo,assets,dark));
        b.push(multi(row.homeName,85+logo+13,y+Math.min(46,slot*.43),Math.max(18,Math.min(27,slot*.25)),ink,18,1,'start',25,700));
        b.push(text('VS',w*.47,y+Math.min(46,slot*.43),20,accent,800,'middle'));
        b.push(imageOrMark(row.awayAssetId||null,row.awayName,w*.52,y+11,logo,assets,dark));
        b.push(multi(row.awayName,w*.52+logo+13,y+Math.min(46,slot*.43),Math.max(18,Math.min(27,slot*.25)),ink,18,1,'start',25,700));
        if(row.right)b.push(text(row.right,w-90,y+Math.min(46,slot*.43),22,accent,800,'end'));
        if(row.sub&&slot>=85)b.push(multi(row.sub,85+logo+13,y+Math.min(79,slot*.72),18,muted,72,1,'start',20,500));
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
