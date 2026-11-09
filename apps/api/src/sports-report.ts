export interface SportsReport { title:string; scope:string; version:string; sourceDate:string; generatedAt:string; columns:string[]; rows:string[][] }

function csvCell(value:string) {
  const safe=/^[\s]*[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"','""')}"`;
}
export function sportsReportCsv(report:SportsReport) {
  const lines=[
    ['Reporte privado',report.title],['Ámbito',report.scope],['Versión',report.version],
    ['Fecha de fuente',report.sourceDate],['Generado',report.generatedAt],
    ['Marca','PRIVADO · NO PUBLICAR'],[],report.columns,...report.rows,
  ];
  return '\uFEFF'+lines.map(row=>row.map(value=>csvCell(String(value ?? ''))).join(',')).join('\r\n')+'\r\n';
}
function latin(value:string){return Array.from(value.normalize('NFC'),char=>char.charCodeAt(0)<=255?char:'?').join('');}
function literal(value:string){return latin(value).replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)').replaceAll(/[\r\n]/g,' ');}
function line(value:string,y:number,bold=false,size=10){return `BT /${bold?'F2':'F1'} ${size} Tf 42 ${y} Td (${literal(value)}) Tj ET\n`;}
function wrap(value:string,width=95){
  const output:string[]=[];let current='';
  for(const word of value.split(/\s+/)){if(!word)continue;if(current&&`${current} ${word}`.length>width){output.push(current);current='';}
    if(word.length>width){for(let at=0;at<word.length;at+=width)output.push(word.slice(at,at+width));}
    else current=current?`${current} ${word}`:word;
  }
  if(current)output.push(current);return output.length?output:[''];
}
export function sportsReportPdf(report:SportsReport) {
  const body=report.rows.length?report.rows.map((row,index)=>`${index+1}. ${row.map((value,column)=>`${report.columns[column]||'Dato'}: ${value}`).join(' · ')}`):['Sin registros en este corte.'];
  const pages:string[][]=[[]];let used=0;
  for(const value of body){
    const block=wrap(value,95);
    if(used+block.length>46&&used>0){pages.push([]);used=0;}
    for(const part of block){if(used>=46){pages.push([]);used=0;}pages.at(-1)!.push(part);used++;}
  }
  const objects:Array<string|Buffer>=[];const count=pages.length;
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]=`<< /Type /Pages /Kids [${Array.from({length:count},(_,index)=>`${5+index*2} 0 R`).join(' ')}] /Count ${count} >>`;
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  for(let page=0;page<count;page++){
    const id=5+page*2,content=id+1;
    objects[id]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`;
    let stream=line(report.title.toUpperCase(),796,true,14);
    const head=[`Ámbito: ${report.scope}`,`Versión: ${report.version} · Fuente: ${report.sourceDate}`,`Generado: ${report.generatedAt} · Página ${page+1}/${count}`].flatMap(value=>wrap(value,88));
    head.forEach((value,index)=>{stream+=line(value,770-index*13);});
    let y=700;
    for(const value of pages[page]){stream+=line(value,y,false,9);y-=13;}
    stream+=line('PRIVADO · NO PUBLICAR · Sin números de identidad',46,false,8);
    const bytes=Buffer.from(latin(stream),'latin1');
    objects[content]=Buffer.concat([Buffer.from(`<< /Length ${bytes.length} >>\nstream\n`,'latin1'),bytes,Buffer.from('endstream','latin1')]);
  }
  const chunks:Buffer[]=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')],offsets=[0];let length=chunks[0].length;
  const add=(value:string|Buffer)=>{const chunk=typeof value==='string'?Buffer.from(value,'latin1'):value;chunks.push(chunk);length+=chunk.length;};
  for(let id=1;id<objects.length;id++){offsets[id]=length;add(`${id} 0 obj\n`);add(objects[id]);add('\nendobj\n');}
  const xref=length;add(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for(let id=1;id<objects.length;id++)add(`${String(offsets[id]).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
